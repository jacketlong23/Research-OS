import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loginCloud, logoutCloudAndClearLocal, syncNow } from './service'
import {
  fetchRemoteSnapshot,
  signInWithPassword,
  signOutCloudSession,
  upsertRemoteSnapshot,
  type CloudSession,
  type RemoteSnapshotRow,
} from './api'
import type { ResearchSnapshot } from './snapshot'
import { useCloudStore } from './store'
import { DEFAULT_SETTINGS, type Task } from '../types'
import { useProjectsStore, useSettingsStore, useTasksStore } from '../store'

// 只 mock 网络层，同步逻辑仍走真实实现
vi.mock('./api', () => ({
  fetchRemoteSnapshot: vi.fn(),
  upsertRemoteSnapshot: vi.fn(),
  refreshCloudSession: vi.fn(async (s: CloudSession) => s),
  signInWithPassword: vi.fn(),
  signOutCloudSession: vi.fn(async () => undefined),
  signUpWithPassword: vi.fn(),
}))

const mockFetch = vi.mocked(fetchRemoteSnapshot)
const mockUpsert = vi.mocked(upsertRemoteSnapshot)
const mockSignIn = vi.mocked(signInWithPassword)
const mockSignOut = vi.mocked(signOutCloudSession)

function makeSession(id = 'u1'): CloudSession {
  return { accessToken: 'at', refreshToken: 'rt', expiresAt: Date.now() + 3_600_000, user: { id, email: `${id}@x.com` } }
}

function makeRow(updatedAt: string, payload: Partial<ResearchSnapshot> = {}): RemoteSnapshotRow {
  return {
    updated_at: updatedAt,
    payload: {
      version: 1,
      exported_at: updatedAt,
      projects: [],
      tasks: [],
      schedule: {},
      daily_logs: [],
      settings: {
        work_periods: [],
        fill_ratio: 0.8,
        break_minutes: 15,
        deep_min_minutes: 90,
        deep_max_minutes: 150,
        ai_base_url: 'https://cloud',
        ai_model: 'cloud-model',
      },
      ...payload,
    },
  }
}

function task(id: string, title: string): Task {
  return {
    id,
    title,
    project_id: null,
    duration_minutes: 30,
    deadline: null,
    importance: 3,
    status: 'todo',
    splittable: true,
    minimum_block_minutes: 15,
    blocking: false,
    type: 'flexible',
    created_at: '2026-08-01T00:00:00Z',
  }
}

function resetCloud() {
  useCloudStore.setState({
    session: null,
    activeUserId: null,
    linked: false,
    dirty: false,
    lastSyncedAt: null,
    status: 'idle',
    message: '',
    suppressTracking: false,
  })
}

beforeEach(() => {
  resetCloud()
  useProjectsStore.setState({ projects: [] })
  useTasksStore.setState({ tasks: [] })
  useSettingsStore.setState({ settings: DEFAULT_SETTINGS })
  vi.clearAllMocks()
})

describe('首次登录不自动同步', () => {
  it('linked=false 时 syncNow 返回 not-linked，不发起任何云端请求', async () => {
    const result = await syncNow()
    expect(result).toBe('not-linked')
    expect(mockFetch).not.toHaveBeenCalled()
    expect(mockUpsert).not.toHaveBeenCalled()
  })
})

describe('同步策略分支', () => {
  it('本机 dirty 且云端 newer → 进入 conflict，不自动覆盖', async () => {
    useCloudStore.setState({
      session: makeSession(),
      linked: true,
      dirty: true,
      lastSyncedAt: '2026-08-01T00:00:00Z',
    })
    const local = task('t-local', '本机任务')
    useTasksStore.setState({ tasks: [local] })
    mockFetch.mockResolvedValue(makeRow('2026-08-10T00:00:00Z', { tasks: [task('t-cloud', '云端任务')] }))

    const result = await syncNow()

    expect(result).toBe('conflict')
    expect(mockUpsert).not.toHaveBeenCalled()
    expect(useTasksStore.getState().tasks).toEqual([local]) // 本机数据未被云端覆盖
    expect(useCloudStore.getState().status).toBe('conflict')
  })

  it('只有本机 dirty → 上传', async () => {
    useCloudStore.setState({
      session: makeSession(),
      linked: true,
      dirty: true,
      lastSyncedAt: '2026-08-10T00:00:00Z',
    })
    mockFetch.mockResolvedValue(makeRow('2026-08-10T00:00:00Z')) // 云端时间 = 上次同步，不算 newer
    mockUpsert.mockResolvedValue(makeRow('2026-08-11T00:00:00Z'))

    const result = await syncNow()

    expect(result).toBe('uploaded')
    expect(mockUpsert).toHaveBeenCalledTimes(1)
  })

  it('只有云端 newer → 下载并覆盖本机', async () => {
    useCloudStore.setState({
      session: makeSession(),
      linked: true,
      dirty: false,
      lastSyncedAt: '2026-08-01T00:00:00Z',
    })
    const remote = task('t-cloud', '云端任务')
    mockFetch.mockResolvedValue(makeRow('2026-08-10T00:00:00Z', { tasks: [remote] }))

    const result = await syncNow()

    expect(result).toBe('downloaded')
    expect(useTasksStore.getState().tasks).toEqual([remote])
    expect(mockUpsert).not.toHaveBeenCalled()
  })
})

describe('账号切换隔离', () => {
  it('切换到不同 user_id 时清空上一账号科研数据', async () => {
    useCloudStore.setState({ activeUserId: 'A', session: null, linked: false })
    useProjectsStore.setState({
      projects: [{ id: 'pa', name: 'A 的项目', progress: 10, current_focus: '', next_step: '', priority: 1, color: 'cyan' }],
    })
    mockSignIn.mockResolvedValue(makeSession('B'))

    await loginCloud('b@x.com', 'pw')

    expect(useProjectsStore.getState().projects).toEqual([]) // A 的数据被清空
    expect(useCloudStore.getState().activeUserId).toBe('B')
    expect(useCloudStore.getState().session?.user.id).toBe('B')
    expect(useCloudStore.getState().linked).toBe(false) // 仍要求选择来源
  })
})

describe('退出安全', () => {
  it('存在冲突时阻止退出，不清除会话与数据', async () => {
    useCloudStore.setState({
      session: makeSession(),
      linked: true,
      dirty: true,
      lastSyncedAt: '2026-08-01T00:00:00Z',
    })
    mockFetch.mockResolvedValue(makeRow('2026-08-10T00:00:00Z'))

    await expect(logoutCloudAndClearLocal()).rejects.toThrow('存在同步冲突')
    expect(mockSignOut).not.toHaveBeenCalled()
    expect(useCloudStore.getState().session).not.toBeNull()
  })

  it('正常退出会清除本机科研数据和 AI Key', async () => {
    useCloudStore.setState({ session: makeSession(), linked: true, dirty: false })
    useProjectsStore.setState({
      projects: [{ id: 'pa', name: '项目', progress: 10, current_focus: '', next_step: '', priority: 1, color: 'cyan' }],
    })
    useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, ai_api_key: 'local-key' } })

    await logoutCloudAndClearLocal()

    expect(mockSignOut).toHaveBeenCalledTimes(1)
    expect(useProjectsStore.getState().projects).toEqual([]) // 科研数据被清除
    expect(useSettingsStore.getState().settings.ai_api_key).toBe('') // 防止下一账号继承设备凭据
    expect(useCloudStore.getState().session).toBeNull()
    expect(useCloudStore.getState().linked).toBe(false)
  })
})

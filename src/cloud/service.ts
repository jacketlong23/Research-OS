import {
  fetchRemoteSnapshot,
  refreshCloudSession,
  signInWithPassword,
  signOutCloudSession,
  signUpWithPassword,
  upsertRemoteSnapshot,
  type CloudSession,
  type SignUpResult,
} from './api'
import { applyResearchSnapshot, clearSyncedResearchData, collectResearchSnapshot } from './snapshot'
import { useCloudStore } from './store'

export type SyncResult = 'uploaded' | 'downloaded' | 'noop' | 'conflict' | 'not-linked'

let inFlight: Promise<SyncResult> | null = null

/** 云端写入本机时抑制 dirty 标记，避免「下载完立刻又标记待上传」 */
function withTrackingSuppressed(fn: () => void) {
  const cloud = useCloudStore.getState()
  cloud.setSuppressTracking(true)
  try {
    fn()
  } finally {
    useCloudStore.getState().setSuppressTracking(false)
  }
}

/**
 * 登录/注册成功后接管会话。
 * - 首次登录本账号：只记录 activeUserId，不清空本机，等用户选来源。
 * - 切换到不同账号：先清空上一个账号的科研数据，避免串号。
 */
function acceptSession(session: CloudSession) {
  const state = useCloudStore.getState()
  const switchingUser = Boolean(state.activeUserId && state.activeUserId !== session.user.id)
  if (switchingUser) {
    withTrackingSuppressed(clearSyncedResearchData)
    state.resetForDifferentUser(session.user.id)
  } else if (!state.activeUserId) {
    state.setActiveUser(session.user.id)
  }
  useCloudStore.getState().setSession(session)
}

export async function loginCloud(email: string, password: string): Promise<void> {
  const session = await signInWithPassword(email, password)
  acceptSession(session)
}

export async function registerCloud(email: string, password: string): Promise<SignUpResult> {
  const result = await signUpWithPassword(email, password)
  if (result.session) acceptSession(result.session)
  return result
}

export async function ensureFreshSession(): Promise<CloudSession> {
  const state = useCloudStore.getState()
  if (!state.session) throw new Error('当前未登录')
  if (state.session.expiresAt - Date.now() > 90_000) return state.session
  const refreshed = await refreshCloudSession(state.session)
  useCloudStore.getState().setSession(refreshed)
  return refreshed
}

export async function uploadLocalAsSource(): Promise<void> {
  const cloud = useCloudStore.getState()
  cloud.setStatus('syncing', '正在上传本机数据…')
  try {
    const session = await ensureFreshSession()
    const row = await upsertRemoteSnapshot(session, collectResearchSnapshot())
    const state = useCloudStore.getState()
    state.setLinked(true)
    state.setSynced(row.updated_at)
  } catch (error) {
    useCloudStore.getState().setStatus('error', error instanceof Error ? error.message : String(error))
    throw error
  }
}

export async function downloadCloudAsSource(): Promise<void> {
  const cloud = useCloudStore.getState()
  cloud.setStatus('syncing', '正在下载云端数据…')
  try {
    const session = await ensureFreshSession()
    const row = await fetchRemoteSnapshot(session)
    if (!row) throw new Error('该账号云端还没有 Research OS 数据；请先选择“本机数据上传到云端”')
    withTrackingSuppressed(() => applyResearchSnapshot(row.payload))
    const state = useCloudStore.getState()
    state.setLinked(true)
    state.setSynced(row.updated_at)
  } catch (error) {
    useCloudStore.getState().setStatus('error', error instanceof Error ? error.message : String(error))
    throw error
  }
}

async function doSyncNow(): Promise<SyncResult> {
  const initial = useCloudStore.getState()
  if (!initial.linked) return 'not-linked'

  initial.setStatus('syncing', '正在同步…')
  try {
    const session = await ensureFreshSession()
    const remote = await fetchRemoteSnapshot(session)
    const current = useCloudStore.getState()

    // 云端还没有快照：直接把本机推上去
    if (!remote) {
      const saved = await upsertRemoteSnapshot(session, collectResearchSnapshot())
      useCloudStore.getState().setSynced(saved.updated_at)
      return 'uploaded'
    }

    const remoteTime = Date.parse(remote.updated_at)
    const lastTime = current.lastSyncedAt ? Date.parse(current.lastSyncedAt) : 0
    const remoteNewer = Number.isFinite(remoteTime) && remoteTime > lastTime + 500

    // 本机也改了 + 云端也更新了 → 冲突，绝不静默覆盖
    if (current.dirty && remoteNewer) {
      current.setStatus('conflict', '本机和云端都发生了修改，请到“账号与同步”选择保留哪一侧')
      return 'conflict'
    }

    if (remoteNewer) {
      withTrackingSuppressed(() => applyResearchSnapshot(remote.payload))
      useCloudStore.getState().setSynced(remote.updated_at)
      return 'downloaded'
    }

    if (current.dirty) {
      const saved = await upsertRemoteSnapshot(session, collectResearchSnapshot())
      useCloudStore.getState().setSynced(saved.updated_at)
      return 'uploaded'
    }

    current.setStatus('synced', '已同步')
    return 'noop'
  } catch (error) {
    useCloudStore.getState().setStatus('error', error instanceof Error ? error.message : String(error))
    throw error
  }
}

export function syncNow(): Promise<SyncResult> {
  if (inFlight) return inFlight
  inFlight = doSyncNow().finally(() => {
    inFlight = null
  })
  return inFlight
}

/**
 * 安全退出：若本机有未同步修改先尝试同步；冲突时阻止退出。
 * 成功退出后清除科研数据，避免下一位使用同一浏览器的人看到上一个账号的数据。
 * AI API Key 不上传，同时也不在这里清除。
 */
export async function logoutCloudAndClearLocal(): Promise<void> {
  const state = useCloudStore.getState()
  if (!state.session) return
  if (state.linked && state.dirty) {
    const result = await syncNow()
    if (result === 'conflict') throw new Error('存在同步冲突，请先选择本机或云端版本后再退出')
  }

  const session = await ensureFreshSession()
  try {
    await signOutCloudSession(session)
  } finally {
    withTrackingSuppressed(clearSyncedResearchData)
    useCloudStore.getState().clearSessionAfterLogout()
  }
}

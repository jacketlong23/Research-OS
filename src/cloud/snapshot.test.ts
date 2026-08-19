import { beforeEach, describe, expect, it } from 'vitest'
import type { ResearchSnapshot } from './snapshot'
import {
  applyResearchSnapshot,
  clearSyncedResearchData,
  collectResearchSnapshot,
  settingsForCloud,
} from './snapshot'
import { DEFAULT_SETTINGS, type Project, type Settings } from '../types'
import { useProjectsStore, useSettingsStore } from '../store'

function fullSettings(overrides: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, ...overrides }
}

function project(id = 'p1'): Project {
  return { id, name: '示例项目', progress: 0, current_focus: '', next_step: '', priority: 1, color: 'cyan' }
}

beforeEach(() => {
  useSettingsStore.setState({ settings: DEFAULT_SETTINGS })
  useProjectsStore.setState({ projects: [] })
})

describe('settingsForCloud（AI Key 安全白名单）', () => {
  it('结果永远不包含 ai_api_key', () => {
    const out = settingsForCloud(fullSettings({ ai_api_key: 'sk-secret-123' }))
    expect(out).not.toHaveProperty('ai_api_key')
    expect(JSON.stringify(out)).not.toContain('sk-secret-123')
  })

  it('白名单字段完整保留、敏感字段被剔除', () => {
    const out = settingsForCloud(
      fullSettings({
        work_periods: [],
        fill_ratio: 0.5,
        break_minutes: 10,
        deep_min_minutes: 60,
        deep_max_minutes: 120,
        ai_base_url: 'https://x',
        ai_model: 'm',
        ai_api_key: 'sk-secret',
      }),
    )
    expect(out).toEqual({
      work_periods: [],
      fill_ratio: 0.5,
      break_minutes: 10,
      deep_min_minutes: 60,
      deep_max_minutes: 120,
      ai_base_url: 'https://x',
      ai_model: 'm',
    })
  })
})

describe('collectResearchSnapshot', () => {
  it('快照 settings 不包含 ai_api_key', () => {
    useSettingsStore.setState({ settings: fullSettings({ ai_api_key: 'sk-abc' }) })
    const snap = collectResearchSnapshot()
    expect(snap.settings).not.toHaveProperty('ai_api_key')
    expect(JSON.stringify(snap)).not.toContain('sk-abc')
  })
})

describe('applyResearchSnapshot（保留当前设备 AI Key）', () => {
  it('应用云端快照后本机 ai_api_key 保持不变，普通设置被云端覆盖', () => {
    useSettingsStore.setState({
      settings: fullSettings({ ai_api_key: 'local-key', ai_model: 'local-model' }),
    })
    const snapshot: ResearchSnapshot = {
      version: 1,
      exported_at: 'x',
      projects: [project('cloud-p')],
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
    }
    applyResearchSnapshot(snapshot)

    const s = useSettingsStore.getState().settings
    expect(s.ai_api_key).toBe('local-key')
    expect(s.ai_model).toBe('cloud-model')
    expect(useProjectsStore.getState().projects).toEqual([project('cloud-p')])
  })
})

describe('clearSyncedResearchData（退出/切换账号安全清理）', () => {
  it('清空科研数据，同时清除本机 ai_api_key，避免下一账号继承凭据', () => {
    useProjectsStore.setState({ projects: [project()] })
    useSettingsStore.setState({ settings: fullSettings({ ai_api_key: 'local-key' }) })

    clearSyncedResearchData()

    expect(useProjectsStore.getState().projects).toEqual([])
    expect(useSettingsStore.getState().settings.ai_api_key).toBe('')
  })
})

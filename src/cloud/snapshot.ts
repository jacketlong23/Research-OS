import type { DailyLog, Project, Schedule, Settings, Task } from '../types'
import { DEFAULT_SETTINGS } from '../types'
import {
  migrateSettings,
  useDailyLogsStore,
  useProjectsStore,
  useScheduleStore,
  useSettingsStore,
  useTasksStore,
} from '../store'

export interface CloudSettings {
  work_periods: Settings['work_periods']
  fill_ratio: number
  break_minutes: number
  deep_min_minutes: number
  deep_max_minutes: number
  ai_base_url: string
  ai_model: string
}

export interface ResearchSnapshot {
  version: 1
  exported_at: string
  projects: Project[]
  tasks: Task[]
  schedule: Schedule
  daily_logs: DailyLog[]
  /** 安全白名单：永远不包含 ai_api_key */
  settings: CloudSettings
}

/**
 * 用显式白名单而不是对象展开，避免未来 Settings 新增敏感字段后被意外同步。
 * 这是 AI API Key 安全红线的关键实现，任何同步/导出都必须走这里。
 */
export function settingsForCloud(settings: Settings): CloudSettings {
  return {
    work_periods: settings.work_periods,
    fill_ratio: settings.fill_ratio,
    break_minutes: settings.break_minutes,
    deep_min_minutes: settings.deep_min_minutes,
    deep_max_minutes: settings.deep_max_minutes,
    ai_base_url: settings.ai_base_url,
    ai_model: settings.ai_model,
  }
}

export function collectResearchSnapshot(): ResearchSnapshot {
  return {
    version: 1,
    exported_at: new Date().toISOString(),
    projects: useProjectsStore.getState().projects,
    tasks: useTasksStore.getState().tasks,
    schedule: useScheduleStore.getState().schedule,
    daily_logs: useDailyLogsStore.getState().logs,
    settings: settingsForCloud(useSettingsStore.getState().settings),
  }
}

export function applyResearchSnapshot(snapshot: ResearchSnapshot): void {
  if (snapshot.version !== 1) throw new Error(`不支持的云端数据版本：${snapshot.version}`)
  if (!Array.isArray(snapshot.projects) || !Array.isArray(snapshot.tasks)) throw new Error('云端数据格式错误')

  useProjectsStore.getState().setProjects(snapshot.projects)
  useTasksStore.getState().setTasks(snapshot.tasks)
  useScheduleStore.getState().setSchedule(snapshot.schedule ?? {})
  useDailyLogsStore.getState().setLogs(snapshot.daily_logs ?? [])

  // 云端永远不拥有 AI Key：应用云设置时保留当前设备自己的 Key。
  const currentKey = useSettingsStore.getState().settings.ai_api_key
  const migrated = migrateSettings(snapshot.settings)
  useSettingsStore.getState().update({ ...migrated, ai_api_key: currentKey })
}

/** 账号退出或切换账号时清除可能泄露的同步数据；本机 AI Key 保留。 */
export function clearSyncedResearchData(): void {
  useProjectsStore.getState().setProjects([])
  useTasksStore.getState().setTasks([])
  useScheduleStore.getState().setSchedule({})
  useDailyLogsStore.getState().setLogs([])

  const currentKey = useSettingsStore.getState().settings.ai_api_key
  useSettingsStore.getState().update({
    ...settingsForCloud(DEFAULT_SETTINGS),
    ai_api_key: currentKey,
  })
}

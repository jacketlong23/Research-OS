import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { DailyLog, Project, Schedule, Settings, Task } from '../types'
import { DEFAULT_SETTINGS } from '../types'
import { seedDailyLogs, seedProjects, seedTasks } from '../lib/seed'
import { migrateWorkPeriods } from '../lib/workPeriods'
import { uid } from '../lib/time'

// ---------- 项目 ----------
interface ProjectsState {
  projects: Project[]
  addProject: (p: Omit<Project, 'id'>) => void
  updateProject: (id: string, patch: Partial<Project>) => void
  deleteProject: (id: string) => void
  setProjects: (projects: Project[]) => void
}

export const useProjectsStore = create<ProjectsState>()(
  persist(
    (set) => ({
      projects: [],
      addProject: (p) => set((s) => ({ projects: [...s.projects, { ...p, id: uid('proj') }] })),
      updateProject: (id, patch) =>
        set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
      deleteProject: (id) => set((s) => ({ projects: s.projects.filter((p) => p.id !== id) })),
      setProjects: (projects) => set({ projects }),
    }),
    { name: 'research-os:projects', version: 1 },
  ),
)

// ---------- 任务 ----------
interface TasksState {
  tasks: Task[]
  addTask: (t: Omit<Task, 'id' | 'created_at'>) => Task
  updateTask: (id: string, patch: Partial<Task>) => void
  deleteTask: (id: string) => void
  setTasks: (tasks: Task[]) => void
}

export const useTasksStore = create<TasksState>()(
  persist(
    (set) => ({
      tasks: [],
      addTask: (t) => {
        const task: Task = { ...t, id: uid('task'), created_at: new Date().toISOString() }
        set((s) => ({ tasks: [...s.tasks, task] }))
        return task
      },
      updateTask: (id, patch) =>
        set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
      deleteTask: (id) => set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),
      setTasks: (tasks) => set({ tasks }),
    }),
    { name: 'research-os:tasks', version: 1 },
  ),
)

// ---------- 排程 ----------
interface ScheduleState {
  schedule: Schedule
  setSchedule: (schedule: Schedule) => void
  setDay: (date: string, slots: Schedule[string]) => void
  clearAll: () => void
}

export const useScheduleStore = create<ScheduleState>()(
  persist(
    (set) => ({
      schedule: {},
      setSchedule: (schedule) => set({ schedule }),
      setDay: (date, slots) => set((s) => ({ schedule: { ...s.schedule, [date]: slots } })),
      clearAll: () => set({ schedule: {} }),
    }),
    { name: 'research-os:schedule', version: 1 },
  ),
)

// ---------- 每日记录 ----------
interface DailyLogsState {
  logs: DailyLog[]
  upsertLog: (log: DailyLog) => void
  setLogs: (logs: DailyLog[]) => void
}

export const useDailyLogsStore = create<DailyLogsState>()(
  persist(
    (set) => ({
      logs: [],
      upsertLog: (log) =>
        set((s) => {
          const idx = s.logs.findIndex((l) => l.date === log.date)
          if (idx >= 0) {
            const copy = [...s.logs]
            copy[idx] = log
            return { logs: copy }
          }
          return { logs: [...s.logs, log] }
        }),
      setLogs: (logs) => set({ logs }),
    }),
    { name: 'research-os:daily_logs', version: 1 },
  ),
)

// ---------- 设置 ----------

/** 已在 DeepSeek 下线的旧模型名(老版本默认值,残留在用户 localStorage 里会导致所有请求 400) */
const DEAD_MODELS = ['deepseek-chat', 'deepseek-reasoner', 'deepseek-coder']

/** 旧版 localStorage 中的设置(含已被 work_periods 取代的 work_start/work_end) */
type LegacySettings = Partial<Settings> & { work_start?: string; work_end?: string }

/** 持久化数据迁移:旧模型名换默认、清空已废弃的内置演示 Key、work_start/work_end → work_periods;用户自己的配置不动 */
export function migrateSettings(settings: LegacySettings): Partial<Settings> {
  const next: LegacySettings = { ...settings }
  if (next.ai_model && DEAD_MODELS.includes(next.ai_model)) {
    next.ai_model = DEFAULT_SETTINGS.ai_model
  }
  // 旧版本内置的公共演示 Key 已作废,自动清空让用户填自己的(前缀匹配,代码里不保留完整 Key)
  if (next.ai_api_key && next.ai_api_key.startsWith('sk-fff8be')) {
    next.ai_api_key = ''
  }
  next.work_periods = migrateWorkPeriods(next.work_periods, next.work_start, next.work_end)
  delete next.work_start
  delete next.work_end
  return next
}

interface SettingsState {
  settings: Settings
  update: (patch: Partial<Settings>) => void
  reset: () => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      settings: DEFAULT_SETTINGS,
      update: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      reset: () => set({ settings: DEFAULT_SETTINGS }),
    }),
    {
      name: 'research-os:settings',
      version: 4,
      migrate: (state, version) => {
        const s = state as { settings?: LegacySettings } | null | undefined
        if (version < 4 && s?.settings) {
          s.settings = migrateSettings(s.settings)
        }
        return state
      },
    },
  ),
)

// ---------- 首次打开播种 ----------
/** localStorage 为空时写入示例数据;已有数据则不动 */
export function ensureSeeded(now = new Date()): boolean {
  let seeded = false
  if (useProjectsStore.getState().projects.length === 0) {
    useProjectsStore.getState().setProjects(seedProjects())
    seeded = true
  }
  if (useTasksStore.getState().tasks.length === 0) {
    useTasksStore.getState().setTasks(seedTasks(now))
    seeded = true
  }
  // 排程不播种,由今日页在首屏自动智能排程
  if (useDailyLogsStore.getState().logs.length === 0) {
    useDailyLogsStore.getState().setLogs(seedDailyLogs(now))
  }
  return seeded
}

/** 重置为示例数据(设置保留) */
export function resetToSeed(now = new Date()) {
  useProjectsStore.getState().setProjects(seedProjects())
  useTasksStore.getState().setTasks(seedTasks(now))
  useScheduleStore.getState().setSchedule({})
  useDailyLogsStore.getState().setLogs(seedDailyLogs(now))
}

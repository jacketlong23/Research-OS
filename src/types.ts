// ---------- 项目 ----------
export interface Project {
  id: string
  name: string
  /** 0-100 */
  progress: number
  current_focus: string
  next_step: string
  /** 1-5,5 最高 */
  priority: number
  /** 展示用主题色(tailwind 色名) */
  color: string
}

// ---------- 任务 ----------
export type TaskStatus = 'todo' | 'in_progress' | 'done'
export type TaskType = 'fixed' | 'flexible'

export interface Task {
  id: string
  title: string
  project_id: string | null
  /** 预计耗时(分钟) */
  duration_minutes: number
  /** ISO 字符串,null 表示无截止 */
  deadline: string | null
  /** 1-5,5 最高 */
  importance: number
  status: TaskStatus
  /** 是否允许拆分为多个时间块 */
  splittable: boolean
  /** 不可拆任务的最小连续块(分钟) */
  minimum_block_minutes: number
  /** 是否阻塞后续任务 */
  blocking: boolean
  type: TaskType
  created_at: string
  /** 完成时间(复盘统计用) */
  completed_at?: string | null

  // ---- 仅 fixed 任务 ----
  /** 一次性固定日期 YYYY-MM-DD */
  fixed_date?: string
  /** 每周重复(0=周日 … 6=周六),与 fixed_date 二选一 */
  repeat_weekdays?: number[]
  /** HH:mm */
  start?: string
  end?: string
}

// ---------- 排程 ----------
export interface ScheduleSlot {
  taskId: string
  /** HH:mm */
  start: string
  /** HH:mm */
  end: string
}

/** date(YYYY-MM-DD) -> 弹性任务时间块(固定事件不落库,渲染时推导) */
export type Schedule = Record<string, ScheduleSlot[]>

// ---------- 每日记录 ----------
export interface DailyLog {
  date: string
  completed: string[]
  problems: string[]
  next: string[]
}

// ---------- 设置 ----------
/** 一个可配置的工作时段(仅 enabled 且 end>start 的时段参与自动排程) */
export interface WorkPeriod {
  id: string
  start: string
  end: string
  enabled: boolean
  label?: string
}

export interface Settings {
  /** 多个可配置工作时段,替代原来的单一 work_start/work_end */
  work_periods: WorkPeriod[]
  /** 每日自动排程占可用时间的比例上限 */
  fill_ratio: number
  /** 任务间缓冲(分钟) */
  break_minutes: number
  /** 深度工作块下限(分钟) */
  deep_min_minutes: number
  /** 深度工作块上限(分钟) */
  deep_max_minutes: number
  ai_base_url: string
  ai_model: string
  ai_api_key: string
}

/** 每次返回全新数组,避免共享引用被意外修改 */
export function createDefaultWorkPeriods(): WorkPeriod[] {
  return [
    { id: 'morning', label: '上午', start: '09:00', end: '11:30', enabled: true },
    { id: 'afternoon', label: '下午', start: '14:00', end: '17:30', enabled: true },
    { id: 'evening', label: '晚间', start: '19:00', end: '21:00', enabled: false },
  ]
}

export const DEFAULT_SETTINGS: Settings = {
  work_periods: createDefaultWorkPeriods(),
  fill_ratio: 0.78,
  break_minutes: 15,
  deep_min_minutes: 90,
  deep_max_minutes: 150,
  ai_base_url: 'https://api.deepseek.com',
  ai_model: 'deepseek-v4-flash',
  ai_api_key: '',
}

/** 临时任务的默认项目桶 */
export const INBOX_PROJECT_ID = 'inbox'

/**
 * 安全说明:API Key 绝不写进代码(仓库公开 = Key 公开,会被扫描盗刷)。
 * 用户在「设置 → AI 配置」填入自己的 Key,只保存在本机浏览器 localStorage。
 */

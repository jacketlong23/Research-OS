import type { Project, Settings, Task } from '../types'
import { minutesOfDay } from '../lib/time'
import { enabledWorkIntervals } from '../lib/workPeriods'

/**
 * 优先级评分(构想 §10):
 * Score = 0.30×Urgency + 0.25×Importance + 0.20×DeadlineRisk + 0.15×Blocking + 0.10×ProjectPriority
 * 各因子均归一化到 0-1。
 */
export interface ScoreBreakdown {
  urgency: number
  importance: number
  deadlineRisk: number
  blocking: number
  projectPriority: number
  total: number
}

const WEIGHTS = { urgency: 0.3, importance: 0.25, deadlineRisk: 0.2, blocking: 0.15, projectPriority: 0.1 }

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

/** 截止紧迫度:3 天内线性上升,过期恒为 1,无截止为 0 */
function urgency(deadline: string | null, now: Date): number {
  if (!deadline) return 0
  const days = (new Date(deadline).getTime() - now.getTime()) / 86400000
  if (days <= 0) return 1
  return clamp01(1 - days / 3)
}

/** 截止前(启用工作时段内的)可用分钟数 */
export function workMinutesUntil(deadline: string, settings: Settings, now: Date): number {
  const dl = new Date(deadline)
  if (dl.getTime() <= now.getTime()) return 0
  const windows = enabledWorkIntervals(settings)
  const totalWin = windows.reduce((a, w) => a + (w.end - w.start), 0)
  const nowKey = dateKeyOf(now)
  const dlKey = dateKeyOf(dl)
  const dlMin = dl.getHours() * 60 + dl.getMinutes()
  const nowMin = minutesOfDay(now)
  let total = 0
  const cursor = new Date(now)
  while (dateKeyOf(cursor) <= dlKey) {
    const key = dateKeyOf(cursor)
    if (key === dlKey) {
      // 截止日:从时段开始(若当天即今天则从当前时刻)算到截止时刻为止
      const startMin = key === nowKey ? nowMin : -1
      total += windows.reduce(
        (a, w) => a + Math.max(0, Math.min(dlMin, w.end) - Math.max(w.start, startMin)),
        0,
      )
    } else if (key === nowKey) {
      // 今天剩余:从当前时刻到各时段结束
      total += windows.reduce((a, w) => a + Math.max(0, w.end - Math.max(w.start, nowMin)), 0)
    } else {
      total += totalWin
    }
    cursor.setDate(cursor.getDate() + 1)
  }
  return total
}

function dateKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 截止风险:所需时长 / 截止前可用工作时长 */
function deadlineRisk(task: Task, settings: Settings, now: Date): number {
  if (!task.deadline) return 0
  const available = workMinutesUntil(task.deadline, settings, now)
  if (available <= 0) return 1
  return clamp01(task.duration_minutes / available)
}

export function scoreTask(task: Task, project: Project | null, settings: Settings, now: Date): ScoreBreakdown {
  const u = urgency(task.deadline, now)
  const i = (task.importance - 1) / 4
  const r = deadlineRisk(task, settings, now)
  const b = task.blocking ? 1 : 0
  const pp = project ? (project.priority - 1) / 4 : 0.5 // 无项目按中等优先级
  const total =
    WEIGHTS.urgency * u + WEIGHTS.importance * i + WEIGHTS.deadlineRisk * r + WEIGHTS.blocking * b + WEIGHTS.projectPriority * pp
  return { urgency: u, importance: i, deadlineRisk: r, blocking: b, projectPriority: pp, total }
}

/** 按(可选截止时间,否则分数)降序的稳定排序键 */
export function sortKeyOf(b: ScoreBreakdown, task: Task): number {
  return b.total * 1000 + task.importance / 100
}

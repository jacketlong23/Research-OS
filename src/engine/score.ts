import type { Project, Settings, Task } from '../types'
import { hhmmToMinutes } from '../lib/time'

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

/** 截止前(工作时间窗口内的)可用分钟数 */
export function workMinutesUntil(deadline: string, settings: Settings, now: Date): number {
  const dl = new Date(deadline)
  const winLen = hhmmToMinutes(settings.work_end) - hhmmToMinutes(settings.work_start)
  let total = 0
  const cursor = new Date(now)
  while (dateKeyOf(cursor) <= dateKeyOf(dl)) {
    const sameDay = dateKeyOf(cursor) === dateKeyOf(dl)
    if (sameDay) {
      // 截止时刻已过:当天不再有可用时间(此前误从 0 点起算,导致过期任务的截止风险被低估)
      if (cursor.getTime() < dl.getTime()) {
        const dlMin = dl.getHours() * 60 + dl.getMinutes()
        const start = Math.max(hhmmToMinutes(settings.work_start), now.getHours() * 60 + now.getMinutes())
        total += Math.max(0, Math.min(dlMin, hhmmToMinutes(settings.work_end)) - start)
      }
    } else if (dateKeyOf(cursor) === dateKeyOf(now)) {
      // 今天剩余
      total += Math.max(0, hhmmToMinutes(settings.work_end) - Math.max(hhmmToMinutes(settings.work_start), now.getHours() * 60 + now.getMinutes()))
    } else {
      total += Math.max(0, winLen)
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

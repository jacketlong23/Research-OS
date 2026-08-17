import { createDefaultWorkPeriods, type Settings, type WorkPeriod } from '../types'
import { hhmmToMinutes } from './time'

/** 分钟区间 */
export interface WorkInterval {
  start: number
  end: number
}

/** 取所有「启用且合法(end>start)」的工作时段,按开始时间升序 */
export function enabledWorkPeriods(settings: Settings): WorkPeriod[] {
  return settings.work_periods
    .filter((p) => p.enabled && hhmmToMinutes(p.end) > hhmmToMinutes(p.start))
    .sort((a, b) => hhmmToMinutes(a.start) - hhmmToMinutes(b.start))
}

/** 启用工作时段转为分钟区间 */
export function enabledWorkIntervals(settings: Settings): WorkInterval[] {
  return enabledWorkPeriods(settings).map((p) => ({ start: hhmmToMinutes(p.start), end: hhmmToMinutes(p.end) }))
}

/** 启用工作时段总分钟数 */
export function enabledWorkMinutes(settings: Settings): number {
  return enabledWorkIntervals(settings).reduce((acc, i) => acc + (i.end - i.start), 0)
}

/** 时间轴边界:最早启用时段开始 ~ 最晚启用时段结束(无启用时段时给一个安全默认) */
export function workDayBounds(settings: Settings): WorkInterval {
  const ivs = enabledWorkIntervals(settings)
  if (ivs.length === 0) return { start: 9 * 60, end: 17 * 60 }
  return { start: ivs[0].start, end: ivs[ivs.length - 1].end }
}

/** 时间轴范围内、位于启用工作时段之间的"非工作"区间(午休、晚餐间隔等),用于渲染灰色底 */
export function offWorkIntervals(settings: Settings): WorkInterval[] {
  const ivs = enabledWorkIntervals(settings)
  const gaps: WorkInterval[] = []
  for (let i = 1; i < ivs.length; i++) {
    const prev = ivs[i - 1]
    const cur = ivs[i]
    if (cur.start > prev.end) gaps.push({ start: prev.end, end: cur.start })
  }
  return gaps
}

/** 某区间与启用工作时段重叠的总分钟数 */
export function overlapWithWork(interval: WorkInterval, settings: Settings): number {
  return enabledWorkIntervals(settings).reduce((acc, w) => {
    const s = Math.max(interval.start, w.start)
    const e = Math.min(interval.end, w.end)
    return acc + (e > s ? e - s : 0)
  }, 0)
}

/** 展示用,如 "09:00–11:30, 14:00–17:30" */
export function formatWorkPeriods(settings: Settings): string {
  return enabledWorkPeriods(settings)
    .map((p) => `${p.start}–${p.end}`)
    .join(', ')
}

/** 旧版单一连续工作时间的默认值(迁移判断用) */
export const LEGACY_WORK_START = '09:00'
export const LEGACY_WORK_END = '20:30'

/**
 * 旧版 work_start/work_end → 多时段迁移:
 * - 已有非空 work_periods 则原样返回
 * - 旧默认(09:00–20:30)→ 新默认三段(上午/下午启用,晚间关闭)
 * - 用户自定义 → 单一时段 [work_start, work_end]
 * - 非法(结束<=开始)或缺省 → 回退默认三段
 */
export function migrateWorkPeriods(
  periods: WorkPeriod[] | undefined,
  workStart?: string,
  workEnd?: string,
): WorkPeriod[] {
  if (Array.isArray(periods) && periods.length > 0) return periods
  const isDefault =
    (!workStart || workStart === LEGACY_WORK_START) && (!workEnd || workEnd === LEGACY_WORK_END)
  if (isDefault) return createDefaultWorkPeriods()
  const start = workStart || LEGACY_WORK_START
  const end = workEnd || LEGACY_WORK_END
  if (hhmmToMinutes(end) > hhmmToMinutes(start)) {
    return [{ id: 'custom', label: '工作时间', start, end, enabled: true }]
  }
  return createDefaultWorkPeriods()
}

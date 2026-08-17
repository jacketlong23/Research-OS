import type { Project, Schedule, ScheduleSlot, Settings, Task } from '../types'
import { addDays, dateKey, hhmmToMinutes, minutesOfDay, minutesToHHmm, parseDateKey } from '../lib/time'
import { enabledWorkIntervals, enabledWorkMinutes, overlapWithWork } from '../lib/workPeriods'
import { scoreTask } from './score'

/** 一天内的分钟区间 */
export interface Interval {
  start: number
  end: number
}

export interface FixedEvent {
  task: Task
  start: number
  end: number
}

export interface Warning {
  taskId: string
  message: string
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** 当天生效的 fixed 事件(一次性 fixed_date 或每周重复 repeat_weekdays,0=周日…6=周六) */
export function fixedEventsOn(tasks: Task[], day: Date): FixedEvent[] {
  const key = dateKey(day)
  return tasks
    .filter((t) => t.type === 'fixed')
    .filter((t) => (t.fixed_date ? t.fixed_date === key : (t.repeat_weekdays ?? []).includes(day.getDay())))
    .filter((t) => t.start && t.end && hhmmToMinutes(t.end) > hhmmToMinutes(t.start))
    .map((t) => ({ task: t, start: hhmmToMinutes(t.start!), end: hhmmToMinutes(t.end!) }))
}

function sumMinutes(list: Interval[]): number {
  return list.reduce((acc, i) => acc + (i.end - i.start), 0)
}

function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = [...list].sort((a, b) => a.start - b.start)
  const merged: Interval[] = []
  for (const cur of sorted) {
    const last = merged[merged.length - 1]
    if (last && cur.start <= last.end) last.end = Math.max(last.end, cur.end)
    else merged.push({ ...cur })
  }
  return merged
}

/** 把每个占用区间右侧扩展 buffer,保证新块与已排块之间留出缓冲 */
function expandRight(list: Interval[], buffer: number): Interval[] {
  return list.map((i) => ({ start: i.start, end: i.end + buffer }))
}

/**
 * 启用工作时段内的空闲区间。
 * busy 为需要避开的区间;today 会额外裁掉"现在"之前的时间。
 * 只在启用工作时段内部返回空隙,午休/晚间等未启用时段天然不会出现。
 */
export function freeGaps(day: Date, busy: Interval[], settings: Settings, now: Date): Interval[] {
  const windows = enabledWorkIntervals(settings)
  const all = [...busy]
  if (dateKey(day) === dateKey(now)) {
    all.push({ start: -1, end: minutesOfDay(now) })
  }
  const merged = mergeIntervals(all.filter((i) => i.end > i.start))
  const gaps: Interval[] = []
  for (const w of windows) {
    let cursor = w.start
    for (const b of merged) {
      if (b.end <= w.start) continue
      if (b.start >= w.end) break
      const bs = Math.max(b.start, w.start)
      const be = Math.min(b.end, w.end)
      if (bs > cursor) gaps.push({ start: cursor, end: bs })
      cursor = Math.max(cursor, be)
    }
    if (cursor < w.end) gaps.push({ start: cursor, end: w.end })
  }
  return gaps.filter((g) => g.end - g.start > 0)
}

/** 在第一个能容纳 size 的空隙放置,返回起始分钟;找不到返回 null */
function placeInGaps(gaps: Interval[], size: number): number | null {
  for (const g of gaps) {
    if (g.end - g.start >= size) return g.start
  }
  return null
}

/**
 * 拆分时间块(分钟):
 * - 不可拆:单块 = max(时长, 最小块),必须整块放下
 * - 可拆:每块 ≤ deep_max 且 ≥ min_block(近似对半切)
 */
export function splitChunks(duration: number, splittable: boolean, minBlock: number, deepMax: number): number[] {
  if (!splittable) return [Math.max(duration, minBlock)]
  const chunks: number[] = []
  let remaining = duration
  while (remaining > 0) {
    const take =
      remaining <= deepMax ? remaining : Math.min(deepMax, Math.max(minBlock, Math.ceil(remaining / 2)))
    chunks.push(take)
    remaining -= take
  }
  return chunks
}

function projectOf(task: Task, projects: Project[]): Project | null {
  return projects.find((p) => p.id === task.project_id) ?? null
}

/** 待排的 flexible 任务按分数降序 */
export function pendingFlexible(tasks: Task[], projects: Project[], settings: Settings, now: Date): Task[] {
  return tasks
    .filter((t) => t.type === 'flexible' && t.status !== 'done')
    .map((t) => ({ task: t, key: scoreTask(t, projectOf(t, projects), settings, now).total * 1e6 + t.importance }))
    .sort((a, b) => b.key - a.key)
    .map((x) => x.task)
}

/** 分数最高的前 N 个未完成任务(Big 3) */
export function topTasks(tasks: Task[], projects: Project[], settings: Settings, now: Date, n = 3): Task[] {
  return pendingFlexible(tasks, projects, settings, now).slice(0, n)
}

interface DayPlan {
  /** 必须保留的已有块(今天已过去的) */
  kept: ScheduleSlot[]
  keptIntervals: Interval[]
  placed: ScheduleSlot[]
  placedIntervals: Interval[]
}

function newDayPlan(kept: ScheduleSlot[]): DayPlan {
  return {
    kept,
    keptIntervals: kept.map((s) => ({ start: hhmmToMinutes(s.start), end: hhmmToMinutes(s.end) })),
    placed: [],
    placedIntervals: [],
  }
}

/**
 * 某天还能排的 flexible 总分钟数(fill_ratio 约束)。
 * 基准 = 所有启用工作时段总长 - 固定事件与工作时段重叠的部分(横跨午休的固定事件只扣工作时段内的部分)。
 */
export function dayCapacity(day: Date, tasks: Task[], settings: Settings, usedMinutes: number): number {
  const fixed = fixedEventsOn(tasks, day)
  const totalWorkMin = enabledWorkMinutes(settings)
  const fixedMin = fixed.reduce((acc, f) => acc + overlapWithWork({ start: f.start, end: f.end }, settings), 0)
  return Math.round(settings.fill_ratio * Math.max(0, totalWorkMin - fixedMin)) - usedMinutes
}

interface ChunkPlaced {
  start: number
  end: number
}

/**
 * 尝试把 chunks 尽量放进某天。
 * occupiedNeedBuffer: 排块时需要在其后留缓冲的区间(已排 flexible)
 * occupiedHard: 不允许重叠但无需缓冲的区间(fixed 事件、已过去时间)
 * 返回实际放下的块(可能少于 chunks)。
 */
function placeChunks(
  day: Date,
  chunks: number[],
  settings: Settings,
  now: Date,
  occupiedSoft: Interval[],
  occupiedHard: Interval[],
  capacity: number,
): ChunkPlaced[] {
  const placed: ChunkPlaced[] = []
  let used = 0
  for (const size of chunks) {
    if (used + size > capacity) break
    const busy = [...occupiedHard, ...expandRight(occupiedSoft, settings.break_minutes)]
    const gaps = freeGaps(day, busy, settings, now)
    const at = placeInGaps(gaps, size)
    if (at === null) break
    placed.push({ start: at, end: at + size })
    occupiedSoft.push({ start: at, end: at + size })
    used += size
  }
  return placed
}

export interface RescheduleResult {
  schedule: Schedule
  warnings: Warning[]
}

/**
 * 全量重排(「智能重新安排」):
 * - 历史日期与今天已过去的时间块保持不动
 * - 从今天起 horizonDays 天,围绕 fixed 事件重排所有未完成 flexible 任务
 */
export function reschedule(
  tasks: Task[],
  projects: Project[],
  schedule: Schedule,
  settings: Settings,
  now: Date,
  horizonDays = 7,
): RescheduleResult {
  const todayKey = dateKey(now)
  const result: Schedule = {}
  for (const [key, slots] of Object.entries(schedule)) {
    if (key < todayKey) result[key] = slots
  }

  const dayStart = startOfDay(now)
  const plans = new Map<string, DayPlan>()
  for (let d = 0; d < horizonDays; d++) {
    const day = addDays(dayStart, d)
    const key = dateKey(day)
    const kept =
      d === 0
        ? (schedule[key] ?? []).filter((s) => hhmmToMinutes(s.end) <= minutesOfDay(now))
        : []
    plans.set(key, newDayPlan(kept))
  }

  const pending = pendingFlexible(tasks, projects, settings, now).map((task) => ({
    task,
    chunks: splitChunks(
      task.duration_minutes,
      task.splittable,
      task.minimum_block_minutes,
      settings.deep_max_minutes,
    ),
  }))

  const lastEnd = new Map<string, { day: string; minutes: number }>()

  for (let d = 0; d < horizonDays; d++) {
    const day = addDays(dayStart, d)
    const key = dateKey(day)
    const plan = plans.get(key)!
    const fixed = fixedEventsOn(tasks, day)
    const hard = fixed.map((f) => ({ start: f.start, end: f.end }))
    const usedBefore = sumMinutes(plan.keptIntervals)
    let cap = dayCapacity(day, tasks, settings, usedBefore)

    for (let i = 0; i < pending.length; ) {
      const item = pending[i]
      if (cap <= 0) break
      const soft: Interval[] = [...plan.placedIntervals]
      const placed = placeChunks(day, item.chunks, settings, now, soft, hard, cap)
      if (placed.length === 0) {
        i++ // 今天放不下这个任务,先看看后面的任务
        continue
      }
      for (const p of placed) {
        const slot: ScheduleSlot = {
          taskId: item.task.id,
          start: minutesToHHmm(p.start),
          end: minutesToHHmm(p.end),
        }
        plan.placed.push(slot)
        plan.placedIntervals.push({ start: p.start, end: p.end })
        cap -= p.end - p.start
        lastEnd.set(item.task.id, { day: key, minutes: p.end })
      }
      item.chunks = item.chunks.slice(placed.length)
      if (item.chunks.length === 0) pending.splice(i, 1)
      else i++ // 没排完,剩余块顺延后续日期
    }
  }

  const warnings: Warning[] = []
  for (const item of pending) {
    warnings.push({
      taskId: item.task.id,
      message: `未来 ${horizonDays} 天工作时间内放不下,剩余 ${item.chunks.reduce((a, c) => a + c, 0)} 分钟未安排`,
    })
  }
  for (const [taskId, end] of lastEnd) {
    const task = tasks.find((t) => t.id === taskId)
    if (task?.deadline) {
      const scheduledEnd = parseDateKey(end.day)
      scheduledEnd.setMinutes(end.minutes)
      if (scheduledEnd.getTime() > new Date(task.deadline).getTime()) {
        warnings.push({
          taskId,
          message: `预计完成时间(${end.day} ${minutesToHHmm(end.minutes)})已超过截止时间`,
        })
      }
    }
  }

  for (const [key, plan] of plans) {
    const slots = [...plan.kept, ...plan.placed].sort((a, b) => hhmmToMinutes(a.start) - hhmmToMinutes(b.start))
    if (slots.length > 0) result[key] = slots
  }
  return { schedule: result, warnings }
}

/**
 * 增量插入新任务(构想 §12):
 * 只在已有安排的空隙/余量中放置,绝不移动或驱逐任何已存在的块。
 */
export function insertTaskIncrementally(
  task: Task,
  schedule: Schedule,
  tasks: Task[],
  settings: Settings,
  now: Date,
  horizonDays = 7,
): { schedule: Schedule; placed: ScheduleSlot[] } {
  const result: Schedule = { ...schedule }
  const dayStart = startOfDay(now)
  let chunks = splitChunks(
    task.duration_minutes,
    task.splittable,
    task.minimum_block_minutes,
    settings.deep_max_minutes,
  )
  const placed: ScheduleSlot[] = []

  for (let d = 0; d < horizonDays && chunks.length > 0; d++) {
    const day = addDays(dayStart, d)
    const key = dateKey(day)
    const existing = result[key] ?? []
    const existingIntervals = existing.map((s) => ({ start: hhmmToMinutes(s.start), end: hhmmToMinutes(s.end) }))
    const fixed = fixedEventsOn(tasks, day)
    const hard = fixed.map((f) => ({ start: f.start, end: f.end }))
    const cap = dayCapacity(day, tasks, settings, sumMinutes(existingIntervals))
    const soft: Interval[] = existingIntervals.map((i) => ({ ...i }))
    const got = placeChunks(day, chunks, settings, now, soft, hard, cap)
    if (got.length === 0) continue
    const newSlots = existing.slice()
    for (const p of got) {
      newSlots.push({ taskId: task.id, start: minutesToHHmm(p.start), end: minutesToHHmm(p.end) })
      placed.push({ taskId: task.id, start: minutesToHHmm(p.start), end: minutesToHHmm(p.end) })
    }
    newSlots.sort((a, b) => hhmmToMinutes(a.start) - hhmmToMinutes(b.start))
    result[key] = newSlots
    chunks = chunks.slice(got.length)
  }
  return { schedule: result, placed }
}

/** 渲染视图:某天 fixed 事件 + 已排 flexible 的合并时间线 */
export interface TimelineItem {
  kind: 'fixed' | 'flexible'
  task: Task
  start: number
  end: number
}

export function dayTimeline(tasks: Task[], schedule: Schedule, day: Date): TimelineItem[] {
  const items: TimelineItem[] = []
  for (const f of fixedEventsOn(tasks, day)) {
    items.push({ kind: 'fixed', task: f.task, start: f.start, end: f.end })
  }
  for (const s of schedule[dateKey(day)] ?? []) {
    const task = tasks.find((t) => t.id === s.taskId)
    if (!task) continue
    items.push({ kind: 'flexible', task, start: hhmmToMinutes(s.start), end: hhmmToMinutes(s.end) })
  }
  return items.sort((a, b) => a.start - b.start)
}

/** 任务在某天已排的总分钟数 */
export function scheduledMinutesOn(schedule: Schedule, taskId: string, key: string): number {
  return (schedule[key] ?? [])
    .filter((s) => s.taskId === taskId)
    .reduce((acc, s) => acc + (hhmmToMinutes(s.end) - hhmmToMinutes(s.start)), 0)
}

/** 今天剩余未排(且未完成)的 flexible 任务 */
export function unscheduledFlexible(
  tasks: Task[],
  schedule: Schedule,
  now: Date,
): Task[] {
  const todayKey = dateKey(now)
  return tasks.filter(
    (t) =>
      t.type === 'flexible' &&
      t.status !== 'done' &&
      (schedule[todayKey] ?? []).every((s) => s.taskId !== t.id),
  )
}

/** 删除某任务未来的所有时间块(已完成/已删除时清理用),保留已过去的历史 */
export function removeFutureSlots(schedule: Schedule, taskId: string, now: Date): Schedule {
  const todayKey = dateKey(now)
  const mins = minutesOfDay(now)
  const next: Schedule = {}
  for (const [key, slots] of Object.entries(schedule)) {
    const filtered = slots.filter(
      (s) =>
        !(s.taskId === taskId && (key > todayKey || (key === todayKey && hhmmToMinutes(s.start) >= mins))),
    )
    if (filtered.length > 0) next[key] = filtered
  }
  return next
}

/** 把某任务在某天的所有时间块移动到另一天(保持时间不变),目标日冲突时返回 null */
export function moveTaskDay(
  schedule: Schedule,
  taskId: string,
  fromKey: string,
  toKey: string,
  tasks: Task[],
): Schedule | null {
  const moving = (schedule[fromKey] ?? []).filter((s) => s.taskId === taskId)
  if (moving.length === 0) return null
  const target = schedule[toKey] ?? []
  const targetDay = parseDateKey(toKey)
  const busy = [
    ...fixedEventsOn(tasks, targetDay).map((f) => ({ start: f.start, end: f.end })),
    ...target.map((s) => ({ start: hhmmToMinutes(s.start), end: hhmmToMinutes(s.end) })),
  ]
  const merged = mergeIntervals(busy)
  for (const s of moving) {
    const a = hhmmToMinutes(s.start)
    const b = hhmmToMinutes(s.end)
    if (merged.some((m) => a < m.end && b > m.start)) return null // 冲突
  }
  const next: Schedule = { ...schedule }
  const remainFrom = (schedule[fromKey] ?? []).filter((s) => s.taskId !== taskId)
  if (remainFrom.length > 0) next[fromKey] = remainFrom
  else delete next[fromKey]
  next[toKey] = [...target, ...moving].sort((x, y) => hhmmToMinutes(x.start) - hhmmToMinutes(y.start))
  return next
}

/** 某天与 [a,b](分钟) 重叠的其他安排,返回描述文字;无冲突返回 null */
export function findConflict(
  tasks: Task[],
  schedule: Schedule,
  key: string,
  excludeTaskId: string | null,
  a: number,
  b: number,
): string | null {
  if (b <= a) return null
  for (const f of fixedEventsOn(tasks, parseDateKey(key))) {
    if (f.task.id === excludeTaskId) continue
    if (a < f.end && b > f.start) return `固定事件「${f.task.title}」${minutesToHHmm(f.start)}–${minutesToHHmm(f.end)}`
  }
  for (const s of schedule[key] ?? []) {
    if (s.taskId === excludeTaskId) continue
    const sa = hhmmToMinutes(s.start)
    const sb = hhmmToMinutes(s.end)
    if (a < sb && b > sa) {
      const t = tasks.find((x) => x.id === s.taskId)
      return `「${t?.title ?? s.taskId}」${s.start}–${s.end}`
    }
  }
  return null
}

/** 手动修改某天的一个时间块;时间非法或与其他安排冲突时返回 null */
export function updateSlot(
  schedule: Schedule,
  key: string,
  taskId: string,
  oldStart: string,
  newStart: string,
  newEnd: string,
  tasks: Task[],
): Schedule | null {
  const slots = schedule[key] ?? []
  const idx = slots.findIndex((s) => s.taskId === taskId && s.start === oldStart)
  if (idx < 0) return null
  const a = hhmmToMinutes(newStart)
  const b = hhmmToMinutes(newEnd)
  if (b <= a) return null
  if (findConflict(tasks, schedule, key, taskId, a, b)) return null
  const copy = slots.slice()
  copy[idx] = { taskId, start: newStart, end: newEnd }
  copy.sort((x, y) => hhmmToMinutes(x.start) - hhmmToMinutes(y.start))
  return { ...schedule, [key]: copy }
}

/** 删除某天某任务的一个时间块 */
export function deleteSlot(schedule: Schedule, key: string, taskId: string, start: string): Schedule {
  const slots = (schedule[key] ?? []).filter((s) => !(s.taskId === taskId && s.start === start))
  const next: Schedule = { ...schedule }
  if (slots.length > 0) next[key] = slots
  else delete next[key]
  return next
}

/**
 * 在指定时刻"锚定"放置任务(点击时间轴空白的快速安排):
 * 首块从 startMinutes 开始,剩余块增量补排;锚点冲突或放不下时整体退回增量插入。
 */
export function insertTaskAtTime(
  task: Task,
  schedule: Schedule,
  tasks: Task[],
  settings: Settings,
  now: Date,
  startMinutes: number,
): { schedule: Schedule; anchored: boolean; placed: ScheduleSlot[] } {
  // 锚点在今天已过去的时刻:退回增量插入,避免把任务排到过去
  if (startMinutes < minutesOfDay(now)) {
    return { ...insertTaskIncrementally(task, schedule, tasks, settings, now), anchored: false }
  }
  // 锚点必须落在某个启用工作时段内;落在午休/晚间等空白处则退回增量插入
  const win = enabledWorkIntervals(settings).find((w) => startMinutes >= w.start && startMinutes < w.end)
  if (!win) {
    return { ...insertTaskIncrementally(task, schedule, tasks, settings, now), anchored: false }
  }
  const chunks = splitChunks(
    task.duration_minutes,
    task.splittable,
    task.minimum_block_minutes,
    settings.deep_max_minutes,
  )
  const wantFirst = chunks[0]
  const first = Math.min(wantFirst, win.end - startMinutes)
  const key = dateKey(now)
  const hard = fixedEventsOn(tasks, now).map((f) => ({ start: f.start, end: f.end }))
  const existing = (schedule[key] ?? []).map((s) => ({ start: hhmmToMinutes(s.start), end: hhmmToMinutes(s.end) }))
  const conflict = [...hard, ...existing].some((o) => startMinutes < o.end && startMinutes + first > o.start)
  if (first < 15 || first < wantFirst || conflict) {
    return { ...insertTaskIncrementally(task, schedule, tasks, settings, now), anchored: false }
  }
  const anchor: ScheduleSlot = {
    taskId: task.id,
    start: minutesToHHmm(startMinutes),
    end: minutesToHHmm(startMinutes + first),
  }
  let next: Schedule = {
    ...schedule,
    [key]: [...(schedule[key] ?? []), anchor].sort((a, b) => hhmmToMinutes(a.start) - hhmmToMinutes(b.start)),
  }
  const remaining = task.duration_minutes - first
  if (remaining > 0) {
    next = insertTaskIncrementally({ ...task, duration_minutes: remaining }, next, tasks, settings, now).schedule
  }
  return { schedule: next, anchored: true, placed: [anchor] }
}

/** 删除某任务在所有日期的时间块(删除任务时用) */
export function removeAllSlots(schedule: Schedule, taskId: string): Schedule {
  const next: Schedule = {}
  for (const [k, slots] of Object.entries(schedule)) {
    const filtered = slots.filter((s) => s.taskId !== taskId)
    if (filtered.length > 0) next[k] = filtered
  }
  return next
}

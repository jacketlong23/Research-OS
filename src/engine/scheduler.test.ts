import { describe, expect, it } from 'vitest'
import type { Schedule, Settings, Task } from '../types'
import { DEFAULT_SETTINGS } from '../types'
import {
  deleteSlot,
  findConflict,
  freeGaps,
  insertTaskAtTime,
  insertTaskIncrementally,
  removeAllSlots,
  reschedule,
  splitChunks,
  topTasks,
  updateSlot,
} from './scheduler'
import { scoreTask } from './score'
import { dateKey } from '../lib/time'

// 2026-08-12 是周三;08:00 在工作时间开始前,一整天可用
const NOW = new Date(2026, 7, 12, 8, 0)
const TODAY = dateKey(NOW)
const TOMORROW = dateKey(new Date(2026, 7, 13, 8, 0))

const SETTINGS: Settings = { ...DEFAULT_SETTINGS }

let seq = 0
function flexTask(p: Partial<Task> = {}): Task {
  seq += 1
  return {
    id: p.id ?? `t${seq}`,
    title: p.title ?? `任务${seq}`,
    project_id: null,
    duration_minutes: 60,
    deadline: null,
    importance: 3,
    status: 'todo',
    splittable: false,
    minimum_block_minutes: 30,
    blocking: false,
    type: 'flexible',
    created_at: '2026-08-01T00:00:00.000Z',
    ...p,
  }
}

function fixedToday(start: string, end: string): Task {
  return flexTask({
    title: '固定事件',
    type: 'fixed',
    fixed_date: TODAY,
    start,
    end,
    importance: 5,
  })
}

const slotTimes = (s: Schedule, key: string) =>
  (s[key] ?? []).map((x) => [x.start, x.end]).sort()

describe('splitChunks', () => {
  it('不可拆任务占 max(时长, 最小块)', () => {
    expect(splitChunks(60, false, 90, 150)).toEqual([90])
    expect(splitChunks(200, false, 90, 150)).toEqual([200])
  })
  it('可拆任务每块在 [min_block, deep_max] 内', () => {
    expect(splitChunks(200, true, 90, 150)).toEqual([100, 100])
    expect(splitChunks(300, true, 30, 150)).toEqual([150, 150])
    expect(splitChunks(45, true, 30, 150)).toEqual([45])
  })
})

describe('freeGaps', () => {
  it('避开 fixed 事件并裁掉今天已过去的时间', () => {
    const now = new Date(2026, 7, 12, 10, 0) // 10:00
    const gaps = freeGaps(NOW, [{ start: 660, end: 720 }], SETTINGS, now) // 11:00-12:00
    expect(gaps).toEqual([
      { start: 600, end: 660 }, // 10:00-11:00
      { start: 720, end: 1230 }, // 12:00-20:30
    ])
  })
})

describe('scoreTask', () => {
  it('截止越近分越高,阻塞任务加分', () => {
    const soon = flexTask({ deadline: new Date(2026, 7, 12, 18, 0).toISOString() })
    const later = flexTask({ deadline: new Date(2026, 7, 20, 18, 0).toISOString() })
    const s1 = scoreTask(soon, null, SETTINGS, NOW)
    const s2 = scoreTask(later, null, SETTINGS, NOW)
    expect(s1.total).toBeGreaterThan(s2.total)

    const blocking = flexTask({ deadline: null, blocking: true })
    const normal = flexTask({ deadline: null, blocking: false })
    expect(scoreTask(blocking, null, SETTINGS, NOW).blocking).toBe(1)
    expect(scoreTask(blocking, null, SETTINGS, NOW).total).toBeGreaterThan(
      scoreTask(normal, null, SETTINGS, NOW).total,
    )
  })

  it('截止已过期的任务,截止风险为满分(可用工作时长按 0 算)', () => {
    const afternoon = new Date(2026, 7, 12, 15, 0) // 15:00
    const expired = flexTask({ deadline: new Date(2026, 7, 12, 10, 0).toISOString() }) // 今天 10:00 已过
    const s = scoreTask(expired, null, SETTINGS, afternoon)
    expect(s.urgency).toBe(1)
    expect(s.deadlineRisk).toBe(1)
  })
})

describe('reschedule', () => {
  it('不可拆任务整块排入,不碎片化', () => {
    const task = flexTask({ duration_minutes: 120, minimum_block_minutes: 90 })
    const { schedule } = reschedule([task], [], {}, SETTINGS, NOW)
    expect(slotTimes(schedule, TODAY)).toEqual([['09:00', '11:00']])
  })

  it('可拆任务拆成两块且块间留 15 分钟缓冲', () => {
    const task = flexTask({ duration_minutes: 200, splittable: true, minimum_block_minutes: 30 })
    const { schedule } = reschedule([task], [], {}, SETTINGS, NOW)
    expect(slotTimes(schedule, TODAY)).toEqual([
      ['09:00', '10:40'],
      ['10:55', '12:35'],
    ])
  })

  it('两个短任务之间也有缓冲', () => {
    const a = flexTask({ id: 'a', duration_minutes: 60 })
    const b = flexTask({ id: 'b', duration_minutes: 60 })
    const { schedule } = reschedule([a, b], [], {}, SETTINGS, NOW)
    expect(slotTimes(schedule, TODAY)).toEqual([
      ['09:00', '10:00'],
      ['10:15', '11:15'],
    ])
  })

  it('避开 fixed 事件', () => {
    const fixed = fixedToday('11:00', '12:00')
    const task = flexTask({ duration_minutes: 120 })
    const { schedule } = reschedule([fixed, task], [], {}, SETTINGS, NOW)
    expect(slotTimes(schedule, TODAY)).toEqual([['09:00', '11:00']])
  })

  it('受 fill_ratio 限制,放不下的任务顺延到第二天', () => {
    const a = flexTask({ duration_minutes: 300 })
    const b = flexTask({ duration_minutes: 300 })
    const { schedule } = reschedule([a, b], [], {}, SETTINGS, NOW)
    // 690min × 0.78 ≈ 538min,一天只装得下一个 300min 任务
    expect((schedule[TODAY] ?? []).length).toBe(1)
    expect((schedule[TOMORROW] ?? []).length).toBe(1)
    const ids = [...(schedule[TODAY] ?? []), ...(schedule[TOMORROW] ?? [])].map((s) => s.taskId)
    expect(new Set(ids).size).toBe(2)
  })

  it('预计完成超过截止时间时给出警告', () => {
    const fixed = fixedToday('09:00', '17:00')
    const task = flexTask({
      duration_minutes: 120,
      deadline: new Date(2026, 7, 12, 18, 0).toISOString(),
    })
    const { schedule, warnings } = reschedule([fixed, task], [], {}, SETTINGS, NOW)
    // 唯一空隙 17:00-20:30,排 17:00-19:00,晚于 18:00 截止
    expect(slotTimes(schedule, TODAY)).toEqual([['17:00', '19:00']])
    expect(warnings.some((w) => w.taskId === task.id && w.message.includes('超过截止'))).toBe(true)
  })

  it('保留今天已过去的时间块,重排未来的块', () => {
    const now = new Date(2026, 7, 12, 16, 0) // 16:00
    const existing: Schedule = {
      [TODAY]: [
        { taskId: 'past', start: '09:00', end: '10:00' },
        { taskId: 'future', start: '18:00', end: '19:00' },
      ],
    }
    const task = flexTask({ duration_minutes: 60 })
    const { schedule } = reschedule([task], [], existing, SETTINGS, now)
    const today = schedule[TODAY] ?? []
    expect(today.some((s) => s.taskId === 'past' && s.start === '09:00')).toBe(true)
    expect(today.some((s) => s.taskId === 'future')).toBe(false)
    // 新块只能从 16:00 之后开始
    const newSlot = today.find((s) => s.taskId === task.id)
    expect(newSlot).toBeDefined()
    expect(newSlot!.start >= '16:00').toBe(true)
  })
})

describe('insertTaskIncrementally', () => {
  it('只填空隙,不打扰已有安排', () => {
    const existing: Schedule = {
      [TODAY]: [{ taskId: 'a', start: '09:00', end: '11:00' }],
    }
    const b = flexTask({ id: 'b', duration_minutes: 60 })
    const { schedule, placed } = insertTaskIncrementally(b, existing, [b], SETTINGS, NOW)
    expect(placed).toEqual([{ taskId: 'b', start: '11:15', end: '12:15' }])
    expect(schedule[TODAY].some((s) => s.taskId === 'a' && s.start === '09:00' && s.end === '11:00')).toBe(true)
  })

  it('当天已满时顺延到之后的日子', () => {
    // 用 fixed 事件占满大半白天,剩余空隙与容量都不足以放下 120min
    const fixed = fixedToday('09:00', '19:30')
    const b = flexTask({ id: 'b', duration_minutes: 120 })
    const { schedule, placed } = insertTaskIncrementally(b, {}, [fixed, b], SETTINGS, NOW)
    expect(placed).toEqual([{ taskId: 'b', start: '09:00', end: '11:00' }])
    expect(schedule[TODAY]).toBeUndefined()
    expect(slotTimes(schedule, TOMORROW)).toEqual([['09:00', '11:00']])
  })
})

describe('slot 手动编辑', () => {
  const a = flexTask({ id: 'a', duration_minutes: 60 })
  const b = flexTask({ id: 'b', title: '任务B', duration_minutes: 60 })
  const sched: Schedule = {
    [TODAY]: [
      { taskId: 'a', start: '09:00', end: '10:00' },
      { taskId: 'b', start: '10:00', end: '11:00' },
    ],
  }

  it('updateSlot 修改时间块并按开始时间排序', () => {
    const next = updateSlot(sched, TODAY, 'a', '09:00', '13:00', '14:30', [a, b])
    expect(next).not.toBeNull()
    expect(next![TODAY].map((s) => [s.taskId, s.start, s.end])).toEqual([
      ['b', '10:00', '11:00'],
      ['a', '13:00', '14:30'],
    ])
  })

  it('updateSlot 与其他安排冲突时返回 null', () => {
    expect(updateSlot(sched, TODAY, 'a', '09:00', '10:30', '11:30', [a, b])).toBeNull()
  })

  it('updateSlot 需避开 fixed 事件', () => {
    const fixed = fixedToday('12:00', '13:00')
    expect(updateSlot(sched, TODAY, 'a', '09:00', '12:30', '13:30', [a, b, fixed])).toBeNull()
    expect(updateSlot(sched, TODAY, 'a', '09:00', '11:00', '12:00', [a, b, fixed])).not.toBeNull()
  })

  it('findConflict 返回冲突块描述,无冲突为 null', () => {
    expect(findConflict([a, b], sched, TODAY, 'a', 9 * 60 + 30, 10 * 60 + 30)).toContain('任务B')
    expect(findConflict([a, b], sched, TODAY, 'a', 11 * 60, 12 * 60)).toBeNull()
  })

  it('deleteSlot 只删指定的块', () => {
    const next = deleteSlot(sched, TODAY, 'a', '09:00')
    expect(next[TODAY]).toEqual([{ taskId: 'b', start: '10:00', end: '11:00' }])
    expect(sched[TODAY].length).toBe(2) // 原对象不变
  })

  it('removeAllSlots 清理所有日期的该任务', () => {
    const multi: Schedule = {
      [TODAY]: sched[TODAY],
      [TOMORROW]: [{ taskId: 'a', start: '09:00', end: '10:00' }],
    }
    const next = removeAllSlots(multi, 'a')
    expect(next[TODAY].length).toBe(1)
    expect(next[TOMORROW]).toBeUndefined()
  })
})

describe('insertTaskAtTime(点击空白处快速安排)', () => {
  it('锚点空闲时,任务从指定时刻开始', () => {
    const t = flexTask({ duration_minutes: 60 })
    const { schedule, anchored } = insertTaskAtTime(t, {}, [t], SETTINGS, NOW, 14 * 60)
    expect(anchored).toBe(true)
    expect(slotTimes(schedule, TODAY)).toEqual([['14:00', '15:00']])
  })

  it('锚点与固定事件冲突时,退回增量插入(从最早的空闲时间开始)', () => {
    const fixed = fixedToday('14:00', '15:30')
    const t = flexTask({ duration_minutes: 60 })
    const { schedule, anchored } = insertTaskAtTime(t, {}, [fixed, t], SETTINGS, NOW, 14 * 60)
    expect(anchored).toBe(false)
    expect(slotTimes(schedule, TODAY)).toEqual([['09:00', '10:00']])
  })

  it('锚点在今天已过去的时刻时,退回增量插入且不会排到过去', () => {
    const afternoon = new Date(2026, 7, 12, 15, 0) // 15:00
    const t = flexTask({ duration_minutes: 60 })
    const { schedule, anchored } = insertTaskAtTime(t, {}, [t], SETTINGS, afternoon, 10 * 60) // 点击 10:00
    expect(anchored).toBe(false)
    const slots = schedule[dateKey(afternoon)] ?? []
    expect(slots.length).toBeGreaterThan(0)
    for (const s of slots) expect(Number(s.start.slice(0, 2)) * 60 + Number(s.start.slice(3))).toBeGreaterThanOrEqual(15 * 60)
  })
})

describe('topTasks', () => {
  it('返回分数最高的前三个任务', () => {
    const urgent = flexTask({
      id: 'urgent',
      deadline: new Date(2026, 7, 12, 18, 0).toISOString(),
      importance: 5,
      blocking: true,
    })
    const mid = flexTask({ id: 'mid', deadline: new Date(2026, 7, 14, 18, 0).toISOString() })
    const low = flexTask({ id: 'low' })
    const low2 = flexTask({ id: 'low2' })
    const top = topTasks([low, urgent, mid, low2], [], SETTINGS, NOW, 3)
    expect(top.map((t) => t.id)).toEqual(['urgent', 'mid', 'low'])
  })
})

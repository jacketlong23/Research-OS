import { useState } from 'react'
import { useProjectsStore, useScheduleStore, useTasksStore } from '../store'
import { deleteSlot, findConflict, removeAllSlots, removeFutureSlots, updateSlot } from '../engine/scheduler'
import { colorClasses } from '../lib/colors'
import { fmtDeadlineRelative, fmtDuration, hhmmToMinutes } from '../lib/time'
import { useNow } from '../lib/useNow'

interface Props {
  /** 被编辑块所在的日期 */
  dateKey: string
  taskId: string
  /** flexible 任务:要编辑的时间块开始时间(HH:mm);fixed 任务不传 */
  slotStart?: string
  onClose: () => void
}

const inputCls =
  'w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 px-3 py-2 text-sm text-slate-800 dark:text-slate-200 outline-none transition focus:border-cyan-600'

export default function TaskBlockEditor({ dateKey, taskId, slotStart, onClose }: Props) {
  const tasks = useTasksStore((s) => s.tasks)
  const updateTask = useTasksStore((s) => s.updateTask)
  const deleteTask = useTasksStore((s) => s.deleteTask)
  const projects = useProjectsStore((s) => s.projects)
  const schedule = useScheduleStore((s) => s.schedule)
  const setSchedule = useScheduleStore((s) => s.setSchedule)
  const now = useNow(300000)

  const task = tasks.find((t) => t.id === taskId)
  const proj = projects.find((p) => p.id === task?.project_id) ?? null
  const c = colorClasses(proj?.color)
  const slot = slotStart ? (schedule[dateKey] ?? []).find((s) => s.taskId === taskId && s.start === slotStart) : undefined

  const [title, setTitle] = useState(task?.title ?? '')
  const [start, setStart] = useState(task?.type === 'fixed' ? (task.start ?? '09:00') : (slot?.start ?? '09:00'))
  const [end, setEnd] = useState(task?.type === 'fixed' ? (task.end ?? '10:00') : (slot?.end ?? '10:00'))
  const [err, setErr] = useState('')

  if (!task) return null

  const saveTitle = () => {
    const v = title.trim()
    if (v && v !== task.title) updateTask(task.id, { title: v })
  }

  const saveTimes = () => {
    setErr('')
    if (hhmmToMinutes(end) <= hhmmToMinutes(start)) {
      setErr('结束时间必须晚于开始时间')
      return
    }
    if (task.type === 'fixed') {
      const conflict = findConflict(tasks, schedule, dateKey, task.id, hhmmToMinutes(start), hhmmToMinutes(end))
      if (conflict) {
        setErr(`与${conflict}重叠`)
        return
      }
      updateTask(task.id, { start, end })
    } else {
      if (!slot) {
        setErr('找不到该时间块,可能刚被重排,请关闭后重试')
        return
      }
      const next = updateSlot(schedule, dateKey, task.id, slot.start, start, end, tasks)
      if (!next) {
        setErr('保存失败:该时间段与其他安排重叠')
        return
      }
      setSchedule(next)
    }
    onClose()
  }

  const complete = () => {
    updateTask(task.id, { status: 'done', completed_at: new Date().toISOString() })
    setSchedule(removeFutureSlots(schedule, task.id, now))
    onClose()
  }

  const removeBlock = () => {
    if (!slot) return
    setSchedule(deleteSlot(schedule, dateKey, task.id, slot.start))
    onClose()
  }

  const removeTask = () => {
    if (!confirm(`删除任务「${task.title}」及其所有时间安排?`)) return
    deleteTask(task.id)
    setSchedule(removeAllSlots(schedule, task.id))
    onClose()
  }

  const chunkLen = hhmmToMinutes(end) - hhmmToMinutes(start)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 animate-fade-in sm:items-center" onClick={onClose}>
      <div
        className="w-full max-w-md space-y-4 rounded-2xl border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 p-4 shadow-2xl animate-sheet-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
            <span className={`h-2.5 w-2.5 rounded-full ${c.dot}`} />
            编辑任务 · {dateKey}
          </h3>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-slate-500 transition hover:text-slate-800 hover:dark:text-slate-200" title="关闭">
            ✕
          </button>
        </div>

        <div>
          <label className="mb-1 block text-xs text-slate-500">任务名称</label>
          <input
            className={inputCls}
            value={title}
            autoFocus
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => e.key === 'Enter' && saveTitle()}
          />
        </div>

        <div className="rounded-lg bg-slate-200/50 dark:bg-slate-800/50 px-3 py-2 text-[11px] leading-5 text-slate-600 dark:text-slate-400">
          <p>
            {proj?.name ?? (task.type === 'fixed' ? '固定事件' : '收件箱')} · 任务总时长 {fmtDuration(task.duration_minutes)} · 截止{' '}
            {fmtDeadlineRelative(task.deadline, now)}
          </p>
          {task.type === 'fixed' && (
            <p className="text-slate-500">固定事件:修改时间对所有重复日生效,不会被自动排程移动</p>
          )}
          {task.type === 'flexible' && slot && (
            <p className="text-slate-500">该时间块 {fmtDuration(chunkLen)};修改只影响 {dateKey} 这一天</p>
          )}
        </div>

        <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
          <div>
            <label className="mb-1 block text-xs text-slate-500">开始</label>
            <input type="time" className={inputCls} value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">结束</label>
            <input type="time" className={inputCls} value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <button
            onClick={saveTimes}
            className="h-[38px] rounded-lg bg-cyan-600 px-3 text-sm font-medium text-white transition hover:bg-cyan-500"
          >
            保存
          </button>
        </div>
        {err && <p className="text-xs text-rose-600 dark:text-rose-400">{err}</p>}

        <div className="grid grid-cols-3 gap-2 border-t border-slate-200 dark:border-slate-800 pt-3">
          {task.status !== 'done' && (
            <button
              onClick={complete}
              className="rounded-lg border border-emerald-300 dark:border-emerald-800 py-2 text-xs text-emerald-600 dark:text-emerald-400 transition hover:bg-emerald-100/40 hover:dark:bg-emerald-950/40"
            >
              ✓ 标记完成
            </button>
          )}
          {task.type === 'flexible' && slot && (
            <button
              onClick={removeBlock}
              className="rounded-lg border border-slate-300 dark:border-slate-700 py-2 text-xs text-slate-600 dark:text-slate-400 transition hover:text-slate-800 hover:dark:text-slate-200"
            >
              移除此时间块
            </button>
          )}
          <button
            onClick={removeTask}
            className="rounded-lg border border-rose-200 dark:border-rose-900 py-2 text-xs text-rose-600 dark:text-rose-400 transition hover:bg-rose-100/40 hover:dark:bg-rose-950/40"
          >
            删除任务
          </button>
        </div>
      </div>
    </div>
  )
}

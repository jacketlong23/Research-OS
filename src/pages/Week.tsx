import { useState } from 'react'
import { useProjectsStore, useScheduleStore, useSettingsStore, useTasksStore } from '../store'
import { dayTimeline, moveTaskDay } from '../engine/scheduler'
import { colorClasses } from '../lib/colors'
import { addDays, dateKey, fmtCnDate, hhmmToMinutes, minutesToHHmm, startOfWeek, WEEKDAY_NAMES } from '../lib/time'
import { useNow } from '../lib/useNow'
import TaskBlockEditor from '../components/TaskBlockEditor'

const PX_PER_MIN = 0.9

export default function Week() {
  const tasks = useTasksStore((s) => s.tasks)
  const projects = useProjectsStore((s) => s.projects)
  const schedule = useScheduleStore((s) => s.schedule)
  const setSchedule = useScheduleStore((s) => s.setSchedule)
  const settings = useSettingsStore((s) => s.settings)

  const now = useNow(60000)
  const [weekOffset, setWeekOffset] = useState(0)
  const [dragOver, setDragOver] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ dateKey: string; taskId: string; slotStart?: string } | null>(null)

  const weekStart = addDays(startOfWeek(now), weekOffset * 7)
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const todayKey = dateKey(now)

  const ws = hhmmToMinutes(settings.work_start)
  const we = hhmmToMinutes(settings.work_end)
  const hours: number[] = []
  for (let h = Math.floor(ws / 60); h <= Math.floor(we / 60); h++) hours.push(h * 60)

  const projectOf = (id: string | null) => projects.find((p) => p.id === id) ?? null

  /** 该日截止的未完成任务 → deadline 旗标 */
  const deadlinesOn = (day: Date) =>
    tasks.filter((t) => t.status !== 'done' && t.deadline && dateKey(new Date(t.deadline)) === dateKey(day))

  const onDrop = (toKey: string, taskId: string, fromKey: string) => {
    setDragOver(null)
    if (toKey === fromKey) return
    const next = moveTaskDay(schedule, taskId, fromKey, toKey, tasks)
    if (!next) {
      alert('目标日期该时间段已有安排(或与固定事件冲突)')
      return
    }
    setSchedule(next)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setWeekOffset((v) => v - 1)}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-400 hover:text-slate-200"
        >
          ← 上一周
        </button>
        <h2 className="text-sm font-semibold text-slate-300">
          {fmtCnDate(weekStart)} – {fmtCnDate(addDays(weekStart, 6))} {weekOffset === 0 && <span className="text-cyan-400">(本周)</span>}
        </h2>
        <button
          onClick={() => setWeekOffset((v) => v + 1)}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-400 hover:text-slate-200"
        >
          下一周 →
        </button>
      </div>
      <p className="text-xs text-slate-500">
        点击时间块可编辑时间/名称;拖拽可移动到其他日期;虚线框为固定事件;旗标 ⚑ 为该日截止的任务。
      </p>

      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/60 p-3">
        <div className="flex min-w-[760px]">
          {/* 时间列 */}
          <div className="relative w-11 shrink-0" style={{ height: (we - ws) * PX_PER_MIN }}>
            {hours.map((m) => (
              <span
                key={m}
                className="absolute right-1 -translate-y-1/2 text-[10px] text-slate-600"
                style={{ top: (m - ws) * PX_PER_MIN }}
              >
                {minutesToHHmm(m)}
              </span>
            ))}
          </div>

          {/* 7 天列 */}
          {days.map((day) => {
            const key = dateKey(day)
            const items = dayTimeline(tasks, schedule, day)
            const dls = deadlinesOn(day)
            const isToday = key === todayKey
            return (
              <div
                key={key}
                className={`min-w-0 flex-1 rounded-lg ${isToday ? 'bg-cyan-950/20 ring-1 ring-cyan-900/60' : ''} ${
                  dragOver === key ? 'outline outline-1 outline-cyan-500/60' : ''
                }`}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOver(key)
                }}
                onDragLeave={() => setDragOver((v) => (v === key ? null : v))}
                onDrop={(e) => {
                  e.preventDefault()
                  const taskId = e.dataTransfer.getData('text/taskId')
                  const fromKey = e.dataTransfer.getData('text/fromKey')
                  onDrop(key, taskId, fromKey)
                }}
              >
                {/* 表头:星期 + 日期 + deadline 旗标 */}
                <div className="border-b border-slate-800 px-1 pb-1 pt-0.5 text-center">
                  <p className={`text-xs font-semibold ${isToday ? 'text-cyan-400' : 'text-slate-400'}`}>
                    {WEEKDAY_NAMES[(day.getDay() + 6) % 7]}
                  </p>
                  <p className="text-[10px] text-slate-600">{day.getDate()}日</p>
                  {dls.length > 0 && (
                    <div className="mt-0.5 space-y-px" title={dls.map((t) => t.title).join('\n')}>
                      {dls.slice(0, 2).map((t) => (
                        <p key={t.id} className="truncate text-[9px] text-rose-400/90">
                          ⚑ {t.title}
                        </p>
                      ))}
                      {dls.length > 2 && <p className="text-[9px] text-rose-400/70">⚑ +{dls.length - 2} 个截止</p>}
                    </div>
                  )}
                </div>

                {/* 网格 */}
                <div className="relative" style={{ height: (we - ws) * PX_PER_MIN }}>
                  {hours.map((m) => (
                    <div key={m} className="h-px bg-slate-800/60" style={{ position: 'absolute', top: (m - ws) * PX_PER_MIN, left: 0, right: 0 }} />
                  ))}

                  {items.map((item, idx) => {
                    const proj = projectOf(item.task.project_id)
                    const c = colorClasses(item.kind === 'fixed' ? 'slate' : proj?.color)
                    const draggable = item.kind === 'flexible' && item.task.status !== 'done'
                    return (
                      <div
                        key={idx}
                        draggable={draggable}
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/taskId', item.task.id)
                          e.dataTransfer.setData('text/fromKey', key)
                          e.dataTransfer.effectAllowed = 'move'
                        }}
                        onClick={() =>
                          setEditing({
                            dateKey: key,
                            taskId: item.task.id,
                            slotStart: item.kind === 'flexible' ? minutesToHHmm(item.start) : undefined,
                          })
                        }
                        className={`absolute left-0.5 right-0.5 overflow-hidden rounded border px-1 py-0.5 transition hover:brightness-125 ${c.block} ${
                          item.kind === 'fixed' ? 'border-dashed' : ''
                        } ${draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} ${
                          item.task.status === 'done' ? 'opacity-40' : ''
                        }`}
                        style={{
                          top: (item.start - ws) * PX_PER_MIN + 1,
                          height: Math.max((item.end - item.start) * PX_PER_MIN - 2, 14),
                        }}
                        title={`${item.task.title} ${minutesToHHmm(item.start)}–${minutesToHHmm(item.end)}(点击编辑,拖拽移动)`}
                      >
                        <p className="truncate text-[10px] font-medium leading-3.5">{item.task.title}</p>
                        {item.end - item.start >= 60 && (
                          <p className="truncate text-[9px] leading-3 opacity-70">{minutesToHHmm(item.start)}–{minutesToHHmm(item.end)}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {editing && (
        <TaskBlockEditor
          dateKey={editing.dateKey}
          taskId={editing.taskId}
          slotStart={editing.slotStart}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

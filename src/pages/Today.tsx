import { useEffect, useRef, useState } from 'react'
import { useProjectsStore, useScheduleStore, useSettingsStore, useTasksStore } from '../store'
import {
  dayTimeline,
  freeGaps,
  removeFutureSlots,
  reschedule,
  topTasks,
  unscheduledFlexible,
  type Warning,
} from '../engine/scheduler'
import { colorClasses } from '../lib/colors'
import { dateKey, fmtCnDate, fmtDeadlineRelative, fmtDuration, hhmmToMinutes, minutesOfDay, minutesToHHmm } from '../lib/time'
import { useNow } from '../lib/useNow'
import { explainRecommendation } from '../ai/client'
import TaskForm from '../components/TaskForm'
import TaskBlockEditor from '../components/TaskBlockEditor'

const PX_PER_MIN = 1.15

export default function Today() {
  const tasks = useTasksStore((s) => s.tasks)
  const updateTask = useTasksStore((s) => s.updateTask)
  const projects = useProjectsStore((s) => s.projects)
  const schedule = useScheduleStore((s) => s.schedule)
  const setSchedule = useScheduleStore((s) => s.setSchedule)
  const settings = useSettingsStore((s) => s.settings)

  const now = useNow(30000)
  const todayKey = dateKey(now)
  const [showForm, setShowForm] = useState(false)
  const [placeAt, setPlaceAt] = useState<number | undefined>(undefined)
  const [editing, setEditing] = useState<{ taskId: string; slotStart?: string } | null>(null)
  const [warnings, setWarnings] = useState<Warning[]>([])
  const [explanation, setExplanation] = useState('')
  const [explaining, setExplaining] = useState(false)
  const autoRan = useRef(false)

  // 首次打开且今天还没有任何安排时,自动智能排程一次
  useEffect(() => {
    if (autoRan.current || schedule[todayKey] !== undefined) return
    autoRan.current = true
    const r = reschedule(tasks, projects, schedule, settings, now)
    setSchedule(r.schedule)
    setWarnings(r.warnings)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayKey])

  const items = dayTimeline(tasks, schedule, now)
  const ws = hhmmToMinutes(settings.work_start)
  const we = hhmmToMinutes(settings.work_end)
  const mins = minutesOfDay(now)
  const todayNow = new Date(now)

  const current = items.find((i) => i.start <= mins && i.end > mins)
  const next = items.find((i) => i.start > mins)

  const busyAll = items.map((i) => ({ start: i.start, end: i.end }))
  const remainMin = freeGaps(todayNow, busyAll, settings, now).reduce((a, g) => a + (g.end - g.start), 0)

  const big3 = topTasks(tasks, projects, settings, now, 3)
  const waiting = unscheduledFlexible(tasks, schedule, now)
  const projectOf = (id: string | null) => projects.find((p) => p.id === id) ?? null

  const handleReschedule = () => {
    const r = reschedule(tasks, projects, schedule, settings, now)
    setSchedule(r.schedule)
    setWarnings(r.warnings)
  }

  const handleExplain = async () => {
    setExplaining(true)
    setExplanation('')
    setExplanation(await explainRecommendation(big3, settings, now))
    setExplaining(false)
  }

  const completeTask = (taskId: string) => {
    updateTask(taskId, { status: 'done', completed_at: new Date().toISOString() })
    setSchedule(removeFutureSlots(schedule, taskId, now))
  }

  const hours: number[] = []
  for (let h = Math.floor(ws / 60); h <= Math.floor(we / 60); h++) hours.push(h * 60)

  const nowOffset = ((Math.min(Math.max(mins, ws), we) - ws) * PX_PER_MIN)

  return (
    <div className="animate-fade-in space-y-4">
      {/* 顶部状态卡 */}
      <section className="rounded-xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-900/40 p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-500">Today · {todayKey}</p>
            <h2 className="text-2xl font-bold text-slate-100">{fmtCnDate(now)}</h2>
          </div>
          <button
            onClick={handleReschedule}
            className="rounded-lg border border-cyan-700 bg-cyan-950/60 px-3 py-2 text-sm text-cyan-300 transition hover:bg-cyan-900/60"
          >
            🔄 智能重新安排
          </button>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-slate-800/60 p-2">
            <p className="text-xs text-slate-500">剩余可用</p>
            <p className="text-lg font-semibold text-cyan-400">{fmtDuration(remainMin)}</p>
          </div>
          <div className="rounded-lg bg-slate-800/60 p-2">
            <p className="text-xs text-slate-500">当前任务</p>
            <p className="truncate text-sm font-medium text-slate-200" title={current?.task.title}>
              {current ? `${current.task.title}` : '—'}
            </p>
            <p className="text-[11px] text-slate-500">{current ? `至 ${minutesToHHmm(current.end)}` : '空闲'}</p>
          </div>
          <div className="rounded-lg bg-slate-800/60 p-2">
            <p className="text-xs text-slate-500">下一任务</p>
            <p className="truncate text-sm font-medium text-slate-200" title={next?.task.title}>
              {next ? next.task.title : '—'}
            </p>
            <p className="text-[11px] text-slate-500">{next ? `${minutesToHHmm(next.start)} 开始` : '无'}</p>
          </div>
        </div>
      </section>

      {/* Big 3 */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-300">🎯 Today&apos;s Big 3</h3>
          {big3.length > 0 && (
            <button
              onClick={handleExplain}
              disabled={explaining}
              className="rounded-lg border border-cyan-700 bg-cyan-950/50 px-2.5 py-1 text-xs text-cyan-300 transition hover:bg-cyan-900/50 disabled:opacity-50"
            >
              {explaining ? 'AI 解读中…' : '🤖 AI 解读'}
            </button>
          )}
        </div>
        {big3.length === 0 ? (
          <p className="text-sm text-slate-500">没有待安排的科研任务,去任务页添加吧。</p>
        ) : (
          <>
            <ol className="space-y-1.5">
              {big3.map((t, i) => {
                const c = colorClasses(projectOf(t.project_id)?.color)
                return (
                  <li key={t.id} className="flex items-center gap-2 text-sm">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[11px] font-bold text-slate-400">
                      {i + 1}
                    </span>
                    <span className={`h-2 w-2 shrink-0 rounded-full ${c.dot}`} title={projectOf(t.project_id)?.name ?? '收件箱'} />
                    <span className="min-w-0 flex-1 truncate text-slate-200">{t.title}</span>
                    <span className="shrink-0 text-xs text-slate-500">{fmtDeadlineRelative(t.deadline, now)}</span>
                  </li>
                )
              })}
            </ol>
            {explanation && (
              <div className="animate-fade-in mt-3 whitespace-pre-wrap rounded-lg border border-cyan-900/40 bg-cyan-950/20 p-3 text-xs leading-5 text-slate-300">
                {explanation}
              </div>
            )}
          </>
        )}
      </section>

      {/* 新增任务 */}
      <section>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="w-full rounded-xl border border-dashed border-slate-700 py-2.5 text-sm text-slate-400 transition hover:border-cyan-700 hover:text-cyan-400"
        >
          {showForm ? '收起新增任务' : '+ 新任务'}
        </button>
        {showForm && (
          <div className="mt-3 animate-sheet-in">
            <TaskForm
              placeAtMinutes={placeAt}
              onDone={() => {
                setShowForm(false)
                setPlaceAt(undefined)
              }}
            />
          </div>
        )}
      </section>

      {/* 时间轴 */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-300">
          今日时间轴{' '}
          <span className="ml-1 text-xs font-normal text-slate-500">
            {settings.work_start}–{settings.work_end} · 点击时间块编辑 · 点击空白处在该时刻新建任务
          </span>
        </h3>
        <div
          className="relative select-none"
          style={{ height: (we - ws) * PX_PER_MIN }}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            const raw = ws + (e.clientY - rect.top) / PX_PER_MIN
            const snapped = Math.round(raw / 15) * 15
            setPlaceAt(Math.min(Math.max(snapped, ws), we - 60))
            setShowForm(true)
          }}
        >
          {hours.map((m) => (
            <div key={m} className="pointer-events-none absolute inset-x-0 flex items-center" style={{ top: (m - ws) * PX_PER_MIN }}>
              <span className="-translate-y-2 w-12 shrink-0 text-right text-[10px] text-slate-600">{minutesToHHmm(m)}</span>
              <div className="ml-2 h-px flex-1 bg-slate-800/80" />
            </div>
          ))}

          {/* 当前时间线 */}
          {mins >= ws && mins <= we && (
            <div className="pointer-events-none absolute inset-x-0 z-10 flex items-center" style={{ top: nowOffset }}>
              <span className="w-12 shrink-0 text-right text-[10px] font-bold text-rose-400">{minutesToHHmm(mins)}</span>
              <div className="now-line-pulse ml-1 h-1.5 w-1.5 rounded-full bg-rose-400 shadow-[0_0_6px_rgba(244,63,94,0.9)]" />
              <div className="h-px flex-1 bg-rose-500/70" />
            </div>
          )}

          {items.map((item, idx) => {
            const proj = projectOf(item.task.project_id)
            const c = colorClasses(item.kind === 'fixed' ? 'slate' : proj?.color)
            return (
              <div
                key={idx}
                onClick={(e) => {
                  e.stopPropagation()
                  setEditing({
                    taskId: item.task.id,
                    slotStart: item.kind === 'flexible' ? minutesToHHmm(item.start) : undefined,
                  })
                }}
                className={`absolute left-14 right-1 z-[5] cursor-pointer overflow-hidden rounded-lg border px-2 py-1 transition-all duration-150 hover:brightness-125 hover:ring-1 hover:ring-white/40 active:scale-[0.98] active:brightness-150 ${c.block} ${
                  item.kind === 'fixed' ? 'border-dashed' : ''
                } ${item.task.status === 'done' ? 'opacity-40' : ''}`}
                style={{
                  top: (item.start - ws) * PX_PER_MIN + 1,
                  height: Math.max((item.end - item.start) * PX_PER_MIN - 2, 18),
                }}
                title={`${item.task.title} ${minutesToHHmm(item.start)}–${minutesToHHmm(item.end)}(点击编辑)`}
              >
                <div className="flex items-center justify-between gap-1">
                  <p className="truncate text-xs font-medium leading-4">
                    {item.kind === 'fixed' && '📌 '}
                    {item.task.title}
                  </p>
                  {item.kind === 'flexible' && item.task.status !== 'done' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        completeTask(item.task.id)
                      }}
                      className="shrink-0 rounded px-1 text-[11px] text-slate-400 hover:bg-white/10 hover:text-emerald-300"
                      title="标记完成"
                    >
                      ✓
                    </button>
                  )}
                </div>
                {item.end - item.start >= 40 && (
                  <p className="truncate text-[10px] leading-4 opacity-70">
                    {minutesToHHmm(item.start)}–{minutesToHHmm(item.end)} · {proj?.name ?? (item.kind === 'fixed' ? '固定事件' : '收件箱')}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* 待安排与警告 */}
      {(waiting.length > 0 || warnings.length > 0) && (
        <section className="rounded-xl border border-amber-900/40 bg-amber-950/20 p-4">
          <h3 className="mb-2 text-sm font-semibold text-amber-300/90">⚠ 未安排 / 需注意</h3>
          <ul className="space-y-1.5">
            {warnings.map((w, i) => {
              const t = tasks.find((x) => x.id === w.taskId)
              if (!t) return null
              return (
                <li key={`w${i}`} className="flex items-center gap-2 text-sm text-amber-200/80">
                  <span>⚑</span>
                  <span className="min-w-0 flex-1 truncate">{t.title}</span>
                  <span className="shrink-0 text-xs text-amber-300/60">{w.message}</span>
                </li>
              )
            })}
            {waiting
              .filter((t) => !warnings.some((w) => w.taskId === t.id))
              .map((t) => (
                <li key={t.id} className="flex items-center gap-2 text-sm text-slate-400">
                  <span>◻</span>
                  <span className="min-w-0 flex-1 truncate">{t.title}</span>
                  <span className="shrink-0 text-xs text-slate-500">
                    {fmtDuration(t.duration_minutes)} · {fmtDeadlineRelative(t.deadline, now)}
                  </span>
                </li>
              ))}
          </ul>
        </section>
      )}

      {editing && (
        <TaskBlockEditor
          dateKey={todayKey}
          taskId={editing.taskId}
          slotStart={editing.slotStart}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

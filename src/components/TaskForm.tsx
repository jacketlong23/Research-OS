import { useState } from 'react'
import type { Task, TaskType } from '../types'
import { useProjectsStore, useScheduleStore, useSettingsStore, useTasksStore } from '../store'
import { insertTaskIncrementally } from '../engine/scheduler'
import { isoToLocalInput, localInputToISO } from '../lib/time'
import { parseTaskNL } from '../ai/client'

export interface TaskFormInitial {
  title?: string
  duration_minutes?: number
  deadline?: string | null
  importance?: number
  type?: TaskType
  splittable?: boolean
  blocking?: boolean
}

interface Props {
  initial?: TaskFormInitial
  onDone: () => void
}

const inputCls =
  'w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none transition focus:border-cyan-600'
const labelCls = 'mb-1 block text-xs text-slate-500'

export default function TaskForm({ initial, onDone }: Props) {
  const projects = useProjectsStore((s) => s.projects)
  const settings = useSettingsStore((s) => s.settings)
  const addTask = useTasksStore((s) => s.addTask)
  const tasks = useTasksStore((s) => s.tasks)
  const setSchedule = useScheduleStore((s) => s.setSchedule)
  const schedule = useScheduleStore((s) => s.schedule)

  const [nl, setNl] = useState('')
  const [parsing, setParsing] = useState(false)
  const [parseHint, setParseHint] = useState('')

  const [title, setTitle] = useState(initial?.title ?? '')
  const [projectId, setProjectId] = useState<string>('')
  const [duration, setDuration] = useState(initial?.duration_minutes ?? 60)
  const [deadline, setDeadline] = useState(isoToLocalInput(initial?.deadline ?? null))
  const [importance, setImportance] = useState(initial?.importance ?? 3)
  const [splittable, setSplittable] = useState(initial?.splittable ?? true)
  const [blocking, setBlocking] = useState(initial?.blocking ?? false)
  const [type, setType] = useState<TaskType>(initial?.type ?? 'flexible')

  // fixed 专属
  const [fixedDate, setFixedDate] = useState('')
  const [repeatDays, setRepeatDays] = useState<number[]>([]) // 0=周日…6=周六
  const [startTime, setStartTime] = useState('14:00')
  const [endTime, setEndTime] = useState('15:30')

  const handleParse = async () => {
    if (!nl.trim()) return
    setParsing(true)
    setParseHint('')
    const parsed = await parseTaskNL(nl.trim(), settings, new Date())
    setTitle(parsed.title)
    setDuration(parsed.duration_minutes)
    setDeadline(isoToLocalInput(parsed.deadline))
    setImportance(parsed.importance)
    setType(parsed.type)
    setBlocking(parsed.blocking)
    setParseHint(parsed.source === 'ai' ? 'AI 解析结果已填入,请确认' : '本地解析结果已填入,请确认')
    setParsing(false)
  }

  const submit = () => {
    if (!title.trim()) return
    const base = {
      title: title.trim(),
      project_id: projectId || null,
      duration_minutes: Math.max(15, duration),
      deadline: localInputToISO(deadline),
      importance,
      status: 'todo' as const,
      splittable: type === 'fixed' ? false : splittable,
      minimum_block_minutes: splittable ? 30 : Math.max(30, Math.min(duration, 150)),
      blocking,
      type,
    }
    let task: Task
    if (type === 'fixed') {
      task = addTask({
        ...base,
        fixed_date: fixedDate || undefined,
        repeat_weekdays: repeatDays.length > 0 ? repeatDays : undefined,
        start: startTime,
        end: endTime,
      })
    } else {
      task = addTask(base)
      const { schedule: next } = insertTaskIncrementally(task, schedule, [...tasks, task], settings, new Date())
      setSchedule(next)
    }
    onDone()
  }

  const toggleDay = (d: number) =>
    setRepeatDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]))

  return (
    <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div>
        <label className={labelCls}>⚡ 一句话创建(可选,AI/本地解析后填入表单)</label>
        <div className="flex gap-2">
          <input
            className={inputCls}
            placeholder="例:导师让我明天下午之前做一个结果图,大约需要 1 小时"
            value={nl}
            onChange={(e) => setNl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleParse()}
          />
          <button
            type="button"
            onClick={handleParse}
            disabled={parsing}
            className="shrink-0 rounded-lg border border-cyan-700 bg-cyan-950/50 px-3 py-2 text-sm text-cyan-300 transition hover:bg-cyan-900/50 disabled:opacity-50"
          >
            {parsing ? '解析中…' : '解析'}
          </button>
        </div>
        {parseHint && <p className="mt-1 text-xs text-cyan-500">{parseHint}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className={labelCls}>任务名称 *</label>
          <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="要做什么" />
        </div>
        <div>
          <label className={labelCls}>所属项目</label>
          <select className={inputCls} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">收件箱(无项目)</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>预计耗时(分钟)</label>
          <input
            type="number"
            min={15}
            step={15}
            className={inputCls}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value) || 60)}
          />
        </div>
        <div>
          <label className={labelCls}>截止时间</label>
          <input type="datetime-local" className={inputCls} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>重要度:{'★'.repeat(importance)}{'☆'.repeat(5 - importance)}</label>
          <input
            type="range"
            min={1}
            max={5}
            value={importance}
            onChange={(e) => setImportance(Number(e.target.value))}
            className="w-full accent-cyan-500"
          />
        </div>
        <div>
          <label className={labelCls}>类型</label>
          <select className={inputCls} value={type} onChange={(e) => setType(e.target.value as TaskType)}>
            <option value="flexible">弹性任务(自动排时间)</option>
            <option value="fixed">固定事件(上课/会议)</option>
          </select>
        </div>
        <div className="flex items-end gap-4 pb-1">
          {type === 'flexible' ? (
            <>
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-400">
                <input type="checkbox" checked={splittable} onChange={(e) => setSplittable(e.target.checked)} className="accent-cyan-500" />
                允许拆分
              </label>
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-400">
                <input type="checkbox" checked={blocking} onChange={(e) => setBlocking(e.target.checked)} className="accent-cyan-500" />
                阻塞后续
              </label>
            </>
          ) : (
            <p className="text-xs text-slate-600">固定事件不会被自动移动</p>
          )}
        </div>
      </div>

      {type === 'fixed' && (
        <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-800 p-3">
          <div>
            <label className={labelCls}>开始时间</label>
            <input type="time" className={inputCls} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>结束时间</label>
            <input type="time" className={inputCls} value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>一次性日期(可选)</label>
            <input type="date" className={inputCls} value={fixedDate} onChange={(e) => setFixedDate(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>每周重复(可选,0=周日)</label>
            <div className="flex flex-wrap gap-1">
              {['日', '一', '二', '三', '四', '五', '六'].map((d, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleDay(i)}
                  className={`h-7 w-7 rounded-full border text-xs transition ${
                    repeatDays.includes(i)
                      ? 'border-cyan-500 bg-cyan-500/20 text-cyan-300'
                      : 'border-slate-700 text-slate-500 hover:border-slate-500'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-400 transition hover:text-slate-200"
        >
          取消
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!title.trim()}
          className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-cyan-500 disabled:opacity-40"
        >
          添加并智能安排
        </button>
      </div>
    </div>
  )
}

import { useState } from 'react'
import type { Project, Task, TaskStatus } from '../types'
import { useProjectsStore, useScheduleStore, useTasksStore } from '../store'
import { removeAllSlots } from '../engine/scheduler'
import { colorClasses, COLOR_NAMES } from '../lib/colors'
import { fmtDeadlineRelative, fmtDuration, isoToLocalInput, localInputToISO } from '../lib/time'
import { useNow } from '../lib/useNow'
import TaskForm from '../components/TaskForm'

const inputCls =
  'w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none transition focus:border-cyan-600'

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: '待办',
  in_progress: '进行中',
  done: '已完成',
}

function TaskRow({ task }: { task: Task }) {
  const projects = useProjectsStore((s) => s.projects)
  const updateTask = useTasksStore((s) => s.updateTask)
  const deleteTask = useTasksStore((s) => s.deleteTask)
  const schedule = useScheduleStore((s) => s.schedule)
  const setSchedule = useScheduleStore((s) => s.setSchedule)
  const now = useNow(120000)
  const [open, setOpen] = useState(false)

  const proj = projects.find((p) => p.id === task.project_id) ?? null
  const c = colorClasses(proj?.color)

  const patch = (p: Partial<Task>) => updateTask(task.id, p)

  const handleDelete = () => {
    if (!confirm(`删除任务「${task.title}」?`)) return
    deleteTask(task.id)
    // 任务删除后时间块一起清掉,避免留下指向不存在任务的孤儿数据
    setSchedule(removeAllSlots(schedule, task.id))
  }

  return (
    <div className={`rounded-xl border bg-slate-900/60 ${task.status === 'done' ? 'border-slate-800/50 opacity-60' : 'border-slate-800'}`}>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          onClick={() =>
            patch(
              task.status === 'done'
                ? { status: 'todo', completed_at: null }
                : { status: 'done', completed_at: new Date().toISOString() },
            )
          }
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] transition ${
            task.status === 'done' ? 'border-emerald-500 bg-emerald-500/20 text-emerald-400' : 'border-slate-600 text-transparent hover:border-cyan-500'
          }`}
          title={task.status === 'done' ? '标记为未完成' : '标记完成'}
        >
          ✓
        </button>
        <span className={`h-2 w-2 shrink-0 rounded-full ${c.dot}`} />
        <button onClick={() => setOpen((v) => !v)} className="min-w-0 flex-1 text-left">
          <p className={`truncate text-sm ${task.status === 'done' ? 'text-slate-500 line-through' : 'text-slate-200'}`}>
            {task.type === 'fixed' && '📌 '}
            {task.title}
          </p>
          <p className="truncate text-[11px] text-slate-500">
            {proj?.name ?? '收件箱'} · {fmtDuration(task.duration_minutes)} · 截止 {fmtDeadlineRelative(task.deadline, now)} · {'★'.repeat(task.importance)}
            {task.blocking && <span className="ml-1 text-rose-400">阻塞</span>}
          </p>
        </button>
        <span className="shrink-0 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">{STATUS_LABEL[task.status]}</span>
      </div>

      {open && (
        <div className="space-y-3 border-t border-slate-800 p-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="mb-1 block text-xs text-slate-500">任务名称</label>
              <input className={inputCls} value={task.title} onChange={(e) => patch({ title: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">所属项目</label>
              <select className={inputCls} value={task.project_id ?? ''} onChange={(e) => patch({ project_id: e.target.value || null })}>
                <option value="">收件箱(无项目)</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">耗时(分钟)</label>
              <input
                type="number"
                min={15}
                step={15}
                className={inputCls}
                value={task.duration_minutes}
                onChange={(e) => patch({ duration_minutes: Number(e.target.value) || 60 })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">截止时间</label>
              <input
                type="datetime-local"
                className={inputCls}
                value={isoToLocalInput(task.deadline)}
                onChange={(e) => patch({ deadline: localInputToISO(e.target.value) })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">状态</label>
              <select
                className={inputCls}
                value={task.status}
                onChange={(e) => {
                  const status = e.target.value as TaskStatus
                  patch(
                    status === 'done'
                      ? { status, completed_at: task.completed_at ?? new Date().toISOString() }
                      : { status, completed_at: null },
                  )
                }}
              >
                <option value="todo">待办</option>
                <option value="in_progress">进行中</option>
                <option value="done">已完成</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">重要度:{task.importance}</label>
              <input
                type="range"
                min={1}
                max={5}
                value={task.importance}
                onChange={(e) => patch({ importance: Number(e.target.value) })}
                className="w-full accent-cyan-500"
              />
            </div>
            <div className="flex items-end gap-4 pb-1">
              {task.type === 'flexible' && (
                <>
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-400">
                    <input
                      type="checkbox"
                      checked={task.splittable}
                      onChange={(e) => patch({ splittable: e.target.checked })}
                      className="accent-cyan-500"
                    />
                    允许拆分
                  </label>
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-400">
                    <input
                      type="checkbox"
                      checked={task.blocking}
                      onChange={(e) => patch({ blocking: e.target.checked })}
                      className="accent-cyan-500"
                    />
                    阻塞后续
                  </label>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-slate-600">修改耗时/截止后,回今日页点「智能重新安排」生效</p>
            <button onClick={handleDelete} className="rounded-lg border border-rose-900 px-3 py-1.5 text-xs text-rose-400 transition hover:bg-rose-950/50">
              删除任务
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ProjectCard({ project }: { project: Project }) {
  const updateProject = useProjectsStore((s) => s.updateProject)
  const deleteProject = useProjectsStore((s) => s.deleteProject)
  const tasks = useTasksStore((s) => s.tasks)
  const [open, setOpen] = useState(false)
  const c = colorClasses(project.color)
  const active = tasks.filter((t) => t.project_id === project.id && t.status !== 'done').length

  const handleDelete = () => {
    if (!confirm(`删除项目「${project.name}」?其下任务会变为"收件箱"。`)) return
    deleteProject(project.id)
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-start justify-between gap-2 text-left">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${c.dot}`} />
            <h3 className="truncate text-sm font-semibold text-slate-200">{project.name}</h3>
            <span className="shrink-0 text-xs text-slate-500">{active} 个进行中</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
            <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${project.progress}%` }} />
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[11px]">
            <span className={c.text}>{project.progress}%</span>
            <span className="text-slate-600">优先级 P{project.priority}</span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
            <div>
              <p className="text-slate-500">当前</p>
              <p className="truncate text-slate-300" title={project.current_focus}>{project.current_focus || '—'}</p>
            </div>
            <div>
              <p className="text-slate-500">下一步</p>
              <p className="truncate text-slate-300" title={project.next_step}>{project.next_step || '—'}</p>
            </div>
          </div>
        </div>
      </button>

      {open && (
        <div className="mt-3 space-y-3 border-t border-slate-800 pt-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="mb-1 block text-xs text-slate-500">项目名称</label>
              <input className={inputCls} value={project.name} onChange={(e) => updateProject(project.id, { name: e.target.value })} />
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-xs text-slate-500">进度:{project.progress}%</label>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={project.progress}
                onChange={(e) => updateProject(project.id, { progress: Number(e.target.value) })}
                className="w-full accent-cyan-500"
              />
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-xs text-slate-500">当前焦点</label>
              <input
                className={inputCls}
                value={project.current_focus}
                onChange={(e) => updateProject(project.id, { current_focus: e.target.value })}
              />
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-xs text-slate-500">下一步</label>
              <input className={inputCls} value={project.next_step} onChange={(e) => updateProject(project.id, { next_step: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">优先级:{project.priority}</label>
              <input
                type="range"
                min={1}
                max={5}
                value={project.priority}
                onChange={(e) => updateProject(project.id, { priority: Number(e.target.value) })}
                className="w-full accent-cyan-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">主题色</label>
              <div className="flex gap-1.5">
                {COLOR_NAMES.map((name) => (
                  <button
                    key={name}
                    onClick={() => updateProject(project.id, { color: name })}
                    className={`h-6 w-6 rounded-full ${colorClasses(name).dot} ${project.color === name ? 'ring-2 ring-slate-300' : 'opacity-60'}`}
                    title={name}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-end">
            <button onClick={handleDelete} className="rounded-lg border border-rose-900 px-3 py-1.5 text-xs text-rose-400 transition hover:bg-rose-950/50">
              删除项目
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Tasks() {
  const tasks = useTasksStore((s) => s.tasks)
  const projects = useProjectsStore((s) => s.projects)
  const [tab, setTab] = useState<'tasks' | 'projects'>('tasks')
  const [showForm, setShowForm] = useState(false)

  const todo = tasks.filter((t) => t.status === 'todo')
  const doing = tasks.filter((t) => t.status === 'in_progress')
  const done = tasks.filter((t) => t.status === 'done')

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          onClick={() => setTab('tasks')}
          className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${tab === 'tasks' ? 'bg-cyan-950/60 text-cyan-300 ring-1 ring-cyan-800' : 'text-slate-400 hover:text-slate-200'}`}
        >
          任务({todo.length + doing.length})
        </button>
        <button
          onClick={() => setTab('projects')}
          className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${tab === 'projects' ? 'bg-cyan-950/60 text-cyan-300 ring-1 ring-cyan-800' : 'text-slate-400 hover:text-slate-200'}`}
        >
          项目({projects.length})
        </button>
      </div>

      {tab === 'tasks' ? (
        <>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="w-full rounded-xl border border-dashed border-slate-700 py-2.5 text-sm text-slate-400 transition hover:border-cyan-700 hover:text-cyan-400"
          >
            {showForm ? '收起新增任务' : '+ 新任务'}
          </button>
          {showForm && <TaskForm onDone={() => setShowForm(false)} />}

          {doing.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-cyan-500">进行中</h3>
              {doing.map((t) => (
                <TaskRow key={t.id} task={t} />
              ))}
            </section>
          )}

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">待办 · {todo.length}</h3>
            {todo.length === 0 && <p className="text-sm text-slate-600">暂无待办任务</p>}
            {todo.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </section>

          {done.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600">已完成 · {done.length}</h3>
              {done.map((t) => (
                <TaskRow key={t.id} task={t} />
              ))}
            </section>
          )}
        </>
      ) : (
        <section className="space-y-3">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
          <NewProject />
        </section>
      )}
    </div>
  )
}

function NewProject() {
  const addProject = useProjectsStore((s) => s.addProject)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')

  const submit = () => {
    if (!name.trim()) return
    addProject({
      name: name.trim(),
      progress: 0,
      current_focus: '',
      next_step: '',
      priority: 3,
      color: COLOR_NAMES[Math.floor(Math.random() * (COLOR_NAMES.length - 1))],
    })
    setName('')
    setOpen(false)
  }

  if (!open)
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-xl border border-dashed border-slate-700 py-2.5 text-sm text-slate-400 transition hover:border-cyan-700 hover:text-cyan-400"
      >
        + 新项目
      </button>
    )
  return (
    <div className="flex gap-2 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
      <input
        className={inputCls}
        placeholder="项目名称,如:REDACTED_RESEARCH_AREA REDACTED_RESEARCH_METHOD"
        value={name}
        autoFocus
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      <button onClick={submit} className="shrink-0 rounded-lg bg-cyan-600 px-4 text-sm font-medium text-white hover:bg-cyan-500">
        添加
      </button>
    </div>
  )
}

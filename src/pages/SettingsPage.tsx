import { useRef, useState } from 'react'
import type { DailyLog, Project, Schedule, Settings, Task } from '../types'
import {
  useDailyLogsStore,
  useProjectsStore,
  useScheduleStore,
  useSettingsStore,
  useTasksStore,
  resetToSeed,
} from '../store'
import { testAIConnection, type AITestResult } from '../ai/client'

const inputCls =
  'w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none transition focus:border-cyan-600'
const labelCls = 'mb-1 block text-xs text-slate-500'

interface Backup {
  version: 1
  exported_at: string
  projects: Project[]
  tasks: Task[]
  schedule: Schedule
  daily_logs: DailyLog[]
  settings: Settings
}

function exportData() {
  const backup: Backup = {
    version: 1,
    exported_at: new Date().toISOString(),
    projects: useProjectsStore.getState().projects,
    tasks: useTasksStore.getState().tasks,
    schedule: useScheduleStore.getState().schedule,
    daily_logs: useDailyLogsStore.getState().logs,
    settings: useSettingsStore.getState().settings,
  }
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `research-os-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export default function SettingsPage() {
  const settings = useSettingsStore((s) => s.settings)
  const update = useSettingsStore((s) => s.update)
  const fileRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<AITestResult | null>(null)

  const runTest = async () => {
    setTesting(true)
    setTestResult(null)
    const r = await testAIConnection(settings)
    setTestResult(r)
    setTesting(false)
  }

  const importData = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as Partial<Backup>
      if (!Array.isArray(data.projects) || !Array.isArray(data.tasks)) throw new Error('格式不对')
      useProjectsStore.getState().setProjects(data.projects)
      useTasksStore.getState().setTasks(data.tasks)
      useScheduleStore.getState().setSchedule(data.schedule ?? {})
      useDailyLogsStore.getState().setLogs(data.daily_logs ?? [])
      if (data.settings) useSettingsStore.getState().update(data.settings)
      setMsg('✅ 导入成功')
    } catch (e) {
      setMsg(`❌ 导入失败:${e instanceof Error ? e.message : '文件格式错误'}`)
    }
  }

  return (
    <div className="space-y-4">
      {/* 工作时间 */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-300">⏰ 工作时间与排程</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>开始时间</label>
            <input type="time" className={inputCls} value={settings.work_start} onChange={(e) => update({ work_start: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>结束时间</label>
            <input type="time" className={inputCls} value={settings.work_end} onChange={(e) => update({ work_end: e.target.value })} />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>
              每日自动排程上限:{Math.round(settings.fill_ratio * 100)}%(给临时任务和 Debug 留余量)
            </label>
            <input
              type="range"
              min={50}
              max={95}
              value={Math.round(settings.fill_ratio * 100)}
              onChange={(e) => update({ fill_ratio: Number(e.target.value) / 100 })}
              className="w-full accent-cyan-500"
            />
          </div>
          <div>
            <label className={labelCls}>任务间缓冲(分钟)</label>
            <input
              type="number"
              min={5}
              max={30}
              step={5}
              className={inputCls}
              value={settings.break_minutes}
              onChange={(e) => update({ break_minutes: Number(e.target.value) || 15 })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>深度块下限</label>
              <input
                type="number"
                min={30}
                max={120}
                step={15}
                className={inputCls}
                value={settings.deep_min_minutes}
                onChange={(e) => update({ deep_min_minutes: Number(e.target.value) || 90 })}
              />
            </div>
            <div>
              <label className={labelCls}>深度块上限</label>
              <input
                type="number"
                min={60}
                max={240}
                step={15}
                className={inputCls}
                value={settings.deep_max_minutes}
                onChange={(e) => update({ deep_max_minutes: Number(e.target.value) || 150 })}
              />
            </div>
          </div>
        </div>
      </section>

      {/* AI 配置 */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-300">🤖 AI 配置(OpenAI 兼容接口)</h3>
          <button
            onClick={runTest}
            disabled={testing}
            className="rounded-lg border border-cyan-700 bg-cyan-950/50 px-3 py-1.5 text-xs text-cyan-300 transition hover:bg-cyan-900/50 disabled:opacity-50"
          >
            {testing ? '测试中…' : '🔌 测试连接'}
          </button>
        </div>
        <p className="mb-3 text-[11px] text-slate-500">
          只用于:自然语言建任务、优先级解释、半月报草稿。不配置 Key 时全部功能自动降级,不影响使用。Key 只保存在本机浏览器。
        </p>
        {testResult && (
          <p className={`mb-3 rounded-lg px-3 py-2 text-xs ${testResult.ok ? 'bg-emerald-950/40 text-emerald-300' : 'bg-rose-950/40 text-rose-300'}`}>
            {testResult.ok ? '✅ ' : '❌ '}
            {testResult.message}
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Base URL</label>
            <input className={inputCls} value={settings.ai_base_url} onChange={(e) => update({ ai_base_url: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>模型</label>
            <input className={inputCls} value={settings.ai_model} onChange={(e) => update({ ai_model: e.target.value })} />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>API Key</label>
            <input
              type="password"
              className={inputCls}
              placeholder="sk-…"
              value={settings.ai_api_key}
              onChange={(e) => update({ ai_api_key: e.target.value })}
            />
          </div>
        </div>
      </section>

      {/* 数据 */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="mb-1 text-sm font-semibold text-slate-300">💾 数据</h3>
        <p className="mb-3 text-[11px] text-slate-500">所有数据保存在浏览器 localStorage,建议定期导出备份。</p>
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={exportData}
            className="rounded-lg border border-slate-700 py-2 text-sm text-slate-300 transition hover:border-cyan-600 hover:text-cyan-400"
          >
            导出 JSON
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="rounded-lg border border-slate-700 py-2 text-sm text-slate-300 transition hover:border-cyan-600 hover:text-cyan-400"
          >
            导入 JSON
          </button>
          <button
            onClick={() => {
              if (confirm('重置为示例数据?当前任务/项目/记录会被覆盖(AI 配置保留)。')) {
                resetToSeed()
                setMsg('✅ 已重置为示例数据')
              }
            }}
            className="rounded-lg border border-amber-900/60 py-2 text-sm text-amber-400/90 transition hover:bg-amber-950/40"
          >
            重置示例数据
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) importData(f)
            e.target.value = ''
          }}
        />
        {msg && <p className="mt-2 text-xs text-slate-400">{msg}</p>}
      </section>

      <p className="pb-2 text-center text-[11px] text-slate-600">Research OS · 科研驾驶舱 · 今天优先,整周辅助</p>
    </div>
  )
}

import { useRef, useState } from 'react'
import type { DailyLog, Project, Schedule, Settings, Task, WorkPeriod } from '../types'
import {
  migrateSettings,
  useDailyLogsStore,
  useProjectsStore,
  useScheduleStore,
  useSettingsStore,
  useTasksStore,
  resetToSeed,
} from '../store'
import { testAIConnection, type AITestResult } from '../ai/client'
import { hhmmToMinutes, uid } from '../lib/time'
import { applyTheme, getTheme, type Theme } from '../lib/theme'
import { APP_VERSION } from '../version'

const inputCls =
  'w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none transition focus:border-cyan-600'
const labelCls = 'mb-1 block text-xs text-slate-500'

/** 预置的三段工作时段(不可删除,只能启用/关闭/改时间) */
const BUILTIN_PERIOD_IDS = ['morning', 'afternoon', 'evening']

interface Backup {
  version: 1
  exported_at: string
  projects: Project[]
  tasks: Task[]
  schedule: Schedule
  daily_logs: DailyLog[]
  /** 导出永远不含 API Key */
  settings: Omit<Settings, 'ai_api_key'>
}

/** 校验工作时段:至少一个启用、end>start、启用时段互不重叠。返回错误描述或 null */
function validatePeriods(periods: WorkPeriod[]): string | null {
  if (periods.filter((p) => p.enabled).length === 0) return '至少保留一个启用的工作时段'
  for (const p of periods) {
    if (hhmmToMinutes(p.end) <= hhmmToMinutes(p.start)) {
      return `「${p.label || '未命名时段'}」的结束时间必须晚于开始时间`
    }
  }
  const enabled = periods
    .filter((p) => p.enabled)
    .sort((a, b) => hhmmToMinutes(a.start) - hhmmToMinutes(b.start))
  for (let i = 1; i < enabled.length; i++) {
    if (hhmmToMinutes(enabled[i].start) < hhmmToMinutes(enabled[i - 1].end)) {
      return `「${enabled[i - 1].label || '时段'}」与「${enabled[i].label || '时段'}」重叠,请调整`
    }
  }
  return null
}

/** 导出用:手动列出全部设置字段,唯独不包含 ai_api_key */
function settingsForExport(s: Settings): Omit<Settings, 'ai_api_key'> {
  return {
    work_periods: s.work_periods,
    fill_ratio: s.fill_ratio,
    break_minutes: s.break_minutes,
    deep_min_minutes: s.deep_min_minutes,
    deep_max_minutes: s.deep_max_minutes,
    ai_base_url: s.ai_base_url,
    ai_model: s.ai_model,
  }
}

function exportData() {
  const backup: Backup = {
    version: 1,
    exported_at: new Date().toISOString(),
    projects: useProjectsStore.getState().projects,
    tasks: useTasksStore.getState().tasks,
    schedule: useScheduleStore.getState().schedule,
    daily_logs: useDailyLogsStore.getState().logs,
    settings: settingsForExport(useSettingsStore.getState().settings),
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
  const [periodError, setPeriodError] = useState('')
  const [theme, setTheme] = useState<Theme>(getTheme())

  const changeTheme = (t: Theme) => {
    setTheme(t)
    applyTheme(t)
  }

  const runTest = async () => {
    setTesting(true)
    setTestResult(null)
    const r = await testAIConnection(settings)
    setTestResult(r)
    setTesting(false)
  }

  // ---------- 工作时段编辑 ----------
  const commitPeriods = (next: WorkPeriod[]) => {
    const err = validatePeriods(next)
    setPeriodError(err ?? '')
    if (!err) update({ work_periods: next })
  }

  const patchPeriod = (id: string, patch: Partial<WorkPeriod>) => {
    commitPeriods(settings.work_periods.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  }

  const addPeriod = () => {
    commitPeriods([
      ...settings.work_periods,
      { id: uid('period'), label: '', start: '18:00', end: '19:00', enabled: false },
    ])
  }

  const removePeriod = (id: string) => {
    commitPeriods(settings.work_periods.filter((p) => p.id !== id))
  }

  const importData = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as Partial<Backup>
      if (!Array.isArray(data.projects) || !Array.isArray(data.tasks)) throw new Error('格式不对')
      useProjectsStore.getState().setProjects(data.projects)
      useTasksStore.getState().setTasks(data.tasks)
      useScheduleStore.getState().setSchedule(data.schedule ?? {})
      useDailyLogsStore.getState().setLogs(data.daily_logs ?? [])
      if (data.settings) {
        // 先迁移旧版结构(work_start/work_end、旧模型名),再用当前 Key 覆盖,导入永不改动本机 Key
        const migrated = migrateSettings(data.settings)
        const currentKey = useSettingsStore.getState().settings.ai_api_key
        useSettingsStore.getState().update({ ...migrated, ai_api_key: currentKey })
      }
      setMsg('✅ 导入成功')
    } catch (e) {
      setMsg(`❌ 导入失败:${e instanceof Error ? e.message : '文件格式错误'}`)
    }
  }

  return (
    <div className="space-y-4">
      {/* 外观 */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="mb-1 text-sm font-semibold text-slate-300">🎨 外观</h3>
        <p className="mb-3 text-[11px] text-slate-500">选择页面配色主题,立即生效并自动保存。</p>
        <div className="flex gap-2">
          <button
            onClick={() => changeTheme('light')}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm transition ${
              theme === 'light'
                ? 'border-cyan-600 bg-cyan-950/50 text-cyan-300'
                : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200'
            }`}
          >
            ☀️ 亮色
          </button>
          <button
            onClick={() => changeTheme('dark')}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm transition ${
              theme === 'dark'
                ? 'border-cyan-600 bg-cyan-950/50 text-cyan-300'
                : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200'
            }`}
          >
            🌙 暗色
          </button>
        </div>
      </section>

      {/* 工作时段 */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="mb-1 text-sm font-semibold text-slate-300">⏰ 工作时段</h3>
        <p className="mb-3 text-[11px] text-slate-500">
          自动排程只会在「启用」的时段内安排任务;午休、晚间等未启用时段不会排入任务。
        </p>
        <div className="space-y-2">
          {settings.work_periods.map((p) => {
            const isBuiltin = BUILTIN_PERIOD_IDS.includes(p.id)
            return (
              <div key={p.id} className="flex items-center gap-2">
                <button
                  onClick={() => patchPeriod(p.id, { enabled: !p.enabled })}
                  className={`w-12 shrink-0 rounded-lg border px-1 py-1.5 text-xs transition ${
                    p.enabled
                      ? 'border-cyan-700 bg-cyan-950/50 text-cyan-300'
                      : 'border-slate-700 text-slate-500 hover:text-slate-300'
                  }`}
                  title={p.enabled ? '点击关闭' : '点击启用'}
                >
                  {p.enabled ? '启用' : '关闭'}
                </button>
                {isBuiltin ? (
                  <span className="w-12 shrink-0 text-sm text-slate-300">{p.label}</span>
                ) : (
                  <input
                    className="w-14 shrink-0 rounded-lg border border-slate-700 bg-slate-900 px-1.5 py-1.5 text-xs text-slate-200 outline-none transition focus:border-cyan-600"
                    value={p.label ?? ''}
                    placeholder="名称"
                    onChange={(e) => patchPeriod(p.id, { label: e.target.value })}
                  />
                )}
                <input
                  type="time"
                  className="w-28 shrink-0 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-200 outline-none transition focus:border-cyan-600"
                  value={p.start}
                  onChange={(e) => patchPeriod(p.id, { start: e.target.value })}
                />
                <span className="shrink-0 text-slate-600">—</span>
                <input
                  type="time"
                  className="w-28 shrink-0 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-200 outline-none transition focus:border-cyan-600"
                  value={p.end}
                  onChange={(e) => patchPeriod(p.id, { end: e.target.value })}
                />
                {!isBuiltin && (
                  <button
                    onClick={() => removePeriod(p.id)}
                    className="shrink-0 rounded-lg border border-rose-900/60 px-2 py-1.5 text-xs text-rose-400/90 transition hover:bg-rose-950/40"
                    title="删除该时段"
                  >
                    删除
                  </button>
                )}
              </div>
            )
          })}
        </div>
        <button
          onClick={addPeriod}
          className="mt-2 rounded-lg border border-dashed border-slate-700 px-3 py-1.5 text-xs text-slate-400 transition hover:border-cyan-700 hover:text-cyan-400"
        >
          + 添加工作时段
        </button>
        {periodError && <p className="mt-2 text-xs text-rose-400">{periodError}</p>}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={labelCls}>
              每日自动排程上限:{Math.round(settings.fill_ratio * 100)}%(占启用工作时段总长,给临时任务和 Debug 留余量)
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
          AI 功能为可选增强。API Key 仅保存在当前浏览器 localStorage 中,不会上传到 Research OS
          或 GitHub。未配置 API Key 时,系统自动使用本地规则。
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
            if (f && confirm('导入会覆盖当前全部数据(任务/项目/排程/记录/设置),确定继续?')) importData(f)
            e.target.value = ''
          }}
        />
        {msg && <p className="mt-2 text-xs text-slate-400">{msg}</p>}
      </section>

      <p className="pb-2 text-center text-[11px] text-slate-600">
        Research OS · 科研驾驶舱 v{APP_VERSION} · 今天优先,整周辅助
      </p>
    </div>
  )
}

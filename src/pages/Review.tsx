import { useMemo, useState } from 'react'
import { useDailyLogsStore, useProjectsStore, useSettingsStore, useTasksStore } from '../store'
import { draftBiweeklyReport, effectiveSettings } from '../ai/client'
import { addDays, dateKey, fmtDuration, startOfWeek } from '../lib/time'
import { useNow } from '../lib/useNow'

export default function Review() {
  const tasks = useTasksStore((s) => s.tasks)
  const projects = useProjectsStore((s) => s.projects)
  const logs = useDailyLogsStore((s) => s.logs)
  const upsertLog = useDailyLogsStore((s) => s.upsertLog)
  const settings = useSettingsStore((s) => s.settings)
  const now = useNow(120000)

  const todayKey = dateKey(now)
  const weekStart = startOfWeek(now)

  const doneTasks = tasks.filter((t) => t.status === 'done' && t.completed_at)
  const completedOn = (key: string) => doneTasks.filter((t) => dateKey(new Date(t.completed_at!)) === key)
  const minutesOf = (list: typeof doneTasks) => list.reduce((a, t) => a + t.duration_minutes, 0)

  const todayDone = completedOn(todayKey)
  const weekDone = doneTasks.filter((t) => new Date(t.completed_at!) >= weekStart)

  const last15 = useMemo(() => {
    return Array.from({ length: 15 }, (_, i) => {
      const day = addDays(now, -(14 - i))
      const key = dateKey(day)
      const list = completedOn(key)
      return { key, day, count: list.length, minutes: minutesOf(list) }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, todayKey])
  const maxMinutes = Math.max(60, ...last15.map((d) => d.minutes))

  // ---- Daily Log ----
  const todayLog = logs.find((l) => l.date === todayKey)
  const autoCompleted = todayDone.map((t) => t.title)
  const [completedText, setCompletedText] = useState((todayLog?.completed.length ? todayLog.completed : autoCompleted).join('\n'))
  const [problemsText, setProblemsText] = useState((todayLog?.problems ?? []).join('\n'))
  const [nextText, setNextText] = useState((todayLog?.next ?? []).join('\n'))

  const saveLog = () => {
    const toLines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean)
    upsertLog({
      date: todayKey,
      completed: toLines(completedText),
      problems: toLines(problemsText),
      next: toLines(nextText),
    })
    alert('今日记录已保存')
  }

  // ---- 半月报 ----
  const halfStart = now.getDate() <= 15 ? new Date(now.getFullYear(), now.getMonth(), 1) : new Date(now.getFullYear(), now.getMonth(), 16)
  const halfEnd =
    now.getDate() <= 15
      ? new Date(now.getFullYear(), now.getMonth(), 15)
      : new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const rangeLogs = logs.filter((l) => l.date >= dateKey(halfStart) && l.date <= dateKey(halfEnd))
  const rangeDone = doneTasks.filter((t) => {
    const k = dateKey(new Date(t.completed_at!))
    return k >= dateKey(halfStart) && k <= dateKey(halfEnd)
  })

  const [report, setReport] = useState('')
  const [generating, setGenerating] = useState(false)
  const generate = async () => {
    setGenerating(true)
    const draft = await draftBiweeklyReport(
      {
        logs: rangeLogs,
        doneTasks: rangeDone,
        projects,
        rangeStart: dateKey(halfStart),
        rangeEnd: dateKey(halfEnd),
      },
      settings,
    )
    setReport(draft)
    setGenerating(false)
  }

  const areaCls =
    'w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none transition focus:border-cyan-600'

  return (
    <div className="space-y-4">
      {/* 统计 */}
      <section className="grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-center">
          <p className="text-xs text-slate-500">今日完成</p>
          <p className="text-xl font-bold text-emerald-400">{todayDone.length}</p>
          <p className="text-[11px] text-slate-500">{fmtDuration(minutesOf(todayDone))}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-center">
          <p className="text-xs text-slate-500">本周完成</p>
          <p className="text-xl font-bold text-cyan-400">{weekDone.length}</p>
          <p className="text-[11px] text-slate-500">{fmtDuration(minutesOf(weekDone))}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-center">
          <p className="text-xs text-slate-500">半月完成</p>
          <p className="text-xl font-bold text-violet-400">{rangeDone.length}</p>
          <p className="text-[11px] text-slate-500">{fmtDuration(minutesOf(rangeDone))}</p>
        </div>
      </section>

      {/* 最近 15 天 */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-300">最近 15 天科研投入</h3>
        <div className="flex h-24 items-end gap-1">
          {last15.map((d) => (
            <div key={d.key} className="group relative flex-1" title={`${d.key}:${d.count} 个任务,${fmtDuration(d.minutes)}`}>
              <div
                className={`w-full rounded-t ${d.key === todayKey ? 'bg-cyan-500' : 'bg-slate-700 group-hover:bg-slate-600'}`}
                style={{ height: `${Math.max((d.minutes / maxMinutes) * 100, d.minutes > 0 ? 6 : 2)}%` }}
              />
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-slate-600">
          <span>{last15[0].key.slice(5)}</span>
          <span>今天</span>
        </div>
      </section>

      {/* Daily Log(key 随日期变化强制重挂载,跨午夜后表单重置为新一天,避免把昨天的记录误存到今天) */}
      <section key={todayKey} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="mb-1 text-sm font-semibold text-slate-300">📝 今日记录(2-5 分钟)</h3>
        <p className="mb-3 text-[11px] text-slate-500">每天只记三件事:完成了什么、遇到什么问题、明天做什么。</p>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-slate-500">完成(每行一条{autoCompleted.length > 0 && ',已从完成任务预填'})</label>
            <textarea className={areaCls} rows={3} value={completedText} onChange={(e) => setCompletedText(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">问题(每行一条)</label>
            <textarea className={areaCls} rows={2} value={problemsText} onChange={(e) => setProblemsText(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">下一步(每行一条)</label>
            <textarea className={areaCls} rows={2} value={nextText} onChange={(e) => setNextText(e.target.value)} />
          </div>
          <button
            onClick={saveLog}
            className="w-full rounded-lg bg-cyan-600 py-2 text-sm font-medium text-white transition hover:bg-cyan-500"
          >
            保存今日记录
          </button>
        </div>
      </section>

      {/* 半月报 */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-300">📄 半月报草稿</h3>
          <span className="text-[11px] text-slate-500">
            {dateKey(halfStart)} ~ {dateKey(halfEnd)}
          </span>
        </div>
        <p className="mb-3 text-[11px] text-slate-500">
          汇总本期完成任务、项目进度与 Daily Log
          {effectiveSettings(settings).ai_api_key ? ',AI 生成(约需十几秒)' : ',本地模板生成(配置 AI Key 后更完整)'}。
        </p>
        <button
          onClick={generate}
          disabled={generating}
          className="mb-3 w-full rounded-lg border border-violet-700 bg-violet-950/50 py-2 text-sm text-violet-300 transition hover:bg-violet-900/50 disabled:opacity-50"
        >
          {generating ? '生成中,请稍候…' : '生成半月报草稿'}
        </button>
        {report && (
          <div className="space-y-2">
            <textarea className={`${areaCls} font-mono text-xs`} rows={16} value={report} onChange={(e) => setReport(e.target.value)} />
            <button
              onClick={() => navigator.clipboard?.writeText(report).then(() => alert('已复制到剪贴板'))}
              className="w-full rounded-lg border border-slate-700 py-2 text-xs text-slate-400 transition hover:text-slate-200"
            >
              复制全文
            </button>
          </div>
        )}
      </section>
    </div>
  )
}

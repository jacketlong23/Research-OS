import { NavLink, Route, Routes } from 'react-router-dom'
import Today from './pages/Today'
import Week from './pages/Week'
import Tasks from './pages/Tasks'
import Review from './pages/Review'
import SettingsPage from './pages/SettingsPage'
import AccountPage from './pages/Account'
import CloudSyncBridge from './cloud/CloudSyncBridge'
import { useCloudStore } from './cloud/store'
import { fmtCnDate } from './lib/time'
import { useNow } from './lib/useNow'

const NAV = [
  { to: '/', label: '今日', icon: '☀️', end: true },
  { to: '/week', label: '本周', icon: '🗓' },
  { to: '/tasks', label: '任务', icon: '📋' },
  { to: '/review', label: '复盘', icon: '📈' },
]

export default function App() {
  const now = useNow(60000)
  const cloudSession = useCloudStore((state) => state.session)
  const cloudStatus = useCloudStore((state) => state.status)

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col">
      <CloudSyncBridge />
      <header className="sticky top-0 z-20 border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/90 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold tracking-wide text-cyan-600 dark:text-cyan-400">Research OS</h1>
            <p className="text-xs text-slate-500">科研驾驶舱 · {fmtCnDate(now)}</p>
          </div>
          <div className="flex items-center gap-2">
            <NavLink
              to="/account"
              className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400 transition hover:border-cyan-600 hover:text-cyan-600 hover:dark:text-cyan-400"
              title="账号与同步"
            >
              ☁ {cloudSession ? (cloudStatus === 'conflict' ? '冲突' : '已登录') : '登录'}
            </NavLink>
            <NavLink
              to="/settings"
              className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400 transition hover:border-cyan-600 hover:text-cyan-600 hover:dark:text-cyan-400"
              title="设置"
            >
              ⚙ 设置
            </NavLink>
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 pb-24 pt-4">
        <Routes>
          <Route path="/" element={<Today />} />
          <Route path="/week" element={<Week />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/review" element={<Review />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/account" element={<AccountPage />} />
        </Routes>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 dark:border-slate-800 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur">
        <div className="mx-auto grid max-w-5xl grid-cols-4">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 py-2.5 text-xs transition ${
                  isActive ? 'text-cyan-600 dark:text-cyan-400' : 'text-slate-500 hover:text-slate-700 hover:dark:text-slate-300'
                }`
              }
            >
              <span className="text-lg leading-none">{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}

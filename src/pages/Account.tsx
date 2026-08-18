import { type FormEvent, useState } from 'react'
import { getCloudConfig } from '../cloud/config'
import {
  downloadCloudAsSource,
  loginCloud,
  logoutCloudAndClearLocal,
  registerCloud,
  syncNow,
  uploadLocalAsSource,
} from '../cloud/service'
import { useCloudStore } from '../cloud/store'

const inputCls =
  'w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 px-3 py-2 text-sm text-slate-800 dark:text-slate-200 outline-none transition focus:border-cyan-600'
const buttonCls =
  'rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 transition hover:border-cyan-500 hover:text-cyan-600 dark:hover:text-cyan-400 disabled:cursor-not-allowed disabled:opacity-50'

export default function AccountPage() {
  const config = getCloudConfig()
  const session = useCloudStore((state) => state.session)
  const linked = useCloudStore((state) => state.linked)
  const dirty = useCloudStore((state) => state.dirty)
  const status = useCloudStore((state) => state.status)
  const message = useCloudStore((state) => state.message)
  const lastSyncedAt = useCloudStore((state) => state.lastSyncedAt)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true)
    setNotice('')
    try {
      await action()
    } catch (error) {
      setNotice(`❌ ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBusy(false)
    }
  }

  const submitLogin = (event: FormEvent) => {
    event.preventDefault()
    void run(async () => {
      await loginCloud(email.trim(), password)
      setPassword('')
      setNotice('✅ 登录成功，请选择本机/云端数据来源')
    })
  }

  const submitRegister = () => {
    void run(async () => {
      const result = await registerCloud(email.trim(), password)
      setPassword('')
      setNotice(
        result.needsEmailConfirmation
          ? '✅ 注册成功，请到邮箱完成验证后再登录'
          : '✅ 注册并登录成功，请选择本机/云端数据来源',
      )
    })
  }

  if (!config) {
    return (
      <div className="space-y-4">
        <section className="rounded-xl border border-amber-300/60 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/20 p-4">
          <h2 className="text-base font-semibold text-amber-800 dark:text-amber-300">☁ 云同步尚未配置</h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            未配置时 Research OS 仍按原来的本地模式工作，不影响任何现有功能。
          </p>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-400">
            <li>在 Supabase 新建项目并执行仓库中的 supabase/schema.sql。</li>
            <li>复制 .env.example 为 .env.local。</li>
            <li>填写 Project URL 与 Publishable Key，然后重新构建。</li>
          </ol>
          <p className="mt-3 text-xs font-medium text-rose-600 dark:text-rose-400">
            禁止填写 sb_secret_* 或 service_role；它们拥有高权限，不能进入浏览器或公开仓库。
          </p>
        </section>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-900/60 p-4">
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200">☁ 账号与同步</h2>
          <p className="mt-1 text-xs text-slate-500">登录后可在不同设备同步科研任务、项目、排程和复盘记录。</p>
          <form className="mt-4 space-y-3" onSubmit={submitLogin}>
            <div>
              <label className="mb-1 block text-xs text-slate-500">邮箱</label>
              <input
                type="email"
                autoComplete="email"
                required
                className={inputCls}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">密码</label>
              <input
                type="password"
                autoComplete="current-password"
                minLength={8}
                required
                className={inputCls}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button type="submit" disabled={busy} className={`${buttonCls} border-cyan-400 dark:border-cyan-800`}>
                {busy ? '处理中…' : '登录'}
              </button>
              <button type="button" disabled={busy} className={buttonCls} onClick={submitRegister}>
                注册
              </button>
            </div>
          </form>
          {notice && <p className="mt-3 text-xs text-slate-600 dark:text-slate-400">{notice}</p>}
        </section>

        <section className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 text-xs text-slate-500">
          <strong className="text-slate-700 dark:text-slate-300">隐私规则：</strong>AI API Key 不参与云同步；云端只保存白名单中的科研数据和普通设置。
        </section>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-900/60 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200">☁ 账号与同步</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{session.user.email ?? session.user.id}</p>
          </div>
          <span className="rounded-full border border-slate-300 dark:border-slate-700 px-2.5 py-1 text-xs text-slate-500">
            {status === 'syncing' ? '同步中' : status === 'conflict' ? '存在冲突' : linked ? '已绑定' : '待首次绑定'}
          </span>
        </div>

        {!linked ? (
          <div className="mt-4 rounded-lg border border-amber-300/70 dark:border-amber-900/70 bg-amber-50/70 dark:bg-amber-950/20 p-3">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">首次登录不会自动覆盖任何数据</p>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              请明确选择当前设备的数据作为源，或使用云端已有数据。这样可以避免把共享电脑残留数据误传到新账号。
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <button disabled={busy} className={buttonCls} onClick={() => void run(uploadLocalAsSource)}>
                ↑ 本机数据上传到云端
              </button>
              <button disabled={busy} className={buttonCls} onClick={() => void run(downloadCloudAsSource)}>
                ↓ 用云端数据覆盖本机
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                <div className="text-xs text-slate-500">本机状态</div>
                <div className="mt-1 text-sm text-slate-700 dark:text-slate-300">{dirty ? '有待同步修改' : '无待同步修改'}</div>
              </div>
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 sm:col-span-2">
                <div className="text-xs text-slate-500">最后同步</div>
                <div className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                  {lastSyncedAt ? new Date(lastSyncedAt).toLocaleString() : '尚未记录'}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button disabled={busy} className={`${buttonCls} border-cyan-400 dark:border-cyan-800`} onClick={() => void run(syncNow)}>
                ↻ 立即同步
              </button>
              <button
                disabled={busy}
                className={buttonCls}
                onClick={() => {
                  if (window.confirm('确定用当前本机数据覆盖该账号云端数据吗？')) void run(uploadLocalAsSource)
                }}
              >
                本机覆盖云端
              </button>
              <button
                disabled={busy}
                className={buttonCls}
                onClick={() => {
                  if (window.confirm('确定用云端数据覆盖当前本机数据吗？本机未同步修改会丢失。')) void run(downloadCloudAsSource)
                }}
              >
                云端覆盖本机
              </button>
            </div>
          </div>
        )}

        {(message || notice) && (
          <p className={`mt-3 text-xs ${status === 'error' || status === 'conflict' ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500'}`}>
            {notice || message}
          </p>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 dark:border-slate-800 p-4">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">安全说明</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-500">
          <li>AI API Key 永远不写入云端快照。</li>
          <li>数据库必须启用 RLS，并限定 user_id = auth.uid()。</li>
          <li>前端只允许使用 Publishable Key，禁止 Secret / service_role。</li>
          <li>双设备同时修改时不自动覆盖，而是提示冲突。</li>
        </ul>
        <button
          disabled={busy}
          className="mt-4 rounded-lg border border-rose-300 dark:border-rose-900 px-3 py-2 text-sm text-rose-600 dark:text-rose-400 disabled:opacity-50"
          onClick={() => {
            if (window.confirm('退出会先尝试同步未保存修改，然后清除本机科研数据，避免他人在同一浏览器看到。确定继续吗？')) {
              void run(logoutCloudAndClearLocal)
            }
          }}
        >
          退出账号并清除本机同步数据
        </button>
      </section>
    </div>
  )
}

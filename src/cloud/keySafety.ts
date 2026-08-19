/**
 * 浏览器端只能使用 Supabase Publishable/anon 级别 Key。
 * Secret/service_role 一旦进入 VITE_*，会被 Vite 打包进公开 JS，因此必须在构建和运行时双重拒绝。
 */
export function isForbiddenFrontendSupabaseKey(key: string): boolean {
  const value = key.trim()
  if (!value) return false
  if (/^sb_secret_/i.test(value)) return true
  if (/service[_-]?role/i.test(value)) return true

  // 兼容旧版 JWT 形式的 service_role key：解码 payload 检查 role。
  const parts = value.split('.')
  if (parts.length === 3) {
    try {
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
      const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
      const payload = JSON.parse(globalThis.atob(padded)) as { role?: unknown }
      if (payload.role === 'service_role') return true
    } catch {
      // 不是可解析 JWT 时继续按普通 publishable key 处理。
    }
  }

  return false
}

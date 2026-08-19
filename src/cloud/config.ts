import { isForbiddenFrontendSupabaseKey } from './keySafety'

export interface CloudConfig {
  url: string
  publishableKey: string
}

type EnvLike = Record<string, string | undefined>

/**
 * Supabase 配置只允许使用浏览器可公开的 publishable/anon 级别 key。
 * 严禁把 sb_secret_* / service_role 写进 VITE_* 环境变量或前端代码。
 * env 参数仅供测试注入，生产环境使用默认的 import.meta.env。
 */
export function getCloudConfig(env: EnvLike = import.meta.env as unknown as EnvLike): CloudConfig | null {
  const url = env.VITE_SUPABASE_URL?.trim().replace(/\/+$/, '')
  const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
  if (!url || !publishableKey) return null
  if (isForbiddenFrontendSupabaseKey(publishableKey)) {
    throw new Error('检测到 Supabase Secret/service_role Key：禁止在浏览器前端使用，请改为 Publishable Key')
  }
  return { url, publishableKey }
}

export function isCloudConfigured(): boolean {
  try {
    return getCloudConfig() !== null
  } catch {
    return false
  }
}

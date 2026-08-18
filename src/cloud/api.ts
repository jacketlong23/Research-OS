import { getCloudConfig } from './config'
import type { ResearchSnapshot } from './snapshot'

export interface CloudUser {
  id: string
  email?: string
}

export interface CloudSession {
  accessToken: string
  refreshToken: string
  /** 毫秒时间戳 */
  expiresAt: number
  user: CloudUser
}

interface AuthResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  expires_at?: number
  user?: CloudUser | null
  msg?: string
  message?: string
  error_description?: string
  error?: string
}

export interface SignUpResult {
  session: CloudSession | null
  user: CloudUser | null
  needsEmailConfirmation: boolean
}

export interface RemoteSnapshotRow {
  payload: ResearchSnapshot
  updated_at: string
}

function requireConfig() {
  const config = getCloudConfig()
  if (!config) throw new Error('云同步未配置：请先设置 VITE_SUPABASE_URL 和 VITE_SUPABASE_PUBLISHABLE_KEY')
  return config
}

function publicHeaders() {
  const { publishableKey } = requireConfig()
  return {
    apikey: publishableKey,
    Authorization: `Bearer ${publishableKey}`,
    'Content-Type': 'application/json',
  }
}

function userHeaders(accessToken: string) {
  const { publishableKey } = requireConfig()
  return {
    apikey: publishableKey,
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }
}

async function errorFromResponse(res: Response): Promise<Error> {
  let detail = `${res.status} ${res.statusText}`
  try {
    const data = (await res.json()) as AuthResponse
    detail = data.error_description || data.msg || data.message || data.error || detail
  } catch {
    // 非 JSON 错误响应保留 HTTP 状态
  }
  return new Error(detail)
}

function toSession(data: AuthResponse, fallbackUser?: CloudUser): CloudSession {
  const user = data.user ?? fallbackUser
  if (!data.access_token || !data.refresh_token || !user) throw new Error('登录响应缺少会话信息')
  const expiresAt = data.expires_at
    ? data.expires_at * 1000
    : Date.now() + Math.max(60, data.expires_in ?? 3600) * 1000
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt,
    user,
  }
}

export async function signInWithPassword(email: string, password: string): Promise<CloudSession> {
  const { url } = requireConfig()
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: publicHeaders(),
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw await errorFromResponse(res)
  return toSession((await res.json()) as AuthResponse)
}

export async function signUpWithPassword(email: string, password: string): Promise<SignUpResult> {
  const { url } = requireConfig()
  const res = await fetch(`${url}/auth/v1/signup`, {
    method: 'POST',
    headers: publicHeaders(),
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw await errorFromResponse(res)
  const data = (await res.json()) as AuthResponse
  const user = data.user ?? null
  if (!data.access_token || !data.refresh_token || !user) {
    return { session: null, user, needsEmailConfirmation: true }
  }
  return { session: toSession(data), user, needsEmailConfirmation: false }
}

export async function refreshCloudSession(session: CloudSession): Promise<CloudSession> {
  const { url } = requireConfig()
  const res = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: publicHeaders(),
    body: JSON.stringify({ refresh_token: session.refreshToken }),
  })
  if (!res.ok) throw await errorFromResponse(res)
  return toSession((await res.json()) as AuthResponse, session.user)
}

export async function signOutCloudSession(session: CloudSession): Promise<void> {
  const { url } = requireConfig()
  const res = await fetch(`${url}/auth/v1/logout`, {
    method: 'POST',
    headers: userHeaders(session.accessToken),
  })
  if (!res.ok && res.status !== 401) throw await errorFromResponse(res)
}

export async function fetchRemoteSnapshot(session: CloudSession): Promise<RemoteSnapshotRow | null> {
  const { url } = requireConfig()
  const query = `user_id=eq.${encodeURIComponent(session.user.id)}&select=payload,updated_at&limit=1`
  const res = await fetch(`${url}/rest/v1/research_os_snapshots?${query}`, {
    headers: userHeaders(session.accessToken),
  })
  if (!res.ok) throw await errorFromResponse(res)
  const rows = (await res.json()) as RemoteSnapshotRow[]
  return rows[0] ?? null
}

export async function upsertRemoteSnapshot(
  session: CloudSession,
  snapshot: ResearchSnapshot,
): Promise<RemoteSnapshotRow> {
  const { url } = requireConfig()
  const updatedAt = new Date().toISOString()
  const res = await fetch(`${url}/rest/v1/research_os_snapshots?on_conflict=user_id`, {
    method: 'POST',
    headers: {
      ...userHeaders(session.accessToken),
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify({
      user_id: session.user.id,
      payload: snapshot,
      updated_at: updatedAt,
    }),
  })
  if (!res.ok) throw await errorFromResponse(res)
  const rows = (await res.json()) as RemoteSnapshotRow[]
  return rows[0] ?? { payload: snapshot, updated_at: updatedAt }
}

/** 时间与日期工具(全部基于本地时区) */

export const WEEKDAY_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + (m || 0)
}

export function minutesToHHmm(m: number): string {
  const h = Math.floor(m / 60)
  const mm = m % 60
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

/** 本地 YYYY-MM-DD */
export function dateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 本地当天 00:00 */
export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

/** 周一为一周开始,返回周一 00:00 */
export function startOfWeek(d: Date): Date {
  const r = new Date(d)
  const dow = (r.getDay() + 6) % 7 // 0=周一
  r.setDate(r.getDate() - dow)
  r.setHours(0, 0, 0, 0)
  return r
}

/** 0=周一 … 6=周日 */
export function weekIndex(d: Date): number {
  return (d.getDay() + 6) % 7
}

/** 当天已过分钟数 */
export function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes()
}

/** 8月16日 */
export function fmtCnDate(d: Date): string {
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

export function fmtDuration(minutes: number): string {
  if (minutes % 60 === 0) return `${minutes / 60} h`
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)}h${minutes % 60}m`
}

/** 相对现在的人话截止描述 */
export function fmtDeadlineRelative(iso: string | null, now: Date): string {
  if (!iso) return '无截止'
  const dl = new Date(iso)
  const todayKey = dateKey(now)
  const dlKey = dateKey(dl)
  const diffDays = Math.round(
    (parseDateKey(dlKey).getTime() - parseDateKey(todayKey).getTime()) / 86400000,
  )
  const hm = `${String(dl.getHours()).padStart(2, '0')}:${String(dl.getMinutes()).padStart(2, '0')}`
  if (diffDays === 0) return `今天 ${hm}`
  if (diffDays === 1) return `明天 ${hm}`
  if (diffDays === -1) return `昨天 ${hm}(已过期)`
  if (diffDays < 0) return `${-diffDays} 天前(已过期)`
  if (diffDays <= 7) return `${diffDays} 天后 ${hm}`
  return `${dl.getMonth() + 1}月${dl.getDate()}日 ${hm}`
}

export function uid(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

/** ISO -> <input type="datetime-local"> 的值 */
export function isoToLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** <input type="datetime-local"> 的值 -> ISO,null 表示清空 */
export function localInputToISO(v: string): string | null {
  return v ? new Date(v).toISOString() : null
}

/** 本地 YYYY-MM-DD -> <input type="date"> 值(格式相同,做校验用) */
export function todayInputValue(d: Date): string {
  return dateKey(d)
}

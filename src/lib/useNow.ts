import { useEffect, useState } from 'react'

/** 定时刷新的"当前时间"(默认 30s,用于时间轴的当前时间线) */
export function useNow(intervalMs = 30000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

import { useEffect } from 'react'
import {
  useDailyLogsStore,
  useProjectsStore,
  useScheduleStore,
  useSettingsStore,
  useTasksStore,
} from '../store'
import { syncNow } from './service'
import { useCloudStore } from './store'

/**
 * 本地优先同步桥：
 * - 本地 Zustand 变化立即保存在原有 localStorage；
 * - 已完成首次绑定后，1.5 秒防抖上传；
 * - 页面重新获得焦点时检查其他设备的云端更新；
 * - 双边都改过则停止自动覆盖，进入 conflict 状态。
 */
export default function CloudSyncBridge() {
  const session = useCloudStore((state) => state.session)
  const linked = useCloudStore((state) => state.linked)
  const dirty = useCloudStore((state) => state.dirty)

  useEffect(() => {
    const mark = () => {
      const cloud = useCloudStore.getState()
      if (!cloud.suppressTracking) cloud.markDirty()
    }
    const unsubscribe = [
      useProjectsStore.subscribe(mark),
      useTasksStore.subscribe(mark),
      useScheduleStore.subscribe(mark),
      useDailyLogsStore.subscribe(mark),
      useSettingsStore.subscribe(mark),
    ]
    return () => unsubscribe.forEach((fn) => fn())
  }, [])

  useEffect(() => {
    if (!session || !linked) return
    void syncNow().catch(() => undefined)

    const onFocus = () => void syncNow().catch(() => undefined)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') onFocus()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [session?.user.id, linked])

  useEffect(() => {
    if (!session || !linked || !dirty) return
    const timer = window.setTimeout(() => {
      void syncNow().catch(() => undefined)
    }, 1500)
    return () => window.clearTimeout(timer)
  }, [session?.user.id, linked, dirty])

  return null
}

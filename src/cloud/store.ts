import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { CloudSession } from './api'

export type CloudSyncStatus = 'idle' | 'syncing' | 'synced' | 'conflict' | 'error'

interface CloudState {
  session: CloudSession | null
  /** 最近一次登录/绑定过的账号，用于识别账号切换 */
  activeUserId: string | null
  /** 首次来源选择完成后才允许自动同步 */
  linked: boolean
  dirty: boolean
  lastSyncedAt: string | null
  status: CloudSyncStatus
  message: string
  suppressTracking: boolean

  setSession: (session: CloudSession | null) => void
  setActiveUser: (userId: string) => void
  setLinked: (linked: boolean) => void
  markDirty: () => void
  setSynced: (at: string) => void
  setStatus: (status: CloudSyncStatus, message?: string) => void
  setSuppressTracking: (value: boolean) => void
  resetForDifferentUser: (userId: string) => void
  clearSessionAfterLogout: () => void
}

/**
 * 登录 access/refresh token 只保存在当前浏览器会话(sessionStorage)中。
 * 关闭标签页/浏览器后自动失效，避免 refresh token 长期驻留 localStorage。
 * 注意：sessionStorage 仍不能抵御同源 XSS，因此页面代码仍需避免危险 HTML 注入。
 */
export const useCloudStore = create<CloudState>()(
  persist(
    (set) => ({
      session: null,
      activeUserId: null,
      linked: false,
      dirty: false,
      lastSyncedAt: null,
      status: 'idle',
      message: '',
      suppressTracking: false,

      setSession: (session) => set({ session }),
      setActiveUser: (activeUserId) => set({ activeUserId }),
      setLinked: (linked) => set({ linked }),
      markDirty: () => set((state) => (state.linked ? { dirty: true } : {})),
      setSynced: (lastSyncedAt) => set({ dirty: false, lastSyncedAt, status: 'synced', message: '已同步' }),
      setStatus: (status, message = '') => set({ status, message }),
      setSuppressTracking: (suppressTracking) => set({ suppressTracking }),
      resetForDifferentUser: (activeUserId) =>
        set({
          activeUserId,
          linked: false,
          dirty: false,
          lastSyncedAt: null,
          status: 'idle',
          message: '检测到不同账号，请重新选择本机/云端数据来源',
        }),
      clearSessionAfterLogout: () =>
        set({
          session: null,
          linked: false,
          dirty: false,
          lastSyncedAt: null,
          status: 'idle',
          message: '',
        }),
    }),
    {
      name: 'research-os:cloud',
      version: 2,
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        session: state.session,
        activeUserId: state.activeUserId,
        linked: state.linked,
        dirty: state.dirty,
        lastSyncedAt: state.lastSyncedAt,
      }),
    },
  ),
)

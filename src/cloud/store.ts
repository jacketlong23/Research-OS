import { create } from 'zustand'
import { persist } from 'zustand/middleware'
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
      // 未完成首次绑定前不标记 dirty，避免触发自动上传
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
          // 退出后重置 linked，确保下次登录(即使是同一账号)也重新走来源选择，
          // 不依赖「退出已清空数据」这个隐含前提，更保守可预测。
          linked: false,
          dirty: false,
          lastSyncedAt: null,
          status: 'idle',
          message: '',
        }),
    }),
    {
      name: 'research-os:cloud',
      version: 1,
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

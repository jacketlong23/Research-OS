import { describe, expect, it } from 'vitest'
import { getCloudConfig } from './config'

describe('getCloudConfig（Supabase 配置）', () => {
  it('未配置任何值时返回 null，不启用云同步', () => {
    expect(getCloudConfig({})).toBeNull()
  })

  it('缺少 URL 或 Publishable Key 任意一项时返回 null', () => {
    expect(getCloudConfig({ VITE_SUPABASE_URL: 'https://x.supabase.co' })).toBeNull()
    expect(getCloudConfig({ VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_k' })).toBeNull()
  })

  it('配置完整时去除 URL 末尾斜杠并返回 url 与 publishableKey', () => {
    const c = getCloudConfig({
      VITE_SUPABASE_URL: ' https://abc.supabase.co/ ',
      VITE_SUPABASE_PUBLISHABLE_KEY: ' sb_publishable_k ',
    })
    expect(c).toEqual({ url: 'https://abc.supabase.co', publishableKey: 'sb_publishable_k' })
  })
})

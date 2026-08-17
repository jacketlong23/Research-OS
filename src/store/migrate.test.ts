import { describe, expect, it } from 'vitest'
import { migrateSettings } from './index'
import { DEFAULT_SETTINGS } from '../types'

describe('migrateSettings(持久化 v1 → v2)', () => {
  it('把已下线的旧模型名换成当前默认模型', () => {
    expect(migrateSettings({ ai_model: 'deepseek-chat' }).ai_model).toBe(DEFAULT_SETTINGS.ai_model)
    expect(migrateSettings({ ai_model: 'deepseek-reasoner' }).ai_model).toBe(DEFAULT_SETTINGS.ai_model)
  })

  it('用户自定义的模型名不受影响', () => {
    expect(migrateSettings({ ai_model: 'deepseek-v4-pro' }).ai_model).toBe('deepseek-v4-pro')
    expect(migrateSettings({ ai_model: 'gpt-4o' }).ai_model).toBe('gpt-4o')
  })

  it('其余字段原样保留', () => {
    const s = { work_start: '10:00', ai_api_key: 'sk-xxx' }
    const r = migrateSettings(s)
    expect(r.work_start).toBe('10:00')
    expect(r.ai_api_key).toBe('sk-xxx')
  })
})

import { describe, expect, it } from 'vitest'
import { migrateSettings } from './index'
import { migrateWorkPeriods } from '../lib/workPeriods'
import { DEFAULT_SETTINGS, type WorkPeriod } from '../types'

describe('migrateSettings(持久化迁移)', () => {
  it('把已下线的旧模型名换成当前默认模型', () => {
    expect(migrateSettings({ ai_model: 'deepseek-chat' }).ai_model).toBe(DEFAULT_SETTINGS.ai_model)
    expect(migrateSettings({ ai_model: 'deepseek-reasoner' }).ai_model).toBe(DEFAULT_SETTINGS.ai_model)
  })

  it('用户自定义的模型名不受影响', () => {
    expect(migrateSettings({ ai_model: 'deepseek-v4-pro' }).ai_model).toBe('deepseek-v4-pro')
    expect(migrateSettings({ ai_model: 'gpt-4o' }).ai_model).toBe('gpt-4o')
  })

  it('清空已废弃的内置演示 Key,用户自己的 Key 保留', () => {
    expect(migrateSettings({ ai_api_key: 'sk-fff8be-xxxx' }).ai_api_key).toBe('')
    expect(migrateSettings({ ai_api_key: 'sk-my-own' }).ai_api_key).toBe('sk-my-own')
  })

  it('旧默认 work_start/work_end 迁移为默认多时段,并移除旧字段', () => {
    const r = migrateSettings({ work_start: '09:00', work_end: '20:30' })
    expect(r.work_periods).toEqual(DEFAULT_SETTINGS.work_periods)
    expect('work_start' in r).toBe(false)
    expect('work_end' in r).toBe(false)
  })

  it('旧自定义 work_start/work_end 迁移为单一时段', () => {
    const r = migrateSettings({ work_start: '08:30', work_end: '18:00' })
    expect(r.work_periods).toEqual([{ id: 'custom', label: '工作时间', start: '08:30', end: '18:00', enabled: true }])
  })

  it('已有 work_periods 时原样保留', () => {
    const periods: WorkPeriod[] = [{ id: 'x', start: '09:00', end: '10:00', enabled: true }]
    expect(migrateSettings({ work_periods: periods }).work_periods).toBe(periods)
  })
})

describe('migrateWorkPeriods', () => {
  it('旧默认(09:00–20:30)回退为默认三段', () => {
    expect(migrateWorkPeriods(undefined, '09:00', '20:30')).toEqual(DEFAULT_SETTINGS.work_periods)
  })

  it('自定义非法(结束<=开始)时回退默认三段', () => {
    expect(migrateWorkPeriods(undefined, '18:00', '09:00')).toEqual(DEFAULT_SETTINGS.work_periods)
  })
})

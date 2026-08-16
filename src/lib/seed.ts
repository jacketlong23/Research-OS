import type { DailyLog, Project, Schedule, Task } from '../types'
import { addDays, dateKey } from './time'

/** 首次打开时的示例数据,日期相对"今天"生成,保证任何时候打开都成立 */

export function seedProjects(): Project[] {
  return [
    {
      id: 'proj_maoxian',
      name: 'REDACTED_RESEARCH_AREA REDACTED_RESEARCH_METHOD',
      progress: 60,
      current_focus: '大气残差问题(涪城一号 C 波段)',
      next_step: '验证轨道残差 / 高程相关性',
      priority: 5,
      color: 'cyan',
    },
    {
      id: 'proj_flood',
      name: 'REDACTED_RESEARCH_PROJECT',
      progress: 45,
      current_focus: '核心模块开发',
      next_step: '数据接口联调',
      priority: 4,
      color: 'emerald',
    },
    {
      id: 'proj_theory',
      name: 'REDACTED_RESEARCH_METHOD 理论',
      progress: 40,
      current_focus: '干涉几何',
      next_step: '基准面 / 高程 / 地形相位模型推导',
      priority: 4,
      color: 'violet',
    },
  ]
}

export function seedTasks(now: Date): Task[] {
  const today = dateKey(now)
  const iso = (d: number, h: number, m = 0) => {
    const dt = addDays(now, d)
    dt.setHours(h, m, 0, 0)
    return dt.toISOString()
  }
  return [
    {
      id: 'task_atmos',
      title: 'REDACTED_RESEARCH_AREA大气残差排查',
      project_id: 'proj_maoxian',
      duration_minutes: 120,
      deadline: iso(0, 18),
      importance: 5,
      status: 'todo',
      splittable: false,
      minimum_block_minutes: 120,
      blocking: true,
      type: 'flexible',
      created_at: now.toISOString(),
    },
    {
      id: 'task_terrain',
      title: 'REDACTED_RESEARCH_METHOD 地形相位模型推导',
      project_id: 'proj_theory',
      duration_minutes: 120,
      deadline: iso(2, 21),
      importance: 4,
      status: 'todo',
      splittable: false,
      minimum_block_minutes: 90,
      blocking: false,
      type: 'flexible',
      created_at: now.toISOString(),
    },
    {
      id: 'task_flood',
      title: 'REDACTED_RESEARCH_TOPIC Agent 页面开发',
      project_id: 'proj_flood',
      duration_minutes: 90,
      deadline: iso(1, 18),
      importance: 4,
      status: 'todo',
      splittable: true,
      minimum_block_minutes: 60,
      blocking: false,
      type: 'flexible',
      created_at: now.toISOString(),
    },
    {
      id: 'task_paper',
      title: '论文阅读:REDACTED_RESEARCH_METHOD 相位解缠',
      project_id: 'proj_theory',
      duration_minutes: 45,
      deadline: iso(1, 21),
      importance: 3,
      status: 'todo',
      splittable: true,
      minimum_block_minutes: 30,
      blocking: false,
      type: 'flexible',
      created_at: now.toISOString(),
    },
    // 每周组会(fixed)
    {
      id: 'task_meeting',
      title: '课题组组会',
      project_id: null,
      duration_minutes: 90,
      deadline: null,
      importance: 5,
      status: 'todo',
      splittable: false,
      minimum_block_minutes: 90,
      blocking: false,
      type: 'fixed',
      fixed_date: undefined,
      repeat_weekdays: [4], // 周五
      start: '14:00',
      end: '15:30',
      created_at: now.toISOString(),
    },
    // 已完成示例(复盘页有内容可看)
    {
      id: 'task_done_demo',
      title: `${today} 干涉几何学习(示例)`,
      project_id: 'proj_theory',
      duration_minutes: 60,
      deadline: null,
      importance: 3,
      status: 'done',
      splittable: true,
      minimum_block_minutes: 30,
      blocking: false,
      type: 'flexible',
      created_at: now.toISOString(),
      completed_at: addDays(now, -1).toISOString(),
    },
  ]
}

export function seedSchedule(): Schedule {
  // 排程由引擎在首屏自动生成,这里留空
  return {}
}

export function seedDailyLogs(now: Date): DailyLog[] {
  const yest = dateKey(addDays(now, -1))
  return [
    {
      date: yest,
      completed: ['干涉几何章节学习', 'REDACTED_RESEARCH_AREA数据基线校正复跑'],
      problems: ['大气校正后仍存在长波残差'],
      next: ['检查轨道残差'],
    },
  ]
}

import type { DailyLog, Project, Task } from '../types'
import { addDays, dateKey } from './time'

/** 首次打开时的示例数据,日期相对"今天"生成,保证任何时候打开都成立 */

export function seedProjects(): Project[] {
  return [
    {
      id: 'proj_paper',
      name: '论文写作',
      progress: 60,
      current_focus: '引言与方法部分',
      next_step: '补充实验数据',
      priority: 5,
      color: 'cyan',
    },
    {
      id: 'proj_experiment',
      name: '实验数据分析',
      progress: 45,
      current_focus: '数据处理流程',
      next_step: '验证结果一致性',
      priority: 4,
      color: 'emerald',
    },
    {
      id: 'proj_course',
      name: '专业课程学习',
      progress: 40,
      current_focus: '核心章节',
      next_step: '完成章节习题',
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
      id: 'task_draft',
      title: '论文初稿撰写',
      project_id: 'proj_paper',
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
      id: 'task_reproduce',
      title: '实验结果复现',
      project_id: 'proj_experiment',
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
      id: 'task_preprocess',
      title: '数据预处理脚本',
      project_id: 'proj_experiment',
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
      id: 'task_read',
      title: '文献阅读与综述整理',
      project_id: 'proj_course',
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
      title: `${today} 课程学习(示例)`,
      project_id: 'proj_course',
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

export function seedDailyLogs(now: Date): DailyLog[] {
  const yest = dateKey(addDays(now, -1))
  return [
    {
      date: yest,
      completed: ['核心章节学习', '实验数据复跑'],
      problems: ['数据处理流程仍有细节待确认'],
      next: ['检查结果一致性'],
    },
  ]
}

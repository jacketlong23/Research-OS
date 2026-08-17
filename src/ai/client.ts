import type { DailyLog, Project, Settings, Task, TaskType } from '../types'
import { DEFAULT_SETTINGS } from '../types'
import { addDays, dateKey, fmtDeadlineRelative } from '../lib/time'

/**
 * AI 集成(OpenAI 兼容 /chat/completions)。
 * 只做三件事:自然语言建任务、推荐解释、半月报草稿。
 * 未配置 Key 或请求失败时,全部降级为本地规则,功能不受影响。
 */

export interface ParsedTask {
  title: string
  duration_minutes: number
  deadline: string | null
  importance: number
  type: TaskType
  blocking: boolean
  source: 'ai' | 'local'
  /** source 为 local 且配置了 AI 时,记录 AI 调用失败的原因 */
  error?: string
}

/** 旧版本浏览器的空配置回退到内置默认(Key/模型/地址) */
export function effectiveSettings(settings: Settings): Settings {
  return {
    ...settings,
    ai_api_key: settings.ai_api_key || DEFAULT_SETTINGS.ai_api_key,
    ai_base_url: settings.ai_base_url || DEFAULT_SETTINGS.ai_base_url,
    ai_model: settings.ai_model || DEFAULT_SETTINGS.ai_model,
  }
}

async function chat(settings: Settings, system: string, user: string): Promise<string> {
  const base = settings.ai_base_url.replace(/\/+$/, '')
  // DeepSeek 推理模型默认先思考再回答(任务解析要 10-20 秒),
  // 这里的都是简单结构化任务,关闭思考后 1-2 秒返回;其他兼容接口不认识该参数会报错,故仅对 DeepSeek 生效
  const body: Record<string, unknown> = {
    model: settings.ai_model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.3,
  }
  if (/deepseek/i.test(base)) body.thinking = { type: 'disabled' }
  // 网络挂起时 30 秒放弃,避免按钮永远停在"解析中"
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30_000)
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.ai_api_key}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`AI 请求失败(HTTP ${res.status})`)
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const content = data.choices?.[0]?.message?.content
    if (!content) throw new Error('AI 返回为空')
    return content
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw new Error('AI 请求超时(30 秒)')
    throw e
  } finally {
    clearTimeout(timer)
  }
}

// ---------- 连接测试 ----------

export interface AITestResult {
  ok: boolean
  message: string
}

/** 发一条最小请求验证 AI 配置是否可用,失败时给出可读的原因提示 */
export async function testAIConnection(settings: Settings): Promise<AITestResult> {
  settings = effectiveSettings(settings)
  if (!settings.ai_base_url || !settings.ai_model) return { ok: false, message: '请先填写 Base URL 和模型名称' }
  if (!settings.ai_api_key) return { ok: false, message: '请先填写 API Key' }
  const t0 = Date.now()
  try {
    const reply = await chat(settings, '你是连通性测试器,只输出要求的单词,不要任何其他内容。', '请回复:pong')
    return { ok: true, message: `连接成功:${settings.ai_model} · ${Date.now() - t0} ms · 回复「${reply.trim().slice(0, 20)}」` }
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e)
    let hint = raw
    if (/HTTP 40[13]/.test(raw)) hint = '认证失败(HTTP 401/403):API Key 无效或没有权限'
    else if (/HTTP 404/.test(raw)) hint = '接口不存在(HTTP 404):检查 Base URL 拼写(DeepSeek 为 https://api.deepseek.com)'
    else if (/HTTP 400/.test(raw)) hint = '请求被拒绝(HTTP 400):通常是模型名称不正确'
    else if (/HTTP 429/.test(raw)) hint = '请求过于频繁(HTTP 429):余额不足或触发限流,稍后再试'
    else if (/Failed to fetch|NetworkError|load failed/i.test(raw))
      hint = '网络错误:无法访问 Base URL(检查网络/地址拼写;若网络正常,可能是该接口不允许浏览器跨域调用)'
    return { ok: false, message: hint }
  }
}

function extractJson(text: string): Record<string, unknown> | null {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    return JSON.parse(match[0]) as Record<string, unknown>
  } catch {
    return null
  }
}

// ---------- 自然语言建任务 ----------

/** 本地降级解析:正则提取耗时/截止/重要度 */
export function parseTaskLocal(text: string, now: Date): ParsedTask {
  let duration = 60
  const hMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:个?小时|h|H)/)
  const mMatch = text.match(/(\d+)\s*(?:分钟|min|分)/)
  if (hMatch) duration = Math.round(parseFloat(hMatch[1]) * 60)
  else if (mMatch) duration = parseInt(mMatch[1], 10)
  else if (/半小时/.test(text)) duration = 30
  if (duration <= 0) duration = 30
  duration = Math.min(600, Math.round(duration / 15) * 15 || 15)

  let deadline: Date | null = null
  if (/今天|今晚/.test(text)) deadline = endOfDayOffset(now, 0)
  else if (/明天/.test(text)) deadline = endOfDayOffset(now, 1)
  else if (/后天/.test(text)) deadline = endOfDayOffset(now, 2)
  else if (/本周|这周/.test(text)) deadline = endOfDayOffset(now, 3)
  else if (/下周/.test(text)) deadline = endOfDayOffset(now, 7)
  if (/上午|中午之前|早上/.test(text) && deadline) deadline.setHours(11, 0, 0, 0)
  if (/下午/.test(text) && deadline) deadline.setHours(18, 0, 0, 0)
  if (/晚上|今晚/.test(text) && deadline) deadline.setHours(21, 30, 0, 0)

  let importance = 3
  if (/紧急|尽快|立刻|马上|导师|老板/.test(text)) importance = 5
  else if (/重要|优先/.test(text)) importance = 4
  else if (/随便|有空|不急/.test(text)) importance = 2

  const isFixed = /(组会|会议|上课|课程| seminar|Seminar)/.test(text) && /(周[一二三四五六日天]|每[天日])/.test(text)

  // 去掉时间描述,拿剩余部分当标题
  const title = text
    .replace(/大约|大概|约|需要|用时|耗时|预计/g, '')
    .replace(/(\d+(?:\.\d+)?\s*(?:个?小时|h|H|分钟|min|分|半小时))/g, '')
    .replace(/(今天|今晚|明天|后天|本周|这周|下周)(上午|中午之前|早上|下午|晚上)?(之前|前|以前)?/g, '')
    .replace(/之前|以前|截止|deadline/gi, '')
    .slice(0, 40)
    .trim()

  return {
    title: title || text.slice(0, 20).trim(),
    duration_minutes: duration,
    deadline: deadline ? deadline.toISOString() : null,
    importance,
    type: isFixed ? 'fixed' : 'flexible',
    blocking: importance >= 5,
    source: 'local',
  }
}

function endOfDayOffset(now: Date, days: number): Date {
  const d = addDays(now, days)
  d.setHours(21, 30, 0, 0)
  return d
}

export async function parseTaskNL(text: string, settings: Settings, now: Date): Promise<ParsedTask> {
  settings = effectiveSettings(settings)
  if (!settings.ai_api_key) return parseTaskLocal(text, now)
  try {
    const system = `你是科研时间管理助手的任务解析器。从用户的自然语言中提取一个任务,只输出 JSON,不要输出其他内容。
字段:
- title: 简短任务标题(中文,≤20字)
- duration_minutes: 预计耗时(分钟,整数)
- deadline: 截止时间 ISO 字符串(如 2026-08-17T18:00:00,用本地时区),"今天"=当天;无截止输出 null
- importance: 1-5 整数,导师/紧急任务给 4-5
- type: "fixed"(有明确开始结束时间的固定事件,如会议/课)或 "flexible"(弹性科研任务)
- blocking: 该任务是否阻塞后续工作,布尔值`
    const content = await chat(settings, system, `当前时间:${now.toISOString()}\n用户输入:${text}`)
    const json = extractJson(content)
    if (!json) return { ...parseTaskLocal(text, now), error: 'AI 返回内容中未找到 JSON' }
    const rawDeadline = typeof json.deadline === 'string' && json.deadline ? json.deadline : null
    return {
      title: String(json.title ?? '').slice(0, 40) || text.slice(0, 20),
      duration_minutes: Math.max(15, Math.min(600, Number(json.duration_minutes) || 60)),
      deadline: rawDeadline,
      importance: Math.max(1, Math.min(5, Number(json.importance) || 3)),
      type: json.type === 'fixed' ? 'fixed' : 'flexible',
      blocking: Boolean(json.blocking),
      source: 'ai',
    }
  } catch (e) {
    return { ...parseTaskLocal(text, now), error: e instanceof Error ? e.message : String(e) }
  }
}

// ---------- 推荐解释 ----------

export async function explainRecommendation(
  top: Task[],
  settings: Settings,
  now: Date,
): Promise<string> {
  if (top.length === 0) return '当前没有待安排的科研任务,可以先去任务页添加。'
  settings = effectiveSettings(settings)
  const lines = top
    .map(
      (t, i) =>
        `${i + 1}. ${t.title}(预计 ${Math.round(t.duration_minutes / 60 * 10) / 10}h,截止 ${fmtDeadlineRelative(t.deadline, now)},重要度 ${t.importance}/5${t.blocking ? ',阻塞后续' : ''})`,
    )
    .join('\n')
  const local = `今日建议优先级(按截止紧迫度、重要度、阻塞关系计算):\n${lines}\n\n原则:先做阻塞性强、截止近的任务;深度任务安排在上午整块时间。`
  if (!settings.ai_api_key) return local
  try {
    return await chat(
      settings,
      '你是科研时间规划助手。根据任务列表,用 3-5 句中文解释为什么建议这个优先顺序,以及今天的时间安排思路。务实、简短。',
      `当前时间:${dateKey(now)}\n任务列表:\n${lines}`,
    )
  } catch (e) {
    return `${local}\n\n(AI 解读调用失败,以上为本地规则:${e instanceof Error ? e.message : '未知错误'})`
  }
}

// ---------- 半月报草稿 ----------

export interface ReportInput {
  logs: DailyLog[]
  doneTasks: Task[]
  projects: Project[]
  rangeStart: string
  rangeEnd: string
}

export function reportLocalDraft(input: ReportInput): string {
  const { logs, doneTasks, projects, rangeStart, rangeEnd } = input
  const done = doneTasks.length
    ? doneTasks.map((t) => `- ${t.title}`).join('\n')
    : '- (无记录)'
  const problems = logs.flatMap((l) => l.problems.map((p) => `- ${l.date}:${p}`)).join('\n') || '- (无)'
  const nexts = logs.flatMap((l) => l.next.map((n) => `- ${n}`)).join('\n') || '- (无)'
  const proj = projects.map((p) => `- ${p.name}(${p.progress}%):${p.current_focus} → 下一步:${p.next_step}`).join('\n')
  const totalMin = doneTasks.reduce((a, t) => a + t.duration_minutes, 0)
  return `# 科研半月报(${rangeStart} ~ ${rangeEnd})

## 一、完成工作(${done} 项,合计 ${Math.round((totalMin / 60) * 10) / 10} 小时)
${done}

## 二、项目进度
${proj}

## 三、遇到的问题
${problems}

## 四、下一步计划
${nexts}

(本地模板生成;在设置中配置 AI Key 后可生成更完整的草稿)`
}

export async function draftBiweeklyReport(input: ReportInput, settings: Settings): Promise<string> {
  settings = effectiveSettings(settings)
  if (!settings.ai_api_key) return reportLocalDraft(input)
  try {
    const facts = JSON.stringify(
      {
        时间范围: `${input.rangeStart} ~ ${input.rangeEnd}`,
        完成任务: input.doneTasks.map((t) => ({ 标题: t.title, 项目: input.projects.find((p) => p.id === t.project_id)?.name ?? '无', 耗时分钟: t.duration_minutes })),
        每日记录: input.logs,
        项目进度: input.projects.map((p) => ({ 名称: p.name, 进度: `${p.progress}%`, 当前: p.current_focus, 下一步: p.next_step })),
      },
      null,
      1,
    )
    return await chat(
      settings,
      '你是科研助理。根据结构化数据写一份中文半月报(Markdown),分四节:完成工作、项目进度、问题与风险、下一步计划。基于事实,不编造,末尾给出一句总结。',
      facts,
    )
  } catch (e) {
    return `${reportLocalDraft(input)}\n\n(AI 生成失败,已降级为本地模板:${e instanceof Error ? e.message : '未知错误'})`
  }
}

# Research OS · 科研驾驶舱

[![Deploy to GitHub Pages](https://github.com/jacketlong23/Research-OS/actions/workflows/deploy.yml/badge.svg)](https://github.com/jacketlong23/Research-OS/actions/workflows/deploy.yml)

> 一个面向科研工作的智能时间规划器:以**今日安排**为主界面,以**本周课表**为辅助,
> 根据任务耗时、截止时间、重要性和项目优先级自动安排科研时间,
> 并记录实际完成情况,为每周复盘和半月报提供依据。

**🚀 在线使用:<https://jacketlong23.github.io/Research-OS/>**

核心原则:**今天优先,整周辅助;任务少而明确;计划留有余量;科研进度比清空 TODO 更重要。**

设计构想全文见 [Research_OS_科研驾驶舱设计构想(1).md](./Research_OS_科研驾驶舱设计构想(1).md)。

---

# 使用指南

> 只想用、不想改代码的话,看这一节就够了。

## 快速上手

1. 打开[在线地址](https://jacketlong23.github.io/Research-OS/),首次进入自带示例数据(论文写作 / 实验数据分析 / 课程学习),可在「设置 → 数据」重置
2. 每天打开只看**今日**页:Big 3 是今天最该做的三件事,时间轴上点 ✓ 完成任务
3. 新任务用一句话创建:「导师让我明天下午之前做一个结果图,大约 1 小时」→ 解析 → 确认,自动插入今天的空隙
4. 计划被打乱时点「🔄 智能重新安排」,只重排未来的块,已过去的时间不动
5. 睡前在**复盘**页花 2–5 分钟记三行:完成了什么 / 遇到什么问题 / 明天做什么
6. 半月后在复盘页一键生成半月报草稿

## 功能

| 页面 | 能做什么 |
| --- | --- |
| **今日**(默认首页) | Today's Big 3、工作时段内的时间轴(当前时间线、当前/下一任务、剩余可用时间)、一句话/表单新增任务、智能重新安排 |
| **本周** | 周一至周日课程表视图;拖拽时间块跨天移动;固定事件(组会/课)虚线显示;Deadline 旗标 |
| **任务/项目** | 任务按状态分组、全字段编辑(耗时/截止/重要度/可拆分/阻塞);项目进度卡(进度条/当前焦点/下一步/主题色) |
| **复盘** | 今日/本周/半月完成统计、最近 15 天投入柱状图、每日三行记录、半月报草稿 |
| **设置** | 工作时段与排程密度、AI 配置与连接测试、数据导出/导入/重置 |

## 排程规则(确定性规则,不依赖 LLM)

```
Score = 0.30×Urgency + 0.25×Importance + 0.20×DeadlineRisk + 0.15×Blocking + 0.10×ProjectPriority
```

- 支持**多个可配置工作时段**:默认上午 09:00–11:30、下午 14:00–17:30,晚间时段可按需开启;自动排程只在启用的工作时段内安排,午休等未启用时段不会排入任务
- 围绕固定事件计算空闲时间块,每日弹性任务总量 ≤ 启用工作时段总长的 78%(可调),给临时任务和 Debug 留余量
- 深度工作块 90–150 分钟,任务间缓冲 15 分钟,理论推导/写代码优先保证连续整块
- 不可拆任务放不下时顺延次日,并给出「预计超过截止」警告
- 已过去的时间块永不移动;新任务**增量插入**只填空隙,不打乱已有安排

## 数据与备份

Research OS 的个人数据默认保存在当前浏览器的 localStorage 中(5 个独立 key:projects / tasks / schedule / daily_logs / settings)。

普通刷新、关闭网页或重启电脑不会清除数据。

以下情况可能导致本地数据不可见或丢失:

- 更换浏览器
- 更换设备
- 使用隐私/无痕模式
- 主动清除该网站的浏览器数据

建议定期使用「设置 → 数据 → 导出 JSON」进行备份(导出的 JSON **不包含 API Key**),之后可随时导入恢复。

不同用户打开同一个 GitHub Pages 地址时,各自使用自己的浏览器 localStorage,不会看到其他用户的任务和科研记录。

## 账号与云同步(可选)

Research OS 默认仍是**纯本地应用**:不登录也能完整使用。登录后,同一个账号可以在 Mac / Windows / 不同浏览器之间同步 projects、tasks、schedule、daily_logs 和普通 settings。

### 怎么用

1. 右上角点「☁ 登录」,注册或登录 Supabase 账号。
2. **首次登录必须二选一**(刻意不自动覆盖,避免共享电脑残留数据被误传):
   - 「本机数据上传到云端」:以当前设备数据为准;
   - 「用云端数据覆盖本机」:以云端已有数据为准。
3. 绑定后自动同步:本地修改约 1.5 秒后防抖上传,页面重新获得焦点时拉取云端更新。
4. 两台设备同时改过同一份数据时会进入**冲突**状态,不会静默覆盖,由你选择保留哪一侧。
5. 退出账号会先尝试同步未保存修改,然后清除本机科研数据,避免下一个人在同一浏览器看到你的数据。

### 安全边界

- **AI API Key 永不云同步**:上传快照用显式白名单排除 `ai_api_key`,从云端下载设置时保留本机已有的 Key,退出时也不上传。
- **数据隔离靠 RLS**:数据库强制 `auth.uid() = user_id`,你只能读写自己的行。
- **前端只用 Publishable Key**(`sb_publishable_...`,本就是公开标识);`sb_secret_*` / `service_role` 是后端专用密钥,绝不进入前端。

### 常见坑

- **注册后提示去邮箱验证**:Supabase 新项目默认开启「注册后邮箱确认」,要么收邮件点链接,要么由管理员在 Authentication 里关闭 Confirm email。

---

# 开发者指南

> 想改代码、本地跑、自己部署或接入云同步,看这一节。

## 技术栈

React 18 + TypeScript(严格模式)+ Vite · Tailwind CSS v4 · zustand(localStorage 持久化) · react-router-dom(HashRouter) · Vitest · Supabase(Auth + Postgres RLS,可选云同步)

AI 为**可选增强**(OpenAI 兼容接口,默认 DeepSeek):自然语言建任务、优先级解释、半月报草稿。API Key 仅保存在当前浏览器 localStorage 中,不会上传到 Research OS 或 GitHub;未配置 Key 时自动降级为本地规则。出于安全考虑**不内置任何 API Key**:在设置页填入自己的 DeepSeek Key 即可,默认值为空。

## 项目结构

```
src/
├── engine/          # 排程引擎(纯函数,可单测)
│   ├── score.ts         # 评分:紧迫度/重要度/截止风险/阻塞/项目优先级
│   ├── scheduler.ts     # 空闲槽、日/周排程、增量插入、跨天移动
│   └── scheduler.test.ts
├── pages/           # 今日 / 本周 / 任务 / 复盘 / 设置 / 账号
├── components/      # 任务表单(手动 + 自然语言解析)
├── ai/client.ts     # OpenAI 兼容客户端,无 Key 全降级
├── cloud/           # 可选云同步(Supabase Auth + 快照 RLS),未配置时完全不介入
├── store/           # zustand persist × 5 个 localStorage key
├── lib/             # 时间工具 / 主题色映射 / 种子数据
└── types.ts         # Project / Task / Schedule / DailyLog / Settings
```

## 本地开发

```bash
npm install
npm run dev        # 本地开发(注意 base 为 /Research-OS/,访问 /Research-OS/ 路径)
npm test           # 排程引擎 + 云同步单元测试
npm run build      # 产物在 dist/
```

## 部署

push 到 `main` 自动触发 GitHub Actions:单元测试 → 构建 → 发布到 GitHub Pages。

## 启用云同步(Supabase 后端配置)

默认不配置任何 Supabase 变量时,应用保持纯本地模式,云同步代码完全不介入。

1. **创建 Supabase 项目**:登录 [supabase.com](https://supabase.com)(可用 GitHub 账号)→ **New project**,填名称、生成数据库密码(务必保存)、Region 选新加坡或东京,等 2–3 分钟初始化。
2. **建表**:进入项目 → 左侧 **SQL Editor** → **New query** → 粘贴 [`supabase/schema.sql`](./supabase/schema.sql) 全部内容 → **Run**。成功后左侧 Table Editor 能看到 `research_os_snapshots` 表(含 4 条 RLS 策略)。
3. **拿 URL 和 Publishable Key**:点右上角绿色 **Connect** 按钮(或 Settings → API)。注意 **Project URL 不在 API Keys 页面**,它在 Connect 弹窗或 Settings → General 里。
   - `VITE_SUPABASE_URL` ← Project URL(形如 `https://xxxx.supabase.co`)
   - `VITE_SUPABASE_PUBLISHABLE_KEY` ← Publishable key(`sb_publishable_...`;若项目仍显示旧版 `anon public` key,也可用)
   - ⚠️ 切勿使用 `sb_secret_*` / `service_role`:它们绕过 RLS,属后端专用密钥。
4. **本地配置**(开发用):
   ```bash
   cp .env.example .env.local
   # 编辑 .env.local,填入 VITE_SUPABASE_URL 和 VITE_SUPABASE_PUBLISHABLE_KEY
   ```
5. **GitHub Pages 配置**:在仓库 `Settings → Secrets and variables → Actions → Variables` 添加两个 Repository Variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`

   推送 `main` 后 `deploy.yml` 会把变量注入构建环境;再到 Actions 页手动 **Run workflow** 重新部署一次即可生效。

**关闭/不使用云同步**:不配置上述两个变量即可,所有现有功能不受影响。

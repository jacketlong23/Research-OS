# Research OS · 科研驾驶舱

[![Deploy to GitHub Pages](https://github.com/jacketlong23/Research-OS/actions/workflows/deploy.yml/badge.svg)](https://github.com/jacketlong23/Research-OS/actions/workflows/deploy.yml)

> 一个面向科研工作的智能时间规划器:以**今日安排**为主界面,以**本周课表**为辅助,
> 根据任务耗时、截止时间、重要性和项目优先级自动安排 09:00–20:30 的科研时间,
> 并记录实际完成情况,为每周复盘和半月报提供依据。

**🚀 在线使用:<https://jacketlong23.github.io/Research-OS/>**

核心原则:**今天优先,整周辅助;任务少而明确;计划留有余量;科研进度比清空 TODO 更重要。**

设计构想全文见 [Research_OS_科研驾驶舱设计构想(1).md](./Research_OS_科研驾驶舱设计构想(1).md)。

## 快速上手

1. 打开[在线地址](https://jacketlong23.github.io/Research-OS/),首次进入自带示例数据(REDACTED_RESEARCH_AREA REDACTED_RESEARCH_METHOD / REDACTED_RESEARCH_PROJECT / REDACTED_RESEARCH_METHOD 理论),可在「设置 → 数据」重置
2. 每天打开只看**今日**页:Big 3 是今天最该做的三件事,时间轴上点 ✓ 完成任务
3. 新任务用一句话创建:「导师让我明天下午之前做一个结果图,大约 1 小时」→ 解析 → 确认,自动插入今天的空隙
4. 计划被打乱时点「🔄 智能重新安排」,只重排未来的块,已过去的时间不动
5. 睡前在**复盘**页花 2–5 分钟记三行:完成了什么 / 遇到什么问题 / 明天做什么
6. 半月后在复盘页一键生成半月报草稿

## 功能

| 页面 | 能做什么 |
| --- | --- |
| **今日**(默认首页) | Today's Big 3、09:00–20:30 时间轴(当前时间线、当前/下一任务、剩余可用时间)、一句话/表单新增任务、智能重新安排 |
| **本周** | 周一至周日课程表视图;拖拽时间块跨天移动;固定事件(组会/课)虚线显示;Deadline 旗标 |
| **任务/项目** | 任务按状态分组、全字段编辑(耗时/截止/重要度/可拆分/阻塞);项目进度卡(进度条/当前焦点/下一步/主题色) |
| **复盘** | 今日/本周/半月完成统计、最近 15 天投入柱状图、每日三行记录、半月报草稿 |
| **设置** | 工作时间与排程密度、AI 配置与连接测试、数据导出/导入/重置 |

## 排程规则(确定性规则,不依赖 LLM)

```
Score = 0.30×Urgency + 0.25×Importance + 0.20×DeadlineRisk + 0.15×Blocking + 0.10×ProjectPriority
```

- 围绕固定事件计算空闲时间块,每日弹性任务总量 ≤ 78%(可调),给临时任务和 Debug 留余量
- 深度工作块 90–150 分钟,任务间缓冲 15 分钟,理论推导/写代码优先保证连续整块
- 不可拆任务放不下时顺延次日,并给出「预计超过截止」警告
- 已过去的时间块永不移动;新任务**增量插入**只填空隙,不打乱已有安排

## 技术栈

React 18 + TypeScript(严格模式)+ Vite · Tailwind CSS v4 · zustand(localStorage 持久化) · react-router-dom(HashRouter) · Vitest

AI 为**可选增强**(OpenAI 兼容接口,默认 DeepSeek):自然语言建任务、优先级解释、半月报草稿。
不配置 API Key 时全部功能自动降级为本地规则,不影响使用;Key 只保存在本机浏览器。
配置后可在「设置 → AI 配置」点 **测试连接** 验证(Base URL / 模型名 / Key 是否可用)。

## 项目结构

```
src/
├── engine/          # 排程引擎(纯函数,可单测)
│   ├── score.ts         # 评分:紧迫度/重要度/截止风险/阻塞/项目优先级
│   ├── scheduler.ts     # 空闲槽、日/周排程、增量插入、跨天移动
│   └── scheduler.test.ts
├── pages/           # 今日 / 本周 / 任务 / 复盘 / 设置
├── components/      # 任务表单(手动 + 自然语言解析)
├── ai/client.ts     # OpenAI 兼容客户端,无 Key 全降级
├── store/           # zustand persist × 5 个 localStorage key
├── lib/             # 时间工具 / 主题色映射 / 种子数据
└── types.ts         # Project / Task / Schedule / DailyLog / Settings
```

## 开发

```bash
npm install
npm run dev        # 本地开发(注意 base 为 /Research-OS/,访问 /Research-OS/ 路径)
npm test           # 排程引擎单元测试
npm run build      # 产物在 dist/
```

## 数据与备份

全部数据保存在浏览器 localStorage(5 个独立 key:projects / tasks / schedule / daily_logs / settings),
**换浏览器或清缓存前**,务必在「设置 → 数据」导出 JSON 备份,之后可随时导入恢复。

## 部署

push 到 `main` 自动触发 GitHub Actions:单元测试 → 构建 → 发布到 GitHub Pages。

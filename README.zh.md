[English](README.md) · **简体中文**

---

# plan-harness

一个用于结构化项目规划的 Claude Code 插件。由专职 agent 团队生成可交互的 HTML 文档，配合可组合的 markdown context 让输出贴合你自己的项目、场景和风格。

## 设计原则

### 1. Context 决定一切

Context 文件（`.md`）是规划质量最关键的输入。它们像是针对特定场景的 `CLAUDE.md` — LLM 会直接读取并按里面的指令执行。

**context 越具体，输出越好。**「这 5 个 admin 页面、这些 API 端点、当前的加载时间」比「这是一个 React + .NET 项目」能产出质量高得多的规划。

Context 支持多选组合，颗粒度随你：
- 整个项目 → 某个功能区 → 具体的页面/API
- 开发环境 → 构建流程 → 团队约定
- 生成规则：要哪些文档、要什么图表、什么主题

### 2. 三层懒加载（参考 Claude Code）

Claude Code 的 prompt 架构用懒加载 — skill 的描述始终在上下文里（约 450 tokens），完整正文只在真正被调用时才加载。我们复用同样的模式：

| 层级 | 内容 | 何时加载 | Token 成本 |
|------|------|----------|-----------|
| **第 1 层** | Context 名称 + 描述（来自 frontmatter） | 始终可见 — 名称存 `manifest.json`，描述从 frontmatter 读 | 每个 context 约 50 |
| **第 2 层** | Summary + Details 分节 | 派发 agent 时按 `agents` frontmatter 过滤 | 不固定 |
| **第 3 层** | 参考数据（API 表格、基线数据等） | 按需 — agent 需要时自己读 | 仅在相关时 |

### 3. Agent 定向路由

不是每个 agent 都需要每个 context。frontmatter 的 `agents` 字段决定谁能看到什么：
- Writer 看生成规则（图表类型、主题、反模式）
- Architect 看项目架构和 API 地图
- Tester 看测试约定和覆盖率要求
- Summary 节所有人都能看

### 4. Markdown 而非 Config

Context、prompt、skill 都是 markdown。LLM 直接阅读 — 没有 JSON schema、没有解析层、没有僵硬的结构。好处是：
- 用户可以用任意文本编辑器读写 context
- LLM 跟随自然语言指令，而不是配置开关
- 新规则就是一段话，不需要迁移 schema

### 5. 自包含的输出

每个生成的 HTML 文件都把 CSS 和 JS 全部内联。无 CDN、无外部依赖。任何浏览器打开、转发给同事、打印成 PDF 都没问题。

---

## 快速开始

```bash
# 安装
claude plugins marketplace add https://github.com/wangcansunking/can-claude-plugins
claude plugins install plan-harness@can-claude-plugins

# 导入自带的 context 模板
/plan-context init

# 通过引导式对话创建项目专属 context
/plan-context create

# 开始规划 — 选 context、创建 scenario
/plan-init

# 一次性生成所有文档
/plan-full
```

---

## 工作流程

```
/plan-context create ──── 创建 markdown context 文件（.md）
         │                （项目知识、生成规则、或二者兼有）
         │
/plan-init ──────────── 多选 context + 创建/选择 scenario
         │              → 把 context 写进 manifest.json
         │
/plan-gen <type> ─────── 统一分派器 — 通过多选 UI 或参数挑选文档类型：
         │                • design           → design.html
         │                • state-machine    → state-machine.html
         │                • test-plan        → test-plan.html
         │                • test-cases       → test-cases.html
         │                • implementation   → implementation-plan.html
         │                • test-report      → test-report.html
         │                • analysis         → analysis.html
         │
/plan-full ──────────── 端到端编排整个工作流
/plan-sync ──────────── 上游文档变更时，级联重生所有下游
/plan-test ──────────── 通过 Playwright MCP 跑 test-plan 里的场景
/plan-share ─────────── 通过 devtunnel 分享（公开 / 密码保护）
/plan-review ────────── 针对某个文档按 section 逐段 review
/plan-review-cycle ──── 全量 review，跨文档一致性校验
/plan-revise ────────── 批量派发待处理的 revise-intent 评论
```

具体生成哪些文档由选择的"生成规则"context 决定：
- **feature-planning**：7 个文档（完整套件，含测试和状态机）
- **performance-audit**：4 个文档（index、analysis、design、implementation）
- **lean**：2 个文档（design + implementation）

---

## Context 系统

### 什么是 Context？

`plans/.contexts/` 下的 markdown 文件，为规划流水线提供指令。常见两类：

| 类型 | 示例 | 内容 |
|------|------|------|
| **项目知识** | `devxapps-project.md` | 路径、构建命令、架构、约定、已知问题 |
| **生成规则** | `performance-audit.md` | 要生成哪些文档、内容风格、图表类型、主题、反模式 |

同一个文件两者都可以写。Context 是可组合的 — 在 `/plan-init` 里多选即可。

### Context 文件格式

```markdown
---
name: my-context
description: 一行描述（始终出现在第 1 层）
tags: [project, generation-rules]
agents: [architect, writer]
---

# 标题

## Summary
<!-- 始终被注入。控制在 200 词内。 -->

## Details
<!-- 只注入给匹配的 agent。 -->

## Reference
<!-- 需要时 agent 按需读取。 -->
```

### 组合示例

```
devxapps-project.md          （项目：构建、约定、架构）
  + portal-admin-pages.md    （场景：具体页面、API、基线）
  + performance-audit.md     （规则：4 个文档、Tokyo Night、反模式）
  = 本次规划的有效 context
```

后面的 context 会在冲突时覆盖前面的。顺序有意义。

---

## Agent 团队

| 角色 | Prompt | 关注点 |
|------|--------|--------|
| **Architect** | `prompts/architect-prompt.md` | 数据模型、API 契约、SVG 图、依赖关系 |
| **PM** | `prompts/pm-prompt.md` | 需求、用户故事、验收标准、范围 |
| **Frontend Dev** | `prompts/frontend-dev-prompt.md` | 组件、状态管理、路由、可访问性 |
| **Backend Dev** | `prompts/backend-dev-prompt.md` | API 实现、数据访问、服务、部署 |
| **Tester** | `prompts/tester-prompt.md` | E2E 场景、测试用例、覆盖率矩阵 |
| **Writer** | `prompts/writer-prompt.md` | HTML 组装、CSS 主题、侧栏导航、交叉引用 |

---

## MCP 工具

本地 stdio server 暴露 12 个工具：

| 工具 | 作用 |
|------|------|
| `plan_list_scenarios` | 扫描 workspace 里所有 scenario，列出文件清单 |
| `plan_create_scenario` | 创建 scenario 目录及 manifest |
| `plan_get_files` | 列出 plan 文件及元数据 |
| `plan_check_completion` | 根据代码证据检查实现进度 |
| `plan_get_context` | 分析代码库：技术栈、模式、约定 |
| `plan_serve_dashboard` | 在 `localhost:3847` 启动本地 HTTP dashboard |
| `plan_share` | 为某个 scenario 启动 devtunnel（公开 / 私有 / 密码） |
| `plan_share_stop` | 关闭正在运行的 devtunnel |
| `plan_reanchor` | 文档编辑后修复漂移的 W3C 风格锚点 |
| `plan_list_pending_revises` | 列出等待 writer 提案的 revise-intent 评论 |
| `plan_list_pending_mentions` | 列出排队给 agent 角色的 @-mention 评论 |
| `plan_post_persona_reply` | 给某个 @-mention 线程发布角色回复 |

---

## Skill 列表

10 个 skill。绝大多数按文档类型的 per-doc 生成器被合并进了 `/plan-gen`。

| Skill | 作用 |
|-------|------|
| `/plan-context` | 创建、列出、编辑、导入 context 文件 |
| `/plan-init` | 多选 context + 创建/选择 scenario |
| `/plan-gen` | 统一生成器 — 单选或多选文档类型（design / state-machine / test-plan / test-cases / implementation / test-report / analysis） |
| `/plan-full` | 带检查点编排完整工作流 |
| `/plan-sync` | 上游变更后级联重生下游文档 |
| `/plan-test` | 用 Playwright MCP 端到端跑 `test-plan.html` 里的场景 |
| `/plan-share` | 通过 devtunnel 分享 plan 文档（公开 / 私有 / 密码） |
| `/plan-review` | 针对单个文档按 section 逐段 review |
| `/plan-review-cycle` | 跨文档一致性的全量 review |
| `/plan-revise` | 把待处理的 revise-intent 评论批量派给 writer 产出提案 |

---

## 插件目录结构

```
plan-harness/
├── contexts/                    自带的 context 模板
│   ├── feature-planning.md      完整 7 文档套件
│   ├── performance-audit.md     4 文档的数据驱动审计
│   ├── lean.md                  最小化 2 文档
│   └── _example-project.md      项目 context 模板
├── skills/                      10 个 skill 定义（SKILL.md）
├── prompts/                     6 个 agent 角色模板
├── local-proxy/                 MCP server + Web dashboard
│   ├── start.js                 启动器（自动装依赖）
│   └── src/
│       ├── index.js             MCP server（12 个工具，stdio）
│       ├── plan-manager.js      Plan 文件操作
│       ├── web-server.js        HTTP dashboard（node:http）
│       └── templates/base.js    HTML 模板系统
└── docs/
    ├── overview.html            静态总览
    └── context-design.md        Context 系统设计文档
```

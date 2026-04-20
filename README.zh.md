[English](README.md) · **简体中文**

---

# plan-harness

一个 Claude Code 插件，把项目的 spec / plan 阶段变成可复制、高质量的流水线。专职 agent 团队生成相互关联的 HTML 规划文档 — 设计文档、状态机、测试计划、测试用例、实施计划 — 配合可组合的 markdown context 让输出贴合你自己的项目、场景和风格。

## 安装

```bash
# 1. 添加市场
claude plugin marketplace add https://github.com/wangcansunking/can-claude-plugins

# 2. 安装插件
claude plugin install plan-harness@can-claude-plugins

# 3. 在任意 Claude Code 会话里启动规划工作流
/plan-context init          # 导入自带 context 模板
/plan-init                  # 多选 context + 创建 scenario
/plan-gen                   # 生成文档（多选 UI）
```

![plan-harness 总览](docs/screenshots/01-overview-hero.png)

## 为什么

多数「AI 设计文档」工具就是对着模糊的需求跑一次 prompt。plan-harness 反过来：分层 context + 多 agent 流水线，产出可以真的落地的文档。

- **Context 决定一切。**可组合的 `.md` context 承载项目路径、约定、API 地图、生成规则。context 越具体，plan 越好。
- **真正的 agent 团队**，不是单个 prompt。Architect、PM、Frontend Dev、Backend Dev、Tester、Writer — 每个 agent 只看自己需要的那部分 context。
- **一个分派器**，七种文档。`/plan-gen` 通过多选 UI 或参数挑选任意子集（design / state-machine / test-plan / test-cases / implementation / test-report / analysis）。
- **交互式 HTML**，完全自包含。每个生成文件内联所有 CSS + JS。无 CDN、无外部依赖。任意浏览器打开、打印 PDF、发给同事都行。
- **Review + Revise 循环。**按 section 逐段 review、跨文档一致性校验、对 reviewer 的评论批量派发 writer agent 生成提案。
- **可分享。**一条命令通过 devtunnel 把整套 plan 发出去 — 公开、私有、或带密码 — 不用离开 Claude Code。

## 功能

### 统一的 `/plan-gen` 分派器

一条命令生成任意规划文档。多选 UI 挑选一个或多个类型，也可以直接传参：

```
/plan-gen                   # 交互式多选
/plan-gen design            # 只生成 design.html
/plan-gen design test-plan  # design + test-plan，按拓扑顺序
/plan-gen all               # 转交给 /plan-full
```

文档类型之间的依赖（analysis → design → state-machine / test-plan → test-cases → implementation → test-report）自动解析，下游文档读的是本次刚生成的上游输出。完整顺序见下方 [§标准工作流](#标准工作流)。

### 标准工作流

```
analysis  →  design  ┬─►  state-machine  ─────────────────┐
                     │                                      │
                     ├─►  test-plan   ─►  test-cases  ─────┤
                     │                                      │
                     └─►  implementation   ◄────────────────┘
                              │
                              └─►  test-report
```

硬依赖（必需）与软依赖（可选）：

| 文档 | 必需上游 | 可选上游 |
|---|---|---|
| `analysis` | — | — |
| `design` | — | `analysis` |
| `state-machine` | `design` | — |
| `test-plan` | `design` | — |
| `test-cases` | `design`, `test-plan` | — |
| `implementation` | `design` | `state-machine`, `test-plan`, `test-cases` |
| `test-report` | `test-plan` | `implementation` |

`/plan-gen` 会对你挑的子集做拓扑排序;`/plan-full` 带 checkpoint 跑完整条流水线;`/plan-sync` 把某个上游的改动级联到所有下游。

### 插件架构一览

![插件架构](docs/screenshots/02-plugin-architecture.png)

三块：13 个工具的 MCP server、11 个 slash 命令、6 个 agent 角色。组合起来输出 7 种 HTML 文档。

### 两层 Context 系统

Context 是可组合的 markdown。项目级 context（路径、构建命令、约定）跨 scenario 持久存在；scenario 级 context 层叠在上面，加入单个功能的具体信息。冲突时后面的 context 覆盖前面的。

```
devxapps-project.md          （项目：构建、约定、架构）
  + portal-admin-pages.md    （场景：具体页面、API、基线）
  + performance-audit.md     （规则：4 个文档、Tokyo Night、反模式）
  = 本次规划的有效 context
```

每个 context `.md` 用 frontmatter（`name`、`description`、`tags`、`agents`）限定谁能看到 — 让 prompt 保持精简。

### Review + Revise 循环

- `/plan-review` 对单个文档按 section 逐段走，派发对应角色的 reviewer。
- `/plan-review-cycle` 对 scenario 里所有文档跑完整 review 矩阵，标出跨文档矛盾。
- `/plan-revise` 批量处理待确认的 revise-intent 评论，派 writer agent 产出逐字替换提案，在 dashboard 里以「Proposal ready」标签呈现。

### 端到端执行（Playwright MCP）

`/plan-test` 读取 `test-plan.html` 里列的场景，通过 Playwright MCP 跑真实 UI — 而不是 synthetic fetch — 所以能抓到 API 层 smoke test 漏掉的 UX 回归。

### 一键分享

`/plan-share` 把 devtunnel 封装好，一步就能把整套 plan 推到一个短期公开 URL（或带密码的私有 URL）。scenario 存活期间 tunnel 会自维持。

## Slash 命令

| 命令 | 作用 |
|---|---|
| `/plan-context` | 创建、列出、编辑、导入 context 文件 |
| `/plan-init` | 多选 context + 创建/选择 scenario |
| `/plan-gen` | 统一生成器 — 任意挑选文档类型子集 |
| `/plan-full` | 带检查点编排整个工作流 |
| `/plan-sync` | 上游变更后级联重生下游文档 |
| `/plan-test` | 用 Playwright MCP 端到端跑 `test-plan.html` 场景 |
| `/plan-share` | 通过 devtunnel 分享 plan 文档（公开 / 私有 / 密码） |
| `/plan-review` | 针对单个文档按 section 逐段 review |
| `/plan-review-cycle` | 跨文档一致性的全量 review |
| `/plan-revise` | 把待确认的 revise-intent 评论批量派给 writer 产出提案 |
| `/plan-restart` | 退出 MCP server,让 Claude Code 用刚安装的新 bundle 重启它 |

## MCP 工具

本地 stdio server 暴露 12 个工具 — 为 slash 命令提供文件系统和 dashboard 操作面：

| 工具 | 作用 |
|---|---|
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

## Agent 团队

| 角色 | Prompt | 关注点 |
|------|--------|--------|
| **Architect** | `prompts/architect-prompt.md` | 数据模型、API 契约、SVG 图、依赖关系 |
| **PM** | `prompts/pm-prompt.md` | 需求、用户故事、验收标准、范围 |
| **Frontend Dev** | `prompts/frontend-dev-prompt.md` | 组件、状态管理、路由、可访问性 |
| **Backend Dev** | `prompts/backend-dev-prompt.md` | API 实现、数据访问、服务、部署 |
| **Tester** | `prompts/tester-prompt.md` | E2E 场景、测试用例、覆盖率矩阵 |
| **Writer** | `prompts/writer-prompt.md` | HTML 组装、CSS 主题、侧栏导航、交叉引用 |

## 仓库结构

```
plan-harness/
  .claude-plugin/plugin.json         插件元数据
  .mcp.json                          MCP server 接线
  contexts/                          自带 context 模板（feature-planning、performance-audit、lean）
  prompts/                           6 个 agent 角色模板
  skills/                            10 个 skill 定义（各一份 SKILL.md）
  local-proxy/                       Node MCP server + Web dashboard
    start.js                         启动器（自动装依赖）
    src/
      index.js                       MCP server（12 个工具，stdio）
      plan-manager.js                Plan 文件操作
      web-server.js                  HTTP dashboard（node:http）
      templates/base.js              自包含 HTML 模板系统
  docs/
    overview.html                    静态插件总览（见上方截图）
    context-design.md                Context 系统设计文档
    screenshots/                     本 README 使用的图片
```

## 开发

从源码开始：

```bash
git clone https://github.com/wangcansunking/plan-harness
cd plan-harness/local-proxy
npm install
npm run dev                 # 构建 + 同步到 Claude Code 插件缓存
```

其他脚本（都在 `local-proxy/` 下）：

```bash
npm run build               # esbuild src → dist/index.js
npm run sync                # 把当前目录拷进 Claude Code 缓存
npm run prepare-release     # install + build（pre-commit / 发布）
```

完整的「工作副本 ↔ 插件缓存」对照流程、以及可选的 symlink 零拷贝小技巧，见 [DEVELOPMENT.md](DEVELOPMENT.md)。

## Changelog

见 [CHANGELOG.md](CHANGELOG.md)。

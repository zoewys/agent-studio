# Agent Studio — UI 设计规范与功能全景文档

> **文档目的**：为 UI 设计师提供完整的功能清单、交互流程、页面结构，作为高端 UI 重设计的基础依据。
>
> **三版设计方向**：
> 1. **墨垣 (Ink & Silicon)** — 科技感 × 中国风暗纹，克制融合
> 2. **霓渊 (Neon Abyss)** — 赛博朋克，暗夜中的代码洪流
> 3. **息壤 (Breathing Earth)** — 自定方向：有机科技，会呼吸的工具
>
> **交付物要求**：设计师需用 **React + Tailwind CSS 编写可独立运行的 HTML 文件** 作为设计稿，每个方向产出关键页面的静态高保真原型，直接在浏览器中打开即可预览交互形态。

---

## 目录

1. [产品概述](#1-产品概述)
2. [全局架构](#2-全局架构)
3. [模式详解与功能清单](#3-模式详解与功能清单)
4. [交互流程全景](#4-交互流程全景)
5. [状态与反馈体系](#5-状态与反馈体系)
6. [数据与持久化](#6-数据与持久化)
7. [三版设计方向详述](#7-三版设计方向详述)
8. [组件清单](#8-组件清单)
9. [设计约束与技术要求](#9-设计约束与技术要求)
10. [设计交付物规范](#10-设计交付物规范) ← 交付方式、页面清单、模板结构

---

## 1. 产品概述

### 1.1 一句话定义

Agent Studio 是一个 **本地桌面应用**（macOS / Windows / Linux），让用户在可视化画布上编排多个 AI Agent 组成工作流，自动运行、审查结果、积累记忆，并支持定时调度。

### 1.2 用户画像

- **单人使用**（非 SaaS，非多租户）
- 技术背景：开发者 / 高级用户
- 使用场景：日常深度使用，长时间停留
- 核心诉求：效率、掌控感、沉浸

### 1.3 技术底座

| 层 | 技术 |
|---|------|
| 桌面壳 | Electron 28 |
| 前端 | React 18 + TypeScript + Vite |
| 画布 | @xyflow/react (React Flow) |
| AI 后端 | 本地 CLI 进程 (Claude Code / Codex) + Vercel AI SDK (API 直连) |
| 数据 | 本地 JSON 文件，无云端 |
| 通知 | 飞书机器人 / macOS 角标 / 系统托盘 |

---

## 2. 全局架构

### 2.1 应用外壳 (App Shell)

```
┌──────────────────────────────────────────────────────┐
│  HEADER BAR                                           │
│  [Brand] [Subtitle]          [Chips: run counts...]  │
├────────┬─────────────────────────────────────────────┤
│ MODE   │                                              │
│ RAIL   │         WORKSPACE AREA                       │
│        │                                              │
│  ◉ WF  │    (mode-specific content)                   │
│  ◉ TPL │                                              │
│  ◉ AGT │                                              │
│  ◉ RUN │                                              │
│  ◉ SET │                                              │
│        │                                              │
├────────┴─────────────────────────────────────────────┤
│  STATUS BAR (optional)                                │
└──────────────────────────────────────────────────────┘
```

**五个模式 (ModeRail)**：
1. **Workflow** (`workflow`) — 工作流运行：启动、监控、审查历史
2. **Templates** (`templates`) — 工作流模板：DAG 画布编辑器
3. **Agents** (`agents`) — Agent 定义：CRUD 管理
4. **Single Run** (`single`) — 单次对话：快速和单个 Agent 交互
5. **Settings** (`settings`) — 系统设置：CLI / API / 数据 / 通知

### 2.2 导航逻辑

- ModeRail 始终可见，当前模式高亮
- 各模式之间**独立状态**，切换不丢失上下文（Keep-alive）
- Header 全局固定，ModeRail 左侧固定
- Workspace 区域为可变内容区

### 2.3 全局覆盖层

以下组件可出现在任何模式之上：

- **CliSetupDialog** — CLI 缺失时的安装引导弹窗
- **系统托盘菜单** — 最小化到托盘后的右键菜单
- **飞书通知卡片** — 运行结束/审批的推送卡片（外部）
- **全局 Toast / Notification** — 操作反馈

---

## 3. 模式详解与功能清单

---

### 3.1 模式一：Workflow（工作流运行）

> **核心场景**：启动工作流、实时监控运行过程、审查历史运行记录

#### 3.1.1 页面布局

```
┌──────────────────────────────────────────────────────────┐
│  HEADER: [← Back?] [Run Name] [Status Badge] [Cost/Token]│
├──────────────┬───────────────────────┬───────────────────┤
│  RUNS LIST   │    RUN DETAIL         │  FILE PREVIEW     │
│  (sidebar)   │                       │  (right panel)    │
│              │  ┌─ Step Chips ────┐  │                   │
│  [Search]    │  │ [1][2∥3∥4][5]  │  │  Tab: Code        │
│  [Filter]    │  └────────────────┘  │  Tab: Preview     │
│              │                       │  Tab: Diff        │
│  Run 1  ●    │  ┌─ Prompt ────────┐  │                   │
│  Run 2  ◉    │  │ (editable)      │  │                   │
│  Run 3  ✓    │  └────────────────┘  │                   │
│  Run 4  ✗    │                       │                   │
│  Run 5  ⏸    │  ┌─ Transcript ───┐  │                   │
│              │  │ event stream    │  │                   │
│  [+ New]     │  │ ...             │  │                   │
│              │  └────────────────┘  │                   │
│              │                       │                   │
│              │  ┌─ Artifacts ─────┐  │                   │
│              │  │ [file cards]    │  │                   │
│              │  └────────────────┘  │                   │
│              │                       │                   │
│              │  ┌─ Memory Refs ───┐  │                   │
│              │  │ [memory chips]  │  │                   │
│              │  └────────────────┘  │                   │
│              ├───────────────────────┤                   │
│              │  COMPOSER BAR        │                   │
│              │  [input]      [Send] │                   │
└──────────────┴───────────────────────┴───────────────────┘
```

#### 3.1.2 Runs List（左侧运行列表）

| 功能 | 交互 |
|------|------|
| 运行列表 | 历史 + 正在运行的混合列表，按时间倒序 |
| 运行项 | 显示：名称、状态图标、时间、耗时、Agent 数量 |
| 状态标识 | `running` / `awaiting-confirm` / `awaiting-input` / `completed` / `error` / `aborted` |
| 搜索/过滤 | 按名称搜索、按状态过滤 |
| 新建按钮 | `[+ New Task]` 打开右侧抽屉 |
| 实时更新 | 运行中项目动态更新状态和 token 计数 |

#### 3.1.3 NewWorkflowRunDrawer（新建运行抽屉）

| 功能 | 交互 |
|------|------|
| 模板选择 | 下拉选择已定义的 workflow template |
| 项目路径 | 文件夹选择器，指定工作目录 |
| 初始 Prompt | 文本输入框，启动时传给第一个 Agent |
| Git 安全检查 | 自动检测未提交更改、与远程的差异，列出警告 |
| 安全确认 | 用户确认 Git 警告后才能启动 |
| 启动按钮 | `[Start Run]` |

#### 3.1.4 Run Detail（中间运行详情）

**Header 区**：
| 功能 | 交互 |
|------|------|
| 运行名称 | 可编辑 |
| 状态徽章 | 实时状态显示（带动画） |
| Token 用量 | 实时累计 token 数 |
| 费用估算 | 基于模型定价的 USD 估算 |
| 操作按钮 | Abort（中止）、Rerun（重跑） |

**Step Chips（步骤导航条）**：
| 功能 | 交互 |
|------|------|
| 步骤序号 | 水平排列的芯片，点击切换查看各步骤 |
| 并行组显示 | 并行步骤堆叠显示，如 `[2 ∥ 3 ∥ 4]` |
| 状态标识 | 每步显示：pending / running / done / error / skipped |
| 快速操作 | 右键菜单：Rerun step、Skip、Jump to |

**Prompt 区**：
| 功能 | 交互 |
|------|------|
| 当前步骤 Prompt | 显示发送给 Agent 的完整 prompt（含注入的记忆上下文） |
| 可编辑 | 运行前可编辑，运行时只读 |
| 折叠/展开 | 默认折叠（节省空间），可展开查看完整内容 |

**Transcript Viewer（事件流）**：
| 功能 | 交互 |
|------|------|
| 实时事件流 | 逐 token 流式显示 Agent 的输出 |
| 事件类型 | 工具调用、工具结果、思考过程、文本输出、错误 |
| 滚动行为 | 自动跟随最新，用户上滚后暂停自动滚动 |
| 折叠工具输出 | 工具调用的长输出默认折叠 |
| 搜索 | 在 transcript 中搜索关键词 |
| 颜色编码 | 不同事件类型不同颜色/样式区分 |

**Artifacts 区**：
| 功能 | 交互 |
|------|------|
| 文件卡片 | Agent 产出的文件以卡片展示 |
| 点击预览 | 点击卡片在右侧文件预览面板打开 |
| 多文件 | 支持多文件产出，水平排列 |
| 文件类型图标 | 按扩展名显示对应图标 |

**Memory References 区**：
| 功能 | 交互 |
|------|------|
| 记忆芯片 | 展示注入到当前运行的记忆条目 |
| 可折叠 | 默认折叠，展开显示记忆摘要和强度 |

**Composer Bar（底部输入栏）**：
| 功能 | 交互 |
|------|------|
| 文本输入 | 多行输入框，支持 Enter 发送 |
| 发送按钮 | 主操作按钮 |
| 上下文提示 | 显示当前输入将发送给哪个 Agent |
| 可用状态 | 仅在 `awaiting-input` 状态时可用 |

#### 3.1.5 File Preview Panel（右侧文件预览）

| 功能 | 交互 |
|------|------|
| Tab 切换 | Code / Preview / Diff 三个 Tab |
| Code Tab | 语法高亮的源代码查看 |
| Preview Tab | Markdown/HTML 渲染预览 |
| Diff Tab | Git diff 视图 |
| 关闭按钮 | 关闭预览面板 |
| 响应式宽度 | 可拖拽调整面板宽度 |

#### 3.1.6 Schedule（定时任务）

| 功能 | 交互 |
|------|------|
| Schedule List | 所有定时任务列表 |
| Schedule Detail | 单个定时任务详情（cron、上次运行、下次运行） |
| Schedule Drawer | 新建/编辑定时任务 |
| Cron 输入 | 5 字段 cron 表达式输入（分 时 日 月 周） |
| Cron 预览 | 人类可读的调度描述 + 下次运行时间预览 |
| 启用/停用 | 开关切换 |
| 自动确认 | 定时任务可开启 "自动确认" 模式，跳过人工审批 |

---

### 3.2 模式二：Templates（工作流模板编辑）

> **核心场景**：可视化编排多 Agent 工作流，这是用户使用频率最高的模式

#### 3.2.1 页面布局

```
┌──────────────────────────────────────────────────────────┐
│  TOOLBAR: [Template Selector ▼] [Save] [Undo][Redo]     │
│           [Zoom][Fit] [Layout] [Settings]                │
├──────────┬────────────────────────────────┬──────────────┤
│ AGENT    │                                 │ PROPERTY     │
│ SIDEBAR  │      CANVAS (React Flow)        │ PANEL        │
│          │                                 │              │
│ [Agent1] │   [Node]──→[Node]               │ Agent:       │
│ [Agent2] │      ↘         ↗                │  name, role  │
│ [Agent3] │   [Parallel Group]              │  vendor      │
│ [Agent4] │      [A] [B] [C]                │  model       │
│          │       ↘   ↓   ↗                 │  prompt      │
│ [drag   ]│         [Node]                  │              │
│  to add ]│                                 │ Error        │
│          │                                 │ Handling:    │
│          │  [MiniMap] (右下角)              │  on error →  │
│          │                                 │  on done →   │
│          │                                 │  failure →   │
└──────────┴────────────────────────────────┴──────────────┘
```

#### 3.2.2 Agent Sidebar（Agent 侧边栏）

| 功能 | 交互 |
|------|------|
| Agent 列表 | 显示所有已定义的 Agent（名称 + 角色图标） |
| 拖拽添加 | 从侧边栏拖拽 Agent 到画布上创建节点 |
| 搜索 | 快速搜索 Agent |
| 筛选 | 按 Vendor 筛选 |
| 新建 Agent | 快捷入口跳转到 Agent 管理 |

#### 3.2.3 Canvas（DAG 画布）

| 功能 | 交互 |
|------|------|
| 节点 (AgentNode) | 卡片样式，显示 Agent 名称、角色、模型 |
| 节点选中 | 点击选中，显示蓝色边框，右侧属性面板更新 |
| 节点移动 | 拖拽移动节点位置 |
| 节点删除 | Delete 键或右键菜单删除 |
| 连线 (Edge) | 从源节点输出端拖到目标节点输入端 |
| 条件边 (ConditionalEdge) | 带标签的边，显示路由条件 |
| 并行组 (Parallel Group) | 框选多个节点 → 右键"创建并行组"，虚线框包围 |
| 画布缩放 | 滚轮缩放，触控板捏合 |
| 画布平移 | 空白区域拖拽 / 滚轮 |
| 小地图 (MiniMap) | 右下角缩略图，显示全局视图 |
| 撤销/重做 | Ctrl+Z / Ctrl+Shift+Z，工具栏按钮 |
| 自适应 | Fit 按钮自动调整视口 |
| 自动布局 | 一键整理节点布局 |
| 右键菜单 | 添加 Agent、创建并行组、删除、复制 |

#### 3.2.4 Property Panel（右侧属性面板）

| 功能 | 交互 |
|------|------|
| Agent 选择 | 下拉切换当前节点的 Agent |
| 角色描述 | 覆盖 Agent 默认角色 |
| 模型选择 | 覆盖默认模型 |
| Prompt 模板 | 编辑该步骤的 prompt（支持变量） |
| 步骤规则 | 配置 on-error / on-handoff-failed / on-done 行为 |
| 动作选项 | retry / skip / goto-step / stop |
| 失败策略 | stop / retry-then-notify / retry-then-goto |
| 交互式步骤 | 开关，标记为需要用户输入才继续 |
| 预算上限 | 该步骤的 USD 预算上限 |

#### 3.2.5 工具栏 (Toolbar)

| 功能 | 交互 |
|------|------|
| 模板选择器 | 下拉切换已保存的模板 |
| 新建模板 | 创建空白模板 |
| 保存 | 保存当前模板 |
| 另存为 | 复制模板 |
| 删除模板 | 删除当前模板 |
| 撤销/重做 | 操作历史 |
| 缩放控制 | 百分比显示 + +/- 按钮 |
| 适应画布 | 一键缩放至适合窗口 |
| 导出模板 | 导出为 JSON 文件 |
| 导入模板 | 从 JSON 文件导入 |

---

### 3.3 模式三：Agents（Agent 管理）

> **核心场景**：定义和管理 AI Agent 的配置

#### 3.3.1 页面布局

```
┌──────────────────────────────────────────────┐
│  HEADER: [Agent Management]        [+ New]   │
├──────────────┬───────────────────────────────┤
│  AGENT LIST  │    AGENT EDITOR               │
│              │                               │
│  Agent 1 ◉   │  Name:        [__________]    │
│  Agent 2     │  Role:        [__________]    │
│  Agent 3     │  Vendor:      [▼ Claude]      │
│  Agent 4     │  Model:       [▼ Sonnet]      │
│              │  Permission:  [▼ Default]     │
│  [+ New]     │                               │
│              │  System Prompt:               │
│              │  ┌──────────────────────────┐  │
│              │  │ (large textarea)         │  │
│              │  │                          │  │
│              │  └──────────────────────────┘  │
│              │                               │
│              │  ── Codex Options ──────────  │
│              │  Reasoning: [▼ Medium]        │
│              │  Tier:      [▼ Default]       │
│              │                               │
│              │  ── Reflection Settings ────  │
│              │  (memory learning config)     │
│              │                               │
│              │  ── Memory Panel ──────────  │
│              │  (view agent's memories)      │
└──────────────┴───────────────────────────────┘
```

#### 3.3.2 Agent List（左侧列表）

| 功能 | 交互 |
|------|------|
| Agent 列表 | 所有已定义的 Agent |
| 列表项 | 显示名称、角色图标、Vendor 标识 |
| 选中 | 点击选中，右侧加载编辑表单 |
| 新建 | 按钮创建新 Agent |
| 删除 | 右键或按钮删除 |
| 搜索 | 搜索 Agent 名称 |

#### 3.3.3 Agent Editor（右侧编辑区）

| 字段 | 说明 |
|------|------|
| Name | Agent 名称（唯一标识） |
| Role | 角色描述（如 "代码审查员"） |
| Vendor | `claude` / `codex` / `api` |
| Model | 模型选择，根据 Vendor 动态加载可用模型列表 |
| Permission Mode | `default` / `acceptEdits` / `bypassPermissions` / `plan` |
| System Prompt | 系统级提示词，定义 Agent 的行为准则 |
| Codex Reasoning | 仅 Codex：推理深度 (low/medium/high) |
| Codex Tier | 仅 Codex：服务等级 (default/flex) |
| API Provider | 仅 API 模式：选择已配置的 API 提供商 |
| Reflection Settings | 记忆学习：启用/禁用、反思模型选择 |
| Memory Panel | 查看该 Agent 已积累的记忆（分类、强度、时间） |

#### 3.3.4 Memory Panel（记忆面板，Agent 编辑的子面板）

| 功能 | 交互 |
|------|------|
| 记忆列表 | 该 Agent 的所有记忆条目 |
| 分类筛选 | method / knowledge / preference / avoidance |
| 强度显示 | 每条记忆的强度分数 |
| 遗忘曲线 | 展示记忆衰减趋势 |
| 手动管理 | 可手动删除或调整记忆 |
| 范围标识 | global 还是 project-specific |

---

### 3.4 模式四：Single Run（单次运行）

> **核心场景**：快速和单个 Agent 对话，不涉及工作流编排

#### 3.4.1 页面布局

```
┌──────────────────────────────────────────────┐
│  SINGLE RUN PANEL                            │
│                                              │
│  ┌─ Config (collapsible) ─────────────────┐  │
│  │  Agent:      [▼ Select Agent]          │  │
│  │  Vendor:     [▼ claude/codex/api]      │  │
│  │  Model:      [▼ model name]            │  │
│  │  Provider:   [▼ API provider]          │  │
│  │  Project:    [Select Folder...]        │  │
│  │  Prompt:                               │  │
│  │  ┌──────────────────────────────────┐  │  │
│  │  │ (textarea)                       │  │  │
│  │  └──────────────────────────────────┘  │  │
│  │  [Start Run]                            │  │
│  └──────────────────────────────────────┘  │
│                                              │
│  ┌─ Transcript ──────────────────────────┐  │
│  │  (event stream, same as workflow)     │  │
│  │  ...                                  │  │
│  └──────────────────────────────────────┘  │
│                                              │
│  ┌─ Composer Bar ────────────────────────┐  │
│  │  [input]                        [Send]│  │
│  └──────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

#### 3.4.2 功能清单

| 功能 | 交互 |
|------|------|
| 配置面板 | 可折叠，节省屏幕空间 |
| Agent 选择 | 快选已定义的 Agent 或手动配置临时参数 |
| Vendor 切换 | 动态加载对应模型列表 |
| 项目目录 | 文件夹选择器，指定工作上下文 |
| 启动 | [Start Run] 按钮开始运行 |
| Transcript | 实时事件流，与 Workflow 的 Transcript Viewer 复用 |
| 中止 | 运行中可中止 |
| 继续对话 | 运行结束可继续发送消息（Follow-up） |
| 重新开始 | 清空 transcript 重新开始 |
| 文件附件 | 可附加文件作为上下文 |
| Mid-run 注入 | Claude 模式下可在运行中注入消息 |
| 记忆注入 | 自动注入该 Agent 的相关记忆 |

---

### 3.5 模式五：Settings（设置）

#### 3.5.1 设置分区

| 分区 | 功能 |
|------|------|
| **CLI Management** | 检测已安装 CLI、版本显示、一键安装、手动路径指定 |
| **API Providers** | 添加/删除/编辑 API 提供商、加密存储 Key、连接测试 |
| **Data Management** | 导出全部数据 (ZIP)、导入数据、冲突处理 |
| **Memory System** | 启用/禁用记忆系统、反思模型配置 |
| **Background Run** | 关闭窗口时最小化到托盘（后台定时任务继续运行） |
| **Feishu Bot** | 飞书机器人配置：appId、appSecret、chatId、userId、启用开关 |

#### 3.5.2 API Provider 配置详情

| 字段 | 说明 |
|------|------|
| Provider Name | 显示名称 |
| API Base URL | API 端点 |
| API Key | 加密存储的密钥 |
| Provider Type | Anthropic / OpenAI-compatible |
| Test Connection | 发送测试请求验证配置 |
| Presets | 内置预设：DeepSeek、Kimi、SiliconFlow |

---

## 4. 交互流程全景

### 4.1 主要用户旅程

```
┌─────────┐    ┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│ DEFINE  │───→│  DESIGN     │───→│   EXECUTE    │───→│   REVIEW    │
│ AGENTS  │    │  WORKFLOW   │    │   WORKFLOW   │    │   RESULTS   │
└─────────┘    └─────────────┘    └──────────────┘    └─────────────┘
                    │                    │                    │
                    │                    ▼                    │
                    │            ┌──────────────┐            │
                    │            │  INTERVENE   │            │
                    │            │  (confirm,   │            │
                    │            │   input,     │            │
                    │            │   rerun)     │            │
                    │            └──────────────┘            │
                    │                    │                    │
                    └────────────────────┴────────────────────┘
                                     │
                                     ▼
                            ┌──────────────┐
                            │   MEMORY     │
                            │   ACCUMULATES│
                            │   (automatic)│
                            └──────────────┘
```

### 4.2 工作流运行生命周期

```
           ┌──────────┐
           │  IDLE    │  ← 初始状态
           └────┬─────┘
                │ [Start Run]
                ▼
           ┌──────────┐
           │ RUNNING  │  ← Step 自动推进
           └────┬─────┘
                │
        ┌───────┼──────────┐
        ▼       ▼          ▼
   ┌─────────┐ ┌────────┐ ┌──────────┐
   │AWAITING │ │ERROR   │ │COMPLETED │
   │_CONFIRM │ └───┬────┘ └──────────┘
   └────┬────┘     │
        │ [confirm] │ [rerun/skip/jump]
        ▼           ▼
   ┌─────────┐ ┌──────────┐
   │AWAITING │ │ RUNNING  │ (循环)
   │_INPUT   │ └──────────┘
   └────┬────┘
        │ [send input]
        ▼
   ┌──────────┐
   │ RUNNING  │
   └──────────┘

   任何状态 ──→ ABORTED (用户手动中止)
   任何状态 ──→ ERROR (系统异常)
```

### 4.3 并行步骤执行模式

```
   [Step 1]
      │
      ▼
┌─────────────────────┐
│  PARALLEL GROUP      │
│  ┌────┐ ┌────┐ ┌───┐│
│  │ A  │ │ B  │ │ C ││  ← 同时运行，独立 git worktree
│  └──┬─┘ └──┬─┘ └─┬─┘│
│     │      │      │   │
│     └──────┼──────┘   │
│            ▼          │
│       [Merge]         │  ← 收集所有 handoff
└───────────────────────┘
      │
      ▼
   [Step 3]
```

### 4.4 记忆系统循环

```
   Workflow Event
        │
        ▼
  Signal Collector (实时收集)
        │
        ▼
  Raw Signals Buffer (按 Agent 分组)
        │
        ▼ (8s 防抖)
  Reflection Agent (小模型反思)
        │
        ▼
  Memory Store (持久化)
        │
        ▼ (下次运行前)
  Memory Injector (评分 + 遗忘 + 注入)
        │
        ▼
  Agent Prompt (自动注入相关记忆)
```

---

## 5. 状态与反馈体系

### 5.1 运行状态一览

| 状态 | 图标建议 | 说明 |
|------|---------|------|
| `idle` | ○ 空心 | 尚未开始 |
| `running` | ◉ 脉冲动画 | 正在运行 |
| `awaiting-confirm` | ⏸ 暂停图标 | 等待用户确认 |
| `awaiting-input` | ✎ 编辑图标 | 等待用户输入 |
| `completed` | ✓ 绿色 | 成功完成 |
| `error` | ✗ 红色 | 运行出错 |
| `aborted` | ⊘ 灰色 | 用户中止 |
| `skipped` | ⏭ 跳转图标 | 步骤被跳过 |

### 5.2 实时反馈机制

| 机制 | 触发条件 |
|------|---------|
| Token 计数器 | 实时数字跳动 |
| 费用估算 | Token × 模型单价，实时计算 |
| 事件流滚动 | 新事件自动滚动到底部 |
| 步骤状态动画 | 状态切换时滑入/淡入过渡 |
| 进度条 (可选) | 多步骤工作流的总进度 |
| 声音效果 | 状态变化时的提示音 (可选) |
| macOS 角标 | 红色 `!`：调度器有错误 |
| 系统托盘 | 右键菜单：状态、最近运行、快速操作 |

### 5.3 错误与空状态

| 场景 | 处理 |
|------|------|
| 无 Agent 定义 | 引导去 Agents 模式创建 |
| 无工作流模板 | 引导去 Templates 模式创建 |
| 运行列表为空 | 空状态插画 + "开始你的第一次运行" |
| CLI 未安装 | 弹出 CliSetupDialog 引导安装 |
| API Key 无效 | 连接测试反馈错误信息 |
| Git 未提交更改 | 警告列表 + 确认后才能运行 |
| 导入冲突 | 冲突项列表 + 选择保留策略 |

---

## 6. 数据与持久化

### 6.1 数据实体关系

```
Agent ──→ WorkflowTemplate (steps reference agents)
              │
              ▼
         WorkflowRun (instance of template)
              │
              ├──→ Transcript (event log)
              ├──→ Artifacts (generated files)
              └──→ Memory Signals → Memory Entries

Schedule ──→ WorkflowTemplate (which template to run)
Provider (API keys, encrypted)

AppSettings (独立配置)
```

### 6.2 数据量考量

- Agent 数量：通常 5-20 个
- 工作流模板：通常 3-10 个
- 运行历史：可能成百上千条，需要**分页/虚拟滚动**
- Transcript：单条可能包含数千个事件，需要**虚拟滚动**
- 记忆条目：每个 Agent 可能积累数百条记忆

### 6.3 导入/导出

- 全量导出：ZIP 包含所有 JSON 文件
- 模板导出：单个模板的 JSON 文件
- 导入检测：对比已有数据，列出冲突
- 冲突解决：保留已有 / 覆盖 / 保留两者

---

## 7. 三版设计方向详述

---

### 7.1 方向一：墨垣 (Ink & Silicon)

> **科技感 × 中国风，暗纹融入，克制不突兀**

#### 色彩体系

| Token | 色值参考 | 用途 |
|-------|---------|------|
| 背景底 | `#0B0C10` 墨玉黑 | 主背景 |
| 表面 | `#14161A` | 卡片/面板 |
| 悬浮 | `#1C1F26` | Hover 状态 |
| 边框 | `#2A2D35` 带暖色底纹 | 分割线 |
| 主色 | `#C9A96E` 古铜金 | 主按钮、选中态、强调 |
| 辅助色 | `#6B8F71` 青玉色 | 成功状态、辅助强调 |
| 文字主 | `#E8E0D5` 宣纸白 | 主文字 |
| 文字辅 | `#8B8578` | 次要文字 |
| 错误 | `#C4554D` 朱砂红 | 错误/危险操作 |
| 警告 | `#D4953A` | 警告状态 |

#### 视觉元素

- **暗纹**：在卡片/面板背景中融入极淡的山水纹、云纹或几何回纹，透明度 3-5%，不干扰阅读
- **图标风格**：线性图标，线条略带毛笔起笔收笔的粗细变化
- **边框装饰**：关键面板的边框可以有细微的金色渐变线（如焦点状态）
- **字体**：UI 字体用系统默认等宽/无衬线，标题可考虑使用带有书法骨架的展示字体（如 "Agent Studio" Logo）
- **节点连接线**：曲线带金色渐变，像墨在水中晕开
- **加载动画**：水墨扩散效果 or 印章渐显
- **空状态插画**：水墨风格的极简插画

#### 气质关键词

`克制` `温润` `沉淀感` `东方智识` `不张扬的权威`

---

### 7.2 方向二：霓渊 (Neon Abyss)

> **赛博朋克，暗夜中的代码洪流**

#### 色彩体系

| Token | 色值参考 | 用途 |
|-------|---------|------|
| 背景底 | `#0A0A0F` 深渊黑 | 主背景 |
| 表面 | `#12121A` | 卡片/面板 |
| 悬浮 | `#1A1A2E` 带紫调 | Hover 状态 |
| 边框 | `#2A2A40` 带霓虹发光 | 分割线 |
| 主色 | `#FF006E` 霓虹粉 | 主按钮、选中态 |
| 辅助色 | `#00F0FF` 氚蓝 | 信息、链接、高亮 |
| 第三色 | `#B367FF` | 辅助强调 |
| 文字主 | `#E0E0F0` | 主文字 |
| 文字辅 | `#7B7B9A` | 次要文字 |
| 成功 | `#00FF88` 霓虹绿 | 成功状态 |
| 错误 | `#FF3355` | 错误状态 |
| 警告 | `#FFAA00` | 警告状态 |

#### 视觉元素

- **发光效果**：关键交互元素使用 `box-shadow` 霓虹发光（如选中节点、活动步骤、状态指示灯）
- **扫描线/格栅**：Canvas 画布背景可以有极淡的网格线，像 CRT 屏幕或赛博空间地图
- **故障艺术 (Glitch)**：错误状态或加载过渡时使用轻微的 RGB 分离动画
- **终端感**：Transcript Viewer 设计成终端风格，绿字黑底或蓝字黑底
- **HUD 元素**：Token 用量、费用等数据用 HUD 风格显示（带括号、扫描线效果）
- **边框**：非圆角或极小圆角 (2px)，使用发光边框
- **图标风格**：锐利的几何图标，线性或填充，带发光
- **字体**：主要字体使用几何感强的无衬线（如 Inter / Space Grotesk），等宽部分使用终端风字体（如 JetBrains Mono）
- **数据流动画**：表示 Agent 之间数据传输的粒子流效果

#### 气质关键词

`高能` `叛逆` `沉浸` `数字地下` `黑客美学`

---

### 7.3 方向三：息壤 (Breathing Earth)

> **有机科技 — 会呼吸的工具，AI 如自然生长**

#### 设计哲学

这个方向源于一个洞察：用户长时间使用 AI 工具，面对冰冷的代码和闪烁的数据，会产生精神疲劳。"息壤"取自《山海经》中能自我生长的神土 — 暗示这是一个活的、会随时间进化的工具。设计追求的不是"酷"，而是"陪伴感"。

#### 色彩体系

| Token | 色值参考 | 用途 |
|-------|---------|------|
| 背景底 | `#F5F2ED` 暖石灰 | 主背景 (浅色模式) |
| 背景底暗 | `#1A1B1A` 壤土黑 | 主背景 (深色模式) |
| 表面 | `#FFFFFF` / `#242524` | 卡片/面板 |
| 边框 | `#E5E0D8` / `#333433` | 分割线 |
| 主色 | `#5B8C5A` 苔藓绿 | 主操作、强调 |
| 辅助色 | `#8B6F47` 赭石色 | 辅助、链接 |
| 第三色 | `#D4956B` 陶土橙 | 温暖强调 |
| 文字主 | `#2C2C2A` / `#E8E6E0` | 主文字 |
| 文字辅 | `#8C8A84` | 次要文字 |
| 成功 | `#557C53` | 成功状态 |
| 错误 | `#C4705A` | 错误状态 |
| 信息 | `#5A8FA8` 湖水蓝 | 信息状态 |

#### 视觉元素

- **有机圆角**：所有元素使用较大的圆角 (8-16px)，像被水流冲刷过的石头
- **渐变**：温暖的自然渐变（朝霞、苔原、矿物），用于关键区域（如 Header、选中的节点）
- **微交互**：点击有轻微的弹性动画（spring），像按压柔软的苔藓
- **背景纹理**：极淡的纸纹/纤维质感，不干扰阅读但增加触感
- **呼吸动画**：运行状态使用柔和的呼吸脉冲，频率模拟平静呼吸 (12-16次/分钟)
- **节点**：像细胞或有机体的形态，节点间的连线像菌丝网络
- **画布**：深色模式下像在土壤中穿行，Agent 节点像发光的种子
- **字体**：温和的旧风格比例字体（如 Source Serif / Newsreader 作为展示）+ 清晰的无衬线 UI 字体
- **声音**：自然声景（可选的水声、风声白噪音的提示音）
- **昼夜节律**：自动跟随系统时间调整色温（晚间更暖）

#### 气质关键词

`温润` `自然` `会呼吸` `长期陪伴` `克制的温柔`

---

## 8. 组件清单

### 8.1 全局组件

| 组件 | 说明 | 复用场景 |
|------|------|---------|
| **ModeRail** | 左侧 5 图标模式导航 | 全局固定 |
| **Header** | 顶部品牌栏 + 状态芯片 | 全局固定 |
| **StatusBadge** | 状态徽章 | 运行状态、Agent 状态 |
| **CliSetupDialog** | CLI 安装引导弹窗 | 全局覆盖 |
| **Toast/Notification** | 操作反馈提示 | 全局覆盖 |
| **ConfirmDialog** | 确认对话框 | 删除、中止等操作 |
| **FolderPicker** | 文件夹选择器 | 多个设置场景 |

### 8.2 Workflow 模式组件

| 组件 | 说明 |
|------|------|
| **WorkflowRunsList** | 运行列表 (虚拟滚动) |
| **WorkflowRunDetail** | 运行详情容器 |
| **StepChips** | 步骤导航条 |
| **TranscriptViewer** | 事件流查看器 (虚拟滚动) |
| **PromptViewer** | Prompt 查看/编辑器 |
| **ArtifactCards** | 产出物卡片 |
| **MemoryRefs** | 记忆引用列表 |
| **ComposerBar** | 底部输入栏 |
| **FilePreviewPane** | 文件预览面板 (Tabbed) |
| **NewWorkflowRunDrawer** | 新建运行抽屉 |
| **ScheduleList** | 定时任务列表 |
| **ScheduleDetail** | 定时任务详情 |
| **ScheduleDrawer** | 定时任务编辑抽屉 |

### 8.3 Templates 模式组件

| 组件 | 说明 |
|------|------|
| **AgentSidebar** | 可拖拽 Agent 侧边栏 |
| **WorkflowCanvas** | React Flow 画布容器 |
| **AgentNode** | Agent 节点 (自定义 React Flow 节点) |
| **ConditionalEdge** | 条件连线 |
| **ParallelGroup** | 并行组容器 |
| **CanvasToolbar** | 画布工具栏 |
| **PropertyPanel** | 属性编辑面板 |
| **MiniMap** | 画布小地图 |

### 8.4 Agents 模式组件

| 组件 | 说明 |
|------|------|
| **AgentList** | Agent 列表 |
| **AgentEditor** | Agent 编辑表单 |
| **MemoryPanel** | 记忆查看面板 |
| **ReflectionSettings** | 反思引擎设置 |

### 8.5 Single Run 模式组件

| 组件 | 说明 |
|------|------|
| **RunConfigPanel** | 可折叠运行配置 |
| **TranscriptViewer** | (复用) |
| **ComposerBar** | (复用) |

### 8.6 Settings 模式组件

| 组件 | 说明 |
|------|------|
| **CliManagement** | CLI 管理面板 |
| **ProviderSettings** | API 提供商管理 |
| **DataManagement** | 数据导入/导出 |
| **FeishuConfig** | 飞书机器人配置 |
| **AppSettings** | 通用设置 |

---

## 9. 设计约束与技术要求

### 9.1 平台支持

- **macOS**：主要目标平台，支持系统托盘、原生标题栏、dock 角标
- **Windows**：也要支持，System Tray 行为不同
- **Linux**：兼容性考虑（非主要）

### 9.2 窗口特性

- 最小窗口尺寸：约 1024 × 680 px
- 可最大化、可自由缩放
- 画布区域可无限缩放/平移
- 支持深色模式（当前仅深色，新设计可考虑浅色/深色双模）

### 9.3 性能要点

- **虚拟滚动**：运行列表、Transcript 都需要虚拟滚动（数据量大时）
- **画布性能**：React Flow 画布节点数通常 < 50，但需要考虑大量连线时的渲染
- **实时更新**：Transcript 的 token 流式渲染需要批处理（当前 16ms 防抖）
- **内存**：长时间运行不泄漏（Electron 应用常见问题）

### 9.4 交互设计原则

1. **即时反馈**：所有操作必须有即时视觉反馈（按钮态、加载态、完成态）
2. **容错设计**：危险操作（删除、中止）需要二次确认
3. **渐进披露**：复杂功能分层展示，默认隐藏高级选项
4. **键盘友好**：核心操作支持键盘快捷键
5. **状态可见**：运行状态、Agent 状态、连接状态一目了然
6. **新手友好**：空状态引导、首次使用引导（可选）

### 9.5 无障碍

- 色彩对比度满足 WCAG AA 标准
- 不仅仅依赖颜色传达信息（配合图标和文字）
- 支持键盘导航

---

## 附录：当前 UI 的已知问题

> 供设计师了解改进起点

1. **数据量大时列表无虚拟滚动**：运行列表、Transcript 在数据量大时会卡顿
2. **信息架构扁平但信息密度高**：WorkflowRunDetail 页面同时展示太多信息（step chips + prompt + transcript + artifacts + memories + composer），缺乏视觉层次
3. **深色主题一致性不足**：部分区域色彩混杂，缺少统一的 design token
4. **空状态缺乏引导**：新用户首次打开各模式看到空白区域，缺乏下一步指引
5. **画布节点样式单一**：AgentNode 当前较简单，可加强视觉辨识度
6. **移动端不适配**：当前仅桌面端，无响应式设计需求
7. **过渡动画缺失**：状态切换时缺乏过渡，感觉"生硬"

---

## 10. 设计交付物规范

> **核心要求**：设计师需用 **React + Tailwind CSS 编写可独立运行的 HTML 文件** 作为设计稿。每个 HTML 文件是一个自包含的静态页面（React 通过 CDN 加载，不依赖构建工具），直接在浏览器中打开即可预览。

### 10.1 技术栈约束

| 项 | 要求 | 说明 |
|---|------|------|
| **框架** | React 18 (CDN) | `<script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>` |
| **样式** | Tailwind CSS (CDN) | `<script src="https://cdn.tailwindcss.com"></script>` |
| **图标** | Lucide React (CDN) | 与项目一致，或使用 SVG inline |
| **字体** | 按各方向设计自由选择 | 用 `<link>` 引入 Google Fonts 或 CDN |
| **依赖** | **零构建工具** | HTML 文件直接在浏览器打开即可预览 |
| **文件** | 每个页面一个 `.html` | 可复用组件写在同一文件内 |

### 10.2 必须交付的页面清单

#### 第一阶段：关键页面概念稿（每方向）

每版设计方向需产出以下 **6 个页面**：

| # | 页面 | 文件名 | 必须展示的状态 |
|---|------|--------|---------------|
| 1 | **App Shell + ModeRail** | `01-shell.html` | 全局布局框架、五个模式入口、Header、空工作区 |
| 2 | **Templates — Canvas Editor** | `02-canvas.html` | DAG 画布、Agent 节点 (3-5个)、连线、并行组框、MiniMap、属性面板、工具栏 |
| 3 | **Workflow — Run Detail** | `03-run-detail.html` | 运行中的详情页：Step Chips (含完成/运行中/待执行)、Transcript 流、Artifacts 卡片、ComposerBar |
| 4 | **Single Run** | `04-single-run.html` | 配置面板 (折叠态和展开态都要)、Transcript、输入栏 |
| 5 | **Agents — Editor** | `05-agent-editor.html` | Agent 列表 + 编辑表单 + System Prompt 编辑区 + Memory Panel |
| 6 | **Settings — API Providers** | `06-settings.html` | 设置侧边栏 + API Provider 配置面板 + Key 输入 + 连接测试 |

#### 第二阶段：补充页面（确认方向后）

确认方向后，再补齐：

| # | 页面 | 说明 |
|---|------|------|
| 7 | **Workflow — Run List** | 运行历史列表，含多种状态 (running/completed/error/aborted) |
| 8 | **New Run Drawer** | 新建运行抽屉，含 Git 安全警告 |
| 9 | **Schedule Drawer** | Cron 编辑器 + 预览 |
| 10 | **空状态引导** | 各模式首次使用的空状态 (插画 + CTA) |
| 11 | **全局覆盖层** | Toast、ConfirmDialog、CliSetupDialog |
| 12 | **设置 — 其他** | CLI 管理、数据导入导出、飞书配置 |

### 10.3 交互模拟要求

虽然是静态 HTML，但需要模拟关键交互：

| 交互类型 | 实现方式 | 适用场景 |
|---------|---------|---------|
| **Hover 态** | CSS `:hover` + Tailwind `hover:` | 按钮、列表项、节点、连线 |
| **点击选中** | React `useState` 切换 class | 列表项选中、节点选中、Tab 切换 |
| **展开/折叠** | React `useState` 条件渲染 | 配置面板、Prompt 区、Memory Refs |
| **弹窗/抽屉** | React `useState` 控制显隐 + 半透明遮罩 | Drawer、Dialog、Toast |
| **Tab 切换** | React `useState` 切换内容区 | File Preview (Code/Preview/Diff) |
| **状态切换演示** | 按钮循环切换不同状态 | 运行状态 Badge、Step 状态、按钮 Loading |
| **输入实时预览** | React `useState` 绑定 value | Cron 表达式 → 人类可读描述 |

### 10.4 HTML 模板结构

每个交付的 HTML 文件应遵循以下结构：

```html
<!DOCTYPE html>
<html lang="zh-CN" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Agent Studio — [页面名] — [设计方向名]</title>

  <!-- Fonts -->
  <link href="https://fonts.googleapis.com/css2?family=..." rel="stylesheet">

  <!-- Tailwind -->
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            // 按设计方向的 Design Token 定义
          },
          fontFamily: {
            // 字体定义
          },
          animation: {
            // 自定义动画
          }
        }
      }
    }
  </script>

  <style>
    /* 自定义 CSS：暗纹背景、发光效果、动画等 Tailwind 不直接支持的 */
  </style>
</head>
<body class="bg-[--bg-base] text-[--text-primary] antialiased">
  <div id="root"></div>

  <!-- React 18 CDN -->
  <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>

  <script type="text/babel">
    const { useState, useEffect, useRef } = React;

    // ─── 组件定义 ────────────────────────────────
    // ...

    // ─── 渲染 ────────────────────────────────────
    ReactDOM.createRoot(document.getElementById('root')).render(<App />);
  </script>
</body>
</html>
```

### 10.5 评估标准

设计师交付后，我们将从以下维度评估：

| 维度 | 权重 | 标准 |
|------|------|------|
| **气质契合** | 40% | 是否准确传达了设计方向的核心气质和关键词 |
| **信息层级** | 25% | 视觉层次是否清晰，用户能否快速定位关键信息 |
| **交互细腻度** | 20% | Hover/选中/过渡动画是否流畅细腻 |
| **工程可行性** | 15% | 能否在 Electron + React + 自定义 CSS 的技术栈中落地 |

### 10.6 文件组织

```
design-mockups/
├── 01-moyuan/                  # 墨垣方向
│   ├── 01-shell.html
│   ├── 02-canvas.html
│   ├── 03-run-detail.html
│   ├── 04-single-run.html
│   ├── 05-agent-editor.html
│   └── 06-settings.html
├── 02-niyuan/                  # 霓渊方向
│   ├── 01-shell.html
│   ├── 02-canvas.html
│   ├── ...
└── 03-xirang/                  # 息壤方向
    ├── 01-shell.html
    ├── 02-canvas.html
    ├── ...
```

### 10.7 时间线建议

| 阶段 | 内容 | 建议周期 |
|------|------|---------|
| **Moodboard** | 三个方向的情绪板 + 参考收集 | 2-3 天 |
| **方向初稿** | 每方向产出 1-2 个核心页面初稿，确认大方向 | 3-5 天 |
| **全部 6 页** | 三个方向各完成 6 个页面 | 5-7 天 |
| **评审确认** | 三方对比，选定最终方向 | 1-2 天 |
| **补充页面** | 选定方向后补齐剩余页面 | 3-5 天 |

---

> **文档版本**: v1.1
> **日期**: 2026-06-13
> **更新**: 新增 §10 设计交付物规范，明确 React + Tailwind CSS 自包含 HTML 的交付方式
>
> **下一步**: 设计师可据此文档进行三个方向的视觉探索，按 §10 规范产出 HTML 设计稿。建议先产出 **情绪板 (Moodboard)** 和 **关键页面 (Key Screen)** 的概念稿

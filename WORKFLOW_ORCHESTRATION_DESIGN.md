# 工作流编排能力扩展设计

> 状态：设计中
> 日期：2026-06-10
> 优先级：并行分支 > 条件跳转 > 智能路由 > DAG 画布

## 1. 背景

当前 Agent Studio 只支持**纯线性链**编排。竞品（LangGraph、CrewAI、Dify、Claude Code 原生 workflow）均支持并行/条件/循环。Agent Studio 的差异化在于"跨 vendor + GUI 编排 + 本地执行"，但如果编排能力太弱，这些差异化撑不住。

本文档覆盖四个扩展方向，按优先级排序。

---

## 2. 并行分支

### 2.1 场景

- **Fan-out/Fan-in**：需求分析 → [前端开发 | 后端开发] → 集成测试。并行 step 全部完成后才推进下游。
- **独立并行**：[文档 agent | 测试 agent] 各自跑完就 done，不需要汇合到同一个下游。

### 2.2 设计决策

| 决策点   | 选择                                 | 理由                                                  |
| -------- | ------------------------------------ | ----------------------------------------------------- |
| 文件冲突 | 强制隔离（不同 cwd 或 git worktree） | 两个 agent 同时改同一文件必然冲突，不能靠"自觉"       |
| 汇合方式 | 简单拼接所有并行 step 的 handoff     | 不需要 merge agent，下游 agent 自己能理解多个上游输出 |
| 并行上限 | 默认最多 3 个并行 step               | 受限于本地 CPU 和 API 并发                            |

### 2.3 Template 结构变更

当前 template steps 是平坦数组 `[step1, step2, step3]`。改为支持嵌套：

```ts
// 线性（向后兼容）
steps: [step1, step2, step3];

// 带并行组
steps: [
  step1, // 线性
  { parallel: [step2a, step2b] }, // 并行组，全部完成后进入 step3
  step3, // 汇合点，接收 step2a + step2b 的 handoff
];

// 独立并行（无汇合）
steps: [
  step1,
  { parallel: [step2a, step2b], join: false }, // 各自独立完成
];
```

### 2.4 WorkflowManager 变更

- 遇到 `parallel` 组时，同时启动组内所有 step（每个 step 分配独立 cwd）
- 维护 `liveByRunId` 改为支持一个 run 有多个活跃 step
- 并行组内所有 step 都 `done` 或 `awaiting-confirm` 后，推进到下一个线性节点
- 汇合点的 `buildPrompt` 接收多个上游 handoff：

```
# Upstream handoffs

## From 前端开发 (Step 2a)
{summary2a}
Artifacts: ...

## From 后端开发 (Step 2b)
{summary2b}
Artifacts: ...
```

### 2.5 隔离方案

并行 step 的 cwd 分配策略：

```
projectPath/                    # 原始项目目录
  .agent-studio/worktrees/
    step-2a/                    # git worktree for step 2a
    step-2b/                    # git worktree for step 2b
```

如果项目不是 git 仓库，退化为子目录隔离或拒绝并行。

### 2.6 UI 变更

- Template 编辑器：支持"添加并行组"操作，把多个 step 框在一起
- Run 详情：并行 step 在 step chips 中并排显示（不是线性排列）
- Run 列表卡片：进度条支持显示并行段

---

## 3. 条件跳转

### 3.1 三种触发方式（全部支持，用户可配置）

**A. Template 规则（自动执行，无需人介入）**

```ts
interface StepRule {
  on: "error" | "handoff-failed";
  action: "retry" | "skip" | "goto";
  target?: number; // goto 的目标 step index
  maxRetries?: number; // retry 的上限，默认 1
}
```

Template step 中新增 `rules?: StepRule[]`。WorkflowManager 在 step 完成/失败时先检查 rules，命中则自动执行，不需要用户介入。

**B. Agent 建议（展示给用户，由用户确认）**

handoff JSON 扩展一个可选字段：

```json
{
  "summary": "...",
  "artifacts": [...],
  "nextStepGuidance": "...",
  "routeSuggestion": {
    "action": "continue" | "retry-prev" | "skip-next" | "goto",
    "target": 2,
    "reason": "测试发现 3 个 bug，建议跳回开发步骤修复"
  }
}
```

UI 在 confirm 面板中展示 agent 的建议，用户可以接受或忽略。

**C. 用户手动决定（现有 confirm 流程扩展）**

当前 confirm 只有"确认并继续"。扩展为多选项：

- 确认并继续下一步
- 重跑当前步骤
- 跳回某个步骤（下拉选择）
- 跳过下一步

### 3.2 优先级

当多种机制同时存在时：用户手动 > template 规则 > agent 建议。

### 3.3 与现有功能的关系

当前已有 `rerunStep()` 和 `confirmStep()`。条件跳转本质是在这两个操作之上加一层自动/半自动触发逻辑，核心状态机不需要大改。

---

## 4. 跨 Vendor 智能路由

### 4.1 场景

用户不想手动决定每步用 claude 还是 codex。系统根据 step 的角色/任务类型自动推荐。

### 4.2 方案：推荐配置（非强制）

不做全自动路由（太黑箱），而是提供**推荐按钮**：

- Template 编辑器中，每步的 agent 选择旁加一个"自动推荐"按钮
- 点击后根据 step 的 role 自动填充 vendor + model：

```ts
const ROLE_RECOMMENDATIONS: Record<
  string,
  { vendor: AgentVendor; model: string }
> = {
  product: { vendor: "claude", model: "sonnet" },
  design: { vendor: "claude", model: "sonnet" },
  dev: { vendor: "codex", model: "codex-mini" },
  test: { vendor: "claude", model: "sonnet" },
  review: { vendor: "claude", model: "opus" },
};
```

### 4.3 未来扩展

- 根据历史 run 的成本和成功率动态调整推荐
- A/B 测试同一步用不同 vendor 的效果

---

## 5. DAG 画布编辑器

### 5.1 定位

替代当前 TemplatesView 的线性步骤列表，变为可视化节点画布。

### 5.2 核心交互

- 从 Agent 库拖节点到画布
- 节点之间连线表示依赖关系
- 支持并行组（多个节点在同一列）
- 支持条件边（从一个节点分出多条线，标注条件）
- 保存时序列化为 template 数据结构

### 5.3 技术选型（待定）

| 库                | 优点                          | 缺点              |
| ----------------- | ----------------------------- | ----------------- |
| React Flow        | 社区大、功能全                | 包体积大 (~200KB) |
| @xyflow/react     | React Flow 的 rebrand，更轻量 | 同上              |
| 自己画 SVG/Canvas | 完全可控、最小包体积          | 工作量大          |

### 5.4 实现优先级

DAG 画布是工作量最大的一项，建议在并行分支和条件跳转的数据模型稳定后再做 UI。先用线性列表 + "并行组"按钮作为过渡 UI。

---

## 6. 实现路线

### Phase 1：并行分支

1. 扩展 `WorkflowTemplate` 的 steps 类型，支持 `{ parallel: [...] }` 嵌套
2. WorkflowManager 支持同时启动多个 step
3. 实现 git worktree 隔离
4. buildPrompt 支持多上游 handoff 拼接
5. UI: step chips 支持并排显示

### Phase 2：条件跳转

1. Template step 新增 `rules` 字段
2. handoff schema 扩展 `routeSuggestion`
3. WorkflowManager 完成/失败时检查 rules 并自动执行
4. UI: confirm 面板扩展为多选项，展示 agent 路由建议

### Phase 3：智能路由

1. 新增 role → vendor/model 推荐映射
2. Template 编辑器加"自动推荐"按钮
3. （可选）历史数据驱动的推荐调整

### Phase 4：DAG 画布

1. 引入 React Flow 或类似库
2. 画布编辑器替换线性列表
3. 支持从画布序列化为 template 数据
4. 支持条件边的可视化配置

---

## 7. 数据模型变更预览

```ts
// WorkflowTemplate steps 从平坦数组变为支持嵌套
type WorkflowStep = {
  agentId: string;
  role?: string;
  rules?: StepRule[];
};

type WorkflowStepGroup = {
  parallel: WorkflowStep[];
  join?: boolean; // 默认 true，false 表示独立并行无汇合
};

type WorkflowStepNode = WorkflowStep | WorkflowStepGroup;

interface WorkflowTemplate {
  id: string;
  name: string;
  description?: string;
  steps: WorkflowStepNode[]; // 从 WorkflowStep[] 变为 WorkflowStepNode[]
  budgetUsd?: number;
}

// StepRule
interface StepRule {
  on: "error" | "handoff-failed";
  action: "retry" | "skip" | "goto";
  target?: number;
  maxRetries?: number;
}

// HandoffArtifact 扩展
interface HandoffArtifact {
  summary: string;
  artifacts: { path: string; description: string; type?: string }[];
  nextStepGuidance?: string;
  routeSuggestion?: {
    action: "continue" | "retry-prev" | "skip-next" | "goto";
    target?: number;
    reason?: string;
  };
}
```

---

## 8. 风险

| 风险                               | 缓解                                                             |
| ---------------------------------- | ---------------------------------------------------------------- |
| 并行 step 的 git worktree 管理复杂 | 用现有的 `gitSafety.ts` 扩展，只在 git 项目中支持并行            |
| 条件跳转可能导致死循环             | StepRule 的 retry 有 maxRetries 上限；goto 不允许向后跳超过 2 步 |
| Template 数据结构不兼容            | 平坦数组是 `WorkflowStepNode[]` 的子集，旧 template 零迁移成本   |
| DAG 画布包体积大                   | React Flow 做 lazy import，只在 Templates 页加载                 |

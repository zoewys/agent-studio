# Interactive Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement step-level interactive conversations and fallback failure strategies from `INTERACTIVE_MODE_SPEC.md`.

**Architecture:** The workflow template owns optional `interactive` and `failureStrategy` settings. `WorkflowManager` maps active run steps back to template steps, keeps Claude stdin resident for interactive turns, and moves runs between `running`, `awaiting-input`, confirmation, and terminal states. Renderer changes are narrow: canvas property controls serialize the new fields, run detail shows the new waiting state, and the composer can reply to an awaiting-input step.

**Tech Stack:** Electron main process, TypeScript shared contracts, React renderer, React Flow canvas, Node test runner with source-contract tests, Electron Vite build.

---

### Task 1: Contract and Manager Tests

**Files:**
- Create: `tests/interactive-mode.test.mjs`
- Modify: `src/shared/types.ts`
- Modify: `src/main/WorkflowManager.ts`
- Modify: `src/main/RunManager.ts`
- Modify: `src/main/adapters/types.ts`
- Modify: `src/main/adapters/claudeAdapter.ts`

- [ ] **Step 1: Write failing source-contract tests**

Add assertions for `FailureStrategy`, `awaiting-input` statuses, `workflowFinishInteractive`, `INTERACTIVE_HINT`, resident Claude stdin config, `enterAwaitingInput()`, `finishInteractiveStep()`, `pushInput()` status restoration, and `failureStrategy` retry/goto handling.

- [ ] **Step 2: Run the new test and verify it fails**

Run: `node --test tests/interactive-mode.test.mjs`
Expected: FAIL because the new contract does not exist yet.

- [ ] **Step 3: Implement minimal main/shared code**

Add optional shared fields, keep-stdin-open run config, interactive prompt hint injection, awaiting-input transition, manual finish, and failure strategy fallback.

- [ ] **Step 4: Run focused tests**

Run: `node --test tests/interactive-mode.test.mjs`
Expected: PASS.

### Task 2: IPC and Renderer State

**Files:**
- Modify: `src/main/ipc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/useWorkflows.ts`
- Modify: `src/renderer/src/workflowLabels.ts`
- Modify: `src/renderer/src/workflowRunView.ts`
- Modify: `src/renderer/src/WorkflowRunsList.tsx`

- [ ] **Step 1: Extend failing tests**

Assert preload and IPC expose `finishInteractiveStep`, labels include `等待回复`, progress segments include `awaiting-input`, and run filters/status labels handle the new status.

- [ ] **Step 2: Implement minimal wiring**

Wire the IPC handler through preload and `useWorkflows`, then update labels, notifications, filters, and list/progress status handling.

- [ ] **Step 3: Run focused tests**

Run: `node --test tests/interactive-mode.test.mjs tests/workflow-ui-layout.test.mjs`
Expected: PASS.

### Task 3: Canvas and Run Detail UI

**Files:**
- Modify: `src/renderer/src/canvas/canvasSerializer.ts`
- Modify: `src/renderer/src/canvas/WorkflowCanvas.tsx`
- Modify: `src/renderer/src/WorkflowWorkspace.tsx`
- Modify: `src/renderer/src/WorkflowRunDetail.tsx`
- Modify: `src/renderer/src/styles.css`

- [ ] **Step 1: Extend failing tests**

Assert canvas serialization preserves `interactive` and `failureStrategy`, the property panel has the toggle and failure strategy controls, run detail shows the finish-interactive button and awaiting-input bar, workspace enables the composer with placeholder `回复 Agent...`, and CSS defines blue awaiting-input variants.

- [ ] **Step 2: Implement UI**

Use lucide icons, existing field/select/input styles, existing `ComposerBar`, and small CSS additions for the blue waiting state.

- [ ] **Step 3: Run focused tests**

Run: `node --test tests/interactive-mode.test.mjs tests/workflow-ui-layout.test.mjs`
Expected: PASS.

### Task 4: Full Verification

**Files:**
- No planned source edits.

- [ ] **Step 1: Run full tests**

Run: `pnpm test`
Expected: all tests pass.

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: node and web TypeScript checks pass.

- [ ] **Step 3: Run build**

Run: `pnpm build`
Expected: Electron Vite build succeeds.

- [ ] **Step 4: Browser/UI verification**

Run the app or preview surface, inspect the relevant workflow UI route, and capture a screenshot under `.analysis-shots/`.

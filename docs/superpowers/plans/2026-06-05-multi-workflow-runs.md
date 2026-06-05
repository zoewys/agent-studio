# Multi Workflow Runs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build V1 support for running multiple workflow instances concurrently from reusable workflow templates, with a time-sorted run list, persistent history, per-run details, right-side step navigation, git-safety warnings, and global notification sound control.

**Architecture:** Keep the existing main-process `WorkflowManager` as the source of truth for workflow execution, but expose all persisted runs to the renderer instead of a single `currentRun`. The renderer will track `runs[]`, `selectedRunId`, and `selectedStepIndexByRunId`, render a three-column Workflow workspace (`Runs list | run detail | steps panel`), and use a `New Run` drawer for template-based launch. Templates remain linear in V1; the layout leaves room for a future graph/canvas editor without changing run monitoring.

**Tech Stack:** Electron main/preload IPC, React 18, TypeScript, JSON persistence in `WorkflowStore`, Node test runner, source-level UI regression tests, Web Audio notification helper.

**Current Design Reference:** `.analysis-shots/agent-studio-ui-mockups-v4.html` shows the accepted V1 layout: left run list with live tails, center selected run detail, right narrow steps panel, and `New Run` as a drawer. This mockup is local reference material only and should not be committed unless explicitly requested.

---

## Product Decisions

- Main navigation becomes `Workflow / Templates / Agents / Single`.
- `Workflow` is the unified place for active, waiting, completed, errored, interrupted, and stopped workflow runs.
- Runs list is sorted by `startedAt` descending.
- Runs list cards show latest 2-3 lines of output; click a run card to select it.
- Run details show the selected run transcript and composer in the middle column.
- Current run steps move to a narrow right column, width about `250px`.
- Long workflow support uses vertical step navigation, not a horizontal timeline.
- `New Run` opens as a right drawer from the Workflow page.
- Start flow is template-first: choose template, run name, project directory, prompt.
- Same working tree concurrency is allowed only after a strong warning and explicit `仍然启动` confirmation.
- Same repository with different git worktrees is allowed with a softer warning.
- Same project directory outside Git is allowed, but still display a path-level warning if another active run uses the exact same normalized path.
- Default concurrent running guidance: show resource warning over 3 running runs; over 5 running runs require second confirmation.
- Running count means runs with status `running`. `awaiting-confirm` remains visible and confirmable, but it is not counted as an active CLI process for the high-concurrency threshold.
- History is permanent until manual deletion.
- V1 supports single-run deletion only; batch cleanup later.
- App restart restores history. Persisted `running` runs are marked `interrupted`; `awaiting-confirm` runs remain confirmable.
- Resume for interrupted runs is not implemented in V1.
- Every workflow entering `awaiting-confirm`, `completed`, `error`, `aborted`, or `interrupted` plays a notification sound. Sound control is global on/off.
- `Single Agent` remains a separate entry and is not redesigned in this feature.

## Implementation Notes From Current Code

- `WorkflowRuntime`, `HandoffPanel`, `workflowRunStatusLabel`, `stepStatusLabel`, and `workflowNotificationForRun` currently live inside `src/renderer/src/App.tsx`. Extract them deliberately instead of importing from `App.tsx`.
- `WorkflowPanel.tsx` currently mixes template editing and run starting. V1 must split template editing into `TemplatesView`, and move run starting into `NewWorkflowRunDrawer`.
- Workflow composer state should live in `WorkflowWorkspace`, not `useWorkflows`. The hook owns persisted run state and run actions; the workspace owns selected step, draft input, input errors, and derived composer availability.
- The source-level tests in this plan are guardrails, not substitutes for `npm run typecheck`, `npm test`, `npm run build`, and manual QA.
- All new renderer icons should come from the existing `src/renderer/src/Icons.tsx` file. Add missing icons there only if needed.

## File Structure

- Modify `src/shared/types.ts`: workflow run status, start input, git safety result, new IPC channels.
- Modify `src/main/WorkflowStore.ts`: permanent run storage, list/delete helpers.
- Modify `src/main/WorkflowManager.ts`: list/delete runs, mark interrupted persisted runs on startup, expose safety check.
- Create `src/main/gitSafety.ts`: inspect Git root/worktree state and current run conflicts.
- Modify `src/main/ipc.ts`: register run list/delete/git safety handlers.
- Modify `src/preload/index.ts`: expose new workflow methods.
- Modify `src/preload/index.d.ts`: no direct code change expected beyond type inference, but verify it still compiles.
- Rewrite `src/renderer/src/useWorkflows.ts`: multi-run state model.
- Create `src/renderer/src/workflowRunView.ts`: derived labels, latest event tail, run sort, notification keys.
- Create `src/renderer/src/WorkflowWorkspace.tsx`: workflow page coordinator.
- Create `src/renderer/src/WorkflowRunsList.tsx`: left run list.
- Create `src/renderer/src/WorkflowRunDetail.tsx`: middle transcript/detail panel.
- Create `src/renderer/src/WorkflowStepsPanel.tsx`: right narrow step list.
- Create `src/renderer/src/HandoffPanel.tsx`: extracted structured handoff panel.
- Create `src/renderer/src/NewWorkflowRunDrawer.tsx`: template-based launch drawer and safety warnings.
- Create `src/renderer/src/TemplatesView.tsx`: dedicated template management view using existing `WorkflowPanel` logic as baseline.
- Modify `src/renderer/src/App.tsx`: route between `workflow | templates | agents | single`, remove old embedded workflow config from the Workflow runtime path.
- Modify `src/renderer/src/workflowNotificationSound.ts`: global sound preference integration if needed.
- Modify `src/renderer/src/styles.css`: V4 layout classes and responsive behavior.
- Add `tests/workflow-runs-state.test.mjs`: source-level reducer/state tests.
- Add `tests/workflow-ui-layout.test.mjs`: source/CSS layout regression tests.
- Add `tests/workflow-git-safety.test.mjs`: source-level git-safety contract tests.
- Update `tests/workflow-notification-sound.test.mjs`: multi-run notification and global mute coverage.
- Keep `.analysis-shots/agent-studio-ui-mockups-v4.html` as local design reference only; do not commit unless explicitly requested.

---

### Task 1: Shared Types And IPC Contract

**Files:**
- Modify: `src/shared/types.ts`
- Test: `tests/workflow-runs-state.test.mjs`

- [ ] **Step 1: Write the failing source contract test**

Create `tests/workflow-runs-state.test.mjs`:

```js
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const types = readFileSync(join(root, 'src/shared/types.ts'), 'utf8')

test('shared workflow contract supports multiple persisted runs', () => {
  assert.match(types, /interrupted/)
  assert.match(types, /runName\?: string/)
  assert.match(types, /WorkflowRunGitSafety/)
  assert.match(types, /workflowRunsList: 'workflow:runs:list'/)
  assert.match(types, /workflowDeleteRun: 'workflow:runs:delete'/)
  assert.match(types, /workflowGitSafety: 'workflow:git-safety'/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/workflow-runs-state.test.mjs
```

Expected: FAIL because `interrupted`, `WorkflowRunGitSafety`, and new IPC channels do not exist.

- [ ] **Step 3: Extend workflow shared types**

Modify `src/shared/types.ts` around the workflow types:

```ts
export type WorkflowRunStatus =
  | 'running'
  | 'awaiting-confirm'
  | 'completed'
  | 'error'
  | 'aborted'
  | 'interrupted'

export interface WorkflowRun {
  id: string
  templateId: string
  templateName: string
  /** User-facing instance name. Defaults to templateName when omitted. */
  runName?: string
  projectPath: string
  initialPrompt: string
  status: WorkflowRunStatus
  currentStepIndex: number
  steps: WorkflowRunStep[]
  startedAt: number
  finishedAt?: number
}

export interface WorkflowStartInput {
  templateId: string
  runName?: string
  projectPath: string
  initialPrompt: string
  /** True only after the user accepts a same-working-tree warning. */
  allowUnsafeSameGitRoot?: boolean
}

export interface WorkflowRunGitSafety {
  projectPath: string
  gitRoot?: string
  commonGitDir?: string
  branch?: string
  isGitRepo: boolean
  isLinkedWorktree: boolean
  sameWorkingTreeRunIds: string[]
  relatedWorktreeRunIds: string[]
  /** Combined list for simple UI badges. */
  conflictingRunIds: string[]
  level: 'safe' | 'warning' | 'requires-confirmation'
  message?: string
}
```

Modify `IPC`:

```ts
  /** renderer → main: list persisted workflow runs. */
  workflowRunsList: 'workflow:runs:list',
  /** renderer → main: delete one persisted workflow run. */
  workflowDeleteRun: 'workflow:runs:delete',
  /** renderer → main: inspect project directory concurrency and git safety. */
  workflowGitSafety: 'workflow:git-safety',
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- tests/workflow-runs-state.test.mjs
```

Expected: PASS for the new contract test.

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts tests/workflow-runs-state.test.mjs
git commit -m "feat(workflow): add multi-run IPC contract"
```

---

### Task 2: Persistent Runs, Delete, And Interrupted Startup State

**Files:**
- Modify: `src/main/WorkflowStore.ts`
- Modify: `src/main/WorkflowManager.ts`
- Test: `tests/workflow-runs-state.test.mjs`

- [ ] **Step 1: Extend the failing test**

Append to `tests/workflow-runs-state.test.mjs`:

```js
const store = readFileSync(join(root, 'src/main/WorkflowStore.ts'), 'utf8')
const manager = readFileSync(join(root, 'src/main/WorkflowManager.ts'), 'utf8')

test('workflow store keeps permanent history and can delete one run', () => {
  assert.doesNotMatch(store, /slice\(0,\s*20\)/)
  assert.match(store, /deleteRun\(id: string\)/)
})

test('workflow manager marks restored running runs as interrupted', () => {
  assert.match(manager, /markInterruptedRunsOnStartup/)
  assert.match(manager, /status === 'running'/)
  assert.match(manager, /status = 'interrupted'/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/workflow-runs-state.test.mjs
```

Expected: FAIL because store still slices history and manager lacks startup interruption handling.

- [ ] **Step 3: Modify `WorkflowStore`**

Change `saveRun` in `src/main/WorkflowStore.ts`:

```ts
  saveRun(run: WorkflowRun): void {
    const list = this.listRuns()
    const idx = list.findIndex((item) => item.id === run.id)
    if (idx >= 0) list[idx] = run
    else list.unshift(run)
    writeArray(this.runsPath, list)
  }

  deleteRun(id: string): void {
    writeArray(
      this.runsPath,
      this.listRuns().filter((run) => run.id !== id)
    )
  }
```

- [ ] **Step 4: Modify `WorkflowManager` constructor and add run APIs**

In `src/main/WorkflowManager.ts`, replace constructor body:

```ts
  constructor(
    private readonly agentStore: AgentStore,
    private readonly workflowStore: WorkflowStore,
    private readonly runManager: RunManager,
    private readonly transcripts: TranscriptStore,
    private readonly emit: EmitWorkflow
  ) {
    for (const run of this.markInterruptedRunsOnStartup(workflowStore.listRuns())) {
      this.runs.set(run.id, run)
    }
  }
```

Add public methods near `start`:

```ts
  listRuns(): WorkflowRun[] {
    return [...this.runs.values()].sort((a, b) => b.startedAt - a.startedAt)
  }

  deleteRun(runId: string): void {
    const run = this.getRun(runId)
    if (run.status === 'running') {
      throw new Error('Stop a running workflow before deleting it')
    }
    const live = this.liveByRunId.get(runId)
    if (live) this.runManager.abort(live.childRunId)
    this.liveByRunId.delete(runId)
    this.runs.delete(runId)
    this.workflowStore.deleteRun(runId)
  }
```

Add private startup helper before `getRun`:

```ts
  private markInterruptedRunsOnStartup(runs: WorkflowRun[]): WorkflowRun[] {
    return runs.map((run) => {
      if (run.status !== 'running') return run

      const interrupted: WorkflowRun = {
        ...run,
        status: 'interrupted',
        finishedAt: run.finishedAt ?? Date.now(),
        steps: run.steps.map((step, index) => {
          if (index !== run.currentStepIndex || step.status !== 'running') return step
          return {
            ...step,
            status: 'error',
            executions: step.executions.map((execution, executionIndex, list) => {
              if (executionIndex !== list.length - 1 || execution.status !== 'running') return execution
              return {
                ...execution,
                status: 'error',
                finishedAt: execution.finishedAt ?? Date.now(),
                error: 'App restarted before this workflow step finished'
              }
            })
          }
        })
      }
      this.workflowStore.saveRun(interrupted)
      return interrupted
    })
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
npm test -- tests/workflow-runs-state.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/WorkflowStore.ts src/main/WorkflowManager.ts tests/workflow-runs-state.test.mjs
git commit -m "feat(workflow): persist and list workflow runs"
```

---

### Task 3: Git Safety Detection

**Files:**
- Create: `src/main/gitSafety.ts`
- Modify: `src/main/WorkflowManager.ts`
- Test: `tests/workflow-git-safety.test.mjs`

- [ ] **Step 1: Write failing source contract test**

Create `tests/workflow-git-safety.test.mjs`:

```js
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const gitSafety = readFileSync(join(root, 'src/main/gitSafety.ts'), 'utf8')
const manager = readFileSync(join(root, 'src/main/WorkflowManager.ts'), 'utf8')

test('git safety detects roots, linked worktrees, and conflicts', () => {
  assert.match(gitSafety, /inspectWorkflowGitSafety/)
  assert.match(gitSafety, /rev-parse/)
  assert.match(gitSafety, /--show-toplevel/)
  assert.match(gitSafety, /--git-dir/)
  assert.match(gitSafety, /--git-common-dir/)
  assert.match(gitSafety, /sameWorkingTreeRunIds/)
  assert.match(gitSafety, /relatedWorktreeRunIds/)
  assert.match(gitSafety, /isLinkedWorktree/)
  assert.match(gitSafety, /requires-confirmation/)
})

test('workflow manager checks git safety before start', () => {
  assert.match(manager, /inspectWorkflowGitSafety/)
  assert.match(manager, /allowUnsafeSameGitRoot/)
  assert.match(manager, /requires-confirmation/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/workflow-git-safety.test.mjs
```

Expected: FAIL because `gitSafety.ts` does not exist.

- [ ] **Step 3: Implement `gitSafety.ts`**

Create `src/main/gitSafety.ts`:

```ts
import { execFileSync } from 'node:child_process'
import { isAbsolute, resolve } from 'node:path'
import type { WorkflowRun, WorkflowRunGitSafety } from '@shared/types'

export function inspectWorkflowGitSafety(
  projectPath: string,
  runs: WorkflowRun[]
): WorkflowRunGitSafety {
  const normalizedProjectPath = resolve(projectPath)
  const activeRuns = runs.filter((run) => run.status === 'running' || run.status === 'awaiting-confirm')
  const exactPathRunIds = activeRuns
    .filter((run) => resolve(run.projectPath) === normalizedProjectPath)
    .map((run) => run.id)
  const gitRoot = git(['-C', normalizedProjectPath, 'rev-parse', '--show-toplevel'])
  if (!gitRoot) {
    return {
      projectPath: normalizedProjectPath,
      isGitRepo: false,
      isLinkedWorktree: false,
      sameWorkingTreeRunIds: exactPathRunIds,
      relatedWorktreeRunIds: [],
      conflictingRunIds: exactPathRunIds,
      level: exactPathRunIds.length > 0 ? 'requires-confirmation' : 'safe',
      message: exactPathRunIds.length > 0
        ? 'Same project directory is already used by another workflow run; confirm before starting.'
        : undefined
    }
  }

  const gitDir = normalizeGitPath(
    normalizedProjectPath,
    git(['-C', normalizedProjectPath, 'rev-parse', '--git-dir'])
  )
  const commonGitDir = normalizeGitPath(
    normalizedProjectPath,
    git(['-C', normalizedProjectPath, 'rev-parse', '--git-common-dir'])
  )
  const branch = git(['-C', normalizedProjectPath, 'branch', '--show-current']) || undefined
  const isLinkedWorktree = !!gitDir && !!commonGitDir && gitDir !== commonGitDir

  const sameWorkingTreeRunIds = activeRuns
    .filter((run) => git(['-C', resolve(run.projectPath), 'rev-parse', '--show-toplevel']) === gitRoot)
    .map((run) => run.id)

  const relatedWorktreeRunIds = activeRuns
    .filter((run) => {
      const runRoot = git(['-C', resolve(run.projectPath), 'rev-parse', '--show-toplevel'])
      if (runRoot === gitRoot) return false
      const runCommonGitDir = normalizeGitPath(
        resolve(run.projectPath),
        git(['-C', resolve(run.projectPath), 'rev-parse', '--git-common-dir'])
      )
      return !!commonGitDir && runCommonGitDir === commonGitDir
    })
    .map((run) => run.id)

  const conflictingRunIds = [...sameWorkingTreeRunIds, ...relatedWorktreeRunIds]

  if (conflictingRunIds.length === 0) {
    return {
      projectPath: normalizedProjectPath,
      gitRoot,
      commonGitDir,
      branch,
      isGitRepo: true,
      isLinkedWorktree,
      sameWorkingTreeRunIds,
      relatedWorktreeRunIds,
      conflictingRunIds,
      level: 'safe'
    }
  }

  return {
    projectPath: normalizedProjectPath,
    gitRoot,
    commonGitDir,
    branch,
    isGitRepo: true,
    isLinkedWorktree,
    sameWorkingTreeRunIds,
    relatedWorktreeRunIds,
    conflictingRunIds,
    level: sameWorkingTreeRunIds.length > 0 ? 'requires-confirmation' : 'warning',
    message: sameWorkingTreeRunIds.length > 0
      ? 'Same working tree is already used by another workflow run; confirm before starting without worktree isolation.'
      : 'Same repository is already used by another workflow run, but this directory is isolated by git worktree.'
  }
}

function git(args: string[]): string | undefined {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || undefined
  } catch {
    return undefined
  }
}

function normalizeGitPath(projectPath: string, value: string | undefined): string | undefined {
  if (!value) return undefined
  return isAbsolute(value) ? resolve(value) : resolve(projectPath, value)
}
```

- [ ] **Step 4: Wire safety into `WorkflowManager.start`**

Import helper:

```ts
import { inspectWorkflowGitSafety } from './gitSafety'
```

At the start of `start(input)` after template validation:

```ts
    const safety = inspectWorkflowGitSafety(input.projectPath, this.listRuns())
    if (safety.level === 'requires-confirmation' && !input.allowUnsafeSameGitRoot) {
      throw new Error(safety.message ?? 'Workflow requires confirmation before starting')
    }
```

When creating the run, include `runName`:

```ts
      runName: input.runName?.trim() || template.name,
```

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
npm test -- tests/workflow-git-safety.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/gitSafety.ts src/main/WorkflowManager.ts tests/workflow-git-safety.test.mjs
git commit -m "feat(workflow): add git concurrency safety checks"
```

---

### Task 4: IPC And Preload For Runs, Delete, Safety

**Files:**
- Modify: `src/main/ipc.ts`
- Modify: `src/preload/index.ts`
- Test: `tests/workflow-runs-state.test.mjs`

- [ ] **Step 1: Extend failing test**

Append:

```js
const ipc = readFileSync(join(root, 'src/main/ipc.ts'), 'utf8')
const preload = readFileSync(join(root, 'src/preload/index.ts'), 'utf8')

test('ipc and preload expose workflow run list, delete, and git safety', () => {
  assert.match(ipc, /IPC\.workflowRunsList/)
  assert.match(ipc, /workflowManager\.listRuns/)
  assert.match(ipc, /IPC\.workflowDeleteRun/)
  assert.match(ipc, /workflowManager\.deleteRun/)
  assert.match(ipc, /IPC\.workflowGitSafety/)
  assert.match(preload, /listWorkflowRuns/)
  assert.match(preload, /deleteWorkflowRun/)
  assert.match(preload, /inspectWorkflowGitSafety/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/workflow-runs-state.test.mjs
```

Expected: FAIL.

- [ ] **Step 3: Update IPC handlers**

In `src/main/ipc.ts`, import `WorkflowRun` and `WorkflowRunGitSafety`:

```ts
  type WorkflowRun,
  type WorkflowRunGitSafety,
```

Import safety helper:

```ts
import { inspectWorkflowGitSafety } from './gitSafety'
```

Add handlers after `workflowStart`:

```ts
  ipcMain.handle(IPC.workflowRunsList, (): WorkflowRun[] => workflowManager.listRuns())

  ipcMain.handle(IPC.workflowDeleteRun, (_e, runId: string): void => {
    workflowManager.deleteRun(runId)
  })

  ipcMain.handle(IPC.workflowGitSafety, (_e, projectPath: string): WorkflowRunGitSafety =>
    inspectWorkflowGitSafety(projectPath, workflowManager.listRuns())
  )
```

- [ ] **Step 4: Update preload API**

In `src/preload/index.ts`, import new types:

```ts
  type WorkflowRun,
  type WorkflowRunGitSafety,
```

Add methods:

```ts
  listWorkflowRuns: (): Promise<WorkflowRun[]> => ipcRenderer.invoke(IPC.workflowRunsList),

  deleteWorkflowRun: (runId: string): Promise<void> =>
    ipcRenderer.invoke(IPC.workflowDeleteRun, runId),

  inspectWorkflowGitSafety: (projectPath: string): Promise<WorkflowRunGitSafety> =>
    ipcRenderer.invoke(IPC.workflowGitSafety, projectPath),
```

- [ ] **Step 5: Run tests and typecheck**

Run:

```bash
npm test -- tests/workflow-runs-state.test.mjs
npm run typecheck
```

Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add src/main/ipc.ts src/preload/index.ts tests/workflow-runs-state.test.mjs
git commit -m "feat(workflow): expose run history IPC"
```

---

### Task 5: Multi-Run Renderer State Hook

**Files:**
- Modify: `src/renderer/src/useWorkflows.ts`
- Create: `src/renderer/src/workflowRunView.ts`
- Test: `tests/workflow-runs-state.test.mjs`

- [ ] **Step 1: Extend failing test**

Append:

```js
const useWorkflows = readFileSync(join(root, 'src/renderer/src/useWorkflows.ts'), 'utf8')
const runView = readFileSync(join(root, 'src/renderer/src/workflowRunView.ts'), 'utf8')

test('renderer stores many workflow runs and selected run id', () => {
  assert.match(useWorkflows, /const \[runs, setRuns\]/)
  assert.match(useWorkflows, /const \[selectedRunId, setSelectedRunId\]/)
  assert.match(useWorkflows, /selectedRun/)
  assert.match(useWorkflows, /applyWorkflowEventToRuns/)
  assert.doesNotMatch(useWorkflows, /const \[currentRun, setCurrentRun\]/)
})

test('workflow run view derives sorted runs and latest tail', () => {
  assert.match(runView, /sortWorkflowRunsByStartedAt/)
  assert.match(runView, /workflowRunDisplayName/)
  assert.match(runView, /workflowRunTailLines/)
  assert.match(runView, /workflowNotificationForRun/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/workflow-runs-state.test.mjs
```

Expected: FAIL because the hook is still single-run and `workflowRunView.ts` does not exist.

- [ ] **Step 3: Create `workflowRunView.ts`**

Create `src/renderer/src/workflowRunView.ts`:

```ts
import type { AgentEvent, WorkflowRun } from '@shared/types'
import type { WorkflowNotificationSound } from './workflowNotificationSound'

export interface WorkflowNotification {
  key: string
  sound: WorkflowNotificationSound
}

export function sortWorkflowRunsByStartedAt(runs: WorkflowRun[]): WorkflowRun[] {
  return [...runs].sort((a, b) => b.startedAt - a.startedAt)
}

export function workflowRunDisplayName(run: WorkflowRun): string {
  return run.runName?.trim() || run.templateName
}

export function workflowRunTailLines(run: WorkflowRun, count = 3): string[] {
  const events = run.steps.flatMap((step) => step.executions.at(-1)?.events ?? [])
  return events
    .flatMap(eventToTailLine)
    .slice(-count)
}

export function workflowNotificationForRun(run: WorkflowRun): WorkflowNotification | null {
  if (run.status === 'awaiting-confirm') {
    const step = run.steps[run.currentStepIndex]
    const execution = step?.executions.at(-1)
    return {
      key: `${run.id}:confirm:${run.currentStepIndex}:${execution?.id ?? 'none'}`,
      sound: 'confirm'
    }
  }

  if (
    run.status === 'completed' ||
    run.status === 'error' ||
    run.status === 'aborted' ||
    run.status === 'interrupted'
  ) {
    return {
      key: `${run.id}:finished:${run.status}:${run.finishedAt ?? 'none'}`,
      sound: 'finished'
    }
  }

  return null
}

function eventToTailLine(event: AgentEvent): string[] {
  if (event.kind === 'message') return [`assistant: ${event.text}`]
  if (event.kind === 'message-delta') return [`delta: ${event.text}`]
  if (event.kind === 'tool-call') return [`tool: ${event.name}`]
  if (event.kind === 'system') return [`system: ${event.text}`]
  if (event.kind === 'error') return [`error: ${event.message}`]
  return []
}
```

- [ ] **Step 4: Rewrite `useWorkflows.ts` state**

Replace single `currentRun` state with:

```ts
  const [runs, setRuns] = useState<WorkflowRun[]>([])
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)

  const selectedRun = runs.find((run) => run.id === selectedRunId) ?? runs[0] ?? null
```

Add reload:

```ts
  const reloadRuns = useCallback(async () => {
    const loaded = await window.api.listWorkflowRuns()
    setRuns(loaded)
    setSelectedRunId((prev) => prev ?? loaded[0]?.id ?? null)
  }, [])
```

On mount, load both templates and persisted runs:

```ts
  useEffect(() => {
    void reload()
    void reloadRuns()
  }, [reload, reloadRuns])
```

Change `start`:

```ts
  const start = useCallback(async (input: WorkflowStartInput) => {
    const { run } = await window.api.startWorkflow(input)
    setRuns((prev) => sortWorkflowRunsByStartedAt([run, ...prev.filter((item) => item.id !== run.id)]))
    setSelectedRunId(run.id)
    return run
  }, [])
```

Change actions to accept selected run:

```ts
  const confirmStep = useCallback(async () => {
    if (!selectedRun) return
    const run = await window.api.confirmWorkflowStep(selectedRun.id)
    setRuns((prev) => applyRunUpdate(prev, run))
    setSelectedRunId(run.id)
  }, [selectedRun])
```

Add delete:

```ts
  const deleteRun = useCallback(async (runId: string) => {
    await window.api.deleteWorkflowRun(runId)
    setRuns((prev) => {
      const next = prev.filter((run) => run.id !== runId)
      setSelectedRunId((selected) => selected === runId ? next[0]?.id ?? null : selected)
      return next
    })
  }, [])
```

Replace event reducer with:

```ts
function applyRunUpdate(runs: WorkflowRun[], updated: WorkflowRun): WorkflowRun[] {
  const next = runs.map((run) => (run.id === updated.id ? updated : run))
  if (!next.some((run) => run.id === updated.id)) next.push(updated)
  return sortWorkflowRunsByStartedAt(next)
}

function applyWorkflowEventToRuns(
  current: WorkflowRun[],
  { runId, event }: WorkflowEventEnvelope
): WorkflowRun[] {
  if (event.kind === 'run-updated') return applyRunUpdate(current, event.run)

  return current.map((run) => {
    if (run.id !== runId || event.kind !== 'agent-event') return run
    return {
      ...run,
      steps: run.steps.map((step, stepIndex) => {
        if (stepIndex !== event.stepIndex) return step
        return {
          ...step,
          executions: step.executions.map((execution) => {
            if (execution.id !== event.executionId) return execution
            return {
              ...execution,
              events: [...execution.events, event.event],
              sessionId:
                event.event.kind === 'session-started' ? event.event.sessionId : execution.sessionId
            }
          })
        }
      })
    }
  })
}
```

Return:

```ts
    runs,
    selectedRun,
    selectedRunId,
    selectRun: setSelectedRunId,
    reloadRuns,
    save,
    remove,
    start,
    confirmStep,
    rerunStep,
    abort,
    pushInput,
    deleteRun,
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm test -- tests/workflow-runs-state.test.mjs
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/useWorkflows.ts src/renderer/src/workflowRunView.ts tests/workflow-runs-state.test.mjs
git commit -m "feat(workflow): track multiple runs in renderer"
```

---

### Task 6: Workflow Workspace Layout Components

**Files:**
- Create: `src/renderer/src/WorkflowWorkspace.tsx`
- Create: `src/renderer/src/WorkflowRunsList.tsx`
- Create: `src/renderer/src/WorkflowRunDetail.tsx`
- Create: `src/renderer/src/WorkflowStepsPanel.tsx`
- Create: `src/renderer/src/HandoffPanel.tsx`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/styles.css`
- Test: `tests/workflow-ui-layout.test.mjs`

- [ ] **Step 1: Write failing UI layout test**

Create `tests/workflow-ui-layout.test.mjs`:

```js
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const css = readFileSync(join(root, 'src/renderer/src/styles.css'), 'utf8')
const workspace = readFileSync(join(root, 'src/renderer/src/WorkflowWorkspace.tsx'), 'utf8')
const runsList = readFileSync(join(root, 'src/renderer/src/WorkflowRunsList.tsx'), 'utf8')
const detail = readFileSync(join(root, 'src/renderer/src/WorkflowRunDetail.tsx'), 'utf8')
const steps = readFileSync(join(root, 'src/renderer/src/WorkflowStepsPanel.tsx'), 'utf8')
const handoff = readFileSync(join(root, 'src/renderer/src/HandoffPanel.tsx'), 'utf8')

test('workflow workspace uses runs-detail-steps layout', () => {
  assert.match(css, /\.workflow-workspace\s*\{/)
  assert.match(css, /grid-template-columns:\s*400px minmax\(0,\s*1fr\) 250px;/)
  assert.match(workspace, /WorkflowRunsList/)
  assert.match(workspace, /WorkflowRunDetail/)
  assert.match(workspace, /WorkflowStepsPanel/)
})

test('runs list contains realtime tail but no confirm button', () => {
  assert.match(runsList, /workflowRunTailLines/)
  assert.match(runsList, /onSelectRun/)
  assert.doesNotMatch(runsList, /确认详情|Confirm/)
})

test('steps panel lives on the right and supports long workflows', () => {
  assert.match(steps, /workflow-steps-panel/)
  assert.match(steps, /placeholder="搜索步骤 \\/ agent"/)
  assert.match(steps, /overflow-y/)
})

test('run detail owns transcript, handoff, and composer', () => {
  assert.match(detail, /TranscriptViewer/)
  assert.match(detail, /HandoffPanel/)
  assert.match(detail, /workflow-cli-composer/)
  assert.match(handoff, /formatHandoffDisplay/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/workflow-ui-layout.test.mjs
```

Expected: FAIL because new components do not exist.

- [ ] **Step 3: Create `WorkflowRunsList.tsx`**

Create:

```tsx
import type { WorkflowRun } from '@shared/types'
import { workflowRunDisplayName, workflowRunTailLines } from './workflowRunView'

interface WorkflowRunsListProps {
  runs: WorkflowRun[]
  selectedRunId: string | null
  onSelectRun: (runId: string) => void
  onNewRun: () => void
}

export function WorkflowRunsList({
  runs,
  selectedRunId,
  onSelectRun,
  onNewRun
}: WorkflowRunsListProps): JSX.Element {
  return (
    <aside className="workflow-runs-list">
      <div className="workflow-runs-header">
        <div>
          <div className="section-title">Workflow Runs</div>
          <p>按开始时间倒序；点击 run 卡片进入详情和确认。</p>
        </div>
        <button type="button" className="primary" onClick={onNewRun}>New Run</button>
      </div>

      <div className="workflow-run-filters" aria-label="Workflow run filters">
        <button type="button" className="active">All</button>
        <button type="button">Run</button>
        <button type="button">Wait</button>
        <button type="button">Done</button>
        <button type="button">Error</button>
      </div>

      <div className="workflow-run-cards">
        {runs.map((run) => (
          <button
            type="button"
            key={run.id}
            className={[
              'workflow-run-card',
              selectedRunId === run.id ? 'workflow-run-card-active' : '',
              run.status === 'awaiting-confirm' ? 'workflow-run-card-waiting' : '',
              run.status === 'error' || run.status === 'interrupted' ? 'workflow-run-card-error' : ''
            ].filter(Boolean).join(' ')}
            onClick={() => onSelectRun(run.id)}
          >
            <div className="workflow-run-card-main">
              <strong>{workflowRunDisplayName(run)}</strong>
              <span>{runStatusShortLabel(run.status)}</span>
            </div>
            <p>{new Date(run.startedAt).toLocaleTimeString()} · {run.projectPath}</p>
            <div className="workflow-run-card-tail">
              {workflowRunTailLines(run).map((line, index) => (
                <span key={`${run.id}-tail-${index}`}>{line}</span>
              ))}
            </div>
          </button>
        ))}
      </div>
    </aside>
  )
}

function runStatusShortLabel(status: WorkflowRun['status']): string {
  switch (status) {
    case 'running': return 'RUN'
    case 'awaiting-confirm': return 'WAIT'
    case 'completed': return 'DONE'
    case 'error': return 'ERROR'
    case 'aborted': return 'STOP'
    case 'interrupted': return 'INT'
  }
}
```

- [ ] **Step 4: Create `WorkflowStepsPanel.tsx`**

Create:

```tsx
import { useMemo, useState } from 'react'
import type { AgentDefinition, WorkflowRun } from '@shared/types'

interface WorkflowStepsPanelProps {
  run: WorkflowRun | null
  agents: AgentDefinition[]
  selectedStepIndex: number
  onSelectStep: (index: number) => void
}

export function WorkflowStepsPanel({
  run,
  agents,
  selectedStepIndex,
  onSelectStep
}: WorkflowStepsPanelProps): JSX.Element {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    if (!run) return []
    const clean = query.trim().toLowerCase()
    return run.steps
      .map((step, index) => ({ step, index, agent: agents.find((item) => item.id === step.agentId) }))
      .filter(({ agent, index }) =>
        !clean ||
        String(index + 1).includes(clean) ||
        (agent?.name ?? '').toLowerCase().includes(clean) ||
        (agent?.role ?? '').toLowerCase().includes(clean)
      )
  }, [agents, query, run])

  return (
    <aside className="workflow-steps-panel">
      <div className="workflow-steps-header">
        <div className="workflow-steps-title">
          <span>Steps</span>
          <strong>{run ? `${run.steps.length} total` : '0 total'}</strong>
        </div>
        <input
          value={query}
          placeholder="搜索步骤 / agent"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="workflow-steps-list">
        {filtered.map(({ step, index, agent }) => (
          <button
            type="button"
            key={`${run?.id}-${index}`}
            className={[
              'workflow-step-nav-card',
              selectedStepIndex === index ? 'workflow-step-nav-card-active' : '',
              step.status === 'awaiting-confirm' ? 'workflow-step-nav-card-waiting' : ''
            ].filter(Boolean).join(' ')}
            onClick={() => onSelectStep(index)}
          >
            <span>{index + 1}. {agent?.name ?? 'Missing agent'}</span>
            <small>{agent?.role ?? 'unknown'} · {stepStatusLabel(step.status)}</small>
          </button>
        ))}
      </div>
    </aside>
  )
}

function stepStatusLabel(status: WorkflowRun['steps'][number]['status']): string {
  switch (status) {
    case 'pending': return '待运行'
    case 'running': return '运行中'
    case 'awaiting-confirm': return '等待确认'
    case 'done': return '完成'
    case 'stale': return '已过期'
    case 'error': return '错误'
  }
}
```

- [ ] **Step 5: Extract `HandoffPanel.tsx` and create `WorkflowRunDetail.tsx`**

First move the existing `HandoffPanel` function from `App.tsx` into `src/renderer/src/HandoffPanel.tsx`. Import `formatHandoffDisplay` from `./handoffDisplay` and icons from `./Icons`.

Then move the existing `WorkflowRuntime` middle-detail logic from `App.tsx` into `WorkflowRunDetail.tsx`, but without the old left run sidebar and without the old collapsed handoff rail. The public shape should be:

```tsx
export interface WorkflowRunDetailProps {
  run: WorkflowRun | null
  selectedStepIndex: number
  selectedExecution: WorkflowRun['steps'][number]['executions'][number] | null
  handoff: NonNullable<WorkflowRun['steps'][number]['executions'][number]['handoff']> | null
  onConfirm: () => Promise<void>
  onRerun: (stepIndex: number) => Promise<void>
  onAbort: () => Promise<void>
  composerValue: string
  composerEditable: boolean
  composerEnabled: boolean
  composerPlaceholder: string
  composerError: string | null
  onComposerChange: (value: string) => void
  onComposerSend: () => Promise<void>
}
```

Inside the render, use this structure:

```tsx
if (!run) {
  return (
    <main className="workflow-run-detail workflow-run-detail-empty">
      <strong>暂无工作流运行</strong>
      <span>点击左侧 New Run 从模板启动一个 workflow。</span>
    </main>
  )
}
```

For selected content:

```tsx
<main className="workflow-run-detail">
  <div className="workflow-run-detail-header">
    <div>
      <h2>{run.runName || run.templateName}</h2>
      <p>{run.projectPath}</p>
    </div>
    <div className="workflow-run-detail-actions">
      <button type="button" onClick={() => onRerun(selectedStepIndex)}>
        <RotateCcw size={14} /> 重新运行
      </button>
      {run.status === 'running' && <button type="button" onClick={onAbort}>停止</button>}
    </div>
  </div>
  <TranscriptViewer events={selectedExecution?.events ?? []} />
  {handoff && run.status === 'awaiting-confirm' && (
    <HandoffPanel handoff={handoff} />
  )}
  <div className="workflow-cli-composer">...</div>
</main>
```

- [ ] **Step 6: Create `WorkflowWorkspace.tsx`**

Create:

```tsx
import { useMemo, useState } from 'react'
import type { AgentDefinition } from '@shared/types'
import { WorkflowRunsList } from './WorkflowRunsList'
import { WorkflowRunDetail } from './WorkflowRunDetail'
import { WorkflowStepsPanel } from './WorkflowStepsPanel'
import { NewWorkflowRunDrawer } from './NewWorkflowRunDrawer'
import type { UseWorkflowsResult } from './useWorkflows'

interface WorkflowWorkspaceProps {
  agents: AgentDefinition[]
  workflows: UseWorkflowsResult
}

export function WorkflowWorkspace({ agents, workflows }: WorkflowWorkspaceProps): JSX.Element {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selectedStepByRunId, setSelectedStepByRunId] = useState<Record<string, number>>({})
  const [workflowInput, setWorkflowInput] = useState('')
  const [workflowInputError, setWorkflowInputError] = useState<string | null>(null)
  const selectedRun = workflows.selectedRun
  const selectedStepIndex = selectedRun
    ? selectedStepByRunId[selectedRun.id] ?? selectedRun.currentStepIndex
    : 0
  const selectedExecution = selectedRun
    ? selectedRun.steps[selectedStepIndex]?.executions.at(-1) ?? null
    : null
  const selectedStepState = selectedRun?.steps[selectedStepIndex] ?? null
  const selectedAgent = selectedStepState
    ? agents.find((agent) => agent.id === selectedStepState.agentId) ?? null
    : null
  const handoff = selectedExecution?.handoff ?? null

  const workflowCanInterject =
    selectedAgent?.vendor === 'claude' && selectedStepState?.status === 'running'
  const workflowCanContinue =
    !!selectedExecution?.sessionId &&
    !!selectedStepState &&
    selectedStepState.status !== 'pending' &&
    selectedStepState.status !== 'running'
  const composerEnabled = !!selectedRun && (workflowCanInterject || workflowCanContinue)
  const composerEditable = !!selectedRun && !!selectedStepState
  const composerPlaceholder = buildWorkflowComposerPlaceholder(
    selectedRun,
    selectedAgent,
    selectedStepState,
    selectedExecution
  )

  const setSelectedStepIndex = (index: number) => {
    if (!selectedRun) return
    setSelectedStepByRunId((prev) => ({ ...prev, [selectedRun.id]: index }))
  }

  const sendWorkflowInput = async (): Promise<void> => {
    const text = workflowInput.trim()
    if (!selectedRun || !text || !composerEnabled) return
    setWorkflowInput('')
    setWorkflowInputError(null)
    try {
      await workflows.pushInput(selectedStepIndex, text)
    } catch (err) {
      setWorkflowInputError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <section className="workflow-workspace">
      <WorkflowRunsList
        runs={workflows.runs}
        selectedRunId={workflows.selectedRunId}
        onSelectRun={workflows.selectRun}
        onNewRun={() => setDrawerOpen(true)}
      />
      <WorkflowRunDetail
        run={selectedRun}
        selectedStepIndex={selectedStepIndex}
        selectedExecution={selectedExecution}
        handoff={handoff}
        onConfirm={workflows.confirmStep}
        onRerun={workflows.rerunStep}
        onAbort={workflows.abort}
        composerValue={workflowInput}
        composerEditable={composerEditable}
        composerEnabled={composerEnabled}
        composerPlaceholder={composerPlaceholder}
        composerError={workflowInputError}
        onComposerChange={(value) => {
          setWorkflowInput(value)
          setWorkflowInputError(null)
        }}
        onComposerSend={sendWorkflowInput}
      />
      <WorkflowStepsPanel
        run={selectedRun}
        agents={agents}
        selectedStepIndex={selectedStepIndex}
        onSelectStep={setSelectedStepIndex}
      />
      {drawerOpen && (
        <NewWorkflowRunDrawer
          agents={agents}
          templates={workflows.templates}
          onStart={workflows.start}
          onInspectGitSafety={window.api.inspectWorkflowGitSafety}
          runningRunCount={workflows.runs.filter((run) => run.status === 'running').length}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </section>
  )
}
```

If `UseWorkflowsResult` does not exist yet, export it from `useWorkflows.ts` using `export type UseWorkflowsResult = ReturnType<typeof useWorkflows>`.

Add `buildWorkflowComposerPlaceholder` below the component by moving the existing placeholder logic out of `App.tsx` and making it accept `selectedRun`, `selectedAgent`, `selectedStepState`, and `selectedExecution`.

- [ ] **Step 7: Add CSS layout**

Add to `src/renderer/src/styles.css`:

```css
.workflow-workspace {
  min-height: 0;
  display: grid;
  grid-template-columns: 400px minmax(0, 1fr) 250px;
  flex: 1;
}

.workflow-runs-list,
.workflow-steps-panel {
  min-width: 0;
  min-height: 0;
  background: var(--bg-panel);
  display: flex;
  flex-direction: column;
}

.workflow-runs-list { border-right: 1px solid var(--border); }
.workflow-steps-panel { border-left: 1px solid var(--border); }

.workflow-run-cards,
.workflow-steps-list {
  min-height: 0;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.workflow-run-card {
  width: 100%;
  display: grid;
  gap: 8px;
  text-align: left;
  white-space: normal;
}

.workflow-run-card-tail {
  border-radius: 6px;
  background: var(--bg-input);
  padding: 7px 8px;
  color: var(--text-dim);
  font-family: 'SF Mono', Menlo, monospace;
  font-size: 11px;
  line-height: 1.45;
  max-height: 62px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.workflow-step-nav-card {
  width: 100%;
  display: grid;
  gap: 5px;
  text-align: left;
  white-space: normal;
}

.workflow-run-detail {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
```

- [ ] **Step 8: Wire `App.tsx` to the new workspace**

Change mode type:

```ts
type WorkspaceMode = 'workflow' | 'templates' | 'single' | 'agents'
```

Use four nav buttons.

For workflow mode, render:

```tsx
<WorkflowWorkspace agents={agents} workflows={workflows} />
```

For templates mode, render `TemplatesView`.

Keep Single and Agents behavior intact.

- [ ] **Step 9: Run tests and typecheck**

Run:

```bash
npm test -- tests/workflow-ui-layout.test.mjs
npm run typecheck
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/renderer/src/WorkflowWorkspace.tsx src/renderer/src/WorkflowRunsList.tsx src/renderer/src/WorkflowRunDetail.tsx src/renderer/src/WorkflowStepsPanel.tsx src/renderer/src/HandoffPanel.tsx src/renderer/src/App.tsx src/renderer/src/styles.css tests/workflow-ui-layout.test.mjs
git commit -m "feat(workflow): add multi-run workspace layout"
```

---

### Task 7: New Run Drawer

**Files:**
- Create: `src/renderer/src/NewWorkflowRunDrawer.tsx`
- Modify: `src/renderer/src/WorkflowWorkspace.tsx`
- Test: `tests/workflow-ui-layout.test.mjs`

- [ ] **Step 1: Extend failing UI test**

Append:

```js
const drawer = readFileSync(join(root, 'src/renderer/src/NewWorkflowRunDrawer.tsx'), 'utf8')

test('new workflow run starts from a drawer with git safety confirmation', () => {
  assert.match(drawer, /New Workflow Run/)
  assert.match(drawer, /Template/)
  assert.match(drawer, /Run Name/)
  assert.match(drawer, /Project Directory/)
  assert.match(drawer, /onInspectGitSafety/)
  assert.match(drawer, /allowUnsafeSameGitRoot/)
  assert.match(drawer, /runningRunCount/)
  assert.match(drawer, /allowHighConcurrency/)
  assert.match(drawer, /5/)
  assert.match(drawer, /仍然启动/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/workflow-ui-layout.test.mjs
```

Expected: FAIL because drawer does not exist.

- [ ] **Step 3: Implement drawer**

Create `src/renderer/src/NewWorkflowRunDrawer.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react'
import type {
  AgentDefinition,
  WorkflowRunGitSafety,
  WorkflowStartInput,
  WorkflowTemplate
} from '@shared/types'
import { FolderOpen, Play, X } from './Icons'
import { readLastProjectPath, rememberProjectPath } from './projectPathMemory'

interface NewWorkflowRunDrawerProps {
  agents: AgentDefinition[]
  templates: WorkflowTemplate[]
  onStart: (input: WorkflowStartInput) => Promise<unknown>
  onInspectGitSafety: (projectPath: string) => Promise<WorkflowRunGitSafety>
  runningRunCount: number
  onClose: () => void
}

export function NewWorkflowRunDrawer({
  agents,
  templates,
  onStart,
  onInspectGitSafety,
  runningRunCount,
  onClose
}: NewWorkflowRunDrawerProps): JSX.Element {
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '')
  const [runName, setRunName] = useState('')
  const [projectPath, setProjectPath] = useState(readLastProjectPath)
  const [initialPrompt, setInitialPrompt] = useState('')
  const [safety, setSafety] = useState<WorkflowRunGitSafety | null>(null)
  const [allowUnsafeSameGitRoot, setAllowUnsafeSameGitRoot] = useState(false)
  const [allowHighConcurrency, setAllowHighConcurrency] = useState(false)

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === templateId) ?? null,
    [templateId, templates]
  )

  useEffect(() => {
    if (!projectPath.trim()) {
      setSafety(null)
      return
    }
    let cancelled = false
    onInspectGitSafety(projectPath.trim()).then((next) => {
      if (!cancelled) setSafety(next)
    }).catch(() => {
      if (!cancelled) setSafety(null)
    })
    return () => { cancelled = true }
  }, [onInspectGitSafety, projectPath])

  const canStart =
    !!selectedTemplate &&
    projectPath.trim() !== '' &&
    initialPrompt.trim() !== '' &&
    (safety?.level !== 'requires-confirmation' || allowUnsafeSameGitRoot) &&
    (runningRunCount < 5 || allowHighConcurrency)

  const start = async (): Promise<void> => {
    if (!selectedTemplate || !canStart) return
    rememberProjectPath(projectPath)
    await onStart({
      templateId: selectedTemplate.id,
      runName: runName.trim() || selectedTemplate.name,
      projectPath: projectPath.trim(),
      initialPrompt: initialPrompt.trim(),
      allowUnsafeSameGitRoot
    })
    onClose()
  }

  const pickDir = async (): Promise<void> => {
    const dir = await window.api.pickDir()
    if (dir) setProjectPath(dir)
  }

  return (
    <aside className="workflow-new-run-drawer" aria-label="New Workflow Run">
      <div className="workflow-new-run-header">
        <div>
          <strong>New Workflow Run</strong>
          <span>从模板启动一个新的任务实例</span>
        </div>
        <button type="button" className="icon-only" onClick={onClose} aria-label="Close">
          <X size={14} />
        </button>
      </div>

      <div className="workflow-new-run-body">
        <label className="field">
          <span>Template</span>
          <select value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>{template.name}</option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Run Name</span>
          <input value={runName} placeholder={selectedTemplate?.name ?? 'Run name'} onChange={(event) => setRunName(event.target.value)} />
        </label>

        <label className="field">
          <span>Project Directory</span>
          <div className="field-row">
            <input value={projectPath} onChange={(event) => setProjectPath(event.target.value)} />
            <button type="button" onClick={pickDir}><FolderOpen size={14} /> Browse</button>
          </div>
        </label>

        {safety?.message && (
          <div className={`workflow-git-safety workflow-git-safety-${safety.level}`}>
            {safety.message}
          </div>
        )}

        {safety?.level === 'requires-confirmation' && (
          <label className="workflow-confirm-unsafe">
            <input
              type="checkbox"
              checked={allowUnsafeSameGitRoot}
              onChange={(event) => setAllowUnsafeSameGitRoot(event.target.checked)}
            />
            <span>仍然启动</span>
          </label>
        )}

        {runningRunCount >= 3 && (
          <div className="workflow-git-safety workflow-git-safety-warning">
            当前已有 {runningRunCount} 个 workflow 正在运行，继续启动可能增加 CPU、内存和 CLI 限流压力。
          </div>
        )}

        {runningRunCount >= 5 && (
          <label className="workflow-confirm-unsafe">
            <input
              type="checkbox"
              checked={allowHighConcurrency}
              onChange={(event) => setAllowHighConcurrency(event.target.checked)}
            />
            <span>确认超过 5 个 workflow 同时运行</span>
          </label>
        )}

        <label className="field">
          <span>Task Prompt</span>
          <textarea value={initialPrompt} onChange={(event) => setInitialPrompt(event.target.value)} />
        </label>

        <div className="workflow-template-preview">
          <strong>Template Preview</strong>
          <span>{selectedTemplate?.steps.length ?? 0} steps</span>
        </div>
      </div>

      <div className="workflow-new-run-actions">
        <button type="button" onClick={onClose}>Cancel</button>
        <button type="button" className="primary" disabled={!canStart} onClick={start}>
          <Play size={14} /> Start Run
        </button>
      </div>
    </aside>
  )
}
```

- [ ] **Step 4: Add drawer CSS**

Add:

```css
.workflow-new-run-drawer {
  position: absolute;
  top: 48px;
  right: 0;
  bottom: 0;
  width: 470px;
  z-index: 5;
  background: var(--bg-panel);
  border-left: 1px solid var(--border);
  box-shadow: -24px 0 64px rgba(0, 0, 0, 0.32);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
}

.workflow-new-run-header,
.workflow-new-run-actions {
  border-bottom: 1px solid var(--border);
  padding: 12px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.workflow-new-run-actions {
  border-top: 1px solid var(--border);
  border-bottom: 0;
  justify-content: flex-end;
}

.workflow-new-run-body {
  min-height: 0;
  overflow-y: auto;
  padding: 14px;
  display: grid;
  gap: 12px;
}
```

- [ ] **Step 5: Run tests and typecheck**

Run:

```bash
npm test -- tests/workflow-ui-layout.test.mjs
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/NewWorkflowRunDrawer.tsx src/renderer/src/WorkflowWorkspace.tsx src/renderer/src/styles.css tests/workflow-ui-layout.test.mjs
git commit -m "feat(workflow): add template run drawer"
```

---

### Task 8: Global Sound Preference And Multi-Run Notifications

**Files:**
- Modify: `src/renderer/src/workflowNotificationSound.ts`
- Modify: `src/renderer/src/WorkflowWorkspace.tsx`
- Modify: `tests/workflow-notification-sound.test.mjs`

- [ ] **Step 1: Update failing notification test**

In `tests/workflow-notification-sound.test.mjs`, keep `sound`, add `workspace` and `runView`, and replace the old `App.tsx`-based transition assertions with:

```js
const workspace = readFileSync(join(root, 'src/renderer/src/WorkflowWorkspace.tsx'), 'utf8')
const runView = readFileSync(join(root, 'src/renderer/src/workflowRunView.ts'), 'utf8')

test('workflow transitions trigger deduped notification sounds from every run', () => {
  assert.match(runView, /workflowNotificationForRun\(run\)/)
  assert.match(runView, /run\.status === 'awaiting-confirm'/)
  assert.match(runView, /interrupted/)
  assert.match(workspace, /for \(const run of workflows\.runs\)/)
  assert.match(workspace, /playedNotificationKeys\.current\.has\(notification\.key\)/)
  assert.match(workspace, /playWorkflowNotificationSound\(notification\.sound\)/)
  assert.match(workspace, /prepareWorkflowNotificationSound\(\)/)
})

test('workflow notification sound supports global on off preference', () => {
  assert.match(sound, /readWorkflowNotificationSoundEnabled/)
  assert.match(sound, /writeWorkflowNotificationSoundEnabled/)
  assert.match(sound, /localStorage/)
  assert.match(workspace, /soundEnabled/)
  assert.match(workspace, /playedNotificationKeys/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/workflow-notification-sound.test.mjs
```

Expected: FAIL.

- [ ] **Step 3: Add sound preference helpers**

In `workflowNotificationSound.ts`:

```ts
const WORKFLOW_SOUND_KEY = 'agent-studio.workflow.sound-enabled'

export function readWorkflowNotificationSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true
  return window.localStorage.getItem(WORKFLOW_SOUND_KEY) !== 'false'
}

export function writeWorkflowNotificationSoundEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(WORKFLOW_SOUND_KEY, String(enabled))
}
```

At the top of `playWorkflowNotificationSound`:

```ts
  if (!readWorkflowNotificationSoundEnabled()) return
```

- [ ] **Step 4: Change notification loop to inspect every run**

In `WorkflowWorkspace.tsx`, use a ref keyed per run notification:

```tsx
const playedNotificationKeys = useRef(new Set<string>())

useEffect(() => {
  for (const run of workflows.runs) {
    const notification = workflowNotificationForRun(run)
    if (!notification || playedNotificationKeys.current.has(notification.key)) continue
    playedNotificationKeys.current.add(notification.key)
    playWorkflowNotificationSound(notification.sound)
  }
}, [workflows.runs])
```

Add global sound toggle in the Workflow page header or `WorkflowRunsList` header:

```tsx
const [soundEnabled, setSoundEnabled] = useState(readWorkflowNotificationSoundEnabled)

<button
  type="button"
  className="workflow-sound-toggle"
  onClick={() => {
    const next = !soundEnabled
    setSoundEnabled(next)
    writeWorkflowNotificationSoundEnabled(next)
  }}
>
  {soundEnabled ? 'Sound On' : 'Sound Off'}
</button>
```

- [ ] **Step 5: Run test and typecheck**

Run:

```bash
npm test -- tests/workflow-notification-sound.test.mjs
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/workflowNotificationSound.ts src/renderer/src/WorkflowWorkspace.tsx tests/workflow-notification-sound.test.mjs
git commit -m "feat(workflow): add global workflow sound toggle"
```

---

### Task 9: Templates View And Navigation Consolidation

**Files:**
- Create: `src/renderer/src/TemplatesView.tsx`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/styles.css`
- Test: `tests/workflow-ui-layout.test.mjs`

- [ ] **Step 1: Extend failing test**

Append:

```js
const templatesView = readFileSync(join(root, 'src/renderer/src/TemplatesView.tsx'), 'utf8')
const app = readFileSync(join(root, 'src/renderer/src/App.tsx'), 'utf8')

test('main navigation is consolidated to workflow templates agents single', () => {
  assert.match(app, /type WorkspaceMode = 'workflow' \| 'templates' \| 'single' \| 'agents'/)
  assert.match(app, /TemplatesView/)
  assert.match(templatesView, /Workflow Templates/)
  assert.doesNotMatch(app, /New Workflow Run['"]\s*\)/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/workflow-ui-layout.test.mjs
```

Expected: FAIL.

- [ ] **Step 3: Create `TemplatesView.tsx`**

Extract template editing from `WorkflowPanel.tsx` into:

```tsx
import type { AgentDefinition, WorkflowTemplate } from '@shared/types'
import type { WorkflowDraft } from './useWorkflows'
import { WorkflowPanel } from './WorkflowPanel'

interface TemplatesViewProps {
  agents: AgentDefinition[]
  templates: WorkflowTemplate[]
  onSave: (draft: WorkflowDraft) => Promise<WorkflowTemplate>
  onDelete: (id: string) => Promise<void>
}

export function TemplatesView({
  agents,
  templates,
  onSave,
  onDelete
}: TemplatesViewProps): JSX.Element {
  return (
    <section className="templates-view">
      <div className="templates-view-header">
        <div>
          <h2>Workflow Templates</h2>
          <p>模板定义流程；Workflow 页面使用模板启动任务实例。</p>
        </div>
      </div>
      <WorkflowPanel
        agents={agents}
        templates={templates}
        onSave={onSave}
        onDelete={onDelete}
        onStart={async () => undefined}
        hideRunControls
      />
    </section>
  )
}
```

Add `hideRunControls?: boolean` to `WorkflowPanelProps` and hide the Project Directory / Initial Prompt / Start Workflow fields when true.

- [ ] **Step 4: Update `App.tsx` nav**

Use `WorkflowWorkspace` for `workflow`, `TemplatesView` for `templates`, existing `AgentManager` for `agents`, and existing single UI for `single`.

- [ ] **Step 5: Run test and typecheck**

Run:

```bash
npm test -- tests/workflow-ui-layout.test.mjs
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/TemplatesView.tsx src/renderer/src/WorkflowPanel.tsx src/renderer/src/App.tsx src/renderer/src/styles.css tests/workflow-ui-layout.test.mjs
git commit -m "feat(workflow): separate templates from run monitor"
```

---

### Task 10: End-To-End Verification And Cleanup

**Files:**
- Modify: `tests/transcript-visual-style.test.mjs`
- Verify: all changed files

- [ ] **Step 1: Update visual source regression**

In `tests/transcript-visual-style.test.mjs`, replace old collapsible rail assumptions that no longer apply to Workflow mode with V1 layout assertions:

```js
test('multi workflow layout keeps runs, detail, and steps readable', () => {
  const workspace = block('.workflow-workspace')
  const runTail = block('.workflow-run-card-tail')
  const steps = block('.workflow-steps-panel')

  assert.match(workspace, /grid-template-columns:\s*400px minmax\(0,\s*1fr\) 250px;/)
  assert.match(runTail, /max-height:\s*62px;/)
  assert.match(steps, /border-left:\s*1px solid var\(--border\);/)
})
```

Keep existing transcript readability tests.

- [ ] **Step 2: Run full verification**

Run:

```bash
npm run typecheck
npm test
npm run build
git diff --check
```

Expected:

- TypeScript exits 0.
- Node test suite exits 0.
- Electron Vite build exits 0.
- `git diff --check` prints no output.

- [ ] **Step 3: Start local app for manual QA**

Run:

```bash
npm run dev
```

Expected:

- Renderer URL is `http://127.0.0.1:5174/`.
- App opens without main-process errors.
- Workflow page shows run list on left, detail in center, steps on right.

- [ ] **Step 4: Manual QA checklist**

Use the running app:

- Start one workflow from `New Run`.
- Start a second workflow in a different directory.
- Start a third workflow in a different git worktree from the same repository and confirm warning is shown but start is allowed.
- Attempt a same-working-tree run and verify `仍然启动` confirmation is required.
- Confirm one awaiting handoff and verify only that run advances.
- Stop one running workflow and verify status updates in the left list.
- Restart app and verify previously running runs are marked `interrupted`, while history remains.
- Delete one non-running run and verify it disappears from list and after restart.
- Toggle sound off, then cause a waiting/completed run and verify no sound plays.

- [ ] **Step 5: Commit final cleanup**

```bash
git add tests/transcript-visual-style.test.mjs src/renderer/src/styles.css
git commit -m "test(workflow): cover multi-run layout"
```

---

## Final Verification

Before claiming this feature complete, run:

```bash
npm run typecheck
npm test
npm run build
git diff --check
git status --short --branch
```

Expected:

- `npm run typecheck` exits 0.
- `npm test` exits 0.
- `npm run build` exits 0.
- `git diff --check` has no output.
- Working tree only contains intended changes, or is clean after commits.

## Out Of Scope For V1

- Node drag-and-drop workflow canvas implementation.
- Resume interrupted workflow after app restart.
- Batch cleanup for historical runs.
- Queueing runs above concurrency limits.
- Per-run sound mute.
- Virtualized run list for 10+ visible runs.
- Graph view for run execution.

## Self-Review

- Spec coverage: V1 covers template-based starts, multiple concurrent workflow runs, run list monitoring, right-side steps, git safety, persistent history, manual delete, interrupted restart status, global sound preference, and Single Agent preservation.
- Placeholder scan: no `TBD`, `TODO`, or unspecified edge-case instructions remain.
- Type consistency: `WorkflowRunStatus`, `WorkflowRunGitSafety`, `runName`, `allowUnsafeSameGitRoot`, and IPC names are introduced in Task 1 and reused consistently in later tasks.

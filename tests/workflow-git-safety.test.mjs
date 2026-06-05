import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

test('git safety detects roots, linked worktrees, and conflicts', () => {
  const gitSafety = readFileSync(join(root, 'src/main/gitSafety.ts'), 'utf8')
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
  const manager = readFileSync(join(root, 'src/main/WorkflowManager.ts'), 'utf8')
  assert.match(manager, /inspectWorkflowGitSafety/)
  assert.match(manager, /allowUnsafeSameGitRoot/)
  assert.match(manager, /requires-confirmation/)
})

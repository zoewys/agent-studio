import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import ts from 'typescript'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = readFileSync(resolve(repoRoot, 'src/renderer/src/transcriptScroll.ts'), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022
  }
}).outputText

const moduleScope = { exports: {} }
vm.runInNewContext(compiled, moduleScope)

const {
  isNearTranscriptBottom,
  isTranscriptUserInput,
  shouldAutoFollowTranscriptEvent
} = moduleScope.exports

assert.equal(
  isNearTranscriptBottom({ scrollTop: 0, clientHeight: 400, scrollHeight: 400 }),
  true,
  'a transcript without overflow should be treated as pinned to the bottom'
)

assert.equal(
  isNearTranscriptBottom({ scrollTop: 960, clientHeight: 400, scrollHeight: 1000 }),
  true,
  'a transcript near the bottom should continue auto-following new output'
)

assert.equal(
  isNearTranscriptBottom({ scrollTop: 500, clientHeight: 400, scrollHeight: 1000 }),
  false,
  'a transcript the user has scrolled upward should not be auto-pulled to the bottom'
)

assert.equal(
  isNearTranscriptBottom({ scrollTop: 552, clientHeight: 400, scrollHeight: 1000 }),
  true,
  'small gaps from the bottom should still count as pinned'
)

assert.equal(
  isTranscriptUserInput({ kind: 'system', text: '↳ User: 你自己决定' }),
  true,
  'workflow interjections should be recognized as user input events'
)

assert.equal(
  isTranscriptUserInput({ kind: 'system', text: 'resume failed, retrying with transcript context' }),
  false,
  'ordinary system notes should not disable transcript auto-follow'
)

assert.equal(
  isTranscriptUserInput({ kind: 'message', text: 'assistant reply' }),
  false,
  'assistant messages should not be treated as user input'
)

assert.equal(
  shouldAutoFollowTranscriptEvent(true, { kind: 'system', text: '↳ User: 你自己决定' }, 12),
  false,
  'adding the green user input block should preserve the previous scroll position'
)

assert.equal(
  shouldAutoFollowTranscriptEvent(true, { kind: 'message', text: 'assistant reply' }, 12),
  true,
  'assistant output should keep auto-follow enabled while the transcript is pinned'
)

assert.equal(
  shouldAutoFollowTranscriptEvent(false, { kind: 'message', text: 'assistant reply' }, 12),
  false,
  'assistant output should not re-enable auto-follow after the user scrolled up'
)

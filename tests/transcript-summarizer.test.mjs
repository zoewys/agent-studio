import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const source = readFileSync(join(root, 'src/main/memory/transcriptSummarizer.ts'), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022
  }
}).outputText
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
const { summarizeTranscript } = await import(moduleUrl)

test('summarizes user input, thinking tail, tool names, assistant output, and errors', () => {
  const summary = summarizeTranscript([
    { kind: 'system', text: 'run started' },
    { kind: 'system', text: '↳ 请分析这个需求' },
    { kind: 'thinking', text: 'x'.repeat(520) + 'final reasoning' },
    { kind: 'tool-call', id: 'tool-1', name: 'read_file', input: { path: 'SPEC.md' } },
    { kind: 'tool-result', id: 'tool-1', ok: true, output: 'large noisy result' },
    { kind: 'message-delta', text: 'partial' },
    { kind: 'message', role: 'assistant', text: '## 需求分析\n需要 CRUD。' },
    { kind: 'usage', inputTokens: 10, outputTokens: 20 },
    { kind: 'error', recoverable: true, message: 'handoff JSON invalid' }
  ])

  assert.match(summary, /\[用户输入\]\n↳ 请分析这个需求/)
  assert.match(summary, /\[Agent 思考\]（最后部分）/)
  assert.match(summary, /final reasoning/)
  assert.doesNotMatch(summary, /^x{520}/)
  assert.match(summary, /\[工具调用\]\nread_file/)
  assert.match(summary, /\[Agent 输出\]\n## 需求分析/)
  assert.match(summary, /\[错误\]\nhandoff JSON invalid/)
  assert.doesNotMatch(summary, /large noisy result/)
  assert.doesNotMatch(summary, /partial/)
  assert.doesNotMatch(summary, /inputTokens/)
})

test('uses empty markers when optional sections are absent', () => {
  const summary = summarizeTranscript([{ kind: 'message', role: 'assistant', text: 'done' }])

  assert.match(summary, /\[用户输入\]\n（无）/)
  assert.match(summary, /\[Agent 思考\]（最后部分）\n（无）/)
  assert.match(summary, /\[工具调用\]\n（无）/)
  assert.match(summary, /\[Agent 输出\]\ndone/)
  assert.match(summary, /\[错误\]\n（无）/)
})

test('truncates long assistant output to stay within the rough token budget', () => {
  const summary = summarizeTranscript([
    { kind: 'system', text: '↳ 请总结' },
    { kind: 'message', role: 'assistant', text: `${'a'.repeat(1200)}MIDDLE${'z'.repeat(1200)}` }
  ], { maxTokens: 220 })

  assert.ok(Math.ceil(summary.length / 3) <= 220)
  assert.match(summary, /\.\.\.\[truncated\]\.\.\./)
  assert.match(summary, /^(\s|\S)*a{20}/)
  assert.match(summary, /z{20}/)
})

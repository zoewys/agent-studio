import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const source = readFileSync(join(root, 'src/main/memory/forgettingCurve.ts'), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022
  }
}).outputText
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
const { computeStrength, filterAlive, listExpired } = await import(moduleUrl)

const baseNow = Date.UTC(2026, 5, 9)

function memory(overrides = {}) {
  return {
    id: 'memory-1',
    agentId: 'agent-1',
    scope: 'global',
    category: 'method',
    content: 'Prefer small tested changes.',
    evidence: 'run-1',
    strength: 1,
    createdAt: baseNow,
    lastReinforcedAt: baseNow,
    reinforceCount: 0,
    ...overrides
  }
}

function daysAfter(days) {
  return baseNow + days * 24 * 60 * 60 * 1000
}

test('new memories keep their current strength', () => {
  assert.equal(computeStrength(memory({ strength: 0.8 }), baseNow), 0.8)
})

test('unreinforced memories decay by the base seven day half life shape', () => {
  const strength = computeStrength(memory(), daysAfter(7))
  assert.ok(strength > 0.36 && strength < 0.37)
})

test('reinforced memories decay more slowly', () => {
  const strength = computeStrength(memory({ reinforceCount: 3 }), daysAfter(7))
  assert.ok(strength > 0.67 && strength < 0.68)
})

test('old unreinforced memories are expired and filtered out', () => {
  const fresh = memory({ id: 'fresh' })
  const old = memory({ id: 'old', lastReinforcedAt: daysAfter(-30) })
  assert.deepEqual(filterAlive([fresh, old], 0.3, baseNow).map((entry) => entry.id), ['fresh'])
  assert.deepEqual(listExpired([fresh, old], baseNow).map((entry) => entry.id), ['old'])
})

test('strength is clamped to the 0-1 range', () => {
  assert.equal(computeStrength(memory({ strength: 2 }), baseNow), 1)
  assert.equal(computeStrength(memory({ strength: -1 }), baseNow), 0)
})

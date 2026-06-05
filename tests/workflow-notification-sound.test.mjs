import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const app = readFileSync(join(root, 'src/renderer/src/App.tsx'), 'utf8')
const sound = readFileSync(join(root, 'src/renderer/src/workflowNotificationSound.ts'), 'utf8')

test('workflow transitions trigger deduped notification sounds', () => {
  assert.match(app, /workflowNotificationForRun\(run\)/)
  assert.match(app, /run\.status === 'awaiting-confirm'/)
  assert.match(app, /run\.status === 'completed' \|\| run\.status === 'error' \|\| run\.status === 'aborted'/)
  assert.match(app, /workflowSoundKeyRef\.current === notification\.key/)
  assert.match(app, /playWorkflowNotificationSound\(notification\.sound\)/)
  assert.match(app, /prepareWorkflowNotificationSound\(\)/)
})

test('workflow notification sound is generated with Web Audio', () => {
  assert.match(sound, /new AudioContextImpl\(\)/)
  assert.match(sound, /createOscillator\(\)/)
  assert.match(sound, /createGain\(\)/)
  assert.match(sound, /kind === 'confirm'/)
  assert.match(sound, /finished/)
})

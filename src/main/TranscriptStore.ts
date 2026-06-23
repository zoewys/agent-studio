import { app } from 'electron'
import { promises as fsp, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AgentEvent, ApiConversationMessage } from '@shared/types'

/** One line in a transcript .jsonl file. */
export type TranscriptRecord =
  | { kind: 'user'; text: string }
  | { kind: 'event'; event: AgentEvent }

const MAX_RESUME_TURNS = 10
const MAX_REPLAY_TOOL_TEXT_CHARS = 4000
const MAX_REPLAY_TOOL_JSON_CHARS = 6000
const MAX_REPLAY_JSON_DEPTH = 4
const MAX_REPLAY_JSON_ARRAY_ITEMS = 20
const MAX_REPLAY_JSON_OBJECT_KEYS = 40
const REPLAY_TRUNCATED_MARKER = '\n[truncated for replay]'

/**
 * Persists every run's normalized event stream — plus the user's own inputs,
 * which never appear in the event stream — to one .jsonl file per claude
 * session. Two uses:
 *   1. A durable record of what each agent did.
 *   2. Context rebuild: if `--resume <sessionId>` fails (e.g. cwd changed),
 *      RunManager calls buildResumePrompt() to replay history into a fresh run.
 *
 * The sessionId isn't known until the `session-started` event arrives, so
 * records are buffered per-runId and flushed once the session is identified.
 *
 * Writes are async (queued per-file) to avoid blocking the main thread —
 * inspired by CodeIsland's non-blocking I/O model.
 */
export class TranscriptStore {
  private readonly dir = join(app.getPath('userData'), 'transcripts')
  /** runId → sessionId, once known. */
  private sessionByRun = new Map<string, string>()
  /** runId → records seen before the sessionId was known. */
  private pending = new Map<string, TranscriptRecord[]>()

  /**
   * Per-file serialised write chain. Each file gets a Promise chain so
   * appends within one session stay ordered; different sessions/files
   * can write concurrently.
   */
  private writeChains = new Map<string, Promise<void>>()

  constructor() {
    mkdirSync(this.dir, { recursive: true })
  }

  getTranscriptPath(sessionId: string): string {
    return join(this.dir, `${sessionId}.jsonl`)
  }

  /** Record one normalized event. Routes to the session file once known. */
  record(runId: string, event: AgentEvent): void {
    // A `session-started` reveals (or, on resume-retry, changes) the session.
    if (event.kind === 'session-started') {
      this.bindSession(runId, event.sessionId)
    }
    this.write(runId, { kind: 'event', event })
  }

  /** Record a user input — the first prompt or a mid-run interjection. The
   *  event stream never carries these, so we capture them explicitly. */
  recordUserInput(runId: string, text: string): void {
    this.write(runId, { kind: 'user', text })
  }

  /**
   * Rebuild a single prompt from a session's transcript for resume-fallback:
   * a readable replay of prior user/assistant turns, then the new message.
   *
   * Uses sync reads because this runs inside the resume-failure recovery path,
   * which already blocks the turn pump — the sync I/O is negligible here.
   */
  buildResumePrompt(sessionId: string, newText: string): string {
    return this.buildTimelinePrompt(
      this.readSessionTimeline([sessionId]),
      newText,
      'Continue our earlier conversation. Here is the transcript so far:'
    )
  }

  readSessionTimeline(sessionIds: string[]): TranscriptRecord[] {
    const records: TranscriptRecord[] = []
    let pendingDelta = ''
    const flushDeltaMessage = (): void => {
      if (!pendingDelta) return
      records.push({
        kind: 'event',
        event: { kind: 'message', role: 'assistant', text: pendingDelta }
      })
      pendingDelta = ''
    }

    for (const sessionId of sessionIds) {
      const path = this.getTranscriptPath(sessionId)
      if (!existsSync(path)) continue
      for (const raw of readFileSync(path, 'utf8').split('\n')) {
        if (!raw.trim()) continue
        try {
          const rec = JSON.parse(raw) as TranscriptRecord
          if (rec.kind === 'user') {
            flushDeltaMessage()
            records.push(rec)
          } else if (rec.kind === 'event') {
            if (rec.event.kind === 'message-delta') {
              pendingDelta += rec.event.text
            } else if (rec.event.kind === 'message') {
              if (pendingDelta && rec.event.text.startsWith(pendingDelta)) {
                pendingDelta = ''
              } else {
                flushDeltaMessage()
              }
              records.push(rec)
            } else if (rec.event.kind === 'tool-call' || rec.event.kind === 'tool-result') {
              flushDeltaMessage()
              records.push(rec)
            }
          }
        } catch {
          continue
        }
      }
    }
    flushDeltaMessage()
    return records
  }

  buildReplayPromptFromTimeline(sessionIds: string[], newText: string): string {
    return this.buildTimelinePrompt(
      this.readSessionTimeline(sessionIds),
      newText,
      '这是继续之前的逻辑会话。Use the transcript below as the prior context across earlier session segments:'
    )
  }

  buildReplayMessagesFromTimeline(sessionIds: string[], newText: string): ApiConversationMessage[] {
    const records = this.readSessionTimeline(sessionIds)
    const messages: ApiConversationMessage[] = []
    const resultIds = new Set<string>()
    const calls = new Map<string, { toolName: string }>()
    for (const rec of records) {
      if (rec.kind !== 'event') continue
      if (rec.event.kind === 'tool-result') resultIds.add(rec.event.id)
      if (rec.event.kind === 'tool-call') {
        calls.set(rec.event.id, { toolName: rec.event.name })
      }
    }

    let pendingToolCallParts: Array<Record<string, unknown>> = []
    const flushToolCalls = (): void => {
      if (pendingToolCallParts.length === 0) return
      messages.push({ role: 'assistant', content: pendingToolCallParts })
      pendingToolCallParts = []
    }

    for (const rec of records) {
      if (rec.kind === 'user') {
        flushToolCalls()
        messages.push({ role: 'user', content: rec.text })
        continue
      }

      const event = rec.event
      if (event.kind === 'message') {
        flushToolCalls()
        messages.push({ role: 'assistant', content: event.text })
      } else if (event.kind === 'tool-call') {
        if (!resultIds.has(event.id)) continue
        pendingToolCallParts.push({
          type: 'tool-call',
          toolCallId: event.id,
          toolName: event.name,
          input: event.input
        })
      } else if (event.kind === 'tool-result') {
        const call = calls.get(event.id)
        if (!call) continue
        flushToolCalls()
        messages.push({
          role: 'tool',
          content: [{
            type: 'tool-result',
            toolCallId: event.id,
            toolName: call.toolName,
            output: normalizeToolResultOutput(event.output)
          }]
        })
      }
    }
    flushToolCalls()
    messages.push({ role: 'user', content: newText })
    return messages
  }

  private buildTimelinePrompt(
    records: TranscriptRecord[],
    newText: string,
    intro: string
  ): string {
    const lines: string[] = []
    for (const rec of records) {
      if (rec.kind === 'user') {
        lines.push(`User: ${rec.text}`)
      } else if (rec.event.kind === 'message') {
        lines.push(`Assistant: ${rec.event.text}`)
      }
    }
    const truncated = lines.length > MAX_RESUME_TURNS
    const recent = truncated ? lines.slice(-MAX_RESUME_TURNS) : lines
    const history = [
      ...(truncated ? [`[...earlier conversation omitted (${lines.length - MAX_RESUME_TURNS} turns)...]`] : []),
      ...recent
    ].join('\n\n')
    return [
      intro,
      '',
      history || '(no prior transcript records were available)',
      '',
      '---',
      '',
      `Now respond to this new message:\n${newText}`
    ].join('\n')
  }

  // ── internals ──────────────────────────────────────────────────────────

  private bindSession(runId: string, sessionId: string): void {
    const prev = this.sessionByRun.get(runId)
    if (prev === sessionId) return
    this.sessionByRun.set(runId, sessionId)
    // Flush anything buffered before the session was known.
    const buffered = this.pending.get(runId)
    if (buffered) {
      this.pending.delete(runId)
      const path = this.getTranscriptPath(sessionId)
      for (const rec of buffered) this.enqueueWrite(path, rec)
    }
  }

  private write(runId: string, rec: TranscriptRecord): void {
    const sessionId = this.sessionByRun.get(runId)
    if (!sessionId) {
      // Session not identified yet — buffer until session-started arrives.
      const buf = this.pending.get(runId)
      if (buf) buf.push(rec)
      else this.pending.set(runId, [rec])
      return
    }
    this.enqueueWrite(this.getTranscriptPath(sessionId), rec)
  }

  /**
   * Enqueue an async append on this file's write chain. Each file gets a
   * Promise chain: the next append waits for the previous one to finish,
   * guaranteeing write ordering within a session. Writes to different files
   * proceed concurrently.
   *
   * Failures are silently swallowed — persistence is best-effort and must
   * never break a run.
   */
  private enqueueWrite(path: string, rec: TranscriptRecord): void {
    const line = JSON.stringify(rec) + '\n'
    const prev = this.writeChains.get(path) ?? Promise.resolve()
    const next = prev
      .then(() => fsp.appendFile(path, line))
      .catch(() => {
        /* best-effort */
      })
    this.writeChains.set(path, next)
    // Cleanup finished chains so the Map doesn't grow unboundedly.
    next.finally(() => {
      if (this.writeChains.get(path) === next) {
        this.writeChains.delete(path)
      }
    })
  }

}

// Replay messages must satisfy AI SDK ToolResultOutput schema.
function normalizeToolResultOutput(output: unknown): Record<string, unknown> {
  if (isToolResultOutput(output)) return compactToolResultOutput(output)
  if (typeof output === 'string') return { type: 'text', value: truncateReplayText(output) }
  return { type: 'json', value: compactReplayJsonValue(output ?? null) }
}

function compactToolResultOutput(output: Record<string, unknown>): Record<string, unknown> {
  switch (output.type) {
    case 'text':
    case 'error-text':
      return { ...output, value: truncateReplayText(String(output.value ?? '')) }
    case 'json':
    case 'error-json':
      return { ...output, value: compactReplayJsonValue(output.value) }
    case 'content':
      return { ...output, value: compactReplayValue(output.value, 0) }
    default:
      return output
  }
}

function compactReplayJsonValue(value: unknown): unknown {
  const compacted = compactReplayValue(value, 0)
  const serialized = safeStringify(compacted)
  if (serialized.length <= MAX_REPLAY_TOOL_JSON_CHARS) return compacted
  return {
    truncated: true,
    preview: truncateReplayText(serialized, MAX_REPLAY_TOOL_JSON_CHARS)
  }
}

function compactReplayValue(value: unknown, depth: number): unknown {
  if (typeof value === 'string') return truncateReplayText(value)
  if (Array.isArray(value)) {
    if (depth >= MAX_REPLAY_JSON_DEPTH) {
      return `[array truncated for replay: ${value.length} items]`
    }
    const items = value
      .slice(0, MAX_REPLAY_JSON_ARRAY_ITEMS)
      .map((item) => compactReplayValue(item, depth + 1))
    if (value.length > items.length) {
      items.push(`[${value.length - items.length} items truncated for replay]`)
    }
    return items
  }
  if (isRecord(value)) {
    if (depth >= MAX_REPLAY_JSON_DEPTH) return '[object truncated for replay]'
    const entries = Object.entries(value)
    const compacted: Record<string, unknown> = {}
    for (const [key, entryValue] of entries.slice(0, MAX_REPLAY_JSON_OBJECT_KEYS)) {
      compacted[key] = compactReplayValue(entryValue, depth + 1)
    }
    if (entries.length > MAX_REPLAY_JSON_OBJECT_KEYS) {
      compacted.__truncated = `${entries.length - MAX_REPLAY_JSON_OBJECT_KEYS} fields truncated for replay`
    }
    return compacted
  }
  return value
}

function truncateReplayText(value: string, max = MAX_REPLAY_TOOL_TEXT_CHARS): string {
  return value.length > max ? `${value.slice(0, max)}${REPLAY_TRUNCATED_MARKER}` : value
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function isToolResultOutput(output: unknown): output is Record<string, unknown> {
  if (!isRecord(output) || typeof output.type !== 'string') return false
  switch (output.type) {
    case 'text':
    case 'error-text':
      return typeof output.value === 'string'
    case 'json':
    case 'error-json':
      return 'value' in output
    case 'execution-denied':
      return output.reason === undefined || typeof output.reason === 'string'
    case 'content':
      return Array.isArray(output.value)
    default:
      return false
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

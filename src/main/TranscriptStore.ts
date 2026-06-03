import { app } from 'electron'
import { appendFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { AgentEvent } from '@shared/types'

/** One line in a transcript .jsonl file. */
type TranscriptRecord =
  | { kind: 'user'; text: string }
  | { kind: 'event'; event: AgentEvent }

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
 */
export class TranscriptStore {
  private readonly dir = join(app.getPath('userData'), 'transcripts')
  /** runId → sessionId, once known. */
  private sessionByRun = new Map<string, string>()
  /** runId → records seen before the sessionId was known. */
  private pending = new Map<string, TranscriptRecord[]>()

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
   */
  buildResumePrompt(sessionId: string, newText: string): string {
    const path = this.getTranscriptPath(sessionId)
    const lines: string[] = []
    if (existsSync(path)) {
      for (const raw of readFileSync(path, 'utf8').split('\n')) {
        if (!raw.trim()) continue
        let rec: TranscriptRecord
        try {
          rec = JSON.parse(raw) as TranscriptRecord
        } catch {
          continue
        }
        if (rec.kind === 'user') {
          lines.push(`User: ${rec.text}`)
        } else if (rec.event.kind === 'message') {
          lines.push(`Assistant: ${rec.event.text}`)
        }
      }
    }
    const history = lines.join('\n\n')
    return [
      'Continue our earlier conversation. Here is the transcript so far:',
      '',
      history,
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
      for (const rec of buffered) this.appendLine(path, rec)
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
    this.appendLine(this.getTranscriptPath(sessionId), rec)
  }

  private appendLine(path: string, rec: TranscriptRecord): void {
    try {
      appendFileSync(path, JSON.stringify(rec) + '\n')
    } catch {
      // Persistence is best-effort; never let a write error break a run.
    }
  }
}

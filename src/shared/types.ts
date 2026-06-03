/**
 * Shared types — the contract spoken by both the Electron main process
 * (CLI orchestration) and the renderer (React UI).
 *
 * Keep this file dependency-free so it can be imported from either side.
 */

// ── Vendors ────────────────────────────────────────────────────────────────

export type AgentVendor = 'claude' | 'gemini' | 'codex'

export const ALL_VENDORS: AgentVendor[] = ['claude', 'gemini', 'codex']

/** Known models per vendor. Used for datalist suggestions; free-text input still accepted. */
export const VENDOR_MODELS: Record<AgentVendor, string[]> = {
  claude: ['sonnet', 'opus', 'haiku', 'claude-sonnet-4-6', 'claude-sonnet-4-5', 'claude-opus-4-5', 'claude-opus-4', 'claude-haiku-4-5', 'claude-sonnet-4', 'claude-3.5-sonnet', 'claude-3.5-haiku'],
  gemini: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-pro', 'gemini-1.5-flash'],
  codex: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'o3', 'o4-mini']
}

// ── Normalized event stream ──────────────────────────────────────────────────
// Every CLI's stdout is parsed down to this common stream so the orchestration
// layer never branches on vendor. See IMPLEMENTATION_PLAN.md §1.1.

export type AgentEvent =
  | { kind: 'session-started'; sessionId: string; vendor: AgentVendor }
  | { kind: 'message-delta'; text: string }
  | { kind: 'message'; role: 'assistant'; text: string }
  | { kind: 'thinking'; text: string }
  | { kind: 'tool-call'; id: string; name: string; input: unknown }
  | { kind: 'tool-result'; id: string; ok: boolean; output: unknown }
  | { kind: 'file-changed'; path: string; op: 'create' | 'modify' | 'delete' }
  | { kind: 'usage'; inputTokens: number; outputTokens: number; costUsd?: number }
  | { kind: 'turn-done'; sessionId: string; reason: 'complete' | 'error' | 'aborted' }
  | { kind: 'error'; recoverable: boolean; message: string; raw?: unknown }
  // Lifecycle events emitted by the app layer (not the CLI) for UI/debug.
  | { kind: 'stderr'; text: string }
  | { kind: 'system'; text: string }

export type AgentEventKind = AgentEvent['kind']

// ── Adapter capabilities ─────────────────────────────────────────────────────

export interface AdapterCapabilities {
  /** Process stays resident; user input can be appended mid-turn (claude only). */
  bidirectionalStdin: boolean
  /** Final output can be constrained to a JSON schema (claude/codex). */
  structuredOutputSchema: boolean
  /** Emits incremental token deltas (claude). */
  partialTokenStream: boolean
}

// ── Run configuration ────────────────────────────────────────────────────────

/** A JSON Schema object; kept loose to avoid pulling in a schema lib here. */
export type JSONSchema = Record<string, unknown>

export interface ResumeHandle {
  sessionId: string
  vendor: AgentVendor
  /** Path to the app-owned transcript, used to rebuild a prompt if resume
   *  fails. Filled in by the main process (TranscriptStore); the renderer
   *  neither knows nor needs the on-disk path. */
  transcriptPath?: string
}

/** Everything the UI must collect to launch one turn of one agent. */
export interface RunConfig {
  vendor: AgentVendor
  prompt: string
  cwd: string
  model?: string
  addDirs?: string[]
  appendSystemPrompt?: string
  outputSchema?: JSONSchema
  resumeFrom?: ResumeHandle
  /** Optional absolute path to the CLI binary; falls back to PATH lookup. */
  cliPath?: string
  /** CLI permission mode. Defaults to bypassPermissions when unset. */
  permissionMode?: PermissionMode
}

// ── Agent definitions ───────────────────────────────────────────────────────

/** Permission mode passed to the CLI. Mirrors claude's --permission-mode. */
export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan'

export const PERMISSION_MODES: PermissionMode[] = ['default', 'acceptEdits', 'bypassPermissions', 'plan']

export interface AgentDefinition {
  id: string
  /** Display name, e.g. "资深产品经理". */
  name: string
  /** Free-form role label, e.g. "product" / "design" / "dev" / "test". */
  role: string
  vendor: AgentVendor
  model?: string
  /** System prompt injected via --append-system-prompt at run time. */
  systemPrompt: string
  /** CLI permission mode for this agent. Defaults to bypassPermissions. */
  permissionMode?: PermissionMode
}

// ── IPC channel names + payloads ─────────────────────────────────────────────
// Single source of truth so main/preload/renderer never drift on strings.

export const IPC = {
  /** renderer → main: start a run. Returns a runId. */
  runStart: 'run:start',
  /** renderer → main: push interjection text into a live (claude) run. */
  runPush: 'run:push',
  /** renderer → main: abort a run (kill the child process). */
  runAbort: 'run:abort',
  /** main → renderer: a normalized AgentEvent for a given runId. */
  runEvent: 'run:event',
  /** renderer → main: detect which CLIs are installed. */
  checkClis: 'cli:check',
  /** renderer → main: open a native folder picker, returns chosen path or null. */
  pickDir: 'dialog:pickDir',
  /** renderer → main: list all saved agent definitions. */
  agentsList: 'agents:list',
  /** renderer → main: create or update an agent definition. */
  agentsSave: 'agents:save',
  /** renderer → main: delete an agent definition by id. */
  agentsDelete: 'agents:delete'
} as const

export interface RunStartResult {
  runId: string
}

/** Wire envelope for an event delivered to the renderer. */
export interface RunEventEnvelope {
  runId: string
  event: AgentEvent
}

export interface CliCheckResult {
  claude: boolean
  gemini: boolean
  codex: boolean
}

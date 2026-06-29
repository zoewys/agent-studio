import type { AgentEvent, PermissionMode } from '@shared/types'
import { randomUUID } from 'node:crypto'

interface PendingPermission {
  resolve: (allowed: boolean) => void
  timer: NodeJS.Timeout
  clear: () => void
  emitResponse: (allowed: boolean) => void
}

const pendingByRequestId = new Map<string, PendingPermission>()

export class PermissionGuard {
  private pending = new Map<string, PendingPermission>()
  private timeoutMs = 300_000

  constructor(
    private readonly mode: PermissionMode,
    private readonly emitEvent: (event: AgentEvent) => void,
    private readonly options: { headless?: boolean; allowPermissionPrompts?: boolean } = {}
  ) {}

  async request(toolName: string, description: string): Promise<boolean> {
    if (this.mode === 'bypassPermissions') return true
    if (this.mode === 'acceptEdits' && isEditTool(toolName)) return true

    if (this.options.headless && !this.options.allowPermissionPrompts) {
      this.emitEvent({
        kind: 'error',
        recoverable: false,
        message: `Headless API run cannot wait for UI permission approval. Tool "${toolName}" was denied; use bypassPermissions or pre-authorize this run.`,
        raw: { toolName, description }
      })
      return false
    }

    const requestId = randomUUID()
    this.emitEvent({
      kind: 'system',
      text: JSON.stringify({
        type: 'permission-request',
        requestId,
        toolName,
        description
      })
    })

    return new Promise((resolve) => {
      let pending: PendingPermission
      const timer = setTimeout(() => {
        this.pending.delete(requestId)
        pendingByRequestId.delete(requestId)
        pending.emitResponse(false)
        resolve(false)
      }, this.timeoutMs)
      pending = {
        resolve,
        timer,
        clear: () => this.pending.delete(requestId),
        emitResponse: (allowed: boolean) => this.emitPermissionResponse(requestId, allowed)
      }
      this.pending.set(requestId, pending)
      pendingByRequestId.set(requestId, pending)
    })
  }

  respond(requestId: string, allowed: boolean): void {
    const pending = this.pending.get(requestId)
    if (!pending) return
    clearTimeout(pending.timer)
    this.pending.delete(requestId)
    pendingByRequestId.delete(requestId)
    pending.emitResponse(allowed)
    pending.resolve(allowed)
  }

  private emitPermissionResponse(requestId: string, allowed: boolean): void {
    this.emitEvent({
      kind: 'system',
      text: JSON.stringify({
        type: 'permission-response',
        requestId,
        allowed
      })
    })
  }
}

export function isEditTool(name: string): boolean {
  return name === 'file_edit' || name === 'file_write'
}

export function respondToPermissionRequest(requestId: string, allowed: boolean): void {
  const pending = pendingByRequestId.get(requestId)
  if (!pending) return
  clearTimeout(pending.timer)
  pendingByRequestId.delete(requestId)
  pending.clear()
  pending.emitResponse(allowed)
  pending.resolve(allowed)
}

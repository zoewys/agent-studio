import type { AgentEvent, WorkflowRun } from '@shared/types'

export type PermissionStatus = 'pending' | 'allowed' | 'denied'

export interface PermissionRequestPayload {
  type: 'permission-request'
  requestId: string
  toolName: string
  description: string
}

interface PermissionResponsePayload {
  type: 'permission-response'
  requestId: string
  allowed: boolean
}

export interface WorkflowPermissionPrompt {
  runId: string
  runName: string
  stepIndex: number
  stepName: string
  executionId: string
  request: PermissionRequestPayload
}

export function parsePermissionRequest(text: string): PermissionRequestPayload | null {
  try {
    const parsed: unknown = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object') return null
    const value = parsed as Record<string, unknown>
    if (value.type !== 'permission-request') return null
    if (typeof value.requestId !== 'string' || typeof value.toolName !== 'string' || typeof value.description !== 'string') return null
    return {
      type: 'permission-request',
      requestId: value.requestId,
      toolName: value.toolName,
      description: value.description
    }
  } catch {
    return null
  }
}

export function parsePermissionResponse(text: string): PermissionResponsePayload | null {
  try {
    const parsed: unknown = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object') return null
    const value = parsed as Record<string, unknown>
    if (value.type !== 'permission-response') return null
    if (typeof value.requestId !== 'string' || typeof value.allowed !== 'boolean') return null
    return {
      type: 'permission-response',
      requestId: value.requestId,
      allowed: value.allowed
    }
  } catch {
    return null
  }
}

export function collectPermissionStatuses(
  events: AgentEvent[],
  seed?: Map<string, PermissionStatus>
): Map<string, PermissionStatus> {
  const statuses = new Map(seed)
  for (const event of events) {
    if (event.kind !== 'system') continue
    const response = parsePermissionResponse(event.text)
    if (!response) continue
    statuses.set(response.requestId, response.allowed ? 'allowed' : 'denied')
  }
  return statuses
}

export function collectWorkflowPermissionStatuses(
  runs: WorkflowRun[],
  overrides?: Map<string, PermissionStatus>
): Map<string, PermissionStatus> {
  let statuses = new Map<string, PermissionStatus>()
  for (const run of runs) {
    for (const step of run.steps) {
      for (const execution of step.executions) {
        statuses = collectPermissionStatuses(execution.events, statuses)
      }
    }
  }
  if (overrides) {
    for (const [requestId, status] of overrides) statuses.set(requestId, status)
  }
  return statuses
}

export function findPendingWorkflowPermission(
  runs: WorkflowRun[],
  statuses: Map<string, PermissionStatus>
): WorkflowPermissionPrompt | null {
  for (const run of runs) {
    if (run.status !== 'running' && run.status !== 'awaiting-input') continue
    for (let stepIndex = 0; stepIndex < run.steps.length; stepIndex += 1) {
      const step = run.steps[stepIndex]
      if (step.status !== 'running' && step.status !== 'awaiting-input') continue
      for (const execution of step.executions) {
        if (execution.status !== 'running' && execution.status !== 'awaiting-input') continue
        for (const event of execution.events) {
          if (event.kind !== 'system') continue
          const request = parsePermissionRequest(event.text)
          if (!request) continue
          if (statuses.get(request.requestId)) continue
          return {
            runId: run.id,
            runName: run.runName || run.templateName,
            stepIndex,
            stepName: step.displayName || step.role || `Step ${stepIndex + 1}`,
            executionId: execution.id,
            request
          }
        }
      }
    }
  }
  return null
}

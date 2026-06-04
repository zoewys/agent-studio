import { useCallback, useEffect, useState } from 'react'
import type {
  WorkflowEventEnvelope,
  WorkflowRun,
  WorkflowStartInput,
  WorkflowTemplate
} from '@shared/types'

export interface WorkflowDraft extends Omit<WorkflowTemplate, 'id'> {
  id?: string
}

export function useWorkflows() {
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([])
  const [currentRun, setCurrentRun] = useState<WorkflowRun | null>(null)

  const reload = useCallback(async () => {
    setTemplates(await window.api.listWorkflows())
  }, [])

  const save = useCallback(async (draft: WorkflowDraft) => {
    const saved = await window.api.saveWorkflow(draft)
    setTemplates((prev) => {
      const idx = prev.findIndex((item) => item.id === saved.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = saved
        return next
      }
      return [saved, ...prev]
    })
    return saved
  }, [])

  const remove = useCallback(async (id: string) => {
    await window.api.deleteWorkflow(id)
    setTemplates((prev) => prev.filter((item) => item.id !== id))
  }, [])

  const start = useCallback(async (input: WorkflowStartInput) => {
    const { run } = await window.api.startWorkflow(input)
    setCurrentRun(run)
    return run
  }, [])

  const confirmStep = useCallback(async () => {
    if (!currentRun) return
    setCurrentRun(await window.api.confirmWorkflowStep(currentRun.id))
  }, [currentRun])

  const rerunStep = useCallback(
    async (stepIndex: number) => {
      if (!currentRun) return
      setCurrentRun(await window.api.rerunWorkflowStep(currentRun.id, stepIndex))
    },
    [currentRun]
  )

  const abort = useCallback(async () => {
    if (!currentRun) return
    setCurrentRun(await window.api.abortWorkflow(currentRun.id))
  }, [currentRun])

  const pushInput = useCallback(
    async (stepIndex: number, text: string) => {
      if (!currentRun) return
      setCurrentRun(await window.api.pushWorkflowInput(currentRun.id, stepIndex, text))
    },
    [currentRun]
  )

  const clearRun = useCallback(() => setCurrentRun(null), [])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    const unsub = window.api.onWorkflowEvent((envelope: WorkflowEventEnvelope) => {
      setCurrentRun((prev) => applyWorkflowEvent(prev, envelope))
    })
    return unsub
  }, [])

  return {
    templates,
    currentRun,
    reload,
    save,
    remove,
    start,
    confirmStep,
    rerunStep,
    abort,
    pushInput,
    clearRun
  }
}

function applyWorkflowEvent(
  current: WorkflowRun | null,
  { runId, event }: WorkflowEventEnvelope
): WorkflowRun | null {
  if (event.kind === 'run-updated') return event.run
  if (!current || current.id !== runId || event.kind !== 'agent-event') return current

  return {
    ...current,
    steps: current.steps.map((step, stepIndex) => {
      if (stepIndex !== event.stepIndex) return step
      return {
        ...step,
        executions: step.executions.map((execution) => {
          if (execution.id !== event.executionId) return execution
          return {
            ...execution,
            events: [...execution.events, event.event],
            sessionId:
              event.event.kind === 'session-started' ? event.event.sessionId : execution.sessionId
          }
        })
      }
    })
  }
}

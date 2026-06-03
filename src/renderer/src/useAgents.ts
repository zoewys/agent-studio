import { useCallback, useEffect, useState } from 'react'
import type { AgentDefinition } from '@shared/types'

export interface AgentDraft extends Omit<AgentDefinition, 'id'> {
  id?: string
}

/**
 * Loads, creates, updates & deletes predefined agent definitions via the
 * main-process store. Pattern matches useRun — a thin bridge over window.api.
 */
export function useAgents() {
  const [agents, setAgents] = useState<AgentDefinition[]>([])

  const reload = useCallback(async () => {
    const list = await window.api.listAgents()
    setAgents(list)
  }, [])

  const save = useCallback(
    async (draft: AgentDraft) => {
      const saved = await window.api.saveAgent(draft)
      // Optimistically replace (upsert) or insert.
      setAgents((prev) => {
        const idx = prev.findIndex((a) => a.id === saved.id)
        if (idx >= 0) {
          const next = [...prev]
          next[idx] = saved
          return next
        }
        return [saved, ...prev]
      })
      return saved
    },
    []
  )

  const remove = useCallback(async (id: string) => {
    await window.api.deleteAgent(id)
    setAgents((prev) => prev.filter((a) => a.id !== id))
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return { agents, reload, save, remove }
}
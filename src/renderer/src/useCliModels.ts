import { useCallback, useEffect, useState } from 'react'
import type { ModelCatalog } from '@shared/types'

export function useCliModels() {
  const [models, setModels] = useState<ModelCatalog | null>(null)
  const [loading, setLoading] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      setModels(await window.api.listModels())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return { models, loading, reload }
}

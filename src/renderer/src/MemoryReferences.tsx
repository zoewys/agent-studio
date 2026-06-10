import { useEffect, useMemo, useState } from 'react'
import type { MemoryCategory, MemoryEntry } from '@shared/types'

interface MemoryReferencesProps {
  agentId?: string | null
  projectPath?: string | null
  memoryIds?: string[]
}

const CATEGORY_LABEL: Record<MemoryCategory, string> = {
  avoidance: '避免',
  preference: '偏好',
  method: '方法',
  knowledge: '知识'
}

const CATEGORY_WEIGHT: Record<MemoryCategory, number> = {
  avoidance: 1.2,
  preference: 1.1,
  method: 1,
  knowledge: 0.9
}

export function MemoryReferences({
  agentId,
  projectPath,
  memoryIds = []
}: MemoryReferencesProps): JSX.Element | null {
  const uniqueIds = useMemo(() => dedupe(memoryIds), [memoryIds])
  const [memories, setMemories] = useState<MemoryEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    setExpandedId(null)
  }, [agentId, projectPath, uniqueIds.join('|')])

  useEffect(() => {
    if (!agentId || uniqueIds.length === 0) {
      setMemories([])
      setError(null)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    window.api.memoryList(agentId, projectPath ?? undefined)
      .then((items) => {
        if (!cancelled) setMemories(items)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [agentId, projectPath, uniqueIds])

  if (!agentId || uniqueIds.length === 0) return null

  const byId = new Map(memories.map((memory) => [memory.id, memory]))
  const references = uniqueIds.map((id) => ({ id, memory: byId.get(id) ?? null }))

  return (
    <details className="memory-references">
      <summary className="memory-references-summary">
        <span className="memory-references-chevron">›</span>
        <span>{uniqueIds.length} 条记忆引用</span>
        <span className="memory-references-rule">按强度、类别权重和预算自动注入</span>
      </summary>

      <div className="memory-references-body">
        {loading && <div className="memory-references-status">正在加载记忆引用…</div>}
        {error && <div className="memory-references-status memory-references-error">{error}</div>}

        {!loading && references.map(({ id, memory }) => (
          <article className="memory-reference-item" key={id}>
            {memory ? (
              <>
                <button
                  type="button"
                  className="memory-reference-main"
                  onClick={() => setExpandedId(expandedId === id ? null : id)}
                >
                  <span className="memory-reference-copy">
                    <span className="memory-reference-title">
                      {CATEGORY_LABEL[memory.category]} · {memory.scope}
                    </span>
                    <span className="memory-reference-content">{memory.content}</span>
                  </span>
                  <span className="memory-reference-meta">
                    strength {computeStrength(memory).toFixed(2)}
                  </span>
                </button>
                {expandedId === id && <MemoryReferenceDetail memory={memory} />}
              </>
            ) : (
              <div className="memory-reference-missing">
                <span className="memory-reference-title">记忆已删除或不可用</span>
                <span className="memory-reference-id">{id}</span>
              </div>
            )}
          </article>
        ))}
      </div>
    </details>
  )
}

function MemoryReferenceDetail({ memory }: { memory: MemoryEntry }): JSX.Element {
  return (
    <div className="memory-reference-detail">
      <p>{memory.content}</p>
      <dl>
        <div><dt>evidence</dt><dd>{memory.evidence || 'unknown'}</dd></div>
        <div><dt>注入依据</dt><dd>{injectionReason(memory)}</dd></div>
        <div><dt>agentId</dt><dd>{memory.agentId}</dd></div>
        <div><dt>scope</dt><dd>{memory.scope}</dd></div>
        <div><dt>project</dt><dd>{memory.projectPath || memory.projectHash || '-'}</dd></div>
        <div><dt>memory id</dt><dd>{memory.id}</dd></div>
        <div><dt>createdAt</dt><dd>{formatTime(memory.createdAt)}</dd></div>
        <div><dt>lastReinforcedAt</dt><dd>{formatTime(memory.lastReinforcedAt)}</dd></div>
        <div><dt>reinforceCount</dt><dd>{memory.reinforceCount}</dd></div>
      </dl>
    </div>
  )
}

function dedupe(ids: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const id of ids) {
    if (!id || seen.has(id)) continue
    seen.add(id)
    result.push(id)
  }
  return result
}

function computeStrength(entry: MemoryEntry, now = Date.now()): number {
  const dayMs = 1000 * 60 * 60 * 24
  const days = Math.max(0, (now - entry.lastReinforcedAt) / dayMs)
  const stability = 1 + entry.reinforceCount * 0.5
  const decay = Math.exp(-days / (stability * 7))
  return Math.max(0, Math.min(1, entry.strength * decay))
}

function injectionReason(memory: MemoryEntry): string {
  const strength = computeStrength(memory)
  const weight = CATEGORY_WEIGHT[memory.category]
  return `strength ${strength.toFixed(2)} × ${CATEGORY_LABEL[memory.category]}权重 ${weight.toFixed(1)} = score ${(strength * weight).toFixed(2)}；当前规则按 score 排序，并在 token 预算内注入。`
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString()
}

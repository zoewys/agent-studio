/**
 * RuntimeModelCascade.tsx — Runtime × Model 联级选择
 *
 * 把 Claude / Codex / API providers 合并到同一个下拉里：
 *   左列：三类 runtime 入口（Claude / Codex 各一项；API 展开为已配置的 provider 列表）
 *   右列：当前 hover/选中入口对应的 model 列表，附 context 提示
 *
 * 选中后通过 `onChange({ vendor, apiProviderId, model })` 一次性回填外层状态。
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { AgentVendor, ApiProviderConfig, VendorModelCatalog } from '@shared/types'
import { ChevronDown, ChevronRight } from 'lucide-react'

export interface RuntimeSelection {
  vendor: AgentVendor
  apiProviderId?: string
  model: string
}

export interface RuntimeModelCascadeProps {
  vendor: AgentVendor
  apiProviderId: string
  model: string
  apiProviders: ApiProviderConfig[]
  claudeCatalog: VendorModelCatalog | null
  codexCatalog: VendorModelCatalog | null
  apiProvidersLoading?: boolean
  modelsLoading?: boolean
  cliAvailability?: Partial<Record<AgentVendor, boolean>>
  onChange: (selection: RuntimeSelection) => void
}

interface Entry {
  /** 左列条目唯一 id（claude / codex / api:<providerId>） */
  id: string
  vendor: AgentVendor
  apiProviderId?: string
  label: string
  /** 一级标题分组（"CLI" / "API"） */
  group: 'cli' | 'api'
  available: boolean
  models: ModelEntry[]
  emptyMessage?: string
}

interface ModelEntry {
  id: string
  label: string
  hint?: string
}

/** 已知模型的 context 长度提示，可按需扩展。 */
const MODEL_CONTEXT_HINT: Record<string, string> = {
  'kimi-k2.6': '256k context',
  'kimi-k2': '128k context',
  'claude-opus-4-8': '200k context',
  'claude-sonnet-4-6': '200k context',
  'claude-haiku-4-5-20251001': '200k context',
  'gpt-4o': '128k context',
  'gpt-4o-mini': '128k context'
}

function modelHint(modelId: string): string | undefined {
  return MODEL_CONTEXT_HINT[modelId]
}

function contextWindowHint(value?: number): string | undefined {
  if (!value) return undefined
  if (value >= 1000 && value % 1000 === 0) return `${value / 1000}k context`
  return `${value.toLocaleString()} context`
}

export function RuntimeModelCascade({
  vendor,
  apiProviderId,
  model,
  apiProviders,
  claudeCatalog,
  codexCatalog,
  apiProvidersLoading = false,
  modelsLoading = false,
  cliAvailability,
  onChange
}: RuntimeModelCascadeProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [hoverEntryId, setHoverEntryId] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const [anchor, setAnchor] = useState<{ top: number; left: number; width: number } | null>(null)

  // Re-measure trigger every time the popover opens, on resize, and on scroll.
  // Portal'd popover floats over the page, so we need explicit positioning.
  useLayoutEffect(() => {
    if (!open) return
    const measure = (): void => {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) return
      setAnchor({ top: rect.bottom + 4, left: rect.left, width: rect.width })
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [open])

  const entries = useMemo<Entry[]>(() => {
    const cliEntries: Entry[] = [
      {
        id: 'claude',
        vendor: 'claude',
        label: 'Claude',
        group: 'cli',
        available: cliAvailability?.claude !== false,
        models: (claudeCatalog?.models ?? []).map((m) => ({
          id: m.id,
          label: m.label === m.id ? m.id : `${m.label} (${m.id})`,
          hint: modelHint(m.id)
        })),
        emptyMessage: claudeCatalog?.message
      },
      {
        id: 'codex',
        vendor: 'codex',
        label: 'Codex',
        group: 'cli',
        available: cliAvailability?.codex !== false,
        models: (codexCatalog?.models ?? []).map((m) => ({
          id: m.id,
          label: m.label === m.id ? m.id : `${m.label} (${m.id})`,
          hint: modelHint(m.id)
        })),
        emptyMessage: codexCatalog?.message
      }
    ]

    const apiEntries: Entry[] = apiProviders.map((p) => ({
      id: `api:${p.id}`,
      vendor: 'api',
      apiProviderId: p.id,
      label: p.name,
      group: 'api',
      available: true,
      models: p.models.map((id) => ({ id, label: id, hint: contextWindowHint(p.modelContextWindows?.[id]) ?? modelHint(id) })),
      emptyMessage: p.models.length === 0 ? 'No models configured' : undefined
    }))

    return [...cliEntries, ...apiEntries]
  }, [apiProviders, claudeCatalog, codexCatalog, cliAvailability])

  const selectedEntryId =
    vendor === 'api'
      ? `api:${apiProviderId || apiProviders[0]?.id || ''}`
      : vendor

  const activeEntryId = hoverEntryId ?? selectedEntryId
  const activeEntry = entries.find((e) => e.id === activeEntryId) ?? entries[0] ?? null
  const selectedEntry = entries.find((e) => e.id === selectedEntryId) ?? null

  const triggerLabel = (() => {
    if (selectedEntry) {
      return `${selectedEntry.label}${model ? ` · ${model}` : ''}`
    }
    if (apiProvidersLoading || modelsLoading) return 'Loading...'
    return 'Select model'
  })()

  // 点击外部 / Esc 关闭。popover 被 portal 到 body，所以同时检查 trigger 和 popover。
  const popoverRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!open) return
    const handleClick = (event: MouseEvent): void => {
      const target = event.target as Node
      if (rootRef.current?.contains(target)) return
      if (popoverRef.current?.contains(target)) return
      setOpen(false)
    }
    const handleKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  const handlePickModel = (entry: Entry, modelId: string): void => {
    onChange({
      vendor: entry.vendor,
      apiProviderId: entry.vendor === 'api' ? entry.apiProviderId : undefined,
      model: modelId
    })
    setOpen(false)
    setHoverEntryId(null)
  }

  const handlePickEntryWithoutModel = (entry: Entry): void => {
    // 该 runtime 没有可见模型时，至少切换 vendor，由外层使用 CLI 默认
    onChange({
      vendor: entry.vendor,
      apiProviderId: entry.vendor === 'api' ? entry.apiProviderId : undefined,
      model: ''
    })
    setOpen(false)
    setHoverEntryId(null)
  }

  const cliEntries = entries.filter((e) => e.group === 'cli')
  const apiEntriesList = entries.filter((e) => e.group === 'api')

  return (
    <div className="runtime-model-cascade" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="select-trigger runtime-model-cascade-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span>{triggerLabel}</span>
        <ChevronDown size={12} className="select-icon" />
      </button>

      {open && anchor &&
        createPortal(
          <div
            ref={popoverRef}
            className="runtime-model-cascade-popover"
            role="menu"
            style={{ top: anchor.top, left: anchor.left, minWidth: Math.max(anchor.width, 520) }}
          >
            <ul className="runtime-model-cascade-entries">
              <li className="runtime-model-cascade-group-label">CLI</li>
              {cliEntries.map((entry) => (
                <EntryRow
                  key={entry.id}
                  entry={entry}
                  isActive={entry.id === activeEntryId}
                  isSelected={entry.id === selectedEntryId}
                  onHover={setHoverEntryId}
                  onClick={handlePickEntryWithoutModel}
                />
              ))}
              <li className="runtime-model-cascade-group-label">API</li>
              {apiEntriesList.length === 0 && (
                <li className="runtime-model-cascade-empty-row">
                  {apiProvidersLoading ? 'Loading providers...' : 'No providers'}
                </li>
              )}
              {apiEntriesList.map((entry) => (
                <EntryRow
                  key={entry.id}
                  entry={entry}
                  isActive={entry.id === activeEntryId}
                  isSelected={entry.id === selectedEntryId}
                  onHover={setHoverEntryId}
                  onClick={handlePickEntryWithoutModel}
                />
              ))}
            </ul>

            <div className="runtime-model-cascade-models-pane">
              {activeEntry && activeEntry.models.length > 0 ? (
                <ul className="runtime-model-cascade-models">
                  {activeEntry.models.map((m) => {
                    const isSelected =
                      activeEntry.id === selectedEntryId && m.id === model
                    return (
                      <li key={m.id}>
                        <button
                          type="button"
                          className={`runtime-model-cascade-model${isSelected ? ' is-selected' : ''}`}
                          onClick={() => handlePickModel(activeEntry, m.id)}
                        >
                          <span className="runtime-model-cascade-model-id">{m.label}</span>
                          {m.hint && (
                            <span className="runtime-model-cascade-model-hint">{m.hint}</span>
                          )}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <div className="runtime-model-cascade-empty">
                  {activeEntry?.emptyMessage ??
                    (modelsLoading ? 'Loading models...' : 'No models')}
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}

interface EntryRowProps {
  entry: Entry
  isActive: boolean
  isSelected: boolean
  onHover: (id: string) => void
  onClick: (entry: Entry) => void
}

function EntryRow({ entry, isActive, isSelected, onHover, onClick }: EntryRowProps): JSX.Element {
  return (
    <li
      className={`runtime-model-cascade-entry${isActive ? ' is-active' : ''}${
        isSelected ? ' is-selected' : ''
      }${entry.available ? '' : ' is-unavailable'}`}
      onMouseEnter={() => onHover(entry.id)}
      onFocus={() => onHover(entry.id)}
      onClick={() => onClick(entry)}
      tabIndex={0}
    >
      <span className="runtime-model-cascade-entry-name">{entry.label}</span>
      <ChevronRight size={12} className="runtime-model-cascade-chevron" />
    </li>
  )
}

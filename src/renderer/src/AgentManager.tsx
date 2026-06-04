import { useState } from 'react'
import type {
  AgentDefinition,
  AgentVendor,
  CliCheckResult,
  ModelCatalog,
  PermissionMode
} from '@shared/types'
import { ALL_VENDORS, PERMISSION_MODES } from '@shared/types'
import type { AgentDraft } from './useAgents'
import { ModelSelect } from './ModelSelect'

export interface AgentManagerProps {
  agents: AgentDefinition[]
  clis: CliCheckResult | null
  modelCatalog: ModelCatalog | null
  onSave: (draft: AgentDraft) => void
  onDelete: (id: string) => void
  onClose: () => void
}

function emptyDraft(): AgentDraft {
  return { name: '', role: '', vendor: 'claude' as AgentVendor, model: '', systemPrompt: '', permissionMode: 'bypassPermissions' as PermissionMode }
}

export function AgentManager({ agents, clis, modelCatalog, onSave, onDelete, onClose }: AgentManagerProps): JSX.Element {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<AgentDraft>(emptyDraft)

  const isNew = editingId === null
  const cliAvailable = (v: AgentVendor) => (clis ? clis[v] : true)
  const modelInfo = modelCatalog?.[draft.vendor] ?? null

  const select = (agent: AgentDefinition) => {
    setEditingId(agent.id)
    setDraft({ ...agent })
  }

  const startNew = () => {
    setEditingId(null)
    setDraft(emptyDraft())
  }

  const handleSave = () => {
    if (!draft.name.trim()) return
    onSave(isNew ? draft : { ...draft, id: editingId! })
    setEditingId(null)
    setDraft(emptyDraft())
  }

  const handleDelete = () => {
    if (editingId) {
      onDelete(editingId)
      setEditingId(null)
      setDraft(emptyDraft())
    }
  }

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events
    <div className="modal-overlay" onClick={onClose} role="dialog">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-body">
          {/* ── sidebar: agent list ──────────────────────────────────── */}
          <aside className="agent-list">
            <div className="agent-list-header">
              <span>智能体</span>
              <button className="primary" onClick={startNew} type="button">+ 新建</button>
            </div>
            {agents.length === 0 && (
              <div className="transcript-empty">还没有定义智能体。</div>
            )}
            {agents.map((a) => (
              <button
                key={a.id}
                className={`agent-item ${editingId === a.id ? 'agent-item-active' : ''}`}
                onClick={() => select(a)}
              type="button"
            >
                <div className="agent-item-name">{a.name || '未命名'}</div>
                <div className="agent-item-meta">
                  {a.role} · {a.vendor}
                  {a.model ? ` · ${a.model}` : ''}
                </div>
              </button>
            ))}
          </aside>

          {/* ── main: editor form ────────────────────────────────────── */}
          <div className="agent-editor">
            {editingId === null && !isNew ? (
              <div className="transcript-empty">选择一个智能体，或新建一个。</div>
            ) : (
              <>
                <label className="field">
                  <span>名称</span>
                  <input
                    value={draft.name}
                    placeholder="例如：资深产品经理"
                    onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  />
                </label>

                <label className="field">
                  <span>角色</span>
                  <input
                    value={draft.role}
                    placeholder="例如：产品、设计、开发、测试"
                    onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value }))}
                  />
                </label>

                <div className="field-row">
                  <label className="field field-grow">
                    <span>CLI 类型</span>
                    <select
                      value={draft.vendor}
                      onChange={(e) => setDraft((d) => ({ ...d, vendor: e.target.value as AgentVendor }))}
                    >
                      {ALL_VENDORS.map((v) => (
                        <option key={v} value={v}>
                          {v}
                          {!cliAvailable(v) ? '（未安装）' : ''}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="field field-grow">
                    <span>模型（可选）</span>
                    <ModelSelect
                      value={draft.model ?? ''}
                      modelInfo={modelInfo}
                      onChange={(model) => setDraft((d) => ({ ...d, model }))}
                    />
                  </label>
                </div>

                <label className="field">
                  <span>权限模式</span>
                  <select
                    value={draft.permissionMode ?? 'bypassPermissions'}
                    onChange={(e) => setDraft((d) => ({ ...d, permissionMode: e.target.value as PermissionMode }))}
                  >
                    {PERMISSION_MODES.map((m) => (
                      <option key={m} value={m}>{permissionModeLabel(m)}</option>
                    ))}
                  </select>
                </label>

                <label className="field field-grow">
                  <span>系统提示词</span>
                  <textarea
                    value={draft.systemPrompt}
                    placeholder="你是一名资深产品经理。你的职责是..."
                    onChange={(e) => setDraft((d) => ({ ...d, systemPrompt: e.target.value }))}
                  />
                </label>

                <div className="actions">
                  <button className="primary" onClick={handleSave} disabled={!draft.name.trim()} type="button">
                    {isNew ? '创建' : '保存'}
                  </button>
                  {!isNew && (
                    <button onClick={handleDelete} type="button" style={{ color: 'var(--red)' }}>
                      删除
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function permissionModeLabel(mode: PermissionMode): string {
  switch (mode) {
    case 'default':
      return '默认'
    case 'acceptEdits':
      return '自动接受编辑'
    case 'bypassPermissions':
      return '跳过权限确认'
    case 'plan':
      return '计划模式'
  }
}

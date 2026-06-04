import { useEffect, useMemo, useState } from 'react'
import type { AgentDefinition, WorkflowTemplate } from '@shared/types'
import type { WorkflowDraft } from './useWorkflows'

export interface WorkflowPanelProps {
  agents: AgentDefinition[]
  templates: WorkflowTemplate[]
  onSave: (draft: WorkflowDraft) => Promise<WorkflowTemplate>
  onDelete: (id: string) => Promise<void>
  onStart: (templateId: string, projectPath: string, initialPrompt: string) => Promise<unknown>
}

export function WorkflowPanel({
  agents,
  templates,
  onSave,
  onDelete,
  onStart
}: WorkflowPanelProps): JSX.Element {
  const [templateId, setTemplateId] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [stepAgentIds, setStepAgentIds] = useState<string[]>([])
  const [projectPath, setProjectPath] = useState('')
  const [initialPrompt, setInitialPrompt] = useState('')

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === templateId) ?? null,
    [templates, templateId]
  )

  useEffect(() => {
    if (!templateId && templates[0]) setTemplateId(templates[0].id)
  }, [templateId, templates])

  useEffect(() => {
    if (!selectedTemplate) return
    setName(selectedTemplate.name)
    setDescription(selectedTemplate.description ?? '')
    setStepAgentIds(selectedTemplate.steps.map((step) => step.agentId))
  }, [selectedTemplate])

  const canSave = name.trim() !== '' && stepAgentIds.length > 0
  const canStart = !!selectedTemplate && projectPath.trim() !== '' && initialPrompt.trim() !== ''

  const addStep = (): void => {
    const firstAgent = agents[0]
    if (firstAgent) setStepAgentIds((prev) => [...prev, firstAgent.id])
  }

  const saveTemplate = async (): Promise<void> => {
    if (!canSave) return
    const saved = await onSave({
      id: selectedTemplate?.id,
      name: name.trim(),
      description: description.trim() || undefined,
      steps: stepAgentIds.map((agentId) => ({ agentId }))
    })
    setTemplateId(saved.id)
  }

  const startRun = async (): Promise<void> => {
    if (!selectedTemplate || !canStart) return
    await onStart(selectedTemplate.id, projectPath.trim(), initialPrompt.trim())
  }

  const pickDir = async (): Promise<void> => {
    const dir = await window.api.pickDir()
    if (dir) setProjectPath(dir)
  }

  return (
    <section className="workflow-panel">
      <div className="section-title">工作流</div>

      <label className="field">
        <span>模板</span>
        <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
          <option value="">新建工作流</option>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>名称</span>
        <input value={name} placeholder="例如：需求 → 开发" onChange={(e) => setName(e.target.value)} />
      </label>

      <label className="field">
        <span>描述</span>
        <input value={description} placeholder="可选" onChange={(e) => setDescription(e.target.value)} />
      </label>

      <div className="workflow-steps-editor">
        <div className="field-row field-row-between">
          <span className="mini-label">步骤</span>
          <button type="button" onClick={addStep} disabled={agents.length === 0}>
            + 步骤
          </button>
        </div>
        {stepAgentIds.length === 0 && <div className="field-hint">至少添加一个智能体步骤。</div>}
        {stepAgentIds.map((agentId, index) => (
          <div className="workflow-step-edit" key={`${index}-${agentId}`}>
            <span>{index + 1}</span>
            <select
              value={agentId}
              onChange={(e) =>
                setStepAgentIds((prev) =>
                  prev.map((value, i) => (i === index ? e.target.value : value))
                )
              }
            >
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name || '未命名'} · {agent.vendor}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setStepAgentIds((prev) => prev.filter((_, i) => i !== index))}
            >
              移除
            </button>
          </div>
        ))}
      </div>

      <div className="actions">
        <button type="button" className="primary" disabled={!canSave} onClick={saveTemplate}>
          保存工作流
        </button>
        {selectedTemplate && (
          <button type="button" onClick={() => onDelete(selectedTemplate.id)}>
            删除
          </button>
        )}
      </div>

      <label className="field">
        <span>项目目录</span>
        <div className="field-row">
          <input value={projectPath} placeholder="/path/to/project" onChange={(e) => setProjectPath(e.target.value)} />
          <button type="button" onClick={pickDir}>
            选择
          </button>
        </div>
      </label>

      <label className="field">
        <span>初始需求</span>
        <textarea
          className="workflow-prompt"
          value={initialPrompt}
          placeholder="描述这个工作流要完成的任务..."
          onChange={(e) => setInitialPrompt(e.target.value)}
        />
      </label>

      <div className="actions">
        <button type="button" className="primary" disabled={!canStart} onClick={startRun}>
          启动工作流
        </button>
      </div>
    </section>
  )
}

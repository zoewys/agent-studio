import { useEffect, useMemo, useState } from 'react'
import type { AgentDefinition, AgentVendor, CliCheckResult, RunConfig, WorkflowRun } from '@shared/types'
import { ALL_VENDORS } from '@shared/types'
import { useRun } from './useRun'
import { useAgents } from './useAgents'
import { useCliModels } from './useCliModels'
import { useWorkflows } from './useWorkflows'
import { AgentManager } from './AgentManager'
import { ModelSelect } from './ModelSelect'
import { TranscriptViewer } from './TranscriptViewer'
import { WorkflowPanel } from './WorkflowPanel'

type WorkspaceMode = 'workflow' | 'single'

export function App(): JSX.Element {
  const { state, start, continueSession, push, abort, reset } = useRun()
  const { agents, save: saveAgent, remove: removeAgent } = useAgents()
  const { models: modelCatalog, loading: modelsLoading } = useCliModels()
  const workflows = useWorkflows()
  const [clis, setClis] = useState<CliCheckResult | null>(null)
  const [mode, setMode] = useState<WorkspaceMode>('workflow')
  const [vendor, setVendor] = useState<AgentVendor>('claude')
  const [cwd, setCwd] = useState('')
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState('')
  const [interjection, setInterjection] = useState('')
  const [workflowInput, setWorkflowInput] = useState('')
  const [workflowInputError, setWorkflowInputError] = useState<string | null>(null)
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [selectedWorkflowStep, setSelectedWorkflowStep] = useState(0)
  const [showManager, setShowManager] = useState(false)

  const selectedAgent = useMemo(
    () => agents.find((a) => a.id === selectedAgentId) ?? null,
    [agents, selectedAgentId]
  )

  const handleSelectAgent = (id: string) => {
    setSelectedAgentId(id || null)
    const agent = id ? agents.find((a) => a.id === id) : null
    if (agent) {
      setVendor(agent.vendor)
      setModel(agent.model ?? '')
    }
  }

  useEffect(() => {
    window.api.checkClis().then(setClis)
  }, [])

  useEffect(() => {
    if (workflows.currentRun) {
      setMode('workflow')
      setSelectedWorkflowStep(workflows.currentRun.currentStepIndex)
    }
  }, [workflows.currentRun?.id, workflows.currentRun?.currentStepIndex])

  const canStart = !state.running && cwd.trim() !== '' && prompt.trim() !== ''

  const handleStart = async (): Promise<void> => {
    const config: RunConfig = {
      vendor,
      prompt: prompt.trim(),
      cwd: cwd.trim(),
      model: model.trim() || undefined,
      appendSystemPrompt: selectedAgent?.systemPrompt,
      permissionMode: selectedAgent?.permissionMode
    }
    await start(config)
  }

  const handlePickDir = async (): Promise<void> => {
    const dir = await window.api.pickDir()
    if (dir) setCwd(dir)
  }

  const canResume = !state.running && state.sessionId !== null && vendor === 'claude'
  const canInterject = state.running && vendor === 'claude'
  const composerEnabled = canResume || canInterject
  const modelInfo = modelCatalog?.[vendor] ?? null

  const handleComposerSend = async (): Promise<void> => {
    const text = interjection.trim()
    if (!text) return
    setInterjection('')
    if (state.running) {
      await push(text)
    } else if (canResume) {
      const config: RunConfig = {
        vendor,
        prompt: text,
        cwd: cwd.trim(),
        model: model.trim() || undefined,
        resumeFrom: { sessionId: state.sessionId!, vendor },
        appendSystemPrompt: selectedAgent?.systemPrompt,
        permissionMode: selectedAgent?.permissionMode
      }
      await continueSession(config)
    }
  }

  const cliAvailable = clis ? clis[vendor] : true
  const selectedWorkflowExecution = workflows.currentRun
    ? workflows.currentRun.steps[selectedWorkflowStep]?.executions.at(-1) ?? null
    : null
  const selectedWorkflowHandoff = selectedWorkflowExecution?.handoff ?? null
  const selectedWorkflowStepState = workflows.currentRun?.steps[selectedWorkflowStep] ?? null
  const selectedWorkflowAgent = selectedWorkflowStepState
    ? agents.find((agent) => agent.id === selectedWorkflowStepState.agentId) ?? null
    : null
  const workflowComposerEnabled =
    !!workflows.currentRun &&
    selectedWorkflowAgent?.vendor === 'claude' &&
    selectedWorkflowStepState?.status !== 'pending' &&
    !!selectedWorkflowExecution?.sessionId
  const workflowComposerPlaceholder = !workflows.currentRun
    ? '先启动工作流...'
    : selectedWorkflowAgent?.vendor !== 'claude'
        ? '只有 Claude 步骤支持交互对话'
        : !selectedWorkflowExecution?.sessionId
          ? '当前步骤还没有可继续的会话'
          : selectedWorkflowStepState?.status === 'running'
            ? '给当前运行中的智能体发送消息...'
            : selectedWorkflowStepState?.status === 'error'
              ? '输入修复指令，例如：只输出合法 handoff JSON...'
              : selectedWorkflowStepState?.status === 'done' ||
                  selectedWorkflowStepState?.status === 'stale'
                ? '继续这个步骤的会话；发送后下游步骤会标记为需重跑...'
                : selectedWorkflowStepState?.status === 'awaiting-confirm'
                  ? '继续和当前步骤对话，会重新生成交接信息...'
                  : '当前步骤不能对话'

  const startWorkflow = async (
    templateId: string,
    projectPath: string,
    initialPrompt: string
  ) => {
    const run = await workflows.start({ templateId, projectPath, initialPrompt })
    setMode('workflow')
    setSelectedWorkflowStep(0)
    return run
  }

  const handleWorkflowInputSend = async (): Promise<void> => {
    const text = workflowInput.trim()
    if (!text || !workflowComposerEnabled) return
    setWorkflowInput('')
    setWorkflowInputError(null)
    try {
      await workflows.pushInput(selectedWorkflowStep, text)
    } catch (err) {
      setWorkflowInputError(err instanceof Error ? err.message : String(err))
    }
  }

  const subtitle =
    mode === 'workflow'
      ? workflows.currentRun
        ? `M2 · 工作流 · ${workflowRunStatusLabel(workflows.currentRun.status)}`
        : 'M2 · 工作流'
      : `M1 · 单智能体 · ${vendor}`

  return (
    <>
      <div className="app">
        <header className="app-header">
          <h1>智能体工作台</h1>
          <span className="app-subtitle">{subtitle}</span>
        </header>

        <div className="app-body">
          <nav className="mode-rail" aria-label="工作区模式">
            <button
              type="button"
              className={`mode-item ${mode === 'workflow' ? 'mode-item-active' : ''}`}
              onClick={() => setMode('workflow')}
            >
              <span className="mode-icon">流</span>
              <span>工作流</span>
            </button>
            <button
              type="button"
              className={`mode-item ${mode === 'single' ? 'mode-item-active' : ''}`}
              onClick={() => setMode('single')}
            >
              <span className="mode-icon">单</span>
              <span>单次运行</span>
            </button>
            <button type="button" className="mode-item" onClick={() => setShowManager(true)}>
              <span className="mode-icon">{agents.length}</span>
              <span>智能体</span>
            </button>
          </nav>

          <aside className="panel panel-config">
            <div className="workspace-panel-header">
              <span className="section-title">{mode === 'workflow' ? '工作流配置' : '单智能体配置'}</span>
              <h2>{mode === 'workflow' ? '编排并运行多个智能体' : '直接运行一个智能体'}</h2>
              <p>
                {mode === 'workflow'
                  ? '创建线性流程，并在右侧运行区逐步审阅 handoff。'
                  : '选择预设智能体，或手动配置一次 CLI 运行。'}
              </p>
            </div>

            {mode === 'workflow' ? (
              <WorkflowPanel
                agents={agents}
                templates={workflows.templates}
                onSave={workflows.save}
                onDelete={workflows.remove}
                onStart={startWorkflow}
              />
            ) : (
              <>
                <label className="field">
                  <span>智能体</span>
                  <div className="field-row">
                    <select
                      value={selectedAgentId ?? ''}
                      onChange={(e) => handleSelectAgent(e.target.value)}
                    >
                      <option value="">不使用预设，手动配置</option>
                      {agents.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name || '未命名'}
                        </option>
                      ))}
                    </select>
                    <button onClick={() => setShowManager(true)} type="button">
                      管理
                    </button>
                  </div>
                </label>

                <label className="field">
                  <span>CLI 类型</span>
                  <select value={vendor} onChange={(e) => setVendor(e.target.value as AgentVendor)}>
                    {ALL_VENDORS.map((v) => (
                      <option key={v} value={v}>
                        {v}
                        {clis && !clis[v] ? '（未安装）' : ''}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>模型（可选）</span>
                  <ModelSelect
                    value={model}
                    loading={modelsLoading}
                    modelInfo={modelInfo}
                    onChange={setModel}
                  />
                </label>

                <label className="field">
                  <span>项目目录</span>
                  <div className="field-row">
                    <input
                      value={cwd}
                      placeholder="/path/to/project"
                      onChange={(e) => setCwd(e.target.value)}
                    />
                    <button onClick={handlePickDir} type="button">
                      选择
                    </button>
                  </div>
                </label>

                <label className="field field-grow">
                  <span>任务描述</span>
                  <textarea
                    value={prompt}
                    placeholder="描述这次要交给智能体处理的任务..."
                    onChange={(e) => setPrompt(e.target.value)}
                  />
                </label>

                {!cliAvailable && (
                  <div className="warn">
                    没有在 PATH 中检测到 {vendor} CLI。请先安装，或选择其他 CLI。
                  </div>
                )}

                <div className="actions">
                  <button className="primary" disabled={!canStart} onClick={handleStart} type="button">
                    {state.running ? '运行中...' : '开始运行'}
                  </button>
                  {state.running && (
                    <button onClick={abort} type="button">
                      停止
                    </button>
                  )}
                  {!state.running && state.events.length > 0 && (
                    <button onClick={reset} type="button">
                      清空
                    </button>
                  )}
                </div>
              </>
            )}
          </aside>

          <main className="panel panel-runtime">
            {mode === 'workflow' ? (
              <WorkflowRuntime
                agents={agents}
                currentRun={workflows.currentRun}
                selectedStepIndex={selectedWorkflowStep}
                selectedExecution={selectedWorkflowExecution}
                onSelectStep={setSelectedWorkflowStep}
                onConfirm={workflows.confirmStep}
                onRerun={workflows.rerunStep}
                onAbort={workflows.abort}
                onClearRun={workflows.clearRun}
                composerValue={workflowInput}
                composerEnabled={workflowComposerEnabled}
                composerPlaceholder={workflowComposerPlaceholder}
                composerError={workflowInputError}
                onComposerChange={(value) => {
                  setWorkflowInput(value)
                  setWorkflowInputError(null)
                }}
                onComposerSend={handleWorkflowInputSend}
              />
            ) : (
              <>
                <TranscriptViewer events={state.events} />

                {state.events.length > 0 && (
                  <div className="interject">
                    <input
                      value={interjection}
                      disabled={!composerEnabled}
                      placeholder={
                        canInterject
                          ? '插入消息（只影响当前智能体）...'
                          : canResume
                            ? '继续这个会话...'
                            : vendor === 'claude'
                              ? '先开始运行，创建一个会话...'
                              : '只有 claude 支持继续会话'
                      }
                      onChange={(e) => setInterjection(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleComposerSend()
                      }}
                    />
                    <button onClick={handleComposerSend} disabled={!composerEnabled} type="button">
                      发送
                    </button>
                  </div>
                )}
              </>
            )}

            {mode === 'workflow' && selectedWorkflowHandoff && (
              <HandoffPanel handoff={selectedWorkflowHandoff} />
            )}
          </main>
        </div>
      </div>

      {showManager && (
        <AgentManager
          agents={agents}
          clis={clis}
          modelCatalog={modelCatalog}
          onSave={(draft) => {
            saveAgent(draft)
          }}
          onDelete={(id) => {
            removeAgent(id)
            if (selectedAgentId === id) {
              setSelectedAgentId(null)
              setVendor('claude')
              setModel('')
            }
          }}
          onClose={() => setShowManager(false)}
        />
      )}
    </>
  )
}

interface WorkflowRuntimeProps {
  agents: AgentDefinition[]
  currentRun: WorkflowRun | null
  selectedStepIndex: number
  selectedExecution: WorkflowRun['steps'][number]['executions'][number] | null
  onSelectStep: (index: number) => void
  onConfirm: () => Promise<void>
  onRerun: (stepIndex: number) => Promise<void>
  onAbort: () => Promise<void>
  onClearRun: () => void
  composerValue: string
  composerEnabled: boolean
  composerPlaceholder: string
  composerError: string | null
  onComposerChange: (value: string) => void
  onComposerSend: () => Promise<void>
}

function WorkflowRuntime({
  agents,
  currentRun,
  selectedStepIndex,
  selectedExecution,
  onSelectStep,
  onConfirm,
  onRerun,
  onAbort,
  onClearRun,
  composerValue,
  composerEnabled,
  composerPlaceholder,
  composerError,
  onComposerChange,
  onComposerSend
}: WorkflowRuntimeProps): JSX.Element {
  if (!currentRun) {
    return (
      <div className="runtime-empty">
        <strong>暂无运行中的工作流</strong>
        <span>先在左侧配置区选择或创建工作流，然后启动运行。</span>
      </div>
    )
  }

  const selectedStep = currentRun.steps[selectedStepIndex]
  const awaitingConfirm =
    currentRun.status === 'awaiting-confirm' &&
    currentRun.steps[currentRun.currentStepIndex]?.status === 'awaiting-confirm'

  return (
    <div className="workflow-runtime">
      <aside className="workflow-run-sidebar">
        <div className="runtime-section-header">
          <span className="section-title">当前运行</span>
          <h2>{currentRun.templateName}</h2>
          <p>{workflowRunStatusLabel(currentRun.status)}</p>
        </div>

        <div className="workflow-step-list">
          {currentRun.steps.map((step, index) => {
            const agent = agents.find((candidate) => candidate.id === step.agentId)
            const latest = step.executions[step.executions.length - 1]
            return (
              <button
                type="button"
                key={`${currentRun.id}-${index}`}
                className={`workflow-step-card ${selectedStepIndex === index ? 'workflow-step-card-active' : ''}`}
                onClick={() => onSelectStep(index)}
              >
                <div className="workflow-step-main">
                  <span>{index + 1}. {agent?.name ?? '缺失智能体'}</span>
                  <strong>{stepStatusLabel(step.status)}</strong>
                </div>
                {latest?.handoff?.summary && <p>{latest.handoff.summary}</p>}
                {latest?.error && <p className="workflow-error">{latest.error}</p>}
              </button>
            )
          })}
        </div>

        <div className="workflow-run-actions">
          {awaitingConfirm && (
            <button type="button" className="primary" onClick={onConfirm}>
              确认并继续
            </button>
          )}
          <button type="button" onClick={() => onRerun(selectedStepIndex)}>
            重跑所选步骤
          </button>
          {currentRun.status === 'running' && (
            <button type="button" onClick={onAbort}>
              停止
            </button>
          )}
          <button type="button" onClick={onClearRun}>
            清空
          </button>
        </div>
      </aside>

      <section className="workflow-detail">
        <div className="workflow-detail-header">
          <strong>
            步骤 {selectedStepIndex + 1} · {selectedStep ? stepStatusLabel(selectedStep.status) : '未知'}
          </strong>
          {selectedExecution?.error && (
            <span className="workflow-error">{selectedExecution.error}</span>
          )}
        </div>
        <TranscriptViewer events={selectedExecution?.events ?? []} />
        <div className="workflow-cli-composer">
          <div className="workflow-cli-prompt">›</div>
          <textarea
            value={composerValue}
            disabled={!composerEnabled}
            placeholder={composerPlaceholder}
            onChange={(e) => onComposerChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void onComposerSend()
              }
            }}
          />
          <button onClick={() => void onComposerSend()} disabled={!composerEnabled} type="button">
            发送
          </button>
        </div>
        {composerError && <div className="workflow-input-error">{composerError}</div>}
      </section>
    </div>
  )
}

function HandoffPanel({
  handoff
}: {
  handoff: NonNullable<WorkflowRun['steps'][number]['executions'][number]['handoff']>
}): JSX.Element {
  return (
    <div className="handoff-panel">
      <div className="section-title">交接信息</div>
      <p>{handoff.summary}</p>
      {handoff.artifacts.length > 0 && (
        <ul>
          {handoff.artifacts.map((artifact, index) => (
            <li key={`${artifact.path}-${index}`}>
              <strong>{artifact.path}</strong> · {artifact.description}
            </li>
          ))}
        </ul>
      )}
      {handoff.nextStepGuidance && <p className="field-hint">{handoff.nextStepGuidance}</p>}
    </div>
  )
}

function workflowRunStatusLabel(status: WorkflowRun['status']): string {
  switch (status) {
    case 'running':
      return '运行中'
    case 'awaiting-confirm':
      return '等待确认'
    case 'completed':
      return '已完成'
    case 'error':
      return '出错'
    case 'aborted':
      return '已停止'
  }
}

function stepStatusLabel(status: WorkflowRun['steps'][number]['status']): string {
  switch (status) {
    case 'pending':
      return '待执行'
    case 'running':
      return '运行中'
    case 'awaiting-confirm':
      return '等待确认'
    case 'done':
      return '已完成'
    case 'stale':
      return '需重跑'
    case 'error':
      return '出错'
  }
}

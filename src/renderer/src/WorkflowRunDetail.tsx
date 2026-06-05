import type { AgentDefinition, WorkflowRun } from '@shared/types'
import { TranscriptViewer } from './TranscriptViewer'
import { HandoffPanel } from './HandoffPanel'
import { CheckCircle, RotateCcw, Send } from './Icons'

export interface WorkflowRunDetailProps {
  run: WorkflowRun | null
  selectedStepIndex: number
  selectedExecution: WorkflowRun['steps'][number]['executions'][number] | null
  handoff: NonNullable<WorkflowRun['steps'][number]['executions'][number]['handoff']> | null
  onConfirm: () => Promise<void>
  onRerun: (stepIndex: number) => Promise<void>
  onAbort: () => Promise<void>
  composerValue: string
  composerEditable: boolean
  composerEnabled: boolean
  composerPlaceholder: string
  composerError: string | null
  onComposerChange: (value: string) => void
  onComposerSend: () => Promise<void>
}

export function WorkflowRunDetail({
  run,
  selectedStepIndex,
  selectedExecution,
  handoff,
  onConfirm,
  onRerun,
  onAbort,
  composerValue,
  composerEditable,
  composerEnabled,
  composerPlaceholder,
  composerError,
  onComposerChange,
  onComposerSend
}: WorkflowRunDetailProps): JSX.Element {
  if (!run) {
    return (
      <main className="workflow-run-detail workflow-run-detail-empty">
        <strong>暂无工作流运行</strong>
        <span>点击左侧 New Run 从模板启动一个 workflow。</span>
      </main>
    )
  }

  return (
    <main className="workflow-run-detail">
      <div className="workflow-run-detail-header">
        <div>
          <h2>{run.runName || run.templateName}</h2>
          <p>{run.projectPath}</p>
        </div>
        <div className="workflow-run-detail-actions">
          <button type="button" onClick={() => onRerun(selectedStepIndex)}>
            <RotateCcw size={14} /> 重新运行
          </button>
          {run.status === 'running' && (
            <button type="button" onClick={onAbort}>
              停止
            </button>
          )}
        </div>
      </div>
      <TranscriptViewer events={selectedExecution?.events ?? []} />
      {handoff && run.status === 'awaiting-confirm' && (
        <>
          <HandoffPanel handoff={handoff} />
          <div className="workflow-run-actions">
            <button type="button" className="primary" onClick={onConfirm}>
              <CheckCircle size={14} /> 确认并继续
            </button>
          </div>
        </>
      )}
      <div className="workflow-cli-composer">
        <div className="workflow-cli-prompt">›</div>
        <textarea
          value={composerValue}
          disabled={!composerEditable}
          placeholder={composerPlaceholder}
          onChange={(e) => onComposerChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void onComposerSend()
            }
          }}
        />
        <button
          onClick={() => void onComposerSend()}
          disabled={!composerEnabled || composerValue.trim() === ''}
          type="button"
        >
          <Send size={14} /> 发送
        </button>
      </div>
      {composerError && <div className="workflow-input-error">{composerError}</div>}
    </main>
  )
}

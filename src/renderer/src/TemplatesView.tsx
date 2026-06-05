import type { AgentDefinition, WorkflowTemplate } from '@shared/types'
import type { WorkflowDraft } from './useWorkflows'
import { WorkflowPanel } from './WorkflowPanel'

interface TemplatesViewProps {
  agents: AgentDefinition[]
  templates: WorkflowTemplate[]
  onSave: (draft: WorkflowDraft) => Promise<WorkflowTemplate>
  onDelete: (id: string) => Promise<void>
}

export function TemplatesView({
  agents,
  templates,
  onSave,
  onDelete
}: TemplatesViewProps): JSX.Element {
  return (
    <section className="templates-view">
      <div className="templates-view-header">
        <div>
          <h2>Workflow Templates</h2>
          <p>模板定义流程；Workflow 页面使用模板启动任务实例。</p>
        </div>
      </div>
      <WorkflowPanel
        agents={agents}
        templates={templates}
        onSave={onSave}
        onDelete={onDelete}
        onStart={async () => undefined}
        hideRunControls
      />
    </section>
  )
}

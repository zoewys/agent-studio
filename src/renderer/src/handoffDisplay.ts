import type { HandoffArtifact, HandoffArtifactItem } from '../../shared/types'

export interface HandoffDisplayArtifactRow {
  type: NonNullable<HandoffArtifactItem['type']>
  path: string
  description: string
}

export interface HandoffDisplayModel {
  summary: {
    label: '摘要'
    text: string
  }
  artifacts: {
    label: '产物'
    headers: ['类型', '路径', '说明']
    rows: HandoffDisplayArtifactRow[]
    emptyText: '未报告产物。'
  }
  guidance: {
    label: '下一步建议'
    text: string
  } | null
}

export function formatHandoffDisplay(handoff: HandoffArtifact): HandoffDisplayModel {
  return {
    summary: {
      label: '摘要',
      text: handoff.summary
    },
    artifacts: {
      label: '产物',
      headers: ['类型', '路径', '说明'],
      rows: handoff.artifacts.map((artifact) => ({
        type: artifact.type ?? 'other',
        path: artifact.path,
        description: artifact.description
      })),
      emptyText: '未报告产物。'
    },
    guidance: handoff.nextStepGuidance
      ? {
          label: '下一步建议',
          text: handoff.nextStepGuidance
        }
      : null
  }
}

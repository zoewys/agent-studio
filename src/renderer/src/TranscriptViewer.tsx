import { useEffect, useRef } from 'react'
import type { AgentEvent } from '@shared/types'

function renderEvent(event: AgentEvent, i: number): JSX.Element | null {
  switch (event.kind) {
    case 'session-started':
      return (
        <div key={i} className="ev ev-system">
          会话已开始 · {event.sessionId.slice(0, 8)}
        </div>
      )
    case 'message':
      return (
        <div key={i} className="ev ev-message">
          {event.text}
        </div>
      )
    case 'message-delta':
      return (
        <span key={i} className="ev-delta">
          {event.text}
        </span>
      )
    case 'thinking':
      return (
        <div key={i} className="ev ev-thinking">
          {event.text}
        </div>
      )
    case 'tool-call':
      return (
        <div key={i} className="ev ev-tool">
          <span className="ev-tag">工具</span> {event.name}
          <pre>{safeStringify(event.input)}</pre>
        </div>
      )
    case 'tool-result':
      return (
        <div key={i} className={`ev ev-tool-result ${event.ok ? '' : 'ev-error'}`}>
          <span className="ev-tag">{event.ok ? '结果' : '结果失败'}</span>
          <pre>{truncate(safeStringify(event.output), 800)}</pre>
        </div>
      )
    case 'file-changed':
      return (
        <div key={i} className="ev ev-file">
          {fileOpLabel(event.op)}：{event.path}
        </div>
      )
    case 'usage':
      return (
        <div key={i} className="ev ev-usage">
          Token 输入/输出：{event.inputTokens}/{event.outputTokens}
          {event.costUsd != null ? ` · $${event.costUsd.toFixed(4)}` : ''}
        </div>
      )
    case 'turn-done':
      return (
        <div key={i} className="ev ev-done">
          ── 回合{turnReasonLabel(event.reason)} ──
        </div>
      )
    case 'error':
      return (
        <div key={i} className="ev ev-error">
          错误：{event.message}
        </div>
      )
    case 'stderr':
      return (
        <div key={i} className="ev ev-stderr">
          {event.text}
        </div>
      )
    case 'system':
      return (
        <div key={i} className="ev ev-system">
          {event.text}
        </div>
      )
    default:
      return null
  }
}

export function TranscriptViewer({ events }: { events: AgentEvent[] }): JSX.Element {
  const endRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to the latest event.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events.length])

  if (events.length === 0) {
    return <div className="transcript-empty">暂无输出。启动运行后可在这里查看智能体过程。</div>
  }

  return (
    <div className="transcript">
      {events.map((e, i) => renderEvent(e, i))}
      <div ref={endRef} />
    </div>
  )
}

function safeStringify(v: unknown): string {
  if (typeof v === 'string') return v
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return String(v)
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + `\n...（还有 ${s.length - max} 个字符）` : s
}

function fileOpLabel(op: Extract<AgentEvent, { kind: 'file-changed' }>['op']): string {
  switch (op) {
    case 'create':
      return '创建文件'
    case 'modify':
      return '修改文件'
    case 'delete':
      return '删除文件'
  }
}

function turnReasonLabel(reason: Extract<AgentEvent, { kind: 'turn-done' }>['reason']): string {
  switch (reason) {
    case 'complete':
      return '完成'
    case 'error':
      return '出错'
    case 'aborted':
      return '已中止'
  }
}

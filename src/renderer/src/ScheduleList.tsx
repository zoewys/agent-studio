import { useEffect, useState } from 'react'
import type { CronPreview, WorkflowSchedule } from '@shared/types'
import { CalendarClock, Plus } from 'lucide-react'

interface ScheduleListProps {
  schedules: WorkflowSchedule[]
  selectedScheduleId: string | null
  loading: boolean
  onSelectSchedule: (scheduleId: string) => void
  onNewSchedule: () => void
  onToggle: (id: string, enabled: boolean) => Promise<unknown>
}

export function ScheduleList({
  schedules,
  selectedScheduleId,
  loading,
  onSelectSchedule,
  onNewSchedule,
  onToggle
}: ScheduleListProps): JSX.Element {
  return (
    <aside className="schedule-list">
      <div className="workflow-runs-header">
        <div>
          <div className="workflow-runs-title">Schedules</div>
          <p>自动启动 workflow run，按设定时间后台执行。</p>
        </div>
        <div className="workflow-runs-actions">
          <button type="button" className="primary" onClick={onNewSchedule}>
            <Plus size={14} /> New
          </button>
        </div>
      </div>

      <div className="schedule-cards">
        {loading && schedules.length === 0 && (
          <div className="schedule-empty">Loading schedules...</div>
        )}
        {!loading && schedules.length === 0 && (
          <div className="schedule-empty">
            <CalendarClock size={18} />
            <span>No schedules</span>
          </div>
        )}
        {schedules.map((schedule) => (
          <button
            type="button"
            key={schedule.id}
            className={[
              'schedule-card',
              selectedScheduleId === schedule.id ? 'schedule-card-active' : '',
              !schedule.enabled ? 'schedule-card-disabled' : ''
            ].filter(Boolean).join(' ')}
            onClick={() => onSelectSchedule(schedule.id)}
          >
            <div className="schedule-card-main">
              <strong>{schedule.name}</strong>
              <span className={schedule.enabled ? 'schedule-enabled' : 'schedule-disabled'}>
                {schedule.enabled ? 'ON' : 'OFF'}
              </span>
            </div>
            <code>{schedule.cron}</code>
            <ScheduleTiming cron={schedule.cron} />
            <span
              className={`schedule-toggle${schedule.enabled ? ' on' : ''}`}
              role="switch"
              aria-checked={schedule.enabled}
              tabIndex={0}
              onClick={(event) => {
                event.stopPropagation()
                void onToggle(schedule.id, !schedule.enabled)
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return
                event.preventDefault()
                event.stopPropagation()
                void onToggle(schedule.id, !schedule.enabled)
              }}
            />
          </button>
        ))}
      </div>
    </aside>
  )
}

function ScheduleTiming({ cron }: { cron: string }): JSX.Element {
  const [preview, setPreview] = useState<CronPreview | null>(null)

  useEffect(() => {
    let cancelled = false
    window.api.cronDescribe(cron)
      .then((next) => {
        if (!cancelled) setPreview(next)
      })
      .catch(() => {
        if (!cancelled) setPreview(null)
      })
    return () => {
      cancelled = true
    }
  }, [cron])

  if (!preview?.valid) return <span className="schedule-card-time">Invalid cron</span>
  return (
    <span className="schedule-card-time">
      {preview.description} · next {formatDateTime(preview.nextFireAt)}
    </span>
  )
}

function formatDateTime(timestamp?: number): string {
  if (!timestamp) return '-'
  return new Date(timestamp).toLocaleString([], {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

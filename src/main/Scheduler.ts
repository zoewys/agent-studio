import type { WorkflowEventEnvelope, WorkflowRun, WorkflowSchedule } from '@shared/types'
import type { ScheduleStore } from './ScheduleStore'
import type { WorkflowManager } from './WorkflowManager'
import type { WorkflowStore } from './WorkflowStore'
import { nextFireTime } from './cronParser'

type EmitWorkflow = (envelope: WorkflowEventEnvelope) => void

export interface SchedulerCallbacks {
  onScheduleChanged?: () => void
  onScheduleRunResult?: (schedule: WorkflowSchedule, run: WorkflowRun) => void
  onScheduleRunError?: (schedule: WorkflowSchedule, error: unknown) => void
}

const MAX_TIMER_DELAY_MS = 2_147_483_647

export class Scheduler {
  private timers = new Map<string, NodeJS.Timeout>()

  constructor(
    private readonly scheduleStore: ScheduleStore,
    private readonly workflowManager: WorkflowManager,
    private readonly workflowStore: WorkflowStore,
    private readonly emit: EmitWorkflow,
    private readonly callbacks: SchedulerCallbacks = {}
  ) {}

  start(): void {
    for (const schedule of this.scheduleStore.list()) {
      if (schedule.enabled) this.register(schedule)
    }
  }

  register(schedule: WorkflowSchedule): void {
    this.scheduleNext(schedule)
  }

  unregister(scheduleId: string): void {
    const timer = this.timers.get(scheduleId)
    if (timer) clearTimeout(timer)
    this.timers.delete(scheduleId)
  }

  stopAll(): void {
    for (const timer of this.timers.values()) clearTimeout(timer)
    this.timers.clear()
  }

  handleWorkflowRunUpdated(run: WorkflowRun): void {
    if (!run.scheduledBy) return
    if (run.status !== 'completed' && run.status !== 'error') return

    const schedule = this.scheduleStore.list().find((item) => item.id === run.scheduledBy)
    if (!schedule) return

    this.scheduleStore.updateLastTriggered(
      run.scheduledBy,
      run.id,
      run.status === 'completed' ? 'completed' : 'error'
    )
    this.callbacks.onScheduleChanged?.()
    this.callbacks.onScheduleRunResult?.(schedule, run)
  }

  private scheduleNext(schedule: WorkflowSchedule): void {
    this.unregister(schedule.id)
    if (!schedule.enabled) return

    let next: Date
    try {
      next = nextFireTime(schedule.cron)
    } catch (err) {
      this.scheduleStore.updateLastTriggered(schedule.id, schedule.lastRunId ?? '', 'error')
      this.callbacks.onScheduleChanged?.()
      this.callbacks.onScheduleRunError?.(schedule, err)
      return
    }

    const delay = next.getTime() - Date.now()
    if (delay < 0) return

    const timer = setTimeout(() => {
      this.fire(schedule)
      const latest = this.scheduleStore.list().find((item) => item.id === schedule.id)
      if (latest?.enabled) this.scheduleNext(latest)
    }, Math.min(delay, MAX_TIMER_DELAY_MS))

    this.timers.set(schedule.id, timer)
  }

  private fire(schedule: WorkflowSchedule): void {
    try {
      const result = this.workflowManager.start({
        templateId: schedule.templateId,
        projectPath: schedule.projectPath,
        initialPrompt: schedule.initialPrompt,
        runName: `[scheduled] ${schedule.name}`,
        autoConfirm: true,
        scheduledBy: schedule.id
      })
      this.scheduleStore.updateLastTriggered(schedule.id, result.run.id, 'running')
      this.callbacks.onScheduleChanged?.()
    } catch (err) {
      this.scheduleStore.updateLastTriggered(schedule.id, '', 'error')
      this.callbacks.onScheduleChanged?.()
      this.callbacks.onScheduleRunError?.(schedule, err)
    }
  }
}

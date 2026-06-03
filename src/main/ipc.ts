import { ipcMain, dialog, type BrowserWindow } from 'electron'
import {
  IPC,
  type RunConfig,
  type RunStartResult,
  type RunEventEnvelope,
  type CliCheckResult,
  type AgentDefinition
} from '@shared/types'
import { RunManager } from './RunManager'
import { TranscriptStore } from './TranscriptStore'
import { AgentStore } from './AgentStore'
import { checkClis } from './cliCheck'

/**
 * Registers all IPC handlers and returns the RunManager so the app can kill
 * live runs on shutdown. Events flow main → renderer via webContents.send.
 */
export function registerIpc(getWindow: () => BrowserWindow | null): RunManager {
  const transcriptStore = new TranscriptStore()
  const agentStore = new AgentStore()
  const runManager = new RunManager(transcriptStore)

  const emit = (runId: string, event: RunEventEnvelope['event']): void => {
    // Persist every event before forwarding (captures the full stream on disk).
    transcriptStore.record(runId, event)
    const win = getWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC.runEvent, { runId, event } satisfies RunEventEnvelope)
    }
  }

  ipcMain.handle(IPC.runStart, (_e, config: RunConfig): RunStartResult => {
    // The renderer can't know the on-disk transcript path; fill it here so the
    // resume-fallback in RunManager can find prior context if --resume fails.
    if (config.resumeFrom && !config.resumeFrom.transcriptPath) {
      config.resumeFrom.transcriptPath = transcriptStore.getTranscriptPath(
        config.resumeFrom.sessionId
      )
    }
    const runId = runManager.start(config, emit)
    // The first user turn never appears in the event stream — record it.
    transcriptStore.recordUserInput(runId, config.prompt)
    return { runId }
  })

  ipcMain.handle(IPC.runPush, async (_e, runId: string, text: string): Promise<void> => {
    transcriptStore.recordUserInput(runId, text)
    await runManager.push(runId, text)
  })

  ipcMain.handle(IPC.runAbort, (_e, runId: string): void => {
    runManager.abort(runId)
  })

  ipcMain.handle(IPC.checkClis, (): Promise<CliCheckResult> => checkClis())

  ipcMain.handle(IPC.pickDir, async (): Promise<string | null> => {
    const win = getWindow()
    const result = await dialog.showOpenDialog(win ?? undefined!, {
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // ── Agent CRUD ─────────────────────────────────────────────────────────

  ipcMain.handle(IPC.agentsList, (): AgentDefinition[] => agentStore.list())

  ipcMain.handle(IPC.agentsSave, (_e, input): AgentDefinition => agentStore.save(input))

  ipcMain.handle(IPC.agentsDelete, (_e, id: string): void => agentStore.remove(id))

  return runManager
}

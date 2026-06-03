import { useEffect, useMemo, useState } from 'react'
import type { AgentVendor, CliCheckResult, RunConfig } from '@shared/types'
import { ALL_VENDORS, VENDOR_MODELS } from '@shared/types'
import { useRun } from './useRun'
import { useAgents } from './useAgents'
import { AgentManager } from './AgentManager'
import { TranscriptViewer } from './TranscriptViewer'

export function App(): JSX.Element {
  const { state, start, continueSession, push, abort, reset } = useRun()
  const { agents, save: saveAgent, remove: removeAgent } = useAgents()
  const [clis, setClis] = useState<CliCheckResult | null>(null)
  const [vendor, setVendor] = useState<AgentVendor>('claude')
  const [cwd, setCwd] = useState('')
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState('')
  const [interjection, setInterjection] = useState('')
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [showManager, setShowManager] = useState(false)

  const selectedAgent = useMemo(
    () => agents.find((a) => a.id === selectedAgentId) ?? null,
    [agents, selectedAgentId]
  )

  /** Apply an agent preset: override vendor + model in the left panel. */
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

  // Whether the bottom composer can resume a finished claude session.
  const canResume = !state.running && state.sessionId !== null && vendor === 'claude'
  // Live claude run accepts mid-run interjections.
  const canInterject = state.running && vendor === 'claude'
  const composerEnabled = canResume || canInterject

  const handleComposerSend = async (): Promise<void> => {
    const text = interjection.trim()
    if (!text) return
    setInterjection('')
    if (state.running) {
      // Live run → mid-run interjection.
      await push(text)
    } else if (canResume) {
      // Finished run → continue the same session with full context.
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

  return (
    <>
      <div className="app">
      <header className="app-header">
        <h1>Agent Studio</h1>
        <span className="app-subtitle">M1 · single agent · {vendor}</span>
      </header>

      <div className="app-body">
        <aside className="panel panel-config">
          <label className="field">
            <span>Agent</span>
            <div className="field-row">
              <select
                value={selectedAgentId ?? ''}
                onChange={(e) => handleSelectAgent(e.target.value)}
              >
                <option value="">(none — manual config)</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name || '(untitled)'}
                  </option>
                ))}
              </select>
              <button onClick={() => setShowManager(true)} type="button">
                Manage…
              </button>
            </div>
          </label>

          <label className="field">
            <span>Vendor</span>
            <select value={vendor} onChange={(e) => setVendor(e.target.value as AgentVendor)}>
              {ALL_VENDORS.map((v) => (
                <option key={v} value={v}>
                  {v}
                  {clis && !clis[v] ? ' (not installed)' : ''}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Model (optional)</span>
            <input
              value={model}
              placeholder="e.g. sonnet, opus"
              list="app-models"
              onChange={(e) => setModel(e.target.value)}
            />
            <datalist id="app-models">
              {(VENDOR_MODELS[vendor] ?? []).map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </label>

          <label className="field">
            <span>Project directory</span>
            <div className="field-row">
              <input
                value={cwd}
                placeholder="/path/to/project"
                onChange={(e) => setCwd(e.target.value)}
              />
              <button onClick={handlePickDir} type="button">
                Browse…
              </button>
            </div>
          </label>

          <label className="field field-grow">
            <span>Prompt</span>
            <textarea
              value={prompt}
              placeholder="Describe the task for this agent…"
              onChange={(e) => setPrompt(e.target.value)}
            />
          </label>

          {!cliAvailable && (
            <div className="warn">
              {vendor} CLI not detected on PATH. Install it or pick another vendor.
            </div>
          )}

          <div className="actions">
            <button className="primary" disabled={!canStart} onClick={handleStart} type="button">
              {state.running ? 'Running…' : 'Start run'}
            </button>
            {state.running && (
              <button onClick={abort} type="button">
                Stop
              </button>
            )}
            {!state.running && state.events.length > 0 && (
              <button onClick={reset} type="button">
                Clear
              </button>
            )}
          </div>
        </aside>

        <main className="panel panel-transcript">
          <TranscriptViewer events={state.events} />

          {state.events.length > 0 && (
            <div className="interject">
              <input
                value={interjection}
                disabled={!composerEnabled}
                placeholder={
                  canInterject
                    ? 'Interject (only affects the current agent)…'
                    : canResume
                      ? 'Continue this session…'
                      : vendor === 'claude'
                        ? 'Start a run to begin a session…'
                        : 'Continuing a session is only supported for claude'
                }
                onChange={(e) => setInterjection(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleComposerSend()
                }}
              />
              <button onClick={handleComposerSend} disabled={!composerEnabled} type="button">
                Send
              </button>
            </div>
          )}
        </main>
      </div>
    </div>

      {showManager && (
        <AgentManager
          agents={agents}
          clis={clis}
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

/**
 * ModeRail.tsx — 左侧 workspace 模式导航栏
 */

import { Bot, Layers, Play, Settings, Workflow } from 'lucide-react'

export type WorkspaceMode = 'workflow' | 'templates' | 'agents' | 'single' | 'settings'

interface ModeRailProps {
  mode: WorkspaceMode
  onModeChange: (mode: WorkspaceMode) => void
}

function railIcon(mode: WorkspaceMode, size = 20) {
  switch (mode) {
    case 'workflow': return <Workflow size={size} />
    case 'templates': return <Layers size={size} />
    case 'agents': return <Bot size={size} />
    case 'single': return <Play size={size} />
    case 'settings': return <Settings size={size} />
  }
}

export function ModeRail({ mode, onModeChange }: ModeRailProps): JSX.Element {
  return (
    <nav className="mode-rail" aria-label="Workspace modes">
      <button
        type="button"
        className={`mode-item ${mode === 'workflow' ? 'mode-item-active' : ''}`}
        onClick={() => onModeChange('workflow')}
      >
        <span className="mode-icon">{railIcon('workflow')}</span>
        <span>Workflow</span>
      </button>

      <button
        type="button"
        className={`mode-item ${mode === 'templates' ? 'mode-item-active' : ''}`}
        onClick={() => onModeChange('templates')}
      >
        <span className="mode-icon">{railIcon('templates')}</span>
        <span>Templates</span>
      </button>

      <button
        type="button"
        className={`mode-item ${mode === 'agents' ? 'mode-item-active' : ''}`}
        onClick={() => onModeChange('agents')}
      >
        <span className="mode-icon">{railIcon('agents')}</span>
        <span>Agents</span>
      </button>

      <button
        type="button"
        className={`mode-item ${mode === 'single' ? 'mode-item-active' : ''}`}
        onClick={() => onModeChange('single')}
      >
        <span className="mode-icon">{railIcon('single')}</span>
        <span>Single</span>
      </button>

      <div className="mode-rail-spacer" />

      <button
        type="button"
        className={`mode-item ${mode === 'settings' ? 'mode-item-active' : ''}`}
        onClick={() => onModeChange('settings')}
      >
        <span className="mode-icon">{railIcon('settings')}</span>
        <span>Settings</span>
      </button>
    </nav>
  )
}

import { useEffect, useState } from 'react'
import { Minus, Square, Copy, X } from 'lucide-react'

export function WindowControls() {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    if (window.api.platform === 'darwin') return
    let active = true
    void window.api.isWindowMaximized().then((value) => {
      if (active) setMaximized(value)
    })
    const off = window.api.onWindowMaximizeChanged((value) => setMaximized(value))
    return () => {
      active = false
      off()
    }
  }, [])

  if (window.api.platform === 'darwin') return null

  return (
    <div className="window-controls" aria-label="窗口控制">
      <button
        type="button"
        title="最小化"
        aria-label="最小化"
        onClick={() => void window.api.windowMinimize()}
      >
        <Minus size={15} />
      </button>
      <button
        type="button"
        title={maximized ? '还原' : '最大化'}
        aria-label={maximized ? '还原' : '最大化'}
        onClick={() => void window.api.windowToggleMaximize()}
      >
        {maximized ? <Copy size={13} /> : <Square size={13} />}
      </button>
      <button
        type="button"
        className="wc-close"
        title="关闭"
        aria-label="关闭"
        onClick={() => void window.api.windowClose()}
      >
        <X size={16} />
      </button>
    </div>
  )
}

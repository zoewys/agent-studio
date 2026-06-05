const LAST_PROJECT_PATH_KEY = 'agent-studio:last-project-path'

export function readLastProjectPath(): string {
  try {
    return window.localStorage.getItem(LAST_PROJECT_PATH_KEY) ?? ''
  } catch {
    return ''
  }
}

export function rememberProjectPath(path: string): void {
  const clean = path.trim()
  if (!clean) return
  try {
    window.localStorage.setItem(LAST_PROJECT_PATH_KEY, clean)
  } catch {
    // Ignore storage failures; the picker/input still works normally.
  }
}

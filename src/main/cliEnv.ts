import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'

/**
 * Electron apps often start with a thinner PATH than the user's login shell.
 * Add common user-level package-manager bins so CLI tools installed from npm,
 * pnpm, bun, Homebrew, etc. can be detected and launched consistently.
 */
export function withCliPath(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const home = homedir()
  const candidates = [
    join(home, '.npm-global/bin'),
    join(home, '.npm/bin'),
    join(home, '.local/bin'),
    join(home, '.yarn/bin'),
    join(home, 'Library/pnpm'),
    join(home, '.bun/bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin'
  ]

  const currentPath = env.PATH ?? ''
  const parts = [
    ...candidates.filter((dir) => existsSync(dir)),
    ...currentPath.split(delimiter).filter(Boolean)
  ]

  const seen = new Set<string>()
  const path = parts
    .filter((dir) => {
      if (seen.has(dir)) return false
      seen.add(dir)
      return true
    })
    .join(delimiter)

  return { ...env, PATH: path }
}

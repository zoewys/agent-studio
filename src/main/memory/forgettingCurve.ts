import type { MemoryEntry } from '@shared/types'

const DAY_MS = 1000 * 60 * 60 * 24

export function computeStrength(entry: MemoryEntry, now: number = Date.now()): number {
  const days = Math.max(0, (now - entry.lastReinforcedAt) / DAY_MS)
  const stability = 1 + entry.reinforceCount * 0.5
  const decay = Math.exp(-days / (stability * 7))
  return clamp01(entry.strength * decay)
}

export function filterAlive(
  entries: MemoryEntry[],
  threshold = 0.3,
  now: number = Date.now()
): MemoryEntry[] {
  return entries.filter((entry) => computeStrength(entry, now) >= threshold)
}

export function listExpired(entries: MemoryEntry[], now: number = Date.now()): MemoryEntry[] {
  return entries.filter((entry) => computeStrength(entry, now) < 0.2)
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

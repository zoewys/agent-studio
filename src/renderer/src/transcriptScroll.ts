export interface TranscriptScrollState {
  scrollTop: number
  clientHeight: number
  scrollHeight: number
}

export interface TranscriptEventLike {
  kind: string
  text?: string
}

const BOTTOM_THRESHOLD_PX = 64

export function isNearTranscriptBottom(
  state: TranscriptScrollState,
  thresholdPx = BOTTOM_THRESHOLD_PX
): boolean {
  if (state.scrollHeight <= state.clientHeight) return true

  const distanceFromBottom = state.scrollHeight - state.clientHeight - state.scrollTop
  return distanceFromBottom <= thresholdPx
}

export function isTranscriptUserInput(event: TranscriptEventLike | undefined): boolean {
  return event?.kind === 'system' && typeof event.text === 'string' && event.text.startsWith('↳')
}

export function shouldAutoFollowTranscriptEvent(
  currentAutoFollow: boolean,
  latestEvent: TranscriptEventLike | undefined,
  eventCount: number
): boolean {
  if (isTranscriptUserInput(latestEvent)) return false
  if (eventCount <= 1) return true
  return currentAutoFollow
}

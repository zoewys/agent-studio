import type { AgentEvent } from '@shared/types'

export interface SummarizeOptions {
  maxTokens?: number
}

const DEFAULT_MAX_TOKENS = 3000
const THINKING_CHAR_LIMIT = 500

export function summarizeTranscript(
  events: AgentEvent[],
  options: SummarizeOptions = {}
): string {
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS
  const userInputs: string[] = []
  const thinking: string[] = []
  const toolCalls: string[] = []
  const messages: string[] = []
  const errors: string[] = []

  for (const event of events) {
    switch (event.kind) {
      case 'system':
        if (event.text.startsWith('↳ ')) userInputs.push(event.text)
        break
      case 'thinking':
        thinking.push(event.text)
        break
      case 'tool-call':
        toolCalls.push(event.name)
        break
      case 'message':
        messages.push(event.text)
        break
      case 'error':
        errors.push(event.message)
        break
    }
  }

  const thinkingTail = tailText(thinking.join('\n\n'), THINKING_CHAR_LIMIT)
  const messageText = messages.join('\n\n')

  let result = buildSummary({
    userInput: userInputs.join('\n') || '（无）',
    thinking: thinkingTail || '（无）',
    toolCalls: toolCalls.join(', ') || '（无）',
    output: messageText || '（无）',
    errors: errors.join('\n') || '（无）'
  })

  if (estimateTokens(result) <= maxTokens) return result

  const shortThinking = tailText(thinkingTail, 120) || '（已截断）'
  result = buildSummary({
    userInput: userInputs.join('\n') || '（无）',
    thinking: shortThinking,
    toolCalls: toolCalls.join(', ') || '（无）',
    output: messageText || '（无）',
    errors: errors.join('\n') || '（无）'
  })
  if (estimateTokens(result) <= maxTokens) return result

  const withoutOutput = buildSummary({
    userInput: userInputs.join('\n') || '（无）',
    thinking: shortThinking,
    toolCalls: toolCalls.join(', ') || '（无）',
    output: '',
    errors: errors.join('\n') || '（无）'
  })
  const outputBudget = Math.max(40, maxTokens - estimateTokens(withoutOutput) - 20)
  result = buildSummary({
    userInput: userInputs.join('\n') || '（无）',
    thinking: shortThinking,
    toolCalls: toolCalls.join(', ') || '（无）',
    output: truncateMiddleByTokens(messageText || '（无）', outputBudget),
    errors: errors.join('\n') || '（无）'
  })

  return estimateTokens(result) <= maxTokens
    ? result
    : truncateEndByTokens(result, maxTokens)
}

function buildSummary(parts: {
  userInput: string
  thinking: string
  toolCalls: string
  output: string
  errors: string
}): string {
  return [
    `[用户输入]\n${parts.userInput}`,
    `[Agent 思考]（最后部分）\n${parts.thinking}`,
    `[工具调用]\n${parts.toolCalls}`,
    `[Agent 输出]\n${parts.output || '（已截断）'}`,
    `[错误]\n${parts.errors}`
  ].join('\n\n')
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3)
}

function tailText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return text.slice(-maxChars)
}

function truncateMiddleByTokens(text: string, maxTokens: number): string {
  const maxChars = Math.max(0, maxTokens * 3)
  if (text.length <= maxChars) return text
  if (maxChars <= 24) return text.slice(0, maxChars)
  const marker = '\n...[truncated]...\n'
  const remaining = Math.max(0, maxChars - marker.length)
  const head = Math.ceil(remaining / 2)
  const tail = Math.floor(remaining / 2)
  return `${text.slice(0, head)}${marker}${text.slice(-tail)}`
}

function truncateEndByTokens(text: string, maxTokens: number): string {
  const maxChars = Math.max(0, maxTokens * 3)
  return text.length <= maxChars ? text : text.slice(0, maxChars)
}

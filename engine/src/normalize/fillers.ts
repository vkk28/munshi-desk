import type { Diff } from '../types'

export const fillerPattern = /\b(?:um+|uh+|erm|basically|you know|matlab|like)\b/gi

export function stripFillers(text: string, keepMatlab = false) {
  return text.replace(fillerPattern, match => keepMatlab && match.toLowerCase() === 'matlab' ? match : ' ')
}

export function fillerDiff(text: string): Diff[] {
  const tokens: Diff[] = []
  let end = 0
  for (const match of text.matchAll(fillerPattern)) {
    const index = match.index!
    if (end < index) tokens.push({ type: 'kept', text: text.slice(end, index) })
    tokens.push({ type: 'filler', text: match[0] })
    end = index + match[0].length
  }
  if (end < text.length) tokens.push({ type: 'kept', text: text.slice(end) })
  return tokens
}

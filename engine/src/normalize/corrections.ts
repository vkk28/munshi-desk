import { stripFillers } from './fillers'

const correctionCue = /\b(?:nahi+n?|galat(?:\s+hai)?|make it|i mean|matlab)\b/gi

export function correction(raw: string) {
  for (const match of Array.from(raw.matchAll(correctionCue)).reverse()) {
    const prior = stripFillers(raw.slice(0, match.index)).replace(/[\s,.!?]+$/g, '').trim()
    const replacement = stripFillers(raw.slice(match.index! + match[0].length)).trim()
    if (!/[\p{L}\d]/u.test(replacement)) continue
    if (match[0].toLowerCase() === 'matlab' && !/\d|\b(?:saal|hai|tha)\b/i.test(prior) &&
        !/^(?:(?:\d|ek|do|teen|sau|chaunsath|chausath)\b)/i.test(replacement)) continue
    return { prior, replacement, beforeCue: raw.slice(0, match.index) }
  }
  return null
}

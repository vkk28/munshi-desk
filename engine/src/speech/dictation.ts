import type { Utterance } from '../types'

export const MAX_UTTERANCE_LENGTH = 1500
export const LONG_UTTERANCE_MESSAGE = 'This turn is too long. Send the dictation in shorter turns.'

export function receiveDictationPaste(event: ClipboardEvent, armed: boolean, draft: string): Utterance | undefined {
  if (!armed || draft.trim() || event.defaultPrevented) return
  const target = event.target
  if (!(target instanceof HTMLElement) || target.ownerDocument.activeElement !== target) return
  const text = event.clipboardData?.getData('text/plain').trim()
  if (!text) return
  event.preventDefault()
  return { text, source: 'wispr-flow' }
}

export function normalizeFlowText(text: string) {
  return text.replace(/\r\n?/g, '\n')
    .replace(/[\u00a0\u202f]/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[‐‑–—]/g, match => match === '‐' || match === '‑' ? '-' : ' - ')
    .replace(/^\s*(?:[-*•]\s+|\d{1,2}[.)]\s+)(?=[a-z])/gim, '')
    .replace(/(^|[.!?;,]\s+|\n\s*)(?:i am|i'm|main|mai) ([a-z0-9 ]{1,28}?) (?:years? old|saal(?: (?:ka|ki))?(?: (?:hoon|hun|hu))?)(?=$|[.!?;,\n])/gi, '$1age $2')
}

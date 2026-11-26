import { cleanValue, copyAddress, isQuestion, mapValue, segment } from './mapper/rules'
import { correction } from './normalize/corrections'
import { fillerDiff, stripFillers } from './normalize/fillers'
import { rewriteBhojpuri } from './normalize/lexicon.bho'
import { transliterate } from './normalize/transliterate'
import { keyText } from './semantics'
import type { Session } from './session'
import { isCheckpoint, type Candidate, type Diff, type Field, type Utterance } from './types'
import { redactIds, validate } from './validators'

export type Command = 'read' | 'confirm' | 'no' | 'resume' | 'undo' | 'manual'
export interface Interpretation { command?: Command; candidates: Candidate[]; diff: Diff[]; question?: Field }

const commands: Record<string, Command> = {
  'read back': 'read', 'padho': 'read', 'padh kar sunao': 'read', 'bad ke sunawa': 'read',
  'haan': 'confirm', 'han': 'confirm', 'yes': 'confirm', 'confirm': 'confirm', 'theek hai': 'confirm',
  'nahi': 'no', 'nahin': 'no', 'no': 'no',
  'resume': 'resume', 'aage badho': 'resume', 'aage badhein': 'resume',
  'undo': 'undo', 'pichla hatao': 'undo', 'pichhla hatao': 'undo',
  'otp': 'manual', 'captcha': 'manual', 'enter otp': 'manual', 'otp aa gaya': 'manual',
}

export function interpret(input: Utterance, fields: Field[], values: Record<string, string>, session: Session, now: number): Interpretation {
  const roman = transliterate(input.text)
  const text = rewriteBhojpuri(roman).replace(/[‐‑-](?=[a-z])/gi, ' ').replace(/\b(?:edit|change|set|correct|update)\s+(?:the\s+)?(?=[a-z])/gi, '')
  const clean = (part: string) => stripFillers(part).replace(/[\s,.!?]+/g, ' ').trim()
  const command = commands[keyText(clean(text))]
  if (command) return { command, candidates: [], diff: fillerDiff(roman) }

  const edit = correction(text)
  const candidates: Candidate[] = []
  let question: Field | undefined
  let replaced: { before: string; after: string } | undefined
  const add = (field: Field, raw: string) => {
    const value = cleanValue(raw)
    if (isQuestion(value)) question = field
    else candidates.push({ field, raw: value })
  }

  if (edit) {
    const before = segment(edit.prior, fields)
    const after = segment(edit.replacement, fields)
    const firstKeyword = after[0]?.keyword
    const stop = firstKeyword ? edit.replacement.toLowerCase().indexOf(firstKeyword.toLowerCase()) : edit.replacement.length
    const prefix = edit.replacement.slice(0, stop).replace(/^[\s,.!?:]+|[\s,.!?:]+$/g, '')
    let field = before.at(-1)?.field
    if (prefix && !field) {
      field = session.recentFields(now).map(id => fields.find(item => item.id === id))
        .find(item => {
          if (!item || isCheckpoint(item) || item.semantic === 'free') return false
          const mapped = mapValue(item, prefix)
          return Boolean(mapped.value) && !mapped.issue && !validate(item, mapped.value, new Date(now))
        })
    }
    if (prefix && field) {
      before.filter(item => item.field !== field).forEach(item => add(item.field, item.raw))
      add(field, prefix)
      replaced = { before: before.at(-1)?.raw || values[field.id] || '', after: cleanValue(prefix) }
    } else {
      before.filter(item => item.raw && !after.some(next => next.field === item.field))
        .forEach(item => add(item.field, item.raw))
      const prior = before.at(-1)
      const same = after.find(item => item.field === prior?.field)
      if (prior?.raw && same) replaced = { before: prior.raw, after: same.raw }
    }
    after.forEach(item => add(item.field, item.raw))
  } else {
    segment(stripFillers(text), fields).forEach(item => add(item.field, item.raw))
  }

  if (/\bsame as current\b/i.test(text)) {
    const copies = copyAddress(fields, values)
    for (const item of copies) {
      const existing = candidates.findIndex(candidate => candidate.field.id === item.field.id)
      if (existing >= 0) candidates.splice(existing, 1)
      candidates.push(item)
      if (question === item.field) question = undefined
    }
  }

  if (!candidates.length && !question) {
    const pending = fields.find(field => field.id === session.pending(now))
    if (pending && !isCheckpoint(pending)) {
      const raw = stripFillers(text)
      const mapped = mapValue(pending, raw)
      const noise = /\b(?:chai|rupaye|rupees|fees|bhaiya| cup | weather )\b/i.test(raw)
      if (mapped.value && !noise) add(pending, raw)
    }
  }

  const sensitive = candidates.some(item => item.field.semantic === 'aadhaar') || /\b(?:aadhaar|aadhar|otp|captcha)\b/i.test(text)
  if (sensitive) return { candidates, question, diff: [{ type: 'kept', text: 'Sensitive field utterance hidden.' }] }
  if (!candidates.length && !question) return { candidates, diff: [{ type: 'ignored', text: '[ignored: side-chatter]' }] }
  let diff = fillerDiff(redactIds(roman))
  if (replaced) {
    diff = diff.filter(token => token.type === 'filler')
    if (replaced.before) diff.push({ type: 'replaced', text: redactIds(replaced.before) })
    diff.push({ type: 'replacement', text: redactIds(replaced.after) })
    for (const item of candidates.filter(item => item.raw !== replaced?.after)) {
      diff.push({ type: 'kept', text: `${item.field.label} ${redactIds(item.raw)}` })
    }
  }
  return { candidates, question, diff }
}

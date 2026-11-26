import { aliases, keyText } from '../semantics'
import { formatDate, parseDate } from '../normalize/dates'
import { parseDigits, parseNumber } from '../normalize/numbers'
import type { Candidate, Field, Issue } from '../types'
import { isCheckpoint } from '../types'

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const tidy = (value: string) => value.trim().replace(/^[\s:?,.!=]+|[\s:?,.!=]+$/g, '')
const asTitle = (value: string) => value.replace(/\b[a-z]/gi, letter => letter.toUpperCase())
const optionAlias: Record<string, string> = {
  purush: 'male', aadmi: 'male', mahila: 'female', stree: 'female', anya: 'other', dilli: 'delhi',
  bangalore: 'bengaluru', bengal: 'west bengal', tamilnadu: 'tamil nadu',
}

function cleanup(value: string) {
  return tidy(tidy(value).replace(/^(?:(?:ka|ki|is|hai|ko|se|mein|me|to|mera|meri|my|please|change to|set to)\b[\s,]*)+/i, '')
    .replace(/(?:[\s,.]+(?:hai|tha|thi|saal|baras|karo|kar do|likho|dalo|daalo|aur|and|mera|meri))+(?=$|[,.])/i, ''))
}

function distance(a: string, b: string) {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 0; i < a.length; i++) {
    const next = [i + 1]
    for (let j = 0; j < b.length; j++) {
      next.push(Math.min(next[j] + 1, row[j + 1] + 1, row[j] + Number(a[i] !== b[j])))
    }
    row = next
  }
  return row[b.length]
}

export function mapValue(field: Field, raw: string): { value: string; issue?: Issue } {
  const input = cleanup(raw)
  if (/^(?:clear|hatao|remove)$/i.test(input)) return { value: '' }
  if (field.manualOnly) return { value: '', issue: { code: 'manual', message: 'Fill this field manually.' } }
  if (field.kind === 'checkbox' && !field.options.length) {
    if (/^(?:true|yes|haan|on|same)$/i.test(input)) return { value: 'true' }
    if (/^(?:false|no|nahi|off|different)$/i.test(input)) return { value: 'false' }
    return { value: '', issue: { code: 'choice', message: 'Say yes or no for this field.' } }
  }
  if (field.options.length || field.kind === 'select' || field.kind === 'radio') {
    const normalized = keyText(input)
    const query = optionAlias[normalized] || normalized
    const exact = field.options.find(option => keyText(option) === query)
    if (exact) return { value: exact }
    const candidates = field.options.map(option => {
      const clean = keyText(option)
      return { option, score: 1 - distance(query, clean) / Math.max(query.length, clean.length, 1) }
    }).sort((a, b) => b.score - a.score)
    const [best, next] = candidates
    if (best && best.score >= 0.8 && (!next || best.score - next.score >= 0.1)) return { value: best.option }
    return { value: '', issue: { code: 'choice', message: 'Choose a listed option.', options: candidates.slice(0, 2).map(entry => entry.option) } }
  }
  if (['pincode', 'mobile', 'aadhaar'].includes(field.semantic)) return { value: parseDigits(input) ?? input }
  if (field.semantic === 'age' || field.semantic === 'ward') {
    const value = parseNumber(input)
    return { value: value === undefined ? input : String(value) }
  }
  if (field.kind === 'date' || field.semantic === 'dob' || field.semantic === 'date') {
    const value = parseDate(input, field.dateFormat)
    return { value: value ? formatDate(value, field.dateFormat) : input }
  }
  return { value: ['name', 'father_name', 'district', 'state', 'village'].includes(field.semantic) ? asTitle(input) : input }
}

export function segment(text: string, fields: Field[]) {
  const dictionary = new Map<string, Field>()
  for (const field of fields.filter(field => !isCheckpoint(field))) {
    for (const alias of [...aliases[field.semantic], keyText(field.label), ...field.hints.map(keyText)]) {
      if (alias.length >= 2 && !dictionary.has(alias)) dictionary.set(alias, field)
    }
  }
  if (!dictionary.size) return []
  const keywords = [...dictionary.keys()].sort((a, b) => b.length - a.length)
  const matches = [...text.matchAll(new RegExp(`\\b(${keywords.map(escape).join('|')})\\b`, 'gi'))]
  return matches.flatMap((match, i) => {
    const field = dictionary.get(match[0].toLowerCase())!
    const start = match.index! + match[0].length
    const raw = cleanup(text.slice(start, matches[i + 1]?.index))
    if (field.semantic === 'permanent_address' && matches[i + 1]?.[0].toLowerCase() === 'same as current') return []
    return [{ field, raw, keyword: match[0] }]
  })
}

export function isQuestion(raw: string) {
  return !raw || /^(?:kya(?: hai)?|what(?: is| was)?|kitna|kitni|batao|batayein|please tell)$/i.test(tidy(raw))
}

export function copyAddress(fields: Field[], values: Record<string, string>): Candidate[] {
  const toggle = fields.find(field => field.semantic === 'same_address')
  if (toggle) return [{ field: toggle, raw: 'true', op: 'copy' }]
  const from = fields.find(field => field.semantic === 'address')
  const to = fields.find(field => field.semantic === 'permanent_address')
  return from && to && values[from.id] ? [{ field: to, raw: values[from.id], op: 'copy' }] : []
}

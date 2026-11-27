import { ageAt, parseDate, validDate } from './normalize/dates'
import type { Field, Issue, Schema } from './types'
import { isCheckpoint } from './types'

const multiplication = [
  [0,1,2,3,4,5,6,7,8,9], [1,2,3,4,0,6,7,8,9,5], [2,3,4,0,1,7,8,9,5,6],
  [3,4,0,1,2,8,9,5,6,7], [4,0,1,2,3,9,5,6,7,8], [5,9,8,7,6,0,4,3,2,1],
  [6,5,9,8,7,1,0,4,3,2], [7,6,5,9,8,2,1,0,4,3], [8,7,6,5,9,3,2,1,0,4],
  [9,8,7,6,5,4,3,2,1,0],
]
const permutation = [
  [0,1,2,3,4,5,6,7,8,9], [1,5,7,6,2,8,3,0,9,4], [5,8,0,3,7,9,6,1,4,2],
  [8,9,1,6,0,4,3,5,2,7], [9,4,5,3,1,2,6,8,7,0], [4,2,8,6,5,7,3,9,0,1],
  [2,7,9,3,8,0,6,4,1,5], [7,0,4,6,9,1,3,2,5,8],
]

export function validId(value: string) {
  return /^\d{12}$/.test(value) && [...value].reverse().reduce(
    (checksum, digit, index) => multiplication[checksum][permutation[index % 8][Number(digit)]], 0,
  ) === 0
}

export const maskId = (value: string) => value ? `XXXX-XXXX-${value.length >= 4 ? value.slice(-4) : 'XXXX'}` : ''
export const redactIds = (text: string) =>
  text.replace(/(?<!\d)\d(?:[ -]*\d){11}(?!\d)/g, match => maskId(match.replace(/\D/g, '')))

export function hasValue(field: Field, value: string | undefined) {
  return field.kind === 'checkbox' ? Boolean(value && value !== 'false') : Boolean(value?.trim())
}

export function validate(field: Field, value: string, today: Date): Issue | undefined {
  if (isCheckpoint(field) || !value) return
  let message: string | undefined
  if (field.maxLength && value.length > field.maxLength) message = `Use at most ${field.maxLength} characters.`
  else if (field.semantic === 'pincode' && !/^[1-9]\d{5}$/.test(value)) message = 'Enter a six-digit PIN code.'
  else if (field.semantic === 'mobile' && !/^[6-9]\d{9}$/.test(value)) message = 'Enter a ten-digit mobile number starting with 6–9.'
  else if (field.semantic === 'age' && (!/^\d+$/.test(value) || Number(value) > 120)) message = 'Enter a whole age between 0 and 120.'
  else if (field.semantic === 'aadhaar' && !validId(value)) message = 'Check the 12-digit ID checksum.'
  else if (field.kind === 'date' || field.semantic === 'dob' || field.semantic === 'date') {
    const date = parseDate(value, field.dateFormat)
    if (!date || !validDate(date, today) || (field.semantic === 'dob' && ageAt(date, today) > 120)) {
      message = 'Check the calendar date. It must be in the past or today.'
    }
  }
  if (message) return { code: 'invalid', message }
}

// Representative postal regions in the practice forms. Unlisted prefixes are left unchecked.
const regions: Record<string, { state: string; district: string }> = {
  '800': { state: 'Bihar', district: 'Patna' },
  '110': { state: 'Delhi', district: '' },
  '400': { state: 'Maharashtra', district: '' },
  '560': { state: 'Karnataka', district: 'Bengaluru' },
  '600': { state: 'Tamil Nadu', district: 'Chennai' },
  '700': { state: 'West Bengal', district: 'Kolkata' },
  '226': { state: 'Uttar Pradesh', district: 'Lucknow' },
}

export function crossValidate(schema: Schema, values: Record<string, string>, today: Date) {
  const issues: Record<string, Issue> = {}
  const fieldOf = (semantic: Field['semantic']) => schema.fields.find(field => field.semantic === semantic && values[field.id] && !validate(field, values[field.id], today))
  const flag = (a: Field, b: Field, message: string) => {
    for (const field of [a, b]) {
      issues[field.id] = { code: 'mismatch', message }
    }
  }
  const birth = fieldOf('dob')
  const age = fieldOf('age')
  if (birth && age) {
    const date = parseDate(values[birth.id], birth.dateFormat)!
    const expectedAge = ageAt(date, today)
    if (expectedAge !== Number(values[age.id])) {
      flag(birth, age, `This birth date gives an age of ${expectedAge} today. Check the age and birth date with the applicant.`)
    }
  }
  const pin = fieldOf('pincode')
  const region = pin && regions[values[pin.id].slice(0, 3)]
  if (pin && region) {
    for (const kind of ['state', 'district'] as const) {
      const field = fieldOf(kind)
      if (field && region[kind] && region[kind].toLowerCase() !== values[field.id].trim().toLowerCase()) {
        flag(pin, field, kind === 'state' ? 'PIN code and state do not match.' : 'PIN code and district do not match.')
      }
    }
  }
  return issues
}

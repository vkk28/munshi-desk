import { transliterate } from './normalize/transliterate'
import type { Semantic } from './types'

export const aliases: Record<Semantic, string[]> = {
  name: ['full name', 'applicant name', 'applicant', 'naam', 'name'],
  father_name: ["father's name", 'father name', 'pita ka naam', 'babuji ka naam', 'pita', 'father'],
  age: ['age in years', 'age', 'umar', 'umr'],
  dob: ['date of birth', 'birth date', 'janm tithi', 'janm tarikh', 'paidaish', 'dob'],
  date: ['incident date', 'date of incident', 'ghatna ki tarikh', 'tarikh', 'date'],
  pincode: ['postal code', 'pin code', 'pincode', 'pin'],
  mobile: ['mobile number', 'phone number', 'mobile', 'phone', 'contact number'],
  aadhaar: ['aadhaar number', 'aadhar number', 'aadhaar', 'aadhar', '12 digit id', 'identity number'],
  address: ['current address', 'present address', 'residential address', 'local address', 'address', 'pata'],
  permanent_address: ['permanent address', 'sthayee pata', 'sthaayi pata'],
  same_address: ['same as current', 'same address', 'pata wahi'],
  district: ['district', 'zila', 'jila'],
  state: ['state', 'rajya'],
  village: ['village', 'gaon', 'gaam'],
  gender: ['gender', 'sex', 'ling'],
  description: ['issue description', 'description', 'complaint', 'grievance details', 'shikayat', 'samasya'],
  ward: ['ward number', 'ward'],
  otp: ['one time password', 'one time code', 'verification code', 'otp', 'security code'],
  captcha: ['captcha', 'image verification', 'characters shown', 'image code'],
  free: [],
}

export function keyText(value: string) {
  return transliterate(value).replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
    .replace(/[^a-z0-9']+/g, ' ').trim()
}

export function identify(label: string, hints: string[]): Semantic {
  const text = [label, ...hints].map(keyText)
  const matches = (semantic: Semantic) => aliases[semantic].some(alias => text.some(value => ` ${value} `.includes(` ${alias} `)))
  const priorities: Semantic[] = ['captcha', 'otp', 'same_address', 'father_name', 'permanent_address',
    'dob', 'aadhaar', 'pincode', 'mobile', 'district', 'state', 'village', 'gender',
    'description', 'ward', 'date', 'age', 'address', 'name']
  return priorities.find(matches) || 'free'
}

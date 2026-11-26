import { parseDate } from './normalize/dates'
import type { Field, Language, Semantic } from './types'
import { isCheckpoint } from './types'
import { hasValue, redactIds } from './validators'

const hindi: Partial<Record<Semantic, string>> = {
  name: 'आवेदक का नाम', father_name: 'पिता का नाम', age: 'उम्र', dob: 'जन्म की तारीख', date: 'तारीख',
  pincode: 'पिन कोड', mobile: 'मोबाइल नंबर', aadhaar: 'पहचान संख्या के आखिरी चार अंक',
  address: 'वर्तमान पता', permanent_address: 'स्थायी पता', same_address: 'दोनों पते एक ही हैं',
  district: 'जिला', state: 'राज्य', village: 'गाँव', gender: 'लिंग', description: 'शिकायत',
  ward: 'वार्ड',
}
const digits = ['शून्य', 'एक', 'दो', 'तीन', 'चार', 'पाँच', 'छह', 'सात', 'आठ', 'नौ']
const hindiDigits = (value: string) => value.replace(/[0-9]/g, digit => '०१२३४५६७८९'[Number(digit)])
const critical = new Set<Semantic>(['name', 'age', 'dob', 'pincode', 'aadhaar', 'mobile', 'address', 'permanent_address', 'same_address', 'description'])

export const speechLocale = (language: Language) => language === 'hinglish' ? 'en-IN' : 'hi-IN'

export const phrase = (language: Language, key: 'manual' | 'issue' | 'which' | 'intro' | 'confirm') => ({
  hi: {
    manual: 'कृपया सत्यापन का कोड हाथ से भरें। फिर कहें, आगे बढ़ो।',
    issue: 'कुछ जानकारी जाँचनी बाकी है। कृपया पीले निशान वाले खाने देखें।',
    which: 'कौन सी जानकारी बदलनी है?', intro: 'ज़रा सुनकर जाँचिए।', confirm: 'सब सही है तो हाँ कहिए।',
  },
  bho: {
    manual: 'कोड हाथ से भरीं। फेर कहीं, आगे बढ़ो।',
    issue: 'पीयर निशान वाला जानकारी जाँच लीं।',
    which: 'कवन जानकारी बदलीं?', intro: 'सुन के जाँच लीं।', confirm: 'सही बा त हाँ कहीं।',
  },
  hinglish: {
    manual: 'Type the verification code, then say aage badho or resume.',
    issue: 'Please check the fields marked in amber.',
    which: 'Which field should I change?', intro: 'Please listen and check.', confirm: 'If it is correct, say haan.',
  },
}[language][key])

export function readBack(fields: Field[], values: Record<string, string>, language: Language, only?: string[]) {
  const lines: string[] = []
  for (const field of fields) {
    const value = values[field.id]
    if (isCheckpoint(field) || !hasValue(field, value) ||
        (only ? !only.includes(field.id) : !field.required && !critical.has(field.semantic))) continue
    const english = language === 'hinglish'
    let spoken = redactIds(value)
    if (field.kind === 'checkbox' && !field.options.length) spoken = english ? 'yes' : 'हाँ'
    if (['pincode', 'mobile', 'aadhaar'].includes(field.semantic)) {
      const shown = field.semantic === 'aadhaar' ? value.slice(-4) : value
      spoken = [...shown].map(digit => english ? digit : digits[Number(digit)]).join(' ')
    } else if (field.semantic === 'dob' || field.kind === 'date') {
      const date = parseDate(value, field.dateFormat)
      if (date) spoken = new Date(date.year, date.month - 1, date.day).toLocaleDateString(speechLocale(language), {
        day: 'numeric', month: 'long', year: 'numeric',
      })
    }
    const label = english ? field.semantic === 'aadhaar' ? 'ID ending in' : field.label : hindi[field.semantic] || field.label
    if (!english) spoken = hindiDigits(spoken)
    lines.push(`${label}, ${spoken}`)
  }
  return lines
}

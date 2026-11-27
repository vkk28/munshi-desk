import type { FieldView } from './controller'
import { parseDate } from './normalize/dates'
import { parseDigits, parseNumber } from './normalize/numbers'
import type { Field, Language, Semantic } from './types'

const questions: Partial<Record<Semantic, Record<Language, string>>> = {
  name: { hi: 'आपका पूरा नाम क्या है?', bho: 'रउआ के पूरा नाम का ह?', hinglish: 'What is your full name?' },
  father_name: { hi: 'आपके पिता का पूरा नाम क्या है?', bho: 'रउआ के बाबूजी के पूरा नाम का ह?', hinglish: 'What is your father’s full name?' },
  age: { hi: 'आपकी उम्र कितने साल है?', bho: 'रउआ के उमिर कतना बरिस बा?', hinglish: 'How old are you in completed years?' },
  dob: { hi: 'आपकी जन्म तारीख क्या है?', bho: 'रउआ के जनम के तारीख का ह?', hinglish: 'What is your date of birth?' },
  date: { hi: 'घटना किस तारीख को हुई?', bho: 'घटना कवन तारीख के भइल?', hinglish: 'On what date did it happen?' },
  pincode: { hi: 'आपके पते का छह अंकों वाला पिन कोड क्या है?', bho: 'रउआ के पता के छव अंक वाला पिन कोड का ह?', hinglish: 'What is the six-digit postal PIN for your address?' },
  mobile: { hi: 'आपका मोबाइल नंबर क्या है?', bho: 'रउआ के मोबाइल नंबर का ह?', hinglish: 'What is your mobile number?' },
  address: { hi: 'अभी आप किस पते पर रहते हैं?', bho: 'अभी रउआ कवन पता पर रहेलीं?', hinglish: 'What is your current address?' },
  permanent_address: { hi: 'आपका स्थायी पता क्या है?', bho: 'रउआ के स्थायी पता का ह?', hinglish: 'What is your permanent address?' },
  district: { hi: 'आपका जिला कौन सा है?', bho: 'रउआ के जिला कवन ह?', hinglish: 'Which district do you live in?' },
  state: { hi: 'आप किस राज्य में रहते हैं?', bho: 'रउआ कवन राज्य में रहेलीं?', hinglish: 'Which state do you live in?' },
  village: { hi: 'आपके गाँव का नाम क्या है?', bho: 'रउआ के गाँव के नाव का ह?', hinglish: 'What is the name of your village?' },
  gender: { hi: 'फ़ॉर्म पर कौन सा लिंग दर्ज करें?', bho: 'फारम पर कवन लिंग लिखीं?', hinglish: 'Which gender should we enter on the form?' },
  description: { hi: 'आपको क्या समस्या हो रही है?', bho: 'रउआ के का दिक्कत बा?', hinglish: 'What problem would you like to report?' },
  ward: { hi: 'आपका वार्ड नंबर क्या है?', bho: 'रउआ के वार्ड नंबर का ह?', hinglish: 'What is your ward number?' },
}

export function nextInterviewQuestion(rows: FieldView[], language: Language) {
  const eligible = rows.filter(({ field, issue }) =>
    field.writable && !field.manualOnly && issue?.code !== 'manual' && questions[field.semantic])
  const row = eligible.find(row => row.issue) || eligible.find(row => row.field.required && !row.filled)
  if (row) return { fieldId: row.field.id, text: questions[row.field.semantic]![language] }
}

// A field-less reply has less context than an explicitly labelled dictation.
export function matchesInterviewAnswer(field: Field, answer: string) {
  if (!answer || /\?|\b(?:otp|captcha|password|passcode|verification code|security code|one time|aadhaar|aadhar|clear|remove|delete|cancel|stop|skip|repeat|submit|reset|undo|read back|send|hatao|ruko|dobara|pata nahi|don't know|do not know|chai|rupees|rupaye|bhaiya|weather)\b/i.test(answer)) return false
  const digits = parseDigits(answer)
  if (digits?.length === 12 || /(?:\d[ -]*){12}/.test(answer)) return false
  switch (field.semantic) {
    case 'pincode':
    case 'mobile': return digits !== undefined
    case 'age':
    case 'ward': return parseNumber(answer) !== undefined
    case 'dob':
    case 'date': return parseDate(answer, field.dateFormat) !== undefined
    case 'name':
    case 'father_name':
    case 'village':
    case 'district':
    case 'state':
    case 'gender': return !digits && /^[\p{L}\p{M} .'’-]+$/u.test(answer)
    case 'address':
    case 'permanent_address':
    case 'description': return !digits && /\p{L}/u.test(answer)
    default: return false
  }
}

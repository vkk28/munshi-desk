import { describe, expect, it } from 'vitest'
import { mapValue } from '../engine/src/mapper/rules'
import {
  ageAt, crossValidate, formatDate, interpret, maskId, parseDate, parseDigits, parseNumber, readBack, Session,
  transition, transliterate, validDate, validId, validate, type Field, type Semantic,
} from '@munshi/engine'

const today = new Date(2026, 10, 27)
const now = today.getTime()
const field = (id: Semantic, label = id as string): Field => ({
  id, kind: 'text', label, semantic: id, hints: [], options: [], writable: true, required: true,
})
const fields = [field('name'), field('age'), field('pincode', 'PIN code'), field('dob')]
const say = (text: string, values: Record<string, string> = {}, session = new Session(), time = now) =>
  interpret({ text }, fields, values, session, time)

describe('normalization and intent', () => {
  it('normalizes Hindi script, digits and loanwords', () => {
    expect(transliterate('पिनकोड गलत है ८००००१ करो।')).toBe('pincode galat hai 800001 karo.')
    expect(transliterate('नाम रामधारी यादव उम्र चौंसठ')).toBe('naam ramdhari yadav umar chaunsath')
    expect(transliterate('परमानेंट एड्रेस सेम ऐज करंट')).toBe('permanent address same as current')
    expect(transliterate('आगे बढ़ो')).toBe('aage badho')
  })
  it.each([
    ['chausath', 64], ['chaunsath', 64], ['basath', 62], ['unees', 19], ['pandra', 15],
    ['dedh sau', 150], ['dhai hazaar', 2500], ['paune teen hazaar', 2750], ['sawa lakh', undefined],
    ['sawa ek lakh', 125000], ['unnis sau baasath', 1962], ['do chai', undefined],
  ])('parses %s as %s', (spoken, expected) => expect(parseNumber(spoken)).toBe(expected))
  it('keeps digit strings including leading zeroes and repeated digits', () => {
    expect(parseDigits('aath zero zero zero zero ek')).toBe('800001')
    expect(parseDigits('aath triple zero zero ek')).toBe('800001')
    expect(parseDigits('double zero')).toBe('00')
    expect(parseDigits('012345')).toBe('012345')
  })
  it('parses spoken and formatted dates with strict calendar validation', () => {
    const parsed = parseDate('pandrah August unnis sau baasath')!
    expect(formatDate(parsed)).toBe('15/08/1962')
    expect(formatDate(parsed, 'YYYY-MM-DD')).toBe('1962-08-15')
    expect(formatDate(parsed, 'MM/DD/YYYY')).toBe('08/15/1962')
    expect(parseDate('02/03/2000', 'MM/DD/YYYY')).toEqual({ year: 2000, month: 2, day: 3 })
    expect(validDate(parseDate('29/02/2024')!, today)).toBe(true)
    expect(validDate(parseDate('29/02/2025')!, today)).toBe(false)
    expect(validDate(parseDate('27/11/2027')!, today)).toBe(false)
    expect(ageAt(parsed, today)).toBe(64)
  })
  it.each([
    'fifteenth of August nineteen sixty-two', '15th August 1962', 'August fifteenth, nineteen sixty two',
    'the fifteenth of August nineteen hundred and sixty-two',
  ])('understands the spoken birth date %s', spoken => {
    expect(parseDate(spoken)).toEqual({ day: 15, month: 8, year: 1962 })
  })
  it('parses compound days and preserves ambiguous dates for review', () => {
    expect(parseDate('August twenty first two thousand and one')).toEqual({ day: 21, month: 8, year: 2001 })
    expect(parseDate('August first nineteen oh eight')).toEqual({ day: 1, month: 8, year: 1908 })
    expect(parseDate('first of August sixty two')).toBeUndefined()
    expect(parseDate('fifteen August nineteen sixty two or sixty three')).toBeUndefined()
    expect(parseDate('-2 August 1962')).toBeUndefined()
  })
  it.each([
    'मेरा नाम रामधारी यादव है। मैं चौंसठ साल का हूँ। मेरा जन्म पंद्रह अगस्त उन्नीस सौ बासठ को हुआ था। मेरा पिन कोड आठ डबल जीरो डबल जीरो एक है।',
    'Mera naam Ramdhari Yadav hai aur main chaunsath saal ka hoon. Meri janam ki tareekh pandrah August unnis sau baasath hai, aur mera pin code aath double zero double zero ek hai.',
    'My name is Ramdhari Yadav and I am sixty-four years old. I was born on the fifteenth of August nineteen sixty-two. My PIN code is eight double zero double zero one.',
  ])('fills the required pension details from a full introduction', introduction => {
    const { candidates } = say(introduction)
    expect(Object.fromEntries(candidates.map(({ field, raw }) => [field.id, mapValue(field, raw).value])))
      .toEqual({ name: 'Ramdhari Yadav', age: '64', dob: '15/08/1962', pincode: '800001' })
  })
  it.each([
    'Name Ramdhari Yadav, OTP 123456',
    'Name Ramdhari Yadav, 123456 is the verification code',
    'नाम रामधारी यादव, ओ टी पी एक दो तीन चार पांच छह',
    'My one-time password is 123456. Name Ramdhari Yadav',
    'Captcha 123456',
  ])('keeps a mixed security-code turn out of fields and transcript', text => {
    const session = new Session()
    session.ask('name', now)
    const result = say(text, {}, session)
    expect(result.command).toBe('manual')
    expect(result.candidates).toEqual([])
    expect(result.diff).toEqual([{ type: 'kept', text: 'Enter the verification code on the form.' }])
  })
  it('resolves inline correction ahead of filler cleanup', () => {
    const result = say('Naam Ramdhari Yadav, umar 62... um, nahi, 64')
    expect(result.candidates.map(candidate => candidate.raw)).toEqual(['Ramdhari Yadav', '64'])
    expect(result.diff).toEqual(expect.arrayContaining([
      { type: 'filler', text: 'um' }, { type: 'replaced', text: '62' }, { type: 'replacement', text: '64' },
    ]))
    expect(say('umar 62 matlab 64').candidates[0].raw).toBe('64')
    expect(say('matlab naam Ramdhari').candidates[0].raw).toBe('Ramdhari')
    expect(say('पिनकोड गलत है ८००००१ करो').candidates[0].raw).toBe('800001')
  })
  it('binds cross-chunk correction only within its time window', () => {
    const session = new Session()
    session.record([], {}, ['age'], now)
    const result = say('um nahi 64', { age: '62' }, session, now + 1000)
    expect(result.candidates[0].field.id).toBe('age')
    expect(result.candidates[0].raw).toBe('64')
    expect(say('um nahi 64', {}, session, now + 25_000).candidates).toEqual([])
  })
  it('binds operator questions and ignores desk chatter', () => {
    const session = new Session()
    expect(say('Pincode kya hai?', {}, session).question?.id).toBe('pincode')
    session.ask('pincode', now)
    expect(say('chai le aao bhaiya', {}, session).diff[0].type).toBe('ignored')
    expect(say('800001', {}, session, now + 1000).candidates[0].raw).toBe('800001')
    expect(say('800001', {}, session, now + 11_000).candidates).toEqual([])
    expect(say('Hamaar naam Ramdhari Yadav ba, umar chausath saal ba').candidates.map(candidate => candidate.raw))
      .toEqual(['Ramdhari Yadav', 'chausath'])
  })
})

describe('validation and confirmation', () => {
  it('validates PIN, mobile, age, and DOB', () => {
    for (const bad of ['80001', '012345']) expect(validate(field('pincode'), bad, today)?.code).toBe('invalid')
    expect(validate(field('pincode'), '800001', today)).toBeUndefined()
    expect(validate(field('mobile'), '5123456789', today)?.code).toBe('invalid')
    expect(validate(field('age'), '-5', today)?.code).toBe('invalid')
    expect(validate(field('dob'), '01/01/1800', today)?.code).toBe('invalid')
  })
  it('validates synthetic checksummed IDs and masks what gets read back', () => {
    const syntheticStem = ['3141', '5926', '535'].join('')
    const good = Array.from({ length: 10 }, (_, digit) => syntheticStem + digit).find(validId)!
    const bad = good.slice(0, -1) + ((Number(good.slice(-1)) + 1) % 10)
    expect(good).toHaveLength(12)
    expect(validId(bad)).toBe(false)
    expect(maskId(good)).toBe('XXXX-XXXX-' + good.slice(-4))
    const lines = readBack([field('aadhaar'), field('otp')], { aadhaar: good, otp: 'never-read-this' }, 'hinglish')
    expect(lines).toEqual(['ID ending in, ' + [...good.slice(-4)].join(' ')])
  })
  it('flags both fields in related mismatches and leaves unknown postal prefixes unchecked', () => {
    const schema = { formId: 'test', fields: [...fields, field('state'), field('district')] }
    const mismatched = { age: '64', dob: '15/08/1980', pincode: '800001', state: 'Tamil Nadu', district: 'Patna' }
    expect(Object.keys(crossValidate(schema, mismatched, today)).sort()).toEqual(['age', 'dob', 'pincode', 'state'])
    expect(crossValidate(schema, { ...mismatched, dob: '15/08/1962', pincode: '123456' }, today)).toEqual({})
    expect(Object.keys(crossValidate(schema, { dob: '28/11/1962', age: '64' }, today)).sort()).toEqual(['age', 'dob'])
    expect(crossValidate(schema, { dob: '27/11/1962', age: '64' }, today)).toEqual({})
  })
  it('requires a finished read-back and a clear form before confirming', () => {
    expect(transition('LISTENING', 'READ_BACK', { clear: false })).toBe('LISTENING')
    expect(transition('VERIFYING', 'CONFIRM', { clear: true, completed: false })).toBe('VERIFYING')
    expect(transition('VERIFYING', 'CONFIRM', { clear: true, completed: true })).toBe('READY')
    expect(transition('READY', 'EDIT')).toBe('LISTENING')
  })
})

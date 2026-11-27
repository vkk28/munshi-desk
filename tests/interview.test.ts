// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { DeskController, type Language, type Speaker } from '@munshi/engine'

const form = '<label>Full name<input name="name" required></label><label>Age<input name="age" required></label><label>PIN code<input name="pin" required></label><label>Verification code<input name="otp" required></label>'
const input = (name: string) => document.querySelector<HTMLInputElement>(`[name="${name}"]`)!
let desk: DeskController

function mount(language: Language = 'hinglish', speaker: Speaker = { muted: false, speak: vi.fn(async () => false), cancel: vi.fn() }, content = form) {
  document.body.innerHTML = '<form>' + content + '</form>'
  desk = new DeskController(document, { speaker, holdIdle: true, onChange: () => {} })
  desk.setLanguage(language)
  return speaker
}

afterEach(() => {
  desk.dispose()
  document.body.replaceChildren()
  vi.useRealTimers()
})

it.each([
  ['hinglish', 'What is your full name?', 'Meera Devi', 'Meera Devi'],
  ['hi', 'आपका पूरा नाम क्या है?', 'रामधारी यादव', 'Ramdhari Yadav'],
  ['bho', 'रउआ के पूरा नाम का ह?', 'Ramdhari Yadav ba', 'Ramdhari Yadav'],
] as const)('asks in %s and binds a bare name to the requested field', (language, text, reply, name) => {
  const speaker = mount(language)
  desk.askNextQuestion()
  expect(desk.view.interview?.text).toBe(text)
  expect(speaker.speak).toHaveBeenCalledWith([text], language === 'hinglish' ? 'en-IN' : 'hi-IN')
  desk.ingest({ text: reply })
  expect(input('name').value).toBe(name)
  expect(desk.view.interview).toBeUndefined()
  desk.askNextQuestion()
  desk.ingest({ text: 'चौंसठ' })
  expect(input('age').value).toBe('64')
  desk.askNextQuestion()
  desk.ingest({ text: 'aath double zero double zero ek' })
  expect(input('pin').value).toBe('800001')
  expect(desk.view.phase).toBe('PAUSED_MANUAL')
  desk.askNextQuestion()
  expect(desk.view.interview).toBeUndefined()
  expect(input('otp').value).toBe('')
})

it('prioritizes a flagged field over missing required entries and keeps validation intact', () => {
  mount()
  desk.ingest({ text: 'PIN code 80001' })
  desk.askNextQuestion()
  expect(desk.view.interview?.text).toMatch(/postal PIN/)
  desk.ingest({ text: '800002', confidence: 0.55 })
  expect(input('pin').value).toBe('')
  expect(desk.view.fields.find(row => row.field.semantic === 'pincode')?.issue?.code).toBe('confidence')
  desk.askNextQuestion()
  desk.ingest({ text: '800001' })
  expect(input('pin').value).toBe('800001')
  desk.askNextQuestion()
  expect(desk.view.interview?.text).toMatch(/full name/)
})

it('keeps the question through long spoken prompts and repeated plays, then discards it on dismissal', () => {
  vi.useFakeTimers()
  const speaker = { muted: true, speak: vi.fn(async () => true), cancel: vi.fn() }
  mount('hinglish', speaker)
  desk.askNextQuestion()
  desk.ingest({ text: 'someone else', source: 'browser-mic' })
  vi.advanceTimersByTime(30_000)
  desk.askNextQuestion()
  expect(speaker.speak).toHaveBeenCalledTimes(2)
  speaker.muted = false
  vi.advanceTimersByTime(30_000)
  desk.ingest({ text: desk.view.interview!.text, source: 'browser-mic' })
  expect(input('name').value).toBe('')
  desk.ingest({ text: 'Meera Devi', source: 'browser-mic' })
  expect(input('name').value).toBe('Meera Devi')
  desk.askNextQuestion()
  desk.dismissInterview()
  desk.ingest({ text: 'sixty four' })
  expect(input('age').value).toBe('')
})

it('ignores bare credentials, operational commands and other nonanswers while a name is requested', () => {
  mount()
  desk.askNextQuestion()
  for (const text of ['Haan', 'OTP 246810', 'password is secret', '246810', '1234-5678-9012', 'clear', 'submit', 'chai le aao bhaiya']) {
    desk.ingest({ text })
    expect(input('name').value).toBe('')
  }
  expect(input('otp').value).toBe('')
})

it('drops old questions on manual edits and language changes and leaves verification-only forms alone', () => {
  mount()
  desk.askNextQuestion()
  desk.setLanguage('bho')
  expect(desk.view.interview).toBeUndefined()
  desk.askNextQuestion()
  input('name').value = 'Rekha'
  input('name').dispatchEvent(new Event('input', { bubbles: true }))
  expect(desk.view.interview).toBeUndefined()
  desk.dispose()
  mount('hi', undefined, '<label>CAPTCHA<input required></label><label>Date of birth<input required data-munshi-manual></label><label>12-digit ID<input required></label>')
  desk.askNextQuestion()
  expect(desk.view.interview).toBeUndefined()
})

// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DeskController, Filler, Scanner, type Speaker } from '@munshi/engine'
import { PracticeForm, practiceCode, type Portal } from '../web/src/portals/PracticeForm'
import { playScenario, scenarios } from '../web/src/samples/scenarios'

class Voice implements Speaker {
  muted = false
  calls: string[][] = []
  release?: () => void
  deferred = false
  speak(lines: string[], _locale: string, onLine?: (line: string) => void) {
    this.calls.push(lines)
    onLine?.(lines[0])
    if (!this.deferred) return Promise.resolve()
    return new Promise<void>(resolve => { this.release = resolve })
  }
  cancel() { this.release?.() }
}

let root: Root | undefined
let controller: DeskController | undefined
const voice = new Voice()
const testGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
const submitButton = () => document.querySelector<HTMLButtonElement>('button[type=submit]')!
const input = (name: string) => document.querySelector<HTMLInputElement>(`[name="${name}"]`)!
const manual = (name: string, value: string) => {
  input(name).value = value
  input(name).dispatchEvent(new Event('input', { bubbles: true }))
}
const attempt = () => document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))

beforeEach(() => { testGlobal.IS_REACT_ACT_ENVIRONMENT = true })
afterEach(() => {
  controller?.dispose()
  controller = undefined
  act(() => root?.unmount())
  root = undefined
  document.body.replaceChildren()
  voice.calls = []
  voice.release = undefined
  voice.deferred = false
  delete testGlobal.IS_REACT_ACT_ENVIRONMENT
})

async function mount(portal: Portal) {
  const container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(() => root!.render(<PracticeForm portal={portal} locked />))
  let submits = 0
  document.querySelector('form')!.addEventListener('submit', () => submits++)
  const desk = new DeskController(container, {
    speaker: voice, onChange: () => {}, holdIdle: true, now: () => new Date(), onSubmit: () => {},
  })
  controller = desk
  const say = async (text: string, confidence?: number) => { await act(() => desk.ingest({ text, confidence })) }
  const code = () => manual(portal === 'grievance' ? 'captcha' : 'otp', practiceCode)
  return { desk, say, code, submits: () => submits }
}

const age = () => new Date().getFullYear() - 1962 - Number(new Date().getMonth() < 7 || (new Date().getMonth() === 7 && new Date().getDate() < 15))

describe('practice forms', () => {
  it('runs the complete pension flow, reads back only the correction, and wipes on submit', async () => {
    const { desk, say, code, submits } = await mount('pension')
    expect(submitButton().disabled).toBe(true)
    expect(attempt()).toBe(false)
    await say(`Um, naam Ramdhari Yadav, umar ${age() - 2}`)
    await say(`um nahi ${age()}`)
    expect(input('age').value).toBe(String(age()))
    expect(desk.view.diff.some(token => token.type === 'replacement')).toBe(true)
    await say('Current address Gandhi Maidan, permanent address same as current')
    expect(input('sameAddress').checked).toBe(true)
    await say('Janm tithi pandrah August unnis sau baasath, pincode 800001, gender mahila')
    expect(document.querySelector<HTMLInputElement>('input[value="Female"]')!.checked).toBe(true)
    expect(desk.view.phase).toBe('PAUSED_MANUAL')
    await say('OTP 246810')
    expect(input('otp').value).toBe('')
    await say('Aage badho')
    expect(desk.view.phase).toBe('PAUSED_MANUAL')
    manual('otp', '111111')
    await say('Aage badho')
    expect(desk.view.phase).toBe('PAUSED_MANUAL')
    code()
    await say('Aage badho')
    expect(desk.view.phase).toBe('LISTENING')
    await desk.verify()
    expect(desk.view.completed).toBe(true)
    const before = voice.calls.length
    await say('Nahi, pincode 800002')
    expect(voice.calls).toHaveLength(before + 1)
    expect(voice.calls.at(-1)).toHaveLength(2)
    expect(desk.view.fields.find(item => item.field.semantic === 'pincode')?.value).toBe('800002')
    await say('Haan')
    expect(desk.view.phase).toBe('READY')
    expect(submitButton().disabled).toBe(false)
    attempt()
    expect(submits()).toBe(1)
    await Promise.resolve()
    expect(desk.view).toMatchObject({ phase: 'IDLE', diff: [], locked: true })
  })

  it('stages invalid and low-confidence values and blocks early confirmation', async () => {
    const { desk, say, code } = await mount('pension')
    await say('Name Meera Devi', .52)
    expect(input('applicantName').value).toBe('')
    const name = desk.view.fields.find(item => item.field.semantic === 'name')!
    expect(name.issue).toMatchObject({ code: 'confidence', proposed: 'Meera Devi' })
    await act(() => desk.accept(name.field.id))
    await say('Pincode 80001')
    expect(input('pincode').value).toBe('')
    await say(`Janm tithi pandrah August unnis sau assi, umar ${age()}`)
    await say('Haan')
    await desk.verify()
    expect(desk.view.phase).toBe('LISTENING')
    expect(desk.view.fields.filter(item => item.issue)).toHaveLength(3)
    expect(attempt()).toBe(false)
    await say('पिनकोड गलत है ८००००१ करो', 0)
    expect(input('pincode').value).toBe('800001')
    await say('Janm tithi pandrah August unnis sau baasath')
    code()
    await say('Resume')
    voice.deferred = true
    const read = desk.verify()
    await say('Haan')
    expect(desk.view.phase).toBe('VERIFYING')
    expect(desk.view.note).toBe('Wait for read-back to finish.')
    voice.release?.()
    await read
    await say('Haan')
    expect(desk.view.phase).toBe('READY')
    manual('pincode', '800002')
    expect(desk.view.phase).toBe('LISTENING')
    expect(attempt()).toBe(false)
  })

  it('fills React-controlled domicile fields, toggles same address, handles choices, and undoes exact values', async () => {
    const { desk, say, code } = await mount('domicile')
    await say('Naam Meera Devi, current address Gandhi Maidan, state bihar')
    await say('Permanent address same as current')
    expect(input('legalName').value).toBe('Meera Devi')
    expect(input('permanentAddress').value).toBe('Gandhi Maidan')
    await say('undo')
    expect(input('sameAddress').checked).toBe(false)
    expect(input('permanentAddress').value).toBe('')
    await say('State zzzyyy')
    expect(desk.view.fields.find(item => item.field.semantic === 'state')?.issue?.options).toHaveLength(2)
    await say('State Bihar, pincode 800001')
    code()
    await say('Aage badho')
    await desk.verify()
    await say('Haan')
    expect(desk.view.phase).toBe('READY')
  })

  it('requires a manual entry for a custom incident widget and pauses at CAPTCHA', async () => {
    const { desk, say, code } = await mount('grievance')
    await say('Incident date 2024-03-15')
    expect(desk.view.fields.find(item => item.field.semantic === 'date')?.issue?.code).toBe('manual')
    await say('Ward 12, description Broken street light near the school')
    expect(input('description').value).toBe('Broken street light near the school')
    manual('incidentDate', '2024-03-15')
    expect(desk.view.phase).toBe('PAUSED_MANUAL')
    code()
    await say('Aage badho')
    await desk.verify()
    await say('Haan')
    expect(desk.view.phase).toBe('READY')
  })

  it('discovers mixed labels and accessible names and ignores unrelated chatter', async () => {
    const { desk, say } = await mount('residence')
    await say('Chai le aao bhaiya')
    expect(desk.view.diff).toEqual([{ type: 'ignored', text: '[ignored: side-chatter]' }])
    expect(desk.view.fields.some(field => field.filled)).toBe(false)
    await say('नाम रामधारी यादव, गाँव फुलवारी, पिनकोड ८००००१')
    expect(desk.view.fields.filter(field => field.filled)).toHaveLength(3)
    await desk.verify()
    await say('हाँ')
    expect(desk.view.phase).toBe('READY')
  })

  it.each(scenarios.map(scenario => [scenario.id, scenario] as const))('runs the actual %s sample without a key or microphone', async (_id, scenario) => {
    const { desk, code } = await mount(scenario.portal)
    await act(() => playScenario(scenario, desk, { signal: new AbortController().signal, fillPracticeCode: code, pace: 0, onStep: () => {} }))
    expect(desk.view.phase).toBe('READY')
    expect(submitButton().disabled).toBe(false)
  })
})

describe('DOM scanner', () => {
  it('does not republish the same view when React temporarily rewrites input attributes', async () => {
    document.body.innerHTML = '<form><label>Applicant name<input name="name"></label><button>Submit</button></form>'
    let updates = 0
    const desk = new DeskController(document, { speaker: voice, onChange: () => updates++ })
    controller = desk
    desk.start()
    const checkpoint = updates
    const control = document.querySelector('input')!
    control.name = ''
    control.name = 'name'
    await new Promise(resolve => setTimeout(resolve, 5))
    expect(updates).toBe(checkpoint)
  })

  it('keeps IDs stable on mutation, resolves aria-labelledby and security semantics, and traverses same-origin iframe DOM', async () => {
    document.body.innerHTML = '<form id="f"><span id="u">Applicant name</span><input aria-labelledby="u"><input autocomplete="one-time-code"><button>Submit</button></form><iframe></iframe>'
    const frame = document.querySelector('iframe')!
    frame.contentDocument!.body.innerHTML = '<form><label>PIN code<input></label></form>'
    const scanner = new Scanner(document)
    const first = scanner.scan().fields
    expect(first.map(field => field.semantic)).toEqual(['name', 'otp', 'pincode'])
    expect(new Filler(scanner).write(first[1].id, '654321')).toBe(false)
    const changed = new Promise(resolve => {
      const stop = scanner.observe(() => { stop(); resolve(scanner.scan()) })
    })
    document.querySelector('form')!.insertAdjacentHTML('beforeend', '<input aria-label="Mobile number">')
    await changed
    expect(scanner.scan().fields[0].id).toBe(first[0].id)
    expect(scanner.scan().fields.some(field => field.semantic === 'mobile')).toBe(true)
  })
})

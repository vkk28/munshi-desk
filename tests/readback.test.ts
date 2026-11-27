// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BrowserSpeaker, DeskController, WebSpeechSttAdapter, type Speaker } from '@munshi/engine'
import { playScenario } from '../web/src/samples/scenarios'

let controller: DeskController | undefined

function mount(extraFields = '', speaker: Speaker = new BrowserSpeaker()) {
  document.body.innerHTML = `<form><label>Applicant name<input name="name" value="Meera Devi" required></label>${extraFields}<button type="submit">Submit</button></form>`
  controller = new DeskController(document, { speaker, holdIdle: true, onChange: () => {} })
  controller.setLanguage('hinglish')
  return controller
}

afterEach(() => {
  controller?.dispose()
  controller = undefined
  document.body.replaceChildren()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('spoken read-back and screen review', () => {
  it.each(['end', 'error', 'timeout'] as const)('reports a speech %s accurately', async event => {
    vi.useFakeTimers()
    vi.stubGlobal('SpeechSynthesisUtterance', class {})
    vi.stubGlobal('speechSynthesis', {
      cancel: vi.fn(),
      getVoices: () => [],
      speak: (utterance: SpeechSynthesisUtterance) => {
        if (event === 'end') utterance.onend?.(new Event('end') as SpeechSynthesisEvent)
        if (event === 'error') utterance.onerror?.(new Event('error') as SpeechSynthesisErrorEvent)
      },
    })
    const speaker = new BrowserSpeaker()
    const result = speaker.speak(['Name, Meera Devi.'], 'en-IN')
    await vi.runAllTimersAsync()
    expect(await result).toBe(event === 'end')
    expect(speaker.muted).toBe(false)
  })

  it('uses screen review if the installed voices cannot speak the requested language', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('SpeechSynthesisUtterance', class {})
    const speak = vi.fn()
    vi.stubGlobal('speechSynthesis', { cancel: vi.fn(), getVoices: () => [{ lang: 'en-US', localService: true }], speak })
    const desk = mount()
    desk.setLanguage('hi')
    const pending = desk.verify()
    await vi.runAllTimersAsync()
    await pending
    expect(speak).not.toHaveBeenCalled()
    expect(desk.view).toMatchObject({ readbackFallback: true, locked: true })
  })

  it('requires an explicit screen review before Haan can unlock a form when audio is unavailable', async () => {
    vi.stubGlobal('speechSynthesis', undefined)
    const desk = mount()
    await desk.verify()
    expect(desk.view).toMatchObject({ phase: 'VERIFYING', readbackFallback: true, completed: false, locked: true })
    expect(desk.view.review).toContain('Applicant name, Meera Devi')

    desk.ingest({ text: 'Haan', source: 'wispr-flow' })
    expect(desk.view.locked).toBe(true)
    desk.acknowledgeReadback()
    expect(desk.view).toMatchObject({ phase: 'VERIFYING', completed: true, locked: true })
    expect(desk.view.readbackFallback).toBeUndefined()

    desk.ingest({ text: 'Haan', source: 'wispr-flow' })
    expect(desk.view).toMatchObject({ phase: 'READY', locked: false })
  })

  it('invalidates a pending screen review when a value changes without dispatching an input event', async () => {
    vi.stubGlobal('speechSynthesis', undefined)
    const desk = mount()
    await desk.verify()
    document.querySelector<HTMLInputElement>('input')!.value = 'Ramdhari Yadav'
    desk.acknowledgeReadback()
    expect(desk.view).toMatchObject({ phase: 'LISTENING', completed: false, locked: true, review: [] })
    expect(desk.view.readbackFallback).toBeUndefined()
  })

  it('lets the synthetic sample demonstrate screen review on a silent browser', async () => {
    vi.stubGlobal('speechSynthesis', undefined)
    const desk = mount()
    const onStep = vi.fn()
    await playScenario({
      id: 'silent', title: 'Screen review', detail: '', language: 'hinglish', portal: 'pension',
      steps: () => [{ read: true }, { text: 'Haan' }],
    }, desk, { signal: new AbortController().signal, fillPracticeCode: () => {}, onStep, pace: 0 })
    expect(onStep).toHaveBeenCalledWith('Sample citizen reviews the details on screen', 1, 2)
    expect(desk.view).toMatchObject({ phase: 'READY', locked: false })
  })
})

describe('application consent', () => {
  const heard = { speak: async () => true, cancel: () => {}, muted: false }

  it('requires clear assent and withdraws an existing confirmation when the citizen says no', async () => {
    const desk = mount('', heard)
    await desk.verify()
    desk.ingest({ text: 'Haan', confidence: 0.30, source: 'browser-mic' })
    expect(desk.view).toMatchObject({ phase: 'VERIFYING', locked: true })
    desk.ingest({ text: 'Haan', confidence: 0.95, source: 'browser-mic' })
    expect(desk.view.phase).toBe('READY')
    desk.ingest({ text: 'nahi' })
    desk.ingest({ text: 'Haan' })
    expect(desk.view).toMatchObject({ phase: 'LISTENING', completed: false, locked: true })
  })

  it('blocks an incomplete read-back after its citizen rejects it', async () => {
    let finish = () => {}
    const desk = mount('', {
      ...heard, speak: lines => lines.length > 1 ? new Promise(resolve => { finish = () => resolve(true) }) : Promise.resolve(true),
    })
    const talking = desk.verify()
    desk.ingest({ text: 'no' })
    finish()
    await talking
    desk.confirm()
    expect(desk.view).toMatchObject({ phase: 'LISTENING', completed: false, locked: true })
  })

  it('includes optional fields with their display labels and speaks a correction that clears one', async () => {
    const speak = vi.fn<Speaker['speak']>(async () => true)
    const desk = mount('<label>State<select name="state"><option>Bihar</option><option>Delhi</option></select></label><label>Village<input name="village" value="Phulwari"></label>', { ...heard, speak })
    await desk.verify()
    expect(desk.view.review).toEqual(['Applicant name, Meera Devi', 'State, Bihar', 'Village, Phulwari'])
    const village = desk.view.fields.find(row => row.field.semantic === 'village')!
    desk.edit(village.field.id, 'clear')
    await Promise.resolve()
    expect(speak.mock.calls.at(-1)?.[0]).toEqual(['Village, cleared', 'If it is correct, say haan.'])
    desk.confirm()
    expect(desk.view.phase).toBe('READY')
  })

  it('requires a fresh review when another field changed silently before a correction', async () => {
    const desk = mount('<label>PIN code<input name="pincode" value="800001"></label>', heard)
    await desk.verify()
    document.querySelector<HTMLInputElement>('[name=name]')!.value = 'Uma Devi'
    desk.ingest({ text: 'Pincode 800002' })
    desk.confirm()
    expect(desk.view).toMatchObject({ phase: 'LISTENING', locked: true })
    await desk.verify()
    expect(desk.view.review).toContain('Applicant name, Uma Devi')
    desk.confirm()
    expect(desk.view.phase).toBe('READY')
  })

  it('checks native constraints and any newly added form field immediately before submit', async () => {
    const desk = mount('<label>Email<input type="email" value="invalid" name="email"></label>', heard)
    await desk.verify()
    expect(desk.view.phase).toBe('LISTENING')
    expect(desk.view.fields.find(row => row.field.label === 'Email')?.issue?.code).toBe('invalid')
    document.querySelector<HTMLInputElement>('[name=email]')!.value = 'applicant@example.com'
    await desk.verify()
    desk.confirm()
    expect(desk.view.phase).toBe('READY')

    const form = document.querySelector('form')!
    form.insertAdjacentHTML('beforeend', '<label>District<input value="Patna"></label>')
    const allowed = form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    expect(allowed).toBe(false)
    expect(desk.view).toMatchObject({ phase: 'LISTENING', locked: true })
  })
})

it('discards recognition results from before read-back and resumes only while the mic session is active', () => {
  vi.useFakeTimers()
  class Recognition {
    onresult?: (event: { resultIndex: number; results: unknown[] }) => void
    start = vi.fn()
    abort = vi.fn()
  }
  const runs: Recognition[] = []
  vi.stubGlobal('SpeechRecognition', class extends Recognition { constructor() { super(); runs.push(this) } })
  const adapter = new WebSpeechSttAdapter()
  const final = vi.fn()
  adapter.start('hi-IN', { final, listening: vi.fn(), error: vi.fn(), muted: () => false })
  const staleResult = runs[0].onresult!
  const assent = { resultIndex: 0, results: [{ isFinal: true, 0: { transcript: 'Haan', confidence: .92 } }] }
  adapter.setSuspended(true)
  expect(runs[0].abort).toHaveBeenCalled()
  adapter.setSuspended(false)
  vi.runAllTimers()
  staleResult(assent)
  expect(final).not.toHaveBeenCalled()
  runs[1].onresult!(assent)
  expect(final).toHaveBeenCalledOnce()
  adapter.setSuspended(true)
  adapter.stop()
  adapter.setSuspended(false)
  vi.runAllTimers()
  expect(runs).toHaveLength(2)
})

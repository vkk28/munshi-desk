import { BrowserSpeaker, isCheckpoint, nextInterviewQuestion, MAX_UTTERANCE_LENGTH, receiveDictationPaste, speechLocale, WebSpeechSttAdapter, type DeskView, type Language } from '@munshi/engine'
import { portName, type PageMessage, type PanelMessage } from './protocol'

const get = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id)! as T
const button = (id: string) => get<HTMLButtonElement>(id)
const language = get<HTMLSelectElement>('language')
const input = get<HTMLTextAreaElement>('utterance')
input.maxLength = MAX_UTTERANCE_LENGTH
const stt = new WebSpeechSttAdapter()
const speaker = new BrowserSpeaker(playing => stt.setSuspended(playing))
let mic = false
let flowArmed = false
let tabId: number | undefined
let port: chrome.runtime.Port | undefined
let generation = 0
let view: DeskView | undefined

function send(message: PanelMessage) { port?.postMessage(message) }
function setMic(on: boolean) {
  mic = on
  button('mic').setAttribute('aria-pressed', String(on))
  button('mic').textContent = on ? 'Stop browser mic' : 'Start browser mic'
}
function clear() {
  const previous = port
  port = undefined
  tabId = undefined
  view = undefined
  flowArmed = false
  previous?.disconnect()
  stt.stop()
  speaker.cancel()
  setMic(false)
  input.value = ''
  get('fields').replaceChildren()
  get('transcript').textContent = 'Spoken or typed entries appear here.'
  get('phase').textContent = 'Standby'
  get('lock').textContent = 'Submit locked'
  get('note').textContent = 'Connect first.'
  get('source').textContent = ''
  get('readback-review').replaceChildren()
  controls()
}

function controls() {
  for (const id of ['send', 'mic', 'flow']) button(id).disabled = !port
  button('read').disabled = !port || view?.phase === 'VERIFYING' || view?.phase === 'PAUSED_MANUAL'
  button('undo').disabled = !port || view?.phase === 'IDLE' || view?.phase === 'PAUSED_MANUAL'
  button('resume').hidden = view?.phase !== 'PAUSED_MANUAL'
  button('confirm').hidden = view?.phase !== 'VERIFYING' || !view.completed
  get('readback-fallback').hidden = !view?.readbackFallback
  const canInterview = view && (view.phase === 'IDLE' || view.phase === 'LISTENING') && nextInterviewQuestion(view.fields, view.language)
  button('ask').hidden = !canInterview
  button('ask').textContent = view?.interview ? 'Repeat question' : 'Ask next question'
  button('dismiss-question').hidden = !view?.interview
  get('question').hidden = !view?.interview
  get('question').textContent = view?.interview?.text || ''
  get('question').lang = view?.language === 'hinglish' ? 'en-IN' : view?.language || 'hi'
  button('flow').textContent = flowArmed ? 'Focus Wispr Flow input' : 'Dictate with Wispr Flow'
  get('flow-help').hidden = !flowArmed
}

function render(next: DeskView) {
  view = next
  get('phase').textContent = {
    IDLE: 'Standby', LISTENING: 'Session active', VERIFYING: 'Read-back', PAUSED_MANUAL: 'Manual step', READY: 'Confirmed',
  }[next.phase]
  get('note').textContent = next.line || next.note
  get('source').textContent = next.source ? {
    'wispr-flow': 'Wispr Flow input', 'browser-mic': 'Browser mic', typed: 'Typed input', sample: 'Sample',
  }[next.source] : ''
  get('lock').textContent = next.locked ? 'Submit locked' : 'Submit unlocked'
  get('readback-review').replaceChildren(...(next.readbackFallback ? next.review : []).map(text => {
    const item = document.createElement('li')
    item.textContent = text
    return item
  }))
  get('fields').replaceChildren(...next.fields.map(({ field, filled, value, issue }) => {
    const item = document.createElement('li')
    if (issue) item.className = 'issue'
    const label = document.createElement('strong')
    label.textContent = field.label
    item.append(label, issue?.message || (isCheckpoint(field) ? filled ? 'Entered manually' : 'Manual entry' :
      field.kind === 'checkbox' && !field.options.length ? filled ? 'Yes' : '—' : value || '—'))
    return item
  }))
  if (next.diff.length) {
    get('transcript').replaceChildren(...next.diff.map(token => {
      const span = document.createElement('span')
      span.className = token.type
      span.textContent = token.text + (token.type === 'replaced' ? ' → ' : ' ')
      return span
    }))
  } else get('transcript').textContent = 'Spoken or typed entries appear here.'
  controls()
}

async function connect() {
  const attempt = ++generation
  clear()
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (tab?.id === undefined) throw new Error('No active tab')
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] })
    if (attempt !== generation) return
    const connection = chrome.tabs.connect(tab.id, { name: portName, frameId: 0 })
    port = connection
    tabId = tab.id
    connection.onDisconnect.addListener(() => {
      if (port !== connection) return
      void chrome.runtime.lastError
      clear()
      get('connection').textContent = 'Connection closed. Connect to resume.'
    })
    connection.onMessage.addListener((message: PageMessage) => {
      if (port !== connection) return
      switch (message.type) {
        case 'view': render(message.value); break
        case 'cancel': speaker.cancel(); break
        case 'speak': {
          const report = (success: boolean) => {
            if (port === connection) send({ type: 'spoken', id: message.id, success })
          }
          void speaker.speak(message.lines, message.locale, text => {
            if (port === connection) send({ type: 'line', id: message.id, text })
          }).then(report, () => report(false))
          break
        }
        case 'submitted':
          clear()
          get('connection').textContent = 'Submission requested. Check the site for its result. The voice desk has disconnected.'
          break
      }
    })
    get('connection').textContent = 'Connected to this tab. Start with speech or text.'
    send({ type: 'language', value: language.value as Language })
    controls()
  } catch {
    if (attempt === generation) get('connection').textContent = 'Open a web form and click the Munshi Desk toolbar icon to grant tab access.'
  }
}

button('ask').addEventListener('click', () => { send({ type: 'ask' }); input.focus() })
button('dismiss-question').addEventListener('click', () => send({ type: 'dismiss-question' }))
button('connect').addEventListener('click', () => void connect())
button('flow').addEventListener('click', () => {
  if (!port) return
  stt.stop()
  setMic(false)
  flowArmed = true
  if (view?.phase === 'IDLE') send({ type: 'start' })
  controls()
  input.focus()
})
button('pause-flow').addEventListener('click', () => {
  flowArmed = false
  controls()
  input.focus()
})
input.addEventListener('paste', event => {
  const value = receiveDictationPaste(event, Boolean(port) && flowArmed, input.value)
  if (value) send({ type: 'utterance', value })
})
input.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    input.form?.requestSubmit()
  }
})
button('mic').addEventListener('click', () => {
  if (!port) return
  if (mic) {
    stt.stop()
    setMic(false)
    return
  }
  flowArmed = false
  controls()
  send({ type: 'start' })
  stt.start(speechLocale(language.value as Language), {
    final: value => send({ type: 'utterance', value }), muted: () => speaker.muted,
    listening: setMic, error: message => { get('connection').textContent = message },
  })
})
language.addEventListener('change', () => {
  send({ type: 'language', value: language.value as Language })
  stt.stop()
  setMic(false)
})
button('permissions').addEventListener('click', () => void chrome.runtime.openOptionsPage())
for (const action of ['read', 'confirm', 'acknowledge-readback', 'resume', 'undo'] as const) button(action).addEventListener('click', () => send({ type: action }))
get<HTMLFormElement>('entry').addEventListener('submit', event => {
  event.preventDefault()
  if (!port || !input.value.trim()) return
  send({ type: 'utterance', value: { text: input.value, source: 'typed' } })
  input.value = ''
  input.focus()
})
chrome.tabs.onActivated.addListener(({ tabId: next }) => {
  if (tabId !== next) {
    generation++
    clear()
    get('connection').textContent = 'Connect to the form in this tab.'
  }
})
window.addEventListener('pagehide', clear)
void connect()

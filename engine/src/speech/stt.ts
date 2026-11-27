import type { Utterance } from '../types'

interface BrowserRecognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string; confidence: number } }> }) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  abort(): void
}

export interface SttCallbacks {
  final: (utterance: Utterance) => void
  listening: (listening: boolean) => void
  error: (message: string) => void
  muted: () => boolean
}

export interface SttAdapter { start(locale: string, callbacks: SttCallbacks): boolean; stop(): void }

const environment = () => globalThis as typeof globalThis & {
  SpeechRecognition?: new () => BrowserRecognition
  webkitSpeechRecognition?: new () => BrowserRecognition
}

type RecognitionSession = {
  locale: string
  callbacks: SttCallbacks
  Constructor: new () => BrowserRecognition
  attempts: number
}

export class WebSpeechSttAdapter implements SttAdapter {
  private session?: RecognitionSession
  private recognition?: BrowserRecognition
  private restart?: ReturnType<typeof setTimeout>
  private suspended = false

  start(locale: string, callbacks: SttCallbacks) {
    this.stop()
    const Constructor = environment().SpeechRecognition || environment().webkitSpeechRecognition
    if (!Constructor) {
      callbacks.error('Speech recognition is unavailable here. Use Chrome, type an utterance or play a sample.')
      return false
    }
    this.session = { locale, callbacks, Constructor, attempts: 0 }
    if (this.suspended) {
      callbacks.listening(true)
      return true
    }
    return this.listen(this.session)
  }

  // A speech service can deliver final results after playback ends. Retire the
  // old recognizer so a delayed fragment from the desk cannot confirm a form.
  setSuspended(suspended: boolean) {
    if (this.suspended === suspended) return
    this.suspended = suspended
    this.retire()
    const session = this.session
    if (!suspended && session) this.restart = setTimeout(() => this.listen(session), 0)
  }

  private listen(session: RecognitionSession) {
    if (this.suspended || this.session !== session) return false
    const { callbacks } = session
    const recognition = new session.Constructor()
    this.recognition = recognition
    recognition.lang = session.locale
    recognition.continuous = true
    recognition.interimResults = true
    recognition.onresult = event => {
      session.attempts = 0
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (this.recognition !== recognition || callbacks.muted()) return
        const result = event.results[i]
        if (result.isFinal) callbacks.final({ text: result[0].transcript, confidence: result[0].confidence, source: 'browser-mic' })
      }
    }
    recognition.onerror = ({ error }) => {
      if (this.recognition !== recognition) return
      if (['not-allowed', 'service-not-allowed', 'audio-capture', 'network', 'language-not-supported'].includes(error)) {
        this.stop()
        callbacks.listening(false)
        callbacks.error('Microphone or speech service unavailable. Check browser permissions, type an utterance or play a sample.')
      }
    }
    recognition.onend = () => {
      if (this.recognition !== recognition) return
      this.recognition = undefined
      this.restart = setTimeout(() => this.listen(session), Math.min(250 * 2 ** session.attempts++, 2500))
    }
    try {
      recognition.start()
      callbacks.listening(true)
      return true
    } catch {
      this.stop()
      callbacks.listening(false)
      callbacks.error('The microphone could not start. Type an utterance or play a sample.')
      return false
    }
  }

  stop() {
    this.session = undefined
    this.retire()
  }

  private retire() {
    clearTimeout(this.restart)
    const recognition = this.recognition
    this.recognition = undefined
    if (!recognition) return
    recognition.onend = null
    recognition.onerror = null
    recognition.onresult = null
    recognition.abort()
  }
}

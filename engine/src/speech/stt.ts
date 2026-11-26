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

export class WebSpeechSttAdapter implements SttAdapter {
  private recognition?: BrowserRecognition
  private restart?: ReturnType<typeof setTimeout>

  start(locale: string, callbacks: SttCallbacks) {
    this.stop()
    const Constructor = environment().SpeechRecognition || environment().webkitSpeechRecognition
    if (!Constructor) {
      callbacks.error('Speech recognition is unavailable here. Use Chrome, type an utterance or play a sample.')
      return false
    }
    const recognition = new Constructor()
    this.recognition = recognition
    let attempts = 0
    const launch = () => {
      if (this.recognition !== recognition) return false
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
    recognition.lang = locale
    recognition.continuous = true
    recognition.interimResults = true
    recognition.onresult = event => {
      attempts = 0
      if (callbacks.muted()) return
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) callbacks.final({ text: result[0].transcript, confidence: result[0].confidence })
      }
    }
    recognition.onerror = ({ error }) => {
      if (['not-allowed', 'service-not-allowed', 'audio-capture', 'network', 'language-not-supported'].includes(error)) {
        this.stop()
        callbacks.listening(false)
        callbacks.error('Microphone or speech service unavailable. Check browser permissions, type an utterance or play a sample.')
      }
    }
    recognition.onend = () => {
      if (this.recognition !== recognition) return
      this.restart = setTimeout(launch, Math.min(250 * Math.pow(2, attempts++), 2500))
    }
    return launch()
  }

  stop() {
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

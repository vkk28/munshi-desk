export interface Speaker {
  speak(lines: string[], locale: string, onLine?: (line: string) => void): Promise<boolean | void>
  cancel(): void
  readonly muted: boolean
}

export class BrowserSpeaker implements Speaker {
  private version = 0
  private finish?: (spoken: boolean) => void
  muted = false
  constructor(private readonly onPlayback?: (playing: boolean) => void) {}

  private setMuted(value: boolean) {
    if (this.muted === value) return
    this.muted = value
    this.onPlayback?.(value)
  }

  cancel() {
    this.version++
    this.setMuted(false)
    this.finish?.(false)
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
  }

  async speak(lines: string[], locale: string, onLine?: (line: string) => void) {
    this.cancel()
    if (typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') return false
    const token = this.version
    this.setMuted(true)
    const spoken = await this.play(lines, locale, token, onLine).catch(() => false)
    if (token !== this.version) return false
    await new Promise(resolve => setTimeout(resolve, 300))
    if (token !== this.version) return false
    this.setMuted(false)
    return spoken
  }

  private async play(lines: string[], locale: string, token: number, onLine?: (line: string) => void) {
    for (const line of lines) {
      if (token !== this.version) return false
      onLine?.(line)
      for (const chunk of line.match(/.{1,110}(?:\s|$)|.{1,110}/gu) || [line]) {
        if (token !== this.version || !await this.chunk(chunk.trim(), locale)) return false
      }
    }
    return true
  }

  private chunk(text: string, locale: string) {
    return new Promise<boolean>(resolve => {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = locale
      utterance.rate = 0.94
      const voices = speechSynthesis.getVoices()
      const requestedLanguage = locale.split('-')[0].toLowerCase()
      const matching = voices.filter(voice => voice.lang.split(/[-_]/)[0].toLowerCase() === requestedLanguage)
      if (voices.length && !matching.length) {
        resolve(false)
        return
      }
      utterance.voice = matching.find(voice => voice.localService && voice.lang === locale) ||
        matching.find(voice => voice.localService) || matching.find(voice => voice.lang === locale) || matching[0] || null
      const done = (spoken: boolean) => {
        clearTimeout(timer)
        if (this.finish === done) this.finish = undefined
        resolve(spoken)
      }
      const timer = setTimeout(() => {
        done(false)
        speechSynthesis.cancel()
      }, Math.min(9000, Math.max(2200, text.length * 125)))
      this.finish = done
      utterance.onend = () => done(true)
      utterance.onerror = () => done(false)
      try { speechSynthesis.speak(utterance) } catch { done(false) }
    })
  }
}

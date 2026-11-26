export interface Speaker {
  speak(lines: string[], locale: string, onLine?: (line: string) => void): Promise<void>
  cancel(): void
  readonly muted: boolean
}

export class BrowserSpeaker implements Speaker {
  private version = 0
  private finish?: () => void
  muted = false

  cancel() {
    this.version++
    this.muted = false
    this.finish?.()
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
  }

  async speak(lines: string[], locale: string, onLine?: (line: string) => void) {
    this.cancel()
    const token = this.version
    this.muted = true
    for (const line of lines) {
      if (token !== this.version) return
      onLine?.(line)
      for (const chunk of line.match(/.{1,110}(?:\s|$)|.{1,110}/gu) || [line]) {
        if (token !== this.version) return
        await this.chunk(chunk.trim(), locale)
      }
    }
    if (token !== this.version) return
    await new Promise(resolve => setTimeout(resolve, 300))
    if (token === this.version) this.muted = false
  }

  private chunk(text: string, locale: string) {
    return new Promise<void>(resolve => {
      if (typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') {
        resolve()
        return
      }
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = locale
      utterance.rate = 0.94
      const voices = speechSynthesis.getVoices()
      utterance.voice = voices.find(voice => voice.localService && voice.lang === locale) ||
        voices.find(voice => voice.localService && voice.lang.startsWith(locale.split('-')[0])) || null
      const done = () => {
        clearTimeout(timer)
        if (this.finish === done) this.finish = undefined
        resolve()
      }
      const timer = setTimeout(() => {
        speechSynthesis.cancel()
        done()
      }, Math.min(9000, Math.max(2200, text.length * 125)))
      this.finish = done
      utterance.onend = done
      utterance.onerror = done
      try { speechSynthesis.speak(utterance) } catch { done() }
    })
  }
}

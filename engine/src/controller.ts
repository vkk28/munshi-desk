import { Filler } from './filler'
import { transition } from './fsm'
import { mapValue } from './mapper/rules'
import { interpret } from './pipeline'
import { phrase, readBack, speechLocale } from './prompts'
import { Scanner } from './scanner'
import { Session } from './session'
import { LONG_UTTERANCE_MESSAGE, MAX_UTTERANCE_LENGTH } from './speech/dictation'
import type { Speaker } from './speech/tts'
import { isCheckpoint, type Candidate, type Diff, type Field, type InputSource, type Issue, type Language, type Patch, type Phase, type Schema, type Utterance } from './types'
import { crossValidate, hasValue, maskId, redactIds, validate } from './validators'

export interface FieldView { field: Field; value: string; filled: boolean; issue?: Issue }
export interface DeskView {
  phase: Phase
  language: Language
  fields: FieldView[]
  diff: Diff[]
  source?: InputSource
  note: string
  line: string
  review: string[]
  completed: boolean
  locked: boolean
}
interface Config {
  speaker: Speaker
  onChange: (view: DeskView) => void
  onSubmit?: () => void
  now?: () => Date
  holdIdle?: boolean
  primaryOnly?: boolean
}

const defaultNote = 'Start a session to fill this form with voice or text.'

export class DeskController {
  private scanner: Scanner
  private filler: Filler
  private schema: Schema = { formId: '', fields: [] }
  private session = new Session()
  private language: Language = 'hi'
  private phase: Phase = 'IDLE'
  private note = defaultNote
  private line = ''
  private review: string[] = []
  private diff: Diff[] = []
  private source?: InputSource
  private extraHints: Record<string, string[]> = {}
  private staged: Record<string, Issue> = {}
  private completed = false
  private writing = false
  private checkpointVisited = false
  private attached = false
  private verification = 0
  private fingerprint?: string
  private lastView?: string
  private cleanupSubmit = () => {}
  private cleanupEvents = () => {}
  private stopObserver = () => {}
  private readonly now: () => Date

  constructor(root: Document | HTMLElement, private readonly config: Config) {
    this.scanner = new Scanner(root, config.primaryOnly)
    this.filler = new Filler(this.scanner)
    this.now = config.now || (() => new Date())
    this.rescan()
  }

  get muted() { return this.config.speaker.muted }

  get view(): DeskView {
    const values = this.values()
    const issues = this.issues(values)
    return {
      phase: this.phase, language: this.language,
      diff: this.diff, source: this.source, note: this.note, line: this.line, review: this.review, completed: this.completed,
      locked: this.phase !== 'READY',
      fields: this.schema.fields.map(field => {
        const value = values[field.id] || ''
        const issue = issues[field.id]
        return {
          field, filled: hasValue(field, value),
          value: field.semantic === 'aadhaar' ? maskId(value) : isCheckpoint(field) ? '' : redactIds(value),
          issue: issue && { ...issue, proposed: issue.proposed && (field.semantic === 'aadhaar' ? maskId(issue.proposed) : redactIds(issue.proposed)) },
        }
      }),
    }
  }

  start() {
    this.attached = true
    this.phase = transition(this.phase, 'START')
    this.note = 'Listening for form fields.'
    this.stopObserver()
    this.stopObserver = this.scanner.observe(() => this.rescan())
    this.rescan()
    this.maybeCheckpoint()
    this.emit()
  }

  reset() {
    this.config.speaker.cancel()
    this.verification++
    this.phase = transition(this.phase, 'RESET')
    this.completed = false
    this.fingerprint = undefined
    this.checkpointVisited = false
    this.session = new Session()
    this.staged = {}
    this.diff = []
    this.source = undefined
    this.line = ''
    this.review = []
    this.note = defaultNote
    this.emit()
  }

  dispose() {
    this.config.speaker.cancel()
    this.verification++
    this.stopObserver()
    this.cleanupEvents()
    this.cleanupSubmit()
    this.filler.dispose()
  }

  setLanguage(language: Language) {
    this.language = language
    if (this.phase === 'VERIFYING' || this.phase === 'READY') {
      this.invalidate()
      this.note = 'Language changed. Read back again before submitting.'
    }
    this.emit()
  }

  setExtraHints(hints: Record<string, string[]>) {
    this.extraHints = hints
    this.rescan()
  }

  rescan() {
    const scanned = this.scanner.scan()
    this.schema = { ...scanned, fields: scanned.fields.map(field => ({
      ...field, hints: [...field.hints, ...(this.extraHints[field.id] || [])],
    })) }
    this.cleanupSubmit()
    this.cleanupEvents()
    if (this.attached || this.config.holdIdle) {
      this.cleanupSubmit = this.filler.intercept(() => this.allowSubmit(), () => {
        // Let the owning page finish handling its explicitly requested submit.
        queueMicrotask(() => {
          this.reset()
          this.config.onSubmit?.()
        })
      })
    }
    const roots = this.scanner.roots()
    for (const root of roots) {
      root.addEventListener('input', this.onInput, true)
      root.addEventListener('change', this.onInput, true)
      root.addEventListener('focusin', this.onFocus, true)
    }
    this.cleanupEvents = () => roots.forEach(root => {
      root.removeEventListener('input', this.onInput, true)
      root.removeEventListener('change', this.onInput, true)
      root.removeEventListener('focusin', this.onFocus, true)
    })
    for (const id of Object.keys(this.staged)) if (!this.scanner.target(id)) delete this.staged[id]
    if (this.fingerprint && this.fingerprint !== this.valueFingerprint()) {
      this.invalidate()
      this.note = 'The form changed. Read back again before submitting.'
    }
    this.emit()
  }

  ingest(utterance: Utterance) {
    const text = utterance.text.trim()
    if (!text) return
    if (text.length > MAX_UTTERANCE_LENGTH) {
      this.note = LONG_UTTERANCE_MESSAGE
      this.emit()
      return
    }
    if (this.phase === 'IDLE') this.start()
    const values = this.values()
    const result = interpret({ ...utterance, text }, this.schema.fields, values, this.session, this.now().getTime())
    if (this.phase === 'PAUSED_MANUAL') {
      if (result.command === 'resume') this.resume()
      return
    }
    this.source = utterance.source || 'typed'
    this.diff = result.diff
    if (result.command) {
      switch (result.command) {
        case 'read': void this.verify(); break
        case 'confirm': this.confirm(); break
        case 'no':
          if (this.phase === 'VERIFYING') {
            this.note = 'Say the field and its corrected value.'
            if (this.completed) this.say('which')
          }
          break
        case 'manual': this.pause(); break
        case 'undo': this.undo(); break
        case 'resume': break
      }
      this.emit()
      return
    }
    if (result.question) {
      this.session.ask(result.question.id, this.now().getTime())
      this.note = `Waiting for ${result.question.label}.`
    } else if (result.candidates.length) this.session.clearQuestion()
    if (result.candidates.length) {
      const reread = this.phase === 'VERIFYING' && this.completed
      const previous = this.fingerprint
      this.invalidate()
      const confidence = utterance.confidence
      const changed = this.apply(result.candidates, confidence)
      if (reread && changed.length && previous && !Object.keys(this.issues()).length) {
        void this.verify(changed)
      } else this.maybeCheckpoint()
    }
    this.emit()
  }

  edit(id: string, raw: string) {
    const field = this.scanner.target(id)?.field
    if (!field || isCheckpoint(field) || this.phase === 'PAUSED_MANUAL') return
    if (this.phase === 'IDLE') this.start()
    if (this.view.phase === 'PAUSED_MANUAL') return
    const reread = this.phase === 'VERIFYING' && this.completed
    this.invalidate()
    const changed = this.apply([{ field, raw }])
    if (reread && changed.length && !Object.keys(this.issues()).length) void this.verify(changed)
    else this.maybeCheckpoint()
    this.emit()
  }

  accept(id: string) {
    const issue = this.staged[id]
    if (issue?.code === 'confidence' && issue.proposed) this.edit(id, issue.proposed)
  }

  undo() {
    const batch = this.session.undo()
    if (!batch) {
      this.note = 'There is no voice edit to undo.'
      this.emit()
      return
    }
    this.invalidate()
    this.writing = true
    try {
      for (const patch of [...batch.patches].reverse()) this.filler.write(patch.fieldId, patch.previousValue)
    } finally { this.writing = false }
    this.staged = batch.issues
    this.note = 'Last voice edit undone.'
    this.emit()
  }

  resume() {
    if (this.phase !== 'PAUSED_MANUAL') return
    const pending = this.schema.fields.some(field => isCheckpoint(field) && field.required && !this.filler.checkpointComplete(field.id))
    if (pending) {
      this.note = 'Enter the required verification value on the form before resuming.'
      this.emit()
      return
    }
    this.phase = transition(this.phase, 'RESUME')
    this.checkpointVisited = true
    this.note = 'Manual step complete. Continue filling or read back.'
    this.emit()
  }

  async verify(only?: string[]) {
    if (this.phase === 'IDLE') this.start()
    if (this.phase === 'VERIFYING' || this.phase === 'READY') this.invalidate()
    if (this.phase !== 'LISTENING') return
    const values = this.values()
    const issues = this.issues(values)
    const missing = this.missing(values)
    const lines = readBack(this.schema.fields, values, this.language, only)
    if (Object.keys(issues).length || missing.length || !lines.length) {
      this.note = Object.keys(issues).length ? 'Resolve the amber fields before read-back.'
        : missing.length ? `Complete ${missing[0].label} before read-back.` : 'Fill a form field before starting read-back.'
      if (Object.keys(issues).length) this.say('issue')
      this.emit()
      return
    }
    this.phase = transition(this.phase, 'READ_BACK', { clear: true })
    const token = ++this.verification
    this.completed = false
    this.fingerprint = this.valueFingerprint()
    this.review = readBack(this.schema.fields, values, this.language)
    this.note = only ? 'Reading back the corrected fields.' : 'Listen to the critical fields.'
    this.emit()
    const queue = only ? lines : [phrase(this.language, 'intro'), ...lines]
    try {
      await this.config.speaker.speak([...queue, phrase(this.language, 'confirm')], speechLocale(this.language), line => {
        if (token === this.verification) {
          this.line = redactIds(line)
          this.emit()
        }
      })
    } catch { /* The on-screen verification list remains available. */ }
    if (token !== this.verification) return
    this.completed = true
    this.line = ''
    this.note = 'Say “Haan” or confirm the read-back.'
    this.emit()
  }

  confirm() {
    if (this.phase !== 'VERIFYING' || !this.completed) {
      this.note = this.phase === 'VERIFYING' ? 'Wait for read-back to finish.' : 'Complete read-back before confirming.'
      this.emit()
      return
    }
    const clear = this.fingerprint === this.valueFingerprint() && !Object.keys(this.issues()).length && !this.missing().length
    this.phase = transition(this.phase, 'CONFIRM', { clear, completed: this.completed })
    this.note = clear ? 'Citizen confirmed. Submit is unlocked.' : 'The form changed. Read back again before submitting.'
    if (!clear) this.invalidate()
    this.emit()
  }

  private apply(candidates: Candidate[], confidence?: number) {
    const previousIssues = { ...this.staged }
    const patches: Patch[] = []
    const touched: string[] = []
    const today = this.now()
    this.writing = true
    try {
      for (const { field, raw, op } of candidates) {
        if (!field.writable || isCheckpoint(field)) continue
        const mapped = mapValue(field, raw)
        const lowConfidence = Boolean(confidence && confidence < 0.75)
        const issue = mapped.issue || validate(field, mapped.value, today) ||
          (lowConfidence ? { code: 'confidence', message: 'Check the proposed value.' } as const : undefined)
        touched.push(field.id)
        if (issue) {
          this.staged[field.id] = { ...issue, proposed: mapped.value || undefined }
          continue
        }
        const previousValue = this.filler.read(field.id)
        if (!this.filler.write(field.id, mapped.value)) {
          this.staged[field.id] = { code: 'manual', message: 'Fill this field manually.' }
          continue
        }
        delete this.staged[field.id]
        if (mapped.value !== previousValue) {
          patches.push({ fieldId: field.id, previousValue, value: mapped.value, op: op || (mapped.value ? 'set' : 'clear'), span: field.label, confidence })
        }
      }
    } finally { this.writing = false }
    this.session.record(patches, previousIssues, touched, today.getTime())
    if (Object.keys(this.issues()).length) {
      this.note = 'Check the fields marked in amber.'
      this.say('issue')
    } else if (touched.length) this.note = touched.length === 1 ? 'Field updated.' : `${touched.length} fields updated.`
    return patches.map(patch => patch.fieldId)
  }

  private values() {
    return Object.fromEntries(this.schema.fields.map(field => [field.id, this.filler.read(field.id)]))
  }

  private issues(values = this.values()) {
    const today = this.now()
    const issues = crossValidate(this.schema, values, today)
    for (const field of this.schema.fields) {
      const issue = this.staged[field.id] || validate(field, values[field.id], today)
      if (issue) issues[field.id] = issue
    }
    return issues
  }

  private missing(values = this.values()) {
    return this.schema.fields.filter(field => field.required && (isCheckpoint(field) ?
      !this.filler.checkpointComplete(field.id) : !hasValue(field, values[field.id])))
  }

  private valueFingerprint() {
    return JSON.stringify(this.schema.fields.map(field => [field.id, this.filler.read(field.id), field.required]))
  }

  private allowSubmit() {
    if (this.phase !== 'READY') return false
    if (this.fingerprint === this.valueFingerprint() && !Object.keys(this.issues()).length && !this.missing().length) return true
    this.invalidate()
    this.note = 'The form changed. Read back again before submitting.'
    this.emit()
    return false
  }

  private maybeCheckpoint() {
    if (this.phase !== 'LISTENING' || this.checkpointVisited) return
    const fields = this.schema.fields
    if (fields.some(field => isCheckpoint(field) && !this.filler.checkpointComplete(field.id)) &&
        fields.some(field => field.required && !isCheckpoint(field)) &&
        !fields.some(field => field.required && !isCheckpoint(field) && !hasValue(field, this.filler.read(field.id))) &&
        !Object.keys(this.issues()).length) this.pause()
  }

  private pause() {
    if (this.phase !== 'LISTENING' || !this.schema.fields.some(isCheckpoint)) return
    this.phase = transition(this.phase, 'PAUSE')
    this.source = undefined
    this.diff = [{ type: 'kept', text: 'Voice input paused for manual verification.' }]
    this.note = 'Complete the security step on the form, then say “Aage badho” or choose Resume.'
    this.say('manual')
    this.emit()
  }

  private invalidate() {
    if (this.phase === 'VERIFYING' || this.phase === 'READY') {
      this.verification++
      this.config.speaker.cancel()
      this.phase = transition(this.phase, 'EDIT')
      this.line = ''
    }
    this.completed = false
    this.fingerprint = undefined
    this.review = []
  }

  private say(key: Parameters<typeof phrase>[1]) {
    void this.config.speaker.speak([phrase(this.language, key)], speechLocale(this.language)).catch(() => {})
  }

  private onFocus = (event: Event) => {
    const target = this.scanner.matches(event.target as Element)
    if (this.attached && target && isCheckpoint(target.field) && !this.checkpointVisited) this.pause()
  }

  private onInput = (event: Event) => {
    if (this.writing) return
    const target = this.scanner.matches(event.target as Element)
    if (!target) return
    if (isCheckpoint(target.field)) {
      if (!this.filler.read(target.field.id)) this.checkpointVisited = false
      if (!this.checkpointVisited) this.pause()
    } else delete this.staged[target.field.id]
    if (this.fingerprint && this.fingerprint !== this.valueFingerprint()) {
      this.invalidate()
      this.note = 'Form edited. Read back again before submitting.'
    }
    this.maybeCheckpoint()
    this.emit()
  }

  private emit() {
    if (this.attached || this.config.holdIdle) this.filler.setLocked(this.phase !== 'READY')
    const view = this.view
    const visible = JSON.stringify(view)
    if (this.lastView === visible) return
    this.lastView = visible
    this.config.onChange(view)
  }
}

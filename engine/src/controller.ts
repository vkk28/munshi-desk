import { Filler } from './filler'
import { transition } from './fsm'
import { mapValue } from './mapper/rules'
import { nextInterviewQuestion } from './interview'
import { keyText } from './semantics'
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
  readbackFallback?: boolean
  interview?: { fieldId: string; text: string }
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
const fallbackNote = 'Audio read-back could not finish. Read these details aloud to the applicant, then mark the review complete.'
const changedNote = 'The form changed. Read back again before submitting.'
const uncertain = (confidence?: number) => confidence !== undefined && confidence > 0 && confidence < 0.75

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
  private readbackFallback = false
  private interview?: DeskView['interview']
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
      readbackFallback: this.readbackFallback || undefined,
      interview: this.interview,
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
    if (this.phase !== 'IDLE') return
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
    this.interview = undefined
    this.verification++
    this.phase = transition(this.phase, 'RESET')
    this.completed = false
    this.readbackFallback = false
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
    this.interview = undefined
    this.verification++
    this.stopObserver()
    this.cleanupEvents()
    this.cleanupSubmit()
    this.filler.dispose()
  }

  setLanguage(language: Language) {
    this.clearInterview()
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

  askNextQuestion() {
    if (this.phase === 'IDLE') this.start()
    if (this.phase !== 'LISTENING') return
    this.scanSchema()
    const question = nextInterviewQuestion(this.view.fields, this.language)
    if (!question) return
    this.session.clearQuestion()
    this.interview = question
    this.emit()
    // The visible question stays bound until a reply or dismissal, including on silent devices.
    void this.config.speaker.speak([question.text], speechLocale(this.language)).catch(() => {})
  }

  dismissInterview() {
    this.clearInterview()
    this.emit()
  }

  private clearInterview() {
    if (!this.interview) return
    this.interview = undefined
    this.config.speaker.cancel()
  }

  private scanSchema() {
    const scanned = this.scanner.scan()
    this.schema = { ...scanned, fields: scanned.fields.map(field => ({
      ...field, hints: [...field.hints, ...(this.extraHints[field.id] || [])],
    })) }
  }

  rescan() {
    this.scanSchema()
    if (this.interview && nextInterviewQuestion(this.view.fields, this.language)?.fieldId !== this.interview.fieldId) this.clearInterview()
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
      this.note = changedNote
    }
    this.emit()
  }

  ingest(utterance: Utterance) {
    const text = utterance.text.trim()
    if (!text || (utterance.source === 'browser-mic' && this.muted)) return
    if (text.length > MAX_UTTERANCE_LENGTH) {
      this.note = LONG_UTTERANCE_MESSAGE
      this.emit()
      return
    }
    if (this.phase === 'IDLE') this.start()
    if (this.interview && keyText(this.interview.text) === keyText(text)) return
    const values = this.values()
    const field = this.interview && this.scanner.target(this.interview.fieldId)?.field
    const result = interpret({ ...utterance, text }, this.schema.fields, values, this.session, this.now().getTime(), field)
    if (this.phase === 'PAUSED_MANUAL') {
      if (result.command === 'resume') this.resume()
      return
    }
    this.source = utterance.source || 'typed'
    this.diff = result.diff
    if (result.command) {
      switch (result.command) {
        case 'read': void this.verify(); break
        case 'confirm':
          if (this.phase === 'VERIFYING' && this.completed && uncertain(utterance.confidence)) {
            this.note = 'The reply was unclear. Ask the applicant to confirm again.'
          } else this.confirm()
          break
        case 'no': this.requestCorrection(); break
        case 'manual': this.pause(); break
        case 'undo': this.undo(); break
        case 'resume': break
      }
      this.emit()
      return
    }
    if (result.question) {
      this.clearInterview()
      this.session.ask(result.question.id, this.now().getTime())
      this.note = `Waiting for ${result.question.label}.`
    } else if (result.candidates.length) this.session.clearQuestion()
    if (result.candidates.length) this.applyAndReview(result.candidates, utterance.confidence)
    this.emit()
  }

  edit(id: string, raw: string) {
    const field = this.scanner.target(id)?.field
    if (!field || isCheckpoint(field) || this.phase === 'PAUSED_MANUAL') return
    if (this.phase === 'IDLE') this.start()
    if (this.view.phase === 'PAUSED_MANUAL') return
    this.applyAndReview([{ field, raw }])
    this.emit()
  }

  accept(id: string) {
    const issue = this.staged[id]
    if (issue?.code === 'confidence' && issue.proposed !== undefined) this.edit(id, issue.proposed || 'clear')
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

  verify() {
    return this.readApplication()
  }

  private async readApplication(only?: string[]) {
    this.clearInterview()
    if (this.phase === 'IDLE') this.start()
    if (this.phase === 'VERIFYING' || this.phase === 'READY') this.invalidate()
    if (this.phase !== 'LISTENING') return
    this.scanSchema()
    const values = this.values()
    const issues = this.issues(values)
    const missing = this.missing(values)
    const allLines = readBack(this.schema.fields, values, this.language)
    if (Object.keys(issues).length || missing.length || !allLines.length) {
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
    const lines = only ? readBack(this.schema.fields, values, this.language, only) : allLines
    this.review = only ? [...new Set([...allLines, ...lines])] : allLines
    this.note = only ? 'Reading back the corrected fields.' : 'Listen to the details entered on this form.'
    this.emit()
    const queue = only ? lines : [phrase(this.language, 'intro'), ...lines]
    let spoken = false
    try {
      const result = await this.config.speaker.speak([...queue, phrase(this.language, 'confirm')], speechLocale(this.language), line => {
        if (token === this.verification) {
          this.line = redactIds(line)
          this.emit()
        }
      })
      spoken = result !== false
    } catch { /* The on-screen verification list remains available. */ }
    if (token !== this.verification) return
    this.completed = spoken
    this.readbackFallback = !spoken
    this.line = ''
    this.note = spoken ? 'Say “Haan” or confirm the read-back.' : fallbackNote
    this.emit()
  }

  acknowledgeReadback() {
    if (this.phase !== 'VERIFYING' || !this.readbackFallback) return
    if (!this.verificationCurrent()) {
      this.invalidate()
      this.note = changedNote
    } else {
      this.completed = true
      this.readbackFallback = false
      this.note = 'Screen review complete. Say “Haan” or confirm.'
    }
    this.emit()
  }

  requestCorrection() {
    if (this.phase !== 'VERIFYING' && this.phase !== 'READY') return
    this.invalidate()
    this.note = 'Say the field and its corrected value, then request a new read-back.'
    this.say('which')
    this.emit()
  }

  confirm() {
    if (this.phase === 'READY') return
    if (this.phase !== 'VERIFYING' || !this.completed) {
      this.note = this.readbackFallback ? fallbackNote
        : this.phase === 'VERIFYING' ? 'Wait for read-back to finish.' : 'Complete read-back before confirming.'
      this.emit()
      return
    }
    const clear = this.verificationCurrent()
    this.phase = transition(this.phase, 'CONFIRM', { clear, completed: this.completed })
    this.note = clear ? 'Citizen confirmed. Submit is unlocked.' : changedNote
    if (!clear) this.invalidate()
    this.emit()
  }

  private applyAndReview(candidates: Candidate[], confidence?: number) {
    // A short correction can reuse only the exact form the applicant has already reviewed.
    const reviewed = this.phase === 'VERIFYING' && this.completed && this.verificationCurrent()
      ? this.values() : undefined
    const reviewedLayout = reviewed && this.formLayout()
    this.invalidate()
    this.apply(candidates, confidence)
    if (reviewed && !Object.keys(this.issues()).length) {
      this.scanSchema()
      const current = this.values()
      const changed = this.schema.fields.filter(field => !isCheckpoint(field) && current[field.id] !== reviewed[field.id])
      const partial = reviewedLayout === this.formLayout() && changed.length > 0
      void this.readApplication(partial ? changed.map(field => field.id) : undefined)
      return
    }
    this.maybeCheckpoint()
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
        const issue = mapped.issue || validate(field, mapped.value, today) ||
          (uncertain(confidence) ? { code: 'confidence', message: mapped.value
            ? 'Check the proposed value.' : 'Did the applicant mean to clear this field?' } as const : undefined)
        touched.push(field.id)
        if (issue) {
          this.staged[field.id] = { ...issue, proposed: mapped.value }
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
  }

  private values() {
    return Object.fromEntries(this.schema.fields.map(field => [field.id, this.filler.read(field.id)]))
  }

  private issues(values = this.values()) {
    const today = this.now()
    const issues = crossValidate(this.schema, values, today)
    for (const field of this.schema.fields) {
      const issue = this.staged[field.id] || validate(field, values[field.id], today) ||
        (!isCheckpoint(field) && this.filler.violatesConstraints(field.id)
          ? { code: 'invalid' as const, message: 'Check the format required by this form.' } : undefined)
      if (issue) issues[field.id] = issue
    }
    return issues
  }

  private missing(values = this.values()) {
    return this.schema.fields.filter(field => isCheckpoint(field)
      ? (field.required || Boolean(values[field.id])) && !this.filler.checkpointComplete(field.id)
      : field.required && !hasValue(field, values[field.id]))
  }

  private formLayout() {
    return JSON.stringify(this.schema.fields.map(field =>
      [field.id, field.label, field.kind, field.semantic, field.required]))
  }

  private valueFingerprint() {
    return JSON.stringify([this.formLayout(), this.values()])
  }

  private verificationCurrent() {
    this.scanSchema()
    return this.fingerprint === this.valueFingerprint() && !Object.keys(this.issues()).length && !this.missing().length
  }

  private allowSubmit() {
    if (this.phase !== 'READY') return false
    if (this.verificationCurrent()) return true
    this.invalidate()
    this.note = changedNote
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
    this.clearInterview()
    this.phase = transition(this.phase, 'PAUSE')
    this.source = undefined
    this.diff = [{ type: 'kept', text: 'Voice input paused for manual verification.' }]
    this.note = 'Complete the security step on the form, then say “Aage badho” or choose Resume.'
    this.say('manual')
    this.emit()
  }

  private invalidate() {
    this.clearInterview()
    if (this.phase === 'VERIFYING' || this.phase === 'READY') {
      this.verification++
      this.config.speaker.cancel()
      this.phase = transition(this.phase, 'EDIT')
      this.line = ''
    }
    this.completed = false
    this.readbackFallback = false
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
    if (target.field.id === this.interview?.fieldId) this.clearInterview()
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

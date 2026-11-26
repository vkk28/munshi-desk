import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { AudioLines, Check, ChevronDown, CircleAlert, Ear, LockKeyhole, Mic, MicOff, Pencil, RotateCcw, Send, ShieldCheck } from 'lucide-react'
import type { DeskController, DeskView, FieldView, Language } from '@munshi/engine'
import { isCheckpoint, MAX_UTTERANCE_LENGTH, receiveDictationPaste, suggestAliases } from '@munshi/engine'

const labels = {
  IDLE: 'Standby', LISTENING: 'Session active', PAUSED_MANUAL: 'Manual step',
  VERIFYING: 'Read-back', READY: 'Confirmed',
}
const sources = { 'wispr-flow': 'Wispr Flow input', 'browser-mic': 'Browser mic', typed: 'Typed input', sample: 'Sample' }
const examples = {
  hi: 'नाम रामधारी यादव, उम्र चौंसठ',
  bho: 'Hamaar naam Ramdhari Yadav ba',
  hinglish: 'Name Ramdhari Yadav, age 64',
}

function ReviewField({ row, desk }: { row: FieldView; desk: DeskController }) {
  const { field, issue, filled, value } = row
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const checkpoint = isCheckpoint(field)
  const displayValue = checkpoint ? filled ? 'Entered manually' : 'Manual entry'
    : field.kind === 'checkbox' && !field.options.length ? filled ? 'Yes' : '—' : value || '—'
  return <li className={`review-row ${issue ? 'has-issue' : ''}`}>
    <div className="review-row-main">
      <div><span className="review-label">{field.label}</span><span className="review-value">{displayValue}</span></div>
      {issue ? <CircleAlert className="amber" size={16} aria-label="Needs review" /> : filled ? <Check className="green" size={16} aria-label="Filled" /> : <span className="empty-dot" aria-label="Empty" />}
      {!checkpoint && <button type="button" className="icon-button edit-button" aria-label={`Edit ${field.label}`} disabled={desk.view.phase === 'PAUSED_MANUAL'} onClick={() => {
        setDraft(field.semantic === 'aadhaar' ? '' : issue?.proposed || (filled ? displayValue : ''))
        setEditing(!editing)
      }}><Pencil size={14} /></button>}
    </div>
    {issue && <div className="issue-note">{issue.message} {issue.proposed && <strong>{issue.proposed}</strong>}
      {issue.code === 'confidence' && <button className="text-button" onClick={() => desk.accept(field.id)}>Accept</button>}
      {issue.options?.map(option => <button className="option-chip" key={option} onClick={() => desk.edit(field.id, option)}>{option}</button>)}
    </div>}
    {editing && <form className="quick-edit" onSubmit={event => {
      event.preventDefault()
      desk.edit(field.id, draft || 'clear')
      setDraft('')
      setEditing(false)
    }}><input aria-label={`New value for ${field.label}`} value={draft} onChange={event => setDraft(event.target.value)} autoFocus />
      <button className="icon-button" aria-label="Save value"><Check size={17} /></button>
      <button className="text-button" type="button" onClick={() => { setDraft(''); setEditing(false) }}>Cancel</button>
    </form>}
  </li>
}

interface Props {
  view: DeskView
  desk: DeskController | null
  mic: boolean
  meter: number
  error: string
  playback: boolean
  flowArmed: boolean
  dictation: RefObject<HTMLTextAreaElement | null>
  onFlow: () => void
  onPauseFlow: () => void
  onMic: () => void
  onLanguage: (language: Language) => void
}

export function Copilot({ view, desk, mic, meter, error, playback, flowArmed, dictation, onFlow, onPauseFlow, onMic, onLanguage }: Props) {
  const [typed, setTyped] = useState('')
  const [aliasStatus, setAliasStatus] = useState('')
  const aliasRun = useRef<AbortController | null>(null)
  useEffect(() => () => aliasRun.current?.abort(), [])
  const learnAliases = async () => {
    if (!desk) return
    aliasRun.current?.abort()
    const run = new AbortController()
    aliasRun.current = run
    setAliasStatus('Checking the local model…')
    try {
      const hints = await suggestAliases(view.fields.map(row => row.field), run.signal)
      if (run.signal.aborted) return
      desk.setExtraHints(hints)
      setAliasStatus(Object.keys(hints).length ? 'Additional labels ready for this form.' : 'Local model unavailable or no labels returned. Rules are active.')
    } catch {
      if (!run.signal.aborted) setAliasStatus('Local suggestions unavailable. Rules are active.')
    }
  }
  const filled = view.fields.filter(row => row.filled && !isCheckpoint(row.field)).length
  const issues = view.fields.filter(row => row.issue).length
  const ordered = [...view.fields].sort((a, b) => Number(Boolean(b.issue)) - Number(Boolean(a.issue)))
  return <aside id="voice-copilot" className="copilot" aria-label="Voice copilot">
    <header className="copilot-header">
      <span className="voice-icon"><AudioLines size={21} /></span>
      <div><h2>Voice copilot</h2><p>Munshi assistant</p></div>
      <span className={`status-pill ${view.phase.toLowerCase()}`}>{labels[view.phase]}</span>
    </header>
    <div className="voice-controls">
      <button type="button" className={`button flow-start ${flowArmed ? 'secondary' : 'primary'}`} onClick={onFlow} disabled={playback}
        aria-controls="typed-utterance"><AudioLines size={17} /> {flowArmed ? 'Focus Wispr Flow input' : 'Dictate with Wispr Flow'}</button>
      <label className="voice-language"><span>Speech language</span>
        <span className="select-wrap"><select aria-label="Speech language" value={view.language} disabled={playback} onChange={event => onLanguage(event.target.value as Language)}>
          <option value="hi">हिन्दी · Hindi</option><option value="bho">भोजपुरी · Bhojpuri</option><option value="hinglish">Hinglish</option>
          <option disabled>Kannada</option><option disabled>Tamil</option>
        </select><ChevronDown size={14} /></span>
      </label>
      <button className={`mic-button ${mic ? 'active' : ''}`} aria-label={mic ? 'Stop browser microphone' : 'Start browser microphone'} title={mic ? 'Stop browser microphone' : 'Start browser microphone'} onClick={onMic} disabled={playback}>
        {mic ? <MicOff size={20} /> : <Mic size={20} />}
      </button>
      <div className={`level ${mic ? 'active' : ''}`} aria-hidden="true"><i style={{ width: `${meter * 100}%` }} /></div>
      {error && <p className="voice-error" role="status">{error}</p>}
      <details className="mapper-settings">
        <summary>Mapping · local rules</summary>
        <p>Use an installed Chrome model to suggest extra phrases for form labels.</p>
        <button type="button" className="button quiet" disabled={playback || !desk} onClick={() => void learnAliases()}>Suggest extra labels</button>
        {aliasStatus && <p role="status">{aliasStatus}</p>}
      </details>
    </div>

    <section className="review">
      <div className="panel-heading"><h3>Field review</h3><span>{issues ? `${issues} to check` : `${filled} filled`}</span>
        <button className="icon-button" aria-label="Undo last voice edit" title="Undo last voice edit" disabled={!desk || view.phase === 'IDLE' || view.phase === 'PAUSED_MANUAL' || playback} onClick={() => desk?.undo()}><RotateCcw size={15} /></button>
      </div>
      <ul className="review-list">{desk && ordered.map(row => <ReviewField key={row.field.id} row={row} desk={desk} />)}</ul>
    </section>

    <section className="transcript">
      <div className="panel-heading"><h3>Transcript</h3>{view.source && <span>{sources[view.source]}</span>}<AudioLines size={15} /></div>
      <p className="transcript-line" aria-live="polite">{view.diff.length ? view.diff.map(({ type, text }, i) =>
        <span key={i} className={`token-${type}`}>{text}{type === 'replaced' ? <span className="diff-arrow"> → </span> : ' '}</span>,
      ) : <span className="transcript-empty">Spoken or typed entries appear here.</span>}</p>
    </section>

    <section className="verify">
      <div className="verify-state">{view.locked ? <LockKeyhole size={16} /> : <ShieldCheck size={17} />}
        <strong>{view.phase === 'READY' ? 'Submit unlocked' : view.completed ? 'Awaiting citizen confirmation' : 'Submit locked'}</strong>
      </div>
      <p role="status">{view.line || view.note}</p>
      {view.review.length > 0 && <details className="readback-list"><summary>View read-back</summary><ul>{view.review.map((line, i) => <li key={i}>{line}</li>)}</ul></details>}
      {view.phase === 'PAUSED_MANUAL' ? <button className="button secondary full" disabled={playback} onClick={() => desk?.resume()}>Resume</button> :
        view.phase === 'VERIFYING' && view.completed ? <button className="button primary full" disabled={playback} onClick={() => desk?.confirm()}><Check size={16} /> Confirm read-back</button> :
        <button className="button secondary full" disabled={playback || view.phase === 'VERIFYING' || view.phase === 'READY'} onClick={() => void desk?.verify()}><Ear size={17} /> Read back</button>}
    </section>

    <form className="voice-entry" onSubmit={event => {
      event.preventDefault()
      desk?.ingest({ text: typed, source: 'typed' })
      setTyped('')
      dictation.current?.focus()
    }}>
      <label htmlFor="typed-utterance">Dictation or typed utterance</label>
      {flowArmed && <div className="dictation-help"><p id="flow-help">Use your Wispr Flow shortcut in this box. A paste into an empty box applies as one turn.</p><button type="button" className="text-button" onClick={onPauseFlow}>Pause Flow capture</button></div>}
      <div>
        <textarea id="typed-utterance" ref={dictation} rows={2} aria-describedby={flowArmed ? 'flow-help' : undefined}
          placeholder={view.phase === 'PAUSED_MANUAL' ? 'Aage badho' : examples[view.language]} value={typed}
          onChange={event => setTyped(event.target.value)} disabled={playback} autoComplete="off" spellCheck={false} maxLength={MAX_UTTERANCE_LENGTH}
          onPaste={event => {
            const utterance = receiveDictationPaste(event.nativeEvent, flowArmed && !playback, typed)
            if (utterance) desk?.ingest(utterance)
          }}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              event.currentTarget.form?.requestSubmit()
            }
          }} />
        <button aria-label="Send utterance" title="Send utterance" className="button primary" disabled={!typed.trim() || playback}><Send size={16} /></button>
      </div>
    </form>
  </aside>
}

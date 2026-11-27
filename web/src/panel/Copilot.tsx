import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { ArrowRight, AudioLines, Check, ChevronDown, CircleAlert, Ear, Languages, LockKeyhole, Maximize2, Mic, MicOff, Pencil, RotateCcw, Send, ShieldCheck } from 'lucide-react'
import { CitizenReview } from './CitizenReview'
import { InterviewPrompt } from './InterviewPrompt'
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
  onGoToVerification: () => void
  onGoToSubmit: () => void
  onLanguage: (language: Language) => void
}

export function Copilot({ view, desk, mic, meter, error, playback, flowArmed, dictation, onFlow, onPauseFlow, onMic, onGoToVerification, onGoToSubmit, onLanguage }: Props) {
  const [typed, setTyped] = useState('')
  const [citizenOpen, setCitizenOpen] = useState(false)
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
  const [showAll, setShowAll] = useState(false)
  const visibleFields = view.fields.filter(row => showAll || row.issue || (row.filled && !isCheckpoint(row.field)))
    .sort((a, b) => Number(Boolean(b.issue)) - Number(Boolean(a.issue)))
  const manual = view.phase === 'PAUSED_MANUAL'
  const ready = view.phase === 'READY'
  const checking = view.phase === 'VERIFYING'

  return <aside id="voice-copilot" className="copilot" aria-label="Voice copilot">
    <header className="copilot-header">
      <div className="copilot-heading"><AudioLines size={24} /><h2>Voice desk</h2>
        <span className={`status-pill ${view.phase.toLowerCase()}`}><i aria-hidden="true" />{mic && !desk?.muted ? 'Mic on' : labels[view.phase]}</span>
      </div>
      <div className="voice-language">
        <Languages size={15} /><label htmlFor="speech-language">Speech language</label>
        <span className="select-wrap"><select id="speech-language" value={view.language} disabled={playback} onChange={event => onLanguage(event.target.value as Language)}>
          <option value="hi">हिन्दी · Hindi</option><option value="bho">भोजपुरी · Bhojpuri</option><option value="hinglish">Hinglish</option>
        </select><ChevronDown size={13} aria-hidden="true" /></span>
      </div>
      <div className="voice-sources">
        <button type="button" className={`button flow-start ${flowArmed ? 'armed' : ''}`} onClick={onFlow} disabled={playback}
          aria-controls="typed-utterance"><AudioLines size={17} />{flowArmed ? 'Focus Wispr Flow input' : 'Dictate with Wispr Flow'}</button>
        <button type="button" className={`button mic-button ${mic ? 'active' : ''}`} aria-label={mic ? 'Stop browser microphone' : 'Start browser microphone'}
          aria-pressed={mic} onClick={onMic} disabled={playback}>{mic ? <MicOff size={16} /> : <Mic size={16} />}{mic ? 'Stop mic' : 'Browser mic'}</button>
      </div>
      {mic && <div className="level" aria-hidden="true"><i style={{ width: `${meter * 100}%` }} /></div>}
      {error && <p className="voice-error" role="status">{error}</p>}
    </header>
    <section className="voice-controls" aria-label="Dictation controls">
      <form className="voice-entry" onSubmit={event => {
        event.preventDefault()
        desk?.ingest({ text: typed, source: 'typed' })
        setTyped('')
        dictation.current?.focus()
      }}>
        <div className="composer-label">
          <label htmlFor="typed-utterance">{flowArmed ? 'Dictation box' : 'Dictate or type here'}</label>
          {flowArmed && <button type="button" className="text-button" onClick={onPauseFlow}>Pause Flow capture</button>}
        </div>
        {flowArmed && <p className="dictation-help" id="flow-help">Use your Flow shortcut here. A paste into an empty box applies as one turn.</p>}
        <div className="composer-input">
          <textarea id="typed-utterance" ref={dictation} rows={2} aria-label="Dictation or typed utterance" aria-describedby={flowArmed ? 'flow-help' : undefined}
            placeholder={manual ? 'Aage badho' : examples[view.language]} value={typed}
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
          <button aria-label="Send utterance" title="Send utterance" className="button send" disabled={!typed.trim() || playback}><Send size={16} /></button>
        </div>
      </form>
      <InterviewPrompt desk={desk} view={view} disabled={playback} onAsk={() => dictation.current?.focus()} />
    </section>

    <section className={`verify${manual ? ' manual' : ready ? ' ready' : ''}`}>
      <div className="verify-state">{ready ? <ShieldCheck size={17} /> : checking ? <Ear size={17} /> : <LockKeyhole size={16} />}
        <strong>{ready ? 'Submit unlocked' : manual ? 'Verification code needed' :
          view.completed ? 'Awaiting citizen confirmation' : checking ? 'Citizen review' : 'Citizen read-back'}</strong>
      </div>
      <p role="status">{view.phase === 'IDLE' ? 'When the details are ready, read them back to the citizen.' : view.line || view.note}</p>
      {desk && view.review.length > 0 && <button className="button citizen-button" onClick={() => setCitizenOpen(true)}><Maximize2 size={15} /> Open citizen view</button>}
      {citizenOpen && desk && <CitizenReview desk={desk} view={view} playback={playback} onClose={() => setCitizenOpen(false)}
        onCorrect={() => requestAnimationFrame(() => dictation.current?.focus())} />}
      {view.review.length > 0 && <details className="readback-list" open={view.readbackFallback || undefined}><summary>View read-back</summary>
        <ul>{view.review.map((line, i) => <li key={i}>{line}</li>)}</ul></details>}
      {ready && <button className="button panel-button full" onClick={onGoToSubmit}>Go to submission <ArrowRight size={15} /></button>}
      {manual ? <div className="manual-actions">
        <button className="button panel-button" disabled={playback} onClick={onGoToVerification}>Go to verification</button>
        <button className="button panel-button" disabled={playback} onClick={() => desk?.resume()}>Resume</button>
      </div> : view.readbackFallback ?
        <button className="button panel-button full" disabled={playback} onClick={() => desk?.acknowledgeReadback()}><Check size={16} /> Mark details as reviewed</button> :
        checking && view.completed ?
          <button className="button panel-button full" disabled={playback} onClick={() => desk?.confirm()}><Check size={16} /> Confirm read-back</button> :
          !ready && <button className="button panel-button full" disabled={playback || checking || view.phase === 'IDLE' && !filled} onClick={() => void desk?.verify()}><Ear size={17} /> Read back</button>}
    </section>

    <section className="transcript">
      <div className="panel-heading"><h3>Last turn</h3>{view.source && <span>{sources[view.source]}</span>}</div>
      <p className="transcript-line" aria-live="polite">{view.diff.length ? view.diff.map(({ type, text }, i) =>
        <span key={i} className={`token-${type}`}>{text}{type === 'replaced' ? <span className="diff-arrow"> → </span> : ' '}</span>,
      ) : <span className="transcript-empty">Waiting for the first turn…</span>}</p>
    </section>

    <section className="review">
      <div className="panel-heading"><h3>Field review</h3><span>{issues ? `${issues} to check` : `${filled} filled`}</span>
        <button className="icon-button" aria-label="Undo last voice edit" title="Undo last voice edit" disabled={!desk || view.phase === 'IDLE' || manual || playback}
          onClick={() => desk?.undo()}><RotateCcw size={15} /></button>
      </div>
      {visibleFields.length ? <ul className="review-list">{desk && visibleFields.map(row => <ReviewField key={row.field.id} row={row} desk={desk} />)}</ul> :
        <p className="review-empty">Filled fields and corrections appear here.</p>}
      {desk && view.fields.length > visibleFields.length && <button className="text-button field-toggle" onClick={() => setShowAll(true)}>Show all fields</button>}
      {showAll && <button className="text-button field-toggle" onClick={() => setShowAll(false)}>Show filled fields</button>}
    </section>
    <details className="mapper-settings">
      <summary>Mapping settings</summary>
      <p>Use an installed Chrome model to suggest extra phrases for form labels.</p>
      <button type="button" className="button panel-button" disabled={playback || !desk} onClick={() => void learnAliases()}>Suggest extra labels</button>
      {aliasStatus && <p role="status">{aliasStatus}</p>}
    </details>
  </aside>
}

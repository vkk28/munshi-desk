import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AudioLines, BookOpen, Check, ChevronDown, CircleHelp, ClipboardList, FileText, LayoutGrid, LockKeyhole, Play, RotateCcw, Square } from 'lucide-react'
import { BrowserSpeaker, DeskController, speechLocale, startMeter, WebSpeechSttAdapter, isCheckpoint, type DeskView } from '@munshi/engine'
import { Copilot } from './panel/Copilot'
import { portals, PracticeForm, practiceCode, type Portal } from './portals/PracticeForm'
import { playScenario, scenarios } from './samples/scenarios'
import '@fontsource-variable/dm-sans/wght.css'
import '@fontsource-variable/newsreader/wght.css'
import '@fontsource-variable/noto-sans-devanagari/wght.css'
import './styles.css'

const empty: DeskView = {
  phase: 'IDLE', language: 'hi', diff: [], note: 'Start a session to fill this form with voice or text.',
  line: '', review: [], locked: true, fields: [], completed: false,
}
const portalFromHash = (): Portal => {
  const target = location.hash.slice(1)
  return Object.hasOwn(portals, target) ? target as Portal : 'pension'
}
const navigation: Portal[] = ['pension', 'domicile', 'grievance', 'residence']

function Workspace() {
  const [portal, setPortal] = useState(portalFromHash)
  const [request, setRequest] = useState<string | null>(null)
  const [generation, setGeneration] = useState(0)
  const navigate = (next: Portal) => {
    if (location.hash !== '#' + next) history.pushState(null, '', '#' + next)
    setPortal(next)
  }
  useEffect(() => {
    const listener = () => setPortal(portalFromHash())
    window.addEventListener('hashchange', listener)
    return () => window.removeEventListener('hashchange', listener)
  }, [])
  return <PracticeDesk key={portal + ':' + generation} portal={portal} request={request} afterRequest={() => setRequest(null)}
    onPortal={next => { setRequest(null); navigate(next) }}
    onSample={id => {
      const scenario = scenarios.find(item => item.id === id)
      if (!scenario) return
      navigate(scenario.portal)
      setGeneration(value => value + 1)
      setRequest(id)
    }} />
}

interface DeskProps {
  portal: Portal
  request: string | null
  onPortal: (next: Portal) => void
  onSample: (id: string) => void
  afterRequest: () => void
}

function PracticeDesk({ portal, request, onPortal, onSample, afterRequest }: DeskProps) {
  const formRoot = useRef<HTMLDivElement>(null)
  const desk = useRef<DeskController | null>(null)
  const dictation = useRef<HTMLTextAreaElement>(null)
  const stt = useRef(new WebSpeechSttAdapter())
  const meterRun = useRef<AbortController | null>(null)
  const run = useRef<AbortController | null>(null)
  const [view, setView] = useState(empty)
  const [revision, setRevision] = useState(0)
  const [submitted, setSubmitted] = useState(false)
  const receipt = useRef<HTMLElement>(null)
  useEffect(() => { if (submitted) receipt.current?.focus() }, [submitted])
  const [mic, setMic] = useState(false)
  const [flowArmed, setFlowArmed] = useState(false)
  const [meter, setMeter] = useState(0)
  const [error, setError] = useState('')
  const samples = scenarios.filter(item => item.portal === portal)
  const [sample, setSample] = useState(samples[0].id)
  const [step, setStep] = useState('')
  const [turn, setTurn] = useState<{ index: number; total: number } | null>(null)
  const [playback, setPlayback] = useState(false)
  const [pendingSwitch, setPendingSwitch] = useState<{ next: () => void; label: string } | null>(null)
  const switchDialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { if (pendingSwitch) switchDialog.current?.showModal() }, [pendingSwitch])

  const stopMic = useCallback(() => {
    stt.current.stop()
    meterRun.current?.abort()
    setMic(false)
    setMeter(0)
  }, [])

  useLayoutEffect(() => {
    const controller = new DeskController(formRoot.current!, {
      speaker: new BrowserSpeaker(playing => stt.current.setSuspended(playing)), holdIdle: true, onChange: setView,
      onSubmit: () => {
        stopMic()
        setFlowArmed(false)
        run.current?.abort()
        setPlayback(false)
        setStep('')
        setTurn(null)
        setSubmitted(true)
        setRevision(previous => previous + 1)
      },
    })
    desk.current = controller
    return () => {
      stt.current.stop()
      meterRun.current?.abort()
      run.current?.abort()
      controller.dispose()
      desk.current = null
    }
  }, [stopMic])

  useLayoutEffect(() => { desk.current?.rescan() }, [revision])

  useEffect(() => {
    const scenario = scenarios.find(item => item.id === request)
    const controller = desk.current
    if (!scenario || !controller) return
    setSample(scenario.id)
    setPlayback(true)
    const playbackRun = new AbortController()
    run.current = playbackRun
    void playScenario(scenario, controller, {
      signal: playbackRun.signal,
      onStep: (text, index, total) => {
        setStep(text)
        setTurn({ index, total })
      },
      fillPracticeCode: () => {
        const field = formRoot.current?.querySelector<HTMLInputElement>('.checkpoint')
        if (!field) return
        field.value = practiceCode
        field.dispatchEvent(new Event('input', { bubbles: true }))
      },
    }).finally(() => {
      if (run.current !== playbackRun || playbackRun.signal.aborted) return
      setPlayback(false)
      setTurn(null)
      setStep(controller.view.phase === 'READY' ? 'Sample complete. The practice form is ready to submit.' : 'Sample complete. Review the form in the copilot.')
    })
    afterRequest()
  }, [request])

  const armFlow = () => {
    if (playback) return
    setSubmitted(false)
    stopMic()
    setError('')
    setFlowArmed(true)
    if (desk.current?.view.phase === 'IDLE') desk.current.start()
    dictation.current?.focus()
  }

  const toggleMic = () => {
    const controller = desk.current
    if (mic) return stopMic()
    if (!controller) return
    setSubmitted(false)
    setError('')
    setFlowArmed(false)
    controller.start()
    const meterController = new AbortController()
    meterRun.current = meterController
    const started = stt.current.start(speechLocale(view.language), {
      final: utterance => controller.ingest(utterance), muted: () => controller.muted,
      listening: setMic, error: message => { stopMic(); setError(message) },
    })
    if (started) void startMeter(setMeter, meterController.signal)
  }

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.altKey && event.code === 'KeyM' && !event.repeat) {
        event.preventDefault()
        armFlow()
      }
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  })

  const stopSample = () => {
    run.current?.abort()
    setPlayback(false)
    setTurn(null)
    setStep('Sample paused. You can continue with voice or text.')
  }

  const reset = () => {
    stopMic()
    setFlowArmed(false)
    run.current?.abort()
    setPlayback(false)
    setStep('')
    setTurn(null)
    setError('')
    setSubmitted(false)
    desk.current?.reset()
    setRevision(value => value + 1)
  }
  const current = portals[portal]
  const required = view.fields.filter(({ field }) => field.required && !isCheckpoint(field))
  const ready = required.filter(({ filled, issue }) => filled && !issue).length
  const goToVerification = () => {
    const field = formRoot.current?.querySelector<HTMLInputElement>('.checkpoint')
    field?.focus({ preventScroll: true })
    field?.scrollIntoView({ block: 'center' })
  }

  const checkpoint = view.fields.some(row => isCheckpoint(row.field))
  const hasIssues = view.fields.some(row => row.issue)
  const captureDone = required.length > 0 && ready === required.length && !hasIssues
  const showReceipt = submitted && view.phase === 'IDLE' && !view.fields.some(row => row.filled || row.issue)
  const stage = showReceipt || view.phase === 'READY' ? 'Submit'
    : view.phase === 'VERIFYING' ? 'Citizen review'
    : view.phase === 'PAUSED_MANUAL' ? 'Manual check'
    : captureDone && (!checkpoint || view.fields.filter(row => isCheckpoint(row.field)).every(row => row.filled)) ? 'Citizen review' : 'Capture details'
  const stages = ['Capture details', ...(checkpoint ? ['Manual check'] : []), 'Citizen review', 'Submit']
  const replaceSession = (label: string, next: () => void) => {
    if (view.fields.some(row => row.filled || row.issue) || dictation.current?.value.trim() || playback) setPendingSwitch({ label, next })
    else next()
  }
  const goToApplication = () => {
    const application = document.getElementById('application')
    application?.focus({ preventScroll: true })
    application?.scrollIntoView({ block: 'start' })
  }

  return <>
    <a className="skip-link" href="#application" onClick={event => { event.preventDefault(); goToApplication() }}>Skip to application</a>
    <header className="app-header"><div className="header-inner">
      <a href="#pension" className="brand" onClick={event => {
        event.preventDefault()
        if (portal !== 'pension') replaceSession('Open Old Age Pension', () => onPortal('pension'))
      }}>
        <span className="brand-mark"><BookOpen size={23} strokeWidth={1.8} /></span>
        Munshi Desk
      </a>
      <span className="header-context" lang="hi">मुंशी डेस्क</span>
      <div className="header-right">
        <span className="practice-pill"><i aria-hidden="true" /> Practice workspace</span>
        <details className="help">
          <summary aria-label="How to use Munshi Desk"><CircleHelp size={17} /><span>Help</span></summary>
          <div><strong>At the service counter</strong><p>Use fictional details. Select a service, then use your Wispr Flow shortcut in the dictation box, speak with the browser mic, or type a turn.</p><p>Enter the practice code by hand. Say “Read back” so the citizen can hear and correct the details. Say “Haan” after review to unlock submission.</p><p><kbd>Alt</kbd> + <kbd>M</kbd> focuses the Flow input.</p></div>
        </details>
      </div>
    </div></header>
    <div className="service-bar">
      <nav className="service-list" aria-label="Practice portals">
        <span className="nav-heading"><LayoutGrid size={15} /> Services</span>
        {navigation.map(id => {
          const entry = portals[id]
          const Icon = entry.icon
          return <button key={id} className={portal === id ? 'nav-item selected' : 'nav-item'}
            aria-current={portal === id ? 'page' : undefined} onClick={() => {
              if (portal !== id) replaceSession('Open ' + entry.nav, () => onPortal(id))
            }}><Icon size={16} /><span>{entry.nav}</span></button>
        })}
      </nav>
    </div>

    <main className="workspace">
      <section className="workspace-heading" aria-labelledby="service-title">
        <div className="case-title">
          <p className="breadcrumb">{current.subtitle}<span aria-hidden="true">/</span><span lang="hi">{current.hindi}</span></p>
          <h1 id="service-title">{current.title}</h1>
          <p className="page-description">{current.description}</p>
          <div className="sample-actions">
            {playback ? <button className="button sample-play" onClick={stopSample}><Square size={13} /> Stop walkthrough</button> :
              <button className="button sample-play" onClick={() => replaceSession('Play walkthrough', () => onSample(sample))}><Play size={14} fill="currentColor" /> Play walkthrough</button>}
            {samples.length > 1 && <label className="select-wrap sample-select"><select aria-label="Sample conversation" value={sample} disabled={playback} onChange={event => setSample(event.target.value)}>
              {samples.map(item => <option key={item.id} title={item.detail} value={item.id}>{item.title}</option>)}
            </select><ChevronDown size={13} aria-hidden="true" /></label>}
          </div>
        </div>
        <img className="hero-art" src={new URL('./assets/service-counter.jpg', import.meta.url).href} width="840" height="560" alt="" />
      </section>

      {step && <div className="walkthrough-status" role="status"><AudioLines size={18} />
        {turn && <strong>Sample {turn.index}/{turn.total}</strong>}<span>{step}</span>
      </div>}
      <ol className="case-stages" aria-label="Application progress">
        {stages.map((label, i) => {
          const done = showReceipt || i < stages.indexOf(stage)
          return <li key={label} className={done ? 'done' : label === stage ? 'current' : ''} aria-current={!done && label === stage ? 'step' : undefined}>
            <span className="stage-number">{done ? <Check size={13} /> : i + 1}</span>{label}
          </li>
        })}
      </ol>

      <div className="case-workspace">
        <Copilot key={revision} view={view} desk={desk.current} mic={mic} meter={meter} error={error} playback={playback}
          flowArmed={flowArmed} dictation={dictation} onFlow={armFlow} onPauseFlow={() => setFlowArmed(false)} onMic={toggleMic}
          onGoToVerification={goToVerification} onGoToSubmit={() => {
            const button = formRoot.current?.querySelector<HTMLButtonElement>('button[type=submit]')
            button?.focus({ preventScroll: true })
            button?.scrollIntoView({ block: 'center' })
          }} onLanguage={language => {
            if (mic) stopMic()
            desk.current?.setLanguage(language)
          }} />

        <div className="application" id="application" tabIndex={-1}>
          {showReceipt && <aside className="receipt" ref={receipt} tabIndex={-1} role="status"><Check size={21} />
            <div><strong>Practice form submitted</strong><p>The citizen confirmed the details. This practice session has been cleared.</p></div>
            <button className="button quiet" onClick={() => { setSubmitted(false); armFlow() }}>New application</button></aside>}
          <div className="form-card" ref={formRoot} onInputCapture={() => { if (submitted) setSubmitted(false) }}>
            <div className="form-card-header">
              <div className="form-title"><ClipboardList size={21} /><h2>Application form</h2></div>
              <div className="form-card-actions">
                {required.length > 0 && <span className="required-progress"><progress aria-label="Required fields completed" value={ready} max={required.length} />{ready}/{required.length} required</span>}
                <button className="reset" onClick={() => replaceSession('Reset application', reset)} aria-label="Reset" title="Reset application"><RotateCcw size={16} /></button>
              </div>
            </div>
            <PracticeForm key={revision} portal={portal} locked={view.locked}
              onResume={view.phase === 'PAUSED_MANUAL' && !playback ? () => {
                const controller = desk.current
                controller?.resume()
                if (controller?.view.phase === 'PAUSED_MANUAL') {
                  const code = formRoot.current?.querySelector<HTMLInputElement>('.checkpoint')
                  code?.focus()
                  code?.reportValidity()
                } else dictation.current?.focus()
              } : undefined} />
          </div>
          <p className="practice-note"><LockKeyhole size={13} /> Practice entries stay in this session. Use fictional details.</p>
        </div>
      </div>
    </main>
    {pendingSwitch && <dialog className="switch-dialog" ref={switchDialog} onClose={() => setPendingSwitch(null)}>
      <FileText size={24} /><h2>Clear this application?</h2><p>The current entries and review will be cleared.</p>
      <div className="dialog-actions"><button className="button" autoFocus onClick={() => switchDialog.current?.close()}>Keep working</button>
        <button className="button primary" onClick={() => { const next = pendingSwitch.next; switchDialog.current?.close(); next() }}>{pendingSwitch.label}</button></div>
    </dialog>}
  </>
}

createRoot(document.getElementById('root')!).render(<Workspace />)

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AudioLines, ArrowRight, Check, ChevronDown, CircleHelp, FlaskConical, Headphones, LockKeyhole, Play, RotateCcw, Square } from 'lucide-react'
import { BrowserSpeaker, DeskController, speechLocale, startMeter, WebSpeechSttAdapter, type DeskView } from '@munshi/engine'
import { Copilot } from './panel/Copilot'
import { portals, PracticeForm, practiceCode, type Portal } from './portals/PracticeForm'
import { playScenario, scenarios } from './samples/scenarios'
import './styles.css'

const empty: DeskView = {
  phase: 'IDLE', language: 'hi', diff: [], note: 'Start a session to fill this form with voice or text.',
  line: '', review: [], locked: true, fields: [], completed: false,
}
const portalFromHash = (): Portal => {
  const target = location.hash.slice(1)
  return Object.hasOwn(portals, target) ? target as Portal : 'pension'
}
const navigation: Portal[] = ['pension', 'domicile', 'grievance']

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
  const stt = useRef(new WebSpeechSttAdapter())
  const meterRun = useRef<AbortController | null>(null)
  const run = useRef<AbortController | null>(null)
  const [view, setView] = useState(empty)
  const [revision, setRevision] = useState(0)
  const [submitted, setSubmitted] = useState(false)
  const [mic, setMic] = useState(false)
  const [meter, setMeter] = useState(0)
  const [error, setError] = useState('')
  const [sample, setSample] = useState(scenarios[0].id)
  const [step, setStep] = useState('')
  const [playback, setPlayback] = useState(false)
  const [showLabs, setShowLabs] = useState(portal === 'residence')

  const stopMic = useCallback(() => {
    stt.current.stop()
    meterRun.current?.abort()
    setMic(false)
    setMeter(0)
  }, [])

  useLayoutEffect(() => {
    const controller = new DeskController(formRoot.current!, {
      speaker: new BrowserSpeaker(), holdIdle: true, onChange: setView,
      onSubmit: () => {
        stopMic()
        run.current?.abort()
        setPlayback(false)
        setStep('')
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
      onStep: (text, index, total) => setStep(`${index}/${total} · ${text}`),
      fillPracticeCode: () => {
        const field = formRoot.current?.querySelector<HTMLInputElement>('.checkpoint')
        if (!field) return
        field.value = practiceCode
        field.dispatchEvent(new Event('input', { bubbles: true }))
      },
    }).finally(() => {
      if (run.current !== playbackRun || playbackRun.signal.aborted) return
      setPlayback(false)
      setStep(controller.view.phase === 'READY' ? 'Sample complete. The practice form is ready to submit.' : 'Sample complete. Review the form in the copilot.')
    })
    afterRequest()
  }, [request])

  const toggleMic = () => {
    const controller = desk.current
    if (mic) return stopMic()
    if (!controller) return
    setError('')
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
        if (!playback) toggleMic()
      }
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  })

  const stopSample = () => {
    run.current?.abort()
    setPlayback(false)
    setStep('Sample paused. You can continue with voice or text.')
  }

  const reset = () => {
    stopMic()
    run.current?.abort()
    setPlayback(false)
    setStep('')
    setError('')
    setSubmitted(false)
    desk.current?.reset()
    setRevision(value => value + 1)
  }
  const current = portals[portal]
  const PortalIcon = current.icon

  return <>
    <header className="app-header">
      <a href="#pension" className="brand" onClick={event => { event.preventDefault(); onPortal('pension') }}>
        <span className="brand-mark"><AudioLines size={23} /></span>
        <span>Munshi<span>Desk</span><small>Assisted civic services</small></span>
      </a>
      <span className="header-divider" />
      <span className="header-context">Operator workspace</span>
      <div className="header-right">
        <a href="#voice-copilot" className="mobile-copilot" onClick={event => { event.preventDefault(); document.getElementById('voice-copilot')?.scrollIntoView({ block: 'start' }) }}>Voice copilot</a>
        <span className="practice-pill"><FlaskConical size={15} /> Practice mode</span>
        <details className="help">
          <summary aria-label="How to use Munshi Desk"><CircleHelp size={20} /></summary>
          <div><strong>How to use Munshi Desk</strong><p>Choose a service and start the microphone or type what the citizen says. Voice recognition may use your browser’s speech service. Use practice details here.</p><p>Say “Read back” to verify. After it finishes, say “Haan” to unlock Submit. Press <kbd>Alt</kbd> + <kbd>M</kbd> to toggle the microphone.</p></div>
        </details>
      </div>
    </header>
    <div className="workspace">
      <nav className="sidebar" aria-label="Practice portals">
        <p className="nav-heading">Practice portals</p>
        {navigation.map(id => {
          const entry = portals[id]
          const NavIcon = entry.icon
          return <button key={id} className={`nav-item ${portal === id ? 'selected' : ''}`} onClick={() => onPortal(id)}
            aria-current={portal === id ? 'page' : undefined}>
            <NavIcon size={19} /><span>{entry.nav}<small>{entry.subtitle}</small></span>{portal === id && <i />}
          </button>
        })}
        <div className="sidebar-rule" />
        <button className="lab-button" aria-expanded={showLabs} onClick={() => setShowLabs(!showLabs)}><FlaskConical size={17} /> More portals <ChevronDown size={14} /></button>
        {showLabs && <button className={`nav-item ${portal === 'residence' ? 'selected' : ''}`} onClick={() => onPortal('residence')}>
          <portals.residence.icon size={19} /><span>Residence Register<small>Mixed-label portal</small></span>
        </button>}
        <div className="sidebar-foot"><LockKeyhole size={15} /><span>Practice entries clear when the session ends.</span></div>
      </nav>

      <main className="main">
        <div className="workspace-heading">
          <div><p className="breadcrumb">Service desk <span>/</span> {current.subtitle}</p><h1>{current.title}</h1><p className="page-description">{current.description}</p></div>
          <button className="button quiet" onClick={reset}><RotateCcw size={15} /> Reset</button>
        </div>
        <section className="sample-strip" aria-label="Sample conversations">
          <span className="sample-icon"><Headphones size={19} /></span>
          <div className="sample-copy"><h2>Try a sample conversation</h2><p>{step || 'Watch the form fill and verify without a microphone.'}</p></div>
          <div className="sample-actions">
            <label className="select-wrap"><select aria-label="Sample conversation" value={sample} disabled={playback} onChange={event => setSample(event.target.value)}>
              {scenarios.map(item => <option key={item.id} title={item.detail} value={item.id}>{item.title}</option>)}
            </select><ChevronDown size={14} /></label>
            {playback ? <button className="button secondary" onClick={stopSample}><Square size={15} /> Stop</button> :
              <button className="button secondary play" onClick={() => onSample(sample)}><Play size={15} fill="currentColor" /> Play</button>}
          </div>
        </section>
        {submitted && <aside className="receipt" role="status"><span><Check size={18} /></span>
          <div><strong>Practice form submitted</strong><p>The session and practice values have been cleared.</p></div>
          <button className="button quiet" onClick={() => setSubmitted(false)}>New form <ArrowRight size={15} /></button></aside>}
        <div className="form-card" ref={formRoot}>
          <div className="form-card-header"><span className="form-card-icon"><PortalIcon size={20} /></span>
            <div><h2>Application form</h2><p><b className="required">*</b> Required fields</p></div></div>
          <PracticeForm key={revision} portal={portal} locked={view.locked} />
        </div>
      </main>
      <Copilot key={revision} view={view} desk={desk.current} mic={mic} meter={meter} error={error} playback={playback}
        onMic={toggleMic} onLanguage={language => {
          if (mic) stopMic()
          desk.current?.setLanguage(language)
        }} />
    </div>
  </>
}

createRoot(document.getElementById('root')!).render(<Workspace />)

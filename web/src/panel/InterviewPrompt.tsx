import { MessageCircleQuestion, RotateCcw, X } from 'lucide-react'
import { nextInterviewQuestion, type DeskController, type DeskView } from '@munshi/engine'

export function InterviewPrompt({ desk, view, disabled, onAsk }: {
  desk: DeskController | null
  view: DeskView
  disabled?: boolean
  onAsk?: () => void
}) {
  if (disabled || (view.phase !== 'IDLE' && view.phase !== 'LISTENING')) return null
  if (!nextInterviewQuestion(view.fields, view.language)) return null
  const question = view.interview
  return <div className="interview-prompt">
    <button type="button" className="text-button" disabled={!desk} onClick={() => {
      desk?.askNextQuestion()
      onAsk?.()
    }}>{question ? <RotateCcw size={14} aria-hidden="true" /> : <MessageCircleQuestion size={15} aria-hidden="true" />}
      {question ? 'Repeat question' : 'Ask next question'}</button>
    {question && <>
      <button type="button" className="icon-button" aria-label="Dismiss question" onClick={() => desk?.dismissInterview()}><X size={15} aria-hidden="true" /></button>
      <p className="interview-question" lang={view.language === 'hinglish' ? 'en-IN' : view.language} aria-live="polite">{question.text}</p>
    </>}
  </div>
}

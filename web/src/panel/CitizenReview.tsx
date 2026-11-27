import { useEffect, useRef } from 'react'
import { Check, Ear, MessageCircle, X } from 'lucide-react'
import type { DeskController, DeskView } from '@munshi/engine'

const copy = {
  hi: {
    title: 'अपनी जानकारी जाँचें', listen: 'हर जानकारी सुनें। कुछ गलत लगे तो उसे बदलवा सकते हैं।',
    screen: 'आवाज़ उपलब्ध नहीं है। हर जानकारी पढ़ें या ऑपरेटर से सुनें।',
    acknowledge: 'मैंने जानकारी जाँच ली है', confirm: 'हाँ, सब सही है', correct: 'जानकारी बदलें',
    confirmed: 'आपने जानकारी की पुष्टि कर दी है।', close: 'डेस्क पर लौटें',
  },
  bho: {
    title: 'आपन जानकारी जाँच लीं', listen: 'हर बात सुन लीं। कुछ गलत बा त बताईं।',
    screen: 'आवाज नइखे आ रहल। जानकारी पढ़ लीं भा ऑपरेटर से सुन लीं।',
    acknowledge: 'हम जानकारी जाँच लिहनी', confirm: 'हाँ, सब सही बा', correct: 'जानकारी बदलीं',
    confirmed: 'रउआ जानकारी सही बतवनी।', close: 'डेस्क पर लवटीं',
  },
  hinglish: {
    title: 'Check your details', listen: 'Listen to each detail. You can correct anything that sounds wrong.',
    screen: 'Audio is unavailable. Read each detail or ask the operator to read it aloud.',
    acknowledge: 'I have reviewed these details', confirm: 'Haan, everything is correct', correct: 'Change a detail',
    confirmed: 'You confirmed these details.', close: 'Return to desk',
  },
}

export function CitizenReview({ view, desk, playback, onClose, onCorrect }: {
  view: DeskView; desk: DeskController; playback: boolean; onClose: () => void; onCorrect: () => void
}) {
  const modal = useRef<HTMLDialogElement>(null)
  const words = copy[view.language]
  const ready = view.phase === 'READY'
  useEffect(() => {
    const dialog = modal.current!
    dialog.showModal()
    return () => dialog.close()
  }, [])
  useEffect(() => {
    if (!view.review.length) modal.current?.close()
  }, [view.review.length])
  return <dialog ref={modal} className="citizen-dialog" aria-labelledby="citizen-title" onClose={onClose} lang={view.language === 'hinglish' ? 'en-IN' : view.language}>
    <header>
      <div className="citizen-kicker"><Ear size={18} /><span lang="en">Citizen review</span></div>
      <button className="icon-button" aria-label={words.close} onClick={() => modal.current?.close()}><X size={20} /></button>
      <h2 id="citizen-title">{words.title}</h2>
      <p>{ready ? words.confirmed : view.readbackFallback ? words.screen : words.listen}</p>
    </header>
    <dl>{view.review.map((line, i) => {
      const split = line.indexOf(', ')
      return <div key={i} className={view.line === line ? 'reading' : ''}>
        <dt>{split >= 0 ? line.slice(0, split) : ''}</dt><dd>{split >= 0 ? line.slice(split + 2) : line}</dd>
      </div>
    })}</dl>
    <footer>
      {ready ? <button className="button primary" onClick={() => modal.current?.close()}><Check size={17} />{words.close}</button> : <>
        <button className="button" disabled={playback} onClick={() => {
          modal.current?.close()
          desk.requestCorrection()
          onCorrect()
        }}><MessageCircle size={17} />{words.correct}</button>
        {view.readbackFallback ? <button className="button primary" disabled={playback} onClick={() => desk.acknowledgeReadback()}>{words.acknowledge}</button> :
          <button className="button primary" disabled={playback || !view.completed} onClick={() => desk.confirm()}><Check size={17} />{words.confirm}</button>}
      </>}
    </footer>
  </dialog>
}

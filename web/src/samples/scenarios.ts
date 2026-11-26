import { ageAt, type DeskController, type Language } from '@munshi/engine'
import type { Portal } from '../portals/PracticeForm'

type Step = { text: string } | { manual: true } | { read: true } | { wait: true }
interface Scenario { id: string; title: string; detail: string; language: Language; portal: Portal; steps: () => Step[] }
const say = (text: string): Step => ({ text })
const age = () => ageAt({ day: 15, month: 8, year: 1962 }, new Date())
const agePhrase = () => `Janm tithi pandrah August unnis sau baasath, umar ${age()}`

export const scenarios: Scenario[] = [
  {
    id: 'guided', title: 'Pension from start to finish', detail: 'Corrections, manual OTP and citizen confirmation', language: 'hinglish', portal: 'pension',
    steps: () => [
      say(`Um, naam Ramdhari Yadav, umar ${age() - 2}`),
      say(`um, nahi, ${age()}`),
      say('Father name Suresh Yadav, current address Gandhi Maidan, district Patna, state Bihar'),
      say('Permanent address same as current'),
      say('Janm tithi pandrah August unnis sau baasath, pincode 800001'),
      { manual: true }, say('Aage badho'), { read: true },
      say(`Nahi, umar ${age() + 1} hai`), { wait: true }, say('Haan'),
    ],
  },
  {
    id: 'bhojpuri', title: 'Bhojpuri at a busy desk', detail: 'Natural speech, a follow-up question and background chatter', language: 'bho', portal: 'pension',
    steps: () => [
      say(`Hamaar naam Ramdhari Yadav ba, umar ${age()} saal ba`),
      say('Bhaiya do cup chai bol dena'),
      say('Pincode kya hai?'), say('aath double zero double zero ek'),
      say('जन्म तिथि पंद्रह अगस्त उन्नीस सौ बासठ'),
      { manual: true }, say('Aage badho'), { read: true }, say('Theek ba'),
    ],
  },
  {
    id: 'safety', title: 'Catch a conflicting application', detail: 'Invalid PIN and an age that disagrees with the birth date', language: 'hinglish', portal: 'pension',
    steps: () => [
      say('Name Meera Devi, pincode 80001'),
      say(`Janm tithi pandrah August unnis sau assi, umar ${age()}`),
      say('Haan'), { read: true },
      say('पिनकोड गलत है ८००००१ करो'),
      say(agePhrase()), { manual: true }, say('Aage badho'), { read: true }, say('Haan'),
    ],
  },
]

function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>(resolve => {
    if (signal.aborted) return resolve()
    const finish = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', finish)
      resolve()
    }
    const timer = setTimeout(finish, ms)
    signal.addEventListener('abort', finish, { once: true })
  })
}

export async function playScenario(scenario: Scenario, controller: DeskController, options: {
  signal: AbortSignal
  fillPracticeCode: () => void
  onStep: (text: string, index: number, total: number) => void
  pace?: number
}) {
  const { signal, fillPracticeCode, onStep, pace = 1350 } = options
  const steps = scenario.steps()
  controller.setLanguage(scenario.language)
  controller.start()
  for (const [index, step] of steps.entries()) {
    if (signal.aborted) return
    if ('text' in step) {
      onStep(step.text, index + 1, steps.length)
      controller.ingest({ text: step.text })
    } else if ('manual' in step) {
      onStep('Sample operator enters the practice code on the form', index + 1, steps.length)
      fillPracticeCode()
    } else if ('read' in step) {
      onStep('Citizen reads back the application', index + 1, steps.length)
      await controller.verify()
    }
    if (controller.view.phase === 'VERIFYING') {
      while (!signal.aborted && controller.view.phase === 'VERIFYING' && !controller.view.completed) {
        await delay(80, signal)
      }
    }
    await delay(pace, signal)
  }
}

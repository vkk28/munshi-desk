import type { Phase } from './types'

export type DeskEvent = 'START' | 'PAUSE' | 'RESUME' | 'READ_BACK' | 'CONFIRM' | 'EDIT' | 'SUBMITTED' | 'RESET'
interface Guards { clear?: boolean; completed?: boolean }

export function transition(phase: Phase, event: DeskEvent, guards: Guards = {}): Phase {
  if (event === 'RESET') return 'IDLE'
  if (phase === 'IDLE' && event === 'START') return 'LISTENING'
  if (phase === 'LISTENING' && event === 'PAUSE') return 'PAUSED_MANUAL'
  if (phase === 'PAUSED_MANUAL' && event === 'RESUME') return 'LISTENING'
  if (phase === 'LISTENING' && event === 'READ_BACK' && guards.clear) return 'VERIFYING'
  if (phase === 'VERIFYING' && event === 'CONFIRM' && guards.clear && guards.completed) return 'READY'
  if ((phase === 'VERIFYING' || phase === 'READY') && event === 'EDIT') return 'LISTENING'
  if (phase === 'READY' && event === 'SUBMITTED' && guards.clear) return 'IDLE'
  return phase
}

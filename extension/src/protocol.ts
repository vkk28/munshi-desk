import type { DeskView, Language, Utterance } from '@munshi/engine'

export const portName = 'munshi-active-form'

export type PanelMessage =
  | { type: 'utterance'; value: Utterance }
  | { type: 'language'; value: Language }
  | { type: 'start' | 'ask' | 'dismiss-question' | 'read' | 'confirm' | 'acknowledge-readback' | 'undo' | 'resume' }
  | { type: 'spoken'; id: number; success: boolean }
  | { type: 'line'; id: number; text: string }
export type PageMessage =
  | { type: 'view'; value: DeskView }
  | { type: 'speak'; id: number; lines: string[]; locale: string }
  | { type: 'cancel' }
  | { type: 'submitted' }

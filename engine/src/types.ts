export type Language = 'hi' | 'bho' | 'hinglish'
export type Phase = 'IDLE' | 'LISTENING' | 'PAUSED_MANUAL' | 'VERIFYING' | 'READY'
export type Kind = 'text' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'date'
export type Semantic = 'name' | 'father_name' | 'age' | 'dob' | 'date' | 'pincode' | 'mobile' |
  'aadhaar' | 'address' | 'permanent_address' | 'same_address' | 'district' | 'state' |
  'village' | 'gender' | 'description' | 'ward' | 'free' | 'otp' | 'captcha'
export type DateFormat = 'DD/MM/YYYY' | 'YYYY-MM-DD' | 'MM/DD/YYYY'

export interface Field {
  id: string
  kind: Kind
  label: string
  hints: string[]
  semantic: Semantic
  options: string[]
  required: boolean
  maxLength?: number
  dateFormat?: DateFormat
  manualOnly?: boolean
  writable: boolean
}

export interface Schema { formId: string; fields: Field[] }
export type DiffKind = 'kept' | 'filler' | 'replaced' | 'replacement' | 'ignored'
export interface Diff { type: DiffKind; text: string }
export type InputSource = 'wispr-flow' | 'browser-mic' | 'typed' | 'sample'
export interface Utterance { text: string; confidence?: number; source?: InputSource }
export interface Patch {
  fieldId: string
  value: string
  previousValue: string
  op: 'set' | 'append' | 'clear' | 'copy'
  span: string
  confidence?: number
  lowConfidence?: boolean
}
export interface Candidate { field: Field; raw: string; op?: Patch['op'] }
export interface Issue {
  code: 'invalid' | 'mismatch' | 'confidence' | 'choice' | 'manual'
  message: string
  proposed?: string
  options?: string[]
}

export const isCheckpoint = (field: Field) => field.semantic === 'otp' || field.semantic === 'captcha'

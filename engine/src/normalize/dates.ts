import type { DateFormat } from '../types'
import { parseNumber } from './numbers'

const months = [
  'jan january janvari', 'feb february farvari', 'mar march maarch', 'apr april aprail',
  'may mai', 'jun june joon', 'jul july julai', 'aug august agast', 'sep sept september sitambar',
  'oct october aktubar', 'nov november navambar', 'dec december disambar',
]
const monthByWord = new Map(months.flatMap((words, index) => words.split(' ').map(word => [word, index + 1] as const)))
export interface CalendarDate { year: number; month: number; day: number }

export function parseDate(text: string, format: DateFormat = 'DD/MM/YYYY'): CalendarDate | undefined {
  const input = text.trim().toLowerCase()
  const iso = input.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  if (iso) return { year: +iso[1], month: +iso[2], day: +iso[3] }
  const numeric = input.match(/^(\d{1,2})[\s/.-](\d{1,2})[\s/.-](\d{4})$/)
  if (numeric) {
    const [first, second] = [+numeric[1], +numeric[2]]
    return { year: +numeric[3], month: format === 'MM/DD/YYYY' ? first : second, day: format === 'MM/DD/YYYY' ? second : first }
  }
  const tokens = input.replace(/[,.]/g, ' ').split(/\s+/)
  const index = tokens.findIndex(word => monthByWord.has(word))
  if (index < 0 || tokens.length < 3) return
  const day = parseNumber(index ? tokens.slice(0, index).join(' ') : tokens[1])
  const year = parseNumber(tokens.slice(index ? index + 1 : 2).join(' '))
  if (day !== undefined && year !== undefined) return { year, month: monthByWord.get(tokens[index])!, day }
}

export function formatDate(date: CalendarDate, format: DateFormat = 'DD/MM/YYYY') {
  const day = String(date.day).padStart(2, '0')
  const month = String(date.month).padStart(2, '0')
  const year = String(date.year).padStart(4, '0')
  if (format === 'YYYY-MM-DD') return `${year}-${month}-${day}`
  return format === 'MM/DD/YYYY' ? `${month}/${day}/${year}` : `${day}/${month}/${year}`
}

export function ageAt(date: CalendarDate, today: Date) {
  const beforeBirthday = today.getMonth() + 1 < date.month ||
    (today.getMonth() + 1 === date.month && today.getDate() < date.day)
  return today.getFullYear() - date.year - Number(beforeBirthday)
}

export function validDate(date: CalendarDate, today: Date) {
  if (![date.year, date.month, date.day].every(Number.isInteger) || date.year < 1000) return false
  const candidate = new Date(date.year, date.month - 1, date.day)
  const localToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return candidate.getFullYear() === date.year && candidate.getMonth() === date.month - 1 &&
    candidate.getDate() === date.day && candidate <= localToday
}

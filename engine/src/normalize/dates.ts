import type { DateFormat } from '../types'
import { parseNumber } from './numbers'

const months = [
  'jan january janvari', 'feb february farvari', 'mar march maarch', 'apr april aprail',
  'may mai', 'jun june joon', 'jul july julai', 'aug august agast', 'sep sept september sitambar',
  'oct october aktubar', 'nov november navambar', 'dec december disambar',
]
const monthByWord = new Map(months.flatMap((words, index) => words.split(' ').map(word => [word, index + 1] as const)))
export interface CalendarDate { year: number; month: number; day: number }

const ordinalDays: Record<string, string> = {
  first: 'one', second: 'two', third: 'three', fourth: 'four', fifth: 'five', sixth: 'six', seventh: 'seven',
  eighth: 'eight', ninth: 'nine', tenth: 'ten', eleventh: 'eleven', twelfth: 'twelve', thirteenth: 'thirteen',
  fourteenth: 'fourteen', fifteenth: 'fifteen', sixteenth: 'sixteen', seventeenth: 'seventeen', eighteenth: 'eighteen',
  nineteenth: 'nineteen', twentieth: 'twenty', thirtieth: 'thirty',
}

function spokenYear(tokens: string[]) {
  const year = parseNumber(tokens.join(' '))
  if (year !== undefined && year >= 1000 && year <= 9999) return year
  // “Nineteen sixty-two” and “nineteen oh eight” are commonly dictated in two groups.
  if (tokens.length < 2 || !['nineteen', 'twenty'].includes(tokens[0])) return
  const leadingZero = tokens[1] === 'oh' || tokens[1] === 'zero'
  const suffix = parseNumber(tokens.slice(leadingZero ? 2 : 1).join(' '))
  if (suffix === undefined || !Number.isInteger(suffix) || suffix > 99 || (leadingZero ? suffix > 9 : suffix < 10)) return
  return (tokens[0] === 'nineteen' ? 1900 : 2000) + suffix
}

export function parseDate(text: string, format: DateFormat = 'DD/MM/YYYY'): CalendarDate | undefined {
  const input = text.trim().toLowerCase()
    .replace(/^(?:on|the)\s+/g, '').replace(/\s+(?:ko\s+)?(?:hua|hui)(?:\s+(?:tha|thi))?$/, '')
  const iso = input.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  if (iso) return { year: +iso[1], month: +iso[2], day: +iso[3] }
  const numeric = input.match(/^(\d{1,2})[\s/.-](\d{1,2})[\s/.-](\d{4})$/)
  if (numeric) {
    const [first, second] = [+numeric[1], +numeric[2]]
    return { year: +numeric[3], month: format === 'MM/DD/YYYY' ? first : second, day: format === 'MM/DD/YYYY' ? second : first }
  }
  const tokens = input.replace(/(\d+)(?:st|nd|rd|th)\b/g, '$1').replace(/([a-z])-(?=[a-z])/g, '$1 ')
    .replace(/[,.\s]+/g, ' ').trim()
    .split(' ').filter(word => !['the', 'of'].includes(word)).map(word => Object.hasOwn(ordinalDays, word) ? ordinalDays[word] : word)
  const index = tokens.findIndex(word => monthByWord.has(word))
  if (index < 0 || tokens.length < 3) return
  const month = monthByWord.get(tokens[index])!
  if (index > 0) {
    const day = parseNumber(tokens.slice(0, index).join(' '))
    const year = spokenYear(tokens.slice(index + 1))
    if (day !== undefined && year !== undefined) return { year, month, day }
  } else {
    // A month-first date can contain a one- or two-word day.
    for (const boundary of [2, 3]) {
      const day = parseNumber(tokens.slice(1, boundary).join(' '))
      const year = spokenYear(tokens.slice(boundary))
      if (day !== undefined && year !== undefined) return { year, month, day }
    }
  }
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

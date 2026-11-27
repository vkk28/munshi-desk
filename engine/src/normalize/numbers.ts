const wordsByNumber = [
  'zero shunya sifar', 'ek one', 'do two', 'teen tin three', 'chaar char four',
  'paanch panch five', 'chhe chhah che chha six', 'saat sat seven', 'aath ath eight', 'nau nav nine',
  'das ten', 'gyarah gyaarah eleven', 'barah baarah twelve', 'terah thirteen', 'chaudah fourteen', 'pandrah pandra fifteen',
  'solah sixteen', 'satrah seventeen', 'atharah athara eighteen', 'unnis unees unnees nineteen',
  'bees bis twenty', 'ikkis ikkees', 'baais bais', 'teis teiis', 'chaubees chaubis',
  'pachis pachchis pachchees', 'chhabbis chabbis', 'sattais satais', 'atthais athais', 'untees untis',
  'tees tis thirty', 'ikattis ikatees', 'battis battees', 'taintis taintees', 'chauntis chauntees',
  'paintis paintees', 'chhattis chhattees', 'saintis saintees', 'adhtis adhtees', 'untalis untaalis',
  'chalis chaalis forty', 'iktalis iktaalis', 'bayalis bayaalis', 'taintalis taintaalis', 'chauvalis chavalis chavaalis',
  'paintalis paintaalis', 'chhiyalis chhiyalis', 'saintalis saintaalis', 'adtalis adtaalis', 'unchas unchaas',
  'pachas pachaas fifty', 'ikyavan ikyawan', 'bavan baavan bawan', 'tirpan tirpann', 'chauvan chauwan',
  'pachpan', 'chhappan chappan', 'sattavan sattawan', 'atthavan athavan', 'unsath unsaath',
  'saath sath sixty', 'iksath iksaath', 'baasath basath baasat', 'tirsath tirsaath', 'chausath chaunsath chausatt',
  'painsath painsaath', 'chhiyasath chhiyasaath', 'sadsath sadsaath', 'adsath adsaath', 'unhattar unhatar',
  'sattar seventy', 'ikhattar ikhatar', 'bahattar bahatar', 'tihattar tihatar', 'chauhattar chauhatar',
  'pachhattar pachattar', 'chhihattar chhihatar', 'satahattar satattar', 'athahattar athattar', 'unasi unaasi',
  'assi assee eighty', 'ikyasi ikyaasi', 'bayasi bayaasi', 'tirasi tiraasi', 'chaurasi chauraasi',
  'pachasi pachaasi', 'chhiyasi chhiyaasi', 'sattasi sattaasi', 'atthasi atthaasi', 'navasi navaasi',
  'nabbe navve ninety', 'ikyanve ikyanbey', 'banve baanve', 'tiranve tiraanve', 'chauranve chauraanve',
  'pachanve pachaanve', 'chhiyanve chhiyaanve', 'sattanve sattaanve', 'atthanve atthaanve', 'ninyanve ninyaanve',
]
const unit = new Map(wordsByNumber.flatMap((words, number) => words.split(' ').map(word => [word, number] as const)))
const scales: Record<string, number> = {
  sau: 100, so: 100, hundred: 100, hazaar: 1000, hajar: 1000, hazar: 1000,
  thousand: 1000, lakh: 100000, laakh: 100000, crore: 10000000, karod: 10000000,
}
const modifiers: Record<string, number> = { sawa: 0.25, sava: 0.25, paune: -0.25, pauna: -0.25, saadhe: 0.5, sadhe: 0.5 }

const valueOf = (token: string) => /^\d+$/.test(token) ? Number(token) : unit.get(token)
const tokensFor = (text: string) => text.toLowerCase()
  .replace(/\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[ -]+(one|two|three|four|five|six|seven|eight|nine)\b/g,
    (_, tens: string, ones: string) => String(unit.get(tens)! + unit.get(ones)!))
  .trim().split(/[\s,-]+/).filter(Boolean)

export function parseNumber(text: string): number | undefined {
  const tokens = tokensFor(text)
  if (!tokens.length || /^\s*-/.test(text)) return
  let sum = 0
  let group = 0
  let current: number | undefined
  let modifier = 0
  for (const token of tokens) {
    if (token === 'and' || token === 'aur') continue
    if (Object.hasOwn(modifiers, token)) {
      if (modifier || current !== undefined) return
      modifier = modifiers[token]
      continue
    }
    if (Object.hasOwn(scales, token)) {
      if (modifier) return
      const scale = scales[token]
      if (scale === 100) group += (current ?? 1) * scale
      else {
        sum += (group + (current ?? (group ? 0 : 1))) * scale
        group = 0
      }
      current = undefined
      continue
    }
    const value = token === 'dedh' || token === 'derh' ? 1.5 : token === 'dhai' ? 2.5 : valueOf(token)
    if (value === undefined || current !== undefined) return
    current = value + modifier
    modifier = 0
  }
  if (modifier || !tokens.some(token => token !== 'and' && token !== 'aur')) return
  return sum + group + (current ?? 0)
}

export function parseDigits(text: string): string | undefined {
  const tokens = tokensFor(text)
  if (!tokens.length || /^\s*-/.test(text)) return
  let digits = ''
  let repetitions = 1
  for (const token of tokens) {
    if (token === 'double' || token === 'triple') {
      if (repetitions !== 1) return
      repetitions = token === 'double' ? 2 : 3
      continue
    }
    const value = valueOf(token)
    if (value === undefined) return
    const chunk = /^\d+$/.test(token) ? token : String(value)
    if (repetitions > 1 && chunk.length !== 1) return
    digits += chunk.repeat(repetitions)
    repetitions = 1
  }
  return repetitions === 1 ? digits : undefined
}

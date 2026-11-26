const terms: Record<string, string> = {
  'सेम ऐज करंट': 'same as current', 'सेम एज करंट': 'same as current',
  'रीड बैक': 'read back', 'मेक इट': 'make it', 'आगे बढ़ो': 'aage badho',
  'जन्म तिथि': 'janm tithi', 'जन्म तारीख': 'janm tarikh', 'पिता का नाम': 'pita ka naam',
  'पिनकोड': 'pincode', 'पिन कोड': 'pin code', 'एड्रेस': 'address', 'परमानेंट': 'permanent',
  'करंट': 'current', 'सबमिट': 'submit', 'ओटीपी': 'otp', 'कैप्चा': 'captcha',
  'मोबाइल': 'mobile', 'फोन': 'phone', 'आधार': 'aadhaar', 'अनडू': 'undo',
  'डबल': 'double', 'ट्रिपल': 'triple', 'जीरो': 'zero', 'ज़ीरो': 'zero', 'शून्य': 'zero',
  'हाँ': 'haan', 'हां': 'haan', 'नहीं': 'nahi', 'नही': 'nahi', 'है': 'hai',
  'उम्र': 'umar', 'गाँव': 'gaon', 'गांव': 'gaon', 'ज़िला': 'zila', 'जिला': 'jila',
  'तारीख': 'tarikh', 'शिकायत': 'shikayat', 'बिहार': 'bihar', 'पटना': 'patna',
  'यादव': 'yadav', 'रामधारी': 'ramdhari', 'चौंसठ': 'chaunsath', 'बासठ': 'baasath',
  'साठ': 'saath', 'पैंसठ': 'painsath', 'पंद्रह': 'pandrah', 'पन्द्रह': 'pandrah',
  'उन्नीस': 'unnis', 'आठ': 'aath', 'नौ': 'nau', 'छह': 'chhah',
  'दो': 'do', 'तीन': 'teen', 'चार': 'chaar', 'पाँच': 'paanch', 'पांच': 'paanch',
  'सात': 'saat', 'सौ': 'sau', 'हज़ार': 'hazaar', 'हजार': 'hazaar',
  'हमार': 'hamaar', 'हमरा': 'hamra', 'रउआ': 'rauwa', 'बानी': 'baani',
  'जनवरी': 'january', 'फ़रवरी': 'february', 'फरवरी': 'february', 'मार्च': 'march',
  'अप्रैल': 'april', 'मई': 'may', 'जून': 'june', 'जुलाई': 'july', 'अगस्त': 'august',
  'सितंबर': 'september', 'सितम्बर': 'september', 'अक्टूबर': 'october',
  'नवंबर': 'november', 'नवम्बर': 'november', 'दिसंबर': 'december', 'दिसम्बर': 'december',
}
const consonants: Record<string, string> = {
  क:'k', ख:'kh', ग:'g', घ:'gh', ङ:'ng', च:'ch', छ:'chh', ज:'j', झ:'jh', ञ:'n',
  ट:'t', ठ:'th', ड:'d', ढ:'dh', ण:'n', त:'t', थ:'th', द:'d', ध:'dh', न:'n',
  प:'p', फ:'ph', ब:'b', भ:'bh', म:'m', य:'y', र:'r', ल:'l', व:'v', श:'sh',
  ष:'sh', स:'s', ह:'h', ळ:'l', क़:'q', ख़:'kh', ग़:'g', ज़:'z', ड़:'d', ढ़:'dh', फ़:'f',
}
const vowels: Record<string, string> = {
  अ:'a', आ:'aa', इ:'i', ई:'i', उ:'u', ऊ:'u', ऋ:'ri', ए:'e', ऐ:'ai', ओ:'o', औ:'au',
  ा:'aa', ि:'i', ी:'i', ु:'u', ू:'u', ृ:'ri', े:'e', ै:'ai', ो:'o', ौ:'au', ॉ:'o', ॅ:'e',
  ं:'n', ँ:'n', ः:'h',
}

function romanize(word: string) {
  const parts: { text: string; schwa?: boolean }[] = []
  for (let i = 0; i < word.length; i++) {
    const char = word[i]
    const next = word[i + 1] || ''
    if (consonants[char]) {
      const sound = consonants[char + next] || consonants[char]
      if (next === '़') i++
      const mark = word[i + 1] || ''
      if (mark === '्' || ('ािीुूृेैोौॉॅ'.includes(mark) && mark)) {
        i++
        parts.push({ text: sound + (vowels[mark] || '') })
      } else {
        parts.push({ text: sound, schwa: true })
      }
    } else if (vowels[char]) parts.push({ text: vowels[char] })
  }
  return parts.map((part, i) => part.text + (part.schwa && (i < parts.length - 1 || parts.length === 1) ? 'a' : '')).join('')
}

export function transliterate(input: string) {
  const normalized = input.normalize('NFC').replace(/[\u200b-\u200d]/g, '')
    .replace(/[०-९]/g, digit => String(digit.charCodeAt(0) - 0x966))
    .replace(/[।॥]/g, '.').replace(/[’‘]/g, "'")
  const phrases = normalized.replace(/[\u0900-\u0963]+(?: +[\u0900-\u0963]+)*/g, phrase => {
    const words = phrase.split(/ +/)
    const output: string[] = []
    for (let i = 0; i < words.length;) {
      const match = [4, 3, 2, 1].find(size => i + size <= words.length && terms[words.slice(i, i + size).join(' ')])
      if (match) {
        output.push(terms[words.slice(i, i + match).join(' ')])
        i += match
      } else {
        output.push(romanize(words[i++]))
      }
    }
    return output.join(' ')
  })
  return phrases.replace(/[ \t]+/g, ' ').trim()
}

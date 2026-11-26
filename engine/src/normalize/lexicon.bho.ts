const bhojpuri: Record<string, string> = {
  hamaar: 'mera', hamar: 'mera', hamra: 'mera', ba: 'hai', baa: 'hai',
  bate: 'hai', baani: 'hai', rauwa: 'aap', raura: 'aap', kaa: 'kya',
  babuji: 'pita', baap: 'pita', maai: 'mata', gaam: 'gaon', baris: 'saal', baras: 'saal',
}

export function rewriteBhojpuri(input: string) {
  return input.replace(/\btheek (?:ba|baa)\b/gi, 'haan')
    .replace(/\b[a-z]+\b/gi, word => bhojpuri[word.toLowerCase()] || word)
}

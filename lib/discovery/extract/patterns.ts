/**
 * Deterministic pattern extraction.
 *
 * Everything here is pure and refuses when it isn't sure. The governing rule:
 * a null is more useful to a student than a plausible wrong answer, because a
 * null shows them "not stated — check the official page" while a wrong deadline
 * makes them miss it.
 */

const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
  sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10,
  dec: 11, december: 11,
}

const MONTH_NAMES = Object.keys(MONTHS).join('|')

export interface ParsedDate {
  date: Date
  /** The exact substring this came from. Always kept. */
  rawText: string
}

/**
 * Parses a date from free text.
 *
 * Numeric-only dates like 09/12/2026 are deliberately REFUSED unless one
 * component is greater than 12, because 9 December and 12 September are three
 * months apart and there is no way to tell which the page meant. Guessing a
 * convention from a domain's TLD would be exactly the kind of plausible
 * fabrication this product exists not to do.
 */
export function parseDate(text: string, referenceYear?: number): ParsedDate | null {
  const t = text.trim()

  // ISO first: unambiguous by definition.
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(t)
  if (iso) {
    const d = utc(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
    if (d) return { date: d, rawText: iso[0] }
  }

  // "12 September 2026" / "12th Sept 2026"
  const dmy = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_NAMES})\\.?,?\\s+(\\d{4})\\b`, 'i').exec(t)
  if (dmy) {
    const d = utc(Number(dmy[3]), MONTHS[dmy[2]!.toLowerCase()]!, Number(dmy[1]))
    if (d) return { date: d, rawText: dmy[0] }
  }

  // "September 12, 2026" / "Sept 12 2026"
  const mdy = new RegExp(`\\b(${MONTH_NAMES})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, 'i').exec(t)
  if (mdy) {
    const d = utc(Number(mdy[3]), MONTHS[mdy[1]!.toLowerCase()]!, Number(mdy[2]))
    if (d) return { date: d, rawText: mdy[0] }
  }

  // "12 September" with no year — only resolvable if the caller supplies one.
  if (referenceYear !== undefined) {
    const dm = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_NAMES})\\b(?!\\s+\\d{4})`, 'i').exec(t)
    if (dm) {
      const d = utc(referenceYear, MONTHS[dm[2]!.toLowerCase()]!, Number(dm[1]))
      if (d) return { date: d, rawText: dm[0] }
    }
    const md = new RegExp(`\\b(${MONTH_NAMES})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?!,?\\s+\\d{4})`, 'i').exec(t)
    if (md) {
      const d = utc(referenceYear, MONTHS[md[1]!.toLowerCase()]!, Number(md[2]))
      if (d) return { date: d, rawText: md[0] }
    }
  }

  // Numeric: only when the day component is unambiguous.
  const numeric = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/.exec(t)
  if (numeric) {
    const a = Number(numeric[1])
    const b = Number(numeric[2])
    const year = Number(numeric[3])
    if (a > 12 && b <= 12) {
      const d = utc(year, b - 1, a) // unambiguously DD/MM
      if (d) return { date: d, rawText: numeric[0] }
    }
    if (b > 12 && a <= 12) {
      const d = utc(year, a - 1, b) // unambiguously MM/DD
      if (d) return { date: d, rawText: numeric[0] }
    }
    // Both ≤ 12: genuinely ambiguous. Refuse.
    return null
  }

  return null
}

function utc(year: number, monthIndex: number, day: number): Date | null {
  if (year < 1900 || year > 2200) return null
  if (monthIndex < 0 || monthIndex > 11) return null
  if (day < 1 || day > 31) return null
  const d = new Date(Date.UTC(year, monthIndex, day, 23, 59, 0))
  // Rejects 31 February and friends, which roll over silently otherwise.
  if (d.getUTCMonth() !== monthIndex || d.getUTCDate() !== day) return null
  return d
}

/** Labels that mark a date as a deadline rather than a programme date. */
const DEADLINE_LABEL_PATTERNS: Array<[string, RegExp]> = [
  ['EARLY_DEADLINE', /\b(early(?:\s+bird)?\s+(?:deadline|application|registration)|early\s+decision)\b/i],
  ['REGISTRATION_DEADLINE', /\b(registration\s+(?:deadline|closes?|ends?)|register\s+by|last\s+date\s+to\s+register)\b/i],
  ['DOCUMENT_DEADLINE', /\b(document(?:s|ation)?\s+(?:deadline|due)|supporting\s+materials?\s+due)\b/i],
  ['APPLICATION_DEADLINE', /\b(application\s+deadline|deadline\s+(?:for|to)\s+apply|applications?\s+(?:close|due|must be (?:received|submitted))|apply\s+by|last\s+date\s+to\s+apply|closing\s+date|submission\s+deadline)\b/i],
  ['INTERVIEW_WINDOW', /\b(interviews?\s+(?:will be held|take place|scheduled)|interview\s+(?:date|window|round))\b/i],
  ['PROGRAM_START', /\b(programme?\s+(?:begins?|starts?)|course\s+(?:begins?|starts?)|commences?\s+on|start\s+date)\b/i],
  ['PROGRAM_END', /\b(programme?\s+ends?|course\s+ends?|end\s+date|concludes?\s+on)\b/i],
  ['RESULT_DATE', /\b(results?\s+(?:announced|declared|published)|winners?\s+announced)\b/i],
  ['NOTIFICATION_DATE', /\b(decisions?\s+(?:notified|announced)|applicants?\s+(?:will be )?notified|notification\s+date)\b/i],
]

/**
 * Classifies which KIND of date a sentence is talking about. Returns null when
 * the sentence names a date but not its purpose — a date with no label is not
 * safely assumable to be the application deadline.
 */
export function classifyDateKind(sentence: string): string | null {
  for (const [kind, re] of DEADLINE_LABEL_PATTERNS) if (re.test(sentence)) return kind
  return null
}

export interface ExtractedDate {
  kind: string
  date: Date
  rawText: string
  isRollingAdmission: boolean
}

const ROLLING = /\b(rolling\s+(?:admission|basis|deadline)|applications?\s+(?:are\s+)?accepted\s+(?:on\s+a\s+rolling|year[-\s]?round)|no\s+fixed\s+deadline|open\s+until\s+filled)\b/i

/**
 * Pulls typed dates out of page text. Only sentences that both name a date and
 * label its purpose produce a result.
 */
export function extractDates(text: string, referenceYear?: number): ExtractedDate[] {
  const out: ExtractedDate[] = []
  const seen = new Set<string>()

  for (const sentence of splitSentences(text)) {
    // "Accepted on a rolling basis" states how applications are handled without
    // using deadline wording, so it names its own kind when nothing else does.
    if (ROLLING.test(sentence)) {
      const kind = classifyDateKind(sentence) ?? 'APPLICATION_DEADLINE'
      const key = `${kind}:rolling`
      if (!seen.has(key)) {
        seen.add(key)
        out.push({ kind, date: new Date(0), rawText: sentence.trim(), isRollingAdmission: true })
      }
      continue
    }

    const kind = classifyDateKind(sentence)
    if (!kind) continue

    const parsed = parseDate(sentence, referenceYear)
    if (!parsed) continue
    const key = `${kind}:${parsed.date.toISOString()}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ kind, date: parsed.date, rawText: sentence.trim(), isRollingAdmission: false })
  }
  return out
}

export interface ExtractedAgeRange {
  min: number | null
  max: number | null
  rawText: string
}

/** "aged 14-18", "ages 14 to 18", "under 18", "16 and above", "at least 16". */
export function extractAgeRange(text: string): ExtractedAgeRange | null {
  const between = /\b(?:ages?|aged)\s*(?:between\s*)?(\d{1,2})\s*(?:-|–|—|to|and)\s*(\d{1,2})\b/i.exec(text)
  if (between) {
    const min = Number(between[1])
    const max = Number(between[2])
    if (plausibleAge(min) && plausibleAge(max) && min <= max) {
      return { min, max, rawText: between[0] }
    }
  }
  const yearOlds = /\b(\d{1,2})\s*(?:-|–|—|to)\s*(\d{1,2})[\s-]*year[\s-]*olds?\b/i.exec(text)
  if (yearOlds) {
    const min = Number(yearOlds[1])
    const max = Number(yearOlds[2])
    if (plausibleAge(min) && plausibleAge(max) && min <= max) {
      return { min, max, rawText: yearOlds[0] }
    }
  }
  const under = /\b(?:under|below|younger than)\s*(?:the age of\s*)?(\d{1,2})\b/i.exec(text)
  if (under && plausibleAge(Number(under[1]))) {
    return { min: null, max: Number(under[1]) - 1, rawText: under[0] }
  }
  const over = /\b(?:at least|minimum(?: age)? of|aged?|over|above)\s*(\d{1,2})\s*(?:years?(?:\s+old)?|or (?:older|above|over)|\+)\b/i.exec(text)
  if (over && plausibleAge(Number(over[1]))) {
    return { min: Number(over[1]), max: null, rawText: over[0] }
  }
  return null
}

const plausibleAge = (n: number): boolean => n >= 5 && n <= 99

const CURRENCY_SYMBOLS: Record<string, string> = {
  '£': 'GBP', $: 'USD', '€': 'EUR', '₹': 'INR', '¥': 'JPY', '₦': 'NGN', '₱': 'PHP', R$: 'BRL',
}

const CURRENCY_CODES = /\b(USD|EUR|GBP|INR|AUD|CAD|SGD|AED|CHF|JPY|CNY|NGN|ZAR|KES|PKR|BDT|BRL|MXN|SEK|NOK|DKK|PLN|NZD)\b/i

export interface ExtractedCost {
  costType: 'FREE' | 'PAID' | 'FREE_WITH_AID' | 'UNKNOWN'
  amount: number | null
  currency: string | null
  rawText: string
}

const FREE_PATTERNS = /\b(free\s+of\s+charge|no\s+(?:entry|application|registration|participation)\s+fee|free\s+to\s+(?:enter|apply|participate|attend)|there\s+is\s+no\s+fee|fully\s+funded|no\s+cost\s+to\s+(?:participants|students))\b/i
const AID_PATTERNS = /\b(financial\s+aid|need[-\s]based\s+(?:aid|scholarship|support)|fee\s+waiver|bursar(?:y|ies)|scholarships?\s+(?:are\s+)?available|partial\s+funding|need[-\s]blind)\b/i

/**
 * Cost is one of the four never-generated fields, so this returns UNKNOWN far
 * more readily than it returns a number.
 */
export function extractCost(text: string): ExtractedCost {
  const free = FREE_PATTERNS.exec(text)
  const aid = AID_PATTERNS.exec(text)

  // Look for an amount attached to fee-like wording, not just any number on the page.
  const feeContext =
    /\b(?:fee|cost|price|charge|payment|contribution|tuition)\b[^.]{0,60}?([£$€₹¥₦₱]|R\$)\s?(\d[\d,]*(?:\.\d{1,2})?)/i.exec(text) ??
    /([£$€₹¥₦₱]|R\$)\s?(\d[\d,]*(?:\.\d{1,2})?)[^.]{0,40}?\b(?:fee|cost|price|charge|payment|tuition)\b/i.exec(text)

  const codeContext = /\b(?:fee|cost|price|charge|tuition)\b[^.]{0,60}?\b([A-Z]{3})\s?(\d[\d,]*(?:\.\d{1,2})?)/.exec(text)

  if (feeContext) {
    const symbol = feeContext[1]!
    const amount = Number(feeContext[2]!.replace(/,/g, ''))
    if (Number.isFinite(amount)) {
      return {
        costType: aid ? 'FREE_WITH_AID' : 'PAID',
        amount,
        currency: CURRENCY_SYMBOLS[symbol] ?? null,
        rawText: feeContext[0].trim(),
      }
    }
  }
  if (codeContext && CURRENCY_CODES.test(codeContext[1]!)) {
    const amount = Number(codeContext[2]!.replace(/,/g, ''))
    if (Number.isFinite(amount)) {
      return {
        costType: aid ? 'FREE_WITH_AID' : 'PAID',
        amount,
        currency: codeContext[1]!.toUpperCase(),
        rawText: codeContext[0].trim(),
      }
    }
  }
  if (free) {
    return { costType: 'FREE', amount: null, currency: null, rawText: free[0] }
  }
  if (aid) {
    return { costType: 'FREE_WITH_AID', amount: null, currency: null, rawText: aid[0] }
  }
  return { costType: 'UNKNOWN', amount: null, currency: null, rawText: '' }
}

const ONLINE = /\b(online|virtual(?:ly)?|remote(?:ly)?|web[-\s]?based|from\s+anywhere\s+in\s+the\s+world)\b/i
const IN_PERSON = /\b(in[-\s]person|on[-\s]?site|on[-\s]?campus|residential|face[-\s]to[-\s]face|attend\s+in\s+person)\b/i
const HYBRID = /\b(hybrid|blended(?:\s+format)?|both\s+online\s+and\s+in[-\s]person)\b/i

export function extractFormat(text: string): { format: 'ONLINE' | 'IN_PERSON' | 'HYBRID' | 'UNKNOWN'; rawText: string } {
  const hybrid = HYBRID.exec(text)
  if (hybrid) return { format: 'HYBRID', rawText: hybrid[0] }
  const inPerson = IN_PERSON.exec(text)
  const online = ONLINE.exec(text)
  if (inPerson && online) return { format: 'HYBRID', rawText: `${inPerson[0]} / ${online[0]}` }
  if (inPerson) return { format: 'IN_PERSON', rawText: inPerson[0] }
  if (online) return { format: 'ONLINE', rawText: online[0] }
  return { format: 'UNKNOWN', rawText: '' }
}

const REQUIREMENT_PATTERNS: RegExp[] = [
  /\b(letters?\s+of\s+recommendation|recommendation\s+letters?|references?\s+(?:required|from)|referee)\b/i,
  /\b(academic\s+transcripts?|transcripts?|report\s+cards?|mark\s?sheets?)\b/i,
  /\b(personal\s+statements?|statement\s+of\s+purpose|motivation\s+letters?|essays?|written\s+responses?)\b/i,
  /\b(portfolios?|writing\s+samples?|showreels?|auditions?)\b/i,
  /\b(curriculum\s+vitae|résumés?|resumes?|CVs?)\b/,
  /\b(application\s+forms?|registration\s+forms?)\b/i,
  /\b(proof\s+of\s+(?:age|identity|enrolment|enrollment)|passports?|birth\s+certificates?)\b/i,
]

/** Requirement phrases, deduplicated, with the sentence they came from. */
export function extractRequirements(text: string): Array<{ label: string; rawText: string }> {
  const found = new Map<string, string>()
  for (const sentence of splitSentences(text)) {
    for (const re of REQUIREMENT_PATTERNS) {
      const m = re.exec(sentence)
      if (!m) continue
      const label = titleCase(m[0])
      if (!found.has(label.toLowerCase())) found.set(label.toLowerCase(), sentence.trim())
    }
  }
  return [...found.entries()].map(([label, rawText]) => ({ label: titleCase(label), rawText }))
}

export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?;])\s+|\n+|(?=•)|(?=•)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

function titleCase(s: string): string {
  const t = s.trim().toLowerCase()
  return t.charAt(0).toUpperCase() + t.slice(1)
}

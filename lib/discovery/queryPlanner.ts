/**
 * Stage 1: query planning, and the parser behind natural-language search.
 *
 * Two jobs:
 *   1. Turn a profile + filters into several *targeted* provider queries rather
 *      than one vague string. "Scholarships for students" returns noise;
 *      "molecular biology summer research programme sixth form UK 2026" does not.
 *   2. Turn a student's own sentence into structured filters — and hand those
 *      filters back so the UI can show them as editable chips. The student must
 *      always be able to see and correct how they were understood.
 *
 * Deterministic and pure. No model is involved, which is why it works on the
 * free tier and why the interpretation is always inspectable.
 */

export interface DiscoveryFilters {
  categories: string[]
  subjects: string[]
  countryCode: string | null
  city: string | null
  format: 'ONLINE' | 'IN_PERSON' | 'HYBRID' | null
  costFree: boolean | null
  age: number | null
  educationLevel: string | null
  /** Deadline window in days from today. */
  withinDays: number | null
  month: number | null
  keywords: string[]
}

export const emptyFilters = (): DiscoveryFilters => ({
  categories: [], subjects: [], countryCode: null, city: null, format: null,
  costFree: null, age: null, educationLevel: null, withinDays: null, month: null, keywords: [],
})

const CATEGORY_TERMS: Array<[string, RegExp]> = [
  ['scholarship', /\bscholarships?\b|\bbursar(?:y|ies)\b|\bfinancial aid\b/i],
  ['competition', /\bcompetitions?\b|\bcontests?\b|\bchallenges?\b/i],
  ['olympiad', /\bolympiads?\b/i],
  ['mun', /\bmuns?\b|\bmodel united nations\b/i],
  ['debate', /\bdebat(?:e|ing)\b/i],
  ['hackathon', /\bhackathons?\b/i],
  ['research', /\bresearch\b|\bresearch programmes?\b/i],
  ['internship', /\binternships?\b|\bwork experience\b|\bplacements?\b/i],
  ['summer-program', /\bsummer (?:program(?:me)?s?|schools?|camps?)\b|\bpre[-\s]?college\b/i],
  ['fellowship', /\bfellowships?\b/i],
  ['volunteering', /\bvolunteer(?:ing)?\b|\bcommunity service\b/i],
  ['leadership', /\bleadership\b/i],
  ['course', /\bcourses?\b|\bmoocs?\b|\bclasses\b/i],
  ['certification', /\bcertifications?\b|\bcertificates?\b/i],
  ['workshop', /\bworkshops?\b/i],
  ['conference', /\bconferences?\b|\bsummits?\b/i],
  ['entrepreneurship', /\bentrepreneurship\b|\bstartup\b|\bbusiness plan\b/i],
  ['writing', /\bwriting (?:competitions?|contests?)\b|\bessay (?:competitions?|contests?)\b/i],
  ['stem', /\bstem\b/i],
  ['arts', /\barts?\b|\bmusic\b|\bdrama\b|\btheatre\b|\bdesign\b/i],
  ['sports', /\bsports?\b|\bathletics?\b/i],
]

const SUBJECT_TERMS: Array<[string, RegExp]> = [
  ['medicine', /\bmedicine\b|\bmedical\b|\bpre[-\s]?med\b|\bhealthcare\b/i],
  ['biology', /\bbiology\b|\bbiological\b|\blife sciences?\b/i],
  ['molecular-biology', /\bmolecular biology\b|\bgenetics\b|\bbiotech(?:nology)?\b/i],
  ['chemistry', /\bchemistry\b/i],
  ['physics', /\bphysics\b|\bastronomy\b|\bastrophysics\b/i],
  ['mathematics', /\bmaths?\b|\bmathematics\b/i],
  ['computer-science', /\bcomputer science\b|\bcoding\b|\bprogramming\b|\bsoftware\b|\bcs\b/i],
  ['artificial-intelligence', /\bai\b|\bartificial intelligence\b|\bmachine learning\b/i],
  ['engineering', /\bengineering\b|\brobotics\b/i],
  ['environment', /\benvironment(?:al)?\b|\bclimate\b|\bsustainability\b|\becology\b/i],
  ['economics', /\beconomics\b|\bfinance\b/i],
  ['business', /\bbusiness\b|\bmanagement\b|\bcommerce\b/i],
  ['law', /\blaw\b|\blegal\b/i],
  ['politics', /\bpolitics\b|\bpolitical science\b|\binternational relations\b/i],
  ['psychology', /\bpsychology\b/i],
  ['history', /\bhistory\b/i],
  ['literature', /\bliterature\b|\bcreative writing\b|\bpoetry\b/i],
  ['journalism', /\bjournalism\b|\bmedia\b/i],
]

/** Only unambiguous, commonly-searched names. Never guesses from context. */
const COUNTRY_TERMS: Array<[string, RegExp]> = [
  ['GB', /\b(?:uk|united kingdom|britain|england|scotland|wales)\b/i],
  ['US', /\b(?:usa?|united states|america)\b/i],
  ['IN', /\bindia\b/i],
  ['CA', /\bcanada\b/i],
  ['AU', /\baustralia\b/i],
  ['SG', /\bsingapore\b/i],
  ['AE', /\b(?:uae|united arab emirates|dubai)\b/i],
  ['DE', /\bgermany\b/i],
  ['FR', /\bfrance\b/i],
  ['NL', /\bnetherlands\b|\bholland\b/i],
  ['CH', /\bswitzerland\b/i],
  ['IE', /\bireland\b/i],
  ['NZ', /\bnew zealand\b/i],
  ['ZA', /\bsouth africa\b/i],
  ['NG', /\bnigeria\b/i],
  ['KE', /\bkenya\b/i],
  ['PK', /\bpakistan\b/i],
  ['BD', /\bbangladesh\b/i],
  ['JP', /\bjapan\b/i],
  ['KR', /\b(?:south korea|korea)\b/i],
  ['CN', /\bchina\b/i],
  ['BR', /\bbrazil\b/i],
]

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
]

/**
 * Parses a student's own sentence into filters.
 * "Free STEM programmes for 16-year-olds in India" →
 *   { categories:['stem'], costFree:true, age:16, countryCode:'IN' }
 */
export function parseNaturalQuery(input: string): DiscoveryFilters {
  const q = input.trim()
  const f = emptyFilters()
  if (!q) return f

  for (const [slug, re] of CATEGORY_TERMS) if (re.test(q)) f.categories.push(slug)
  for (const [slug, re] of SUBJECT_TERMS) if (re.test(q)) f.subjects.push(slug)
  for (const [code, re] of COUNTRY_TERMS) {
    if (re.test(q)) {
      f.countryCode = code
      break
    }
  }

  if (/\bfree\b|\bno (?:entry |application )?fee\b|\bfully funded\b|\bno cost\b/i.test(q)) f.costFree = true
  if (/\bonline\b|\bvirtual\b|\bremote\b/i.test(q)) f.format = 'ONLINE'
  else if (/\bin[-\s]person\b|\bon[-\s]?campus\b|\bresidential\b/i.test(q)) f.format = 'IN_PERSON'

  const age =
    /\bfor\s+(\d{1,2})[-\s]?year[-\s]?olds?\b/i.exec(q) ??
    /\b(?:aged?|age)\s+(\d{1,2})\b/i.exec(q) ??
    /\b(\d{1,2})[-\s]?year[-\s]?olds?\b/i.exec(q)
  if (age) {
    const n = Number(age[1])
    if (n >= 5 && n <= 30) f.age = n
  }

  if (/\bhigh[-\s]?school\b|\bsecondary\b|\bsixth form\b|\bgrade (?:9|10|11|12)\b/i.test(q)) {
    f.educationLevel = 'SENIOR_SECONDARY'
  } else if (/\bundergraduate?\b|\buniversity students?\b|\bcollege students?\b/i.test(q)) {
    f.educationLevel = 'UNDERGRAD'
  } else if (/\bmiddle school\b/i.test(q)) {
    f.educationLevel = 'MIDDLE'
  }

  const monthIndex = MONTHS.findIndex((m) => new RegExp(`\\b${m}\\b`, 'i').test(q))
  if (monthIndex >= 0) f.month = monthIndex + 1

  if (/\bthis (?:week)\b|\bclosing soon\b|\burgent\b/i.test(q)) f.withinDays = 7
  else if (/\bthis month\b/i.test(q)) f.withinDays = 30

  // Whatever is left after the recognised terms is kept as free keywords, so a
  // subject Lumen does not know about is still searched for rather than dropped.
  f.keywords = residualKeywords(q, f)
  return f
}

const FILLER = new Set([
  'find', 'me', 'show', 'search', 'looking', 'for', 'in', 'the', 'a', 'an', 'and',
  'or', 'of', 'to', 'with', 'that', 'are', 'is', 'i', 'am', 'my', 'want', 'need',
  'students', 'student', 'opportunities', 'opportunity', 'programmes', 'programs',
  'interested', 'about', 'any', 'some', 'good', 'best', 'near', 'during', 'old',
  'year', 'years', 'olds', 'free', 'online',
])

function residualKeywords(q: string, f: DiscoveryFilters): string[] {
  const consumed = new RegExp(
    [
      ...CATEGORY_TERMS.filter(([s]) => f.categories.includes(s)).map(([, re]) => re.source),
      ...SUBJECT_TERMS.filter(([s]) => f.subjects.includes(s)).map(([, re]) => re.source),
      ...COUNTRY_TERMS.filter(([c]) => f.countryCode === c).map(([, re]) => re.source),
    ].join('|') || '(?!)',
    'gi',
  )
  return q
    .replace(consumed, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !FILLER.has(w) && !/^\d+$/.test(w))
    .slice(0, 6)
}

/** Human-readable chips, so a student can see and correct the interpretation. */
export interface InterpretedChip {
  field: keyof DiscoveryFilters
  label: string
  value: string
}

export function describeFilters(f: DiscoveryFilters): InterpretedChip[] {
  const chips: InterpretedChip[] = []
  for (const c of f.categories) chips.push({ field: 'categories', label: 'Type', value: humanise(c) })
  for (const s of f.subjects) chips.push({ field: 'subjects', label: 'Subject', value: humanise(s) })
  if (f.countryCode) chips.push({ field: 'countryCode', label: 'Country', value: f.countryCode })
  if (f.city) chips.push({ field: 'city', label: 'City', value: f.city })
  if (f.format) chips.push({ field: 'format', label: 'Format', value: humanise(f.format) })
  if (f.costFree) chips.push({ field: 'costFree', label: 'Cost', value: 'Free only' })
  if (f.age !== null) chips.push({ field: 'age', label: 'Age', value: `${f.age}` })
  if (f.educationLevel) chips.push({ field: 'educationLevel', label: 'Level', value: humanise(f.educationLevel) })
  if (f.month !== null) chips.push({ field: 'month', label: 'Month', value: MONTHS[f.month - 1]!.replace(/^./, (c) => c.toUpperCase()) })
  if (f.withinDays !== null) chips.push({ field: 'withinDays', label: 'Deadline', value: `Within ${f.withinDays} days` })
  for (const k of f.keywords) chips.push({ field: 'keywords', label: 'Keyword', value: k })
  return chips
}

export interface ProfileSeed {
  age: number | null
  countryCode: string | null
  educationLevel: string | null
  interests: string[]
  careerDirections: string[]
  formatPreference: string
}

/**
 * Builds several narrow provider queries instead of one broad one. Each pairs a
 * category with a subject, because "research programme" and "molecular biology"
 * separately return noise that "molecular biology research programme" does not.
 */
export function planQueries(filters: DiscoveryFilters, profile: ProfileSeed | null, limit = 4): string[] {
  const year = new Date().getUTCFullYear()
  const categories = filters.categories.length > 0 ? filters.categories : ['scholarship', 'competition', 'summer-program']
  const subjects =
    filters.subjects.length > 0
      ? filters.subjects
      : (profile?.interests ?? []).slice(0, 3)

  const level = levelPhrase(filters.educationLevel ?? profile?.educationLevel ?? null, filters.age ?? profile?.age ?? null)
  const place = placePhrase(filters, profile)
  const cost = filters.costFree ? 'free' : ''
  const format = filters.format === 'ONLINE' ? 'online' : ''

  const queries: string[] = []
  const pairs: Array<[string, string | null]> =
    subjects.length > 0
      ? categories.flatMap((c) => subjects.map((s): [string, string | null] => [c, s]))
      : categories.map((c): [string, string | null] => [c, null])

  for (const [category, subject] of pairs) {
    const parts = [
      cost,
      subject ? humanise(subject) : '',
      humanise(category),
      level,
      format,
      place,
      String(year),
      ...filters.keywords,
    ].filter((p) => p.length > 0)
    const q = parts.join(' ').replace(/\s+/g, ' ').trim()
    if (q && !queries.includes(q)) queries.push(q)
    if (queries.length >= limit) break
  }

  return queries
}

function levelPhrase(level: string | null, age: number | null): string {
  if (level === 'UNDERGRAD') return 'undergraduate students'
  if (level === 'MIDDLE') return 'middle school students'
  if (level === 'SECONDARY' || level === 'SENIOR_SECONDARY') return 'high school students'
  if (age !== null && age <= 18) return 'high school students'
  if (age !== null) return 'university students'
  return 'students'
}

function placePhrase(filters: DiscoveryFilters, profile: ProfileSeed | null): string {
  if (filters.city) return filters.city
  const country = filters.countryCode ?? (filters.format === 'ONLINE' ? null : profile?.countryCode ?? null)
  return country ?? ''
}

function humanise(slug: string): string {
  return slug.replace(/[-_]/g, ' ').toLowerCase()
}

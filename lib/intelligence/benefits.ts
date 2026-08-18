import type { ScorableOpportunity, ScorableProfile } from './types'

/**
 * "Why this could be valuable for you" — three tiers, always labelled.
 *
 * The distinction is the entire feature. A student deciding how to spend a
 * summer deserves to know which sentence is the organiser's promise, which is
 * an observation about the format, and which is Lumen guessing.
 */

export type BenefitTier = 'STATED' | 'STRUCTURAL' | 'INTERPRETED'

export const TIER_LABELS: Record<BenefitTier, string> = {
  STATED: 'Stated by the organiser',
  STRUCTURAL: 'Based on the programme format',
  INTERPRETED: 'Lumen’s interpretation',
}

export interface Benefit {
  tier: BenefitTier
  text: string
  /** Present on STATED benefits only — the organiser's own words. */
  rawText?: string
  sourceUrl?: string
}

export interface StatedBenefitInput {
  label: string
  rawText?: string
  sourceUrl?: string
}

/**
 * Claims Lumen will not make, enforced by a test in CI rather than by good
 * intentions. Everything here is either unknowable or a promise no opportunity
 * platform is in a position to keep.
 */
export const BANNED_CLAIM_PATTERNS: RegExp[] = [
  /\bwill get you into\b/i,
  /\bguarantee[sd]?\b/i,
  /\bensures? (?:admission|acceptance|a place)\b/i,
  /\b(?:harvard|oxford|cambridge|mit|stanford|ivy league)\b/i,
  /\btop students always\b/i,
  /\bboosts? your chances of (?:admission|getting in)\b/i,
  /\blooks great on your (?:college|university) application\b/i,
  /\bimpress(?:es)? admissions\b/i,
  /\bessential for\b/i,
  /\bmust-have\b/i,
]

export function violatesClaimPolicy(text: string): RegExp | null {
  return BANNED_CLAIM_PATTERNS.find((re) => re.test(text)) ?? null
}

/** Format facts that genuinely follow from what the opportunity *is*. */
function structuralBenefits(opp: ScorableOpportunity): Benefit[] {
  const out: Benefit[] = []

  if (opp.categories.includes('competition') || opp.categories.includes('olympiad')) {
    out.push({ tier: 'STRUCTURAL', text: 'Competitive format, so you will be working to a standard set by other entrants.' })
  }
  if (opp.categories.includes('research')) {
    out.push({ tier: 'STRUCTURAL', text: 'Research-based, which usually means producing something you can describe and discuss later.' })
  }
  if (opp.categories.includes('mun') || opp.categories.includes('debate')) {
    out.push({ tier: 'STRUCTURAL', text: 'Involves speaking and arguing in front of others.' })
  }
  if (opp.categories.includes('hackathon')) {
    out.push({ tier: 'STRUCTURAL', text: 'Team-based and time-boxed, ending in something you have built.' })
  }
  if (opp.categories.includes('volunteering') || opp.categories.includes('community-service')) {
    out.push({ tier: 'STRUCTURAL', text: 'Direct community work rather than a classroom setting.' })
  }
  if (opp.format === 'IN_PERSON') {
    out.push({ tier: 'STRUCTURAL', text: 'Held in person, so you would meet the other participants and the organisers face to face.' })
  }
  if (opp.durationDays !== null && opp.durationDays >= 21) {
    out.push({ tier: 'STRUCTURAL', text: `Runs for about ${Math.round(opp.durationDays / 7)} weeks — long enough to go past an introduction.` })
  }
  return out
}

/**
 * The personalised sentence. Grounded strictly in what the student's own
 * profile already contains, hedged, and never predictive about admissions.
 */
function interpretedBenefits(opp: ScorableOpportunity, p: ScorableProfile): Benefit[] {
  const out: Benefit[] = []

  const sharedInterests = opp.tags
    .filter((t) => (t.kind === 'SUBJECT' || t.kind === 'INTEREST') && p.interests.some((i) => i.slug === t.slug))
    .map((t) => t.slug.replace(/[-_]/g, ' '))

  if (sharedInterests.length > 0) {
    out.push({
      tier: 'INTERPRETED',
      text: `You have already told Lumen you're interested in ${sharedInterests[0]}. This would give you something concrete in that area rather than an interest you can only describe.`,
    })
  }

  // Complementary experience: name what they have, and what this adds to it.
  const kinds = new Set(p.achievements.map((a) => a.kind))
  if (kinds.has('COMPETITION') && opp.categories.includes('research')) {
    out.push({
      tier: 'INTERPRETED',
      text: 'Your profile is strong on competitions and lighter on research. This is a different kind of work — slower, and less about a single result.',
    })
  }
  if (kinds.has('LEADERSHIP') && (opp.categories.includes('mun') || opp.categories.includes('debate'))) {
    out.push({
      tier: 'INTERPRETED',
      text: 'You already have leadership experience. This would add the competitive speaking side of it.',
    })
  }
  if (p.careerDirections.length > 0) {
    const hit = opp.categories.find((c) => p.careerDirections.includes(c))
    if (hit) {
      out.push({
        tier: 'INTERPRETED',
        text: `You've named ${hit.replace(/[-_]/g, ' ')} as a direction. This is a low-commitment way to find out whether you actually enjoy the work.`,
      })
    }
  }
  if (out.length === 0 && p.interests.length === 0) {
    out.push({
      tier: 'INTERPRETED',
      text: 'Add your interests to your profile and Lumen can say something more specific about why this might be worth your time.',
    })
  }
  return out
}

export function buildBenefits(
  opp: ScorableOpportunity,
  profile: ScorableProfile,
  stated: StatedBenefitInput[] = [],
): Benefit[] {
  const statedBenefits: Benefit[] = stated.map((s) => ({
    tier: 'STATED',
    text: s.label,
    rawText: s.rawText,
    sourceUrl: s.sourceUrl,
  }))

  const all = [...statedBenefits, ...structuralBenefits(opp), ...interpretedBenefits(opp, profile)]

  // Belt and braces: a generated sentence that trips the claim policy is
  // dropped rather than shipped. Organiser-stated text is quoted as-is —
  // it is their claim, attributed to them, and we do not launder it.
  return all.filter((b) => b.tier === 'STATED' || !violatesClaimPolicy(b.text))
}

/**
 * "Is it worth my time?" — the decision summary. Every field is derived from
 * stated data, and the closing assessment is explicitly Lumen's opinion.
 */
export interface WorthAssessment {
  timeCommitment: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN'
  applicationEffort: 'LOW' | 'MEDIUM' | 'HIGH'
  costLabel: string
  skillRelevance: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN'
  assessment: string
  /** Always true. The UI must badge this as interpretation, not fact. */
  isInterpretation: true
}

export function assessWorth(
  opp: ScorableOpportunity,
  profile: ScorableProfile,
  requirementCount: number,
  matchScore: number,
): WorthAssessment {
  const timeCommitment =
    opp.durationDays === null ? 'UNKNOWN' : opp.durationDays <= 3 ? 'LOW' : opp.durationDays <= 21 ? 'MEDIUM' : 'HIGH'

  const applicationEffort = requirementCount <= 2 ? 'LOW' : requirementCount <= 5 ? 'MEDIUM' : 'HIGH'

  const costLabel =
    opp.costType === 'FREE'
      ? 'Free'
      : opp.costType === 'FREE_WITH_AID'
        ? 'Paid, aid available'
        : opp.costType === 'PAID' && opp.costAmount !== null
          ? `${opp.costCurrency ?? ''} ${opp.costAmount}`.trim()
          : 'Not stated'

  const overlap = opp.tags.filter(
    (t) => (t.kind === 'SUBJECT' || t.kind === 'INTEREST') && profile.interests.some((i) => i.slug === t.slug),
  ).length
  const skillRelevance =
    profile.interests.length === 0 ? 'UNKNOWN' : overlap >= 2 ? 'HIGH' : overlap === 1 ? 'MEDIUM' : 'LOW'

  const direction = opp.categories[0]?.replace(/[-_]/g, ' ') ?? 'this area'
  const assessment =
    matchScore >= 75 && applicationEffort !== 'HIGH'
      ? `Probably worth applying if you want to build experience in ${direction}. The application looks manageable relative to what it offers.`
      : matchScore >= 75
        ? `Likely a good fit, but the application is substantial. Worth it if ${direction} is a real priority for you this year rather than a maybe.`
        : matchScore >= 50
          ? `A reasonable fit rather than an obvious one. Worth a look if nothing stronger is competing for the same weeks.`
          : `Not an obvious fit for your profile as it stands. Read the eligibility wording before spending time on it.`

  return { timeCommitment, applicationEffort, costLabel, skillRelevance, assessment, isInterpretation: true }
}

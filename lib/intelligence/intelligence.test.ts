import { describe, expect, it } from 'vitest'
import { assessWorth, BANNED_CLAIM_PATTERNS, buildBenefits, violatesClaimPolicy } from './benefits'
import { buildChecklist, classifyRequirement, taskUrgency } from './checklist'
import { bucketByUrgency, countdownText, countDueWithin, primaryDeadline, triage, urgencyOf } from './deadlines'
import { computeReadiness, reminderText, type ReadinessTask } from './readiness'
import type { ScorableOpportunity, ScorableProfile } from './types'

const NOW = new Date('2026-08-18T00:00:00Z')
const inDays = (n: number) => new Date(NOW.getTime() + n * 86_400_000)

describe('deadline triage', () => {
  it('never treats a programme date as something to act on', () => {
    const out = triage(
      [
        { kind: 'PROGRAM_START', date: inDays(2) },
        { kind: 'APPLICATION_DEADLINE', date: inDays(40) },
      ],
      NOW,
    )
    expect(out.find((d) => d.kind === 'PROGRAM_START')!.actionable).toBe(false)
    expect(primaryDeadline(out)!.kind).toBe('APPLICATION_DEADLINE')
    // A programme starting in 2 days must not report "1 application due this week".
    expect(countDueWithin(out, 7, NOW)).toBe(0)
  })

  it('labels every urgency band in words and a shape, not only a colour', () => {
    for (const days of [-1, 1, 5, 12, 60]) {
      const band = urgencyOf(inDays(days), NOW)
      expect(band.label.length).toBeGreaterThan(0)
      expect(band.shape.length).toBeGreaterThan(0)
    }
  })

  it('reads naturally at every distance', () => {
    expect(countdownText(inDays(0), NOW)).toBe('Due today')
    expect(countdownText(inDays(1), NOW)).toBe('Due tomorrow')
    expect(countdownText(inDays(5), NOW)).toBe('Due in 5 days')
    expect(countdownText(inDays(35), NOW)).toBe('Due in 5 weeks')
    expect(countdownText(inDays(-2), NOW)).toBe('Closed 2 days ago')
  })

  it('groups by urgency in the order a dashboard should show them', () => {
    const buckets = bucketByUrgency(
      triage([{ kind: 'APPLICATION_DEADLINE', date: inDays(2) }, { kind: 'APPLICATION_DEADLINE', date: inDays(30) }], NOW),
    )
    expect(buckets[0]!.key).toBe('URGENT')
  })
})

describe('checklist generation', () => {
  it('recognises the requirement types that matter', () => {
    expect(classifyRequirement('Two letters of recommendation')).toBe('RECOMMENDATION')
    expect(classifyRequirement('Upload your academic transcript')).toBe('TRANSCRIPT')
    expect(classifyRequirement('500-word personal statement')).toBe('ESSAY')
    expect(classifyRequirement('Pay the £20 application fee')).toBe('FEE')
    expect(classifyRequirement('Something unusual')).toBe('CUSTOM')
  })

  it('puts the longest lead time first and submission last', () => {
    const tasks = buildChecklist([
      { label: 'Pay the application fee' },
      { label: 'One letter of recommendation' },
      { label: 'Personal statement' },
    ])
    expect(tasks[0]!.kind).toBe('RECOMMENDATION')
    expect(tasks[tasks.length - 1]!.kind).toBe('SUBMIT')
  })

  it('collapses three phrasings of the same job into one task', () => {
    const tasks = buildChecklist([
      { label: 'Upload transcript' },
      { label: 'Academic transcript required' },
      { label: 'Send your report card' },
    ])
    expect(tasks.filter((t) => t.kind === 'TRANSCRIPT')).toHaveLength(1)
  })

  it('warns about a recommendation letter weeks before the deadline, not the night before', () => {
    const rec = { kind: 'RECOMMENDATION' as const, leadTimeDays: 21, title: 'Request a recommendation letter' }
    expect(taskUrgency(rec, inDays(30), NOW).isBehind).toBe(false)
    const late = taskUrgency(rec, inDays(6), NOW)
    expect(late.isBehind).toBe(true)
    expect(late.message).toContain('depends on someone else')
  })

  it('stops warning once the task is done', () => {
    expect(
      taskUrgency({ kind: 'RECOMMENDATION', leadTimeDays: 21, title: 'x', isComplete: true }, inDays(1), NOW).isBehind,
    ).toBe(false)
  })
})

describe('readiness', () => {
  const tasks = (over: Partial<ReadinessTask>[] = []): ReadinessTask[] => [
    { id: '1', title: 'Complete the application form', kind: 'FORM', isRequired: true, isComplete: true, blocksSubmission: true, leadTimeDays: 3 },
    { id: '2', title: 'Upload your transcript', kind: 'TRANSCRIPT', isRequired: true, isComplete: true, blocksSubmission: true, leadTimeDays: 10 },
    { id: '3', title: 'Write your personal statement', kind: 'ESSAY', isRequired: true, isComplete: false, blocksSubmission: true, leadTimeDays: 10 },
    { id: '4', title: 'Submit the application', kind: 'SUBMIT', isRequired: true, isComplete: false, blocksSubmission: true, leadTimeDays: 1 },
    ...(over as ReadinessTask[]),
  ]

  it('scores over required tasks only', () => {
    const out = computeReadiness(tasks(), inDays(30), NOW)
    expect(out.score).toBe(50)
    expect(out.total).toBe(4)
  })

  it('does not let an optional extra dilute the score', () => {
    const withOptional = computeReadiness(
      tasks([{ id: '5', title: 'Optional portfolio', kind: 'PORTFOLIO', isRequired: false, isComplete: false, blocksSubmission: false, leadTimeDays: 14 }]),
      inDays(30),
      NOW,
    )
    expect(withOptional.score).toBe(50)
  })

  it('names one next action, prioritising what is already late', () => {
    const out = computeReadiness(tasks(), inDays(4), NOW)
    expect(out.nextAction!.kind).toBe('ESSAY')
    expect(out.behindSchedule[0]!.title).toContain('personal statement')
  })

  it('blocks submission while a blocking task is outstanding', () => {
    expect(computeReadiness(tasks(), inDays(30), NOW).canSubmit).toBe(false)
  })

  it('writes a reminder that names the unfinished thing', () => {
    const out = computeReadiness(
      [
        { id: '1', title: 'Write your personal statement', kind: 'ESSAY', isRequired: true, isComplete: false, blocksSubmission: true, leadTimeDays: 10 },
      ],
      inDays(1),
      NOW,
    )
    const text = reminderText('Summer Research Placement', out, inDays(1), NOW)!
    expect(text).toContain('tomorrow')
    expect(text.toLowerCase()).toContain('personal statement')
    // The whole point: not just "deadline tomorrow".
    expect(text).not.toBe('Deadline tomorrow')
  })

  it('says so plainly when nothing is left', () => {
    const done = computeReadiness(
      [{ id: '1', title: 'Submit', kind: 'SUBMIT', isRequired: true, isComplete: true, blocksSubmission: true, leadTimeDays: 1 }],
      inDays(2),
      NOW,
    )
    expect(reminderText('Programme', done, inDays(2), NOW)).toContain('everything on your checklist is done')
  })
})

describe('benefit claims', () => {
  const opp: ScorableOpportunity = {
    id: 'o1', title: 'Research Placement', format: 'IN_PERSON',
    locationCountry: 'GB', locationRegion: null, locationCity: 'Leeds',
    costType: 'FREE', costAmount: null, costCurrency: null, aidAvailable: null,
    durationDays: 42, tags: [{ slug: 'biology', weight: 1, kind: 'SUBJECT' }],
    categories: ['research'], rules: [], deadlines: [], isSponsored: false,
  }
  const profile: ScorableProfile = {
    age: 16, countryCode: 'GB', region: null, city: 'Leeds',
    educationLevel: 'SENIOR_SECONDARY', gradeOrYear: 12, curriculum: 'A_LEVELS',
    languages: ['en'], formatPreference: 'ANY', maxTravelRadiusKm: null,
    budgetCeiling: null, budgetCurrency: null, availableFrom: null, availableUntil: null,
    weeklyHoursAvailable: null,
    interests: [{ slug: 'biology', strength: 5, kind: 'SUBJECT' }],
    careerDirections: [], achievements: [{ kind: 'COMPETITION', level: 'NATIONAL', tagSlugs: [], title: 'Olympiad' }],
    thinAreas: [],
  }

  it('catches the claims a student platform must never make', () => {
    expect(violatesClaimPolicy('This will get you into Harvard')).toBeTruthy()
    expect(violatesClaimPolicy('Guarantees a place on the course')).toBeTruthy()
    expect(violatesClaimPolicy('Looks great on your college application')).toBeTruthy()
    expect(violatesClaimPolicy('This is essential for medicine applicants')).toBeTruthy()
  })

  it('lets appropriately hedged wording through', () => {
    expect(
      violatesClaimPolicy(
        'This may strengthen your experience in research and give you a concrete project to discuss later.',
      ),
    ).toBeNull()
  })

  it('labels every generated benefit with its tier', () => {
    const benefits = buildBenefits(opp, profile, [
      { label: 'Participants receive a certificate of completion', rawText: 'All participants receive a certificate.' },
    ])
    expect(benefits.some((b) => b.tier === 'STATED')).toBe(true)
    expect(benefits.some((b) => b.tier === 'STRUCTURAL')).toBe(true)
    expect(benefits.some((b) => b.tier === 'INTERPRETED')).toBe(true)
    for (const b of benefits) expect(['STATED', 'STRUCTURAL', 'INTERPRETED']).toContain(b.tier)
  })

  it('never emits a generated benefit that trips the claim policy', () => {
    for (const b of buildBenefits(opp, profile)) {
      if (b.tier === 'STATED') continue
      expect(violatesClaimPolicy(b.text)).toBeNull()
    }
  })

  it('keeps a stated benefit attributed to the organiser rather than restating it as fact', () => {
    const [stated] = buildBenefits(opp, profile, [
      { label: 'Certificate awarded', rawText: 'All participants receive a certificate.', sourceUrl: 'https://x.example/p' },
    ])
    expect(stated!.tier).toBe('STATED')
    expect(stated!.rawText).toBe('All participants receive a certificate.')
    expect(stated!.sourceUrl).toBe('https://x.example/p')
  })

  it('marks the worth assessment as interpretation, always', () => {
    const w = assessWorth(opp, profile, 3, 88)
    expect(w.isInterpretation).toBe(true)
    expect(violatesClaimPolicy(w.assessment)).toBeNull()
    expect(w.costLabel).toBe('Free')
  })

  it('says "not stated" rather than inventing a cost', () => {
    const w = assessWorth({ ...opp, costType: 'UNKNOWN' }, profile, 2, 60)
    expect(w.costLabel).toBe('Not stated')
  })

  it('has a non-empty claim policy', () => {
    expect(BANNED_CLAIM_PATTERNS.length).toBeGreaterThan(5)
  })
})

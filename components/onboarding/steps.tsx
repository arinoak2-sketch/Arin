import { cloneElement } from 'react'
import { EDUCATION_LEVELS, FORMAT_PREFERENCES } from '@/lib/db/enums'
import { Card, Stack } from '@/components/ui/primitives'

/**
 * Onboarding steps.
 *
 * Plain server-rendered forms posting to route handlers — no client component,
 * no server action, no JavaScript required or involved. Onboarding is the first
 * thing a student touches, frequently on a slow phone, so it is built out of
 * the parts of the web that cannot fail to load.
 *
 * Each step names what the answer unlocks. A student is far more likely to fill
 * in a budget when told it stops Lumen recommending things they would have to
 * withdraw from than when shown a field labelled "Budget".
 */

const LEVEL_LABELS: Record<string, string> = {
  MIDDLE: 'Middle school',
  SECONDARY: 'Secondary',
  SENIOR_SECONDARY: 'Senior secondary / sixth form',
  UNDERGRAD: 'Undergraduate',
  GAP_YEAR: 'Gap year',
}

export function BasicsStep({
  initial,
  error,
}: {
  initial: { dateOfBirth: string; countryCode: string; educationLevel: string; gradeOrYear: number | string }
  error?: string
}) {
  return (
    <StepShell
      step="basics"
      title="First, the basics"
      lede="Age and country decide most of what you are eligible for. Without them Lumen can rule things in or out only by guessing, which it will not do."
      error={error}
      submitLabel="Continue"
    >
      <Field label="Date of birth" hint="Stored as a date, so your age stays correct as you get older.">
        <input type="date" name="dateOfBirth" defaultValue={initial.dateOfBirth} style={input} />
      </Field>
      <Field label="Country" hint="Two-letter code — GB, IN, US. Lets Lumen drop opportunities restricted to elsewhere.">
        <input
          type="text"
          name="countryCode"
          maxLength={2}
          defaultValue={initial.countryCode}
          placeholder="GB"
          autoCapitalize="characters"
          autoComplete="country"
          style={input}
        />
      </Field>
      <Field label="Where you are in school" hint="Many programmes are open only to particular years.">
        <select name="educationLevel" defaultValue={initial.educationLevel} style={input}>
          <option value="">Prefer not to say</option>
          {EDUCATION_LEVELS.map((l) => (
            <option key={l} value={l}>
              {LEVEL_LABELS[l] ?? l}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Year or grade">
        <input type="number" name="gradeOrYear" min={1} max={20} defaultValue={initial.gradeOrYear} style={input} />
      </Field>
    </StepShell>
  )
}

export function InterestsStep({ initial, error }: { initial: string; error?: string }) {
  return (
    <StepShell
      step="interests"
      title="What are you actually interested in?"
      lede="This is the largest single part of your match score. Two or three is plenty to start with, and you can change them whenever."
      error={error}
      submitLabel="Continue"
    >
      <Field
        label="Subjects and interests"
        hint="Separate them with commas — for example: molecular biology, debating, machine learning."
      >
        <input
          type="text"
          name="interests"
          defaultValue={initial}
          placeholder="molecular biology, debating"
          autoComplete="off"
          style={input}
        />
      </Field>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
        Lumen matches these against what an opportunity is actually about, and tells you which of your interests
        matched — so you can see whether it understood you.
      </p>
    </StepShell>
  )
}

export function PracticalitiesStep({
  initial,
  error,
}: {
  initial: {
    formatPreference: string
    budgetCeiling: number | string
    budgetCurrency: string
    availableFrom: string
    availableUntil: string
  }
  error?: string
}) {
  return (
    <StepShell
      step="practicalities"
      title="What would actually work for you?"
      lede="This stops Lumen suggesting things you would have to pull out of later — a programme you cannot afford, or one that runs while you are in exams."
      error={error}
      submitLabel="Continue"
    >
      <Field label="Online or in person?">
        <select name="formatPreference" defaultValue={initial.formatPreference} style={input}>
          {FORMAT_PREFERENCES.map((f) => (
            <option key={f} value={f}>
              {f === 'ANY' ? 'Either is fine' : f === 'IN_PERSON' ? 'In person' : f === 'ONLINE' ? 'Online' : 'Hybrid'}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label="Most you could pay"
        hint="Leave blank if you would rather not say. Lumen never converts currencies — it compares like with like or tells you it cannot."
      >
        <input type="number" name="budgetCeiling" min={0} defaultValue={initial.budgetCeiling} style={input} />
      </Field>
      <Field label="Currency">
        <input
          type="text"
          name="budgetCurrency"
          maxLength={3}
          defaultValue={initial.budgetCurrency}
          placeholder="GBP"
          autoCapitalize="characters"
          style={input}
        />
      </Field>
      <Field label="Free from" hint="Used to check programme dates against your term times, not just the deadline.">
        <input type="date" name="availableFrom" defaultValue={initial.availableFrom} style={input} />
      </Field>
      <Field label="Free until">
        <input type="date" name="availableUntil" defaultValue={initial.availableUntil} style={input} />
      </Field>
    </StepShell>
  )
}

export function DirectionStep({ initial, error }: { initial: string; error?: string }) {
  return (
    <StepShell
      step="direction"
      title="Anything you are curious about?"
      lede="Not a commitment — Lumen uses it to explain why something might be worth your time, and to suggest things that would let you find out whether you actually enjoy the work."
      error={error}
      submitLabel="Finish"
    >
      <Field label="Directions you are curious about" hint="For example: medicine, law, engineering. Commas between them.">
        <input
          type="text"
          name="careerDirections"
          defaultValue={initial}
          placeholder="medicine, research"
          autoComplete="off"
          style={input}
        />
      </Field>
    </StepShell>
  )
}

// ── Shell ────────────────────────────────────────────────────────────────────

function StepShell({
  step,
  title,
  lede,
  error,
  submitLabel,
  children,
}: {
  step: string
  title: string
  lede: string
  error?: string
  submitLabel: string
  children: React.ReactNode
}) {
  return (
    <Stack gap={20}>
      <Stack gap={8}>
        <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.022em', lineHeight: 1.15 }}>{title}</h1>
        <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{lede}</p>
      </Stack>

      <form method="post" action={`/api/onboarding/${step}`}>
        <Card>
          <Stack gap={16}>{children}</Stack>
        </Card>

        {error ? (
          <p role="alert" style={{ marginTop: 12, fontSize: 13.5, color: 'var(--urgent)', lineHeight: 1.55 }}>
            {error}
          </p>
        ) : null}

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 18, flexWrap: 'wrap' }}>
          <button
            type="submit"
            style={{
              minHeight: 48,
              padding: '13px 24px',
              borderRadius: 'var(--radius-input)',
              border: 'none',
              background: 'var(--accent)',
              color: 'var(--accent-contrast)',
              fontWeight: 650,
              fontSize: 15.5,
              cursor: 'pointer',
            }}
          >
            {submitLabel}
          </button>
        </div>
      </form>

      {/* A separate form, so skipping never submits half-filled values. */}
      <form method="post" action="/api/onboarding/skip">
        <input type="hidden" name="step" value={step} />
        <button
          type="submit"
          style={{
            background: 'none',
            border: 'none',
            padding: '8px 0',
            minHeight: 40,
            fontSize: 13.5,
            color: 'var(--text-tertiary)',
            textDecoration: 'underline',
            cursor: 'pointer',
          }}
        >
          Skip this step
        </button>
      </form>
    </Stack>
  )
}

/**
 * Associates the label with the control by id, and attaches the hint through
 * aria-describedby rather than nesting it inside the label — otherwise the hint
 * becomes part of the field's accessible name.
 */
function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactElement<{ id?: string; 'aria-describedby'?: string }>
}) {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const hintId = hint ? `${id}-hint` : undefined
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label htmlFor={id} style={{ fontSize: 14, fontWeight: 600 }}>
        {label}
      </label>
      {cloneElement(children, { id, 'aria-describedby': hintId })}
      {hint ? (
        <span id={hintId} style={{ fontSize: 12.5, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
          {hint}
        </span>
      ) : null}
    </div>
  )
}

const input: React.CSSProperties = {
  minHeight: 48,
  padding: '12px 13px',
  fontSize: 15.5,
  borderRadius: 'var(--radius-input)',
  border: '1px solid var(--border-strong)',
  background: 'var(--surface-sunken)',
  width: '100%',
}

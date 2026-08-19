'use client'

import { cloneElement, useActionState } from 'react'
import { saveProfileAction, type ProfileSaveResult } from '@/lib/actions/profile'
import { CURRICULA, EDUCATION_LEVELS, FORMAT_PREFERENCES } from '@/lib/db/enums'
import { Button, Card, SectionHeading, Stack } from '@/components/ui/primitives'

export interface ProfileInitial {
  dateOfBirth: string
  countryCode: string
  city: string
  educationLevel: string
  gradeOrYear: number | string
  curriculum: string
  formatPreference: string
  budgetCeiling: number | string
  budgetCurrency: string
  availableFrom: string
  availableUntil: string
  weeklyHoursAvailable: number | string
  interests: string
  careerDirections: string
}

const LEVEL_LABELS: Record<string, string> = {
  MIDDLE: 'Middle school',
  SECONDARY: 'Secondary',
  SENIOR_SECONDARY: 'Senior secondary / sixth form',
  UNDERGRAD: 'Undergraduate',
  GAP_YEAR: 'Gap year',
}

const INITIAL_STATE: ProfileSaveResult | null = null

export function ProfileForm({ initial }: { initial: ProfileInitial }) {
  // The server action is the form's action, not a click handler, so the form
  // posts correctly whether or not React has hydrated yet.
  const [result, formAction, pending] = useActionState(saveProfileAction, INITIAL_STATE)

  const message = result
    ? result.ok
      ? { tone: 'ok' as const, text: 'Saved. Your matches will update straight away.' }
      : { tone: 'error' as const, text: result.error ?? 'Could not save your profile.' }
    : null

  return (
    <form action={formAction}>
      <Stack gap={22}>
        <Card>
          <Stack gap={16}>
            <SectionHeading title="About you" description="Age and country are what most eligibility rules turn on." />
            <Grid>
              <Field label="Date of birth" hint="Stored as a date so your age is always current.">
                <input type="date" name="dateOfBirth" defaultValue={initial.dateOfBirth} style={inputStyle} />
              </Field>
              <Field label="Country" hint="Two-letter code, e.g. GB, IN, US.">
                <input
                  type="text"
                  name="countryCode"
                  maxLength={2}
                  defaultValue={initial.countryCode}
                  placeholder="GB"
                  autoCapitalize="characters"
                  style={inputStyle}
                />
              </Field>
              <Field label="City" hint="Optional. Used only to spot things happening near you.">
                <input type="text" name="city" defaultValue={initial.city} style={inputStyle} />
              </Field>
            </Grid>
          </Stack>
        </Card>

        <Card>
          <Stack gap={16}>
            <SectionHeading title="Study" description="Many programmes are open only to particular years or curricula." />
            <Grid>
              <Field label="Education level">
                <select name="educationLevel" defaultValue={initial.educationLevel} style={inputStyle}>
                  <option value="">Not set</option>
                  {EDUCATION_LEVELS.map((l) => (
                    <option key={l} value={l}>
                      {LEVEL_LABELS[l] ?? l}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Year or grade">
                <input type="number" name="gradeOrYear" min={1} max={20} defaultValue={initial.gradeOrYear} style={inputStyle} />
              </Field>
              <Field label="Curriculum">
                <select name="curriculum" defaultValue={initial.curriculum} style={inputStyle}>
                  <option value="">Not set</option>
                  {CURRICULA.map((c) => (
                    <option key={c} value={c}>
                      {c.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </Field>
            </Grid>
          </Stack>
        </Card>

        <Card>
          <Stack gap={16}>
            <SectionHeading
              title="Interests and direction"
              description="The largest single part of your match score. Separate each with a comma."
            />
            <Stack gap={14}>
              <Field label="Interests and subjects" hint="e.g. molecular biology, debating, machine learning">
                <input
                  type="text"
                  name="interests"
                  defaultValue={initial.interests}
                  placeholder="molecular biology, debating"
                  style={inputStyle}
                />
              </Field>
              <Field label="Directions you are curious about" hint="e.g. medicine, law, engineering. Used to explain why something suits you.">
                <input
                  type="text"
                  name="careerDirections"
                  defaultValue={initial.careerDirections}
                  placeholder="medicine, research"
                  style={inputStyle}
                />
              </Field>
            </Stack>
          </Stack>
        </Card>

        <Card>
          <Stack gap={16}>
            <SectionHeading
              title="Practicalities"
              description="Stops Lumen recommending things you would have to withdraw from later."
            />
            <Grid>
              <Field label="Format preference">
                <select name="formatPreference" defaultValue={initial.formatPreference} style={inputStyle}>
                  {FORMAT_PREFERENCES.map((f) => (
                    <option key={f} value={f}>
                      {f === 'ANY' ? 'No preference' : f.replace(/_/g, ' ').toLowerCase()}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Most you could pay">
                <input type="number" name="budgetCeiling" min={0} defaultValue={initial.budgetCeiling} style={inputStyle} />
              </Field>
              <Field label="Currency" hint="Lumen never converts currencies — it compares like with like or says so.">
                <input
                  type="text"
                  name="budgetCurrency"
                  maxLength={3}
                  defaultValue={initial.budgetCurrency}
                  placeholder="GBP"
                  autoCapitalize="characters"
                  style={inputStyle}
                />
              </Field>
              <Field label="Free from">
                <input type="date" name="availableFrom" defaultValue={initial.availableFrom} style={inputStyle} />
              </Field>
              <Field label="Free until">
                <input type="date" name="availableUntil" defaultValue={initial.availableUntil} style={inputStyle} />
              </Field>
              <Field label="Hours a week you could give">
                <input
                  type="number"
                  name="weeklyHoursAvailable"
                  min={0}
                  max={80}
                  defaultValue={initial.weeklyHoursAvailable}
                  style={inputStyle}
                />
              </Field>
            </Grid>
          </Stack>
        </Card>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <Button type="submit" variant="primary" size="lg" disabled={pending}>
            {pending ? 'Saving…' : 'Save profile'}
          </Button>
          {message ? (
            <span
              role="status"
              style={{ fontSize: 13.5, color: message.tone === 'ok' ? 'var(--accent)' : 'var(--urgent)' }}
            >
              {message.text}
            </span>
          ) : null}
        </div>
      </Stack>
    </form>
  )
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>{children}</div>
}

/**
 * Associates the label with the control by id, and attaches the hint through
 * aria-describedby rather than nesting it inside the label — otherwise the hint
 * text becomes part of the field's accessible name.
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
      <label htmlFor={id} style={{ fontSize: 13.5, fontWeight: 600 }}>
        {label}
      </label>
      {cloneElement(children, { id, 'aria-describedby': hintId })}
      {hint ? (
        <span id={hintId} style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.45 }}>
          {hint}
        </span>
      ) : null}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  minHeight: 44,
  padding: '10px 12px',
  fontSize: 14.5,
  borderRadius: 'var(--radius-input)',
  border: '1px solid var(--border-strong)',
  background: 'var(--surface-sunken)',
  width: '100%',
}

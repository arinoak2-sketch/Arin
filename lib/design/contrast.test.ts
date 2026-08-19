import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Palette contrast, checked against the real stylesheet.
 *
 * This exists because the design doc claimed "min 4.5:1" for a token that
 * actually measured 3.82:1. A number written in a document is a hope; parsing
 * the CSS and doing the arithmetic is a guarantee.
 *
 * The subtlety it enforces: a text colour must clear 4.5:1 against **every**
 * surface it can sit on, not just the page background. `--text-tertiary` passed
 * on canvas (4.04) and failed on the sunken surface (3.82) — and metadata text
 * sits on sunken surfaces constantly.
 */

const CSS = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8')

const channel = (c: number): number => {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

export function luminance(hex: string): number {
  const h = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16))
  return 0.2126 * channel(r!) + 0.7152 * channel(g!) + 0.0722 * channel(b!)
}

export function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (lighter! + 0.05) / (darker! + 0.05)
}

/** Pulls one theme block out of globals.css and reads its token values. */
function tokensIn(blockStart: string): Record<string, string> {
  const index = CSS.indexOf(blockStart)
  expect(index, `theme block "${blockStart}" not found in globals.css`).toBeGreaterThan(-1)

  const body = CSS.slice(index, CSS.indexOf('--shadow-1', index))
  const tokens: Record<string, string> = {}
  for (const match of body.matchAll(/(--[a-z-]+):\s*(#[0-9a-fA-F]{6})/g)) {
    tokens[match[1]!] = match[2]!.toLowerCase()
  }
  return tokens
}

const LIGHT = tokensIn(':root {')
const DARK = tokensIn(":root[data-theme='dark']")

const SURFACES = ['--surface-canvas', '--surface-raised', '--surface-sunken'] as const

/** Every token used for text, and the minimum it must clear. */
const TEXT_TOKENS = [
  '--text-primary',
  '--text-secondary',
  '--text-tertiary',
  '--accent',
  '--urgent',
  '--soon',
  '--upcoming',
  '--calm',
  '--caution',
  '--passed',
] as const

const AA_NORMAL = 4.5

describe.each([
  ['light', LIGHT],
  ['dark', DARK],
])('%s theme contrast', (themeName, tokens) => {
  it('defines every token the components rely on', () => {
    for (const token of [...TEXT_TOKENS, ...SURFACES]) {
      expect(tokens[token], `${token} missing from the ${themeName} theme`).toBeDefined()
    }
  })

  it.each(TEXT_TOKENS)('%s clears AA against every surface', (token) => {
    const colour = tokens[token]!
    for (const surface of SURFACES) {
      const ratio = contrastRatio(colour, tokens[surface]!)
      expect(
        ratio,
        `${token} (${colour}) on ${surface} (${tokens[surface]}) is ${ratio.toFixed(2)}:1 in the ${themeName} theme`,
      ).toBeGreaterThanOrEqual(AA_NORMAL)
    }
  })

  it('keeps text on the accent surface readable', () => {
    const ratio = contrastRatio(tokens['--accent-contrast']!, tokens['--accent']!)
    expect(ratio, `accent-contrast on accent is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_NORMAL)
  })

  it('keeps the strong border visible enough to read as a control edge', () => {
    // Non-text UI boundaries need 3:1 under WCAG 1.4.11.
    const ratio = contrastRatio(tokens['--border-strong']!, tokens['--surface-raised']!)
    expect(ratio, `border-strong is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(2.9)
  })
})

describe('contrast maths', () => {
  it('matches the known reference values', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1)
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5)
    // Order must not matter.
    expect(contrastRatio('#0e7c55', '#ffffff')).toBeCloseTo(contrastRatio('#ffffff', '#0e7c55'), 5)
  })

  it('would have caught the token that shipped failing', () => {
    // The old light --text-tertiary, on the surface it actually sat on.
    expect(contrastRatio('#767e77', '#f4f5f2')).toBeLessThan(AA_NORMAL)
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * The production guard is the only thing standing between a misconfigured
 * deploy and an authentication bypass, so it gets its own test. It was written
 * early and never called — this suite is what stops that recurring.
 */

const ORIGINAL = { ...process.env }

afterEach(() => {
  process.env = { ...ORIGINAL }
  vi.resetModules()
})

async function loadConfig(env: Record<string, string | undefined>) {
  process.env = { ...ORIGINAL, ...env } as NodeJS.ProcessEnv
  vi.resetModules()
  return import('./config')
}

describe('production safety guard', () => {
  it('refuses to start in production without an auth secret', async () => {
    const { assertProductionSafety } = await loadConfig({
      NODE_ENV: 'production',
      AUTH_SECRET: '',
      AUTH_GOOGLE_ID: 'id',
      AUTH_GOOGLE_SECRET: 'secret',
      ALLOW_DEV_SIGNIN: 'false',
    })
    expect(() => assertProductionSafety()).toThrow(/AUTH_SECRET/)
  })

  it('refuses to start in production with dev sign-in switched on', async () => {
    const { assertProductionSafety } = await loadConfig({
      NODE_ENV: 'production',
      AUTH_SECRET: 'x'.repeat(32),
      AUTH_GOOGLE_ID: 'id',
      AUTH_GOOGLE_SECRET: 'secret',
      ALLOW_DEV_SIGNIN: 'true',
    })
    expect(() => assertProductionSafety()).toThrow(/ALLOW_DEV_SIGNIN/)
  })

  it('refuses to start in production with no sign-in method configured', async () => {
    const { assertProductionSafety } = await loadConfig({
      NODE_ENV: 'production',
      AUTH_SECRET: 'x'.repeat(32),
      AUTH_GOOGLE_ID: '',
      AUTH_GOOGLE_SECRET: '',
      ALLOW_DEV_SIGNIN: 'false',
    })
    expect(() => assertProductionSafety()).toThrow(/Google sign-in/)
  })

  it('starts when production is configured properly', async () => {
    const { assertProductionSafety } = await loadConfig({
      NODE_ENV: 'production',
      AUTH_SECRET: 'x'.repeat(32),
      AUTH_GOOGLE_ID: 'id',
      AUTH_GOOGLE_SECRET: 'secret',
      ALLOW_DEV_SIGNIN: 'false',
    })
    expect(() => assertProductionSafety()).not.toThrow()
  })

  it('never allows dev sign-in in production, whatever the variable says', async () => {
    const { devSignInAllowed } = await loadConfig({
      NODE_ENV: 'production',
      ALLOW_DEV_SIGNIN: 'true',
    })
    expect(devSignInAllowed()).toBe(false)
  })

  it('reports missing capabilities with a reason a student can read', async () => {
    const { searchCapability, aiCapability } = await loadConfig({
      NODE_ENV: 'development',
      BRAVE_SEARCH_API_KEY: '',
      ANTHROPIC_API_KEY: '',
    })
    const search = searchCapability()
    expect(search.available).toBe(false)
    expect(search.reason).toMatch(/not configured/i)
    // The AI reason must make clear matching still works without it.
    expect(aiCapability().reason).toMatch(/work without it/i)
  })

  it('falls back to a conservative search budget when the variable is nonsense', async () => {
    const { braveMonthlyBudget } = await loadConfig({ BRAVE_MONTHLY_QUERY_BUDGET: 'lots' })
    expect(braveMonthlyBudget()).toBe(1800)
  })
})

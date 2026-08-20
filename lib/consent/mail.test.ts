import { describe, expect, it, vi } from 'vitest'
import { consentRequestEmail, ResendMailer } from './mail'

/**
 * The message a parent receives.
 *
 * Two concerns. First, injection: a student chooses their own display name, and
 * that name is interpolated into HTML sent to someone else's inbox. Second,
 * tone — this arrives unsolicited from a service the reader has never heard of,
 * about their child, and it has to be answerable without a fight.
 */

const base = {
  parentEmail: 'parent@example.com',
  studentName: 'Sam Student',
  studentEmail: 'sam@example.com',
  approvalUrl: 'https://lumen.example/consent/abc123',
  expiresAt: new Date('2026-09-03T00:00:00Z'),
}

describe('injection', () => {
  it('escapes markup in a student-chosen name', () => {
    const email = consentRequestEmail({
      ...base,
      studentName: '<img src=x onerror="alert(1)">',
    })
    // The words survive as inert text; what must not survive is the ability to
    // form a tag. No raw angle bracket from the name reaches the output.
    expect(email.html).not.toContain('<img')
    expect(email.html).toContain('&lt;img')
    expect(email.html).toContain('onerror=&quot;')
  })

  it('cannot be used to break out of the link attribute', () => {
    const email = consentRequestEmail({
      ...base,
      approvalUrl: 'https://lumen.example/consent/x" onclick="alert(1)',
    })
    // The quote is escaped, so the href never closes early and onclick stays
    // part of the URL text rather than becoming a second attribute.
    expect(email.html).not.toContain('" onclick="')
    expect(email.html).toContain('onclick=&quot;')
  })

  it('escapes ampersands and quotes without mangling ordinary names', () => {
    const email = consentRequestEmail({ ...base, studentName: "Aisha O'Neill-Brown" })
    expect(email.html).toContain('Aisha O&#39;Neill-Brown')
    expect(email.text).toContain("Aisha O'Neill-Brown")
  })
})

describe('what it says', () => {
  it('is addressed to the parent', () => {
    expect(consentRequestEmail(base).to).toBe('parent@example.com')
  })

  it('names the student in the subject, so it is not mistaken for spam', () => {
    expect(consentRequestEmail(base).subject).toContain('Sam Student')
  })

  it('falls back to the student’s email when they have no name', () => {
    const email = consentRequestEmail({ ...base, studentName: null })
    expect(email.subject).toContain('sam@example.com')
  })

  it('does not treat a blank name as a name', () => {
    const email = consentRequestEmail({ ...base, studentName: '   ' })
    expect(email.subject).toContain('sam@example.com')
  })

  it('carries the approval link in both the text and HTML parts', () => {
    const email = consentRequestEmail(base)
    expect(email.text).toContain(base.approvalUrl)
    expect(email.html).toContain(base.approvalUrl)
  })

  it('states when the link stops working', () => {
    const email = consentRequestEmail(base)
    expect(email.text).toContain('2026-09-03')
    expect(email.html).toContain('2026-09-03')
  })

  it('says what would be stored, in plain words', () => {
    const email = consentRequestEmail(base)
    for (const thing of ['date of birth', 'country', 'school year']) {
      expect(email.text.toLowerCase()).toContain(thing)
    }
    expect(email.text.toLowerCase()).toContain('sold or shared')
  })

  it('makes refusing as easy as agreeing', () => {
    // A consent request that is hard to decline is not a consent request.
    const email = consentRequestEmail(base)
    expect(email.text.toLowerCase()).toContain('ignore')
    expect(email.text.toLowerCase()).toContain('doing nothing is a valid answer')
  })

  it('always sends a plain-text part, for clients that will not render HTML', () => {
    const email = consentRequestEmail(base)
    expect(email.text.length).toBeGreaterThan(200)
    expect(email.text).not.toContain('<div')
  })
})

describe('ResendMailer', () => {
  const okResponse = () => new Response(JSON.stringify({ id: 'x' }), { status: 200 })

  it('sends the message the builder produced', async () => {
    const fetchMock = vi.fn(async () => okResponse())
    vi.stubGlobal('fetch', fetchMock)

    await new ResendMailer('key-123', 'Lumen <no-reply@example.org>').send(consentRequestEmail(base))

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.resend.com/emails')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer key-123')
    const body = JSON.parse(String(init.body)) as { to: string[]; from: string; text: string }
    expect(body.to).toEqual(['parent@example.com'])
    expect(body.from).toBe('Lumen <no-reply@example.org>')
    expect(body.text).toContain(base.approvalUrl)

    vi.unstubAllGlobals()
  })

  it('throws with the provider’s own explanation, so an admin can act on it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('domain is not verified', { status: 403 })))

    await expect(
      new ResendMailer('key-123', 'from@example.org').send(consentRequestEmail(base)),
    ).rejects.toThrow(/403.*domain is not verified/s)

    vi.unstubAllGlobals()
  })

  it('never puts the api key in the error it raises', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 401 })))

    await expect(
      new ResendMailer('secret-key-value', 'from@example.org').send(consentRequestEmail(base)),
    ).rejects.toSatisfy((e: Error) => !e.message.includes('secret-key-value'))

    vi.unstubAllGlobals()
  })
})

import 'server-only'

/**
 * Sending the consent request.
 *
 * The message content is built by a pure function so it can be tested and
 * read; delivery sits behind a one-method interface so the provider is a
 * detail. Without a provider configured, nothing is faked: the request is
 * still recorded, the failure is stored on the row, and the admin queue shows
 * exactly which parents have not been written to.
 */

export interface OutgoingEmail {
  to: string
  subject: string
  text: string
  html: string
}

export interface Mailer {
  send(email: OutgoingEmail): Promise<void>
}

export interface ConsentEmailInput {
  parentEmail: string
  studentName: string | null
  studentEmail: string
  approvalUrl: string
  expiresAt: Date
}

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => `&${{ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot', "'": '#39' }[c]};`)

/**
 * The message a parent receives.
 *
 * Written to be read by someone who has never heard of Lumen and did not ask
 * for this email. It says who is asking, what for, what happens if they ignore
 * it, and how to refuse — a consent request that is hard to decline is not
 * really a consent request.
 */
export function consentRequestEmail(input: ConsentEmailInput): OutgoingEmail {
  const who = input.studentName?.trim() || input.studentEmail
  const expires = input.expiresAt.toISOString().slice(0, 10)

  const text = [
    `${who} has asked to use Lumen and needs your permission.`,
    '',
    'Lumen helps students find scholarships, competitions and programmes they',
    'are eligible for, and keeps track of the deadlines. Because they are under',
    '16 and in the EU, the law requires a parent or guardian to agree before we',
    'can hold their information.',
    '',
    'What we would store: their date of birth, country, school year, the',
    'subjects they are interested in, and the opportunities they save. Nothing',
    'is sold or shared, and it can be exported or deleted at any time.',
    '',
    `To agree, open this link before ${expires}:`,
    input.approvalUrl,
    '',
    'If you do not recognise this, or you would rather not agree, simply ignore',
    'this email. The account stays locked and is deleted when the link expires.',
    'Doing nothing is a valid answer.',
  ].join('\n')

  const html = `
<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.6;color:#1a1c19;max-width:34em">
  <p><strong>${escapeHtml(who)}</strong> has asked to use Lumen and needs your permission.</p>
  <p>Lumen helps students find scholarships, competitions and programmes they are eligible
     for, and keeps track of the deadlines. Because they are under 16 and in the EU, the law
     requires a parent or guardian to agree before we can hold their information.</p>
  <p><strong>What we would store:</strong> their date of birth, country, school year, the subjects
     they are interested in, and the opportunities they save. Nothing is sold or shared, and it
     can be exported or deleted at any time.</p>
  <p><a href="${escapeHtml(input.approvalUrl)}"
        style="display:inline-block;padding:12px 20px;background:#1f6f4f;color:#fff;
               border-radius:8px;text-decoration:none;font-weight:600">Give permission</a></p>
  <p style="color:#4a524a;font-size:13.5px">This link stops working on ${escapeHtml(expires)}.</p>
  <p style="color:#4a524a;font-size:13.5px">If you do not recognise this, or would rather not
     agree, ignore this email. The account stays locked and is deleted when the link expires.
     Doing nothing is a valid answer.</p>
</div>`.trim()

  return {
    to: input.parentEmail,
    subject: `${who} needs your permission to use Lumen`,
    text,
    html,
  }
}

/**
 * Resend, over its REST API.
 *
 * Chosen because it needs no dependency — a single fetch — and so adds no
 * package to audit. Any failure is returned to the caller and stored on the
 * consent row rather than swallowed, so a misconfiguration shows up in the
 * admin queue as an undelivered request instead of a silently lost email.
 */
export class ResendMailer implements Mailer {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(email: OutgoingEmail): Promise<void> {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.from,
        to: [email.to],
        subject: email.subject,
        text: email.text,
        html: email.html,
      }),
      signal: AbortSignal.timeout(15_000),
    })

    if (!response.ok) {
      // The body often names the problem (unverified sender, bad key). Keep it
      // short: this string is stored and shown to an admin, not to a student.
      const detail = await response.text().catch(() => '')
      throw new Error(`Mail provider returned ${response.status}. ${detail.slice(0, 300)}`)
    }
  }
}

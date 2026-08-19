# Lumen — Security Review

Reviewed on the branch as a whole (there is no earlier baseline to diff against).
Everything below is either fixed in code or recorded as an accepted risk.

## Fixed

### 1. SSRF in the page fetcher — **serious**

`fetchPage()` fetched URLs that came from a search engine, i.e. chosen by third
parties, with `redirect: 'follow'` and no address checks. Two live paths:

- A public hostname resolving to a private address (attacker controls DNS for a
  domain they can get indexed).
- A public URL responding `302 http://169.254.169.254/…` — the cloud metadata
  endpoint — or to any internal service.

Lumen stores fetched page text as opportunity content, so a successful request
would have been *readable afterwards*: this was an exfiltration path, not just
a blind request.

**Fix.** `lib/discovery/net-guard.ts` refuses loopback, private, link-local,
carrier-grade NAT, reserved, multicast, unique-local and IPv4-mapped-IPv6
addresses, plus `localhost`, `.internal`, `.local` and the metadata hostnames.
`fetcher.ts` now resolves and checks **every** hop: redirects are followed by
hand (max 4) and re-validated, and the check runs *before* `robots.txt` is
fetched — that request is server-side too, so it must not be the hole the guard
leaves open. 8 unit tests, including the `::ffff:127.0.0.1` bypass.

### 2. The production safety guard was never called — **serious**

`assertProductionSafety()` existed and was correct, but nothing invoked it, so
it was decorative. A production deploy with `ALLOW_DEV_SIGNIN=true` or a missing
`AUTH_SECRET` would have booted with an authentication bypass.

**Fix.** `instrumentation.ts` calls it at server startup, so the process refuses
to start instead. 7 unit tests cover each refusal path and the
"dev sign-in is impossible in production regardless of the variable" rule.

### 3. Unlimited listing reports — moderate

Any signed-in student could drop any listing to `NEEDS_REVIEW`, repeatedly and
without limit. One account could have flagged the entire corpus, which is a
denial-of-quality attack against every other student.

**Fix.** 20 reports per account per day, and re-reporting the same listing
inside 7 days is treated as already done rather than re-flagging it — so a
double tap does not churn the review queue either.

### 4. No per-student live-search limit — moderate

The monthly Brave budget was global, so a single account could spend the whole
allowance on everyone else's behalf.

**Fix.** 12 live searches per student per hour, checked before the global
budget, with an honest message rather than silent degradation.

## Checked and sound

- **Authorisation.** Every action in `lib/actions/*` resolves the user from the
  session and scopes its query by that id; none accepts a user id from the
  caller. Checklist writes join through `application.userId`, so guessing a task
  id does not reach another student's row.
- **Secrets.** No `NEXT_PUBLIC_*` anywhere. Every module touching a key imports
  `server-only`, so a client import fails the build rather than shipping a key.
- **XSS.** No `dangerouslySetInnerHTML`, no `eval`, no `new Function`. Extracted
  page text — the one genuinely untrusted string in the product — is rendered as
  React children and therefore escaped.
- **Prompt injection.** Page content reaches the model during gap-fill
  extraction. The verbatim check is the mitigation: any value the model returns
  must appear in the source text or it is discarded, so injected instructions
  can at most produce text already on the page. Deadlines and fees additionally
  go through the deterministic parsers, so a hallucinated number cannot enter.
- **Calendar export.** Session-scoped with no token or user id in the URL, so a
  shared link exposes nothing. That costs subscribe-by-URL, which is the right
  trade for a product holding minors' data.
- **Account deletion.** Removes profile, saves, applications, checklists,
  notifications and OAuth links; anonymises the `User` row so audit foreign keys
  survive without personal data. One click plus a typed confirmation.

## Accepted risks, and what would close them

| Risk | Status |
|---|---|
| Session cookies rely on Auth.js defaults | Fine for a standard deployment; revisit if Lumen is ever embedded in an iframe. |
| No CSRF token on server actions | Next.js server actions verify Origin against Host by default. Confirm this holds if a reverse proxy rewrites either header. |
| Admin role is set directly in the database | Acceptable while admins are the operators. Needs a proper admin-management screen before that changes. |
| Discovery logs keep raw query text for 90 days | A student's searches can be personal. The purge job is documented but **not yet scheduled** — see below. |
| No audit trail of admin *reads* | Approvals and archives are logged; viewing a student's data is not. Worth adding if support staff ever get access. |

## Not yet done

- **The 90-day discovery-log purge is documented but not implemented.** The
  retention promise in `docs/00-decisions.md` is not currently kept by code.
  This is the one place where a stated policy has no enforcement behind it.
- Rate limits are per-process counters backed by database counts; they hold on a
  single instance and are approximate across several.

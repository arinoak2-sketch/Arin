# Running Lumen

## Local, in three commands

```bash
npm install
cp .env.example .env        # SQLite by default — nothing to provision
npx prisma db push && npm run dev
```

Open http://localhost:3000. The corpus starts empty, which is correct: Lumen
fills it from the live web rather than shipping a directory.

Without credentials the app runs and says so. The dev-only sign-in appears
(never in production), discovery shows "Live discovery is not configured", and
the AI advisor stays off. Matching, checklists, deadlines and reminders all work
regardless — they never depend on a key.

## The credentials, and what each unlocks

These have to be created by the account owner; they cannot be provisioned on
your behalf.

### 1. Brave Search — live discovery

1. Go to https://brave.com/search/api/ and sign up.
2. Choose the **Free** plan (~2,000 queries/month).
3. Copy the subscription token into `BRAVE_SEARCH_API_KEY`.

Lumen reserves quota before spending it and pauses with a dated message rather
than overrunning. Adjust `BRAVE_MONTHLY_QUERY_BUDGET` if you move to a paid tier.

### 2. Google OAuth — sign-in

1. https://console.cloud.google.com/apis/credentials → **Create credentials** →
   **OAuth client ID** → **Web application**.
2. Authorised redirect URIs:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://YOUR_DOMAIN/api/auth/callback/google`
3. Configure the OAuth consent screen; the scopes needed are `email` and `profile`.
4. Copy the client ID and secret into `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`.
5. Generate a session secret: `openssl rand -base64 32` → `AUTH_SECRET`.

### 3. Anthropic — AI gap-fill and the advisor (optional)

1. https://console.anthropic.com/settings/keys → create a key.
2. Put it in `ANTHROPIC_API_KEY`.

Only used for fields that structured markup and text parsing both failed to
produce, and only where the returned value appears verbatim in the source page.
Anything it fills holds the record at "needs review".

## Production

Set `DATABASE_URL` to a Postgres connection string and change the provider in
`prisma/schema.prisma` from `sqlite` to `postgresql`. The schema is written to
run unchanged on both.

The app refuses to boot in production if `AUTH_SECRET` is missing, if Google
sign-in is unconfigured, or if `ALLOW_DEV_SIGNIN` is `true` — see
`assertProductionSafety()` in `lib/config.ts`.

## Tests

```bash
npm test                # unit tests — matching, extraction, dedupe, provenance, contrast
npm run typecheck

npm run dev             # in one shell
npm run test:e2e        # in another — runs the three suites in sequence
```

The three end-to-end suites and what each is for:

| Suite | Command | Guards |
|---|---|---|
| Journey | `npm run test:e2e:journey` | The whole student path, and the promises each screen makes |
| Accessibility | `npm run test:e2e:a11y` | axe over every page, in both themes |
| No JavaScript | `npm run test:e2e:nojs` | Every control works before React hydrates |

`npm run test:capture` regenerates the review screenshots; those specs are
excluded from the normal run because they assert nothing.

**Run them as separate commands, not one `playwright test`.** They share a dev
server, and Next's dev server gets unreliable after many route compilations in
one go.

**Two dev-server gotchas that will otherwise look like product bugs:**

1. *Stale build cache after editing shared modules.* Symptom is
   `Cannot find module './vendor-chunks/…'` and a 500 on an unrelated page. Stop
   the server, `rm -rf .next`, start again.
2. *A route compiling mid-request.* Symptom is `Unexpected end of JSON input` or
   `Expected clientReferenceManifest to be defined`, usually on the page a form
   POST redirects to. `e2e/global-setup.ts` warms every page **and every route
   handler** before the suites to avoid it, and the config allows retries for
   the residual race. Neither can happen in a production build, where nothing
   compiles at request time.

Test fixtures live in `e2e/fixtures.ts`, are titled `TEST FIXTURE — …`, and are
never seeded into a real deployment.

## Scheduled work

`POST /api/cron/maintenance` does two jobs and should run daily:

- **Expiry sweep** — listings whose application deadline has passed become
  `EXPIRED`, each with an audit entry. The old date is never carried into a new
  cycle.
- **Retention purge** — discovery logs older than 90 days and sent notifications
  older than 60 are deleted, which is what keeps the retention promise in
  `docs/00-decisions.md`.

Set `CRON_SECRET` (`openssl rand -hex 32`) and call it with that as a bearer
token. The route refuses every request when the secret is unset or shorter than
16 characters — an unauthenticated endpoint that deletes rows is worse than no
endpoint. GET and POST both work: Vercel Cron uses GET, and authorisation here
is the bearer token alone, so there is no cookie authority for a prefetch or a
cross-origin page to ride.

```bash
curl -X POST https://YOUR_DOMAIN/api/cron/maintenance \
  -H "Authorization: Bearer $CRON_SECRET"
```

On Vercel this is already wired in `vercel.json` (daily at 03:00 UTC). Vercel
sends `Authorization: Bearer $CRON_SECRET` automatically, so setting the
environment variable is the only step.

Both jobs are also runnable by hand from `/admin`, which is the quickest way to
confirm the retention policy is being kept.

## Making yourself an admin

```bash
npx prisma studio     # set your User.role to ADMIN
```

Then `/admin` shows the review queue and data-quality dashboard.

## Running the end-to-end suites

They drive a **development** server you start yourself, and they must reach it on port 3000:

```bash
npm run dev          # leave running
npm run test:e2e     # journey, then accessibility, then no-JavaScript
```

A production build would be the more stable target, and cannot hit the compile race described
below — but it is not usable here: `next start` runs with `NODE_ENV=production`, where
`assertProductionSafety()` refuses the development sign-in these suites depend on. Testing against
production would require real Google OAuth credentials.

### Three things that will waste your afternoon

**A dev server left over from an earlier session.** It keeps port 3000 and serves the code it
started with, so a run can pass or fail against something other than your working tree. Next then
starts your new server on 3001 with only a one-line warning, and the suites keep testing the old
one. `e2e/global-setup.ts` now refuses to run when nothing usable answers on the base URL and says
this explicitly, but it cannot tell a stale server from a fresh one — if results look impossible,
check `fuser -n tcp 3000` first. (`ss` is not installed in every container; it failing is not
evidence the port is free.)

**Editing source while the suites run.** Fast Refresh invalidates, and a full rebuild landing in the
middle of a form redirect produces `SyntaxError: Unexpected end of JSON input` and a 500 on whatever
page the 303 pointed at. It looks like a product bug and is not one. Let a run finish.

**A cold `.next`.** The first run after deleting it pays compile costs the warm-up cannot fully
absorb. `allowedDevOrigins: ['127.0.0.1']` in `next.config.ts` removed most of this: the suites use
`127.0.0.1` while the server calls itself `localhost`, and Next treated that as cross-origin and
fell back to full reloads. With that set, and with the authenticated warm-up in `global-setup.ts`,
the journey and accessibility suites run clean; the no-JavaScript suite still trips the compile race
roughly once per chained run and passes on retry.

### Why global setup signs in

Warming pages with an unauthenticated request is nearly useless — they redirect to `/signin` before
rendering, so the components that actually take time never compile, and the first real test paid
about 25 seconds for it. Setup now signs in once through the real UI (sign-in is a server action, so
driving it over plain HTTP would mean reimplementing the RSC action protocol), walks the
authenticated pages, and deletes the warm-up user.

### Why the no-JavaScript suite requests reduced motion

Not cosmetic. Playwright considers an element clickable once its box is unchanged across two
animation frames; a page with scripting disabled stops producing frames once idle. The 180ms
entrance animation ticked a few frames, finished, and the page went quiet with the check still
waiting — a 20-second timeout on a perfectly good button. Reduced motion switches that animation off
at source. It is also the honest setting for the suite: someone browsing without JavaScript is on a
constrained device, where reduced motion is more common, not less. Motion stays covered by the other
two suites.

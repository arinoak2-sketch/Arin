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
npm test                     # 99 unit tests — matching, extraction, dedupe, provenance
npx playwright test          # 8 end-to-end journey tests (needs the dev server)
npm run typecheck
```

The end-to-end suite runs against the **dev** server on purpose: the dev-only
sign-in provider does not exist in a production build, which is the behaviour
being relied on.

Test fixtures live in `e2e/fixtures.ts`, are titled `TEST FIXTURE — …`, and are
never seeded into a real deployment.

## Scheduled work

`sweepExpired()` in `lib/discovery/pipeline.ts` moves listings whose application
deadline has passed to `EXPIRED`, writing an audit entry for each. Run it daily
(a cron job hitting an authenticated route, or the admin button at `/admin`).

## Making yourself an admin

```bash
npx prisma studio     # set your User.role to ADMIN
```

Then `/admin` shows the review queue and data-quality dashboard.

# Running Saathi

Everything an operator needs that is not obvious from the code: how to deploy,
what to do when something breaks, and which failures look alarming but are not.

## Environments

There is one Supabase project and one Vercel project. There is no staging. Test
against a local API pointed at the same database, and be careful with the seed
scripts, because they delete before they insert.

The web app deploys from `main`. The API does not deploy automatically. After
changing anything in `api/` or `server/`, deploy it deliberately, and remember
that the Vercel environment variables are a separate copy of `.env`: changing
one does not change the other. When you set an env value with the Vercel CLI on
Windows, pipe it from Node, not PowerShell — the PowerShell pipeline prepends a
BOM and appends CRLF and every value silently corrupts.

Two env values beyond the Supabase keys matter in production: `DEEPSEEK_MODEL`
(the planner model on the OpenCode Go plan; currently `kimi-k2.5` because
deepseek-v4-flash is region-locked there) and `CRON_SECRET`, which the daily
digest cron authenticates with. Vercel sends it automatically as
`Authorization: Bearer <secret>` when the env var exists.

## Applying a migration

Migrations are plain SQL files at the repo root, applied in filename order. They
are not tracked by a migration tool, so nothing stops you running one twice.
Most are written with `if not exists` guards, but read before you run.

To apply one, paste it into the Supabase SQL editor, or run the script:

```bash
node scripts/apply-migration.mjs supabase-migration-21-vendor-mgmt.sql
```

It takes several files and applies them in the order given, stopping at the
first failure — later files build on earlier ones (migration 20 replaces a
function migration 17 creates), so continuing past a failure would apply a file
against a database that never got its predecessor.

**Where the token lives.** The script reads `$SUPABASE_PAT`, and failing that
`~/.secrets/supabase-saathi.pat` — the file holds the token and nothing else.
Generate it at Supabase dashboard → Account → Access Tokens. It is never passed
as a command argument, because arguments land in shell history and in the
process list. It grants full control of every project on that account, so it
belongs in `.secrets` and never in this repository or a `.env` file.

The raw endpoint, if you would rather curl it: `POST
https://api.supabase.com/v1/projects/$PROJECT_REF/database/query` with
`{"query": "<sql>"}`. Success is 200/201 with an empty array — DDL returns no
rows. Build the JSON body with a tool that escapes properly; PowerShell 5.1's
`ConvertTo-Json` mangles SQL bodies this size, which is why the script is Node.

After a schema change, check that PostgREST can see the new column before
shipping code that filters on it. A filter naming a column PostgREST has not
picked up returns a 500 for the whole endpoint, not a graceful error, and no
client-side fallback will save you.

## Seeding

```bash
node --env-file=.env scripts/seed.mjs
```

Loads the 58 Siliguri services and two community posts.

```bash
node --env-file=.env scripts/seed-demo-accounts.mjs
```

Deletes and recreates `demo.parent`, `demo.guardian` and `demo.admin`, along
with their links, reminders and care team. Running it against production removes
whatever those accounts currently hold, so treat it as destructive.

## When something breaks

**Every request fails with a name-resolution error.** The Supabase project is
probably paused. A paused free project loses DNS entirely, so the hostname stops
resolving and it looks like the project was deleted. Unpause it in the dashboard
and wait a minute.

**An endpoint 500s right after a schema change.** See the PostgREST note above.
Select `*` and filter in JavaScript until the schema cache catches up.

**OTP sign-in returns 503.** The WhatsApp credentials are missing. Username and
password still work. This is expected until the Meta Business account is wired
up.

**The assistant answers but sounds generic.** It fell back to the local keyword
planner, which happens when the model key is missing, the quota is spent, the
model's JSON could not be parsed, or the quota counter could not be read. That
last case is deliberate: an unreadable counter means unmetered spend, so it
fails closed. Since the July 31 wave every fallback logs its reason — check the
function logs before guessing. A `403 RegionError` means the configured model
moved behind a region gate on the OpenCode plan; list what the key can still
reach with `GET /models` and change `DEEPSEEK_MODEL`, in `.env` and in Vercel.

**Push notifications never arrive.** Check in this order: the device must be a
dev build (Expo Go on newer Android cannot mint a push token; web has none);
the user must have a row in `push_tokens` (registration happens after sign-in
and is best-effort); the send must have happened before the response ended
(Vercel freezes the function afterwards). Tokens that Expo reports as
`DeviceNotRegistered` are pruned automatically, so an uninstalled device
disappearing from the table is normal.

**The daily digest did not go out.** The cron runs at 14:30 UTC (20:00 IST) and
answers 401 unless the `Authorization` header carries `CRON_SECRET`. A digest
is also silent by design for any parent with no reminders in the window — no
push is not necessarily a failure. Trigger it by hand with the secret and read
the returned `digests` count.

**A rate limit is not holding.** Limits live in memory per serverless instance,
so they reset on cold start and do not add up across instances. Real
enforcement needs the database-backed version.

**The browser shows old behaviour after an edit.** Metro cached it. Restart the
dev server rather than debugging the ghost.

## Watch the callback queue

The callback queue holds citizen names and phone numbers. Two things to keep
true as it grows:

Requests from signed-in users carry that user's city. Anonymous requests borrow
the city of the service page they came from, and otherwise have none. Rows with
no city are visible to city admins but not to city helpers.

The queue lists 50 rows and has no pagination. Before a real pilot with real
volume, that needs solving, or old requests will fall off the bottom unseen.

## Before deploying

Run the typecheck, then the regression suite against the local dev API:

```bash
npx tsc --noEmit -p tsconfig.json
```

```bash
npm run test:regression
```

The suite (`scripts/regression.mjs`) walks all three roles through 24
assertions: sign-in, assistant answers in both languages, reminder proposals,
reminder CRUD and validation, push registration, SOS, the alert inbox, admin
partial patches, and role separation. It needs the dev API running and the
demo accounts seeded, creates and removes its own rows, and exits non-zero on
any failure.

Then sign in as one demo account and click through the portal you changed —
the suite covers the API surface, not the pixels.

## Rotating credentials

The service role key appears in `.env` and in the Vercel environment. It never
belongs in the app bundle. If it leaks, rotate it in the Supabase dashboard and
update both copies; every `/api/*` route stops working until you do.

Personal access tokens used for migrations should be short-lived. Revoke them
when the work is done.

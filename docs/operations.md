# Running Saathi

Everything an operator needs that is not obvious from the code: how to deploy,
what to do when something breaks, and which failures look alarming but are not.

## Environments

There is one Supabase project and one Vercel project. There is no staging. Test
against a local API pointed at the same database, and be careful with the seed
scripts, because they delete before they insert.

The web app deploys from `main`. The API does not deploy automatically. After
changing anything in `api/`, deploy it deliberately, and remember that the
Vercel environment variables are a separate copy of `.env`: changing one does
not change the other.

## Applying a migration

Migrations are plain SQL files at the repo root, applied in filename order. They
are not tracked by a migration tool, so nothing stops you running one twice.
Most are written with `if not exists` guards, but read before you run.

To apply one, paste it into the Supabase SQL editor, or use the Management API
with a personal access token:

```bash
curl -X POST "https://api.supabase.com/v1/projects/$PROJECT_REF/database/query" -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" -d @payload.json
```

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
planner, which happens when the model key is missing, the quota is spent, or the
quota counter could not be read. That last case is deliberate: an unreadable
counter means unmetered spend, so it fails closed.

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

Run the typecheck and the syntax check. There is no test suite yet, so these are
the whole gate:

```bash
npx tsc --noEmit -p tsconfig.json
```

Then sign in as each of the three demo accounts and walk one journey each: set a
reminder as the guardian, open the services list as the parent, and load the
callback queue as the admin. Most regressions in this codebase show up in one of
those three within a minute.

## Rotating credentials

The service role key appears in `.env` and in the Vercel environment. It never
belongs in the app bundle. If it leaks, rotate it in the Supabase dashboard and
update both copies; every `/api/*` route stops working until you do.

Personal access tokens used for migrations should be short-lived. Revoke them
when the work is done.

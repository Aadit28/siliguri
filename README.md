# Saathi

A local-services and family-care app for elderly people in Siliguri, West Bengal,
built so their children, often living in another city or another country, can
help from wherever they are.

One codebase runs on iOS, Android and the web (Expo, React Native, Expo Router),
backed by Supabase and a small set of serverless API routes.

Hindi is the default language and English is a toggle away. Everything is sized
and worded for someone reading without their glasses on.

## The three portals

The app is one binary with three audiences. Which one you land in depends on who
you sign in as.

**Parent.** The elder in Siliguri. A directory of verified local services
(doctors, hospitals, medical shops, home repair, transport, civic offices), an
assistant that turns "book a doctor for tomorrow" into a named provider and a
call script, a community board, reminders, and a help desk with one-tap dialling.

**Guardian.** The adult child. Links to a parent's account with the parent's
consent, then sets reminders on their behalf, keeps a care team of trusted
numbers, pins services, and sees a quiet activity summary. Times are shown in IST
no matter where the guardian is sitting.

**Admin.** City operations staff. Curates the services directory, publishes
announcements, works the callback queue, and manages city helpers. Everything is
scoped to one city, so staff in one city never see another city's citizen data.

## What runs where

| Piece | Where it lives |
| --- | --- |
| Screens | `app/`, Expo Router file-based routes |
| Shared code | `src/`: components, contexts, `lib/` |
| API | `api/`, 21 routes deployed as Vercel functions |
| Local API for development | `scripts/dev-api.js`, same handlers on port 8788 |
| Database | Supabase Postgres; schema and migrations at the repo root |
| Translations | `src/locales/en.json`, `src/locales/hi.json` |

## Getting started

Node 20.19.4 or newer is required (Expo SDK 56).

```bash
npm install
```

Copy `.env.example` to `.env` and fill in the Supabase values. Then run the API
and the app in two terminals:

```bash
node scripts/dev-api.js
```

```bash
npm run web
```

The app comes up on <http://localhost:8081> and talks to the API on port 8788.
`npm run android` and `npm run ios` work the same way through Expo Go. On
Windows, `./start.ps1` starts the web app using a bundled portable Node.

Without a backend the app still runs. The services directory falls back to a
bundled copy of the Siliguri data, and the demo accounts below sign in offline.

## Database setup

Run the SQL files against your Supabase project in this order. Later files
depend on tables the earlier ones create.

1. `supabase-schema.sql`
2. `supabase-auth-migration.sql`
3. `supabase-migration-2.sql`
4. `supabase-migration-3.sql` (cities, announcements)
5. `supabase-migration-4-phone-auth.sql`
6. `supabase-migration-5-city-helpers.sql`
7. `supabase-migration-6-phone-otp.sql`
8. `supabase-migration-7-family-guardian.sql`
9. `supabase-migration-8-otp-atomic.sql`
10. `supabase-migration-9-fixes.sql`
11. `supabase-home-service-migration.sql`
12. `supabase-pilot-readiness-migration.sql`
13. `supabase-migration-10-callback-city.sql` (city scoping for the callback queue)

Then seed:

```bash
node --env-file=.env scripts/seed.mjs
```

```bash
node --env-file=.env scripts/seed-demo-accounts.mjs
```

The first loads 58 Siliguri services. The second creates a demo family and an
admin account.

## Demo accounts

All three use the password `saathi123`:

| Username | Role |
| --- | --- |
| `demo.parent` | Anjali Sen, the elder |
| `demo.guardian` | Rahul Sen, her son, already linked |
| `demo.admin` | city operations staff for Siliguri |

Sign-in tries the backend first and falls back to an offline session, so these
work with or without a database. The chips that fill them in on the login screen
only appear in development builds, or when `EXPO_PUBLIC_SHOW_DEMO_ACCOUNTS=1`.

## Configuration

`.env` is gitignored and mirrored into the Vercel project settings for deploys.

| Variable | Purpose |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Anon key, safe in the client, guarded by RLS |
| `EXPO_PUBLIC_API_BASE_URL` | Where the app looks for `/api/*` |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only. Never ships in the app bundle |
| `DEEPSEEK_API_KEY` | Assistant planner. Without it the local planner handles everything |
| `OPENAI_API_KEY` | Used for photo attachments, which DeepSeek cannot read |
| `WHATSAPP_*` | Required for OTP sign-in and guardian linking |
| `AI_USER_DAILY_MAX`, `AI_GLOBAL_DAILY_MAX` | Assistant quotas, default 120 and 1200 |

## Deliberate limits

Some things are missing on purpose, and it is worth knowing which.

The app moves no money. Payments are UPI deep links, so the app hands off to the
user's own UPI app and never touches funds.

It dispenses no medicine. The roadmap routes prescriptions to a licensed pharmacy
partner who owns the licence and the Schedule H check. Saathi is not a pharmacy.

The assistant gives no medical advice. Its disclaimer is fixed, reviewed copy,
identical on every response, never text the model wrote.

Elder data is shared only with consent. A guardian's access is recorded and
revocable. Before a real launch the parent should also affirm the link in-app
rather than reading a code out to their child.

## Before a real pilot

- WhatsApp Business credentials. OTP sign-in and guardian linking both return 503
  without them, leaving username and password as the only way in.
- Parent-side consent confirmation, for DPDP Act 2023 comfort.
- Rate limits move from in-memory to the database. Today they reset whenever a
  serverless instance is recycled.
- `favorites` row-level security still expects a Supabase Auth session, which this
  app never creates. Those writes should go through the API instead.

## Security notes

The service role key is server-only and never enters the app bundle. The anon key
is the only Supabase credential the client sees, and row-level security stands
behind it. Family, auth and OTP tables are reachable only through the service
role. Every admin route checks the caller's role on the server, so the
client-side gate is a convenience rather than the defence.

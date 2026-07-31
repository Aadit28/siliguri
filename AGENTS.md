# Saathi

Local-services and family-care app for elderly people in Siliguri, West Bengal,
operated remotely by their adult children. One Expo codebase serves iOS, Android
and web. Product detail is in `README.md`; the deeper map is in `docs/`.

Read these before non-trivial work:

- `docs/architecture.md` for how the pieces fit and which decisions look odd but are deliberate
- `docs/contributing.md` for the rules that keep this app usable by its actual users
- `docs/operations.md` for deploys, migrations and what a given failure means

## Expo has changed

Read the versioned docs at <https://docs.expo.dev/versions/v56.0.0/> before
writing Expo code. Do not rely on memory of older SDKs.

## Stack

Expo SDK 56, React Native 0.85, Expo Router (routes in `app/`, shared code in
`src/`), Supabase Postgres, and serverless handlers in `server/` reached through
the single dispatcher `api/index.js` (Vercel Hobby caps functions at twelve).
Translations live in `src/locales/en.json` and `hi.json`, at parity.

The assistant's LLM is whatever `DEEPSEEK_MODEL` names on the OpenCode Go plan
(currently `kimi-k2.5`; deepseek-v4-flash is region-locked there). Server push
goes through Expo's push API (`server/_lib/push.js`, `push_tokens` table); a
daily digest cron runs at 20:00 IST behind `CRON_SECRET`. Notification taps
deep-link via an internal path in `data.url` — internal paths only.

## Commands

```bash
npm run web
```

```bash
node scripts/dev-api.js
```

```bash
npx tsc --noEmit -p tsconfig.json
```

```bash
npm run test:regression
```

The regression suite (`scripts/regression.mjs`, 24 assertions across all
three roles and the agent surfaces) needs the dev API running against the
seeded database. Run it plus the typecheck before claiming anything works,
and report what you actually observed.

## Three portals, one binary

A **parent** sees the tab bar. A **guardian** is anyone holding an active row in
`family_links`, routed to `/guardian`. An **admin** has `role` of `admin` or
`super_admin` and can open `/admin`. There is no guardian role in the database;
looking for one wastes time.

Demo accounts `demo.parent`, `demo.guardian` and `demo.admin` all use the
password `saathi123`. Sign-in tries the backend first and falls back to an
offline session, so they work with or without a database.

## Rules that are not style preferences

**Never fail quietly.** A swallowed error here can mean a missed dose of
blood-pressure medicine. A `catch` returning a default needs a comment
justifying the silence.

**Never delete local data on an empty fetch.** A failed request and an empty
list look identical. `mergeReminders` takes a `complete` flag for this reason.

**Both languages, every time.** Add keys to `en.json` and `hi.json` together.
A `defaultValue` in code is scaffolding, not a Hindi string.

**`TAP` is 56 and it is a floor.** React Native Web ignores `hitSlop` for hit
testing, so pad the real size. Body text is 16 or larger. Colour pairs pass AA.

**Everything is IST.** Use `todayISO()` from `src/lib/notifications.ts`, never
`new Date()`, or a guardian abroad sees the wrong day.

**Server-side checks are the real checks.** Every admin route re-checks role,
every family route re-checks the link, and citizen data is scoped by `city_id`
on the server. Do not trust `x-forwarded-for[0]` for anything; use `requestIp()`.

**Model output is not policy.** The assistant's disclaimer is fixed reviewed
copy, its actions are filtered against the service ids the client sent, and a
`proposedReminder` from the model is re-validated by `sanitizeProposedReminder`
before the app ever shows it. Nothing the model proposes saves without a
confirming tap.

**The reminder parser exists twice on purpose.** `src/lib/reminderParse.ts` on
the device, a port inside `server/assistant/plan.js` on the server. Change one,
change both.

**Await pushes before the response.** Vercel freezes the function when the
response ends; a fire-and-forget `sendPushToUsers` silently dies.

## Working in this repo

Three sibling checkouts exist on the original machine (`Silliguri/`,
`suluguri/`, `Silliguri New/siliguri/`). This one is canonical. Confirm before
assuming an edit landed where you think it did.

Metro caches aggressively. If the browser shows old behaviour after an edit,
restart the dev server rather than debugging a ghost.

A paused Supabase project loses DNS entirely, so every call fails with a
name-resolution error that looks exactly like deletion. Check the dashboard
before concluding the data is gone.

When several agents work at once, give each one its own dev server from
`.claude/launch.json` rather than hand-typed loopback aliases. Only origins
opened through the preview tooling are approved for browser control.

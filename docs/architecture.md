# How Saathi is put together

This is the map you want before changing anything. It covers where code lives,
how a request travels, and the three or four decisions that will confuse you if
nobody explains them first.

## One app, three audiences

There is a single Expo app. There is no separate guardian build and no separate
admin build. Who you are decides what you see:

- A **parent** signs in and lands on the tab bar: Home, Services, Assistant,
  Community, Help.
- A **guardian** is anyone holding an active row in `family_links`. After sign-in
  the login screen looks up those links and routes to `/guardian`.
- An **admin** is anyone whose `user_accounts.role` is `admin` or `super_admin`.
  They can open `/admin`. Every admin API route re-checks that role on the
  server, so the client gate is convenience only.

There is no "guardian" role in the database. A guardian is defined entirely by
holding a link. This trips people up: if you are looking for `role = 'guardian'`,
it does not exist.

## Directory layout

```
app/                    Expo Router. File path is the URL.
  (tabs)/               Parent-facing tabs
  guardian/             Guardian dashboard and per-parent detail
  admin.tsx             City operations console
  service/[id].tsx      Service detail
  post/[id].tsx         Community thread
  calendar.tsx          Reminder calendar
  login.tsx             Password and OTP sign-in
src/
  components/           AppHeader, sheets, UI kit, notification bell
  context/              Auth, Locale, Theme, DisplayMode
  lib/                  API clients, family sync, notifications, i18n, theme
  locales/              en.json, hi.json
  data/services.json    Offline fallback copy of the directory
api/                    Serverless handlers, one file per route
scripts/
  dev-api.js            Runs the same handlers locally on port 8788
  seed.mjs              Loads the services directory
  seed-demo-accounts.mjs  Demo family and admin
supabase-*.sql          Schema and migrations, applied in order
```

## How a request travels

The client never talks to Supabase directly for anything sensitive. It calls
`/api/*`, and those handlers use the service role key.

```
Screen  ->  src/lib/api.ts or family.ts
        ->  src/lib/backend.ts  (adds the bearer token, 10s timeout)
        ->  /api/<route>
        ->  api/_lib/auth.js    (authenticate, role checks, rate limits)
        ->  Supabase (service role)
```

`backend.ts` decides the API base URL at runtime. On localhost it points at port
8788 so the dev API is picked up without configuration. In production it uses
`EXPO_PUBLIC_API_BASE_URL`.

Sessions are custom, not Supabase Auth. `api/auth/signin` verifies a PBKDF2 hash
and writes a random token into `auth_tokens`; the client stores it in
AsyncStorage. This matters more than it sounds: **`auth.uid()` is always null in
this app**, so any row-level security policy written against `auth.uid()` does
nothing. Tables that need protection are service-role only and reached through
`api/`.

## The offline and demo layer

The app is built to be demonstrable on a laptop with no backend, in a room with
bad wifi, in front of people deciding whether to fund it. That produces a second
code path you need to know about.

`src/lib/demoAuth.ts` holds three accounts. Sign-in tries the real backend first
and falls back to a local session whose token starts with `demo.`. Anything
downstream that sees a `demo.` token uses `src/lib/demoFamily.ts` instead of the
network: links, reminders, care team, favourites, analytics.

Two rules when you touch family code:

1. Every function in `src/lib/family.ts` needs a demo branch. If you add a
   network call and forget one, the demo path 401s and the app looks broken to
   exactly the audience you were demoing to.
2. The demo store keeps one link row. A second demo guardian linking to the demo
   parent displaces the first. That is a limit of the fixture, not a bug.

The server never trusts a `demo.` token. `authenticate()` hashes it, finds no
row, and rejects.

## Reminders, mirroring and time

Reminders exist in two places and this is deliberate.

`family_reminders` in Postgres is the record a guardian writes. The local
calendar store on the device is what drives notifications. `src/lib/familySync.ts`
mirrors server rows into the local store and stamps each mirrored row with a
`serverId`.

That `serverId` is load-bearing. It is how the app distinguishes "this reminder
came from the family server" from "this user typed it in themselves", which is
how sign-out knows what to delete. On a shared family tablet, leaving a ward's
medical reminders behind for the next person would be a privacy failure, so
`clearFamilyForSelf()` removes exactly the rows carrying a `serverId` and cancels
their scheduled notifications.

**Everything is anchored to IST.** The parent lives in Siliguri; the guardian may
be in New Jersey. A reminder set for "tomorrow 8:30" means 8:30 in Siliguri. Use
`todayISO()` from `src/lib/notifications.ts` rather than `new Date()` when you
need today's date, or a guardian abroad will see the wrong day.

Repeats are `once`, `daily`, `weekly`, `monthly`. Monthly rolls forward with
`nextMonthlyISO`, which clamps: a reminder on the 31st falls on the last day of a
short month rather than skipping it.

## The assistant

`api/assistant/plan.js` is the largest file in the repo. It answers in layers:

1. A keyword planner runs first and always. It matches English, Hindi and
   Hinglish terms to a service category and builds a plan from the real service
   rows the client sent.
2. If a model key is configured and the request is inside its quotas, DeepSeek
   (or OpenAI when there is a photo, which DeepSeek cannot read) gets a turn.
3. The model's answer is normalised against the local plan. Intent and status are
   re-derived from the user's own message, and any action pointing at a service
   id the client did not send is dropped.

Step 3 is a security boundary, not tidying. Without it, text inside a service
description could talk the model into showing a "call" button for an arbitrary
number. Keep that property if you refactor.

The disclaimer is never model output. It is fixed reviewed copy per language.
A health-adjacent product for elderly users cannot ship a legal statement that
changes wording on every request.

Quotas fail closed. If the counter cannot be read, the request degrades to the
free local planner rather than spending money unmetered.

## Rate limiting

Limits live in memory inside each serverless instance, so they are burst
protection rather than a durable quota. A cold start resets them. The
DB-backed version is on the list before a real launch.

`requestIp()` deliberately does not trust the first entry of `x-forwarded-for`,
because a client can set that header and mint a fresh bucket per request. It
prefers the platform header and otherwise takes the last entry in the chain.

## Cities

Every service, announcement, callback request and staff account carries a
`city_id`. Non-super-admin staff see only their own city, plus rows with no city.
This is why `supabase-migration-10-callback-city.sql` exists: callback requests
hold a citizen's name and phone, and a helper in one city must not read another
city's queue.

When you add a table that holds citizen data, give it a `city_id` and scope the
queries on the server. Do not rely on the client to filter.

## Things that will bite you

**Three checkouts of this project exist** on the original developer's machine
(`Silliguri/`, `suluguri/`, `Silliguri New/siliguri/`). This one is canonical.
Confirm before assuming an edit landed where you think.

**Metro caches aggressively.** After editing, if the browser shows old
behaviour, restart the dev server rather than debugging a ghost.

**A paused Supabase project loses DNS.** The hostname stops resolving entirely
and every call fails with a name-resolution error, which looks exactly like a
deleted project. Check the dashboard before concluding the data is gone.

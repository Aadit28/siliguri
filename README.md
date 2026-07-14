# 🪔 Saathi

A trusted local-services and community app for elderly parents in small towns
(starting with **Siliguri**), built so their children abroad can help from afar.

Universal app — runs on **iOS, Android, and the Web** from one codebase
(Expo + React Native + Expo Router), with a **Supabase** backend.

## Features (MVP)

- **Services Directory** — doctors, hospitals, medical shops, travel agents and
  daily services. Search, filter by category, one-tap call & directions, verified
  badges, ratings, and save-to-favourites.
- **Saathi Assistant** — a care-coordination tab that turns a request like
  "book a doctor appointment tomorrow" into provider suggestions, a call
  checklist, and family follow-up steps. It uses a local planner by default and
  can use OpenAI from the server when `OPENAI_API_KEY` is configured.
- **Community Connect** — ask questions, reply in threads, like posts, and share
  best practices, organised by category (health, travel, daily life…).
- **Help Desk + callback requests** — quick-dial access plus a callback request
  form. Do not market this as 24/7 unless staffing and escalation SLAs are real.
- **Bilingual** — Hindi (default) and English, toggle in the header. Large fonts
  and big tap targets for older users.

> Money transfer is intentionally **not** built yet (regulated + complex) — the
> app is designed so it can slot in later.

## Getting started

> **Node ≥ 20.19.4 is required** (Expo SDK 56). If your system Node is older, a
> portable Node 20.20.2 is bundled under `.tools/` and used by `start.ps1` — no
> system change or admin rights needed. To use your own Node instead, upgrade to
> 20.19.4+ (or 22 LTS) and run the `npm` scripts directly.

```powershell
# Easiest (uses the bundled portable Node):
./start.ps1            # web  -> http://localhost:8081
./start.ps1 android    # Android via Expo Go
./start.ps1 ios        # iOS via Expo Go
```

```bash
# Or, if your system Node is >= 20.19.4:
npm install
cp .env.example .env   # then fill in your Supabase URL + anon key
npm run web            # or: npm run android / npm run ios
```

The app works immediately on **mock data** even before the backend is set up.

## Backend setup (Supabase)

1. Open your Supabase project → **SQL Editor** → paste & run
   [`supabase-schema.sql`](./supabase-schema.sql). This creates the tables, row
   level security policies, username accounts, and server auth token tables.
2. Put your keys in `.env` (see `.env.example`). The **anon** key is safe in the
   app. The **service_role** key is server-only and used by the seed script plus
   `/api/*` auth/community write routes.
   `OPENAI_API_KEY` is optional and server-only; without it, the Assistant tab
   still works with the built-in local planner.
3. Seed sample Siliguri data:
   ```bash
   node --env-file=.env scripts/seed.mjs
   ```

## Project structure

```
app/                 Expo Router routes (file-based)
  (tabs)/            Home, Services, Community, Help
  service/[id].tsx   Service detail
  post/[id].tsx      Community thread
  new-post.tsx       Compose a question
  login.tsx          Username/password auth
src/
  components/        Shared UI (theme primitives, header)
  context/           Auth + Locale providers
  lib/               supabase client, API bridge, i18n, theme, types
  locales/           en.json, hi.json
  data/              mock fallback data
scripts/seed.mjs     Seed the database (service_role)
api/                 Vercel serverless username auth + community writes
supabase-schema.sql  Database schema + RLS
```

## Security note

`.env` is gitignored. Never ship the `service_role` key in the app — only the
anon key (`EXPO_PUBLIC_SUPABASE_ANON_KEY`) is bundled into the client, and it is
protected by row level security.

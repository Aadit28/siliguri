# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

# Saathi (suluguri)

Trusted local-services + community app for elderly parents in small towns (pilot: Siliguri, West Bengal), operated remotely by their children abroad. Universal app — iOS, Android, Web from one codebase. Product detail: `README.md`.

## Stack

Expo SDK 56 · React Native 0.85 · Expo Router (routes in `app/`, shared code in `src/`) · Supabase backend (schema at repo root: `supabase-schema.sql` + `supabase-*-migration*.sql`) · `api/` = Vercel serverless functions (`vercel.json`).

## Commands

```bash
npm run start      # expo start (also: android / ios / web variants)
./start.ps1        # Windows convenience launcher
```

## Warning — duplicate checkouts

Three sibling copies of this project exist: `Silliguri/`, `suluguri/`, and `Silliguri New/siliguri/` (most recently modified). Confirm with the user which copy is canonical before making edits that should propagate.

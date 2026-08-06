# Deployment Checklist: Booking + Billing + Voice Wave

Go-live steps for the booking core (migration 17–19), Razorpay billing, WhatsApp vendor notifications, and LiveKit voice agent. Ordered by dependency; each section is safe to re-run.

---

## 1. Database: Migrations 17–19

Apply in order via **Supabase Dashboard → SQL Editor**. Each is idempotent (uses `create table if not exists`); safe to re-run without dropping or truncating.

- [ ] **Migration 17** — `supabase-migration-17-booking-core.sql`
  - Vendor slots, holds (5-min TTL), bookings with status pipeline
  - Atomic capacity check; idempotency key enforcement
  - Safe re-run: unique `(vendor_id, starts_at)` constraint skips duplicate slots

- [ ] **Migration 18** — `supabase-migration-18-audit-consent.sql`  
  - Append-only audit log (`audit_log`), consent ledger (`consents`)
  - Durable rate limiter (`check_rate_limit` function)
  - Safe re-run: both tables are append-only with `if not exists`

- [ ] **Migration 19** — `supabase-migration-19-subscriptions.sql`
  - Razorpay subscriptions table; entitlement lookup
  - Plan tiers: `care`, `care_plus`, `care_total`
  - Safe re-run: subscription id is unique; webhook reconciles

- [ ] **Seed vendor slots** (one per city, at launch)
  ```bash
  node scripts/seed-vendor-slots.js --project prod --city siliguri
  ```
  Idempotent: upserts by `(vendor_id, starts_at)` — existing slots left untouched.

---

## 2. Vercel Environment Variables

Set on **Vercel → Project Settings → Environment Variables**. Group by feature below; one-line descriptions, no values. Recommended: pull from a shared `.env.production` checklist, never paste secrets into the UI.

### Booking & Guardian Approval

- `BOOKING_APPROVAL_THRESHOLD_PAISE` — Amount (paise) above which bookings require guardian approval (default: 50000 = ₹500)
- `BOOKING_WEBHOOK_SECRET` — Signing key for vendor callback webhooks from WhatsApp/Exotel

### Razorpay Subscriptions (6 vars)

- `RAZORPAY_API_KEY` — Public key for Razorpay subscription checkout URLs
- `RAZORPAY_KEY_SECRET` — Secret for Basic auth to Razorpay API calls
- `RAZORPAY_WEBHOOK_SECRET` — Signature verification for subscription status webhooks
- `RAZORPAY_PLAN_CARE` — Razorpay plan ID for `care` tier
- `RAZORPAY_PLAN_CARE_PLUS` — Razorpay plan ID for `care_plus` tier  
- `RAZORPAY_PLAN_CARE_TOTAL` — Razorpay plan ID for `care_total` tier

### WhatsApp Vendor Notifications

- `WHATSAPP_ACCESS_TOKEN` — Meta Business Account token (scope: `whatsapp_business_messaging`)
- `WHATSAPP_PHONE_NUMBER_ID` — Phone number ID from Gupshup BSP integration
- `WHATSAPP_GRAPH_VERSION` — Meta Graph API version (default: `v23.0`)
- `WHATSAPP_BOOKING_TEMPLATE` — Template name awaiting vendor confirmation (default: `booking_vendor_confirm`)

### LiveKit & Sarvam (Voice Agent)

- `LIVEKIT_URL` — WebSocket URL to LiveKit Cloud (Mumbai region) — e.g. `wss://livekit.saathi.app`
- `LIVEKIT_API_KEY` — LiveKit API key for worker registration
- `LIVEKIT_API_SECRET` — LiveKit API secret
- `SARVAM_API_KEY` — API key for Saaras STT and Bulbul TTS
- `SAARAS_MODEL` — STT model identifier (default: `saaras:v3`)
- `BULBUL_MODEL` — TTS model identifier (default: `bulbul:v3`)
- `BULBUL_VOICE` — TTS speaker name (default: `anushka`)
- `SARVAM_TTS_SAMPLE_RATE` — Output sample rate: `22050` for app channel, `8000` for phone (default: `22050`)
- `SARVAM_TTS_PACE` — Speech rate multiplier (default: `0.9`)

### Voice Agent API Access

- `SAATHI_API_BASE_URL` — Base URL of Part C booking API (e.g. `https://saathi.vercel.app/api`)
- `SAATHI_API_TOKEN` — Service token for voice agent to call booking endpoints
- `SAATHI_ELDER_ID` — Demo elder account ID for testing (staging only)
- `SAATHI_LLM_BASE_URL` — OpenAI-compatible endpoint for tool-calling model (default: OpenAI)
- `SAATHI_LLM_API_KEY` — API key for LLM endpoint
- `SAATHI_LLM_MODEL` — Model ID (default: `gpt-4o-mini`, benchmark vs `sarvam-m`)
- `SAATHI_LOG_LEVEL` — Python logging level (default: `INFO`)

### Existing (Verify Present)

- `DEEPSEEK_MODEL` — Planner LLM (currently `kimi-k2.5`; synced with `.env`)
- `CRON_SECRET` — Bearer token for Vercel cron endpoints (required for `*/5` scheduling)

---

## 3. External Setup

### Razorpay

- [ ] Create subscription plans on Razorpay dashboard matching plan IDs in `RAZORPAY_PLAN_*` vars
  - Monthly cycles, amounts: ₹499 (`care`), ₹1,499 (`care_plus`), ₹3,999 (`care_total`)
  - Record plan IDs in Vercel env vars

- [ ] Register webhook endpoint
  - URL: `https://<api-domain>/api/billing/webhook`
  - Event: `subscription.activated`, `subscription.paused`, `subscription.cancelled`
  - Copy `X-Razorpay-Signature` header secret → `RAZORPAY_WEBHOOK_SECRET`

### Meta Business Account & WhatsApp

- [ ] Request template approval for `booking_vendor_confirm`
  - Template parameters: `{1}` vendor name, `{2}` date/time, `{3}` amount
  - Quick-reply buttons: "Accept" (payload: `accept`) and "Reject" (payload: `reject`)
  - Status: must be **Approved** before vendor messages send

- [ ] Register webhook for vendor callbacks
  - URL: `https://<api-domain>/api/bookings/vendor-callback`
  - Verify token: generate a random string, set in Gupshup webhook settings
  - Copy to `BOOKING_WEBHOOK_SECRET` env var

### Vercel Project Settings

- [ ] Upgrade to **Vercel Pro** (required for `*/5` cron interval)
  - Hobby plan: daily cron only
  - Pro plan: `cron` field and `schedule` support minute granularity
  - Crons already configured in `vercel.json`:
    - `/api/cron/daily-digest` — `30 14 * * *` (20:00 IST)
    - `/api/cron/booking-sweep` — `*/5 * * * *` (every 5 min; **requires Pro**)

---

## 4. Verification

Run these before marking live:

- [ ] **Typecheck**
  ```bash
  npx tsc --noEmit -p tsconfig.json
  ```

- [ ] **Smoke test: booking flow**
  ```bash
  node scripts/regression.mjs
  ```
  Walks all roles through 24 assertions (sign-in, reminders, bookings, audit log). Needs dev API running + demo accounts seeded.

- [ ] **Voice agent tests** (if voice-agent deployed)
  ```bash
  .venv/Scripts/python -m pytest tests/ -q
  ```
  Text-mode tool loop: idempotency, hold-confirm ordering, distress handoff.

- [ ] **Voice agent REPL** (optional, live LLM)
  ```bash
  .venv/Scripts/python repl.py --persona happy_path_bengali
  ```
  Offline replay against `MockBookingClient`; no API key needed.

- [ ] **Cron smoke** (post-deploy)
  - Trigger `/api/cron/daily-digest?secret=<CRON_SECRET>` manually; confirm digest count > 0
  - Confirm `/api/cron/booking-sweep` runs every 5 min (Vercel function logs)

---

## 5. Rollback Notes

**Migrations are additive and safe to leave in place.** Rollback only if critical bugs found:

- **Booking endpoints** (`/api/bookings/*`) are dark until mobile/web UI ships — safe to deploy API first
- **Vendor notifications** are silent if `WHATSAPP_ACCESS_TOKEN` is missing — graceful degradation
- **Voice agent** runs in text mode if `LIVEKIT_URL` is unset — mock client mode
- **If subscription webhook fails:** booking endpoints still work (billing decoupled). Re-register webhook and replay recent events.
- **If rate limiter fails (DB outage):** in-memory fallback (migration 12) allows fallback, but lose cross-instance enforcement.

Reverting a single migration: requires manual SQL (`DROP TABLE` + `DROP FUNCTION`) — document the rollback SQL before deployment.

---

## Summary

| Task | Blocker | Owner |
|------|---------|-------|
| Migrations 17–19 | Yes | Backend |
| Env vars (22) | Yes | DevOps |
| Razorpay plans + webhook | Yes | Finance/DevOps |
| WhatsApp template approval | Yes | Product/Legal |
| Vercel Pro | Yes | DevOps |
| Typecheck + regressions | Yes | Backend |
| Voice agent pytest | No | Backend (staging) |
| Cron smoke test | No | DevOps (post-deploy) |

Deploy order: DB → Env → External webhooks → Typecheck → API deploy → Smoke → Go live.

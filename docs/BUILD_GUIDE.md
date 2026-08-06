# Saathi Full Build Guide

*Version 1.0 — 2026-08-05. Companion to [PLATFORM_MASTER_PLAN.md](./PLATFORM_MASTER_PLAN.md). This is the engineering execution document: monorepo migration, schema, per-phase feature builds, and the complete AI voice agent (end-to-end booking with tool calling). Grounded in the current codebase — Expo app at root, `server/` Vercel functions, `plan.js` assistant, 18 root-level SQL migrations.*

---

## Part A — Monorepo Migration (week 1)

Current layout is flat. Target Turborepo layout with a migration path that never breaks the deployed Vercel API or Expo builds.

### A.1 Target layout

```
saathi/
  turbo.json
  package.json                 (workspaces root, private)
  apps/
    mobile/                    (Expo app: app/, src/, assets/, app.json, babel.config.js)
    web/                       (landing/ + future guardian dashboard, Next.js)
    api/                       (server/ + api/index.js + vercel.json)
    voice-agent/               (Python LiveKit agent — Part D; deployed separately, NOT Vercel)
  packages/
    types/                     (Zod schemas + supabase gen types)
    api-client/                (typed fetch wrappers, shared mobile/web)
    domain-care/               (reminder parse, plan normalization — the code currently
                                duplicated between src/lib/reminderParse.ts and server plan.js)
    config/                    (tsconfig base, eslint)
  supabase/
    migrations/                (all 18 root SQL files, renamed + ordered)
    seed/
  docs/
```

### A.2 Migration steps (ordered, each step keeps prod green)

1. `git mv` SQL files into `supabase/migrations/` with `NNN_name.sql` ordering matching the historical apply order (schema → 2 → 3 → … → 16-share-code → auth/home-service/pilot/callback ones slotted by date). Pure move, no deploy impact.
2. Create root `package.json` workspaces + `turbo.json`; move Expo app into `apps/mobile` (app.json `root` untouched inside its own dir; EAS builds point at `apps/mobile`).
3. Move `server/` + `api/index.js` + `vercel.json` into `apps/api`; update Vercel project root directory setting to `apps/api`. Deploy from branch, verify, then merge.
4. Move `landing/` into `apps/web`; update the `saathi-landing` Vercel project root to `apps/web` (project already linked — settings change only).
5. Extract `packages/domain-care`: the reminder-parse logic exists twice (`src/lib/reminderParse.ts` client + port in `server/assistant/plan.js` with a "keep in sync" comment). One package, two consumers — drift bug class eliminated.
6. `packages/types`: `supabase gen types typescript` output + Zod schemas for every API payload. CI job regenerates on migration change.

**Vercel note (from ops memory):** web auto-deploys; API deploys are manual `--prebuilt`. Keep that split until CI is set up; then GitHub Actions per-app filters (`turbo run build --filter=api`).

### A.3 CI baseline (week 1-2)

- GitHub Actions: `tsc --noEmit` + lint per workspace, affected-only via turbo cache
- Migration lint: any PR touching `supabase/migrations` requires sequential numbering (guards against the concurrent-session renumbering incident)
- EAS build on `apps/mobile` tag push; Vercel preview per PR for web + api

---

## Part B — Phase 0 Build: Paid Launch Hardening

### B.1 Rate limiting (replaces in-memory blocker)

In-memory counters die on serverless — every cold start resets. Move to Postgres (already have `rate_events`, migration 12) or Upstash Redis:

Implemented in `supabase-migration-18-audit-consent.sql` as `check_rate_limit(p_key, p_max, p_window)`. Two corrections to the original draft here: the column on `rate_events` is `bucket` (migration 12), not `key`; and a single-statement CTE version is racy — a statement's snapshot is fixed before it can take a lock, so two callers at max-1 both pass. The shipped function takes `pg_advisory_xact_lock(hashtext(key))` first, then counts and inserts, and returns `false` (not null) when limited.

### B.2 Payments + plan ladder

- Razorpay Subscriptions (UPI autopay + cards) for domestic ₹499/1,499/3,999 tiers; webhook → `subscriptions` table → RLS gates premium features by `family_id`
- Entitlement check lives in one place: `packages/domain-care/entitlements.ts` consumed by mobile + api
- Never store payment instrument data; webhook signature verification mandatory

### B.3 DPDP consent pack

- `consents` table: `user_id, purpose, granted_at, withdrawn_at, version` — append-only like audit log
- Consent UI at onboarding: itemized purposes (care coordination, health reminders, guardian sharing, marketing — separately toggleable)
- Erasure endpoint: soft-delete + 30-day purge cron (already have cron infra from digest)

### B.4 Audit log (before any booking/voice feature)

```sql
create table audit_log (
  id bigint generated always as identity primary key,
  actor text not null,            -- user id string or 'agent:voice'
  action text not null,           -- tool name / endpoint
  args jsonb not null,
  result jsonb,
  idempotency_key uuid,
  family_id uuid,
  created_at timestamptz default now()
);
revoke update, delete on audit_log from authenticated, anon, service_role;
```

Writes via `security definer` function only. Guardian portal reads it as "what happened" timeline. This table is also the voice agent's flight recorder (Part D).

---

## Part C — Booking Infrastructure (prerequisite for voice agent)

The voice agent is only as good as the booking primitives underneath. Build these as plain API endpoints first — app UI uses them, voice agent reuses them identically.

### C.1 Schema

```sql
create table vendor_slots (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid references services(id) not null,
  starts_at timestamptz not null,
  duration_min int not null default 15,
  capacity int not null default 1,
  booked int not null default 0,
  city_id uuid not null references cities(id)
);

create table bookings (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  elder_id uuid not null,
  vendor_id uuid not null,
  slot_id uuid references vendor_slots(id),
  status text not null check (status in
    ('held','pending_guardian','pending_vendor','confirmed','completed',
     'cancelled_user','cancelled_vendor_timeout','expired')),
  hold_expires_at timestamptz,
  amount_paise int,
  idempotency_key uuid unique not null,
  created_by text not null,          -- 'app' | 'voice_agent'
  city_id uuid not null references cities(id),
  created_at timestamptz default now()
);
```

### C.2 Two-phase booking core (the load-bearing pattern)

Single-shot `book()` = no readback checkpoint, retries double-book. Three operations:

1. **`search_slots(vendor_id, date_range)`** — read-only, returns real slot ids only
2. **`hold_slot(slot_id, idempotency_key)`** — atomic capacity check + hold, TTL 5 min (elders need time to say yes, maybe ask guardian). Cron sweeps expired holds back to capacity.
3. **`confirm_booking(hold_id, idempotency_key)`** — the only irreversible call. Same idempotency key returns the same result on retry, never a second booking.

```sql
-- hold: atomic, no race between check and increment
update vendor_slots set booked = booked + 1
where id = $1 and booked < capacity
returning id;
```

Zero rows = slot gone; caller re-searches. Idempotency: unique index on `bookings.idempotency_key`; insert conflict = return existing row.

### C.2a Pricing (what `amount_paise` is filled from)

A booking's price is resolved once, at hold time, and written onto the booking row: **slot override (`vendor_slots.price_paise`) > vendor base rate (`services.base_price_paise`) > null** (migration 20). Null is a supported outcome, not a gap — a plumber cannot quote a job they have not seen — and it is exactly what sends the booking to a guardian in C.3 below, with the app telling the elder the shop will quote. Stamping at hold rather than reading live at confirm or at display is deliberate: whatever fee the readback spoke is the fee the elder agreed to, even if the vendor edits their rate a minute later. Zero is a real price (a free clinic slot) and confirms straight through; only null asks a person.

### C.3 Guardian approval fork

`confirm_booking` checks family policy: `amount_paise > family.approval_threshold` OR first-time vendor → status `pending_guardian`, push to guardian (push infra exists, migration 11), booking finalizes on guardian ack. Configurable timeout fallback per family risk setting.

### C.4 Vendor confirmation loop (tier-2 reality: vendors have WhatsApp, not APIs)

- Confirmed booking → WhatsApp template to vendor (Gupshup BSP) with Accept/Reject buttons
- Webhook on button press → status `confirmed` / re-offer flow
- No response in 15 min (same-day) → auto-cancel `cancelled_vendor_timeout`, release hold, notify elder (voice/push) AND guardian — never fail silently
- Fallback for non-WhatsApp vendors: existing callback-request infra (migration 10) — IVR readout, vendor presses 1/2

---

## Part D — AI Voice Agent: End-to-End Booking with Tool Calling

### D.1 Architecture decision

**Cascaded pipeline (STT → LLM → TTS), not speech-to-speech.** Reasons:
- Tool-call arguments must be validated against DB before anything is spoken or executed — cascaded gives a text checkpoint between understanding and action; S2S (GPT-4o Realtime, Gemini Live) hides it
- S2S function calling on code-switched Bengali/Hinglish input is unproven in any published source — do not bet the elder UX on it
- Cascaded 2026 median 800–1500ms; achievable p50 ~800–1000ms with streaming tricks (D.5). Revisit S2S only after cascaded p95 < 1.5s holds in production

**Stack:**

| Layer | Pick | Why |
|---|---|---|
| Transport + orchestration | **LiveKit Agents** (Python, `apps/voice-agent`) | Barge-in/VAD/endpointing at RTC layer; WebRTC for app channel now; native SIP = phone channel later without re-architecture. Pipecat is the fallback if LiveKit hosting cost bites |
| STT | **Sarvam Saaras v3** | 22 Indic langs, native code-mixing (Benglish/Hinglish mid-sentence), streaming <250ms, ₹1.5/min. Self-host fallback: AI4Bharat IndicConformer 600m |
| LLM | **GPT-4o-mini or Sarvam-M** for tool calls | Reliable JSON function calling on mixed Indic input; existing kimi/deepseek plan endpoint stays for non-voice chat. Benchmark both on code-switched booking transcripts before locking |
| TTS | **Sarvam Bulbul V3** | Won 20k-vote blind study vs ElevenLabs v3-alpha + Cartesia on 11 Indic langs, in BOTH 48kHz and telephony 8kHz — phone-channel ready. Streaming <250ms, ₹30/10k chars |
| Telephony (v2) | **Exotel** | ₹0.30–0.50/min inbound, native TRAI/DND/DLT compliance, AgentStream WS. Twilio has no Indian DIDs + 1 call/sec cap — unusable here |

Deployment: `apps/voice-agent` is a long-running Python worker (Fly.io / Railway / small EC2 in ap-south-1 — NOT Vercel, needs persistent WebSocket). LiveKit Cloud (Mumbai region) or self-hosted LiveKit on the same box at pilot scale.

### D.2 Tool surface (narrow, typed — never generic)

The agent gets exactly these tools. No `call_api`, no free-text queries. Every mutating tool carries `idempotency_key`. All tools are thin wrappers over Part C endpoints — the voice agent has zero booking logic of its own.

```python
@function_tool
async def search_vendors(category: Literal["doctor","medical_shop","grocery",
                         "home_service","travel_agent"], query: str | None) -> list[Vendor]:
    """Verified vendors in the elder's city. Returns real ids only."""

@function_tool
async def search_slots(vendor_id: str, date_range: str) -> list[Slot]: ...

@function_tool
async def hold_slot(slot_id: str, idempotency_key: str) -> Hold:
    """Reserve for 5 minutes without committing. Auto-expires."""

@function_tool
async def confirm_booking(hold_id: str, idempotency_key: str) -> Booking:
    """IRREVERSIBLE. Only call after user verbally confirmed the readback."""

@function_tool
async def cancel_booking(booking_id: str) -> None: ...

@function_tool
async def create_reminder(what: str, time_local: str,
                          repeat: Literal["once","daily","weekly"]) -> Reminder:
    """Validated by the same domain-care parser the app uses."""

@function_tool
async def call_family_member(member_id: str) -> None:
    """Only members from the elder's family circle — server injects the list,
    the model never supplies arbitrary numbers."""

@function_tool
async def handoff_to_human(reason: str) -> None: ...
```

Server-side enforcement (the model cannot argue past these):
- **Role allowlist**: elder session token scopes exactly this tool set; guardian voice sessions get a different set
- **Spend cap**: `confirm_booking` rejects `amount > family.cap` in the endpoint, not the prompt
- **Arg validation**: every id checked against DB before execution — vendor exists in elder's city, slot still held, member in family circle. LLM-fabricated id → tool returns a typed error, agent re-prompts. This extends the existing `plan.js` discipline (server already refuses model-invented service ids — same DNA, new layer)
- **Every call logged** to `audit_log` with args + result — the guardian-visible flight recorder

### D.3 Conversation state machine

```
IDLE → INTENT → DISAMBIGUATE → SLOT_FILL → READBACK_CONFIRM
                     ↑______correction loop______|
READBACK_CONFIRM --yes--> EXECUTE(hold→[guardian?]→confirm) → VERBAL_RECEIPT → IDLE
READBACK_CONFIRM --no---> SLOT_FILL (patch only the corrected field)
any state --silence>10s x2--> polite close, holds expire via TTL
any state --3 failed fills | distress words--> handoff_to_human
```

Implementation notes:
- **Corrections are patches, not restarts.** "না, মঙ্গলবার নয়, বৃহস্পতিবার" (no, not Tuesday — Thursday) diffs `pending_slots{date}` only; re-confirm only the changed field. Forcing full re-confirmation is how you exhaust an 75-year-old
- **Readback is mandatory and interruption-proof**: barge-in disabled during the readback utterance only (a stray "haan haan" mid-sentence must not cut off the price being read). Explicit yes required — "haan", "ঠিক আছে", "theek hai", "confirm". Silence ≠ consent
- **Readback template** (pre-synthesized audio for the frame, TTS only the variables — latency trick): *"আমি বুক করছি: ডাঃ শর্মা, বৃহস্পতিবার বিকেল ৪টা, ফি ৩০০ টাকা। ঠিক আছে?"*
- **Distress triggers**: "dard", "ব্যথা", "emergency", "সাহায্য", chest-pain vocabulary (reuse `URGENT_WORDS` from `plan.js`) → immediate handoff + guardian alert, never continue booking

### D.4 Elder-specific tuning (this is where generic voice agents die)

| Failure mode | Mitigation |
|---|---|
| System cuts elder off mid-thought (recalling a name) | VAD endpointing 600–900ms silence threshold vs the standard ~300ms. LiveKit: `min_endpointing_delay=0.7` |
| Background TV / cross-talk false-triggers | Tune VAD on real production audio, not lab clips; confidence drift up to 20pp under noise. Collect pilot recordings (with consent) as the tuning set |
| Hearing-impaired repeat pattern ("hello? hello?") | Dedupe consecutive near-identical utterances into one turn, don't answer each |
| STT ambiguity on numbers/dates | Readback confirm ALWAYS; phone channel adds DTMF fallback ("press 1 to confirm") |
| Long silence mid-call | One gentle re-prompt at 8–10s ("আপনি আছেন?"), close on second silence, holds self-expire |

### D.5 Latency budget (Mumbai, cascaded, target p50 ≤ 1s)

| Stage | Budget | Technique |
|---|---|---|
| Audio ingress (WebRTC) | 50–100ms | LiveKit region = Mumbai |
| STT | 80–250ms | Saaras streaming partials — feed LLM before endpoint fires |
| LLM first token | 150–600ms | Small prompt (tools + state only, no history dump); stream |
| TTS first chunk | 60–250ms | Bulbul WebSocket streaming; sentence-chunked — speak clause 1 while clause 2 generates |
| Egress | 20–60ms | — |
| **Floor / realistic p50** | **~450ms / 800–1000ms** | |

Extra tricks: pre-warm TTS connection per session; pre-synthesized audio cache for fixed frames (greetings, confirmation skeletons, error apologies); speculative "hmm" filler audio if LLM first token exceeds 700ms (measurably reduces perceived latency and elder re-prompting).

### D.6 Cost model (pilot scale, ballpark)

Per 3-min booking call: STT ₹4.5 (₹1.5/min) + LLM ~₹0.5–1 (4o-mini, small prompts) + TTS ~₹1–2 (~400 chars spoken) ≈ **₹6–8/call app-channel**. Phone channel adds Exotel ₹1–1.5/min ≈ ₹10–13/call total. At ₹499+/mo subscription, dozens of calls per family per month stay margin-positive. Self-host IndicConformer + open TTS later only if volume makes ₹-per-call the binding constraint.

### D.7 Build sequence (voice agent, ~4 weeks after Part C exists)

1. **Week 1 — text-mode agent**: tool loop + state machine as a pure-text chat against staging booking API. No audio. Get tool-call traces right first (cheapest place to debug)
2. **Week 2 — audio loop**: LiveKit room + Saaras + Bulbul wired; app joins room from elder home screen mic button (replaces expo-speech path for this flow); barge-in verified; VAD tuned to 700ms
3. **Week 3 — safety rails**: guardian approval fork, spend caps, audit-log wiring, distress handoff, readback interruption-lock
4. **Week 4 — eval + pilot**: eval suite (D.8) green, then 10 pilot families in Siliguri, all calls recorded (consented) for VAD/STT tuning set

### D.8 Evaluation (pre-launch gate, not optional)

- **Scripted persona suites**: 30+ scripts in Bengali/Hindi/Benglish covering happy path, mid-call correction, silence, wrong-vendor disambiguation, distress trigger, vendor timeout — run against mocked vendor APIs in staging
- **Tool-trace assertions**: `confirm_booking` never fires without a prior `hold_slot` in the same session; idempotency keys reused on retries; zero orphaned holds after suite run
- **Production metrics** (dashboard from day 1): task completion rate (booked without human), intervention rate, **false-confirm rate** (agent said booked, vendor never got it — the trust-killer metric, alert on any occurrence), holds-expired-unused (slot-fill friction signal)
- **Launch gate**: ≥85% task completion on script suite, zero false-confirms in 100 staged runs

### D.9 Phone channel (v2, month +3)

Non-smartphone elders call a local Siliguri number → Exotel SIP trunk → same LiveKit agent (SIP is native — zero agent-code change). Adds: DTMF confirm fallback, 8kHz audio (Bulbul already telephony-rated), DND-scrub before any outbound reminder call, TRAI compliance via Exotel's stack.

---

## Part E — What NOT to build

- No speech-to-speech model until cascaded metrics prove out (D.1)
- No self-hosted STT/TTS at pilot (ops burden > API cost until real volume)
- No generic agent tools (`run_query`, `call_api`) — ever; injection blast radius
- No voice-initiated payments beyond capped, guardian-gated bookings in v1
- No custom telephony stack — Exotel owns TRAI complexity
- No LLM-side enforcement of caps/permissions — server-side only, prompts are suggestions not security

## Sources

Research agent citations preserved in this repo's plan history; key ones: Sarvam pricing/api docs, LiveKit Agents docs, Pipecat-vs-LiveKit comparisons (forasoft, soniox wiki), Bulbul V3 blind-study coverage, Exotel/telephony India comparisons (caller.digital), VAD/elderly production failure writeups (altersquare, getbluejay), voice latency budgets (thepromptbench, destilabs, coval).

# Saathi Platform Master Plan

*Version 1.0 — 2026-08-05. Synthesized from five parallel research tracks: market landscape, expansion fields, architecture patterns, monetization/unit economics, and India regulatory compliance. Sources cited inline in the research appendix references; figures are 2025–2026 current.*

---

## 1. Thesis

Saathi starts as an elder-care coordination app in Siliguri (guardian remote monitoring, medicine reminders, voice-first vernacular elder UX, verified local-services directory) and grows into India's **"NRI guardian command center"** — the single app through which a family abroad or in a metro runs their parents' entire life at home: care, money, health, insurance, and local services.

**Why this wedge wins (validated by research):**

- India geriatric-care services market: **$50.16B (2026) → $97.3B (2033)**, CAGR ~10%. Senior living alone: $4.47B (2026) → $14.14B (2031), CAGR 25.9%.
- **Fewer than 1% of India's elderly have any organized care.** 60+ cohort grows 153M (2020) → 347M (2050).
- Every funded competitor (Emoha, Yodda, KITES, Antara, Khyaal) is **metro-locked and English-first**. Only Samarth reaches tier-2/3 (350+ cities) — with thin tech and no vernacular UX.
- **Nobody owns the NRI guardian.** Existing NRI tooling is bolt-on WhatsApp summaries (Anvayaa, Samarth Care App). No player integrates care + local services + payments + fraud protection in one vernacular-first app with a native remote-guardian dashboard.
- NRI capacity is proven: India inward remittances hit **$135.46B FY25** (RBI), with high-income US/OECD diaspora now the largest per-sender source.

**The honest constraint:** no India eldercare/consumer-health comp clears $30M ARR after 6–8 years on domestic subscriptions (Practo ~$27M, Portea ~$18M, Emoha ~$8.5M FY25 — Emoha still losing ₹36.7 Cr on ₹74.35 Cr revenue). Pure care-subscription economics do not reach $100M ARR. The billion-dollar path is a **blended platform**: care subscription as trust wedge → high-margin financial layers (NRI payments, insurance distribution, B2B contracts) stacked on top. Human-ops-heavy models die (Elcare shutdown); Saathi stays coordination-software-first, fulfillment-partnered.

---

## 2. Fields of Business (phased)

### Phase 0 — Core Care OS (now → month 6, Siliguri)
The current app, hardened to paid launch.
- Guardian remote care: reminders, alerts, activity feed, family circles, digest
- Elder voice-first vernacular UX (Bengali/Hindi/Nepali)
- Verified local directory: doctors (NMC-verified listings — **no license needed for directory-only**), pharmacies, groceries, home services
- Revenue: freemium → family subscription (good/better/best ladder, see §4)

### Phase 1 — NRI Financial Layer (month 4–12) ← highest-leverage expansion
Ranked #1 of 8 fields researched: zero CAC (the NRI already pays Saathi), high margin, **no direct competitor found**, ships as features not a business unit.
- USD-priced NRI guardian tier (premium plan billed in USD)
- Bill-pay for parents: electricity, gas, phone, society dues via BBPS rails
- **Elder fraud guard**: digital-arrest/scam cases tripled 2022→2024 (39,925 → 123,672); alert guardian on anomalous transactions, scam-pattern education in elder UX
- Compliance path: inbound NRI money = standard banking channel, **FEMA purpose code P1301** (family maintenance) — low documentation. Vendor payouts via licensed PA (Cashfree/Razorpay); never seek own PA license at this stage (₹15–25 Cr net-worth requirement).

### Phase 2 — Insurance Distribution (month 9–18)
Ranked #2: near-zero capex, pure-commission margin, natural trust moments (post-diagnosis, renewal).
- Start as **PoSP under an existing corporate agent/broker** — no capital, 15-hour certification, pre-approved senior products (Niva Bupa Senior First, Star Health, ICICI Golden Shield, HDFC ERGO)
- Commission ceiling ~20% of gross premium (IRDAI cap direction)
- Endgame is **embedded, not agency**: Papa (US) precedent — insurer funds care coordination as retention/claims-reduction lever. Pitch Saathi as the insurer's retention tool; revenue = distribution fee + reduced-claims share. No India eldercare-app/insurer embedded tie-up exists yet — open whitespace.
- Upgrade to Corporate Agent registration (₹50L capital) only after vertical proves traction.

### Phase 3 — Home Healthcare Services (month 12–24)
Ranked #3: largest adjacent TAM (India home healthcare → ~$74B by 2034), heaviest ops lift — funded by Phases 1–2.
- Attendants, nursing, physio — **marketplace/coordination model, not employed staff** (Portea does ₹160 Cr revenue and still loses money on owned fulfillment)
- Verification stack: police verification + state Nursing Council registration checks (industry practice; no central attendant-license law)
- Equipment rental annuity (beds, oxygen, wheelchairs) — Portea's best-margin line
- Get state-specific Clinical Establishments Act legal opinion before scaling beyond West Bengal.

### Phase 4 — B2B Corporate Elder-Care Benefits (month 18–30)
Ranked #4: same product, sold to HR instead of NRI. 20% of Indian workforce is sandwich-caring; PayPal India already runs an in-house "ElderCare" benefit — external vendor gap is open (EldersIndia is the only positioned player).
- Per-employee annual subscription paid by employer; contract ACV, near-zero per-seat CAC
- Second B2B channel: insurer partnerships from Phase 2 embedded play

### Deprioritized (revisit at scale)
| Field | Why not now |
|---|---|
| Telehealth/diagnostics fulfillment | Crowded (Practo, 1mg, Redcliffe, Orange Health), thin lab-logistics margins. Do referral take-rate only (Practo charges 15–25% on consults, 20–35% on lab referrals). |
| Devices/IoT (fall detection, wearables) | Hardware margin trap; margin lives in the subscription layer. Revisit when monitoring base is large enough to justify BOM investment. |
| Senior living real estate | Capital-intensive, off-thesis (Saathi = age-in-place). Referral partnerships only (KITES, Antara are Tier-1-anchored anyway). |
| Hyperlocal services marketplace (full Urban Company clone) | Execution-heavy vendor-supply build per city. Keep directory + lead-gen; UC itself admits tier-2/3 gap but that's their war, not ours. |
| E-pharmacy | No e-pharmacy law yet (2018 draft pending); dispensing needs drug license + registered pharmacist. Directory shows medicines/prescriptions, never sells. |

---

## 3. Revenue Model

| Stream | Mechanics | Margin | Phase |
|---|---|---|---|
| Family care subscription (India) | Good/better/best: ~₹499 / ₹1,499 / ₹3,999 per month (undercut Emoha's ₹2,999–15,999 ladder; Samarth floor is ₹200) | Medium (coordination opex) | 0 |
| NRI guardian tier (USD) | $40–80/month — 3–5× domestic-equivalent; **unvalidated whitespace, no public comp exists — test, don't assume** | High | 1 |
| Bill-pay + payments float/fees | BBPS + PA rails, per-transaction fee | High | 1 |
| Directory lead-gen + featured listings | Practo benchmark: ₹2,000–10,000/month per doctor listing; 15–35% referral take-rates | Very high | 0–1 |
| Insurance commissions | ≤20% of gross premium (PoSP); later embedded distribution fees | Very high | 2 |
| Home-care marketplace take-rate + equipment rental | 15–25% commission; rental annuity | Medium | 3 |
| B2B corporate contracts | Per-employee/year; negotiated ACV | High | 4 |

**$100M ARR shape (realistic, 5–7 years):** 10+ cities × blended ARPU where domestic subs are the volume floor, and NRI-USD + insurance + B2B carry the margin. Not a 2–3 year story — every comp proves it.

---

## 4. Feature Roadmap

### Phase 0 (ship next)
- [ ] WhatsApp guardian channel (creds pending) — via BSP (Gupshup/Interakt), **not** direct Meta API (BSP wins below ~1M messages/month); healthcare-template approval lead time
- [ ] DLT registration for SMS fallback (mandatory; healthcare = sensitive promo category)
- [ ] Server-side rate limits (currently in-memory — breaks on serverless scale-out)
- [ ] Subscription paywall + Razorpay/Cashfree checkout; plan ladder
- [ ] NMC/State Medical Council verification workflow for doctor listings
- [ ] Consent UI + privacy notice + retention/erasure policy (DPDP: itemized, withdrawable — enforcement lands May 2027 but build now, retrofit is expensive)
- [ ] Append-only `audit_log` table via DB triggers (no UPDATE/DELETE grants) — **before** any health-adjacent feature ships, not after
- [ ] `city_id` on every table + indexes (already multi-city migration 14 — verify coverage; this is the future shard key)

### Phase 1
- [ ] USD billing (Stripe for international cards / remittance-friendly flows, P1301 documentation in receipts)
- [ ] BBPS bill-pay integration; bill calendar in guardian app
- [ ] Fraud-guard: transaction-anomaly alerts, scam-pattern lessons in elder voice UX
- [ ] Guardian "command center" web dashboard (Next.js — richer than mobile for NRI desk use)
- [ ] Vernacular voice upgrade: Sarvam AI STT/TTS (Bengali/Hindi/Nepali), AI4Bharat open models as cost-hedge fallback

### Phase 2
- [ ] PoSP onboarding flow + partner-broker integration
- [ ] Policy vault: store parents' policies, renewal reminders (natural cross-sell moment)
- [ ] Claims-assist concierge (human-in-loop, high NPS moment)

### Phase 3
- [ ] Care-provider marketplace: attendant/nurse profiles, verification badges, booking, ratings
- [ ] Care-plan builder (post-hospitalization packages)
- [ ] Equipment rental catalog + logistics partner integration
- [ ] ABDM integration: ABHA ID linking, register as HIP/HIU via sandbox (840M+ ABHA IDs; near-mandatory for anything govt-linked)

### Phase 4
- [ ] Employer admin portal: seat management, utilization reporting, invoicing
- [ ] Insurer white-label/embedded API

---

## 5. Architecture Roadmap

**Doctrine: monolith-first.** Zomato ran a Rails monolith to ~2016–17; Swiggy split only around Series C; Practo stayed monolith-heavy longest (healthcare audit surface multiplies per service). Split only when (a) a domain's traffic/latency profile diverges hard (voice pipeline, matching/dispatch), or (b) engineering team >15–20 and deploy coupling hurts more than service overhead.

### Now → Seed: one Turborepo monorepo

Current repo is flat (Expo app at root + `server/` functions + `landing/` + 18 loose root-level SQL migration files). Restructure:

```
saathi/                      (single monorepo, Turborepo)
  apps/
    mobile/                  (Expo app — moves from root)
    web/                     (guardian dashboard + landing, Next.js)
    api/                     (Vercel functions — current server/)
  packages/
    ui/                      (shared RN+web components)
    types/                   (Zod schemas, generated DB types)
    api-client/              (typed Supabase/API wrappers)
    domain-care/             (reminders, alerts, family — business logic)
    config/                  (eslint, tsconfig, shared constants)
  supabase/
    migrations/              (numbered, in-folder — kill the loose root SQL files)
  docs/
```

Turborepo over Nx: simpler, matches existing Vercel + Expo tooling.

### Data layer
- **Stay on Supabase** until: RLS query-planning walls (>10–20M rows with complex multi-tenant policies), cross-region replica needs, or realtime fanout beyond connection limits. Realistic exit trigger: Series A–B, 3–5 cities, >500k MAU. Until then: Supavisor pooling + read replicas + vertical Postgres scaling.
- Multi-city model: single shared DB, `city_id` on every row (partition key, not tenant), RLS scoped by city + family. **Not** schema-per-tenant, **not** DB-per-tenant (reserve DB-per-tenant only for future enterprise/insurer B2B).
- Data residency: keep everything in ap-south-1 (Mumbai) — DPDP cross-border is currently blacklist-model (Rule 15, guardian-abroad access is fine), but health data + upcoming sectoral rules make India-region storage non-negotiable.
- Append-only audit log via triggers, separate from operational tables, immutable grants.

### Async + events
- Now: Supabase Realtime + cron (existing digest pattern) + lightweight queue (Upstash QStash / Trigger.dev) for reminders, WhatsApp sends, digests
- Kafka/Redpanda only when multiple consumers need independent replay or event volume exceeds Postgres NOTIFY throughput (~thousands/sec). Realistic: Series B, 3+ business lines emitting cross-cutting events (booking → payment → notification → audit).

### Feature flags + experimentation
- PostHog (flags + experiments + analytics in one) or GrowthBook (OSS). Evaluate flags at edge (Vercel Edge Config / local eval) — no DB round-trip per request.

### India vendor stack
| Concern | Pick | Why |
|---|---|---|
| Payments (domestic) | Cashfree or Razorpay | Licensed PA, UPI + payouts, fast integration. Juspay orchestration only at Series B+ volume |
| Payments (NRI inbound) | Bank/forex rails, purpose code P1301; Stripe for USD subscription cards | Lowest-documentation compliant path |
| WhatsApp | Gupshup or Interakt (BSP) | Template approval + rate-limit handling; direct Meta API only past ~1M msgs/month |
| Vernacular voice | Sarvam AI, AI4Bharat fallback | Strong Indic STT/TTS, commercial terms; Bhashini = compliance optics only |
| SMS | DLT-registered sender via standard aggregator | TRAI mandatory |
| Flags/analytics | PostHog | One tool, self-hostable |

### Service evolution map
| Stage | Engineers | Structure |
|---|---|---|
| Now | 1–2 | Monorepo, monolith API, Supabase direct |
| ~10 | 10 | Same monorepo, domain packages hardened; first extracted service = voice pipeline or matching/dispatch (diverging latency) |
| ~50 | 50 | Payments + insurance split into own services/repos (compliance boundary); platform team owns shared packages; per-business-line squads |
| ~200 | 200 | Microservices for high-scale domains; monorepo survives for mobile+web+UI; dedicated compliance/security team |

---

## 6. Repos & Assets To Have

| Repo/asset | When | Notes |
|---|---|---|
| `saathi` monorepo (restructured as §5) | Now | Single source of truth; migrations foldered |
| `saathi-landing` | Exists (inside repo at `landing/`) | Moves to `apps/web` in restructure; Vercel project already live |
| `saathi-infra` | Series A | Terraform/IaC when off pure Vercel+Supabase |
| `saathi-payments` service repo | ~50 eng / insurance+payments scale | Compliance isolation boundary |
| Status page + incident runbook | Before paid launch | Care product = trust product |
| DPDP compliance pack (consent records, breach SOP, retention policy) | Before paid launch | Penalties up to ₹250 Cr; DPO only if "Significant Data Fiduciary" (not at seed) |
| PoSP certification + broker agreement | Phase 2 | 15-hour cert, zero capital |
| ABDM sandbox registration (HIP/HIU) | Phase 3 | Not needed for directory-only |

---

## 7. Compliance Checklist by Stage

**Before paid launch (Phase 0):** DPDP consent UI + privacy notice + breach SOP; DLT registration (SMS); WhatsApp BSP template approval; NMC verification for doctor listings; audit-log table; India-region data residency confirmed.

**Phase 1:** PA-partner merchant onboarding for vendor payouts; P1301 documentation in NRI billing; PCI scope kept inside Stripe/PA (never touch card data).

**Phase 2:** PoSP registration under partner broker; IRDAI commission-cap adherence in accounting.

**Phase 3:** State Clinical Establishments Act legal opinion (WB first); nurse council-registration verification; police-verification pipeline for attendants; teleconsult record retention ≥3 years if consult facilitation begins (2020 Telemedicine Guidelines).

**Ongoing:** DPDP Rules phased enforcement — consent-manager ecosystem Nov 2026, full enforcement 13 May 2027. Re-check Rule 15 country blacklist before then.

---

## 8. 12-Month Execution Milestones

| Month | Milestone |
|---|---|
| 1 | Ship blockers: WhatsApp BSP live, server-side rate limits, monorepo restructure, migrations foldered |
| 2 | Payments in: Razorpay/Cashfree checkout, plan ladder live, consent/DPDP pack shipped |
| 3 | **Siliguri paid launch.** Target: 200 paying families. Audit log live |
| 4–5 | NRI tier: USD billing, guardian web command center v1. Target: 50 NRI subscribers (validates the unproven $40–80 ARPU band) |
| 6 | Bill-pay (BBPS) + fraud-guard v1. Sarvam voice upgrade |
| 7–8 | City #2 (Guwahati or Durgapur — same vernacular belt, `city_id` infra proves out) |
| 9–10 | PoSP live; policy vault; first insurance revenue |
| 11–12 | Home-care marketplace pilot (Siliguri only); first corporate-benefit pilot conversation. Seed raise on: paying-family count, NRI ARPU proof, 2-city playbook |

**Kill/pivot signals:** NRI tier <$25 blended ARPU after 3 months of testing = reprice or drop USD thesis; care-subscription churn >8%/month = wedge is wrong, directory/fintech becomes the lead product.

---

## 9. Top Risks

1. **Unit economics gravity** — every comp loses money on human-heavy care. Mitigation: coordination-software-first, partner fulfillment, watch contribution margin per family from day one.
2. **NRI willingness-to-pay is unvalidated** — no public comp exists (that's the opportunity AND the risk). Mitigation: month 4–5 pricing test is the single most important experiment of year one.
3. **Caregiver supply in tier-2/3** — worst outside metros. Mitigation: verification + training playbook per city before marketplace scale.
4. **Regulatory drift** — DPDP enforcement 2027, pending Drugs Bill, IRDAI commission rules. Mitigation: quarterly compliance review; §7 checklist owned, not aspirational.
5. **Incumbent response** — Emoha/Samarth could go vernacular. Moat = NRI financial layer + vendor trust graph per city, which subscriptions alone don't replicate.

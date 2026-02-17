# novoid → Commercial Agentic AI Ecosystem

## Context

novoid is a self-hosting frontend platform (CSS + JS framework on Convex) with an autonomous AI agent (Nex), voice builder (Vox), and verification engine (Nous). It has auth, orgs, and a `plan` field on organizations — but no billing, no metering, no marketplace. The sibling repo **kitsune** has a battle-tested credit system, Stripe integration, and rich auth (SSO, MFA, SCIM). This plan cherry-picks kitsune's billing/auth patterns and adapts them for agentic AI commercialization.

**Goal:** Go from open-source repo → monetized agentic AI platform with credit-based billing, tiered plans, and a skill/app marketplace.

---

## Phase 1: Credit Economy (Week 1-2)

### New tables in `convex/schema.ts` (+4)

| Table | Purpose |
|-------|---------|
| `creditTransactions` | Immutable append-only ledger (orgId, amount, type, reason, balance, metadata, createdAt) |
| `creditPackages` | Catalog: Starter 500cr/$30, Growth 2500cr/$150, Pro 10000cr/$500 |
| `usageLogs` | Deletion-resistant audit trail per operation (orgId, operation, credits, timestamp) |
| `payments` | Stripe payment intent tracking (orgId, stripePaymentIntentId, status, packageId) |

### Modify `organizations` table

Add `planLimits` object: `{ maxMemoryMB, maxSkills, maxChannels, maxApps, canUseSSO, canUseMFA, supportTier }`

### Credit cost model for agentic operations

| Operation | Credits |
|-----------|---------|
| Nex chat (no memory) | 2 |
| Nex chat (with memory recall) | 5 |
| Nex memory store (per chunk) | 1 |
| Nex heartbeat check | 3 |
| Nex channel message (outbound) | 2 |
| Skill execution (simple) | 5 |
| Skill execution (AI-heavy) | 10-30 |
| Vox app build | 50 |
| Vox iteration | 20 |
| novoid-browser verification | 1 |
| Nous static proof | 0 (local) |
| Canvas registration | 0 (metadata) |

### New files

- **`convex/credits.ts`** — `balance` query, `history` query, `deduct` mutation, `grant` mutation, `purchase` mutation
- **`convex/billing.ts`** — `packages` query, `createCheckoutSession` action (Stripe), `stripeWebhook` HTTP handler
- **`convex/lib.ts` additions** — `checkLimit(ctx, orgId, key)` and `withCreditDeduction(ctx, orgId, op, cost, fn)` helpers

### Stripe integration (ported from kitsune)

- Port `creditCosts.ts` pattern from `../kitsune/convex/lib/creditCosts.ts`
- Port Stripe checkout session + webhook flow from `../kitsune/convex/stripe.ts`
- Add `POST /stripe/webhook` route to `convex/http.ts`

---

## Phase 2: Tier Enforcement (Week 3)

### 3-tier plan definitions

| | Free | Pro ($30/mo) | Enterprise (custom) |
|---|---|---|---|
| Monthly credits | 100 | 500 + purchasable | Unlimited/custom |
| Memory | 10 MB | 500 MB | Unlimited |
| Skills | 5 builtin | 50 + certified | Unlimited |
| Channels | 1 | 5 | Unlimited |
| Published apps | 3 | 50 | Unlimited |
| Heartbeat interval | 60 min | 30 min | Custom |
| Auth | Password | + MFA | + SSO/SAML |
| Support | Community | Email 24h | Priority 4h |
| Custom domains | 0 | 3 | Unlimited |
| Audit log retention | 7 days | 90 days | 1 year + export |

### Enforcement points

Wrap existing mutations in `nex.ts`, `jobs.ts`, `pages.ts` with `checkLimit()` and `withCreditDeduction()`. Insufficient credits → clear error with upgrade CTA.

---

## Phase 3: Enhanced Auth (Week 4)

### New tables (+2)

| Table | Purpose |
|-------|---------|
| `mfaTokens` | TOTP secrets + hashed backup codes per user (Pro+) |
| `ssoConnections` | SAML/OIDC config per org (Enterprise only) |

### Changes to `convex/auth.ts`

- Add `loginWithMFA` mutation (existing PBKDF2 + TOTP verification layer)
- Add `enrollMFA` / `disableMFA` mutations
- Keep existing password auth as-is for backward compat
- SSO deferred to Phase 2 (month 3-4) — just add the table now

---

## Phase 4: Marketplace (Week 5-6)

### New tables (+2)

| Table | Purpose |
|-------|---------|
| `marketplaceSkills` | Certified skills catalog (name, command, handler, price, author, certificationId, downloads, rating) |
| `marketplaceApps` | Published app catalog (slug, title, price, author, category, downloads, rating) |

### New file: `convex/marketplace.ts`

- `listSkills` / `listApps` queries (filterable by category, featured)
- `installSkill` mutation (plan limit check + credit deduction + revenue split 70/30)
- `publishSkill` / `publishApp` mutations (requires certification)
- `rateSkill` / `rateApp` mutations

### Revenue model

- Free skills/apps: included
- Paid: publisher sets price (0-500 cr), 70% to publisher, 30% platform fee
- Featured placement: curated by platform

---

## Phase 5: Metering Dashboard (Week 7)

### New file: `convex/analytics.ts`

- `orgUsageReport` query — breakdown by operation type over date range
- `platformMetrics` query — public stats (total orgs, apps, skills, credit volume)

### Billing UI: publish as `/app/billing`

- Current balance + purchase button (Stripe Checkout)
- Transaction history table
- Usage breakdown chart by operation type
- Plan comparison + upgrade CTA

---

## Phase 6: Audit Logs (Week 8)

### New table (+1)

| Table | Purpose |
|-------|---------|
| `auditLogs` | Compliance trail (orgId, userId, action, resource, timestamp) with tier-based retention |

### Cron job addition to `convex/crons.ts`

- Daily cleanup: delete audit logs older than tier retention (7d/90d/365d)

---

## Schema Summary

**Current:** 21 tables → **After:** 30 tables (+9)

New tables: `creditTransactions`, `creditPackages`, `usageLogs`, `payments`, `mfaTokens`, `ssoConnections`, `marketplaceSkills`, `marketplaceApps`, `auditLogs`

---

## Migration Path

1. Existing orgs get `plan: "free"` + `planLimits: FREE_DEFAULTS` + 100 welcome credits
2. 30-day grace period: credit deductions logged but not enforced (warnings only)
3. After grace: enforce credit requirements
4. First 100 beta orgs: grandfather flag for extended free credits

---

## What to port from kitsune vs build fresh

**Port:** Credit ledger pattern, Stripe checkout+webhook flow, volume discount logic, sponsored accounts concept, audit log structure

**Build fresh:** Agentic operation metering, skill marketplace, tier limit enforcement, MFA (simplified TOTP-only)

**Skip for now:** SAML/OIDC (Enterprise Phase 2), SCIM (low ROI), PII separation (GDPR Phase 2)

---

## Critical files to modify

1. `convex/schema.ts` — add 9 tables, modify `organizations`
2. `convex/lib.ts` — add `checkLimit()`, `withCreditDeduction()`
3. `convex/nex.ts` — wrap mutations with credit deduction
4. `convex/http.ts` — add Stripe webhook route, billing routes
5. `convex/crons.ts` — add audit log cleanup

## New files to create

1. `convex/credits.ts` — credit ledger operations
2. `convex/billing.ts` — Stripe integration
3. `convex/marketplace.ts` — skill/app catalog
4. `convex/analytics.ts` — usage reporting

## Verification

1. `npx convex dev` — schema deploys without errors
2. Seed credit packages → query them → purchase flow with test Stripe key
3. Nex chat → verify credit deduction appears in `creditTransactions`
4. Hit plan limit → verify clear error message
5. Install marketplace skill → verify credit split
6. Publish billing UI → verify dashboard renders with real data

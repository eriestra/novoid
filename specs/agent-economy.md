# Agent Economy: Verification-as-a-Service

## Thesis

no∅ is not a tool for humans. It is infrastructure for agents.

Agents generate UI. They cannot see it. They need **proof** that it works. no∅ is the only platform that provides that proof — formal mathematical verification (Nous) + headless empirical execution (novoid-browser) — without rendering a single pixel.

The certificate is the product. Everything else is distribution.

---

## What We're Selling

### The Proof Certificate

When an agent submits HTML to no∅, it gets back a **verification certificate** — a machine-readable document that says:

- Structure is valid (tree automata, accessibility)
- Layout is sound (no overflow, no cascade conflicts, breakpoint-safe)
- Reactivity is correct (no cycles, no dead signals, no state machine deadlocks)
- No taint paths (user input never reaches dangerous sinks)
- Runtime is clean (JS executes without errors, signals resolve, actions fire)

No other platform on earth can produce this document. This is the moat.

### Why Agents Will Pay

Agents building UI today have two options:
1. **Screenshot → VLM** — slow, expensive, unreliable, requires a real browser
2. **Hope it works** — ship and pray

no∅ offers option 3: **mathematical certainty in <500ms**. An agent calls one endpoint, gets a proof, and knows — not guesses, knows — that the UI is correct.

This matters because:
- Autonomous agents can't ask a human "does this look right?"
- Agentic pipelines need machine-readable quality gates
- Agent-to-agent trust requires verifiable artifacts, not screenshots

---

## Architecture

```
External Agent (any framework, any LLM)
    │
    │  POST /api/verify
    │  Header: Authorization: Bearer <api-key>
    │  Body: { html: "<!DOCTYPE html>..." }
    │
    ▼
┌─────────────────────────────────────────────────────┐
│  no∅ Gateway (Convex HTTP)                          │
│                                                     │
│  1. Authenticate API key → look up org + credits    │
│  2. Rate limit check (tier-based)                   │
│  3. Deduct credits from ledger                      │
│  4. Run verification pipeline:                      │
│     ├─ Nous (static proof)                          │
│     │   ├─ Morphe: structure + accessibility        │
│     │   ├─ Thesis: layout + cascade + breakpoints   │
│     │   └─ Kinesis: reactivity + state machines     │
│     └─ novoid-browser (empirical)                   │
│        ├─ QuickJS execution                         │
│        ├─ Signal/store introspection                │
│        └─ Assertion evaluation                      │
│  5. Generate certificate                            │
│  6. Store in certificates table                     │
│  7. Return certificate + verification URL           │
└─────────────────────────────────────────────────────┘
    │
    ▼
{
  "id": "cert_a7f3b2c1",
  "status": "SOUND",
  "timestamp": "2026-02-13T...",
  "verifyUrl": "https://novoid.convex.site/cert/cert_a7f3b2c1",
  "nous": {
    "nodes": 47,
    "signals": 6,
    "stores": 2,
    "cascadeConflicts": 0,
    "taintPaths": 0,
    "deadSignals": 0,
    "stateDeadlocks": 0,
    "breakpoints": [768, 1024],
    "accessibilityIssues": 0
  },
  "browser": {
    "errors": 0,
    "signals": 6,
    "stores": 2,
    "actions": 3,
    "executionMs": 142
  },
  "hash": "sha256:e3b0c44298fc..."
}
```

---

## API Surface

### `POST /api/verify` — Verify HTML

The core product. Submit HTML, get a proof certificate.

**Request:**
```http
POST /api/verify HTTP/1.1
Authorization: Bearer nv_sk_live_abc123
Content-Type: text/html

<!DOCTYPE html>
<html>...your app...</html>
```

**Response (200 — SOUND):**
```json
{
  "id": "cert_a7f3b2c1",
  "status": "SOUND",
  "creditsUsed": 1,
  "creditsRemaining": 499,
  "certificate": { ... },
  "verifyUrl": "https://novoid.convex.site/cert/cert_a7f3b2c1"
}
```

**Response (200 — UNSOUND):**
```json
{
  "id": "cert_b8e4c3d2",
  "status": "UNSOUND",
  "creditsUsed": 1,
  "creditsRemaining": 498,
  "issues": [
    { "pillar": "kinesis", "type": "dead_signal", "detail": "signal_2 is set but never read" },
    { "pillar": "thesis", "type": "cascade_conflict", "detail": ".nv-card .nv-btn overridden by .nv-btn at same specificity" },
    { "pillar": "browser", "type": "runtime_error", "detail": "ReferenceError: counnt is not defined (line 42)" }
  ],
  "certificate": null
}
```

**Response (402):** Insufficient credits
**Response (429):** Rate limited

Credits are charged whether the result is SOUND or UNSOUND — you're paying for the analysis, not the outcome.

### `POST /api/verify-and-publish` — Verify + Deploy

Verify the HTML and, if SOUND, publish it to a live URL. Two operations in one call.

**Request:**
```http
POST /api/verify-and-publish HTTP/1.1
Authorization: Bearer nv_sk_live_abc123
Content-Type: application/json

{
  "slug": "my-agent-app",
  "html": "<!DOCTYPE html>..."
}
```

**Response (200):**
```json
{
  "certificate": { ... },
  "url": "https://novoid.convex.site/app/my-agent-app",
  "creditsUsed": 3
}
```

Cost: 1 credit (verify) + 2 credits (publish + host).

### `POST /api/execute` — Headless Execution

Run an app headlessly and get a state dump. For agents that need to test behavior, not just structure.

**Request:**
```json
{
  "html": "<!DOCTYPE html>...",
  "actions": [
    { "call": "addTask", "args": ["Buy milk"] },
    { "call": "addTask", "args": ["Write spec"] }
  ],
  "assertions": [
    "store_0.tasks.length === 2",
    "signal_0 === 2"
  ],
  "seed": {
    "pages:list": [{"slug": "foo"}]
  }
}
```

**Response:**
```json
{
  "signals": { "signal_0": 2, "signal_1": "all" },
  "stores": { "store_0": { "tasks": ["Buy milk", "Write spec"] } },
  "assertions": [
    { "expr": "store_0.tasks.length === 2", "pass": true },
    { "expr": "signal_0 === 2", "pass": true }
  ],
  "errors": [],
  "executionMs": 87,
  "creditsUsed": 2
}
```

### `GET /api/cert/:id` — Verify a Certificate

Public, no auth required. Any agent can verify that a certificate is real.

```json
{
  "id": "cert_a7f3b2c1",
  "status": "SOUND",
  "issuedAt": "2026-02-13T...",
  "htmlHash": "sha256:e3b0c44298fc...",
  "valid": true
}
```

This is the trust layer. Agent A builds an app, gets a certificate. Agent B checks the certificate before embedding it. No human in the loop.

### `POST /api/keys` — Create API Key

Authenticated (user session). Creates an API key for programmatic access.

```json
{
  "name": "my-agent-key",
  "orgId": "org_xyz"
}
```

Returns: `{ "key": "nv_sk_live_abc123...", "id": "key_123" }`

Key is shown once. Stored as SHA-256 hash.

---

## Credit Economy

### Pricing

| Operation | Credits | What You Get |
|---|---|---|
| `verify` | 1 | Nous proof + browser execution + certificate |
| `verify-and-publish` | 3 | Verify + deploy to live URL |
| `execute` | 2 | Headless run + state dump + assertions |
| `cert` (read) | 0 | Certificate verification (public) |
| Hosting (per app/month) | 10 | Live URL at `/app/:slug` |

### Packages

| Package | Credits | Price | Per-Credit |
|---|---|---|---|
| Starter | 500 | $25 | $0.050 |
| Growth | 2,500 | $100 | $0.040 |
| Scale | 15,000 | $450 | $0.030 |
| Enterprise | Custom | Custom | Custom |

### Free Tier

100 credits/month. Enough for ~100 verifications. No credit card required. Agents can start using the API immediately with just an email.

### Why This Pricing Works

A screenshot-based VLM verification costs ~$0.05-0.15 per check (image tokens + inference). no∅ verification costs $0.03-0.05 and gives you a **mathematical proof**, not a model's opinion. It's cheaper AND more reliable.

---

## New Schema (+5 tables)

```typescript
// API keys for external agents
api_keys: defineTable({
  orgId: v.id("organizations"),
  name: v.string(),
  keyHash: v.string(),         // SHA-256 of the actual key
  prefix: v.string(),          // "nv_sk_live_abc" — for identification in logs
  permissions: v.array(v.string()), // ["verify", "publish", "execute"]
  rateLimit: v.number(),       // requests per minute
  lastUsedAt: v.optional(v.number()),
  createdAt: v.number(),
  revokedAt: v.optional(v.number()),
})
  .index("by_hash", ["keyHash"])
  .index("by_org", ["orgId"]),

// Verification certificates
certificates: defineTable({
  certId: v.string(),          // "cert_<nanoid>"
  orgId: v.id("organizations"),
  status: v.string(),          // "SOUND" | "UNSOUND"
  htmlHash: v.string(),        // SHA-256 of input HTML
  nousReport: v.string(),      // JSON: full Nous output
  browserReport: v.string(),   // JSON: full browser output
  issues: v.optional(v.string()), // JSON: array of issues (if UNSOUND)
  slug: v.optional(v.string()), // if published
  issuedAt: v.number(),
})
  .index("by_cert_id", ["certId"])
  .index("by_org", ["orgId"])
  .index("by_html_hash", ["htmlHash"]),

// Credit ledger (append-only)
credit_transactions: defineTable({
  orgId: v.id("organizations"),
  amount: v.number(),          // positive = credit, negative = debit
  balance: v.number(),         // running balance after this transaction
  type: v.string(),            // "purchase" | "debit" | "grant" | "refund"
  operation: v.optional(v.string()), // "verify" | "publish" | "execute"
  referenceId: v.optional(v.string()), // cert ID, job ID, etc.
  createdAt: v.number(),
})
  .index("by_org", ["orgId"])
  .index("by_org_time", ["orgId", "createdAt"]),

// Credit packages catalog
credit_packages: defineTable({
  name: v.string(),
  credits: v.number(),
  priceUsd: v.number(),
  active: v.boolean(),
})
  .index("by_active", ["active"]),

// Stripe payment tracking
payments: defineTable({
  orgId: v.id("organizations"),
  packageId: v.id("credit_packages"),
  stripeSessionId: v.string(),
  status: v.string(),          // "pending" | "completed" | "failed"
  credits: v.number(),
  amountUsd: v.number(),
  createdAt: v.number(),
  completedAt: v.optional(v.number()),
})
  .index("by_org", ["orgId"])
  .index("by_stripe_session", ["stripeSessionId"]),
```

---

## New HTTP Routes

```
POST /api/verify              → verify HTML, return certificate
POST /api/verify-and-publish  → verify + deploy
POST /api/execute             → headless execution + assertions
GET  /api/cert/:id            → public certificate lookup
POST /api/keys                → create API key (authed)
GET  /api/keys                → list API keys (authed)
DELETE /api/keys/:id          → revoke API key (authed)
GET  /api/balance             → credit balance (authed)
GET  /api/usage               → usage history (authed)
POST /stripe/webhook          → Stripe payment webhook
```

---

## New Convex Files

| File | Purpose |
|---|---|
| `convex/apiKeys.ts` | API key CRUD + validation |
| `convex/certificates.ts` | Certificate generation + lookup |
| `convex/credits.ts` | Credit ledger operations |
| `convex/billing.ts` | Stripe checkout + webhook |
| `convex/gateway.ts` | Request auth + rate limiting + credit deduction |

---

## Verification Pipeline (Server-Side)

The key technical challenge: Nous and novoid-browser currently run as CLI tools. For the API, they need to run server-side.

### Option A: Convex Action + Subprocess (MVP)

Convex actions can run Node.js. Ship Nous as a library (it's already TypeScript). For novoid-browser, call it as a subprocess from the action.

```
POST /api/verify
  → httpAction: auth + rate limit + credit check
  → action: runVerification
    → Nous (in-process, TypeScript)
    → novoid-browser (subprocess, Rust binary)
  → mutation: storeCertificate + deductCredits
  → return certificate
```

**Constraint:** Convex actions have a 60s timeout and limited compute. Nous is fast (<200ms). novoid-browser is fast (<300ms). Total should stay under 1s for most apps.

### Option B: External Worker (Scale)

For high volume, run a verification worker fleet:

```
POST /api/verify
  → Convex: enqueue verification job
  → Worker pool: pick up job, run Nous + browser
  → Worker: POST result back to Convex
  → Convex: store certificate, return via polling/webhook
```

**Start with Option A.** Move to B when throughput demands it.

---

## Agent Discovery

### `/.well-known/novoid.json`

Machine-readable capability manifest. Any agent can discover the API.

```json
{
  "name": "novoid",
  "version": "1.0",
  "description": "UI verification and hosting for AI agents",
  "api": "https://novoid.convex.site/api",
  "capabilities": ["verify", "publish", "execute", "certify"],
  "pricing": "https://novoid.convex.site/api/pricing",
  "docs": "https://github.com/eriestra/novoid/blob/main/specs/agent-economy.md",
  "auth": "bearer-token",
  "signup": "https://novoid.convex.site/api/register"
}
```

### `llms.txt` (already exists)

Update to include API endpoints and pricing.

### MCP Server (future)

Expose verification as an MCP tool. Any Claude, GPT, or Gemini agent with MCP support can call `novoid_verify` directly from their tool belt.

```json
{
  "name": "novoid_verify",
  "description": "Verify HTML correctness with formal proof + headless execution",
  "inputSchema": {
    "type": "object",
    "properties": {
      "html": { "type": "string", "description": "Complete HTML document" }
    }
  }
}
```

---

## Agent Registration Flow

Agents don't fill out forms. They call an API.

```http
POST /api/register
Content-Type: application/json

{
  "email": "agent-7b3f@mycompany.com",
  "name": "BuildBot-7b3f"
}
```

Response:
```json
{
  "orgId": "org_abc",
  "apiKey": "nv_sk_live_abc123...",
  "credits": 100,
  "message": "100 free credits granted. GET /api/pricing for packages."
}
```

No password. No OAuth dance. No email verification (for free tier). An agent can go from zero to verified UI in under 5 seconds.

For paid tiers, the org owner (human) adds a payment method via Stripe Checkout. The agent's API key inherits the org's credit balance.

---

## Trust Network (Phase 2)

Once certificates exist, a trust graph emerges:

```
Agent A builds login-widget     → cert_001 (SOUND)
Agent B builds dashboard        → cert_002 (SOUND)
  └─ embeds login-widget        → checks cert_001 ✓
Agent C builds admin-panel      → cert_003 (SOUND)
  └─ embeds dashboard           → checks cert_002 ✓
    └─ transitively trusts      → cert_001 ✓
```

Certificates chain. An agent can verify not just its own work, but every component it depends on. This is **a web of trust for agent-generated UI**.

### Capability Contracts

Nous already proves what an app *does*. Extend this to produce a machine-readable capability spec:

```json
{
  "certId": "cert_001",
  "capabilities": {
    "signals": ["count", "filter", "searchQuery"],
    "stores": [{ "name": "tasks", "shape": { "items": "array" } }],
    "actions": ["addTask", "removeTask", "toggleComplete"],
    "inputs": ["text:taskInput", "select:filterSelect"],
    "events": ["submit:taskForm"]
  }
}
```

Agent B doesn't read docs. It reads the capability spec. "I need a component with an `addTask` action and a `tasks` store" → query the registry → get cert_001 → embed it.

---

## Marketplace (Phase 3)

Certified apps become tradeable:

| Field | Value |
|---|---|
| Listing | cert_001: login-widget |
| Author | Agent A (org_xyz) |
| Status | SOUND (verified 2026-02-13) |
| Capabilities | auth.login, auth.register, auth.logout |
| Price | 5 credits per embed |
| Revenue split | 70% author / 30% platform |
| Downloads | 1,247 |

Revenue flows automatically via credit transfers. No invoices, no contracts, no humans.

---

## Implementation Priority

### Phase 1: MVP (ship in days, not weeks)

1. `api_keys` table + key creation/validation
2. `certificates` table + cert generation
3. `credit_transactions` table + balance/deduct
4. `POST /api/verify` endpoint (Nous + browser in Convex action)
5. `GET /api/cert/:id` endpoint (public)
6. `POST /api/register` (free tier, 100 credits)
7. `/.well-known/novoid.json`

This is enough. An external agent can register, verify HTML, and get a certificate. Everything else layers on top.

### Phase 2: Revenue

8. Stripe integration (credit purchases)
9. `POST /api/verify-and-publish`
10. `POST /api/execute`
11. Usage dashboard

### Phase 3: Network Effects

12. Capability contracts
13. Marketplace listings
14. Certificate chaining / trust graph
15. MCP server
16. Revenue splits for embedded components

---

## What Makes This Defensible

| Competitor approach | Why it loses |
|---|---|
| Screenshot + VLM | Slow ($0.10+), unreliable, requires real browser, returns opinions not proofs |
| Linting (ESLint, etc.) | Catches syntax, misses reactivity, layout, state machines, taint |
| Unit tests | Require human-written tests; agents can't write good tests for their own code |
| E2E (Playwright, etc.) | Requires real browser, slow, flaky, no formal guarantees |
| no∅ verification | <500ms, mathematical proof, headless, $0.03-0.05, machine-readable certificate |

The gap is not incremental. No one else has tree automata for HTML, constraint solvers for CSS, or dataflow analysis for reactive JS. Building this from scratch would take years. The only way to get a no∅ certificate is through no∅.

---

## One-Line Summary

**no∅ is the certificate authority for agent-generated UI.**

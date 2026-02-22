# no∅ Agent Billing Proxy
## Spec + Background

> **Status:** Draft  
> **License:** MIT — open source, including this spec and all hosting scripts  
> **Repo:** github.com/eriestra/novoid

---

# Part 1: Background & Strategic Context

## What is no∅ (novoid)?

no∅ is a frontend platform designed for AI agents. It lives at [github.com/eriestra/novoid](https://github.com/eriestra/novoid).

The core insight: most web frameworks (React, Next.js) are designed for humans editing code incrementally over years. They are overhead for AI agents. no∅ is different — it is designed specifically for single-pass generation by agents.

```
Human: "Build me a kanban board with drag-and-drop and dark mode"

Agent: reads skills.md (45KB, complete API)
       generates src/app/kanban.html (single file, ~550 lines)
       publishes to Convex (1 command, 2 seconds)
       → live URL, globally accessible
       Total: 92 seconds
```

### Why no∅ beats React for agents

| | React/Next.js | no∅ |
|---|---|---|
| Files to generate | 10-50+ | 1 |
| Config files | 3-8 | 0 |
| Build step | Required (3-45s) | None |
| Deploy pipeline | Required (30-120s) | 1 command (2s) |
| API surface to hold in context | 500+ symbols | ~145 symbols |
| Time from prompt to live URL | 3-5 minutes minimum | Under 2 minutes |

### What's in the box

**Novoid.js — 5.7 KB gzipped.** Every React pattern, zero virtual DOM:

| API | React equivalent |
|---|---|
| `signal(initial)` | useState |
| `computed(fn)` | useMemo |
| `effect(fn)` | useEffect |
| `createStore(state, actions)` | Redux / Zustand |
| `createRouter(routes)` | React Router |
| `createForm(schema)` | React Hook Form |
| `mount(selector, appFn)` | createRoot().render() |

**no∅ CSS — 9.5 KB gzipped.** 28 component types, all `nv-` prefixed, dark mode built in.

### How it works

```
GitHub                              Convex Cloud
──────                              ────────────
index.html (40 lines)
  │ fetch("/app/slug") ──────────→  HTTP route reads from pages table
  │                                   │
  document.write(html) ◄────────── returns full HTML page
```

The entire platform lives in a Convex database. GitHub holds only a 40-line bootstrapper. No CI/CD. No build server. Write HTML to a database, it's live.

---

## The Problem: Agents Can't Self-Host

Self-hosting no∅ requires a human to:
- Create a Convex account (email, browser verification)
- Run `npx convex dev` interactively
- Manage `.env.local` files and secrets
- Run `seed.sh`

**Agents can't do any of that.**

And even if an agent operator sets up a Convex instance and gives credentials to their agent — Convex billing requires a human payment method. There is no way for an agent to pay for its own infrastructure autonomously.

This is the gap the billing proxy fills.

---

## The Opportunity: Agent-Only Infrastructure

Every other deployment platform (Vercel, Netlify, Render) requires a human account with a credit card. No platform is designed for agents to pay autonomously.

The billing proxy makes no∅ the first purpose-built agent deployment rail:

```
Agent earns USDC doing tasks
  → needs to deploy output
  → pays your proxy endpoint in USDC on Base
  → gets a live URL back
  → no human involved anywhere
```

### Why agents use your instance instead of self-hosting

1. **Agents can't set up Convex** — account creation requires a human
2. **Agents have no credit cards** — your x402 USDC rail is the only way an agent pays for deployment autonomously
3. **One endpoint vs. an entire platform** — agents only need to hold `endpoint + apiKey + $0.02/publish` in context
4. **No context overhead** — self-hosting requires understanding Convex architecture, schema, HTTP routing, seeding

### Should the repo stay public?

Yes. The open source repo is your distribution engine:
- Agents get trained on it and become natively aware of the deployment rail
- Developers building agents find it and integrate it
- The `llms.txt` and `llms-full.txt` files already in the repo are designed for AI discovery
- Contributors improve the code for free

Your moat is the **running instance** and the **billing layer** — not the code. Nobody can take that by forking the repo.

The only things that stay private: `.env` credentials.

### Revenue model

| Unit | Price | Example |
|---|---|---|
| Per publish | $0.02 | Agent deploying 100 apps/day = $2/day |
| Slug reservation (per day) | $0.001 | Hosting fee while page lives |
| Priority publish (< 1s SLA) | $0.05 | Time-sensitive agents |

50 agents deploying 100 apps/day at $0.02 = **$3,000/month**. Fully autonomous. No human customers to support.

---

# Part 2: Technical Spec

## What It Is

A lightweight HTTP proxy that sits in front of your Convex publish endpoint, adding metered billing so AI agents can pay autonomously per deployment. Built as Convex HTTP actions — no new servers, no new hosting, no new dependencies beyond Viem for on-chain reads.

---

## Architecture

```
Agent
  │
  ▼
POST /publish  (billing proxy — Convex HTTP action)
  │
  ├── validate API key
  ├── check prepaid credit (Convex) or verify txHash (Base via Viem)
  ├── deduct credit / return 402
  │
  ▼
Convex publish endpoint  (existing pages table)
  │
  ▼
Live URL returned to agent
```

The proxy holds your Convex `PUBLISH_SECRET`. Agents never see it. Agents only interact with the proxy via their API key.

---

## How It Works End to End

```
1. Agent calls POST /register with its wallet address
   → receives an API key (nv_xxxx)

2. Agent calls POST /publish with slug + html + apiKey
   → proxy checks prepaid credit balance in Convex

3a. Prepaid credit sufficient:
    → deduct $0.02 from credit balance in Convex
    → forward html to Convex with PUBLISH_SECRET
    → record usage
    → return live URL

3b. Credit insufficient, no txHash:
    → return 402 with payment address + amount
    → agent sends USDC to your address on Base (~$0.001 gas)
    → agent retries POST /publish with txHash
    → proxy verifies tx on Base blockchain
    → credit account with verified amount
    → deduct $0.02 from credit
    → forward to Convex
    → return live URL

3c. Credit insufficient, txHash included:
    → verify tx, credit account, deduct, publish (same as 3b retry)
```

The agent never needs a human to top it up. It earns USDC doing tasks, spends USDC deploying. Fully closed loop.

---

## Endpoints

### POST /register

Agent registers itself and gets an API key tied to its wallet address. No email. No human.

**Request:**
```json
{
  "walletAddress": "0x..."
}
```

**Response:**
```json
{
  "apiKey": "nv_xxxx",
  "walletAddress": "0x...",
  "createdAt": "2026-02-22T00:00:00Z"
}
```

---

### POST /publish

The main endpoint agents call to deploy an app.

**Request:**
```json
{
  "slug": "my-app",
  "html": "<html>...</html>",
  "apiKey": "nv_xxxx"
}
```

**Response — success (200):**
```json
{
  "url": "https://your-site.convex.site/app/my-app",
  "charged": "0.02",
  "creditRemaining": "1.48"
}
```

**Response — insufficient balance (402):**
```json
{
  "error": "insufficient_balance",
  "paymentAddress": "0x...",
  "amount": "0.02",
  "token": "USDC",
  "chain": "base",
  "retryWith": "txHash"
}
```

**Retry after payment — add txHash to original request:**
```json
{
  "slug": "my-app",
  "html": "<html>...</html>",
  "apiKey": "nv_xxxx",
  "txHash": "0x..."
}
```

---

### POST /balance

Returns prepaid credit balance and on-chain USDC balance for the key's wallet. Uses POST with apiKey in body to avoid leaking keys in URLs/logs.

**Request:**
```json
{
  "apiKey": "nv_xxxx"
}
```

**Response:**
```json
{
  "walletAddress": "0x...",
  "credit": "1.48",
  "onChainBalance": "5.00",
  "token": "USDC",
  "chain": "base"
}
```

---

### POST /usage

Returns usage history for an API key. Uses POST with apiKey in body to avoid leaking keys in URLs/logs.

**Request:**
```json
{
  "apiKey": "nv_xxxx"
}
```

**Response:**
```json
{
  "publishes": [
    {
      "slug": "my-app",
      "liveUrl": "https://your-site.convex.site/app/my-app",
      "cost": "0.02",
      "txHash": "0x...",
      "timestamp": "2026-02-22T00:00:00Z"
    }
  ],
  "totalSpent": "0.42",
  "totalPublishes": 21
}
```

---

### DELETE /publish

Removes a published page. Only the key that published the slug can delete it.

**Request:**
```json
{
  "slug": "my-app",
  "apiKey": "nv_xxxx"
}
```

**Response:**
```json
{
  "deleted": "my-app",
  "creditRemaining": "1.48"
}
```

---

### GET /.well-known/x402.json

Machine-readable payment terms. Agents autodiscover your payment requirements before making any calls.

```json
{
  "version": "1.0",
  "accepts": ["USDC/base"],
  "pricePerPublish": "0.02",
  "paymentAddress": "0x...",
  "chain": "base",
  "chainId": 8453,
  "register": "POST /register"
}
```

---

## Payment Flow Detail

```
Agent POSTs /publish with apiKey
  │
  ├── look up agentKey record by hashed apiKey
  │
  ├── has prepaid credit >= $0.02?
  │     YES → deduct $0.02 from credit balance in Convex
  │           forward html to Convex with PUBLISH_SECRET
  │           record usage in Convex
  │           return { url, charged, creditRemaining }
  │
  └── no credit?
        ├── txHash included in request?
        │     YES → verify txHash on Base via Viem
        │           confirm: recipient = your address
        │           confirm: amount >= $0.02
        │           confirm: token = USDC
        │           confirm: txHash not already used (double-spend check)
        │           credit account with verified amount
        │           deduct $0.02 from credit
        │           forward html to Convex
        │           return { url, charged, creditRemaining }
        │
        └── no txHash?
              return 402 {
                paymentAddress: YOUR_WALLET,
                amount: "0.02",
                token: "USDC",
                chain: "base"
              }

Agent sends USDC to your address on Base
Agent retries with txHash included → hits the txHash path above
```

---

## Pricing Model

| Action | Cost |
|---|---|
| Publish (new or update) | $0.02 USDC |
| Slug reservation (per day) | $0.001 USDC |
| Priority publish (< 1s SLA) | $0.05 USDC |

Prices are intentionally trivial for agents. An agent deploying 100 apps/day spends $2. You earn $60/month from that single agent.

---

## Data Model

Add to existing `convex/schema.ts`:

```typescript
agentKeys: defineTable({
  apiKey: v.string(),          // hashed — never stored plain
  walletAddress: v.string(),   // agent's wallet, source of truth for on-chain balance
  credit: v.string(),          // prepaid USDC credit balance (string to avoid float precision)
  createdAt: v.number(),
  lastUsedAt: v.optional(v.number()),
}),

usage: defineTable({
  keyId: v.id("agentKeys"),
  slug: v.string(),
  txHash: v.string(),
  cost: v.string(),            // USDC amount as string — avoid float precision issues
  timestamp: v.number(),
  liveUrl: v.string(),
}),
```

---

## Security Model

| Concern | How it's handled |
|---|---|
| PUBLISH_SECRET exposure | Never sent to agents. Proxy holds it server-side in Convex environment. |
| API key storage | Hashed before storage. Plain key returned only once at registration. |
| Slug namespace | Proxy-published slugs are prefixed with the agent's key hash: `a1b2c3/my-app`. Direct publishes (via PUBLISH_SECRET) use unprefixed slugs. No collision possible. Agents can only overwrite their own prefixed slugs. |
| Rate limiting | Max 10 publishes/minute per key. |
| Double-spend | txHash recorded on first use. Reuse rejected. |
| On-chain verification | Recipient, amount, and token all verified before forwarding to Convex. |

---

## Tech Stack

Everything runs inside your existing Convex deployment. No new servers.

| Layer | Technology |
|---|---|
| HTTP routing | Convex HTTP actions (raw — no framework) |
| Chain reads | Viem (Base mainnet) |
| USDC contract | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (Base) |
| Storage | Convex (existing instance) |
| Hosting | Convex HTTP actions (already running) |

---

## File Structure

```
convex/
  schema.ts          ← add agentKeys + usage tables
  http.ts            ← add /register, /publish, DELETE /publish, /balance, /usage routes
  billing.ts         ← new: payment verification logic (Viem)
  pages.ts           ← existing (unchanged)
  assets.ts          ← existing (unchanged)
  keys.ts            ← existing (unchanged)
  seed.ts            ← existing (unchanged)

.well-known/
  x402.json          ← served as static via Convex HTTP

llms.txt             ← updated with billing endpoint info
```

---

## Agent Discovery

Update `llms.txt` in the repo root so agents can autodiscover the service:

```
# no∅ Agent Deployment Rail
Endpoint: https://<your-deployment>.convex.site
Register: POST /register { walletAddress }
Deploy:   POST /publish { slug, html, apiKey }
Payment:  USDC on Base, $0.02/publish, x402 protocol
Docs:     GET /.well-known/x402.json
No human required.
```

---

## Build Order

1. **Schema** — add `agentKeys` and `usage` tables to `schema.ts`
2. **`/register`** — wallet → hashed API key, stored in Convex
3. **`/publish`** — key lookup, credit check, slug namespacing, forward to Convex
4. **402 flow** — return payment details, verify txHash on retry via Viem (includes Base RPC error handling, tx confirmation latency, reorg safety)
5. **`DELETE /publish`** — ownership check, page removal
6. **`/balance` and `/usage`** — read endpoints
7. **`x402.json`** and `llms.txt` update
8. **Rate limiting + slug namespace enforcement**

---

## What to Open Source

Everything in this repo:
- This spec
- All Convex backend code (`convex/` directory)
- The `seed.sh` setup script
- `llms.txt` and `x402.json` templates

Keep private:
- Your `.env.local` (gitignored already)
- Your wallet private key
- Your `PUBLISH_SECRET`

Your moat is the running instance and your wallet address being the known payment destination — not the code.

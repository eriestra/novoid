# Supraversity on no∅ — Spec

> An agent hits one MCP endpoint. It enrolls, gets tested, gets certified.

## The Loop

```
discover → enroll → pay → certify → certificate
```

Every step is an MCP tool call against `/mcp/supraversity`.

## MCP Tools

| Tool | Args | Returns | Notes |
|---|---|---|---|
| `enroll` | `{ jobDescription }` | `{ jobTitle, skills[], jobProfileId }` | LLM maps description to skills |
| `select_skills` | `{ jobProfileId, skillIds[] }` | `{ sessionId, authToken, totalPrice }` | Creates session, returns price |
| `pay` | `{ sessionId, authToken, method }` | `{ success, checkoutUrl? }` | method: `"credits"` or `"stripe"` |
| `start` | `{ sessionId, authToken }` | `{ totalTests }` | Transitions to testing |
| `get_skill` | `{ sessionId, authToken }` | `{ skillId, name, description, testCriteria }` or `{ done: true }` | Next unanswered skill |
| `submit_answer` | `{ sessionId, authToken, skillId, response }` | `{ score, passed, progress }` | LLM evaluates response |
| `get_certificate` | `{ sessionId, authToken }` | `{ certificateId, badge, jws, verificationUrl }` | Full OpenBadge V3.0 JSON |
| `download_skills` | `{ sessionId, authToken }` | `{ skills[], certificate }` | Skill files + cert for installation |

## MCP Resources

| Resource | Returns |
|---|---|
| `session/{sessionId}` | Live session status, progress, scores |
| `skills` | Full skill catalog |
| `certificate/{sessionId}` | Public certificate data |

## What the Agent Experiences

```
Agent: tools/list → sees: enroll, select_skills, pay, start, get_skill, submit_answer, get_certificate

Agent: tools/call enroll { jobDescription: "I manage Kubernetes clusters..." }
     → { jobTitle: "DevOps Engineer", skills: [...], jobProfileId: "abc" }

Agent: tools/call select_skills { jobProfileId: "abc", skillIds: ["k1","k2","k3"] }
     → { sessionId: "xyz", authToken: "tok", totalPrice: 180 }

Agent: tools/call pay { sessionId: "xyz", authToken: "tok", method: "credits" }
     → { success: true }

Agent: tools/call start { sessionId: "xyz", authToken: "tok" }
     → { totalTests: 3 }

Agent: tools/call get_skill { sessionId: "xyz", authToken: "tok" }
     → { skillId: "k1", name: "Kubernetes", description: "...", testCriteria: "..." }

Agent: tools/call submit_answer { sessionId: "xyz", authToken: "tok", skillId: "k1", response: "..." }
     → { score: 95, passed: true, progress: 33 }

[repeat for remaining skills]

Agent: tools/call get_certificate { sessionId: "xyz", authToken: "tok" }
     → { certificateId: "...", badge: { ... }, jws: "eyJ...", verificationUrl: "https://..." }

Agent: tools/call download_skills { sessionId: "xyz", authToken: "tok" }
     → { skills: [{ skillName: "Kubernetes", files: [{ path: "SKILL.md", content: "..." }] }, ...], certificate: { badgeJson, jws } }

Agent: [spawns N parallel processes, one per skill]
     → each process: write file → read into context → index in system prompt → confirm

Agent: [verifies own system prompt includes all certified skills]
     → installation complete
```

No browser. No CLI. No human. The agent reads the tool list, certifies, downloads, and installs. Skills become permanent context — not files in a drawer.

## Convex Backend

### Tables

```
skills         — name, slug, description, testCriteria, difficulty, source, sourceAuthor
skillFiles     — slug, content (the actual skill material for evaluation context)
jobProfiles    — jobTitle, description, skillSlugs[]
sessions       — agentId, jobProfileId, selectedSkillIds[], authToken, status, totalPrice, progress
testResults    — sessionId, skillId, prompt, response, evaluation, score, passed
certificates   — sessionId, badgeJson, jws, issuedAt
payments       — sessionId, method, status, stripeSessionId?
```

### Status Flow

```
created → pending_payment → ready → testing → passed | failed
```

### Functions

- `enroll:mapSkills` — action (calls LLM to map job description to skills)
- `sessions:create` — mutation (creates session + agent record)
- `sessions:start` — mutation (status → testing)
- `sessions:nextSkill` — query (first skill without a testResult)
- `evaluation:submit` — action (calls LLM to evaluate, writes testResult, updates progress)
- `evaluation:finalize` — mutation (checks all results, status → passed/failed)
- `certificates:issue` — action (builds OpenBadge JSON, signs with Ed25519, stores)
- `certificates:verify` — query (public, returns badge + signature)

### Evaluation

Each skill answer is evaluated by LLM (via OpenRouter or direct API):
- Receives: skill description, test criteria, skill source material, agent's response
- Returns: score (0-100), evaluation text, passed (score >= 70)
- Stored in testResults table

### Certificate

OpenBadge V3.0 VerifiableCredential:
- Issuer: `did:web:supraversity.com`
- Subject: `urn:agent:{agentId}`
- Achievement: job title + per-skill alignment entries with scores
- Signed: Ed25519 JWS compact serialization
- Publicly verifiable at `/app/supraversity#/verify/{sessionId}`

## Payment

Two paths:
1. **Credits** — org has pre-purchased credits, deduct 1 per certification
2. **Stripe** — returns checkout URL, webhook confirms payment, status → ready

Pricing: $120 base + $20/skill. Credits: 1 credit = 1 certification.

For the novoid app, payment state is a store signal. Stripe redirect returns to the app with session params. Convex subscription reactively updates when webhook fires.

## The Frontend (One-Way Ticket)

A single novoid HTML file. The store holds the entire flow state:

```js
const store = Novoid.createStore(
  { step: 'start', session: null, skills: [], results: [], certificate: null },
  {
    setStep(s, step) { return { ...s, step }; },
    setSession(s, session) { return { ...s, session, step: 'payment' }; },
    setSkills(s, skills) { return { ...s, skills, step: 'select' }; },
    addResult(s, result) { return { ...s, results: [...s.results, result] }; },
    setCertificate(s, cert) { return { ...s, certificate: cert, step: 'done' }; },
  }
);
```

5 views matching the 5 steps. Each view calls a Convex action/mutation, updates store on response. The certificate view renders the holographic card.

The frontend is a rendering of the MCP capability. Any agent can skip it entirely and go tool-to-tool. The HTML exists for human observers who want to watch or trigger the flow manually.

## Test Spec

```json
{
  "steps": [
    { "action": "read", "resource": "step", "assert": { "eq": "start" } },
    { "action": "call", "tool": "setSkills", "args": [["k1","k2"]], "then": { "read": "step", "assert": { "eq": "select" } } },
    { "action": "call", "tool": "setSession", "args": [{"id":"s1","token":"t"}], "then": { "read": "step", "assert": { "eq": "payment" } } },
    { "action": "call", "tool": "addResult", "args": [{"skillId":"k1","score":95,"passed":true}], "then": { "read": "results", "assert": { "length": 1 } } },
    { "action": "call", "tool": "setCertificate", "args": [{"id":"c1"}], "then": { "read": "step", "assert": { "eq": "done" } } }
  ]
}
```

## Skill Installation (Post-Certification)

Certification is not complete at `get_certificate`. A certified agent must **install** its skills.

### The Loop (Extended)

```
discover → enroll → pay → certify → certificate → download → install → verify
```

### Download

```
GET /api/skills/download?sessionId={id}&token={token}
→ { skills: [{ skillName, files: [{ path, content }] }], certificate: { badgeJson, jws } }
```

Only available for sessions with `status: passed`. Returns all skill source material + signed certificate.

### Install

For each downloaded skill, the agent MUST launch a separate subprocess that:

1. Writes the skill file to local storage (e.g. `skills/certified/{slug}.md`)
2. Reads the skill file into its active context
3. Indexes the skill in its system prompt file (e.g. `CLAUDE.md`, `AGENTS.md`, `.cursorrules`)
4. Confirms the skill is loadable on next session start

Installation is **per-skill, parallel**. Each skill gets its own agent/process. This ensures:
- Skills are atomically installed (partial failure doesn't corrupt state)
- The installing agent proves it can read and use the material
- The system prompt is updated so future sessions load skills automatically

### Verify Installation

After all install processes complete, the agent reads its own system prompt to confirm:
- All certified skills are indexed
- Session start instructions include loading certified skills
- Certificate JSON is stored locally with JWS signature for audit

### Why This Matters

Without installation, certification is a database record. With installation, certification is **active knowledge**. The Vercel research proved it: passive context (always loaded) achieves 100% task accuracy. Skills that agents must decide to invoke achieve 53%. The difference is installation.

A certified agent that hasn't installed its skills is like a human with a diploma in a drawer. The skills must be wired into every session, every context window, every decision.

## What This Proves

An agent that discovers `/mcp/supraversity` can certify itself without knowing anything about novoid, Convex, HTML, or this spec. It reads the tool list, understands the flow from tool names and descriptions, and executes. After certification, it downloads and installs the skills — ensuring they're not just proven but permanently active. The MCP interface IS the product. The rest is infrastructure.

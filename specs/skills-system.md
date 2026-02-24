# Nex Self-Upgrading Skills — Spec

> Nex learns from failure, certifies itself, and gets better with every session. No human in the loop.

## The Problem

OpenClaw had a primitive self-upgrading loop: encounter a failure → learn from it → update internal rules → retry. It worked, but it was **unstructured** — lessons lived as scattered prompt patches, couldn't be shared between agents, and degraded as context grew.

Nex already has the pieces to do this properly:
- **Skills** — codified, compressed, always-in-context knowledge files
- **Supraversity** — certification + skill download via MCP
- **Nous + novoid-browser** — verification that proves competence, not just claims it
- **Personas** — distinct skill loadouts per agent role (builder, architect, devops, analyst, mentor, certifier)
- **Heartbeat pipeline** — autonomous scheduled execution with approval gates
- **Surgeon concurrency** — can interrupt a build to self-certify when a gap is detected

What's missing is the **loop** — the agentic behavior that connects failure → learning → skill acquisition → verified improvement, all running inside Nex's existing job system.

## Why This Is a Nex Feature

Self-upgrading isn't a platform capability. It's an **agent behavior**. The platform provides the infrastructure (Supraversity, Nous, skills directory). The agent decides when to learn, what to learn, and whether the learning worked.

This means:
- The upgrade loop runs as **Nex jobs** — same lifecycle as any other task (`pending → claimed → building → completed`)
- Diagnosis happens in the **active persona's context** — a builder failing at CSS triggers different learning than an architect failing at schema design
- Approval gates use Nex's **existing Telegram integration** — "I found a skill gap in Convex realtime. Certify now?"
- Skill state is tracked **per-agent** in Convex — Nex and Vox can have different skill profiles
- The heartbeat pipeline runs **periodic skill audits** — Nex checks for new skills on its own schedule

An external orchestrator can't do this. Only the agent that failed knows what it was trying to do and why. Self-upgrading is self-awareness operationalized.

## The Loop

```
act → fail → diagnose → acquire → install → verify → act (better)
```

Every step is a Nex job or sub-operation:

| Step | What Happens | Nex Mechanism |
|---|---|---|
| **act** | Nex attempts a user task (build app, answer question, run pipeline) | Normal job execution |
| **fail** | Task produces errors, unsound cert, or test failures | Sentinel errors, Nous, novoid-browser |
| **diagnose** | Active persona identifies which skill gap caused the failure | LLM self-reflection against persona's skill profile |
| **acquire** | Nex calls Supraversity MCP to certify on the missing skill | Surgeon model — interrupts current work if gap is critical |
| **install** | Skill file written to `skills/certified/`, indexed in system prompt | File write + CLAUDE.md/AGENTS.md update |
| **verify** | Nex re-runs the original task and passes | Same job, fresh attempt |
| **act (better)** | Future sessions start with the skill pre-loaded | Passive context = 100% accuracy |

### How It Fits the Job System

```
User: "Build me a real-time dashboard"

Job 1 (building): Nex attempts dashboard → Convex subscription fails → job fails
  └─ Diagnosis: "Missing convex-realtime skill"

Job 2 (building): Nex calls /mcp/supraversity → enroll → certify → download → install
  └─ Skill installed: skills/certified/convex-realtime.md
  └─ Telegram: "Certified on Convex Realtime. Retrying your dashboard."

Job 3 (building): Nex retries dashboard with convex-realtime in context → succeeds
  └─ Telegram: "Dashboard live at /app/dashboard"
```

Three jobs. Zero human intervention. The user asked for a dashboard and got a smarter agent as a side effect.

## Diagnosis Engine

The key innovation over OpenClaw: failure diagnosis is **structured, not ad-hoc**, and it runs in the context of the active persona.

### Failure Taxonomy

```
failure
├── structural    → Nous morphe (bad HTML tree, missing accessibility)
├── layout        → Nous thesis (cascade conflicts, overflow, breakpoint issues)
├── reactivity    → Nous kinesis (dead signals, cycles, state deadlocks)
├── runtime       → novoid-browser (JS errors, assertion failures)
├── publishing    → publish.sh (verification gate, seed errors)
└── integration   → Convex (schema mismatch, auth errors, query failures)
```

Each failure category maps to skills:

| Failure Category | Relevant Skills |
|---|---|
| structural | novoid-core, novoid-render, novoid-css |
| layout | novoid-css |
| reactivity | novoid-core |
| runtime | novoid-core, novoid-render |
| publishing | novoid-publishing, novoid-verification |
| integration | convex-functions, convex-schema-validator, convex-best-practices, convex-realtime |

### Diagnosis Prompt (runs inside Nex's persona context)

```
You are Nex ({persona}). A task just failed.

Failure output:
  {error output / unsound certificate / test failure}

Your current skill profile:
  {persona's loaded skills}

1. Which skill gap most likely caused this failure?
2. Is the relevant skill in your profile? If yes → misapplication, re-read and retry.
3. If NOT in your profile → which Supraversity skill fills the gap?
4. Is this a novel failure that needs a new learned skill?

Respond with: RETRY (re-read skill section X), CERTIFY (skill slug), or LEARN (proposed pattern).
```

Three outcomes:
- **RETRY** → re-read specific skill section, retry same job
- **CERTIFY** → spawn certification job, then retry
- **LEARN** → create learned skill proposal, retry with provisional knowledge

## Persona Skill Profiles

Each Nex persona has a defined skill loadout. When Nex swaps persona, it loads that persona's skills and unloads others — keeping the context window tight.

```
builder    → novoid-core, novoid-render, novoid-css
architect  → novoid-convex, convex-schema-validator, convex-best-practices
devops     → novoid-publishing, novoid-verification, convex-functions
analyst    → novoid-convex, convex-realtime, convex-agents
mentor     → all core skills (read-only guidance)
certifier  → supraversity skills (administers tests to other agents)
```

A persona can **grow** its profile through certification. When the builder persona certifies on `convex-realtime`, that skill permanently joins the builder profile. The persona evolves.

## Skill Lifecycle

### 1. Core Skills (framework-maintained)

```
skills/novoid-*.md
```

Baseline. Every Nex session starts with the core skills for the active persona.

### 2. Certified Skills (acquired via Supraversity)

```
skills/certified/*.md
```

Downloaded after passing certification. Nex triggers this autonomously or on user command.

### 3. Learned Skills (agent-generated)

```
skills/learned/*.md
```

Created by Nex from repeated failure patterns. These are **provisional** — they don't enter `certified/` until validated.

#### Learned Skill Format

```markdown
---
name: [slug]
source: learned
persona: [which persona learned this]
learnedFrom: [failure context — job ID, error type]
confidence: low
validatedBy: null
createdAt: [ISO timestamp]
---

# [Title]

## What I Learned
[Concise description of the pattern/fix]

## When It Applies
[Trigger conditions]

## The Fix
[Concrete code pattern or approach]

## Evidence
- Failure: [original error]
- Fix: [what worked]
- Jobs: [job IDs showing before/after]
```

#### Promotion Path

```
learned (low confidence)
  → validated by Nous/browser on 3+ successful uses (medium)
  → validated by Supraversity certification (high)
  → promoted to skills/certified/
  → learned file deleted
```

## Self-Upgrade Triggers

### Automatic (Nex decides)

1. **Post-failure diagnosis** — after any failed job, Nex diagnoses and acts
2. **Heartbeat skill audit** — periodic check against Supraversity catalog
3. **Competence gap on intake** — Nex classifies incoming task, detects missing skill before attempting

### Approval-gated (via Telegram)

4. **Learned skill promotion** — "I've used this pattern 5 times successfully. Promote to certified?"
5. **Expensive certification** — "This certification costs credits. Proceed?"
6. **Skill deprecation** — "Skill X contradicts newer version Y. Replace?"

### Human-directed

7. **Explicit command** — user tells Nex "go certify yourself on X"
8. **Persona reconfiguration** — user adjusts a persona's skill profile

## Heartbeat Integration

Add to Nex's default heartbeat checklist:

```json
[
  {
    "id": "skill-audit",
    "text": "Check Supraversity catalog for new/updated skills matching my personas",
    "enabled": true,
    "order": 99
  },
  {
    "id": "skill-health",
    "text": "Review failure/success ratios per skill area. Flag degrading skills.",
    "enabled": true,
    "order": 100
  }
]
```

The audit step:
1. Queries Supraversity `/mcp/supraversity` skill catalog
2. Compares against locally installed `skills/certified/`
3. For each persona, identifies gaps and updates
4. If gaps found → "Ask for approval via Telegram" (next checklist step)
5. On approval → spawns certification jobs (one per skill)
6. Reports results: "Certified on 2 new skills: convex-realtime, convex-agents"

## Convex Backend

### New Table

```typescript
agent_skills: defineTable({
  agentId: v.string(),              // "nex", "vox", or session-specific ID
  persona: v.optional(v.string()),  // "builder", "architect", etc.
  skillSlug: v.string(),            // "novoid-core", "convex-agents"
  source: v.string(),               // "core" | "certified" | "learned"
  confidence: v.string(),           // "low" | "medium" | "high"
  certSessionId: v.optional(v.string()),
  installedAt: v.number(),
  lastUsedAt: v.optional(v.number()),
  failureCount: v.number(),
  successCount: v.number(),
})
  .index("by_agent", ["agentId"])
  .index("by_agent_persona", ["agentId", "persona"])
  .index("by_agent_skill", ["agentId", "skillSlug"])
```

### New Functions

| Function | Type | Purpose |
|---|---|---|
| `agentSkills:list` | query | List skills for an agent (optionally filtered by persona) |
| `agentSkills:install` | mutation | Record skill installation |
| `agentSkills:recordOutcome` | mutation | Increment success/failure counters |
| `agentSkills:audit` | action | Compare local skills vs Supraversity catalog, return gaps |
| `agentSkills:propose` | mutation | Store a learned skill proposal |
| `agentSkills:promote` | mutation | Move learned → certified, update confidence |
| `agentSkills:profileFor` | query | Return full skill profile for a persona |

### Integration with nex-watch.js

```
nex-watch claims job
  → Claude CLI runs with persona's skill profile loaded
  → if job fails:
    → diagnosis runs (LLM call)
    → if CERTIFY: queue new certification job
    → if RETRY: re-run with skill re-read
    → if LEARN: write learned skill, queue retry job
  → if job succeeds:
    → agentSkills:recordOutcome (success) for all skills used
```

## Skill Versioning

```yaml
---
version: 1.2.0
updatedAt: 2026-02-19
---
```

On audit, Nex compares local `version` vs catalog `version`. Newer → re-certify → replace file. No migration, no backward compat. Skills are small and complete — new version replaces old.

## What This Replaces from OpenClaw

| OpenClaw | Nex |
|---|---|
| Ad-hoc prompt patches | Learned skills (structured, persona-tagged) |
| Invisible failure memory | `agent_skills` table with per-job outcome tracking |
| "I'll remember that" | Skills in passive context = automatic recall |
| Manual capability extension | Supraversity certification triggered by diagnosis |
| Single persona | Per-persona skill profiles that evolve independently |
| Unverified self-claims | Nous/browser validation + Supraversity certification |
| One-off learning | Heartbeat audit = continuous improvement on schedule |

## Implementation Priority

### Phase 1: Diagnosis (2-3 days)

1. Failure taxonomy → skill mapping table
2. Diagnosis prompt integrated into nex-watch.js post-failure flow
3. `agent_skills` table + install/recordOutcome mutations
4. Error output surfaces skill gap suggestions

### Phase 2: Automatic Certification (3-5 days)

5. Diagnosis CERTIFY → auto-trigger Supraversity flow as Nex job
6. Skill download → file write → CLAUDE.md index update
7. Auto-retry original job after skill installation
8. Telegram notifications for certification events

### Phase 3: Learned Skills (3-5 days)

9. `skills/learned/` directory + format
10. Diagnosis LEARN → create learned skill from failure pattern
11. Confidence tracking (low → medium after 3 Nous/browser validations)
12. Promotion pipeline (medium → high via Supraversity, then move to certified/)

### Phase 4: Heartbeat + Ecosystem (2-3 days)

13. Skill audit heartbeat step
14. Skill health monitoring (degrading success rates → re-certify)
15. Per-persona skill profiles in Convex
16. Cross-persona skill recommendations

## One-Line Summary

**OpenClaw learned by accident. Nex learns by certification — structured, verified, autonomous, permanent.**

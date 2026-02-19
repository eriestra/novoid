# novoid-agents

Codified knowledge for the no∅ agent system — Nex, Vox, personas, memory, multi-channel, inline apps.

Nex is the primary user-facing agent, replacing OpenClaw as the main interaction layer. It handles multi-channel chat (web + Telegram), memory, personas, inline app generation, and autonomous heartbeat pipelines. Vox is a proposal-based app builder for vibe-coded development — describe what you want in natural language and Vox generates, verifies, and publishes a full novoid app.

## Nex Architecture

`nex-watch.js` — local worker that polls Convex for jobs, spawns Claude CLI to handle them.

```
User message → Convex job (pending) → nex-watch claims → Claude CLI → response stored → user sees reply
```

### Job Lifecycle
`pending` → `claimed` → `building` → `completed` | `failed`

### Concurrency: Surgeon Model
- Quick questions can interrupt long-running builds
- Priority classification on incoming messages
- Queue-based: high-priority jobs preempt lower ones

---

## Vox Voice Builder

Vox is a canvas capability of Nex — generates and publishes no∅ apps from natural language.

- Published at `/app/vox`, served at `/vox`
- Same job lifecycle as Nex
- Output: full no∅ HTML apps

### Unified Canvas

All generated apps appear in the same canvas regardless of origin (Nex chat, Vox voice, inline-promoted). No split by generator — `origin` is metadata, not a filter boundary.

### Canvas Deletion

All canvas apps are deletable — both canvas-only entries and published pages. Deleting removes the `nex_canvas` record AND the published page from the `pages` table.

**Protected slugs:** `nex`, `vox`, `novoid` cannot be deleted (mutation rejects). These are also locked in `publish.sh` (require `--force` to republish).

---

## Inline Apps

Nex can respond with embedded no∅ apps inside chat messages.

### Format
```
---app---
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="https://site.convex.site/css/core.min.css">
  <script src="https://site.convex.site/js/core.min.js"><\/script>
</head>
<body>
  <div id="app"></div>
  <script>
    // full no∅ app code
  <\/script>
</body>
</html>
---/app---
```

### Rules
1. **Use absolute URLs for framework assets.** Inline apps render in sandboxed iframes with `srcdoc` — no base URL context.
2. **Auto-sizing.** ResizeObserver + postMessage adjusts iframe height.
3. **Introspectable.** Agent can use novoid-browser on inline app HTML.
4. **Hybrid inline apps.** When an inline app needs both custom visuals and data-driven sections (forms, tables), use the hybrid pattern: h() shell for layout + `Novoid.render()` for interactive sections. See `novoid-render.md` § Hybrid Apps.

---

## Memory System

Hybrid RAG: vector embeddings (OpenAI) + keyword matching.

| Type | Scope | Lifecycle |
|---|---|---|
| Short-term | Current conversation | Auto-stored per exchange |
| Long-term | Cross-conversation | Promoted from short-term |

### Behavior
- Memories tagged with active agent persona
- Recall by relevance, filtered by agent context
- Search combines vector similarity + keyword matching

---

## Agent Personas

Defined in `.claude/agents/` — each persona has:
- System prompt
- Available tools
- Memory scope
- Certified skills (Supraversity integration)

### Swap Mechanism
```
Classify intent → Pick persona → Load config → Execute → Tag memory with persona
```

### Built-in Personas
`builder`, `architect`, `devops`, `analyst`, `mentor`, `certifier`

---

## Heartbeat Pipeline

Proactive autonomous operation — Nex wakes on schedule to execute a structured checklist.

### Data Format
Stored in `nex_heartbeat.checklist` as JSON string:
```json
[
  { "id": "a1b2", "text": "Check memory for pending work", "enabled": true, "order": 0 },
  { "id": "c3d4", "text": "Ask for approval via Telegram", "enabled": true, "order": 1 }
]
```
Legacy plain-text checklists auto-convert on load.

### Pipeline Execution
Steps run sequentially — each step's output feeds as context to the next:
```
Step 1 → result₁ → Step 2 (with context: result₁) → result₂ → Step 3 (with context: result₁ + result₂)
```

### Approval Gates
Steps containing approval keywords (`approve`, `confirm`, `permission`, `authorize`, `green light`) are detected as **approval gates**. When hit:
1. Pipeline **pauses** and saves state (step index + accumulated context)
2. Sends approval request to Telegram via `queueApproval` with inline keyboard
3. Current job completes with "⏸ Paused — awaiting approval"
4. When user approves via Telegram callback → new heartbeat job resumes pipeline from next step with full context
5. When user denies → pipeline stays paused (no resume job created)

Pipeline state is serialized as `__PIPELINE_RESUME__:{json}` at the end of the approval prompt. The approval callback handler detects this marker and creates a heartbeat resume job instead of a generic chat follow-up.

### Model Routing
- **Sonnet 4.6** — default for conversational steps (check, look, pick, review)
- **Opus 4.6** — auto-selected when step text matches: `implement|build|generate|create|refactor|deploy|code|develop|telegram|send|notify|message`

### Capabilities Injection
Before execution, the pipeline queries active channels and injects capability instructions:
- If Telegram is configured, steps get: `node nex-telegram.mjs "message"`
- No new channels are created — existing active channels are reused

### Telegram Helper
`nex-telegram.mjs` — pre-built script to send messages through the active Telegram channel:
```sh
node nex-telegram.mjs "Your message here"
```
Reads `.env.local` for credentials, queries active channels, queues a channel job.

### Telegram Formatting
`toTelegramFormat()` converts markdown to Telegram-friendly text before sending:
- Tables → `cell · cell · cell` inline format
- `###` headers → 📦 prefix, `##`/`#` → 📋 prefix
- Strips table separator rows
- Keeps `**bold**` and `` `code` `` (Telegram supports these)

### UI (HeartbeatView in nex.html)
- Structured item list with checkbox toggle, up/down reorder, delete
- Auto-saves on every mutation (add, toggle, delete, reorder) — no Save button
- Add item input with Enter key support and disabled + button when empty
- Recent Runs list shows which checklist item each job was for

---

## Multi-Channel Messaging

| Channel | Transport | Input |
|---|---|---|
| Web chat | Convex real-time (useQuery subscriptions) | Browser |
| Telegram | Webhook via Convex HTTP routes | Telegram bot |

Same job system, different input sources. Image support: photos stored in Convex, rendered inline.

---

## Commands

```sh
# Start the worker (requires Convex backend running)
npx convex dev  # in one terminal
node nex-watch.js  # in another

# Job system is Convex-backed — no local state
```

---

## Conventions

1. Run `npx convex dev` before starting nex-watch.
2. Inline apps use absolute URLs — iframes with `srcdoc` have no base URL.
3. Tag memories with the active persona for filtered recall.
4. Long-running jobs are interruptible via the surgeon model.
5. `'</' + 'script>'` in JS strings inside inline apps (HTML parser limitation).

# novoid-agents

Codified knowledge for the no∅ agent system — Nex, Vox, personas, memory, multi-channel, inline apps.

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

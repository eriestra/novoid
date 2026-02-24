# novoid-agents

Codified knowledge for the no∅ agent system — Nex, Vox, personas, memory, multi-channel, inline apps.

Nex is the primary user-facing agent, replacing OpenClaw as the main interaction layer. It handles multi-channel chat (web + Telegram), memory, personas, inline app generation, and autonomous heartbeat pipelines. Vox is a proposal-based app builder for vibe-coded development — describe what you want in natural language and Vox generates, verifies, and publishes a full novoid app.

## Nex Architecture

`nex-watch.js` — local worker that polls Convex for jobs, spawns Claude CLI to handle them.

```
User message → Convex job (pending) → nex-watch claims → Claude CLI → response stored → user sees reply
```

# novoid-agents

Codified knowledge for the no∅ agent system — Nex, Vox, personas, memory, multi-channel, inline apps.

## 1. Core Architecture
- **Nex:** The primary chat agent (handles user queries, memory, heartbeat pipelines).
- **Vox:** Visual app-builder canvas. Generates full HTML apps based on prompts.
Both run locally via `nex-watch.js`, which polls Convex for pending jobs and spawns the Claude CLI to resolve them.

### Running the System
```sh
npx convex dev  # Terminal 1: run the backend
node nex-watch.js # Terminal 2: run the agent worker
```

## 2. Inline Apps (Rendering UI in Chat)
Nex can respond with interactive no∅ apps embedded directly in the chat using iframes.

```html
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
    // Your no∅ app code here.
    // Remember to escape closing script tags: '<\/script>'
  <\/script>
</body>
</html>
---/app---
```
**Rules for Inline Apps:**
- Use **absolute URLs** for all assets (the iframe has no base URL).
- For data-driven apps, use `Novoid.render()`.
- The iframe auto-resizes to fit content.

## 3. The Heartbeat Pipeline
Nex can run background tasks autonomously on a schedule.
- Tasks are stored in `nex_heartbeat.checklist` (array of JSON objects).
- Steps execute sequentially, passing context to the next step.

### Approval Gates
If a heartbeat step text contains keywords like `approve`, `confirm`, `permission`, or `authorize`:
1. The pipeline pauses.
2. An interactive message is sent to Telegram via `nex-telegram.mjs`.
3. If the user clicks approve, a resume job is created.

```sh
# Sending manual messages via the Telegram helper:
node nex-telegram.mjs "Your message here"
```

## 4. Agent Personas
Personas live in `.claude/agents/` and define:
- System prompt
- Available tools
- Memory scope
 Nex classifies intent and hot-swaps personas behind the scenes (e.g., swapping to the `builder` persona when asked to code).

## 5. Wallet Integration (AgentKit)
Nex supports an autonomous Coinbase CDP wallet. 
- Keys live in the DB: `CDP_API_KEY_NAME_<orgId>` and `CDP_API_KEY_PRIVATE_<orgId>`.
- Allows sending, receiving, and trading crypto natively on Base L2.
- Spending limits (`maxPerTx`, `dailyLimit`) act as autonomous guardrails instead of requiring manual approval for every transaction.

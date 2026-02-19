# Nex & Vox Ecosystem

## Nex — Primary User-Facing Agent

Nex replaces OpenClaw as the main interaction layer for novoid. It is a multi-channel AI agent (web + Telegram) with:

- Hybrid RAG memory (vector embeddings + keyword matching)
- Persona system (builder, architect, devops, analyst, mentor, certifier)
- Inline app generation (sandboxed iframes with full novoid apps)
- Heartbeat pipeline with approval gates (Telegram callbacks)
- Surgeon concurrency model (quick questions interrupt long builds)

Published at `/app/nex`. Worker: `nex-watch.js`.

## Vox — Vibe-Coded App Builder

Vox is a canvas capability of Nex that generates and publishes novoid apps from natural language descriptions.

- Proposal-based workflow: review before it ships
- Uses the same 4-phase verification pipeline as manual publishes
- Output: full novoid HTML apps, live URLs
- Published at `/app/vox`

## Role in the Ecosystem

Nex and Vox are first-party novoid apps — they use the same reactive core, Convex platform, publish pipeline, and MCP endpoints as any other novoid app. They are the proof that the framework works for agents: self-hosting agents that build self-hosting apps.

## What Was Updated

- `src/app/novoid.html` — Landing page: 4th pillar card + Ecosystem section. Platform page: Agent Ecosystem section + table rows for notes/nex_heartbeat.
- `skills/novoid-agents.md` — Summary paragraph positioning Nex as OpenClaw replacement, Vox as vibe-coded builder.
- `CLAUDE.md` — Skill index description updated.
- `specs/nex-vox-ecosystem.md` — This file.

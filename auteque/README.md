# auteque

A vertical example for **no∅ (novoid)** that ships a curated audio library with a *Meaning Timeline* — a visual map of meaning over time so listeners navigate by meaning, not by minute.

## Layout

```
auteque/
  spec.md              — Meaning Timeline feature spec (draft v1)
  demo/
    audioteca.html     — novoid app: EVE Museografía audioteca (Spanish, 8 tracks)
    audioteca.test.json
  scripts/
    gen-audioteca.mjs  — ElevenLabs TTS → Convex storage for the demo tracks
```

## Live demo

- App: https://secret-aardvark-418.convex.site/app/audioteca
- MCP: https://secret-aardvark-418.convex.site/mcp/audioteca

## Workflow

```sh
# Publish the demo (from repo root)
sh publish.sh audioteca auteque/demo/audioteca.html

# Regenerate TTS tracks (idempotent — skips cached files in Convex storage)
node auteque/scripts/gen-audioteca.mjs
```

The gen script reads `ELEVENLABS_API_KEY`, `CONVEX_URL`, and `PUBLISH_SECRET` from `.env.local` at the repo root.

## Status

The current demo is a player only. The Meaning Timeline (`spec.md`) is not yet wired in. Next step: prototype the plot rendering on a single track to validate the synergy halo and the 6-curve readability.

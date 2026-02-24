# novoid-improve

Meta-skill for maintaining system consistency. When expanding any no∅ feature, follow this checklist.

# novoid-improve

Meta-skill for maintaining system consistency. When expanding any no∅ feature, follow this checklist.

## 1. Feature Expansion Checklist
Every feature change touches multiple surfaces. Work through each applicable item:

- Update Source Code (`src/core.js`, `convex/`, `cdp/`, etc.)
- Update Agent Skills (`skills/*.md`) — **Skills replace reading source files.**
- Update Agent Configuration (`CLAUDE.md`, `AGENTS.md`)
- Update Documentation (`README.md`, human-facing specs in `specs/`)
- Build & Deploy (`sh build.sh`, `sh seed.sh`, `sh publish.sh`)
- Check Agent SEO (`llms.txt`)

## 2. Consistency Rules
1. **Skills are source of truth for agents.** Any API change must update the corresponding skill first.
2. **Specs are source of truth for humans.** `spec.md` and `render.md` remain the canonical API reference for human readers.
3. **Skills and specs must agree.** If they diverge, the source code is the tiebreaker.
4. **Every app gets a test spec.** `<slug>.test.json` next to `<slug>.html`.
5. **Every fix ends with publish.** Source → build → seed → publish.
6. **CLAUDE.md is the entry point.** It must reflect the current skills index and conventions.

# novoid-verification

Codified knowledge for the no∅ verification pipeline. This file replaces reading verify.sh source.

## 1. Verification Overview
`verify.sh` runs on Node — no Rust, no build, no install (beyond Nous's npm deps):
- **Phase 1: Nous (static analysis)** — Checks DOM structure, CSS cascade conflicts, and Reactive DAG safety (e.g. cycles, dead signals).
- **Phase 2: headless browse (empirical)** — `test-runner/novoid-test.mjs --browse` runs the app headlessly (Node `vm` + reused DOM/Convex/observer shims), synthesizes the app schema (state/actions/entities), and surfaces runtime errors.
- **Phase 3: test spec (behavioral)** — `test-runner/novoid-test.mjs --test` executes `<slug>.test.json` against the app's store.

## 2. Running Verification
To verify an app manually (this also runs automatically during `publish.sh`):

```sh
sh verify.sh src/app/<slug>.html
```

You can bypass verification using `--skip-check`, but **only for confirmed false positives**:
```sh
sh publish.sh bloox src/app/bloox.html --skip-check
```

## 3. Using the runner directly
Run browse (schema introspection) or test (behavioral spec) yourself:

```sh
# Introspect the synthesized schema (state/actions/entities/errors)
node test-runner/novoid-test.mjs --browse src/app/counter.html

# Run a test spec (human-readable box view)
node test-runner/novoid-test.mjs --test src/app/counter.test.json src/app/counter.html --peek

# Seed Convex query data for apps relying on a backend
node test-runner/novoid-test.mjs --browse src/app/dashboard.html --seed 'tasks:list' '[{"id":"1","text":"Test"}]'
```

Assertions on state live in the `.test.json` spec (read/call/push), not ad-hoc CLI flags.

## 4. Test Specs
Always generate `<slug>.test.json` alongside every app. These specs are executed automatically during publishing. They allow you to test how actions mutate the store's state.

```json
{
  "seed": { "tasks:list": [{"id": "1", "text": "Buy milk"}] },
  "steps": [
    { "action": "read", "resource": "count", "assert": { "eq": 0 } },
    { "action": "call", "tool": "inc", "then": { "read": "count", "assert": { "eq": 1 } } }
  ]
}
```

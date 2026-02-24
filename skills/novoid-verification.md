# novoid-verification

Codified knowledge for the no∅ verification pipeline. This file replaces reading verify.sh source and novoid-browser docs.

# novoid-verification

Codified knowledge for the no∅ verification pipeline.

## 1. Verification Overview
`verify.sh` runs two layers sequentially.
- **Phase 1: Nous (static analysis)** — Checks DOM structure, CSS cascade conflicts, and Reactive DAG safety (e.g. cycles, dead signals).
- **Phase 2: novoid-browser (empirical)** — Headless QuickJS execution of the app to validate state and test specs.

## 2. Running Verification
To verify an app manually (this also runs automatically during `publish.sh`):

```sh
sh verify.sh src/app/<slug>.html
```

You can bypass verification using `--skip-check`, but **only for confirmed false positives**:
```sh
sh publish.sh bloox src/app/bloox.html --skip-check
```

## 3. Using novoid-browser directly
You can use the headles browser to introspect state or call actions.

```sh
# Introspect state after execution
novoid-browser src/app/counter.html --peek

# Call a store action
novoid-browser src/app/counter.html --call inc

# Assert state after a call
novoid-browser src/app/counter.html --call addTask '"Buy milk"' --assert 'store_0.tasks.length > 0'

# Seed Convex query data (for apps relying on backend)
novoid-browser src/app/dashboard.html --seed 'tasks:list' '[{"id":"1","text":"Test"}]' --peek
```

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

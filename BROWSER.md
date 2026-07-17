# BROWSER.md — Qed (headless verifier)

> **The Rust `browser/` crate was retired.** Qed is now a pure-Node runner at
> **`test-runner/`** (zero dependencies: `node:vm` + the same DOM/Convex/observer
> shims the Rust host used). Same test DSL, same `BrowseSchema`, ~10× faster, and
> readable/patchable by agents. Full docs: **`test-runner/README.md`**.

Where Nous proves properties statically, Qed demonstrates them empirically:
it runs a no∅ app headlessly, synthesizes a schema (signals/stores/actions/
entities), catches runtime errors, and executes behavioral test specs.

## CLI

```sh
# Browse — synthesize the app schema (state/actions/entities/errors)
node test-runner/novoid-test.mjs --browse src/app/counter.html        # pretty JSON
node test-runner/novoid-test.mjs --browse src/app/counter.html -c      # compact (verify.sh)

# Test — run an MCP test spec
node test-runner/novoid-test.mjs --test src/app/counter.test.json src/app/counter.html --peek

# Seed Convex query data for backend-dependent apps
node test-runner/novoid-test.mjs --browse src/app/dashboard.html --seed 'tasks:list' '[{"id":"1"}]'
```

`verify.sh` invokes both automatically (phase 2 = browse, phase 3 = test).

## Test spec DSL

- **actions:** `read` (a resource), `call` (a store action = MCP tool), `push`
  (deliver Convex query data to live subscriptions)
- **assertions:** `eq`, `length`, `contains`, `matches`, `eq_path`
- **resource resolution:** named signal → `store_N` → a key in any store's state →
  dotted path → `novoid://<slug>/state/<key>`

```json
{
  "seed": { "tasks:list": [{ "id": "1", "text": "Buy milk" }] },
  "steps": [
    { "action": "read", "resource": "count", "assert": { "eq": 0 } },
    { "action": "call", "tool": "inc", "then": { "read": "count", "assert": { "eq": 1 } } }
  ]
}
```

## Testability rule

Apps must use `createStore` for logic that needs testing — store actions become
callable tools (and MCP tools). Raw signals wired to DOM handlers are not testable;
the runner calls named store actions, it does not simulate DOM clicks.

See `test-runner/README.md` for the `BrowseSchema` shape, fidelity results vs the
former Rust runner, and migration notes.

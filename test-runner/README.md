# no∅ test-runner (pure JS)

A zero-dependency, pure-JavaScript replacement for the Rust `novoid-browser --test`
phase of `verify.sh`. It runs a `.test.json` spec against a no∅ app headlessly and
reports pass/fail — the same behavioral E2E rail, minus the human toolchain.

**Why this exists.** The Rust verifier (`browser/`, 2,072 lines, 19.5 MB debug
binary, 719 MB `target/`, needs `cargo`) is opaque to the agents that write no∅
apps — they can't read or patch it. But its logic is trivial: `read`/`call`/`push`
over a store, plus four assertions. The *actual* harness (DOM polyfill, headless
Convex mock, store observer) was already JavaScript — the Rust just hosted it in
QuickJS. This runner keeps those shims verbatim and swaps QuickJS for Node's
built-in `vm`. The whole stack is now JS an agent can read **and** patch.

## Usage

```sh
node test-runner/novoid-test.mjs --test <spec.json> <app.html> \
     [--seed <ref> <json>]... [--hash <#/route>] [--peek|--compact]
```

- default output: pretty JSON report to stdout
- `--peek`: human box view to stderr (what `verify.sh` uses)
- `--compact`: single-line JSON
- exit code `0` = all steps passed, `1` = any failure / load error

`verify.sh` phase 3 uses it automatically when `node` is present. Force a runner
with `NOVOID_TESTER=js` or `NOVOID_TESTER=rust`.

## What it depends on

Node ≥ 14 and three files, nothing else:

```
test-runner/
  novoid-test.mjs        # the runner (node:vm, node:fs, node:path only)
  shims/
    dom-polyfill.js      # copied verbatim from browser/js/ — the real harness
    convex-mock.js       #   "
    observer.js          #   "
```

No npm install, no build, no Rust. The shims are the single source of truth for
headless behavior; if the framework's DOM needs change, update them here.

## Test DSL (unchanged from the Rust runner)

```jsonc
{
  "seed": { "pages:list": [ ... ] },        // optional Convex query seeds
  "steps": [
    { "action": "read", "resource": "count", "assert": { "eq": 0 } },
    { "action": "call", "tool": "increment",
      "then": { "read": "count", "assert": { "eq": 1 } } },
    { "action": "push", "query": "pages:list", "data": [ ... ],
      "then": { "read": "items", "assert": { "length": 3 } } }
  ]
}
```

- **actions**: `read` (a resource), `call` (a store action = MCP tool), `push`
  (deliver Convex query data to live subscriptions)
- **resource resolution**: named signal → `store_N` → a key in any store's state →
  a dotted path into store state → `novoid://<slug>/state/<key>` URI
- **assertions**: `eq` (deep equal), `length` (array length), `contains`
  (array element / substring), `matches` (substring, `*` stripped), and
  **`eq_path`** (`{ "0.c1": "Alice" }` — deep-equal at dotted paths)

## Fidelity vs the Rust oracle

Validated across all 22 committed flat specs. Every spec compared to the Rust
binary produced the **identical verdict** — e.g. `c16asm` 11/11, `bloox` 110/110,
`chatgpt` 5/6, `gridbase` 25/25, `presenter-nav` 4/12 (same failing steps). It's
also faster: ~6 ms vs ~47 ms (no QuickJS/binary startup).

## Where it is *more* correct than the Rust runner

1. **`eq_path` is implemented.** The Rust `Assertion` struct has no `eq_path`
   field and doesn't `deny_unknown_fields`, so specs using `eq_path` (e.g.
   `editable-test.test.json`) **pass vacuously** — a silent false-green. This
   runner evaluates them, and immediately surfaced 3 assertions in
   `editable-test` that target a column (`c3`) removed earlier in the test and a
   stale positional index. Honest result: 49/52, not Rust's 52/52.
2. **Clear error on the nested-shape fork.** Specs using the aspirational nested
   `tests[]` / `snapshot` shape are not executable by either runner. The Rust
   version fails to deserialize with a generic serde error; this runner prints:
   *"test spec has no top-level 'steps' array — this spec uses the nested
   tests[]/snapshot shape, which is NOT executable."*
3. **Runaway-app guard.** An app with a `requestAnimationFrame` animation loop
   makes the (shared) DOM polyfill recurse synchronously. QuickJS hangs; this
   runner caps synchronous execution with `vm`'s `timeout` option
   (`NOVOID_TEST_TIMEOUT`, default 15 s) and fails gracefully.

## Known limitations (prototype)

- HTML is parsed with regex, not a full parser (`scraper` in Rust). Fine for the
  well-formed single-file no∅ apps in `src/app/`; unusual markup may need care.
- `matches` is substring containment (identical to the Rust behavior today), not
  true glob/regex.
- 2 corpus apps (`edutic-yeira-slides`, `labyrinth`) are rAF-loop / heavy apps not
  designed for store-level testing; both runners can't test them — this one times
  out cleanly instead of hanging.

## Migration path

Once this runner covers the E2E rail in practice, `browser/` (the Rust crate) can
be deleted: move `browser/js/*.js` here permanently (already copied), drop the
`cargo` build from session setup, and remove `novoid-browser` from `verify.sh`.
That deletes the last non-browser-native dependency in the toolchain.

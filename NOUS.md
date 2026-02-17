# Nous — Formal Verification Engine

> Static proof engine for no∅ apps. Proves correctness from structure, not observation.

**Status:** Implemented. Three pillars + cross-pillar analysis + sim engine. 87 tests passing. Integrated into publish workflow via `verify.sh`.

---

## Thesis

Nous treats HTML + CSS + JS as a formal system with provable properties. Instead of rendering and screenshotting, it proves layout feasibility, verifies reactive dataflow, checks interaction completeness, and detects security violations — all from source structure, before a single pixel renders.

---

## Architecture

```
                    ┌─────────────────────────────┐
                    │         Nous Engine          │
                    │                              │
  HTML + CSS + JS ──┤  ┌───────┐  ┌────────────┐  ├──→ Proof Report (JSON)
                    │  │ Parse │──│  Analyze    │  │
                    │  └───────┘  │             │  │
                    │             │  Pillar I   │  │
                    │             │  Pillar II  │  │
                    │             │  Pillar III │  │
                    │             │  Cross-cut  │  │
                    │             └────────────┘  │
                    └─────────────────────────────┘
```

Two modes: **Proof** (primary, static only) and **Sim** (secondary, embedded QuickJS via novoid-browser for Turing-complete paths).

---

## Three Pillars

| Pillar | Name | Domain | What it proves |
|---|---|---|---|
| I | **Morphe** (Structure) | HTML as formal tree | Structural contracts, selector coverage, accessibility completeness, reading order, semantic validity |
| II | **Thesis** (Presentation) | CSS as constraint system | Layout feasibility, breakpoint analysis, solution uniqueness, cascade conflicts, spacing anomalies |
| III | **Kinesis** (Behavior) | JS reactive patterns as dataflow graphs | Dataflow acyclicity, signal liveness, dead code, taint analysis, state machine completeness/liveness/safety |

### Morphe — property details

| Property | Method | Complexity |
|---|---|---|
| Structural contracts | Tree automaton membership | O(n) |
| Selector coverage | Selector-to-automaton intersection | O(n × s) |
| Accessibility completeness | Graph reachability on tab-order | O(n) |
| Reading order coherence | Tree traversal + heuristics | O(n) |
| Semantic validity | Tree pattern matching | O(n) |

### Thesis — property details

| Property | Method | Complexity |
|---|---|---|
| Layout feasibility | Bounded LP feasibility check | O(n) per viewport |
| Breakpoint analysis | Parametric LP / sensitivity analysis | O(n log n) |
| Solution uniqueness | LP degeneracy check | O(n) |
| Cascade conflicts | Lattice join on specificity tuples | O(rules × elements) |
| Spacing anomalies | Distributional analysis | O(n) |

### Kinesis — property details

| Property | Method | Complexity |
|---|---|---|
| Dataflow acyclicity | Topological sort on signal→effect DAG | O(V+E) |
| Signal liveness | Reaching definitions analysis | O(V+E) |
| Dead code | Unreachable node detection in DAG | O(V+E) |
| Taint analysis | Taint propagation on dataflow graph | O(V+E) |
| State machine completeness | CTL model checking | O(states × transitions) |
| Liveness | LTL model checking | O(states × transitions) |
| Safety | Invariant checking | O(states) |

Kinesis targets recognizable reactive patterns (signal/effect/derived, state machines, event→mutation chains, fetch/async). Arbitrary imperative code falls through to Sim mode.

---

## Cross-Pillar Analysis

| Cross-cut | Question | Method |
|---|---|---|
| Behavior × Structure | Does DOM mutation break structural contracts? | Apply mutations to tree automaton state |
| Behavior × Presentation | Does class toggle break layout feasibility? | Recompute constraints, check feasibility |
| Structure × Presentation | Does CSS fully cover the structural tree? | Intersect node set with selector-matched set |

---

## Implementation Status

All phases complete. 87 tests across all pillars.

| Phase | Component | Location | Tests |
|---|---|---|---|
| 1 | **Morphe** — tree automaton, accessibility, selectors | `nous/src/morphe/` | 15 |
| 2 | **Thesis** — constraints, cascade, breakpoints | `nous/src/thesis/` | 18 |
| 3 | **Kinesis** — dataflow DAG, patterns, state machines | `nous/src/kinesis/` | 21 |
| 4 | **Cross-pillar** — all three cross-cuts | `nous/src/cross/` | 12 |
| 5 | **Sim mode** — novoid-browser (QuickJS, Rust) | `browser/` | 21 integration |

**Stack:** TypeScript (parse5 + css-tree + acorn), vitest.

---

## Integration

```sh
sh verify.sh src/app/foo.html          # standalone
sh publish.sh slug src/app/foo.html    # runs verify.sh automatically
```

Output:
```
┌─ verify ───────────────────────────────────────────┐
│ nous    ✓ SOUND  47 nodes, 6 signals
│ browser ✓ clean  2 signals, 1 stores, 2 actions
│ test    ✓ 3/3 passed (23ms)                        ← if .test.json exists
├───────────────────────────────────────────────────────┤
│ ✓ verified
└───────────────────────────────────────────────────────┘
```

---

## File Structure

```
nous/
├── src/
│   ├── index.ts          # analyze(html) → ProofReport
│   ├── cli.ts            # npx tsx src/cli.ts <file.html>
│   ├── parser.ts         # HTML + CSS + JS → DocumentBundle
│   ├── types.ts          # ProofReport, Verdict, Contract types
│   ├── morphe/           # Pillar I
│   ├── thesis/           # Pillar II
│   ├── kinesis/          # Pillar III
│   └── cross/            # Cross-pillar analysis
├── contracts/            # YAML structural contracts
├── test/                 # 87 tests
├── package.json
└── tsconfig.json
```

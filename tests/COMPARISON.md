# no∅ vs Next.js — Fresh Benchmark

> 10 identical apps. Clean slate. Every number measured.
> Date: 2026-02-17 | Machine: Apple Silicon | Next.js 16 + React 19 + Tailwind + TypeScript

## Summary

| Metric | no∅ | Next.js | Factor |
|--------|-----|---------|--------|
| Total deployed (10 apps + runtime) | **68 KB** | 621 KB | **9.1x smaller** |
| App code (10 apps) | **23.6 KB** | 611 KB shared + 10 KB stubs | **26x smaller** |
| Shared JS runtime | **10 KB** (core.min.js) | 573 KB (20 chunks) | **57x smaller** |
| Shared CSS | **15.6 KB** (core.min.css) | 25.4 KB (Tailwind output) | **1.6x smaller** |
| Render plugin | **19.3 KB** (render.min.js) | — (included in React) | — |
| Dev dependencies | **0 bytes** | 421 MB (node_modules) | **∞** |
| Build artifacts | **0** | 8.3 MB (.next/) | **∞** |
| Time to live URL (avg) | **7.6s** | 31s (25s setup + 6s build) | **4.1x faster** |
| Total LOC (10 apps) | 689 | 395 | 1.7x more* |

\* no∅ LOC includes full HTML boilerplate + declarative render spec. Next.js LOC is pure TSX only (no layout, no config, no CSS).

## Per-App Detail

| App | no∅ LOC | Next.js LOC | no∅ Size | Next.js Deployed* | Publish Time |
|-----|---------|-------------|----------|-------------------|--------------|
| Counter | 37 | 19 | **1.1 KB** | 62 KB | 8.3s |
| Todo | 76 | 41 | **2.5 KB** | 62 KB | 7.8s |
| Calculator | 75 | 47 | **3.3 KB** | 62 KB | 7.5s |
| Timer | 70 | 45 | **2.2 KB** | 62 KB | 7.6s |
| Kanban | 96 | 60 | **3.0 KB** | 62 KB | 7.4s |
| Form | 57 | 47 | **2.1 KB** | 62 KB | 7.5s |
| Dashboard | 72 | 44 | **2.5 KB** | 62 KB | 7.6s |
| Tabs | 72 | 27 | **2.3 KB** | 62 KB | 7.4s |
| Router | 81 | 28 | **2.6 KB** | 62 KB | 7.2s |
| Theme | 53 | 37 | **2.2 KB** | 62 KB | 7.2s |

\* Next.js per-page deployed cost = shared JS (573 KB) / 10 + CSS (25 KB) / 10 + server stub (1 KB) ≈ 62 KB. In practice all 573 KB loads on first visit regardless of route.

## Framework Breakdown

### no∅
| File | Size |
|------|------|
| core.min.js | 9,946 bytes (9.7 KB) |
| render.min.js | 19,283 bytes (18.8 KB) |
| core.min.css | 15,592 bytes (15.2 KB) |
| **Total framework** | **44,821 bytes (43.8 KB)** |

### Next.js
| Component | Size |
|-----------|------|
| Static JS chunks (20 files) | 586,585 bytes (573 KB) |
| Static CSS (Tailwind) | 25,396 bytes (24.8 KB) |
| Server page stubs (10 routes) | ~10,580 bytes (10.3 KB) |
| .next/ total | 8.3 MB |
| node_modules/ | 421 MB |
| **Total runtime (JS + CSS)** | **622,561 bytes (608 KB)** |

## Setup

- **no∅**: Write HTML file → `sh publish.sh` → live URL. No npm, no build, no config.
- **Next.js**: `npx create-next-app` (25s) → write TSX → `npm run build` (6s) → deploy to hosting provider.

## Methodology

1. Deleted all existing test apps and files (clean slate)
2. Created Next.js project from scratch with `create-next-app@latest`
3. Wrote 10 functionally equivalent apps on each side
4. Measured file sizes with `wc -c`, build times with `time`, directory sizes with `du`
5. All measurements from same machine, same session

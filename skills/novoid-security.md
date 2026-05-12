# novoid-security

Supply chain & runtime security posture for no∅. Read this before adding new dependencies, publishing flows, or CI workflows.

## Threat model: what no∅ is and isn't exposed to

no∅ apps are single HTML files served from Convex. No bundler, no `node_modules` in the app, no transitive package graph. The dev environment is a different story — Convex CLI, vitest, playwright, esbuild, jsdom all install from npm.

So the relevant threat model splits in two:

| Surface | Exposure | Why |
|---|---|---|
| Published app (`src/app/<slug>.html`) | **Minimal** | No dependencies. Framework served from your own Convex. |
| Framework source (`src/core.js`, `src/plugins/*.js`) | **Minimal** | Vanilla JS, no runtime deps. Built with esbuild (dev-only). |
| Dev environment (`node_modules/`) | **Standard npm exposure** | 314 transitive packages via convex + vitest + playwright + esbuild + jsdom + viem + agentkit. |
| Convex deployment | **Concentrated trust anchor** | Single SaaS provider hosts every app. |

## Case study: TanStack npm compromise (May 2026)

[Postmortem](https://tanstack.com/blog/npm-supply-chain-compromise-postmortem). Attack chain:

1. `pull_request_target` workflow ran fork code with base-repo permissions.
2. Fork code poisoned the pnpm GitHub Actions cache with an obfuscated payload.
3. Legitimate `release.yml` restored the poisoned cache; payload harvested the runner's OIDC token from memory.
4. Attacker used the OIDC token to publish 84 malicious versions across 42 TanStack packages.

Anyone who ran `npm install` while those versions resolved was compromised.

### Why this chain has no analog in the no∅ publish flow

- **No app-side dependency tree.** A published app loads `core.min.js` from your own Convex `/js` route, not npm. A compromised npm package cannot reach an end user of a no∅ app unless it first compromises your laptop *and* you re-run `sh seed.sh`.
- **Framework is one auditable file.** `src/core.js` is human-readable; `dist/core.min.js` is built locally via esbuild and uploaded via `seed.sh`. No upstream registry serves no∅ users.
- **No `pull_request_target`, no Actions cache, no OIDC.** The publish pipeline is `sh publish.sh` on your laptop. Credential is `PUBLISH_SECRET` in `.env.local`, never on a CI runner.
- **CSP-enabled hosting.** Convex serves with CSP. The render layer uses safe arithmetic parsers for `$expressions` — no `eval` / `Function()` / dynamic `import()` from arbitrary origins. Outbound exfiltration channels are constrained.
- **Auth-gated mutations.** Every write (`pages:publish`, `pages:remove`, `assets:set`) checks `secret` against `PUBLISH_SECRET` server-side. No long-lived publish token sits in CI to be harvested.

### What vanilla JS does *not* protect

The dev-time npm surface is exactly as exposed as any other npm consumer. See next section.

## Dev dependencies: actual exposure

Current `package.json`:

```json
"dependencies":   { "@coinbase/agentkit", "convex", "viem" }
"devDependencies":{ "@playwright/test", "esbuild", "jsdom", "playwright", "vitest" }
```

Lockfile resolves to ~314 transitive packages. Each is a supply-chain risk during `npm install`.

### Convex (`convex@^1.31.7`)

- **Highest-impact dep.** Convex CLI runs `npx convex run …` from `publish.sh`, `seed.sh`, and verification scripts with `PUBLISH_SECRET` and deploy keys in env. A malicious `convex` version could exfiltrate both.
- **Also a SaaS trust anchor.** A Convex platform compromise (account, infra, or the hosted runtime itself) would affect every no∅ app simultaneously. This is the concentrated-trust tradeoff for eliminating the per-app dependency fan-out.
- **Mitigations:** pin via `package-lock.json` (already present); review `convex` version bumps before `npm install`; rotate `PUBLISH_SECRET` and Convex deploy keys if you suspect a tooling compromise; consider `npm ci --ignore-scripts` for routine installs (Convex CLI does not require install scripts to function — verify before relying on this).

### vitest (`vitest@^4.0.18`)

- **Runs your test code with full Node privileges.** `npm test` executes `test/*.ts` files plus any transitive vitest plugin. A poisoned vitest version sees `.env.local`, `~/.ssh`, and anything else readable by your user.
- **Large transitive footprint.** vitest pulls in vite, rollup, esbuild, and dozens of plugins. Any one is a candidate for the TanStack-style attack.
- **Mitigations:** lockfile-pinned; `NOVOID_SKIP_VITEST=1` skips it from `verify.sh` if you need to publish without running tests during a suspected-compromise window; prefer running `npm test` in a sandboxed shell or container if you're paranoid; subscribe to vitest security advisories.

### playwright, esbuild, jsdom, viem, agentkit

- **playwright** downloads browser binaries via post-install script — supply chain risk extends to the download server, not just the npm tarball.
- **esbuild** runs during `sh build.sh`. A compromised esbuild silently rewrites `dist/core.min.js` before `seed.sh` uploads it — this *would* reach end users. Treat esbuild bumps with the same care as Convex bumps.
- **jsdom** runs only in tests.
- **viem, @coinbase/agentkit** are runtime deps for any app that uses them server-side via Convex actions; pin tightly.

## Practical hardening checklist

- [ ] Commit `package-lock.json` (already done) and never delete it.
- [ ] Review `npm outdated` diffs before `npm install` / `npm update`. Read the changelog of any bumped package; don't auto-accept patch bumps for `convex`, `esbuild`, `vitest`.
- [ ] Use `npm ci` (lockfile-exact, no resolution) instead of `npm install` in scripts.
- [ ] Consider `--ignore-scripts` for installs; re-run scripts explicitly only for packages that need them (playwright browser download).
- [ ] Keep `PUBLISH_SECRET` and Convex deploy keys in `.env.local` only. Never echo them into logs, never commit, never paste into CI.
- [ ] Rotate `PUBLISH_SECRET` if a dev-tooling compromise is suspected: regenerate, update `.env.local`, redeploy Convex.
- [ ] Re-run `sh build.sh && sh seed.sh` from a clean checkout if you suspect `esbuild` was compromised between the last build and now — the local `dist/` is the artifact that reaches users.
- [ ] Keep CSP enabled on Convex HTTP routes. Don't weaken it for convenience.
- [ ] Don't add `eval`, `new Function(...)`, or remote script loads to framework source. The render layer's safe arithmetic parser exists for this reason.
- [ ] Resist new dependencies. Every added package multiplies the transitive surface. Prefer vanilla.

## The tradeoff, stated plainly

no∅ trades a wide supply chain (hundreds of npm packages reaching every app user) for a narrow, concentrated one (your laptop + Convex). The TanStack attack pattern cannot reach a no∅ end user through the published-app path. It *can* reach your laptop through the dev-tooling path, exactly like it can reach any npm consumer. Lockfiles, version review, and a clean separation between credentials and CI are the load-bearing controls.

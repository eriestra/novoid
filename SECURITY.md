# Security Policy — no∅ (novoid)

## Reporting a Vulnerability

If you discover a security vulnerability, please report it privately:

- Open a [private security advisory](https://github.com/eriestra/novoid/security/advisories/new) on this repository
- **Do not** open a public GitHub issue for security vulnerabilities
- Include steps to reproduce, affected components, and potential impact
- You will receive acknowledgment within 48 hours and a resolution timeline within 7 days

## Architecture & Threat Model

novoid is a single-deployment, agent-native framework. There is no dev/prod split — one Convex deployment serves all pages, assets, and data. This simplifies the threat surface but means every vulnerability is immediately production-facing.

### Trust Boundaries

| Boundary | Trust Level | Notes |
|---|---|---|
| `publish.sh` / `seed.sh` | Trusted | Requires `PUBLISH_SECRET` |
| Convex write mutations | Trusted | All gated by `secret` arg |
| Convex read queries | Public | Pages, assets, CSS/JS served openly |
| MCP tool endpoints (`/mcp/:slug`) | Semi-trusted | Store actions exposed as tools |
| Nex/Vox agent input | Untrusted | Multi-channel inbound messages |
| End-user browser | Untrusted | CSP-enforced, no inline eval |

## Security Controls

### 1. Secret Management

- **`PUBLISH_SECRET`** gates all write mutations (`pages:publish`, `pages:remove`, `assets:set`). No writes without it.
- **`.env.local`** holds credentials locally. Never committed to version control.
- **`keys` table** stores API keys in Convex, accessed only via `internalQuery` — never exposed through public queries or MCP responses.

**Rules:**
- Never log, return, or embed secrets in published HTML, error sentinels, or MCP tool responses.
- Audit `errors:recent` output to confirm stack traces do not capture secret values.
- Store actions must not return key material in their response payloads.

### 2. Input Validation

All inbound data from agents, DMs, and MCP clients is untrusted:

- Convex validators enforce argument shapes at the mutation/action boundary.
- Render expressions use safe arithmetic parsers — no `eval()`, no `Function()`.
- The `h()` API escapes text content by default. Raw HTML requires explicit opt-in.
- Script tag boundary rule: `'</' + 'script>'` in JS strings prevents injection in inline scripts.

### 3. Agent Security (Nex / Vox)

- Treat every inbound message as untrusted input regardless of channel (Telegram, web, MCP).
- Agent store actions execute in the Convex runtime — they inherit Convex's isolation but can read any data the query/mutation has access to. Scope `internalQuery` calls to the minimum required tables.
- Multi-agent collaboration uses `collab:claim` with agent IDs and secret verification. Fragment writes must be atomic — concurrent publishes must not corrupt page state.

### 4. Rate Limiting & Auth Hardening

- Convex HTTP routes that accept `PUBLISH_SECRET` (`/mcp/:slug`, `/platform`) should enforce rate limiting to prevent brute-force attacks (CWE-307).
- Failed auth attempts should be logged via the `errors` table for monitoring.

### 5. Content Security

- Convex serves pages with CSP headers. Inline scripts are allowed only via nonce or hash — no `unsafe-eval`.
- All framework assets (`/css`, `/js`) are served from the same origin to avoid CORS leakage.
- Published apps should not load external scripts unless explicitly declared in the app spec.

### 6. Error Sentinel Hygiene

```sh
npx convex run errors:recent '{"slug":"<slug>"}'
```

- Error payloads must not contain secrets, tokens, or full request bodies.
- Clear errors after investigation: `npx convex run errors:clear '{"slug":"<slug>","secret":"'$PUBLISH_SECRET'"}'`

## Disclosure Timeline

| Stage | SLA |
|---|---|
| Acknowledgment | 48 hours |
| Severity assessment | 7 days |
| Fix for critical/high | 14 days |
| Fix for medium/low | 30 days |
| Public disclosure | After fix is deployed |

## Scope

In scope:
- Convex mutations, actions, and HTTP routes
- Framework runtime (`core.js`, `render.js`, CSS)
- `publish.sh`, `build.sh`, `seed.sh`, `verify.sh` toolchain
- Nex/Vox agent message handling and MCP endpoints

Out of scope:
- Third-party dependencies (report upstream)
- Browser-specific rendering bugs without security impact
- Self-hosted forks with modified auth

# SETUP.md — Deploy Your Own no∅ Instance

Agent-guided first-run. Follow these steps in order.

## Prerequisites

- Node.js 18+
- A free [Convex](https://convex.dev) account

## Steps

### 1. Provision Convex

```sh
npx convex dev
```

This creates a new Convex project and starts the dev server. Keep it running in a separate terminal. Note the deployment URL it prints (e.g. `https://your-name-123.convex.cloud`).

### 2. Create `.env.local`

```sh
cat > .env.local <<EOF
CONVEX_URL=https://your-name-123.convex.cloud
PUBLISH_SECRET=$(openssl rand -hex 32)
EOF
```

Replace the CONVEX_URL with your actual deployment URL. The PUBLISH_SECRET is a random string that gates all write operations.

### 3. Install dependencies

```sh
npm install
```

### 4. Build framework assets

```sh
sh build.sh
```

Minifies `src/` into `dist/` and creates symlinks.

### 5. Seed the platform

```sh
source .env.local
sh seed.sh "$CONVEX_URL" "$PUBLISH_SECRET"
```

Uploads CSS, JS, skills documentation, and deploys ecosystem apps (novoid, nex, vox, bloox).

### 6. Verify it's live

```sh
sh url.sh novoid
```

Visit the URL. You should see the no∅ landing page.

## Optional: Static Analyzer

```sh
cd nous && npm install       # Nous static analyzer (phase 1)
```

The headless browse + test phases run via `test-runner/novoid-test.mjs` — pure
Node, nothing to install or build. Together these enable the full verification
pipeline in `publish.sh`.

## What's Running

After setup, your instance serves:

| Route | What |
|---|---|
| `/app/:slug` | Published apps |
| `/platform` | Admin UI |
| `/skills` | Framework documentation |
| `/mcp/:slug` | MCP endpoints per app |
| `/css/*`, `/js/*` | Framework assets |
| `/.well-known/x402.json` | Agent billing discovery |

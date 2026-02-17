# Live Reload via Convex Real-Time Subscriptions

## Problem

After `sh publish.sh`, the developer has to manually reload the browser tab. Every other modern dev tool auto-refreshes.

## Approach

Convex already maintains a WebSocket connection for real-time query subscriptions. Every page served from `/app/:slug` should subscribe to its own page record. When `updatedAt` changes (i.e., the page was republished), reload automatically.

## Implementation

### 1. Add a lightweight query: `pages:version`

```ts
// convex/pages.ts
export const version = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const page = await ctx.db
      .query("pages")
      .withIndex("by_slug", q => q.eq("slug", slug))
      .unique();
    return page?.updatedAt ?? 0;
  },
});
```

Returns only the timestamp — no HTML payload over the WebSocket.

### 2. Inject a live-reload snippet server-side (in `http.ts`)

The snippet loads the Convex browser bundle (already served at `/js/convex.min.js` or from unpkg) and subscribes to `pages:version`. Injected alongside the error capture snippet in the `/app/:slug` handler.

```js
// Pseudocode for the injected snippet
(function() {
  // The CONVEX_URL needs to be injected server-side (the .convex.cloud URL)
  var CONVEX_URL = "__CONVEX_CLOUD_URL__";
  var slug = "__SLUG__";

  // Load Convex client — the bundle is already available
  // Option A: reuse if already on page (window.convex)
  // Option B: load from /js/convex.min.js or unpkg

  var client = new ConvexClient(CONVEX_URL);
  var currentVersion = null;

  client.onUpdate(api.pages.version, { slug: slug }, function(newVersion) {
    if (currentVersion !== null && newVersion !== currentVersion) {
      location.reload();
    }
    currentVersion = newVersion;
  });
})();
```

### 3. Key details

- **The `.convex.cloud` URL** (not `.convex.site`) is needed for the client. The HTTP handler has access to the deployment URL via environment or can derive it. It's already available as `CONVEX_URL` in `.env.local` and could be stored in the `keys` table.
- **Don't double-load the Convex bundle.** If the page already uses `convex.min.js`, reuse the global. If not, dynamically load it.
- **The subscription is a single WebSocket message** — Convex multiplexes all subscriptions over one connection. Cost: essentially zero.
- **First update establishes baseline** — no reload on initial load, only on subsequent changes.
- **Pages loaded in iframes** (like the GitHub Pages bootstrapper or Vox preview) also get this for free.

### 4. What NOT to do

- No polling. Convex subscriptions are push-based via WebSocket.
- No `/version/:slug` HTTP endpoint. The query subscription handles everything.
- No `setInterval`. The Convex client fires callbacks reactively.

## Result

Open any `https://deployment.convex.site/app/myapp` → run `sh publish.sh myapp src/app/myapp.html` → browser refreshes instantly via WebSocket push. Zero latency beyond network round-trip.

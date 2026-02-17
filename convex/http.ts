import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";
import { htmlToMarkdown } from "./markdown";

const http = httpRouter();

// Shared security headers for HTML responses (admin pages — no framing)
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Content-Security-Policy":
    "default-src 'self' https://*.convex.site https://*.convex.cloud; " +
    "script-src 'self' 'unsafe-inline' https://unpkg.com https://cdn.jsdelivr.net https://*.convex.site; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; " +
    "font-src https://fonts.gstatic.com https://cdn.jsdelivr.net; " +
    "connect-src 'self' https://*.convex.cloud wss://*.convex.cloud https://*.convex.site https://unpkg.com; " +
    "img-src * data: blob:;",
};

// App page headers — allow framing from GitHub Pages
const APP_SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy":
    "default-src 'self' https://*.convex.site https://*.convex.cloud; " +
    "script-src 'self' 'unsafe-inline' https://unpkg.com https://cdn.jsdelivr.net https://*.convex.site; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; " +
    "font-src https://fonts.gstatic.com https://cdn.jsdelivr.net; " +
    "connect-src 'self' https://*.convex.cloud wss://*.convex.cloud https://*.convex.site https://unpkg.com; " +
    "img-src * data: blob:; " +
    "frame-ancestors 'self' https://eriestra.github.io;",
};

// CORS helper: restrict admin routes to same-origin or localhost
function adminCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin") || "";
  if (
    origin.includes(".convex.site") ||
    origin.includes("localhost") ||
    origin.includes("127.0.0.1")
  ) {
    return { "Access-Control-Allow-Origin": origin };
  }
  return {};
}

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

// Check if the request prefers markdown (agent content negotiation)
function wantsMarkdown(request: Request): boolean {
  const accept = request.headers.get("Accept") || "";
  return accept.includes("text/markdown");
}

// GET /platform — serve the platform admin UI
http.route({
  path: "/platform",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const page = await ctx.runQuery(api.pages.get, { slug: "platform" });
    if (!page) {
      return new Response("Platform page not found. Run seed first.", {
        status: 404,
        headers: { "Content-Type": "text/plain" },
      });
    }
    // Content negotiation: return markdown for AI agents
    if (wantsMarkdown(request)) {
      const md = htmlToMarkdown(page.html, {
        slug: "platform",
        url: `${new URL(request.url).origin}/platform`,
        browserSchema: page.browserSchema,
        nousReport: page.nousReport,
      });
      return new Response(md, {
        status: 200,
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          ...adminCorsHeaders(request),
          "x-markdown-tokens": String(Math.ceil(md.length / 4)),
          "Vary": "Accept",
          "Cache-Control": "no-cache",
        },
      });
    }

    return new Response(page.html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        ...adminCorsHeaders(request),
        ...SECURITY_HEADERS,
        "Cache-Control": "no-cache",
        "Vary": "Accept",
      },
    });
  }),
});

// Error capture snippet — injected into every published page
function errorCaptureSnippet(slug: string, origin: string) {
  return `<script data-novoid-sentinel>
(function(){
  var u="${origin}/errors/${slug}",q=[],t=null;
  function send(){
    if(!q.length)return;
    var batch=q.splice(0,10);
    for(var i=0;i<batch.length;i++){
      try{navigator.sendBeacon(u,JSON.stringify(batch[i]))}
      catch(e){fetch(u,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(batch[i]),keepalive:true}).catch(function(){})}
    }
  }
  function push(e){q.push(e);clearTimeout(t);t=setTimeout(send,1000)}
  window.addEventListener("error",function(e){
    push({message:e.message,source:e.filename,line:e.lineno,col:e.colno,stack:e.error&&e.error.stack,type:"error",userAgent:navigator.userAgent});
  });
  window.addEventListener("unhandledrejection",function(e){
    var r=e.reason||{};
    push({message:r.message||String(r),stack:r.stack,type:"unhandledrejection",userAgent:navigator.userAgent});
  });
  var ce=console.error;
  console.error=function(){
    push({message:[].slice.call(arguments).join(" "),type:"console.error",userAgent:navigator.userAgent});
    ce.apply(console,arguments);
  };
})();
<\/script>`;
}

// Live-reload snippet — subscribes to pages:version via Convex WebSocket
function liveReloadSnippet(slug: string, convexCloudUrl: string) {
  return `<script data-novoid-live-reload>
(function(){
  var CONVEX_URL="${convexCloudUrl}";
  var slug="${slug}";
  function init(){
    var C=window.convex&&window.convex.ConvexClient;
    if(!C)return;
    var c=new C(CONVEX_URL);
    var cur=null;
    c.onUpdate("pages:version",{slug:slug},function(v){
      if(cur!==null&&v!==cur)location.reload();
      cur=v;
    });
  }
  if(window.convex&&window.convex.ConvexClient){init();return}
  var s=document.createElement("script");
  s.src="https://unpkg.com/convex@latest/dist/browser.bundle.js";
  s.onload=init;
  document.head.appendChild(s);
})();
<\/script>`;
}

// GET /app/:slug — serve any published page
http.route({
  pathPrefix: "/app/",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const slug = url.pathname.replace("/app/", "");
    if (!slug) {
      return new Response("Missing slug", { status: 400 });
    }
    const page = await ctx.runQuery(api.pages.get, { slug });
    if (!page) {
      return new Response(`Page "${slug}" not found`, {
        status: 404,
        headers: { "Content-Type": "text/plain" },
      });
    }
    // Cache-bust framework asset URLs so browser always gets latest
    const bustParam = `_cb=${page.updatedAt || Date.now()}`;
    let html = page.html
      .replace(/(\.\.\/js\/novoid\.min\.js)(\?[^"']*)?/g, `$1?${bustParam}`)
      .replace(/(\.\.\/css\/novoid\.min\.css)(\?[^"']*)?/g, `$1?${bustParam}`);
    // Inject error capture + live-reload snippets before </head> or at start of HTML
    const origin = url.origin;
    const convexCloudUrl = origin.replace(".convex.site", ".convex.cloud");
    const snippet = errorCaptureSnippet(slug, origin) + liveReloadSnippet(slug, convexCloudUrl);
    if (html.includes("</head>")) {
      html = html.replace("</head>", snippet + "</head>");
    } else {
      html = snippet + html;
    }
    // Content negotiation: return markdown for AI agents
    if (wantsMarkdown(request)) {
      const md = htmlToMarkdown(page.html, {
        slug,
        url: `${url.origin}/app/${slug}`,
        browserSchema: page.browserSchema,
        nousReport: page.nousReport,
      });
      return new Response(md, {
        status: 200,
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
          "x-markdown-tokens": String(Math.ceil(md.length / 4)),
          "Vary": "Accept",
          "Cache-Control": "no-cache",
        },
      });
    }

    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        ...APP_SECURITY_HEADERS,
        "Cache-Control": "no-cache",
        "Vary": "Accept",
      },
    });
  }),
});

// GET /raw/:slug — serve raw page HTML (no sentinel injection, no cache-busting)
http.route({
  pathPrefix: "/raw/",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const slug = url.pathname.replace("/raw/", "");
    if (!slug || !SLUG_PATTERN.test(slug)) {
      return new Response("Invalid slug", { status: 400 });
    }
    const page = await ctx.runQuery(api.pages.get, { slug });
    if (!page) {
      return new Response(`Page "${slug}" not found`, {
        status: 404,
        headers: { "Content-Type": "text/plain" },
      });
    }
    return new Response(page.html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache",
      },
    });
  }),
});

// GET /css/:name — serve CSS assets
http.route({
  pathPrefix: "/css/",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const name = url.pathname.replace("/css/", "");
    const asset = await ctx.runQuery(api.assets.get, { name });
    if (!asset) {
      return new Response(`CSS asset "${name}" not found`, { status: 404 });
    }
    return new Response(asset.content, {
      status: 200,
      headers: {
        "Content-Type": "text/css; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache",
      },
    });
  }),
});

// GET /js/:name — serve JS assets
http.route({
  pathPrefix: "/js/",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const name = url.pathname.replace("/js/", "");
    const asset = await ctx.runQuery(api.assets.get, { name });
    if (!asset) {
      return new Response(`JS asset "${name}" not found`, { status: 404 });
    }
    return new Response(asset.content, {
      status: 200,
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache",
      },
    });
  }),
});

// GET /img/:name — serve image assets (stored as data URIs)
http.route({
  pathPrefix: "/img/",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const name = url.pathname.replace("/img/", "");
    const asset = await ctx.runQuery(api.assets.get, { name });
    if (!asset || !asset.content.startsWith("data:")) {
      return new Response(`Image "${name}" not found`, { status: 404 });
    }
    // Parse data URI: data:<contentType>;base64,<data>
    const match = asset.content.match(/^data:([^;]+);base64,([\s\S]+)$/);
    if (!match) {
      return new Response("Invalid image data", { status: 500 });
    }
    const contentType = match[1];
    const base64Data = match[2].replace(/\s/g, "");
    // Decode base64 using Uint8Array
    const binStr = globalThis.atob(base64Data);
    const buffer = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) {
      buffer[i] = binStr.charCodeAt(i);
    }
    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=86400",
      },
    });
  }),
});

// GET /favicon.ico — serve favicon as SVG
http.route({
  path: "/favicon.ico",
  method: "GET",
  handler: httpAction(async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="85" font-family="system-ui,sans-serif" text-anchor="middle" x="50">∅</text></svg>`;
    return new Response(svg, {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=86400",
      },
    });
  }),
});

// GET /llms.txt — LLM discovery file
http.route({
  path: "/llms.txt",
  method: "GET",
  handler: httpAction(async () => {
    const content = `# no∅ (novoid)

> A 12KB frontend platform designed for AI agents. CSS component library + reactive JS framework + self-hosting deployment via Convex. Single-file output, zero build tools, 2-second deploys.

- Source: https://github.com/eriestra/novoid
- Full API spec: https://github.com/eriestra/novoid/blob/main/skills.md
- Agent instructions: https://github.com/eriestra/novoid/blob/main/CLAUDE.md
- Whitepaper: https://github.com/eriestra/novoid/blob/main/whitepaper.md
- Full LLM context: https://github.com/eriestra/novoid/blob/main/llms-full.txt

## Quick Reference
- CSS prefix: nv- (classes), --nv- (variables)
- JS global: Novoid (e.g. Novoid.signal(), Novoid.h(), Novoid.mount())
- Reactivity: fine-grained signals, no virtual DOM
- Output: single self-contained HTML file per application
- Deploy: write HTML to Convex DB, live in 2 seconds
`;
    return new Response(content, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }),
});

// GET /robots.txt — crawler permissions
http.route({
  path: "/robots.txt",
  method: "GET",
  handler: httpAction(async () => {
    const content = `User-agent: *
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: GPTBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /
`;
    return new Response(content, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=86400",
      },
    });
  }),
});

// POST /errors/:slug — receive runtime errors from published pages
http.route({
  pathPrefix: "/errors/",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const slug = url.pathname.replace("/errors/", "");
    if (!slug || !SLUG_PATTERN.test(slug)) {
      return new Response("Invalid slug", { status: 400 });
    }
    // Reject oversized payloads
    const contentLength = request.headers.get("Content-Length");
    if (contentLength && parseInt(contentLength, 10) > 4096) {
      return new Response("Payload too large", {
        status: 413,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }
    try {
      const body = await request.json();
      await ctx.runMutation(api.errors.log, {
        slug,
        message: String(body.message || "Unknown error").slice(0, 1024),
        source: body.source ? String(body.source).slice(0, 512) : undefined,
        line: body.line,
        col: body.col,
        stack: body.stack ? String(body.stack).slice(0, 2048) : undefined,
        type: body.type || "error",
        userAgent: body.userAgent ? String(body.userAgent).slice(0, 256) : undefined,
      });
      return new Response("ok", {
        status: 200,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    } catch (e) {
      console.error(`errors/${slug} logging failed:`, e);
      return new Response("Failed to log error", {
        status: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }
  }),
});

// OPTIONS /errors/:slug — CORS preflight
http.route({
  pathPrefix: "/errors/",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }),
});

// GET /vox — serve the vox creation UI
http.route({
  path: "/vox",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const page = await ctx.runQuery(api.pages.get, { slug: "vox" });
    if (!page) {
      return new Response("vox page not found. Publish it first.", {
        status: 404,
        headers: { "Content-Type": "text/plain" },
      });
    }
    // Inject Convex URL and error capture
    const origin = new URL(request.url).origin;
    const convexUrl = origin.replace(".convex.site", ".convex.cloud");
    let html = page.html.replace("__CONVEX_URL__", convexUrl);
    const snippet = errorCaptureSnippet("vox", origin) + liveReloadSnippet("vox", convexUrl);
    if (html.includes("</head>")) {
      html = html.replace("</head>", snippet + "</head>");
    } else {
      html = snippet + html;
    }
    // Content negotiation: return markdown for AI agents
    if (wantsMarkdown(request)) {
      const md = htmlToMarkdown(page.html, {
        slug: "vox",
        url: `${origin}/vox`,
        browserSchema: page.browserSchema,
        nousReport: page.nousReport,
      });
      return new Response(md, {
        status: 200,
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
          "x-markdown-tokens": String(Math.ceil(md.length / 4)),
          "Vary": "Accept",
          "Cache-Control": "no-cache",
        },
      });
    }

    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        ...SECURITY_HEADERS,
        "Cache-Control": "no-cache",
        "Vary": "Accept",
      },
    });
  }),
});

// GET /collab/:slug — JSON status for multi-agent coordination
http.route({
  pathPrefix: "/collab/",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const slug = url.pathname.replace("/collab/", "");
    if (!slug) {
      return new Response("Missing slug", { status: 400 });
    }
    const result = await ctx.runQuery(api.collab.status, { slug });
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...adminCorsHeaders(request),
        "Cache-Control": "no-cache",
      },
    });
  }),
});

// POST /publish/:slug — publish a page via HTTP (used by publish.sh)
http.route({
  pathPrefix: "/publish/",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const slug = url.pathname.replace("/publish/", "");
    if (!slug || !SLUG_PATTERN.test(slug)) {
      return new Response("Invalid slug", {
        status: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }
    const auth = request.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) {
      return new Response("Unauthorized", {
        status: 401,
        headers: adminCorsHeaders(request),
      });
    }
    const secret = auth.slice(7);
    const html = await request.text();
    try {
      await ctx.runMutation(api.pages.publish, { slug, html, secret });
      return new Response("ok", {
        status: 200,
        headers: adminCorsHeaders(request),
      });
    } catch (e) {
      console.error(`publish/${slug} failed:`, e);
      return new Response("Unauthorized", {
        status: 401,
        headers: adminCorsHeaders(request),
      });
    }
  }),
});

// OPTIONS /publish/:slug — CORS preflight
http.route({
  pathPrefix: "/publish/",
  method: "OPTIONS",
  handler: httpAction(async (_, request) => {
    return new Response(null, {
      status: 204,
      headers: {
        ...adminCorsHeaders(request),
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }),
});

// ─── MCP: Model Context Protocol endpoint ─────────────────
// Full MCP server per app. Auto-generated from BrowseSchema.
// - Store actions → tools (schema only, client-side)
// - Convex mutations → tools (executable, auth-gated)
// - Convex actions → tools (executable, auth-gated)
// - Convex queries → live resources (readable)
// - Signals/stores → snapshot resources

// Resolve "module:function" ref to Convex API function reference
function resolveRef(ref: string): any {
  const [mod, fn] = ref.split(":");
  if (!mod || !fn) return null;
  try { return (api as any)[mod]?.[fn] ?? null; } catch { return null; }
}

function schemaToMcpTools(schema: any): any[] {
  const tools: any[] = [];
  const seen = new Set<string>();

  // Store actions (client-side only)
  if (schema.actions) {
    for (const action of schema.actions) {
      seen.add(action.name);
      tools.push({
        name: action.name,
        description: `Client store action: ${action.name} on ${action.source}`,
        inputSchema: {
          type: "object",
          properties: { args: { type: "string", description: "JSON-encoded arguments" } },
        },
        annotations: { readOnlyHint: true },
      });
    }
  }

  // Convex mutations (executable server-side)
  if (schema.convex?.mutations) {
    for (const m of schema.convex.mutations) {
      const ref = m.ref;
      if (seen.has(ref)) continue;
      seen.add(ref);
      tools.push({
        name: `mutation:${ref}`,
        description: `Convex mutation: ${ref}`,
        inputSchema: {
          type: "object",
          properties: { args: { type: "object", description: "Mutation arguments" } },
        },
        annotations: { readOnlyHint: false },
      });
    }
  }

  // Convex actions (executable server-side)
  if (schema.convex?.actions) {
    for (const a of schema.convex.actions) {
      const ref = a.ref;
      if (seen.has(ref)) continue;
      seen.add(ref);
      tools.push({
        name: `action:${ref}`,
        description: `Convex action: ${ref}`,
        inputSchema: {
          type: "object",
          properties: { args: { type: "object", description: "Action arguments" } },
        },
        annotations: { readOnlyHint: false },
      });
    }
  }

  return tools;
}

function schemaToMcpResources(schema: any, slug: string): any[] {
  const resources: any[] = [];

  // Signals and stores (snapshot from publish)
  if (schema.state) {
    for (const [key] of Object.entries(schema.state)) {
      resources.push({
        uri: `novoid://${slug}/state/${key}`,
        name: key,
        description: `Reactive state: ${key}`,
        mimeType: "application/json",
      });
    }
  }

  // Entities
  if (schema.entities) {
    for (const [key, entity] of Object.entries(schema.entities as Record<string, any>)) {
      resources.push({
        uri: `novoid://${slug}/entity/${key}`,
        name: key,
        description: `Entity collection (${entity.count} items): ${JSON.stringify(entity.schema)}`,
        mimeType: "application/json",
      });
    }
  }

  // Convex queries (live-readable)
  if (schema.convex?.subscriptions) {
    for (const sub of schema.convex.subscriptions) {
      resources.push({
        uri: `novoid://${slug}/query/${sub.ref}`,
        name: `query:${sub.ref}`,
        description: `Live Convex query: ${sub.ref}`,
        mimeType: "application/json",
      });
    }
  }

  return resources;
}

// POST /mcp/:slug — MCP JSON-RPC handler (Streamable HTTP transport)
http.route({
  pathPrefix: "/mcp/",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const slug = url.pathname.replace("/mcp/", "");
    if (!slug || !SLUG_PATTERN.test(slug)) {
      return new Response("Invalid slug", { status: 400 });
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const jsonrpc = (result: any) => JSON.stringify({ jsonrpc: "2.0", result, id: body.id ?? null });
    const jsonrpcErr = (code: number, message: string) =>
      JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: body.id ?? null });
    const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

    const page = await ctx.runQuery(api.pages.get, { slug });
    const schema = page?.browserSchema ? JSON.parse(page.browserSchema) : null;

    // Extract Bearer token for auth-gated operations
    const authHeader = request.headers.get("Authorization") || "";
    const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    switch (body.method) {
      case "initialize":
        return new Response(jsonrpc({
          protocolVersion: "2024-11-05",
          capabilities: { tools: {}, resources: {} },
          serverInfo: { name: `novoid-${slug}`, version: "1.0.0" },
        }), { status: 200, headers });

      case "notifications/initialized":
        return new Response(jsonrpc({}), { status: 200, headers });

      case "tools/list":
        return new Response(jsonrpc({ tools: schema ? schemaToMcpTools(schema) : [] }), { status: 200, headers });

      case "resources/list":
        return new Response(jsonrpc({ resources: schema ? schemaToMcpResources(schema, slug) : [] }), { status: 200, headers });

      case "resources/read": {
        const uri = body.params?.uri || "";

        // Static state snapshot
        const stateMatch = uri.match(/^novoid:\/\/[^/]+\/state\/(.+)$/);
        if (stateMatch && schema?.state && stateMatch[1] in schema.state) {
          return new Response(jsonrpc({
            contents: [{ uri, mimeType: "application/json", text: JSON.stringify(schema.state[stateMatch[1]]) }],
          }), { status: 200, headers });
        }

        // Static entity snapshot
        const entityMatch = uri.match(/^novoid:\/\/[^/]+\/entity\/(.+)$/);
        if (entityMatch && schema?.entities && entityMatch[1] in schema.entities) {
          return new Response(jsonrpc({
            contents: [{ uri, mimeType: "application/json", text: JSON.stringify(schema.entities[entityMatch[1]]) }],
          }), { status: 200, headers });
        }

        // Live Convex query
        const queryMatch = uri.match(/^novoid:\/\/[^/]+\/query\/(.+)$/);
        if (queryMatch) {
          const ref = queryMatch[1];
          const fnRef = resolveRef(ref);
          if (!fnRef) {
            return new Response(jsonrpcErr(-32602, `Cannot resolve query: ${ref}`), { status: 200, headers });
          }
          try {
            // Use default args from schema if available
            const sub = schema?.convex?.subscriptions?.find((s: any) => s.ref === ref);
            const args = body.params?.arguments || sub?.args || {};
            const result = await ctx.runQuery(fnRef, args);
            return new Response(jsonrpc({
              contents: [{ uri, mimeType: "application/json", text: JSON.stringify(result) }],
            }), { status: 200, headers });
          } catch (e: any) {
            return new Response(jsonrpcErr(-32000, `Query failed: ${e.message || e}`), { status: 200, headers });
          }
        }

        return new Response(jsonrpcErr(-32602, `Resource not found: ${uri}`), { status: 200, headers });
      }

      case "tools/call": {
        const toolName = body.params?.name || "";
        const toolArgs = body.params?.arguments || {};

        if (!schema) {
          return new Response(jsonrpcErr(-32602, "No schema available"), { status: 200, headers });
        }

        // Client-side store action (read-only schema return)
        const storeAction = schema.actions?.find((a: any) => a.name === toolName);
        if (storeAction) {
          return new Response(jsonrpc({
            content: [{
              type: "text",
              text: JSON.stringify({
                action: storeAction.name,
                source: storeAction.source,
                currentState: schema.state?.[storeAction.source] ?? null,
                note: "Client-side store action. Requires browser to execute.",
              }),
            }],
          }), { status: 200, headers });
        }

        // Convex mutation or action (server-side, auth-gated)
        const mutMatch = toolName.match(/^mutation:(.+)$/);
        const actMatch = toolName.match(/^action:(.+)$/);
        if (mutMatch || actMatch) {
          // Auth required for write operations
          if (!bearerToken) {
            return new Response(jsonrpcErr(-32001, "Authorization required. Pass publish secret as Bearer token."), { status: 200, headers });
          }
          // Verify secret
          try {
            const valid = await ctx.runQuery(api.keys.verify, { name: "PUBLISH_SECRET", token: bearerToken });
            if (!valid) {
              return new Response(jsonrpcErr(-32001, "Invalid authorization token"), { status: 200, headers });
            }
          } catch {
            return new Response(jsonrpcErr(-32001, "Auth verification failed"), { status: 200, headers });
          }

          const ref = (mutMatch || actMatch)![1];
          const fnRef = resolveRef(ref);
          if (!fnRef) {
            return new Response(jsonrpcErr(-32602, `Cannot resolve function: ${ref}`), { status: 200, headers });
          }

          try {
            const args = { ...(toolArgs.args || toolArgs), secret: bearerToken };
            let result;
            if (mutMatch) {
              result = await ctx.runMutation(fnRef, args);
            } else {
              result = await ctx.runAction(fnRef, args);
            }
            return new Response(jsonrpc({
              content: [{
                type: "text",
                text: JSON.stringify({ ref, result: result ?? null }),
              }],
            }), { status: 200, headers });
          } catch (e: any) {
            return new Response(jsonrpc({
              content: [{
                type: "text",
                text: JSON.stringify({ ref, error: e.message || String(e) }),
              }],
              isError: true,
            }), { status: 200, headers });
          }
        }

        return new Response(jsonrpcErr(-32602, `Unknown tool: ${toolName}`), { status: 200, headers });
      }

      default:
        return new Response(jsonrpcErr(-32601, `Method not found: ${body.method}`), { status: 200, headers });
    }
  }),
});

// OPTIONS /mcp/:slug — CORS preflight
http.route({
  pathPrefix: "/mcp/",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }),
});

// GET /mcp/:slug — Human/agent-readable MCP manifest (non-JSON-RPC)
http.route({
  pathPrefix: "/mcp/",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const slug = url.pathname.replace("/mcp/", "");
    if (!slug || !SLUG_PATTERN.test(slug)) {
      return new Response("Invalid slug", { status: 400 });
    }
    const page = await ctx.runQuery(api.pages.get, { slug });
    if (!page?.browserSchema) {
      return new Response(JSON.stringify({
        slug,
        error: "No schema available. App may not have been published with verification.",
      }), {
        status: 404,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
    const schema = JSON.parse(page.browserSchema);
    return new Response(JSON.stringify({
      slug,
      mcpEndpoint: `${url.origin}/mcp/${slug}`,
      protocolVersion: "2024-11-05",
      serverInfo: { name: `novoid-${slug}`, version: "1.0.0" },
      tools: schemaToMcpTools(schema),
      resources: schemaToMcpResources(schema, slug),
      state: schema.state || {},
      navigation: schema.navigation || [],
      components: schema.components || [],
    }, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache",
      },
    });
  }),
});

// Catch-all: custom domain resolution via Host header → domains table
// When a custom domain (e.g. myapp.com) points to this Convex deployment,
// the Host header won't match *.convex.site, so known routes won't match.
// This handler resolves the domain to a page slug.
http.route({
  pathPrefix: "/",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const host = (request.headers.get("host") || "").toLowerCase().split(":")[0];

    // Skip if this is a known Convex site domain (handled by routes above)
    if (host.endsWith(".convex.site")) {
      return new Response("Not found", { status: 404 });
    }

    // Look up custom domain mapping
    const domain = await ctx.runQuery(api.domains.getByHost, { host });
    if (!domain) {
      return new Response(`No app mapped to "${host}"`, {
        status: 404,
        headers: { "Content-Type": "text/plain" },
      });
    }

    const page = await ctx.runQuery(api.pages.get, { slug: domain.slug });
    if (!page) {
      return new Response(`Page "${domain.slug}" not found`, {
        status: 404,
        headers: { "Content-Type": "text/plain" },
      });
    }

    // Rewrite relative asset paths (../css/, ../js/) to absolute /css/, /js/
    let html = page.html
      .replace(/\.\.\/css\//g, "/css/")
      .replace(/\.\.\/js\//g, "/js/")
      .replace(/\.\.\/img\//g, "/img/");

    // Cache-bust framework assets
    const bustParam = `_cb=${page.updatedAt || Date.now()}`;
    html = html
      .replace(/(\/js\/novoid\.min\.js)(\?[^"']*)?/g, `$1?${bustParam}`)
      .replace(/(\/css\/novoid\.min\.css)(\?[^"']*)?/g, `$1?${bustParam}`);

    // Inject error capture
    const origin = url.origin;
    const snippet = errorCaptureSnippet(domain.slug, origin);
    if (html.includes("</head>")) {
      html = html.replace("</head>", snippet + "</head>");
    } else {
      html = snippet + html;
    }

    // Content negotiation: return markdown for AI agents
    if (wantsMarkdown(request)) {
      const md = htmlToMarkdown(page.html, {
        slug: domain.slug,
        url: `${url.origin}/`,
        browserSchema: page.browserSchema,
        nousReport: page.nousReport,
      });
      return new Response(md, {
        status: 200,
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
          "x-markdown-tokens": String(Math.ceil(md.length / 4)),
          "Vary": "Accept",
          "Cache-Control": "no-cache",
        },
      });
    }

    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        ...APP_SECURITY_HEADERS,
        "Cache-Control": "no-cache",
        "Vary": "Accept",
      },
    });
  }),
});

export default http;

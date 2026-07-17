import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { htmlToMarkdown } from "./markdown";
import { hashSecret, generateToken } from "./lib";

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
    "frame-ancestors *;",
};

// CORS helper: restrict admin routes to same-origin or localhost
function adminCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin") || "";
  try {
    const hostname = new URL(origin).hostname;
    if (
      hostname.endsWith(".convex.site") ||
      hostname === "localhost" ||
      hostname === "127.0.0.1"
    ) {
      return { "Access-Control-Allow-Origin": origin };
    }
  } catch {
    // Invalid origin URL — deny
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
      .replace(/(\.\.\/js\/[a-z]+\.min\.js)(\?[^"']*)?/g, `$1?${bustParam}`)
      .replace(/(\.\.\/css\/[a-z]+\.min\.css)(\?[^"']*)?/g, `$1?${bustParam}`);
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

    // Build CSP with per-page overrides
    const appHeaders = { ...APP_SECURITY_HEADERS };
    if (page.iframeOrigins && page.iframeOrigins.length > 0) {
      const csp = appHeaders["Content-Security-Policy"].replace(
        /frame-ancestors[^;]*/,
        "frame-ancestors * " + page.iframeOrigins.join(" ")
      );
      appHeaders["Content-Security-Policy"] = csp;
    }

    // Parse <meta name="novoid-connect" content="https://..."> for connect-src extensions
    const connectMeta = html.match(/<meta\s+name=["']novoid-connect["']\s+content=["']([^"']+)["']/i);
    if (connectMeta) {
      const domains = connectMeta[1].split(/\s+/).filter((d: string) => /^https?:\/\//.test(d));
      if (domains.length > 0) {
        appHeaders["Content-Security-Policy"] = appHeaders["Content-Security-Policy"].replace(
          /connect-src([^;]*)/,
          "connect-src$1 " + domains.join(" ")
        );
      }
    }

    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        ...appHeaders,
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
        "X-Content-Type-Options": "nosniff",
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

// GET /img/:name — serve image assets (Convex storage with data-URI fallback)
http.route({
  pathPrefix: "/img/",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const name = url.pathname.replace("/img/", "");

    // Try Convex file storage first (CDN-backed)
    const cdnUrl = await ctx.runQuery(api.files.getUrl, { name });
    if (cdnUrl) {
      return Response.redirect(cdnUrl, 302);
    }

    // Fallback: data-URI from assets table
    const asset = await ctx.runQuery(api.assets.get, { name });
    if (!asset || !asset.content.startsWith("data:")) {
      return new Response(`Image "${name}" not found`, { status: 404 });
    }
    const match = asset.content.match(/^data:([^;]+);base64,([\s\S]+)$/);
    if (!match) {
      return new Response("Invalid image data", { status: 500 });
    }
    const contentType = match[1];
    const base64Data = match[2].replace(/\s/g, "");
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

// GET /skills — serve concatenated skills documentation
http.route({
  path: "/skills",
  method: "GET",
  handler: httpAction(async (ctx) => {
    const doc = await ctx.runQuery(api.assets.get, { name: "skills.md" });
    if (!doc) {
      return new Response("Skills not seeded. Run seed.sh first.", {
        status: 404,
        headers: { "Content-Type": "text/plain", "Access-Control-Allow-Origin": "*" },
      });
    }
    return new Response(doc.content, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }),
});

// GET /llms.txt — LLM discovery file
http.route({
  path: "/llms.txt",
  method: "GET",
  handler: httpAction(async (_, request) => {
    const origin = new URL(request.url).origin;
    const content = `# no∅ (novoid) — Agent-First Application Platform

> Describe it, it's live. One HTML file, zero build tools, 2-second deploys. Agents pay in USDC, no human required.

## Full Documentation

  GET  ${origin}/skills  → complete framework skills (text/markdown)

## API Quick Reference

| Route | Method | Description |
|---|---|---|
| /skills | GET | Full framework documentation (text/markdown) |
| /.well-known/x402.json | GET | Payment terms + entry points |
| /billing/register | POST | { walletAddress } → API key |
| /billing/publish | POST | { slug, html, apiKey } → live URL |
| /billing/publish | DELETE | { slug, apiKey } → remove page |
| /billing/balance | POST | { apiKey } → credit balance |
| /billing/usage | POST | { apiKey } → publish history |
| /billing/tools | GET | CLI tools + binaries |
| /app/:slug | GET | Serve published page |
| /mcp/:slug | GET/POST | MCP JSON-RPC per app |

## Agent Deployment Rail

Any agent with a wallet can deploy apps autonomously:

1. GET /skills — learn the framework (complete API reference)
2. GET /.well-known/x402.json — discover payment terms
3. POST /billing/register { walletAddress } — get API key
4. Build one HTML file using no∅
5. POST /billing/publish { slug, html, apiKey } — get live URL

Payment: USDC on Base. $0.02 per publish. x402 protocol. No human required.

## Source
- GitHub: https://github.com/eriestra/novoid
- Skills: https://github.com/eriestra/novoid/tree/main/skills
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
    // Reject oversized payloads (header check + body check)
    const contentLength = request.headers.get("Content-Length");
    if (contentLength && parseInt(contentLength, 10) > 4096) {
      return new Response("Payload too large", {
        status: 413,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }
    try {
      const rawBody = await request.text();
      if (rawBody.length > 4096) {
        return new Response("Payload too large", {
          status: 413,
          headers: { "Access-Control-Allow-Origin": "*" },
        });
      }
      const body = JSON.parse(rawBody);
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

// ─── Nex: Webhook endpoints for channel integrations ────────

// POST /nex/telegram — Telegram webhook receiver
http.route({
  path: "/nex/telegram",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const message = body.message || body.edited_message || body.callback_query?.message;
      if (!message) {
        return new Response("ok", { status: 200 });
      }

      const chatId = String(message.chat?.id || "");
      const text = body.callback_query?.data || message.text || message.caption || "";
      const fromUser = message.from?.first_name || message.from?.username || "User";

      // Extract image file ID if present
      const photos = message.photo;
      const imageFileId = photos && photos.length > 0 ? photos[photos.length - 1].file_id : undefined;

      // Extract voice/audio file ID
      const voiceFileId = message.voice?.file_id || message.audio?.file_id;

      // Voice/audio messages → "voice" job type
      if (voiceFileId) {
        await ctx.runMutation(api.nex.createWebhookJob, {
          orgId: "default",
          type: "voice",
          payload: JSON.stringify({
            fileId: voiceFileId,
            channel: "telegram",
            replyTo: chatId,
            messageId: message.message_id,
            fromUser,
            mimeType: message.voice?.mime_type || message.audio?.mime_type || "audio/ogg",
          }),
        });
        return new Response("ok", { status: 200 });
      }

      // Callback queries
      if (body.callback_query) {
        await ctx.runMutation(api.nex.createWebhookJob, {
          orgId: "default",
          type: "chat",
          payload: JSON.stringify({
            text: "__callback_query__",
            chatId,
            replyTo: chatId,
            fromUser,
            channel: "telegram",
            messageId: message.message_id,
            callbackQuery: {
              id: body.callback_query.id,
              data: body.callback_query.data,
              chatId,
              messageId: message.message_id,
              messageText: message.text || "",
            },
          }),
        });
        return new Response("ok", { status: 200 });
      }

      // Text/image messages → "chat" job type
      const payload: Record<string, unknown> = {
        text,
        chatId,
        replyTo: chatId,
        fromUser,
        channel: "telegram",
        messageId: message.message_id,
      };
      if (imageFileId) payload.imageFileId = imageFileId;

      await ctx.runMutation(api.nex.createWebhookJob, {
        orgId: "default",
        type: "chat",
        payload: JSON.stringify(payload),
      });

      return new Response("ok", { status: 200 });
    } catch (e) {
      console.error("Telegram webhook error:", e);
      return new Response("ok", { status: 200 }); // Always 200 to avoid Telegram retries
    }
  }),
});

// POST /nex/slack — Slack events receiver
http.route({
  path: "/nex/slack",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();

    // Slack URL verification challenge
    if (body.type === "url_verification") {
      return new Response(JSON.stringify({ challenge: body.challenge }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Event callback
    if (body.type === "event_callback" && body.event) {
      const event = body.event;
      if (event.type === "message" && !event.bot_id && event.text) {
        await ctx.runMutation(api.nex.createWebhookJob, {
          orgId: "default",
          type: "chat",
          payload: JSON.stringify({
            text: event.text,
            chatId: event.channel,
            replyTo: event.channel,
            fromUser: event.user,
            channel: "slack",
            threadTs: event.thread_ts || event.ts,
          }),
        });
      }
    }

    return new Response("ok", { status: 200 });
  }),
});

// POST /nex/discord — Discord interactions receiver
http.route({
  path: "/nex/discord",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();

    // Discord ping verification
    if (body.type === 1) {
      return new Response(JSON.stringify({ type: 1 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Message interaction
    if (body.type === 2 || (body.data && body.data.content)) {
      const content = body.data?.options?.[0]?.value || body.data?.content || "";
      const channelId = body.channel_id || body.channel?.id;
      await ctx.runMutation(api.nex.createWebhookJob, {
        orgId: "default",
        type: "chat",
        payload: JSON.stringify({
          text: content,
          chatId: channelId,
          replyTo: channelId,
          fromUser: body.member?.user?.username || "User",
          channel: "discord",
        }),
      });
    }

    return new Response(JSON.stringify({ type: 4, data: { content: "Processing..." } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// GET /nex/status — Worker status query
http.route({
  path: "/nex/status",
  method: "GET",
  handler: httpAction(async (ctx) => {
    const agents = await ctx.runQuery(api.nex.activeAgents, { orgId: "default" });
    return new Response(JSON.stringify({
      agents: agents || [],
      timestamp: Date.now(),
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache",
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
// Accepts JSON body: { html, nousReport?, browserSchema? }
// Or raw text body (plain HTML, no schemas) for backwards compat.
// Auth: Bearer <PUBLISH_SECRET>
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
    const contentType = request.headers.get("Content-Type") || "";
    let html: string;
    let nousReport: string | undefined;
    let browserSchema: string | undefined;
    if (contentType.includes("application/json")) {
      const body = await request.json() as { html: string; nousReport?: string; browserSchema?: string };
      html = body.html;
      nousReport = body.nousReport;
      browserSchema = body.browserSchema;
    } else {
      html = await request.text();
    }
    try {
      await ctx.runMutation(api.pages.publish, {
        slug, html, secret,
        ...(nousReport ? { nousReport } : {}),
        ...(browserSchema ? { browserSchema } : {}),
      });
      return new Response(JSON.stringify({ ok: true, slug }), {
        status: 200,
        headers: { ...adminCorsHeaders(request), "Content-Type": "application/json" },
      });
    } catch (e) {
      console.error(`publish/${slug} failed:`, e);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...adminCorsHeaders(request), "Content-Type": "application/json" },
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

// ─── Documents: Block editor persistence ─────────────────

// GET /docs/:docId — load a document
http.route({
  pathPrefix: "/docs/",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const docId = url.pathname.replace("/docs/", "");
    if (!docId) {
      return new Response("Missing docId", { status: 400 });
    }
    const doc = await ctx.runQuery(api.documents.load, { docId });
    if (!doc) {
      return new Response(JSON.stringify({ error: "not_found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
    return new Response(JSON.stringify(doc), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache",
      },
    });
  }),
});

// POST /docs/:docId — save a document (write-token auth)
http.route({
  pathPrefix: "/docs/",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const docId = url.pathname.replace("/docs/", "");
    if (!docId) {
      return new Response("Missing docId", { status: 400 });
    }
    try {
      const body = await request.json();
      if (!body.writeToken) {
        return new Response(JSON.stringify({ error: "writeToken required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }
      await ctx.runMutation(api.documents.save, {
        docId,
        writeToken: body.writeToken,
        title: body.title || "",
        icon: body.icon || "📝",
        blocks: body.blocks || "[]",
        customBlocks: body.customBlocks,
      });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message || "save failed" }), {
        status: 403,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
  }),
});

// OPTIONS /docs/:docId — CORS preflight
http.route({
  pathPrefix: "/docs/",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }),
});

// GET /docs — list all documents
http.route({
  path: "/docs",
  method: "GET",
  handler: httpAction(async (ctx) => {
    const docs = await ctx.runQuery(api.documents.list);
    return new Response(JSON.stringify(docs), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache",
      },
    });
  }),
});

// ─── CDP: Browser automation endpoints ──────────────────────

// GET /cdp/browse?url=<url>&extract=<mode>&snap=true — JSON snapshot (auth: Bearer PUBLISH_SECRET)
http.route({
  path: "/cdp/browse",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get("url");
    if (!targetUrl) {
      return new Response(JSON.stringify({ error: "url parameter required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
    const auth = request.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) {
      return new Response("Unauthorized", { status: 401 });
    }
    const secret = auth.slice(7);
    const extract = url.searchParams.get("extract") || undefined;
    const snap = url.searchParams.get("snap") === "true";

    try {
      const result = await ctx.runAction(api.cdp.browse, {
        url: targetUrl,
        extract,
        snap,
        secret,
      });
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message || "CDP browse failed" }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
  }),
});

// GET /cdp/screenshot?url=<url> — PNG screenshot (auth: Bearer PUBLISH_SECRET)
http.route({
  path: "/cdp/screenshot",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get("url");
    if (!targetUrl) {
      return new Response(JSON.stringify({ error: "url parameter required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
    const auth = request.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) {
      return new Response("Unauthorized", { status: 401 });
    }
    const secret = auth.slice(7);

    try {
      const result = await ctx.runAction(api.cdp.screenshot, {
        url: targetUrl,
        secret,
      });
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message || "CDP screenshot failed" }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
  }),
});

// POST /cdp/script — run a JSON command script (auth: Bearer PUBLISH_SECRET)
http.route({
  path: "/cdp/script",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const auth = request.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) {
      return new Response("Unauthorized", { status: 401 });
    }
    const secret = auth.slice(7);
    const scriptJson = await request.text();

    try {
      const result = await ctx.runAction(api.cdp.script, { scriptJson, secret });
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message || "CDP script failed" }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
  }),
});

// OPTIONS /cdp/* — CORS preflight
http.route({
  pathPrefix: "/cdp/",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

  // Store actions (executable server-side when docId + writeToken provided)
  if (schema.actions) {
    for (const action of schema.actions) {
      seen.add(action.name);
      tools.push({
        name: action.name,
        description: `Store action: ${action.name} on ${action.source}. Pass docId + writeToken to execute server-side, or omit for schema info.`,
        inputSchema: {
          type: "object",
          properties: {
            args: { type: "string", description: "JSON-encoded arguments (include docId and writeToken for server-side execution)" },
          },
        },
        annotations: { readOnlyHint: false },
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

        // Store action — execute server-side if docId + writeToken provided
        const storeAction = schema.actions?.find((a: any) => a.name === toolName);
        if (storeAction) {
          const args = typeof toolArgs.args === "string" ? JSON.parse(toolArgs.args) : toolArgs.args || toolArgs;

          // If docId + writeToken provided, execute server-side via documents:applyAction
          if (args.docId && args.writeToken) {
            try {
              const { docId, writeToken, ...actionArgs } = args;
              const result = await ctx.runMutation(api.documents.applyAction, {
                docId,
                writeToken,
                actionName: toolName,
                actionArgs,
              });
              return new Response(jsonrpc({
                content: [{ type: "text", text: JSON.stringify({ action: toolName, result }) }],
              }), { status: 200, headers });
            } catch (e: any) {
              return new Response(jsonrpc({
                content: [{ type: "text", text: JSON.stringify({ action: toolName, error: e.message }) }],
                isError: true,
              }), { status: 200, headers });
            }
          }

          // No docId — return schema info (existing behavior)
          return new Response(jsonrpc({
            content: [{
              type: "text",
              text: JSON.stringify({
                action: storeAction.name,
                source: storeAction.source,
                currentState: schema.state?.[storeAction.source] ?? null,
                note: "Client-side store action. Pass docId + writeToken in args to execute server-side.",
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
    if (!page?.browserSchema?.trim()) {
      return new Response(JSON.stringify({
        slug,
        error: "No schema available. App may not have been published with verification.",
      }), {
        status: 404,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
    let schema;
    try {
      schema = JSON.parse(page.browserSchema);
    } catch {
      return new Response(JSON.stringify({
        slug,
        error: "Stored schema is invalid JSON. Re-publish to regenerate it.",
      }), {
        status: 502,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
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
      .replace(/(\/js\/[a-z]+\.min\.js)(\?[^"']*)?/g, `$1?${bustParam}`)
      .replace(/(\/css\/[a-z]+\.min\.css)(\?[^"']*)?/g, `$1?${bustParam}`);

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

// ─── Agent Billing Proxy ─────────────────────────────────

const PUBLISH_COST = "0.02";
const BILLING_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// GET /.well-known/x402.json — payment terms discovery
http.route({
  path: "/.well-known/x402.json",
  method: "GET",
  handler: httpAction(async (ctx) => {
    const walletKey = await ctx.runQuery(internal.lib.getKey, { name: "BILLING_WALLET" });
    const paymentAddress = walletKey?.value || "NOT_CONFIGURED";
    return new Response(JSON.stringify({
      version: "1.0",
      accepts: ["USDC/base"],
      pricePerPublish: PUBLISH_COST,
      paymentAddress,
      chain: "base",
      chainId: 8453,
      docs: "GET /skills",
      register: "POST /billing/register",
    }, null, 2), {
      status: 200,
      headers: { "Content-Type": "application/json", ...BILLING_CORS },
    });
  }),
});

// GET /billing/docs — redirect to /skills (legacy URL)
http.route({
  path: "/billing/docs",
  method: "GET",
  handler: httpAction(async (_, request) => {
    const origin = new URL(request.url).origin;
    return new Response(null, {
      status: 301,
      headers: { Location: `${origin}/skills`, "Access-Control-Allow-Origin": "*" },
    });
  }),
});

// GET /billing/tools — list available CLI tools
http.route({
  path: "/billing/tools",
  method: "GET",
  handler: httpAction(async () => {
    const tools = [
      { name: "publish.sh", description: "Verify + publish + post-publish E2E", usage: "sh publish.sh <slug> <file>" },
      { name: "verify.sh", description: "Nous static analysis + JS headless runner (test-runner/) verification", usage: "sh verify.sh <file.html>" },
      { name: "build.sh", description: "Minify src/ → dist/ (framework dev only)", usage: "sh build.sh" },
      { name: "seed.sh", description: "Upload framework assets to Convex", usage: "sh seed.sh \"$CONVEX_URL\" \"$PUBLISH_SECRET\"" },
      { name: "fragment.sh", description: "Read/write #region blocks for multi-agent collaboration", usage: "sh fragment.sh <file> <region>" },
      { name: "url.sh", description: "Look up live URLs for a slug", usage: "sh url.sh <slug>" },
      { name: "upload-img.sh", description: "Upload images to Convex storage", usage: "sh upload-img.sh <file>" },
    ];
    // Verification is now pure Node (test-runner/) — no binary to download.
    const binaries = [];
    return new Response(JSON.stringify({
      download: "GET /billing/tools/{name}",
      tools,
      binaries,
    }, null, 2), {
      status: 200,
      headers: { "Content-Type": "application/json", ...BILLING_CORS },
    });
  }),
});

// GET /billing/tools/:name — download a CLI tool
http.route({
  pathPrefix: "/billing/tools/",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const name = url.pathname.replace("/billing/tools/", "");
    if (!name || name.includes("/") || name.includes("..")) {
      return new Response("Invalid tool name", { status: 400 });
    }
    // Check file storage first (binaries)
    const cdnUrl = await ctx.runQuery(api.files.getUrl, { name });
    if (cdnUrl) {
      return Response.redirect(cdnUrl, 302);
    }
    // Then check assets table (shell scripts)
    const asset = await ctx.runQuery(api.assets.get, { name: `tools/${name}` });
    if (!asset) {
      return new Response(`Tool "${name}" not found`, { status: 404, headers: BILLING_CORS });
    }
    return new Response(asset.content, {
      status: 200,
      headers: {
        "Content-Type": "text/x-shellscript; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }),
});

// OPTIONS /billing/* — CORS preflight
http.route({
  pathPrefix: "/billing/",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, { status: 204, headers: BILLING_CORS });
  }),
});

// POST /billing/register — agent registration
http.route({
  path: "/billing/register",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const headers = { "Content-Type": "application/json", ...BILLING_CORS };
    try {
      const body = await request.json();
      const walletAddress = body.walletAddress;
      if (!walletAddress || typeof walletAddress !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
        return new Response(JSON.stringify({ error: "Invalid wallet address" }), { status: 400, headers });
      }

      const rawKey = "nv_" + generateToken();
      const apiKeyHash = await hashSecret(rawKey);
      await ctx.runMutation(internal.billing.registerKey, { apiKeyHash, walletAddress });

      return new Response(JSON.stringify({
        apiKey: rawKey,
        walletAddress,
        createdAt: new Date().toISOString(),
      }), { status: 200, headers });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message || "Registration failed" }), { status: 500, headers });
    }
  }),
});

// POST /billing/publish — metered publish
http.route({
  path: "/billing/publish",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const headers = { "Content-Type": "application/json", ...BILLING_CORS };
    try {
      const body = await request.json();
      const { slug, html, apiKey, txHash } = body;

      if (!apiKey || typeof apiKey !== "string") {
        return new Response(JSON.stringify({ error: "apiKey required" }), { status: 401, headers });
      }
      if (!slug || !SLUG_PATTERN.test(slug)) {
        return new Response(JSON.stringify({ error: "Invalid slug" }), { status: 400, headers });
      }
      if (!html || typeof html !== "string") {
        return new Response(JSON.stringify({ error: "html required" }), { status: 400, headers });
      }

      // Lookup key
      const apiKeyHash = await hashSecret(apiKey);
      const key = await ctx.runQuery(internal.billing.lookupKey, { apiKeyHash });
      if (!key) {
        return new Response(JSON.stringify({ error: "Invalid API key" }), { status: 401, headers });
      }

      // Rate limit
      const recentCount = await ctx.runQuery(internal.billing.checkRateLimit, { keyId: key._id });
      if (recentCount >= 10) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Max 10 publishes/minute." }), { status: 429, headers });
      }

      // Namespace slug
      const namespacedSlug = apiKeyHash.slice(0, 6) + "-" + slug;
      const origin = new URL(request.url).origin;
      const liveUrl = `${origin}/app/${namespacedSlug}`;

      // If txHash provided and credit insufficient, verify and credit
      if (txHash && parseFloat(key.credit) < parseFloat(PUBLISH_COST)) {
        const walletKey = await ctx.runQuery(internal.lib.getKey, { name: "BILLING_WALLET" });
        if (!walletKey) {
          return new Response(JSON.stringify({ error: "Billing not configured" }), { status: 500, headers });
        }
        try {
          const result = await ctx.runAction(internal.billingActions.verifyUsdcTx, {
            txHash,
            expectedRecipient: walletKey.value,
            minAmount: PUBLISH_COST,
          });
          await ctx.runMutation(internal.billing.creditAccount, {
            keyId: key._id,
            amount: result.amount,
            txHash,
          });
        } catch (e: any) {
          return new Response(JSON.stringify({ error: `Payment verification failed: ${e.message}` }), { status: 402, headers });
        }
      }

      // Re-read credit after potential top-up
      const freshKey = await ctx.runQuery(internal.billing.lookupKey, { apiKeyHash });
      if (!freshKey || parseFloat(freshKey.credit) < parseFloat(PUBLISH_COST)) {
        const walletKey = await ctx.runQuery(internal.lib.getKey, { name: "BILLING_WALLET" });
        return new Response(JSON.stringify({
          error: "insufficient_balance",
          paymentAddress: walletKey?.value || "NOT_CONFIGURED",
          amount: PUBLISH_COST,
          token: "USDC",
          chain: "base",
          retryWith: "txHash",
        }), { status: 402, headers });
      }

      // Publish
      await ctx.runMutation(internal.pages.publishInternal, { slug: namespacedSlug, html });

      // Deduct
      const newCredit = await ctx.runMutation(internal.billing.deductCredit, {
        keyId: freshKey._id,
        cost: PUBLISH_COST,
        slug: namespacedSlug,
        liveUrl,
        txHash,
      });

      return new Response(JSON.stringify({
        url: liveUrl,
        charged: PUBLISH_COST,
        creditRemaining: newCredit,
      }), { status: 200, headers });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message || "Publish failed" }), { status: 500, headers });
    }
  }),
});

// DELETE /billing/publish — remove a published page
http.route({
  path: "/billing/publish",
  method: "DELETE",
  handler: httpAction(async (ctx, request) => {
    const headers = { "Content-Type": "application/json", ...BILLING_CORS };
    try {
      const body = await request.json();
      const { slug, apiKey } = body;

      if (!apiKey || typeof apiKey !== "string") {
        return new Response(JSON.stringify({ error: "apiKey required" }), { status: 401, headers });
      }

      const apiKeyHash = await hashSecret(apiKey);
      const key = await ctx.runQuery(internal.billing.lookupKey, { apiKeyHash });
      if (!key) {
        return new Response(JSON.stringify({ error: "Invalid API key" }), { status: 401, headers });
      }

      const namespacedSlug = apiKeyHash.slice(0, 6) + "-" + slug;

      // Ownership check: verify this key published this slug
      const usageRecords = await ctx.runQuery(internal.billing.getUsage, { keyId: key._id });
      const ownsSlug = usageRecords.some((r: any) => r.slug === namespacedSlug);
      if (!ownsSlug) {
        return new Response(JSON.stringify({ error: "You did not publish this slug" }), { status: 403, headers });
      }

      await ctx.runMutation(internal.pages.removeInternal, { slug: namespacedSlug });

      return new Response(JSON.stringify({
        deleted: slug,
        creditRemaining: key.credit,
      }), { status: 200, headers });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message || "Delete failed" }), { status: 500, headers });
    }
  }),
});

// POST /billing/balance — check credit balance
http.route({
  path: "/billing/balance",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const headers = { "Content-Type": "application/json", ...BILLING_CORS };
    try {
      const body = await request.json();
      const { apiKey } = body;

      if (!apiKey || typeof apiKey !== "string") {
        return new Response(JSON.stringify({ error: "apiKey required" }), { status: 401, headers });
      }

      const apiKeyHash = await hashSecret(apiKey);
      const key = await ctx.runQuery(internal.billing.lookupKey, { apiKeyHash });
      if (!key) {
        return new Response(JSON.stringify({ error: "Invalid API key" }), { status: 401, headers });
      }

      return new Response(JSON.stringify({
        walletAddress: key.walletAddress,
        credit: key.credit,
        token: "USDC",
        chain: "base",
      }), { status: 200, headers });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message || "Balance check failed" }), { status: 500, headers });
    }
  }),
});

// POST /billing/usage — usage history
http.route({
  path: "/billing/usage",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const headers = { "Content-Type": "application/json", ...BILLING_CORS };
    try {
      const body = await request.json();
      const { apiKey } = body;

      if (!apiKey || typeof apiKey !== "string") {
        return new Response(JSON.stringify({ error: "apiKey required" }), { status: 401, headers });
      }

      const apiKeyHash = await hashSecret(apiKey);
      const key = await ctx.runQuery(internal.billing.lookupKey, { apiKeyHash });
      if (!key) {
        return new Response(JSON.stringify({ error: "Invalid API key" }), { status: 401, headers });
      }

      const records = await ctx.runQuery(internal.billing.getUsage, { keyId: key._id });
      const totalSpent = records.reduce((sum: number, r: any) => sum + parseFloat(r.cost), 0).toFixed(6);

      return new Response(JSON.stringify({
        publishes: records.map((r: any) => ({
          slug: r.slug,
          liveUrl: r.liveUrl,
          cost: r.cost,
          txHash: r.txHash,
          timestamp: new Date(r.timestamp).toISOString(),
        })),
        totalSpent,
        totalPublishes: records.length,
      }), { status: 200, headers });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message || "Usage check failed" }), { status: 500, headers });
    }
  }),
});

// POST /api/chat — OpenRouter proxy for chatnovoid (streams SSE)
http.route({
  path: "/api/chat",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const corsHeaders: Record<string, string> = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    try {
      const body = await request.json();
      const { messages, model } = body;
      if (!messages || !Array.isArray(messages)) {
        return new Response(JSON.stringify({ error: "messages required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      const apiKey = await ctx.runQuery(internal.nexMemory.getApiKey, { name: "OPENROUTER_KEY" });
      if (!apiKey) {
        return new Response(JSON.stringify({ error: "OPENROUTER_KEY not configured" }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://secret-aardvark-418.convex.site/app/chatnovoid",
          "X-Title": "chatnovoid",
        },
        body: JSON.stringify({
          model: model || "openai/gpt-4o-mini",
          messages,
          stream: true,
        }),
      });
      if (!upstream.ok) {
        const err = await upstream.text();
        return new Response(err, {
          status: upstream.status,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      return new Response(upstream.body, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          ...corsHeaders,
        },
      });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
  }),
});
http.route({
  path: "/api/chat",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
      },
    });
  }),
});

export default http;

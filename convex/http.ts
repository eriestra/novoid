import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

const http = httpRouter();

// GET /platform — serve the platform admin UI
http.route({
  path: "/platform",
  method: "GET",
  handler: httpAction(async (ctx) => {
    const page = await ctx.runQuery(api.pages.get, { slug: "platform" });
    if (!page) {
      return new Response("Platform page not found. Run seed first.", {
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
        "Cache-Control": "public, max-age=31536000, immutable",
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
        "Cache-Control": "public, max-age=31536000, immutable",
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

> A 15KB frontend platform designed for AI agents. CSS component library + reactive JS framework + self-hosting deployment via Convex. Single-file output, zero build tools, 2-second deploys.

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
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache",
      },
    });
  }),
});

export default http;

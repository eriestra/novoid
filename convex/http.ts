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

export default http;

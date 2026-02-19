#!/usr/bin/env node
// Helper: send a message via the active Telegram channel
// Usage: node nex-telegram.mjs "Your message here"
import { ConvexHttpClient } from "convex/browser";
import { readFileSync } from "fs";

const env = readFileSync(".env.local", "utf8");
const CONVEX_URL = env.match(/^CONVEX_URL=(.+)$/m)?.[1];
const SECRET = env.match(/^PUBLISH_SECRET=(.+)$/m)?.[1];
if (!CONVEX_URL || !SECRET) { console.error("Missing .env.local"); process.exit(1); }

const message = process.argv[2];
if (!message) { console.error("Usage: node nex-telegram.mjs \"message\""); process.exit(1); }

const client = new ConvexHttpClient(CONVEX_URL);
const channels = await client.query("nex:channels", { orgId: "default" });
const tg = channels.find(c => c.type === "telegram" && c.status === "active");
if (!tg) { console.error("No active Telegram channel"); process.exit(1); }

await client.mutation("nex:createJob", {
  orgId: "default",
  type: "channel",
  payload: JSON.stringify({ channelType: "telegram", channelId: tg._id, text: message }),
  secret: SECRET,
});
console.log("✓ Telegram message queued");

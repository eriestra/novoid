"use node";
import { action } from "./_generated/server";
import { v } from "convex/values";
import { verifySecret } from "./lib";

// Browse a URL via novoid-cdp and return structured JSON
export const browse = action({
  args: {
    url: v.string(),
    extract: v.optional(v.string()),   // "text" | "links" | "tables" | "inputs" | "novoid"
    snap: v.optional(v.boolean()),
    secret: v.string(),
  },
  handler: async (ctx, { url, extract, snap, secret }) => {
    await verifySecret(ctx, secret);

    const args = ["--headless", "-c", url];
    if (snap) args.push("--snap");
    if (extract) args.push("--extract", extract);

    const result = await runCdp(args);
    return JSON.parse(result);
  },
});

// Screenshot a URL via novoid-cdp
export const screenshot = action({
  args: {
    url: v.string(),
    secret: v.string(),
  },
  handler: async (ctx, { url, secret }) => {
    await verifySecret(ctx, secret);

    const tmpPath = `/tmp/cdp-screenshot-${Date.now()}.png`;
    const args = ["--headless", url, "--screenshot", tmpPath, "-c"];

    await runCdp(args);

    // Read the screenshot file and upload to Convex storage
    const fs = await import("node:fs");
    const bytes = fs.readFileSync(tmpPath);
    fs.unlinkSync(tmpPath);

    const blob = new Blob([bytes], { type: "image/png" });
    const storageId = await ctx.storage.store(blob);
    const storageUrl = await ctx.storage.getUrl(storageId);

    return { storageId, url: storageUrl };
  },
});

// Run a JSON command script
export const script = action({
  args: {
    scriptJson: v.string(),   // JSON command script content
    secret: v.string(),
  },
  handler: async (ctx, { scriptJson, secret }) => {
    await verifySecret(ctx, secret);

    // Write script to temp file
    const fs = await import("node:fs");
    const tmpPath = `/tmp/cdp-script-${Date.now()}.json`;
    fs.writeFileSync(tmpPath, scriptJson);

    const args = ["--headless", "-c", "--script", tmpPath];
    const result = await runCdp(args);
    fs.unlinkSync(tmpPath);

    return JSON.parse(result);
  },
});

// Spawn novoid-cdp subprocess and return stdout
async function runCdp(args: string[]): Promise<string> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);

  // Binary path — relative to project root
  const bin = "./cdp/target/debug/novoid-cdp";

  try {
    const { stdout } = await execFileAsync(bin, args, {
      timeout: 30000,
      maxBuffer: 5 * 1024 * 1024,
    });
    return stdout;
  } catch (e: any) {
    throw new Error(`novoid-cdp failed: ${e.stderr || e.message}`);
  }
}

#!/usr/bin/env node
/**
 * nex-watch.js — Local worker for the Nex autonomous agent.
 *
 * Polls for pending Nex jobs, claims them, routes by type (chat, memorize,
 * recall, canvas), and streams progress back to Convex.
 *
 * Usage:
 *   node nex-watch.js
 *
 * Reads .env.local automatically — no `source` needed.
 */

const { ConvexHttpClient } = require("convex/browser");
const { spawn } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// ── Load .env.local ──
function loadEnv() {
  const envPath = path.resolve(__dirname, ".env.local");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv();

const CONVEX_URL = process.env.CONVEX_URL;
const SITE_URL = process.env.CONVEX_SITE_URL;
const SECRET = process.env.PUBLISH_SECRET;

if (!CONVEX_URL || !SECRET) {
  console.error("Missing CONVEX_URL or PUBLISH_SECRET in .env.local");
  process.exit(1);
}

const client = new ConvexHttpClient(CONVEX_URL);
const POLL_MS = 2000;
const AGENT_ID = "nex-" + Date.now().toString().slice(-5);
const CAPABILITIES = (process.env.NEX_CAPABILITIES || "chat,build,canvas,memorize,recall,heartbeat,voice,channel,skill,upskill").split(",").map(s => s.trim());

// Load novoid API reference for inline app generation
let NOVOID_REFERENCE = "";
try {
  NOVOID_REFERENCE = fs.readFileSync(path.resolve(__dirname, "AGENTS.md"), "utf-8");
} catch {
  console.log("  ⚠ AGENTS.md not found — inline apps won't use novoid framework");
}

// ── Active process tracking (concurrency) ──
let activeProc = null; // { proc, jobId, type, prompt, startedAt, conversationId, orgId }

// ── Heartbeat Approval Queue (persisted in Convex nex_approvals table) ──
const APPROVAL_TIMEOUT_MS = 600000; // 10min to respond before auto-skip
const APPROVAL_BATCH_WINDOW_MS = 30000; // 30s window to batch multiple findings
let pendingBatch = null; // { batchId, items: [], chatId, orgId, timer }

// ── Proactive idle tracking ──
let lastJobCompletedAt = Date.now();
let lastProactiveAt = 0;
const IDLE_THRESHOLD_MS = 60000;      // 60s idle before proactive work
const PROACTIVE_COOLDOWN_MS = 300000; // 5min between proactive tasks

// Proactive work types — rotated through
const PROACTIVE_TYPES = [
  {
    subtype: "tidy",
    prompt: [
      "You are Nex performing proactive memory housekeeping.",
      "1. Recall recent short-term memories and check if any should be promoted to long-term",
      "2. Look for duplicate or near-duplicate memories that can be consolidated",
      "3. Check for expired or stale memories that should be cleaned up",
      "Be concise. If nothing needs attention, respond with HEARTBEAT_OK.",
    ].join("\n"),
  },
  {
    subtype: "sentinel",
    prompt: [
      "You are Nex performing proactive Sentinel error scanning.",
      "Check for runtime errors on recently published apps by running:",
      "  npx convex run errors:recent '{}'",
      "If errors are found, list them with the app slug. Otherwise respond with HEARTBEAT_OK.",
    ].join("\n"),
  },
  {
    subtype: "review",
    prompt: [
      "You are Nex performing a proactive spec/task review.",
      "Check memory for any tasks, TODOs, or goals the user mentioned but haven't been completed.",
      "Summarize what's pending. If nothing, respond with HEARTBEAT_OK.",
    ].join("\n"),
  },
  {
    subtype: "followup",
    prompt: [
      "You are Nex performing proactive conversation follow-up.",
      "Check recent conversations for loose ends — questions you didn't fully answer,",
      "promises to do something later, or user requests that were deferred.",
      "Summarize anything pending. If nothing, respond with HEARTBEAT_OK.",
    ].join("\n"),
  },
];

console.log(`\n  ✦ nex-watch started (agent: ${AGENT_ID})`);
console.log(`  ✦ connected to ${CONVEX_URL}`);
if (SITE_URL) console.log(`  ✦ site: ${SITE_URL}`);
if (SITE_URL) {
  const nexUrl = `${SITE_URL}/app/nex`;
  const lockFile = path.resolve(__dirname, ".nex-opened");
  const alreadyOpened = fs.existsSync(lockFile) && (Date.now() - fs.statSync(lockFile).mtimeMs) < 3600000; // 1hr
  if (!alreadyOpened) {
    console.log(`  ✦ opening ${nexUrl}`);
    const openCmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
    spawn(openCmd, [nexUrl], { detached: true, stdio: "ignore" }).unref();
    fs.writeFileSync(lockFile, AGENT_ID);
  } else {
    console.log(`  ✦ nex UI already open: ${nexUrl}`);
  }
}
console.log(`  ✦ capabilities: ${CAPABILITIES.join(", ")}`);
console.log(`  ✦ waiting for jobs...\n`);

// ── Orphan Cleanup ──
(async function cleanupOrphans() {
  try {
    const jobs = await client.query("nex:streamJobs");
    const orphans = (jobs || []).filter(j => j.status === "building" || j.status === "claimed");
    if (orphans.length > 0) {
      for (const j of orphans) {
        await client.mutation("nex:completeJob", {
          jobId: j._id,
          result: "Stale — worker restarted",
          secret: SECRET,
        });
      }
      console.log(`  ✦ cleaned up ${orphans.length} orphaned job(s)`);
    }
  } catch (e) {
    console.log(`  ⚠ orphan cleanup failed: ${e.message}`);
  }
})();

// ── Agent Registration ──
async function registerSelf() {
  try {
    await client.mutation("nex:registerAgent", {
      agentId: AGENT_ID,
      orgId: "default",
      capabilities: CAPABILITIES,
      secret: SECRET,
    });
    console.log(`  ✦ registered as ${AGENT_ID}`);
  } catch (e) {
    console.log(`  ⚠ agent registration failed: ${e.message}`);
  }
}

// ── Agent Heartbeat Ping (every 10s) ──
let agentPingInterval = null;
function startAgentPing() {
  agentPingInterval = setInterval(async () => {
    try {
      await client.mutation("nex:agentPing", {
        agentId: AGENT_ID,
        status: activeProc ? "busy" : "idle",
        currentJobId: activeProc ? activeProc.jobId : undefined,
        secret: SECRET,
      });
    } catch {
      // Silent — will retry
    }
  }, 10000);
}

// ── Graceful Shutdown ──
async function gracefulShutdown() {
  console.log(`\n  ✦ shutting down ${AGENT_ID}...`);
  if (agentPingInterval) clearInterval(agentPingInterval);
  try {
    await client.mutation("nex:deregisterAgent", {
      agentId: AGENT_ID,
      secret: SECRET,
    });
    console.log(`  ✦ deregistered`);
  } catch (e) {
    console.log(`  ⚠ deregister failed: ${e.message}`);
  }
  process.exit(0);
}
process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

// ── Signal Polling ──
async function checkSignals() {
  try {
    const signals = await client.query("nex:mySignals", {
      agentId: AGENT_ID,
      status: "pending",
    });
    if (!signals || signals.length === 0) return;

    for (const signal of signals) {
      let payload;
      try { payload = JSON.parse(signal.payload); } catch { payload = {}; }
      console.log(`  ◆ signal [${signal.type}] from ${signal.fromAgent}: ${JSON.stringify(payload).slice(0, 80)}`);

      // Acknowledge
      await client.mutation("nex:ackSignal", { signalId: signal._id, secret: SECRET });

      // Handle signal types
      switch (signal.type) {
        case "delegate": {
          // Create a job from the delegation
          if (payload.jobType && payload.jobPayload) {
            await client.mutation("nex:createJob", {
              orgId: signal.orgId,
              type: payload.jobType,
              payload: typeof payload.jobPayload === "string" ? payload.jobPayload : JSON.stringify(payload.jobPayload),
              conversationId: signal.conversationId || undefined,
              secret: SECRET,
            });
            console.log(`    delegated → created ${payload.jobType} job`);
          }
          break;
        }
        case "cancel": {
          // If we're working on the referenced job, kill it
          if (activeProc && payload.jobId && activeProc.jobId === payload.jobId) {
            if (activeProc.proc) try { activeProc.proc.kill("SIGTERM"); } catch {}
            activeProc = null;
            console.log(`    cancelled active job`);
          }
          break;
        }
        case "notify":
        case "request":
        case "response":
          // Log for now — future: route to conversation or handler
          console.log(`    signal noted`);
          break;
      }
    }
  } catch {
    // Silent
  }
}

// ── Proactive Idle Detection ──

async function checkIdleProactive() {
  // Don't run if busy, or if cooldown hasn't elapsed
  if (activeProc) return;
  const now = Date.now();
  if (now - lastJobCompletedAt < IDLE_THRESHOLD_MS) return;
  if (now - lastProactiveAt < PROACTIVE_COOLDOWN_MS) return;

  // Check heartbeat config — only run proactive work if heartbeat is enabled
  try {
    const config = await client.query("nex:heartbeatConfig", { orgId: "default" });
    if (!config || !config.enabled) return;

    // Check active hours
    if (config.activeHours) {
      const { start, end, timezone } = config.activeHours;
      try {
        const formatter = new Intl.DateTimeFormat("en-US", {
          hour: "2-digit", minute: "2-digit", hour12: false, timeZone: timezone,
        });
        const currentTime = formatter.format(new Date());
        if (currentTime < start || currentTime > end) return;
      } catch {}
    }
  } catch {
    return; // Can't read config — skip
  }

  // Pick the next proactive task via rotation
  let rotationIdx = 0;
  try {
    const config = await client.query("nex:heartbeatConfig", { orgId: "default" });
    if (config && config.rotationState) {
      try { rotationIdx = parseInt(config.rotationState, 10) || 0; } catch {}
    }
  } catch {}

  const task = PROACTIVE_TYPES[rotationIdx % PROACTIVE_TYPES.length];
  const nextIdx = (rotationIdx + 1) % PROACTIVE_TYPES.length;

  console.log(`  ♻ proactive: ${task.subtype} (idle ${Math.round((now - lastJobCompletedAt) / 1000)}s)`);
  lastProactiveAt = now;

  // Create a heartbeat job with the proactive subtype
  try {
    await client.mutation("nex:createJob", {
      orgId: "default",
      type: "heartbeat",
      payload: JSON.stringify({
        checklist: task.prompt,
        subtype: task.subtype,
        proactive: true,
      }),
      secret: SECRET,
    });

    // Update rotation state
    await client.mutation("nex:updateHeartbeat", {
      orgId: "default",
      rotationState: String(nextIdx),
      secret: SECRET,
    });
  } catch (e) {
    console.log(`  ⚠ proactive job creation failed: ${e.message}`);
  }
}

// ── Heartbeat (Phase 2) ──
let heartbeatTimer = null;
let lastHeartbeatCheck = 0;

async function checkHeartbeat() {
  try {
    const config = await client.query("nex:heartbeatConfig", { orgId: "default" });
    if (!config || !config.enabled) return;

    const now = Date.now();
    const interval = config.intervalMs || 1800000;

    // Check if within active hours
    if (config.activeHours) {
      const { start, end, timezone } = config.activeHours;
      try {
        const formatter = new Intl.DateTimeFormat("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          timeZone: timezone,
        });
        const currentTime = formatter.format(new Date());
        if (currentTime < start || currentTime > end) return;
      } catch {}
    }

    // Check if enough time has passed since last run
    const lastRun = config.lastRunAt || 0;
    if (now - lastRun < interval) return;

    console.log(`  ♥ heartbeat triggered (interval: ${interval / 1000}s)`);

    // Create single heartbeat job with full checklist
    await client.mutation("nex:createJob", {
      orgId: "default",
      type: "heartbeat",
      payload: JSON.stringify({ checklist: config.checklist }),
      secret: SECRET,
    });

    // Update lastRunAt
    await client.mutation("nex:updateHeartbeat", {
      orgId: "default",
      lastRunAt: now,
      secret: SECRET,
    });
  } catch (e) {
    // Silent — will retry next cycle
  }
}

// ── Poll for jobs ──
async function checkJobs() {
  try {
    const jobs = await client.query("nex:pendingJobs");
    if (!jobs || jobs.length === 0) return;

    for (const job of jobs) {
      // Capability-based filtering — skip jobs this worker can't handle
      const jobType = job.type || "default";
      if (!CAPABILITIES.includes(jobType) && jobType !== "default") continue;

      const preview = (job.prompt || job.type || "").slice(0, 80);
      console.log(`  → job [${jobType}]: "${preview}${preview.length >= 80 ? "..." : ""}"`);

      // ── Concurrency: if a heavy job is active and this is a chat, classify interrupt ──
      if (activeProc && job.type === "chat") {
        let payload;
        try { payload = JSON.parse(job.payload || "{}"); } catch { payload = {}; }
        const text = payload.text || "";

        // Claim first
        try {
          await client.mutation("nex:claimJob", { jobId: job._id, agentId: AGENT_ID, secret: SECRET });
        } catch (e) { console.log(`  → skip (already claimed): ${e.message}`); continue; }

        await client.mutation("nex:updateJob", { jobId: job._id, status: "building", secret: SECRET });

        const tier = classifyInterrupt(text);
        if (tier === 1) {
          try {
            await handleQuickReply(job, activeProc);
          } catch (e) {
            await client.mutation("nex:failJob", { jobId: job._id, result: e.message || String(e), secret: SECRET }).catch(() => {});
            console.log(`  ✗ quick reply error: ${e.message}\n`);
          }
          continue; // Don't process as normal — active job keeps running
        } else {
          // Tier 2: interrupt
          try {
            await handleInterrupt(job, activeProc);
          } catch (e) {
            await client.mutation("nex:failJob", { jobId: job._id, result: e.message || String(e), secret: SECRET }).catch(() => {});
            console.log(`  ✗ interrupt error: ${e.message}\n`);
          }
          console.log(`  ✓ done (interrupted)\n`);
          continue;
        }
      }

      // ── If a heavy job is running and this isn't chat, skip until it finishes ──
      if (activeProc && job.type !== "chat") {
        continue; // Will pick up next cycle
      }

      // Claim
      try {
        await client.mutation("nex:claimJob", {
          jobId: job._id,
          agentId: AGENT_ID,
          secret: SECRET,
        });
      } catch (e) {
        console.log(`  → skip (already claimed): ${e.message}`);
        continue;
      }

      // Route by job type
      try {
        await client.mutation("nex:updateJob", {
          jobId: job._id,
          status: "building",
          secret: SECRET,
        });

        const jobType = job.type || "default";

        switch (jobType) {
          case "chat":
            await handleChat(job);
            break;
          case "memorize":
            await handleMemorize(job);
            break;
          case "recall":
            await handleRecall(job);
            break;
          case "canvas":
            await handleCanvas(job);
            break;
          case "heartbeat":
            await handleHeartbeat(job);
            break;
          case "voice":
            await handleVoice(job);
            break;
          case "channel":
            await handleChannel(job);
            break;
          case "skill":
            await handleSkill(job);
            break;
          case "upskill":
            await handleUpskill(job);
            break;
          default:
            await handleDefault(job);
            break;
        }

        console.log(`  ✓ done\n`);
        lastJobCompletedAt = Date.now();
      } catch (e) {
        await client.mutation("nex:failJob", {
          jobId: job._id,
          result: e.message || String(e),
          secret: SECRET,
        }).catch(() => {});
        console.log(`  ✗ error: ${e.message}\n`);
        lastJobCompletedAt = Date.now();
      }
    }
  } catch (e) {
    // Silent on network errors — will retry
  }
}

// ── Job Handlers ──

async function handleChat(job) {
  let payload;
  try {
    payload = JSON.parse(job.payload || job.prompt || "{}");
  } catch {
    payload = { text: job.prompt || "" };
  }

  const { text, conversationId, images } = payload;
  const orgId = payload.orgId || job.orgId || "default";

  if (!text && (!images || images.length === 0)) {
    throw new Error("Chat job requires text or images in payload");
  }

  // Write attached images to /tmp/ for Claude CLI
  const imagePaths = [];
  if (images && Array.isArray(images)) {
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      if (!img.dataUrl) continue;
      const base64Data = img.dataUrl.replace(/^data:image\/\w+;base64,/, "");
      const ext = (img.dataUrl.match(/^data:image\/(\w+)/) || [])[1] || "jpg";
      const tmpPath = `/tmp/nex-img-${job._id}-${i}.${ext}`;
      fs.writeFileSync(tmpPath, Buffer.from(base64Data, "base64"));
      imagePaths.push(tmpPath);
      console.log(`    wrote image: ${tmpPath} (${Math.round(base64Data.length * 0.75 / 1024)}KB)`);
    }
  }

  // Download Telegram image if imageFileId is present
  if (payload.imageFileId) {
    try {
      const orgId2 = payload.orgId || job.orgId || "default";
      const channels = await client.query("nex:channels", { orgId: orgId2 });
      const ch = channels.find((c) => c.type === "telegram");
      if (ch) {
        const config = JSON.parse(ch.config);
        const botToken = config.botToken;
        if (botToken) {
          console.log(`    downloading telegram image...`);
          const fileRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${payload.imageFileId}`);
          const fileData = await fileRes.json();
          if (fileData.ok && fileData.result.file_path) {
            const imgUrl = `https://api.telegram.org/file/bot${botToken}/${fileData.result.file_path}`;
            const imgRes = await fetch(imgUrl);
            const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
            const ext = fileData.result.file_path.split(".").pop() || "jpg";
            const tmpPath = `/tmp/nex-img-${job._id}-tg.${ext}`;
            fs.writeFileSync(tmpPath, imgBuffer);
            imagePaths.push(tmpPath);
            console.log(`    telegram image downloaded: ${tmpPath} (${Math.round(imgBuffer.byteLength / 1024)}KB)`);
          }
        }
      }
    } catch (e) {
      console.log(`    telegram image download failed (non-fatal): ${e.message}`);
    }
  }

  // Check if message is a slash command → route to skill handler
  if (text.startsWith("/")) {
    const parts = text.split(" ");
    const command = parts[0];
    const args = parts.slice(1).join(" ");
    try {
      const skills = await client.query("nex:skills", { orgId });
      const skill = skills.find((s) => s.command === command && s.enabled);
      if (skill) {
        console.log(`    routing to skill: ${command}`);
        const skillResult = await handleSkill({
          ...job,
          payload: JSON.stringify({ command, args, orgId, conversationId }),
        });

        // Save skill result as assistant message in conversation
        if (conversationId) {
          try {
            await client.mutation("nex:addMessage", {
              conversationId,
              role: "assistant",
              content: skillResult,
              secret: SECRET,
            });
          } catch (e) {
            console.log(`    skill message save failed (non-fatal): ${e.message}`);
          }
        }

        // Queue reply to channel if message came from one
        if (payload.channel && payload.replyTo) {
          console.log(`    queued skill reply to ${payload.channel}`);
          await client.mutation("nex:createJob", {
            orgId,
            type: "channel",
            payload: JSON.stringify({
              channelType: payload.channel,
              replyTo: payload.replyTo,
              text: skillResult,
            }),
            secret: SECRET,
          });
        }

        return;
      }
    } catch (e) {
      console.log(`    skill lookup failed (non-fatal): ${e.message}`);
    }
  }

  // ── Handle Telegram callback queries (inline keyboard) ──
  if (payload.callbackQuery && text === "__callback_query__") {
    const cbq = payload.callbackQuery;
    try {
      const channels = await client.query("nex:channels", { orgId });
      const tgCh = channels.find((c) => c.type === "telegram");
      if (tgCh) {
        let cfg = {};
        try { cfg = JSON.parse(tgCh.config); } catch {}
        if (cfg.botToken) {
          await handleCallbackQuery({
            id: cbq.id,
            data: cbq.data,
            message: { chat: { id: cbq.chatId }, message_id: cbq.messageId, text: cbq.messageText },
          }, cfg.botToken);
        }
      }
    } catch (e) {
      console.log(`    callback query error: ${e.message}`);
    }
    await client.mutation("nex:completeJob", { jobId: job._id, result: "callback handled", secret: SECRET });
    return;
  }

  // ── Check for approval responses (YES/NO text from Telegram) ──
  if (payload.channel === "telegram") {
    const lower = (text || "").toLowerCase().trim();
    const isApproval = /^(yes|approve|go|go ahead|do it|ok|y|si|sí|sure|let'?s go|proceed|adelante)$/i.test(lower);
    const isDenial = /^(no|skip|nah|nope|n|deny|cancel|stop|hold|wait|not now)$/i.test(lower);

    if (isApproval || isDenial) {
      const handled = await handleApprovalResponse(payload.replyTo, orgId, isApproval, job);
      if (handled) return;
    }
  }

  // Auto-create conversation for channel-originated messages (reuse existing)
  let convId = conversationId;
  if (!convId && payload.channel) {
    const channelTitle = `${payload.channel}:${payload.replyTo || "unknown"}`;
    try {
      // Look for existing conversation with this channel+chatId
      const convos = await client.query("nex:conversations", { orgId });
      const existing = convos.find((c) => c.title === channelTitle);
      if (existing) {
        convId = existing._id;
        console.log(`    reusing conversation for ${channelTitle}`);
      } else {
        convId = await client.mutation("nex:createConversation", {
          orgId,
          title: channelTitle,
          secret: SECRET,
        });
        console.log(`    created conversation for ${channelTitle}`);
      }
    } catch (e) {
      console.log(`    conversation lookup/creation failed (non-fatal): ${e.message}`);
    }
  }

  // Auto-save chatId to channel config so outbound messages (heartbeat alerts) work
  if (payload.channel === "telegram" && payload.replyTo) {
    try {
      const channels = await client.query("nex:channels", { orgId });
      const ch = channels.find((c) => c.type === "telegram");
      if (ch) {
        let cfg = {};
        try { cfg = JSON.parse(ch.config); } catch {}
        if (!cfg.chatId || cfg.chatId !== payload.replyTo) {
          cfg.chatId = payload.replyTo;
          await client.mutation("nex:configureChannel", {
            orgId, type: "telegram", name: ch.name,
            config: JSON.stringify(cfg), secret: SECRET,
          });
          console.log(`    saved chatId ${payload.replyTo} to telegram channel config`);
        }
      }
    } catch (e) {
      console.log(`    chatId save failed (non-fatal): ${e.message}`);
    }
  }

  // 0. Save user message (only for channel-originated — UI already saves its own)
  if (convId && payload.channel) {
    try {
      // Convert downloaded images to base64 data URLs for storage
      const imageDataUrls = [];
      for (const p of imagePaths) {
        try {
          const buf = fs.readFileSync(p);
          const ext = p.split(".").pop() || "jpg";
          const mime = ext === "png" ? "image/png" : ext === "gif" ? "image/gif" : "image/jpeg";
          imageDataUrls.push(`data:${mime};base64,${buf.toString("base64")}`);
        } catch {}
      }
      await client.mutation("nex:addMessage", {
        conversationId: convId,
        role: "user",
        content: text,
        images: imageDataUrls.length > 0 ? imageDataUrls : undefined,
        secret: SECRET,
      });
    } catch (e) {
      console.log(`    user message save failed (non-fatal): ${e.message}`);
    }
  }

  // 1. Fetch conversation history (needed for auto-crosstalk calculation)
  let history = [];
  try {
    history = convId ? await client.query("nex:messages", { conversationId: convId }) : [];
    // Exclude the message we just added (last user msg) — it's the current input
    if (history.length > 0 && history[history.length - 1].role === "user") {
      history = history.slice(0, -1);
    }
    // Keep last 20 messages for context
    if (history.length > 20) history = history.slice(-20);
    console.log(`    loaded ${history.length} history message(s)`);
  } catch (e) {
    console.log(`    history fetch failed (non-fatal): ${e.message}`);
  }

  // 2. Recall memory context (auto-crosstalk)
  // Auto-crosstalk: new/short conversations spread wide to pull relevant context,
  // deep conversations stay focused on their own thread
  //   0-2 msgs → 0.8 (wide spread), 3-6 → 0.5 (balanced), 7+ → 0.2 (focused)
  let memories = [];
  const convCrosstalk = history.length <= 2 ? 0.8
    : history.length <= 6 ? 0.5
    : 0.2;
  if (orgId) {
    try {
      memories = await client.action("nexMemory:recall", {
        orgId,
        query: text,
        conversationId: convId || undefined,
        crosstalk: convCrosstalk,
        limit: 20,
      });
      console.log(`    recalled ${memories.length} memory fragment(s) (auto-crosstalk: ${convCrosstalk}, msgs: ${history.length})`);
    } catch (e) {
      console.log(`    memory recall failed (non-fatal): ${e.message}`);
    }
  }

  // 3. Build prompt with system identity + memory context + history
  const promptParts = [];
  promptParts.push("You are Nex, an autonomous AI agent running inside the no∅ (novoid) platform.");
  promptParts.push("You have persistent memory (hybrid RAG), can build no∅ apps, and communicate across channels.");
  promptParts.push("You run as a local worker (nex-watch.js) that relays through Claude Code CLI.");
  const isChannel = !!payload.channel;
  if (isChannel) {
    promptParts.push("IMPORTANT: This message comes from a chat channel. Keep replies SHORT — 2-3 sentences max. No code blocks unless explicitly asked. No bullet lists unless essential.\n");
  } else {
    promptParts.push("Be concise, helpful, and aware of your own capabilities.");
  promptParts.push("CRITICAL MATH RULE — ZERO TOLERANCE: When writing ANY math formula, output ONLY the TeX version ($$...$$ for display, $...$ for inline). NEVER output a plain-text or Unicode restatement of the same formula. For example, write $$F = G\\frac{m_1 m_2}{r^2}$$ and NOTHING else — no 'F = Gm1m2/r2' line. This applies everywhere: in markdown responses AND inside inline app HTML. One formula = one representation. Violations cause rendering bugs.");
    promptParts.push("When the user's request is best answered with interactive UI (tables with actions, forms, dashboards, data visualizations), respond with an inline app using this format:");
    promptParts.push("---app---");
    promptParts.push("<full no∅ HTML here>");
    promptParts.push("---/app---");
    promptParts.push("Optional caption text here.");
    promptParts.push("Only use inline apps when interactivity adds real value. Use text/markdown for simple answers.");
    promptParts.push("");
    promptParts.push("=== INLINE APP RULES ===");
    promptParts.push("Inline apps MUST use the no∅ (novoid) framework — not raw HTML/CSS/JS.");
    promptParts.push("Use ABSOLUTE URLs for framework assets (since apps render in srcdoc iframes):");
    promptParts.push(`  CSS: <link rel="stylesheet" href="${SITE_URL}/css/core.min.css">`);
    promptParts.push(`  CSS: <link rel="stylesheet" href="${SITE_URL}/css/components.min.css">`);
    promptParts.push(`  JS:  <script src="${SITE_URL}/js/core.min.js"><` + `/script>`);
    promptParts.push(`  JS:  <script src="${SITE_URL}/js/toast.min.js"><` + `/script>`);
    promptParts.push("Use nv-* CSS classes, Novoid.signal(), Novoid.h(), Novoid.mount(), etc.");
    promptParts.push("NEVER use inline onclick/onchange attributes — always use addEventListener or Novoid h() event props (onClick, onInput, etc.).");
    promptParts.push("Always wrap in (function(){ ... })() inside <script> blocks.");
    if (NOVOID_REFERENCE) {
      promptParts.push("");
      promptParts.push("=== NOVOID API REFERENCE ===");
      promptParts.push(NOVOID_REFERENCE);
      promptParts.push("=== END REFERENCE ===");
    }
    promptParts.push("");
  }

  if (memories.length > 0) {
    promptParts.push("=== MEMORY CONTEXT ===");
    for (const mem of memories) {
      promptParts.push(`[${mem.type || "memory"}] ${mem.content}`);
    }
    promptParts.push("=== END MEMORY ===\n");
  }

  if (history.length > 0) {
    promptParts.push("=== CONVERSATION HISTORY ===");
    for (const msg of history) {
      promptParts.push(`${msg.role === "user" ? "User" : "Nex"}: ${msg.content}`);
    }
    promptParts.push("=== END HISTORY ===\n");
  }
  if (payload.interruptContext) {
    promptParts.push(`\n${payload.interruptContext}\n`);
  }
  promptParts.push(`User: ${text}`);

  const fullPrompt = promptParts.join("\n");

  // 4. Spawn claude (interruptible — polls for new messages while running)
  let response;
  try {
    response = await askClaudeInterruptible(fullPrompt, job._id, {
      trackAsActive: true,
      jobType: "chat",
      conversationId: convId,
      orgId,
      checkInterval: 3000,
      imagePaths,
    });
  } finally {
    // Clean up temp images even if interrupted/killed
    for (const p of imagePaths) { try { fs.unlinkSync(p); } catch {} }
  }
  console.log(`  → claude finished`);

  // 4. Write assistant message (detect inline app blocks)
  // Strip math duplicate lines from response before storing
  response = stripMathDuplicates(response);

  if (convId) {
    var appMatch = response.match(/---app---\n([\s\S]*?)\n---\/app---/);
    if (appMatch) {
      var appHtml = stripMathDuplicates(appMatch[1].trim());
      var caption = response.replace(/---app---\n[\s\S]*?\n---\/app---/, '').trim();
      // Patch KaTeX to use mathml-only output (no CSS dependency, no duplicates)
      var mathCssFix = '<style>.katex-html{display:none!important;}.katex-mathml{display:block!important;position:static!important;clip:auto!important;width:auto!important;height:auto!important;overflow:visible!important;}</style>' +
        '<' + 'script>document.addEventListener("DOMContentLoaded",function(){if(window.katex){var orig=katex.render;katex.render=function(t,e,o){o=o||{};o.output="mathml";return orig.call(katex,t,e,o);};}});</' + 'script>';
      var resizeSnippet = '<' + 'script>new ResizeObserver(function(){var cv=document.querySelector("canvas");var h=cv?Math.max(cv.height,cv.offsetHeight,300):document.body.scrollHeight;parent.postMessage({type:"nex-app-resize",height:h},"*")}).observe(document.body);</' + 'script>';
      var injected = mathCssFix + resizeSnippet;
      if (appHtml.indexOf('</body>') !== -1) {
        appHtml = appHtml.replace('</body>', injected + '</body>');
      } else {
        appHtml = appHtml + injected;
      }
      await client.mutation("nex:addMessage", {
        conversationId: convId,
        role: "assistant",
        content: caption || "",
        appHtml: appHtml,
        type: "app",
        memoryContext: JSON.stringify(memories),
        secret: SECRET,
      });
      console.log(`    stored inline app message`);
    } else {
      await client.mutation("nex:addMessage", {
        conversationId: convId,
        role: "assistant",
        content: response,
        memoryContext: JSON.stringify(memories),
        secret: SECRET,
      });
    }
  }

  // 5. If this came from a channel, send response back
  if (payload.channel && payload.replyTo) {
    try {
      await client.mutation("nex:createJob", {
        orgId: orgId || "default",
        type: "channel",
        payload: JSON.stringify({
          channelType: payload.channel,
          text: response.slice(0, 2000),
          replyTo: payload.replyTo,
          sendAsVoice: !!payload.isVoice,
        }),
        secret: SECRET,
      });
      console.log(`    queued reply to ${payload.channel}${payload.isVoice ? " (voice)" : ""}`);
    } catch (e) {
      console.log(`    channel reply failed: ${e.message}`);
    }
  }

  // 6. Auto-memorize the exchange
  if (orgId) {
    try {
      await client.action("nexMemory:memorize", {
        orgId,
        content: "User: " + text + "\nAssistant: " + response.slice(0, 500),
        type: "conversation",
        conversationId: convId || undefined,
      });
      console.log(`    memorized exchange`);
    } catch (e) {
      console.log(`    memorize failed (non-fatal): ${e.message}`);
    }
  }

  // 6. Complete job
  await client.mutation("nex:completeJob", {
    jobId: job._id,
    result: response.slice(0, 2000),
    secret: SECRET,
  });
}

async function handleVoice(job) {
  let payload;
  try {
    payload = JSON.parse(job.payload || "{}");
  } catch {
    throw new Error("Invalid voice job payload");
  }

  const { fileId, channel, replyTo, messageId, mimeType } = payload;
  if (!fileId) throw new Error("Voice job requires fileId");

  const orgId = payload.orgId || job.orgId || "default";

  // 1. Get bot token from channel config
  let botToken;
  try {
    const channels = await client.query("nex:channels", { orgId });
    const ch = channels.find((c) => c.type === "telegram");
    if (ch) {
      const config = JSON.parse(ch.config);
      botToken = config.botToken;
    }
  } catch {}
  if (!botToken) throw new Error("Telegram bot token not found in channel config");

  // 2. Get file path from Telegram
  console.log(`    downloading voice file...`);
  const fileRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`);
  const fileData = await fileRes.json();
  if (!fileData.ok || !fileData.result.file_path) {
    throw new Error("Failed to get file path from Telegram");
  }

  // 3. Download the audio file
  const audioUrl = `https://api.telegram.org/file/bot${botToken}/${fileData.result.file_path}`;
  const audioRes = await fetch(audioUrl);
  const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
  console.log(`    audio downloaded (${Math.round(audioBuffer.byteLength / 1024)}KB)`);

  // 3b. Transcribe via Groq Whisper (accepts OGG natively — no ffmpeg needed)
  loadEnv(); // reload in case key was added after startup
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) throw new Error("GROQ_API_KEY not found in .env.local");

  console.log(`    transcribing via Groq Whisper...`);
  const boundary = "----GroqWhisper" + Date.now();
  const formParts = [
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="voice.ogg"\r\nContent-Type: audio/ogg\r\n\r\n`),
    audioBuffer,
    Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-large-v3-turbo\r\n--${boundary}--\r\n`),
  ];
  const formBody = Buffer.concat(formParts);

  const transcribeRes = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${groqKey}`,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body: formBody,
  });

  if (!transcribeRes.ok) {
    const errText = await transcribeRes.text();
    throw new Error(`Groq transcription failed: ${transcribeRes.status} ${errText.slice(0, 200)}`);
  }

  const transcribeData = await transcribeRes.json();
  const transcription = transcribeData.text?.trim();
  if (!transcription) throw new Error("Empty transcription result");

  console.log(`    transcribed: "${transcription.slice(0, 80)}${transcription.length > 80 ? "..." : ""}"`);

  // 6. Feed transcription into handleChat as if user typed it
  const chatPayload = JSON.stringify({
    text: transcription,
    channel,
    replyTo,
    messageId,
    orgId,
    isVoice: true, // flag so reply handler knows to send voice back
  });

  // Reuse the same job but route through chat
  const originalPayload = job.payload;
  job.payload = chatPayload;
  await handleChat(job);
  job.payload = originalPayload;
}

async function handleMemorize(job) {
  let payload;
  try {
    payload = JSON.parse(job.payload || job.prompt || "{}");
  } catch {
    throw new Error("Invalid payload JSON for memorize job");
  }

  const { orgId, content, type, slug, metadata } = payload;
  if (!orgId || !content || !type) {
    throw new Error("Memorize job requires orgId, content, and type");
  }

  const args = { orgId, content, type };
  if (slug) args.slug = slug;
  if (metadata) args.metadata = metadata;

  await client.action("nexMemory:memorize", args);
  console.log(`    memorized [${type}]`);

  await client.mutation("nex:completeJob", {
    jobId: job._id,
    result: "Memorized successfully",
    secret: SECRET,
  });
}

async function handleRecall(job) {
  let payload;
  try {
    payload = JSON.parse(job.payload || job.prompt || "{}");
  } catch {
    throw new Error("Invalid payload JSON for recall job");
  }

  const { orgId, query, type, slug, limit } = payload;
  if (!orgId || !query) {
    throw new Error("Recall job requires orgId and query");
  }

  const args = { orgId, query };
  if (type) args.type = type;
  if (slug) args.slug = slug;
  if (limit) args.limit = limit;

  const results = await client.action("nexMemory:recall", args);
  console.log(`    recalled ${results.length} fragment(s)`);

  await client.mutation("nex:completeJob", {
    jobId: job._id,
    result: JSON.stringify(results),
    secret: SECRET,
  });
}

async function handleCanvas(job) {
  let payload;
  try {
    payload = JSON.parse(job.payload || job.prompt || "{}");
  } catch {
    payload = { text: job.prompt || "" };
  }

  const prompt = payload.text || payload.prompt || job.prompt || "";
  const slug = payload.slug || generateSlug(prompt);
  const orgId = payload.orgId || job.orgId || "default";
  const srcPath = path.resolve(__dirname, "src", "app", slug + ".html");

  const existingHtml = fs.existsSync(srcPath)
    ? fs.readFileSync(srcPath, "utf-8")
    : null;

  // ── Direct build (all apps) ──

  // Build prompt for canvas generation
  const parts = [];
  if (existingHtml) {
    parts.push(`Modify the existing novoid app "${slug}" (src/app/${slug}.html).`);
    parts.push(`The app already exists. Read it, apply the user's changes, then PUBLISH it.`);
    parts.push(`After editing, publish by running: sh publish.sh ${slug} src/app/${slug}.html`);
    parts.push(`User request: ${prompt}`);
  } else {
    parts.push(`Build a novoid app with slug "${slug}".`);
    parts.push(`After creating src/app/${slug}.html, publish by running: sh publish.sh ${slug} src/app/${slug}.html`);
    parts.push(`User request: ${prompt}`);
  }

  if (payload.context) parts.push(`Context: ${payload.context}`);

  const fullPrompt = parts.join("\n");
  const mode = existingHtml ? "iterate" : "new";
  console.log(`    canvas (${mode} — slug: ${slug})`);

  const result = await askClaudeInterruptible(fullPrompt, job._id, {
    trackAsActive: true,
    jobType: "canvas",
    conversationId: job.conversationId,
    orgId,
    checkInterval: 3000,
  });
  console.log(`  → claude finished`);

  // Register canvas item
  const canvasOrgId = payload.orgId || job.orgId || "default";
  try {
    await client.mutation("nex:addCanvasItem", {
      orgId: canvasOrgId,
      slug,
      title: payload.title || slug,
      description: (prompt || "").slice(0, 500),
      origin: "nex-direct",
      conversationId: job.conversationId || undefined,
      selfTool: !!payload.selfTool,
      tags: payload.tags || undefined,
      secret: SECRET,
    });
    console.log(`    registered in canvas`);
  } catch (e) {
    console.log(`    canvas registration failed (non-fatal): ${e.message}`);
  }

  // Complete job
  await client.mutation("nex:completeJob", {
    jobId: job._id,
    result: "Published to /app/" + slug,
    secret: SECRET,
  });

  const url = SITE_URL ? `${SITE_URL}/app/${slug}` : `/app/${slug}`;
  console.log(`    published: ${url}`);

  // ── Post-build: headless Convex verification ──
  try {
    const appPath = path.resolve(__dirname, "src", "app", slug + ".html");
    const appHtml = fs.readFileSync(appPath, "utf-8");
    if (appHtml.includes("convex.min.js") || appHtml.includes("createClient")) {
      const queryRefs = [];
      const re = /useQuery\([^,]+,\s*"([^"]+)"/g;
      let m;
      while ((m = re.exec(appHtml)) !== null) queryRefs.push(m[1]);

      if (queryRefs.length > 0) {
        const seedArgs = queryRefs.flatMap(ref => ["--seed", ref, "[]"]);
        const runnerPath = path.resolve(__dirname, "test-runner", "novoid-test.mjs");
        if (fs.existsSync(runnerPath)) {
          const { execFileSync } = require("child_process");
          const out = execFileSync("node", [runnerPath, "--browse", appPath, ...seedArgs, "-c"], {
            timeout: 10000, encoding: "utf-8"
          });
          const data = JSON.parse(out);
          const errs = (data.errors || []).filter(e => !e.message.includes("not a function"));
          if (errs.length > 0) {
            console.log(`    headless: ${errs.length} error(s) with seeded Convex data`);
          } else {
            const cvx = data.convex;
            const qcount = cvx ? (cvx.subscriptions || []).length : 0;
            console.log(`    headless: clean (${qcount} queries verified)`);
          }
        }
      }
    }
  } catch (e) {
    // Non-fatal — headless check is informational
  }

  // ── Sentinel: auto-fix runtime errors ──
  let fixAttempts = 0;
  while (fixAttempts < 2) {
    await sleep(4000);
    let errors;
    try {
      errors = await client.query("errors:recent", { slug, limit: 10 });
    } catch { break; }
    if (!errors || errors.length === 0) break;

    fixAttempts++;
    console.log(`    sentinel: ${errors.length} error(s), auto-fixing (${fixAttempts}/2)...`);

    await client.mutation("nex:updateJob", {
      jobId: job._id,
      status: "building",
      result: `sentinel: fixing ${errors.length} runtime error(s)...`,
      secret: SECRET,
    });

    const errorSummary = errors.slice(0, 5).map(er =>
      `${er.type}: ${er.message}${er.line ? ` (line ${er.line})` : ""}${er.stack ? "\n" + er.stack.slice(0, 200) : ""}`
    ).join("\n---\n");

    const fixPath = path.resolve(__dirname, "src", "app", slug + ".html");
    const fixHtml = fs.existsSync(fixPath) ? fs.readFileSync(fixPath, "utf-8") : null;
    await askClaude(
      `Fix these runtime errors in src/app/${slug}.html. Read the file, fix the errors, republish.\n\n${errorSummary}`,
      job._id
    );

    try {
      await client.mutation("errors:clear", { slug, secret: SECRET });
    } catch {}

    await client.mutation("nex:updateJob", {
      jobId: job._id,
      status: "done",
      result: `Published /app/${slug} (auto-fixed ${errors.length} error(s))`,
      secret: SECRET,
    });
    console.log(`    sentinel: fixed, rechecking...`);
  }
}

async function handleHeartbeat(job) {
  let payload;
  try {
    payload = JSON.parse(job.payload || "{}");
  } catch {
    payload = {};
  }

  const isProactive = !!payload.proactive;
  const subtype = payload.subtype || "scheduled";
  const rawChecklist = payload.checklist || "## Task Review\n- Check memory for pending work";

  const label = isProactive ? `♻ proactive:${subtype}` : "♥ heartbeat";
  let response;

  // Parse structured checklist for pipeline execution
  let items = [];
  try {
    const parsed = JSON.parse(rawChecklist);
    if (Array.isArray(parsed) && parsed.length && parsed[0].id) {
      items = parsed.filter(it => it.enabled);
    }
  } catch(e) {}

  if (!isProactive && items.length > 0) {
    // Pipeline: execute steps sequentially, feeding each result to the next
    const pipelineOrgId = job.orgId || "default";

    // Build capabilities context — tell Claude what it can do
    let capabilities = [];
    try {
      const channels = await client.query("nex:channels", { orgId: pipelineOrgId });
      for (const ch of channels) {
        if (ch.status !== "active") continue;
        if (ch.type === "telegram") {
          let cfg = {}; try { cfg = JSON.parse(ch.config); } catch {}
          if (cfg.chatId) {
            capabilities.push(
              `## Telegram (already configured — chat ${cfg.chatId})`,
              `An active Telegram channel exists. Do NOT create a new one.`,
              `To send a Telegram message, run from the project root:`,
              `  node nex-telegram.mjs "Your message text here"`,
              `This queues a message through the existing channel. Keep the message concise and readable.`
            );
          }
        }
      }
    } catch {}

    // Support pipeline resume — pick up from a previous approval gate
    const startStep = payload._pipelineStep || 0;
    let context = payload._pipelineContext || "";
    const results = [];

    const approvalPattern = /\b(approv|confirm|permission|authorize|green.?light)\b/i;
    const complexPattern = /\b(implement|build|generate|create|refactor|deploy|code|develop|telegram|send|notify|message)\b/i;

    for (let i = startStep; i < items.length; i++) {
      const step = items[i];
      const isApprovalGate = approvalPattern.test(step.text) && i < items.length - 1;
      console.log(`    → step ${i + 1}/${items.length}: ${step.text}${isApprovalGate ? " [approval gate]" : ""}`);

      // If this is an approval gate, queue the approval and pause the pipeline
      if (isApprovalGate) {
        // Build a summary from context so far for the approval message
        const proposal = context
          ? `🫀 Nex heartbeat pipeline — step ${i + 1}/${items.length}:\n\n${step.text}\n\n📋 Context:\n${context}`
          : `🫀 Nex heartbeat pipeline — step ${i + 1}/${items.length}:\n\n${step.text}`;

        // Store pipeline state for resume on approval
        const pipelineState = {
          checklist: rawChecklist,
          _pipelineStep: i + 1,
          _pipelineContext: (context + `\n\n### Step ${i + 1}: ${step.text}\nUser approved this step via Telegram.`).slice(-3000),
          _pipelineResume: true,
        };

        // Queue approval — when approved, handleApprovalResponse creates a follow-up job
        await queueApproval(pipelineOrgId, "heartbeat-pipeline", proposal + "\n\n__PIPELINE_RESUME__:" + JSON.stringify(pipelineState));
        console.log(`    ⏸ pipeline paused at step ${i + 1} — waiting for approval`);

        response = results.map((r, ri) => `**Step ${ri + 1}:** ${r.step}\n${r.result}`).join("\n\n");
        response += `\n\n⏸ Paused at step ${i + 1} — awaiting approval via Telegram.`;

        // Complete this job — pipeline will resume from a new job after approval
        await client.mutation("nex:updateHeartbeat", {
          orgId: pipelineOrgId,
          lastResult: response.slice(0, 1000),
          lastRunAt: Date.now(),
          secret: SECRET,
        });
        await client.mutation("nex:completeJob", {
          jobId: job._id,
          result: response.slice(0, 2000),
          secret: SECRET,
        });
        return; // Exit — pipeline continues after approval
      }

      // Normal step execution
      const parts = [
        `You are Nex performing step ${i + 1} of ${items.length} in a heartbeat pipeline.`,
      ];
      if (capabilities.length > 0) {
        parts.push("", ...capabilities);
      }
      parts.push("", `## Current step`, step.text);
      if (context) {
        parts.push("", "## Context from previous steps", context);
      }
      if (i < items.length - 1) {
        parts.push("", "Execute this step. Your output will be passed as context to the next step.");
      } else {
        parts.push("", "Execute this final step. If the overall pipeline succeeded, include HEARTBEAT_OK in your response.");
      }
      const stepModel = complexPattern.test(step.text) ? "claude-opus-4-6" : "claude-sonnet-4-6";
      const stepResult = await askClaude(parts.join("\n"), job._id, { model: stepModel });
      console.log(`      ${stepResult.includes("HEARTBEAT_OK") ? "✓" : "→"} ${stepResult.slice(0, 60)}`);
      results.push({ step: step.text, result: stepResult.slice(0, 2000) });
      context += `\n\n### Step ${i + 1}: ${step.text}\n${stepResult.slice(0, 1000)}`;
      if (context.length > 8000) context = context.slice(-6000);
    }
    response = results.map((r, i) => `**Step ${i + 1 + startStep}:** ${r.step}\n${r.result}`).join("\n\n");
  } else {
    // Proactive or legacy plain-text — single prompt
    const checklist = items.length > 0
      ? items.map(it => '- ' + it.text).join('\n')
      : rawChecklist;
    const prompt = isProactive
      ? checklist
      : [
          "You are Nex performing a heartbeat task. Execute the following instruction:",
          "",
          checklist,
          "",
          "If completed successfully or nothing needs attention, respond with exactly HEARTBEAT_OK.",
          "If something needs attention, describe what needs attention concisely.",
        ].join("\n");
    response = await askClaude(prompt, job._id);
  }
  console.log(`  ${label} result: ${response.slice(0, 80)}`);

  // Update heartbeat config with result
  try {
    await client.mutation("nex:updateHeartbeat", {
      orgId: job.orgId || "default",
      lastResult: response.slice(0, 1000),
      lastRunAt: Date.now(),
      secret: SECRET,
    });
  } catch (e) {
    console.log(`    heartbeat config update failed: ${e.message}`);
  }

  // If alert (not HEARTBEAT_OK), request approval before acting
  if (!response.includes("HEARTBEAT_OK")) {
    const orgId = job.orgId || "default";

    if (isProactive) {
      // Proactive tasks → queue approval (batched + inline keyboard)
      try {
        await queueApproval(orgId, subtype, response);
      } catch (e) {
        console.log(`    approval request failed: ${e.message}`);
      }
    } else {
      // Scheduled heartbeats → alert directly (no approval needed)
      try {
        const channels = await client.query("nex:channels", { orgId });
        await sendHeartbeatAlert(channels, orgId, response);
      } catch {}
    }
  }

  await client.mutation("nex:completeJob", {
    jobId: job._id,
    result: response.slice(0, 2000),
    secret: SECRET,
  });
}

async function handleChannel(job) {
  let payload;
  try {
    payload = JSON.parse(job.payload || "{}");
  } catch {
    throw new Error("Invalid channel job payload");
  }

  const { channelType, channelId, text, replyTo, sendAsVoice } = payload;
  if (!channelType || !text) {
    throw new Error("Channel job requires channelType and text");
  }

  // Read channel config
  let channelConfig = {};
  try {
    const channels = await client.query("nex:channels", { orgId: job.orgId || "default" });
    const ch = channels.find((c) => (channelId && c._id === channelId) || c.type === channelType);
    if (ch) {
      try { channelConfig = JSON.parse(ch.config); } catch {}
    }
  } catch (e) {
    console.log(`    channel config lookup failed: ${e.message}`);
  }

  let sent = false;
  switch (channelType) {
    case "telegram": {
      const botToken = channelConfig.botToken;
      const chatId = replyTo || channelConfig.chatId;
      if (!botToken || !chatId) throw new Error("Telegram requires botToken and chatId");

      if (sendAsVoice) {
        // TTS: convert text to audio via Groq Orpheus
        try {
          loadEnv();
          const groqKey = process.env.GROQ_API_KEY;
          if (groqKey) {
            console.log(`    generating TTS via Groq Orpheus...`);
            const ttsRes = await fetch("https://api.groq.com/openai/v1/audio/speech", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${groqKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "canopylabs/orpheus-v1-english",
                input: text.slice(0, 3000),
                voice: "diana",
                response_format: "wav",
              }),
            });

            if (!ttsRes.ok) {
              const errText = await ttsRes.text();
              console.log(`    TTS API error ${ttsRes.status}: ${errText.slice(0, 300)}`);
            }
            if (ttsRes.ok) {
              const audioBuffer = Buffer.from(await ttsRes.arrayBuffer());
              // Convert WAV → OGG for Telegram voice
              const tmpWav = `/tmp/nex-tts-${Date.now()}.wav`;
              const tmpOgg = `/tmp/nex-tts-${Date.now()}.ogg`;
              fs.writeFileSync(tmpWav, audioBuffer);
              const { execSync } = require("child_process");
              try {
                execSync(`ffmpeg -y -i ${tmpWav} -c:a libopus ${tmpOgg}`, { stdio: "pipe" });
              } catch (e) {
                console.log(`    ffmpeg WAV→OGG failed: ${e.message}`);
                try { fs.unlinkSync(tmpWav); } catch {}
              }
              const oggBuffer = fs.existsSync(tmpOgg) ? fs.readFileSync(tmpOgg) : null;
              try { fs.unlinkSync(tmpWav); } catch {}
              try { fs.unlinkSync(tmpOgg); } catch {}

              if (oggBuffer) {
                const boundary = "----NexVoice" + Date.now();
                const bodyParts = [
                  Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n`),
                  Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="voice"; filename="voice.ogg"\r\nContent-Type: audio/ogg\r\n\r\n`),
                  oggBuffer,
                  Buffer.from(`\r\n--${boundary}--\r\n`),
                ];
                const fullBody = Buffer.concat(bodyParts);

                const voiceRes = await fetch(`https://api.telegram.org/bot${botToken}/sendVoice`, {
                  method: "POST",
                  headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
                  body: fullBody,
                });

                if (voiceRes.ok) {
                  sent = true;
                  console.log(`    → sent voice message to telegram chat ${chatId}`);
                  // Also send text version
                  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4000) }),
                  });
                  break;
                }
              }
            }
            console.log(`    TTS failed, falling back to text`);
          }
        } catch (e) {
          console.log(`    TTS error (falling back to text): ${e.message}`);
        }
      }

      // Text fallback (or non-voice messages)
      const chunks = splitTelegramMessage(text, 4000);
      for (const chunk of chunks) {
        const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: chunk, parse_mode: "Markdown" }),
        });
        if (!res.ok) {
          const retry = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, text: chunk }),
          });
          if (!retry.ok) throw new Error(`Telegram API error: ${retry.status}`);
        }
      }
      sent = true;
      console.log(`    → sent ${chunks.length} message(s) to telegram chat ${chatId}`);
      break;
    }
    case "slack": {
      const botToken = channelConfig.botToken;
      const channel = replyTo || channelConfig.defaultChannel;
      if (!botToken || !channel) throw new Error("Slack requires botToken and channel");
      const res = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${botToken}`,
        },
        body: JSON.stringify({ channel, text }),
      });
      if (!res.ok) throw new Error(`Slack API error: ${res.status}`);
      sent = true;
      console.log(`    → sent to slack channel ${channel}`);
      break;
    }
    case "discord": {
      const webhookUrl = channelConfig.webhookUrl;
      if (!webhookUrl) throw new Error("Discord requires webhookUrl");
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      if (!res.ok) throw new Error(`Discord API error: ${res.status}`);
      sent = true;
      console.log(`    → sent to discord webhook`);
      break;
    }
    case "webhook": {
      const url = replyTo || channelConfig.url;
      if (!url) throw new Error("Webhook requires replyUrl or url in config");
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, from: "nex" }),
      });
      if (!res.ok) throw new Error(`Webhook error: ${res.status}`);
      sent = true;
      console.log(`    → sent to webhook ${url}`);
      break;
    }
    default:
      throw new Error(`Unknown channel type: ${channelType}`);
  }

  // Update channel lastMessageAt
  if (sent && channelId) {
    try {
      await client.mutation("nex:updateChannelStatus", {
        channelId,
        status: "active",
        lastMessageAt: Date.now(),
        secret: SECRET,
      });
    } catch {}
  }

  await client.mutation("nex:completeJob", {
    jobId: job._id,
    result: `Sent to ${channelType}`,
    secret: SECRET,
  });
}

// ── Skill Handlers (Phase 3) ──

// Run novoid-cdp binary and return stdout
async function runCdp(args) {
  const { execFile } = require("child_process");
  const { promisify } = require("util");
  const execFileAsync = promisify(execFile);
  const bin = path.resolve(__dirname, "cdp", "target", "debug", "novoid-cdp");
  if (!fs.existsSync(bin)) {
    throw new Error("novoid-cdp not built. Run: cd cdp && cargo build");
  }
  const { stdout } = await execFileAsync(bin, args, {
    timeout: 30000,
    maxBuffer: 5 * 1024 * 1024,
  });
  return stdout;
}

async function handleSkill(job) {
  let payload;
  try {
    payload = JSON.parse(job.payload || "{}");
  } catch {
    throw new Error("Invalid skill job payload");
  }

  const { command, args, orgId } = payload;
  if (!command) throw new Error("Skill job requires command");

  const skills = await client.query("nex:skills", { orgId: orgId || "default" });
  const skill = skills.find((s) => s.command === command && s.enabled);
  if (!skill) throw new Error(`Skill "${command}" not found or disabled`);

  console.log(`    skill: ${command} (${skill.type})`);

  switch (command) {
    case "/ask": {
      const response = await askClaude(args || payload.text || "", job._id);
      const result = response.slice(0, 2000);
      await client.mutation("nex:completeJob", { jobId: job._id, result, secret: SECRET });
      return result;
    }
    case "/run": {
      const response = await askClaude(
        `Run this command and return the output: ${args || payload.text}`, job._id
      );
      const result = response.slice(0, 2000);
      await client.mutation("nex:completeJob", { jobId: job._id, result, secret: SECRET });
      return result;
    }
    case "/browse": {
      const url = args || payload.url || "";
      const extract = payload.extract || "text";
      try {
        const cdpResult = await runCdp(["--headless", "-c", "--snap", url]);
        const parsed = JSON.parse(cdpResult);
        // Summarize via Claude with the CDP snap data
        const response = await askClaude(
          `Here is a real browser snapshot of ${url}:\n\n${JSON.stringify(parsed, null, 2)}\n\nSummarize the page content concisely.`, job._id
        );
        const result = response.slice(0, 2000);
        await client.mutation("nex:completeJob", { jobId: job._id, result, secret: SECRET });
        return result;
      } catch (e) {
        // Fallback to WebFetch if CDP unavailable
        console.log(`    CDP browse failed, falling back to WebFetch: ${e.message}`);
        const response = await askClaude(
          `Fetch and inspect this URL using WebFetch, summarize the content: ${url}`, job._id
        );
        const result = response.slice(0, 2000);
        await client.mutation("nex:completeJob", { jobId: job._id, result, secret: SECRET });
        return result;
      }
    }
    case "/screenshot": {
      const url = args || payload.url || "";
      try {
        const tmpPath = `/tmp/nex-screenshot-${Date.now()}.png`;
        await runCdp(["--headless", url, "--screenshot", tmpPath]);
        const result = `Screenshot saved to ${tmpPath}`;
        await client.mutation("nex:completeJob", { jobId: job._id, result, secret: SECRET });
        return result;
      } catch (e) {
        const result = `Screenshot failed: ${e.message}`;
        await client.mutation("nex:completeJob", { jobId: job._id, result, secret: SECRET });
        return result;
      }
    }
    case "/scrape": {
      const parts = (args || "").split(" ");
      const url = parts[0] || payload.url || "";
      const mode = parts[1] || payload.extract || "tables";
      try {
        const cdpResult = await runCdp(["--headless", "-c", "--extract", mode, url]);
        const parsed = JSON.parse(cdpResult);
        // Find the extract step result
        const extractStep = (parsed.steps || []).find((s) => s.command === "extract");
        const data = extractStep?.value || parsed;
        const response = await askClaude(
          `Here is structured data extracted from ${url} (mode: ${mode}):\n\n${JSON.stringify(data, null, 2)}\n\nSummarize or format this data.`, job._id
        );
        const result = response.slice(0, 2000);
        await client.mutation("nex:completeJob", { jobId: job._id, result, secret: SECRET });
        return result;
      } catch (e) {
        const result = `Scrape failed: ${e.message}`;
        await client.mutation("nex:completeJob", { jobId: job._id, result, secret: SECRET });
        return result;
      }
    }
    case "/send": {
      const parts = (args || "").split(" ");
      const channelType = parts[0] || "webhook";
      const text = parts.slice(1).join(" ") || payload.text || "";
      await client.mutation("nex:createJob", {
        orgId: orgId || "default", type: "channel",
        payload: JSON.stringify({ channelType, text }), secret: SECRET,
      });
      const result = `Queued message to ${channelType}`;
      await client.mutation("nex:completeJob", { jobId: job._id, result, secret: SECRET });
      return result;
    }
    case "/remember": {
      await client.action("nexMemory:memorize", {
        orgId: orgId || "default",
        content: args || payload.text || "",
        type: payload.memoryType || "long",
      });
      const result = "Memorized";
      await client.mutation("nex:completeJob", { jobId: job._id, result, secret: SECRET });
      return result;
    }
    case "/recall": {
      const results = await client.action("nexMemory:recall", {
        orgId: orgId || "default",
        query: args || payload.text || "",
        limit: 5,
      });
      const result = JSON.stringify(results);
      await client.mutation("nex:completeJob", { jobId: job._id, result, secret: SECRET });
      return result;
    }
    case "/build": {
      await handleCanvas({
        ...job,
        payload: JSON.stringify({ text: args || payload.text || "" }),
      });
      return "Build started";
    }
    case "/verify": {
      const slug = args || payload.slug || "";
      const srcPath = path.resolve(__dirname, "src", "app", slug + ".html");
      if (!fs.existsSync(srcPath)) throw new Error(`App not found: src/app/${slug}.html`);
      const response = await askClaude(
        `Run verification on src/app/${slug}.html by executing: sh verify.sh src/app/${slug}.html\nReport the results.`,
        job._id
      );
      const result = response.slice(0, 2000);
      await client.mutation("nex:completeJob", { jobId: job._id, result, secret: SECRET });
      return result;
    }
    case "/upskill": {
      await handleUpskill({
        ...job,
        payload: JSON.stringify({ topic: args || payload.text || "" }),
      });
      return "Upskill started";
    }
    default: {
      let handlerConfig;
      try { handlerConfig = JSON.parse(skill.handler); } catch { handlerConfig = {}; }
      const prompt = handlerConfig.prompt
        ? handlerConfig.prompt.replace("{{args}}", args || payload.text || "")
        : `Execute skill "${command}": ${args || payload.text || ""}`;
      const response = await askClaude(prompt, job._id);
      const result = response.slice(0, 2000);
      await client.mutation("nex:completeJob", { jobId: job._id, result, secret: SECRET });
      return result;
    }
  }
}

async function handleUpskill(job) {
  let payload;
  try {
    payload = JSON.parse(job.payload || "{}");
  } catch {
    payload = {};
  }

  const topic = payload.topic || payload.text || "general skills review";
  const orgId = payload.orgId || job.orgId || "default";

  console.log(`    upskill: ${topic}`);

  let gaps = [];
  try {
    gaps = await client.action("nexMemory:recall", {
      orgId, query: "skill_gap " + topic, type: "skill_gap", limit: 5,
    });
    console.log(`    found ${gaps.length} skill gap(s) in memory`);
  } catch (e) {
    console.log(`    skill gap search failed (non-fatal): ${e.message}`);
  }

  const gapContext = gaps.length > 0
    ? "\n\nKnown skill gaps:\n" + gaps.map((g) => `- ${g.content}`).join("\n")
    : "";

  const analysis = await askClaudeInterruptible([
    "You are Nex performing a skill gap analysis.",
    `Topic: ${topic}`, gapContext, "",
    "Analyze the skill gaps. For each gap:",
    "1. Describe the missing capability",
    "2. Suggest how to learn it",
    "3. Rate priority (high/medium/low)",
    "",
    "If no gaps found, suggest useful skills for this topic. Be concise.",
  ].join("\n"), job._id, { trackAsActive: true, jobType: "upskill", checkInterval: 3000 });

  try {
    await client.action("nexMemory:memorize", {
      orgId, content: `Upskill analysis for "${topic}": ${analysis.slice(0, 800)}`,
      type: "long", metadata: { tags: ["upskill", "analysis"], source: "nex-upskill" },
    });
  } catch (e) {
    console.log(`    memorize failed: ${e.message}`);
  }

  await client.mutation("nex:completeJob", {
    jobId: job._id, result: analysis.slice(0, 2000), secret: SECRET,
  });
}

async function handleDefault(job) {
  const prompt = job.prompt || job.payload || "";
  if (!prompt) throw new Error("No prompt or payload for default job");

  const response = await askClaude(prompt, job._id);
  console.log(`  → claude finished`);

  await client.mutation("nex:completeJob", {
    jobId: job._id,
    result: response.slice(0, 2000),
    secret: SECRET,
  });
}

// ── Interrupt Classification ──

const TIER2_COMMANDS = ["/stop", "/cancel", "/abort"];
const TIER2_PHRASES = [
  "stop what you're doing", "cancel that", "start over", "requirements changed",
  "actually build", "don't build", "wait stop", "stop building", "cancel the",
  "scratch that", "never mind", "hold on stop", "abort",
];

function classifyInterrupt(text) {
  const lower = text.toLowerCase().trim();
  // Explicit commands
  if (TIER2_COMMANDS.some((cmd) => lower.startsWith(cmd))) return 2;
  // Phrase matching
  if (TIER2_PHRASES.some((p) => lower.includes(p))) return 2;
  // Everything else is Tier 1 (quick reply)
  return 1;
}

// ── Quick Reply (Tier 1) — concurrent response without killing active job ──

async function handleQuickReply(job, activeContext) {
  let payload;
  try { payload = JSON.parse(job.payload || "{}"); } catch { payload = { text: job.prompt || "" }; }
  const { text, conversationId } = payload;
  const orgId = payload.orgId || job.orgId || "default";

  const elapsed = Math.round((Date.now() - activeContext.startedAt) / 1000);
  const quickPrompt = [
    "You are Nex. You're currently busy with a background task. Answer this quick question concisely (2-3 sentences max).",
    "",
    `ACTIVE TASK: ${activeContext.type} job (running for ${elapsed}s)`,
    activeContext.lastProgress ? `PROGRESS: ${activeContext.lastProgress}` : "",
    "",
    `User message: ${text}`,
  ].filter(Boolean).join("\n");

  console.log(`    ⚡ quick reply (tier 1) while ${activeContext.type} runs...`);
  const response = await askClaude(quickPrompt, null); // no jobId — don't overwrite active job progress

  // Save response to conversation
  const convId = conversationId;
  if (convId) {
    try {
      await client.mutation("nex:addMessage", {
        conversationId: convId,
        role: "assistant",
        content: response,
        secret: SECRET,
      });
    } catch (e) {
      console.log(`    quick reply save failed: ${e.message}`);
    }
  }

  // Complete the quick-reply job
  await client.mutation("nex:completeJob", {
    jobId: job._id,
    result: response.slice(0, 2000),
    secret: SECRET,
  });

  console.log(`    ⚡ quick reply done`);
}

// ── Interrupt (Tier 2) — kill active process, handle new message ──

async function handleInterrupt(job, activeContext) {
  let payload;
  try { payload = JSON.parse(job.payload || "{}"); } catch { payload = { text: job.prompt || "" }; }
  const { text } = payload;

  console.log(`    🛑 interrupt (tier 2) — killing active ${activeContext.type} job`);

  // Kill the running process
  if (activeContext.proc) {
    try { activeContext.proc.kill("SIGTERM"); } catch {}
  }

  // Mark the interrupted job
  try {
    await client.mutation("nex:interruptJob", {
      jobId: activeContext.jobId,
      interruptedBy: (text || "").slice(0, 500),
      secret: SECRET,
    });
  } catch (e) {
    console.log(`    interrupt mutation failed: ${e.message}`);
  }

  // Clear active proc
  activeProc = null;

  // Now process the interrupting message as a normal chat (with context about what was interrupted)
  const elapsed = Math.round((Date.now() - activeContext.startedAt) / 1000);

  // Inject interrupt context into the payload
  const enrichedPayload = { ...payload };
  if (!enrichedPayload.interruptContext) {
    enrichedPayload.interruptContext = `[You were working on a ${activeContext.type} job for ${elapsed}s. The user interrupted it. Acknowledge briefly and handle their new request.]`;
  }
  job.payload = JSON.stringify(enrichedPayload);

  // Route through normal chat handler
  await handleChat(job);
}

// ── Claude Code (full agent mode with streaming progress) ──
function askClaude(prompt, jobId, opts) {
  const { trackAsActive, jobType, conversationId, orgId, imagePaths, model } = opts || {};
  const modelLabel = model || "opus";
  console.log(`    calling claude (${modelLabel})...`);

  // EAGER activeProc — set BEFORE spawn so concurrent poll cycles see it immediately
  // This prevents the race where two jobs from the same poll batch both see activeProc=null
  if (trackAsActive && jobId) {
    activeProc = {
      proc: null, // filled once spawned
      jobId,
      type: jobType || "unknown",
      prompt: prompt.slice(0, 200),
      startedAt: Date.now(),
      lastProgress: "",
      conversationId,
      orgId,
    };
  }

  return new Promise(function (resolve, reject) {
    const args = [
      "-p",
      "--dangerously-skip-permissions",
      "--output-format", "stream-json",
    ];
    if (model) {
      args.push("--model", model);
    }
    // Append image file references to prompt (Claude Code reads them via Read tool)
    let fullPrompt = prompt;
    if (imagePaths && imagePaths.length > 0) {
      fullPrompt += "\n\nThe user attached " + imagePaths.length + " image(s). Read them with the Read tool:\n";
      for (const imgPath of imagePaths) {
        fullPrompt += "- " + imgPath + "\n";
      }
    }
    args.push(fullPrompt);

    const proc = spawn("claude", args, {
      cwd: __dirname,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 300000,
    });

    // Attach process handle to the eager sentinel
    if (activeProc && activeProc.jobId === jobId) {
      activeProc.proc = proc;
    }

    let buffer = "";
    let stderr = "";
    let lastResult = "";
    let lastProgress = "";
    let progressQueue = Promise.resolve();
    const MAX_BUFFER = 512 * 1024; // 512KB cap
    const MAX_STDERR = 64 * 1024;  // 64KB cap

    proc.stdout.on("data", (chunk) => {
      buffer += chunk;
      if (buffer.length > MAX_BUFFER) buffer = buffer.slice(-MAX_BUFFER);
      const lines = buffer.split("\n");
      buffer = lines.pop(); // keep incomplete line in buffer

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          const summary = summarizeEvent(event);
          if (summary) {
            console.log(`      ${summary}`);
            lastProgress = summary;
            // Update activeProc progress
            if (activeProc && activeProc.jobId === jobId) {
              activeProc.lastProgress = summary;
            }
            // Push progress to Convex
            if (jobId) {
              const s = summary;
              progressQueue = progressQueue.then(() =>
                client.mutation("nex:updateJob", {
                  jobId,
                  status: "building",
                  result: s,
                  secret: SECRET,
                }).catch((err) => {
                  console.log(`      ⚠ progress push failed: ${err.message}`);
                })
              );
            }
          }
          // Capture final text result
          if (event.type === "result") {
            lastResult = event.result || "";
          }
        } catch { /* ignore parse errors */ }
      }
    });

    proc.stderr.on("data", (d) => {
      stderr += d;
      if (stderr.length > MAX_STDERR) stderr = stderr.slice(-MAX_STDERR);
    });

    function cleanup() {
      proc.stdout.removeAllListeners();
      proc.stderr.removeAllListeners();
      proc.removeAllListeners();
      if (activeProc && activeProc.jobId === jobId) {
        activeProc = null;
      }
      buffer = "";
      stderr = "";
      progressQueue = null;
    }

    proc.on("close", (code) => {
      const result = lastResult;
      const err = stderr.trim();
      cleanup();
      if (code !== 0) {
        return reject(new Error(err || "Claude exited with code " + code));
      }
      resolve(result);
    });

    proc.on("error", (e) => {
      cleanup();
      reject(e);
    });
  });
}

// ── Interruptible Claude wrapper — polls for new jobs while Claude runs ──
async function askClaudeInterruptible(prompt, jobId, opts) {
  const checkInterval = (opts && opts.checkInterval) || 3000;

  // Start the Claude process (askClaude sets activeProc eagerly)
  const claudePromise = askClaude(prompt, jobId, opts);

  // Poll for incoming chat jobs while Claude is running
  let done = false;
  claudePromise.then(() => { done = true; }).catch(() => { done = true; });

  while (!done) {
    await sleep(checkInterval);
    if (done) break;

    // Check for new pending chat jobs (interrupts)
    try {
      let jobs = await client.query("nex:pendingJobs");
      if (!jobs) continue;

      for (let ji = 0; ji < jobs.length; ji++) {
        const job = jobs[ji];
        if (job.type !== "chat") continue;

        let payload;
        try { payload = JSON.parse(job.payload || "{}"); } catch { payload = {}; }
        const text = payload.text || "";

        // Claim the job
        try {
          await client.mutation("nex:claimJob", { jobId: job._id, agentId: AGENT_ID, secret: SECRET });
        } catch { continue; } // already claimed

        await client.mutation("nex:updateJob", { jobId: job._id, status: "building", secret: SECRET });

        const tier = classifyInterrupt(text);
        if (tier === 1) {
          console.log(`    ⚡ interruptible: quick reply while claude runs`);
          try {
            await handleQuickReply(job, activeProc);
          } catch (e) {
            await client.mutation("nex:failJob", { jobId: job._id, result: e.message || String(e), secret: SECRET }).catch(() => {});
          }
        } else {
          console.log(`    🛑 interruptible: tier 2 interrupt — killing claude`);
          try {
            await handleInterrupt(job, activeProc);
          } catch (e) {
            await client.mutation("nex:failJob", { jobId: job._id, result: e.message || String(e), secret: SECRET }).catch(() => {});
          }
          done = true;
          break;
        }
      }
      jobs = null; // release query results
    } catch {
      // Silent — will retry next interval
    }
  }

  // Return the result (or throw if it was killed)
  return claudePromise;
}

// Extract a human-readable summary from a stream-json event
function summarizeEvent(event) {
  if (!event || !event.type) return null;

  if (event.type === "assistant" && event.message) {
    const msg = event.message;
    if (msg.content) {
      for (const block of msg.content) {
        if (block.type === "thinking" && block.thinking) {
          const snippet = block.thinking.slice(0, 80).replace(/\n/g, " ");
          return `thinking: ${snippet}...`;
        }
        if (block.type === "tool_use") {
          return formatToolUse(block);
        }
        if (block.type === "text" && block.text) {
          const snippet = block.text.slice(0, 80).replace(/\n/g, " ");
          return `${snippet}`;
        }
      }
    }
  }

  if (event.type === "content_block_start" && event.content_block) {
    const cb = event.content_block;
    if (cb.type === "thinking") return "thinking...";
    if (cb.type === "tool_use") return formatToolUse(cb);
  }

  if (event.type === "content_block_delta" && event.delta) {
    if (event.delta.type === "thinking_delta" && event.delta.thinking) {
      const snippet = event.delta.thinking.slice(0, 60).replace(/\n/g, " ");
      if (snippet.trim()) return `thinking: ${snippet}`;
    }
  }

  return null;
}

function formatToolUse(block) {
  const name = block.name || "tool";
  const input = block.input || {};
  if (name === "Read") return `reading ${input.file_path || "file"}`;
  if (name === "Write") return `writing ${input.file_path || "file"}`;
  if (name === "Edit") return `editing ${input.file_path || "file"}`;
  if (name === "Bash") return `running: ${(input.command || "").slice(0, 60)}`;
  if (name === "Glob") return `searching: ${input.pattern || "files"}`;
  if (name === "Grep") return `grep: ${input.pattern || ""}`;
  return `${name}`;
}

// ── Helpers ──

// Strip plain-text math lines that duplicate an adjacent TeX formula.
// Detects: $$...$$ on one line, followed/preceded by a plain restatement.
// Also strips from HTML: <span>...</span> with katex followed by a text node restatement.
function stripMathDuplicates(text) {
  if (!text) return text;
  const lines = text.split('\n');
  const result = [];
  const MATH_CHARS = /[=∇∂εμ×·±∞ΣΔ∫∮ρσωαβγδλπφψθℏ∝≈≠≤≥≡⇒⇔→←∀∃∈⊂⊃]/;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    // Check if this line is a plain-text math restatement
    // (short line with = sign and math-like content, no markdown/HTML structure)
    const looksLikeMathRestate = trimmed.length > 0 && trimmed.length < 120
      && /=/.test(trimmed)
      && MATH_CHARS.test(trimmed)
      && !/^[#*>\-|`<]/.test(trimmed)
      && !/^\d+\./.test(trimmed)
      && !/\[.*\]\(/.test(trimmed);
    if (looksLikeMathRestate) {
      // Check if adjacent line (before or after) is a TeX block
      const prev = i > 0 ? lines[i - 1].trim() : '';
      const next = i < lines.length - 1 ? lines[i + 1].trim() : '';
      const adjToTex = /\$\$/.test(prev) || /\$\$/.test(next)
        || /class=".*math/.test(prev) || /class=".*math/.test(next)
        || (result.length > 0 && /\$\$/.test(result[result.length - 1]));
      if (adjToTex) {
        continue; // skip this duplicate line
      }
    }
    result.push(line);
  }
  return result.join('\n');
}

// ── Approval Helpers (persistent + batched + inline keyboards) ──

// Queue an approval into the batch window. If multiple proactive tasks fire
// within APPROVAL_BATCH_WINDOW_MS, they get combined into one Telegram message.
async function queueApproval(orgId, subtype, prompt) {
  const channels = await client.query("nex:channels", { orgId });
  const tgCh = channels.find((c) => c.type === "telegram" && c.status === "active");
  if (!tgCh) {
    await sendHeartbeatAlert(channels, orgId, prompt);
    return;
  }
  let cfg = {};
  try { cfg = JSON.parse(tgCh.config); } catch {}
  const chatId = cfg.chatId;
  if (!chatId || !cfg.botToken) {
    await sendHeartbeatAlert(channels, orgId, prompt);
    return;
  }

  // Create or join a batch
  const batchId = pendingBatch && pendingBatch.orgId === orgId && pendingBatch.chatId === chatId
    ? pendingBatch.batchId
    : "batch-" + Date.now();

  // Persist to Convex
  const approvalId = await client.mutation("nex:createApproval", {
    orgId,
    subtype,
    prompt: prompt.slice(0, 2000),
    description: `Proactive ${subtype}: ${prompt.slice(0, 200)}`,
    chatId,
    batchId,
    timeoutMs: APPROVAL_TIMEOUT_MS,
    secret: SECRET,
  });

  if (pendingBatch && pendingBatch.batchId === batchId) {
    // Add to existing batch
    pendingBatch.items.push({ approvalId, subtype, prompt });
    console.log(`    batched approval for ${subtype} (batch: ${batchId}, total: ${pendingBatch.items.length})`);
  } else {
    // Start new batch — wait APPROVAL_BATCH_WINDOW_MS for more items, then send
    if (pendingBatch && pendingBatch.timer) clearTimeout(pendingBatch.timer);
    pendingBatch = {
      batchId,
      items: [{ approvalId, subtype, prompt }],
      chatId,
      orgId,
      botToken: cfg.botToken,
      timer: null,
    };
    console.log(`    started approval batch ${batchId} for ${subtype}`);

    pendingBatch.timer = setTimeout(async () => {
      try {
        await flushApprovalBatch();
      } catch (e) {
        console.log(`    batch flush error: ${e.message}`);
        pendingBatch = null; // clear on failure to prevent leak
      }
    }, APPROVAL_BATCH_WINDOW_MS);
  }
}

// Send the batched approval message with inline keyboard
async function flushApprovalBatch() {
  const batch = pendingBatch;
  if (!batch || batch.items.length === 0) return;
  pendingBatch = null;

  const isSingle = batch.items.length === 1;
  let messageText;

  if (isSingle) {
    const item = batch.items[0];
    messageText = `🔔 Proactive [${item.subtype}] found something:\n\n${toTelegramFormat(item.prompt).slice(0, 800)}`;
  } else {
    // Batched: list all findings
    const lines = batch.items.map((item, i) =>
      `${i + 1}. **${item.subtype}**: ${item.prompt.slice(0, 150)}`
    );
    messageText = `🔔 Proactive scan found ${batch.items.length} items:\n\n${lines.join("\n\n")}`;
  }

  // Inline keyboard with Approve All / Deny All
  const keyboard = {
    inline_keyboard: [
      [
        { text: "✅ Approve", callback_data: `approve:${batch.batchId}` },
        { text: "❌ Skip", callback_data: `deny:${batch.batchId}` },
      ],
    ],
  };

  try {
    const res = await fetch(`https://api.telegram.org/bot${batch.botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: batch.chatId,
        text: messageText,
        reply_markup: keyboard,
      }),
    });
    const data = await res.json();
    // Store the message_id so we can edit the keyboard after response
    if (data.ok && data.result && data.result.message_id) {
      for (const item of batch.items) {
        try {
          // Update the approval record with the Telegram message ID
          // (We can't patch by approvalId directly from the watcher, but
          //  the batchId is enough for resolution)
        } catch {}
      }
    }
    console.log(`    sent approval batch ${batch.batchId} (${batch.items.length} item(s)) with inline keyboard`);
  } catch (e) {
    console.log(`    approval batch send failed: ${e.message}`);
  }
}

// Handle approval response — from text reply or callback query
async function handleApprovalResponse(chatId, orgId, isApproval, job) {
  // Look up pending approvals for this chatId from Convex
  let approvals;
  try {
    approvals = await client.query("nex:pendingApprovals", { orgId, chatId });
  } catch { return false; }

  if (!approvals || approvals.length === 0) return false;

  // Resolve all pending approvals for this chatId (most recent batch)
  const status = isApproval ? "approved" : "denied";
  const batchId = approvals[0].batchId;

  if (batchId) {
    // Resolve entire batch
    await client.mutation("nex:resolveApprovalBatch", { batchId, status, secret: SECRET });
    console.log(`    ${isApproval ? "✅" : "❌"} batch ${status}: ${batchId} (${approvals.length} item(s))`);
  } else {
    // Resolve individually
    for (const a of approvals) {
      await client.mutation("nex:resolveApproval", { approvalId: a._id, status, secret: SECRET });
    }
    console.log(`    ${isApproval ? "✅" : "❌"} ${status}: ${approvals.length} approval(s)`);
  }

  if (isApproval) {
    // Create follow-up jobs for each approved item
    for (const approval of approvals) {
      // Check if this is a pipeline resume
      const pipelineMatch = approval.prompt && approval.prompt.match(/__PIPELINE_RESUME__:(.+)$/s);
      if (pipelineMatch) {
        try {
          const pipelineState = JSON.parse(pipelineMatch[1]);
          console.log(`    ▶ resuming heartbeat pipeline from step ${pipelineState._pipelineStep + 1}`);
          await client.mutation("nex:createJob", {
            orgId: approval.orgId || "default",
            type: "heartbeat",
            payload: JSON.stringify(pipelineState),
            secret: SECRET,
          });
          continue;
        } catch(e) {
          console.log(`    ⚠ pipeline resume parse failed: ${e.message}`);
        }
      }

      const followUpPrompt = [
        `You are Nex. A proactive ${approval.subtype} check found this:`,
        approval.prompt.slice(0, 1000),
        "",
        "The user approved this action. Handle it now — fix what was found, clean up, or take the appropriate action.",
        "Be concise and report what you did.",
      ].join("\n");

      await client.mutation("nex:createJob", {
        orgId: approval.orgId || "default",
        type: "chat",
        payload: JSON.stringify({
          text: followUpPrompt,
          channel: "telegram",
          replyTo: chatId,
          orgId: approval.orgId,
        }),
        secret: SECRET,
      });
    }

    // Ack
    try {
      const channels = await client.query("nex:channels", { orgId });
      const tgCh = channels.find((c) => c.type === "telegram");
      if (tgCh) {
        let cfg = {};
        try { cfg = JSON.parse(tgCh.config); } catch {}
        if (cfg.botToken) {
          const subtypes = [...new Set(approvals.map((a) => a.subtype))].join(", ");
          await fetch(`https://api.telegram.org/bot${cfg.botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, text: `👍 On it — handling ${subtypes}.` }),
          });
        }
      }
    } catch {}
  } else {
    // Denial ack
    try {
      const channels = await client.query("nex:channels", { orgId });
      const tgCh = channels.find((c) => c.type === "telegram");
      if (tgCh) {
        let cfg = {};
        try { cfg = JSON.parse(tgCh.config); } catch {}
        if (cfg.botToken) {
          await fetch(`https://api.telegram.org/bot${cfg.botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, text: "Skipped." }),
          });
        }
      }
    } catch {}
  }

  // Complete the job that carried the YES/NO
  if (job) {
    await client.mutation("nex:completeJob", {
      jobId: job._id,
      result: `${status}: ${approvals.map((a) => a.subtype).join(", ")}`,
      secret: SECRET,
    });
  }
  return true;
}

// Handle Telegram callback query (inline keyboard button press)
async function handleCallbackQuery(callbackQuery, botToken) {
  const data = callbackQuery.data || "";
  const chatId = callbackQuery.message?.chat?.id;
  const messageId = callbackQuery.message?.message_id;

  const match = data.match(/^(approve|deny):(.+)$/);
  if (!match || !chatId) {
    // Answer callback to dismiss loading state
    await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackQuery.id }),
    });
    return;
  }

  const action = match[1];
  const batchId = match[2];
  const isApproval = action === "approve";
  const status = isApproval ? "approved" : "denied";

  // Resolve batch in Convex
  let count = 0;
  try {
    count = await client.mutation("nex:resolveApprovalBatch", { batchId, status, secret: SECRET });
  } catch (e) {
    console.log(`    callback resolve failed: ${e.message}`);
  }

  // Edit the original message to remove the keyboard and show result
  const resultEmoji = isApproval ? "✅" : "❌";
  const originalText = callbackQuery.message?.text || "";
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text: `${originalText}\n\n${resultEmoji} ${isApproval ? "Approved" : "Skipped"}`,
      }),
    });
  } catch {}

  // Answer callback
  await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      callback_query_id: callbackQuery.id,
      text: isApproval ? "Approved! Working on it..." : "Skipped.",
    }),
  });

  // If approved, create follow-up jobs
  if (isApproval) {
    try {
      const approvals = await client.query("nex:pendingApprovals", { orgId: "default", chatId: String(chatId) });
      // These are already resolved, but we can fetch by batch
      // Actually we need the original prompts — let's query all with this batchId
      // The resolveApprovalBatch already marked them, so re-query won't find them as pending
      // We stored the prompts — we need to create follow-up jobs from the callback data
      // For simplicity, create a single follow-up job
      await client.mutation("nex:createJob", {
        orgId: "default",
        type: "chat",
        payload: JSON.stringify({
          text: `You are Nex. The user approved a proactive batch (${batchId}). Check recent heartbeat results and handle the approved items. Be concise.`,
          channel: "telegram",
          replyTo: String(chatId),
          orgId: "default",
        }),
        secret: SECRET,
      });
    } catch (e) {
      console.log(`    follow-up job creation failed: ${e.message}`);
    }
  }

  console.log(`  ${resultEmoji} callback: ${status} batch ${batchId} (${count} item(s))`);
}

// Periodic cleanup of expired approvals
async function cleanupExpiredApprovals() {
  try {
    const expired = await client.mutation("nex:expireApprovals", { secret: SECRET });
    if (expired > 0) console.log(`    ⏰ expired ${expired} approval(s)`);
  } catch {}
}

// Send heartbeat alert to all active channels
// Convert markdown to Telegram-friendly plain text
function toTelegramFormat(text) {
  return text
    // Tables → lined items: extract cell contents
    .replace(/\|[^\n]*\|/g, function(row) {
      const cells = row.split('|').map(c => c.trim()).filter(Boolean);
      if (cells.every(c => /^[-:]+$/.test(c))) return ''; // separator row
      return cells.join(' · ');
    })
    // Headers → bold with emoji
    .replace(/^### (.+)$/gm, '📦 $1')
    .replace(/^## (.+)$/gm, '📋 $1')
    .replace(/^# (.+)$/gm, '📋 $1')
    // **bold** → stays (Telegram Markdown supports it)
    // `code` → stays
    // Clean up empty lines from removed separator rows
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function sendHeartbeatAlert(channels, orgId, response) {
  const formatted = toTelegramFormat(response);
  for (const ch of channels) {
    if (ch.status !== "active") continue;
    await client.mutation("nex:createJob", {
      orgId,
      type: "channel",
      payload: JSON.stringify({
        channelType: ch.type,
        channelId: ch._id,
        text: `⚠ Heartbeat Alert:\n${formatted.slice(0, 3000)}`,
      }),
      secret: SECRET,
    });
  }
}

function splitTelegramMessage(text, maxLen) {
  if (text.length <= maxLen) return [text];
  const chunks = [];
  let remaining = text;
  while (remaining.length > maxLen) {
    // Try to split at last newline within limit
    let cut = remaining.lastIndexOf("\n", maxLen);
    if (cut < maxLen * 0.3) cut = remaining.lastIndexOf(" ", maxLen);
    if (cut < maxLen * 0.3) cut = maxLen;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function generateSlug(prompt) {
  const word = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .split(/\s+/)
    .find((w) => w.length > 2 && !["the", "a", "an", "i", "want", "build", "make", "create"].includes(w))
    || "app";
  const id = crypto.randomBytes(2).toString("hex");
  return `${word}-${id}`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Main loop ──
async function run() {
  await registerSelf();
  startAgentPing();

  while (true) {
    await checkJobs();
    await checkSignals();
    // Check heartbeat every 30s (not every poll cycle)
    const now = Date.now();
    if (now - lastHeartbeatCheck > 30000) {
      lastHeartbeatCheck = now;
      await checkHeartbeat();
      await checkIdleProactive();
      await cleanupExpiredApprovals();
    }
    await sleep(POLL_MS);
  }
}

run();

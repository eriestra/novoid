#!/usr/bin/env node
// auteque/scripts/gen-meaning.mjs <youtube-url>
//
// Generates the auteque slug demo:
//   1. yt-dlp           → full mp3 + auto-captions + metadata (cached at /tmp/auteque-<id>/)
//   2. upload to Convex → auteque-source.mp3 (one file, full duration)
//   3. OpenRouter LLM   → discover ~7 key concepts; per concept, list time ranges
//                         where it's discussed with intensity (json_schema strict)
//   4. write manifest   → auteque/demo/auteque.manifest.json (also uploaded as
//                         auteque-meaning.json in Convex storage)
//
// The HTML at auteque/demo/auteque.html consumes the manifest and renders the
// Meaning Timeline plot client-side (KDE smoothing on the time ranges).
//
// Requires in .env.local: CONVEX_URL, PUBLISH_SECRET, OPENROUTER_KEY.
// Requires on PATH: yt-dlp.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { ConvexHttpClient } from 'convex/browser';

// ── Env ───────────────────────────────────────────────────────
const env = Object.fromEntries(
  readFileSync(new URL('../../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const { CONVEX_URL, PUBLISH_SECRET, OPENROUTER_KEY } = env;
for (const [k, val] of Object.entries({ CONVEX_URL, PUBLISH_SECRET, OPENROUTER_KEY })) {
  if (!val) { console.error(`Missing ${k} in .env.local`); process.exit(1); }
}

const url = process.argv[2];
if (!url) { console.error('Usage: node gen-meaning.mjs <youtube-url>'); process.exit(1); }

const videoId = (url.match(/[?&]v=([^&]+)/) || url.match(/youtu\.be\/([^?]+)/) || [])[1];
if (!videoId) { console.error('Could not parse video id'); process.exit(1); }

const work = `/tmp/auteque-${videoId}`;
mkdirSync(work, { recursive: true });

const convex = new ConvexHttpClient(CONVEX_URL);

// ── 1. Download (cached) ──────────────────────────────────────
const mp3Path = `${work}/${videoId}.mp3`;
const metaPath = `${work}/${videoId}.info.json`;
const haveCaptions = readdirSync(work).some(f => f.endsWith('.json3'));

if (!existsSync(mp3Path) || !existsSync(metaPath) || !haveCaptions) {
  console.log('→ Downloading audio + captions + metadata…');
  execSync(
    `yt-dlp -x --audio-format mp3 ` +
    `--write-auto-subs --sub-lang en --sub-format json3 ` +
    `--write-info-json --no-playlist ` +
    `-o '%(id)s.%(ext)s' '${url}'`,
    { cwd: work, stdio: 'inherit' }
  );
} else {
  console.log('→ Cached audio + captions + metadata');
}

const capFile = readdirSync(work).find(f => f.endsWith('.json3'));
const captions = JSON.parse(readFileSync(`${work}/${capFile}`, 'utf8'));
const meta = JSON.parse(readFileSync(metaPath, 'utf8'));

const lines = [];
for (const ev of captions.events || []) {
  if (!ev.segs) continue;
  const text = ev.segs.map(s => s.utf8 || '').join('').replace(/\s+/g, ' ').trim();
  if (!text) continue;
  const start = (ev.tStartMs || 0) / 1000;
  lines.push({ start, text });
}
const totalDuration = meta.duration || lines[lines.length - 1].start + 5;
console.log(`→ ${lines.length} lines, ${totalDuration.toFixed(0)}s total`);

// ── 2. Upload full mp3 to Convex ──────────────────────────────
async function uploadFile(name, buffer, contentType) {
  const uploadUrl = await convex.mutation('files:generateUploadUrl');
  const putResp = await fetch(uploadUrl, { method: 'POST', headers: { 'Content-Type': contentType }, body: buffer });
  if (!putResp.ok) throw new Error(`Upload failed (${putResp.status}): ${await putResp.text()}`);
  const { storageId } = await putResp.json();
  await convex.mutation('files:save', { name, storageId, contentType, secret: PUBLISH_SECRET });
  return `/img/${name}`;
}

const sourceName = `auteque-${videoId}.mp3`;
const existing = await convex.query('files:getUrl', { name: sourceName });
let sourceUrl;
if (existing) {
  sourceUrl = `/img/${sourceName}`;
  console.log(`→ Source mp3 cached at ${sourceUrl}`);
} else {
  console.log('→ Uploading full mp3 to Convex…');
  sourceUrl = await uploadFile(sourceName, readFileSync(mp3Path), 'audio/mpeg');
  console.log(`→ ${sourceUrl}`);
}

// ── 3. LLM concept extraction ─────────────────────────────────
const fmtTime = (s) => {
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${sec < 10 ? '0' : ''}${sec}`;
};
const timestamped = lines.map(l => `[${fmtTime(l.start)}] ${l.text}`).join('\n');

// Distinct hues that read well on a dark canvas
const PALETTE = [
  '#a855f7', // purple
  '#06b6d4', // teal/cyan
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ec4899', // pink
  '#ef4444', // coral
  '#8b5cf6', // violet
  '#14b8a6'  // teal
];

console.log('→ Extracting concepts via OpenRouter (openai/gpt-4o-mini)…');
const llmResp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${OPENROUTER_KEY}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://secret-aardvark-418.convex.site/app/auteque',
    'X-Title': 'auteque-meaning'
  },
  body: JSON.stringify({
    model: 'openai/gpt-4o-mini',
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'concepts',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            concepts: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', description: 'short slug, kebab-case' },
                  label: { type: 'string', description: '2-4 word display name' },
                  color: { type: 'string', enum: PALETTE },
                  ranges: {
                    type: 'array',
                    description: 'time ranges in seconds where this concept is discussed',
                    items: {
                      type: 'object',
                      properties: {
                        start: { type: 'number' },
                        end: { type: 'number' },
                        intensity: { type: 'number', description: '0.0-1.0; how prominent in this range' }
                      },
                      required: ['start', 'end', 'intensity'],
                      additionalProperties: false
                    }
                  }
                },
                required: ['id', 'label', 'color', 'ranges'],
                additionalProperties: false
              }
            }
          },
          required: ['concepts'],
          additionalProperties: false
        }
      }
    },
    messages: [
      {
        role: 'system',
        content:
          'You analyze a timestamped transcript and identify 6 to 8 key recurring concepts. ' +
          'For each concept, list the time ranges (start/end in seconds) where it is discussed ' +
          'and an intensity score 0.0-1.0 indicating how central the concept is to that range. ' +
          'A concept can have multiple ranges separated by gaps — that is the whole point: ' +
          'we want to see when concepts return throughout the talk. ' +
          'Choose concepts that are distinct from each other and central to the talk. ' +
          'Each concept must use a unique color from the provided palette. ' +
          'Range times must lie within the total duration. ' +
          'Aim for 3-6 ranges per concept; ranges of 30-180 seconds work best.'
      },
      {
        role: 'user',
        content:
          `Source: "${meta.title}" by ${meta.uploader}.\n` +
          `Total duration: ${totalDuration.toFixed(1)}s.\n\n` +
          `Transcript:\n${timestamped}\n\n` +
          `Return 6-8 concepts.`
      }
    ]
  })
});

if (!llmResp.ok) {
  console.error(`OpenRouter failed (${llmResp.status}): ${await llmResp.text()}`);
  process.exit(1);
}
const llmData = await llmResp.json();
const { concepts } = JSON.parse(llmData.choices[0].message.content);
console.log(`→ ${concepts.length} concepts extracted`);
for (const c of concepts) {
  console.log(`   ${c.label.padEnd(28)} ${c.color}  ${c.ranges.length} ranges`);
}

// Clamp ranges to [0, duration]
for (const c of concepts) {
  for (const r of c.ranges) {
    r.start = Math.max(0, r.start);
    r.end = Math.min(totalDuration, r.end);
    r.intensity = Math.max(0, Math.min(1, r.intensity));
  }
  c.ranges = c.ranges.filter(r => r.end > r.start);
}

// ── 4. Manifest ───────────────────────────────────────────────
const manifest = {
  source: {
    name: sourceName,
    url: sourceUrl,
    youtubeUrl: url,
    videoId,
    title: meta.title,
    uploader: meta.uploader,
    channelUrl: meta.channel_url
  },
  duration: totalDuration,
  concepts,
  generatedAt: new Date().toISOString(),
  model: 'openai/gpt-4o-mini'
};

const manifestPath = new URL('../demo/auteque.manifest.json', import.meta.url).pathname;
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`✓ Manifest written: ${manifestPath}`);

const manifestName = `auteque-${videoId}-meaning.json`;
const manifestUrl = await uploadFile(manifestName, Buffer.from(JSON.stringify(manifest)), 'application/json');
console.log(`✓ Manifest uploaded: ${manifestUrl}`);

console.log('\n--- Hand off to auteque.html ---');
console.log(`AUDIO_URL  = ${sourceUrl}`);
console.log(`MANIFEST   = ${manifestUrl}`);
console.log(`TITLE      = ${meta.title}`);
console.log(`UPLOADER   = ${meta.uploader}`);

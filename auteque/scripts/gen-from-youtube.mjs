#!/usr/bin/env node
// auteque/scripts/gen-from-youtube.mjs <youtube-url>
//
// Pipeline:
//   1. yt-dlp           → mp3 + auto-captions (json3) + metadata
//   2. parse captions   → timestamped transcript
//   3. OpenRouter LLM   → segment into 6-8 chunks (json_schema strict)
//   4. ffmpeg           → split mp3 by chunk boundaries
//   5. Convex storage   → upload each chunk as audioteca-tN.mp3
//   6. write manifest   → auteque/demo/audioteca.manifest.json
//
// Requires in .env.local: CONVEX_URL, PUBLISH_SECRET, OPENROUTER_KEY.
// Requires on PATH: yt-dlp, ffmpeg.

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
if (!url) { console.error('Usage: node gen-from-youtube.mjs <youtube-url>'); process.exit(1); }

const videoId = (url.match(/[?&]v=([^&]+)/) || url.match(/youtu\.be\/([^?]+)/) || [])[1];
if (!videoId) { console.error('Could not parse video id from URL'); process.exit(1); }

const work = `/tmp/auteque-${videoId}`;
mkdirSync(work, { recursive: true });

const convex = new ConvexHttpClient(CONVEX_URL);

// ── 1. Download audio + captions + metadata ───────────────────
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
if (!capFile) { console.error('No caption file produced (video may have no auto-subs)'); process.exit(1); }

// ── 2. Parse captions ─────────────────────────────────────────
const captions = JSON.parse(readFileSync(`${work}/${capFile}`, 'utf8'));
const lines = [];
for (const ev of captions.events || []) {
  if (!ev.segs) continue;
  const text = ev.segs.map(s => s.utf8 || '').join('').replace(/\s+/g, ' ').trim();
  if (!text) continue;
  const start = (ev.tStartMs || 0) / 1000;
  const end = start + (ev.dDurationMs || 0) / 1000;
  lines.push({ start, end, text });
}
if (!lines.length) { console.error('Caption file had no usable lines'); process.exit(1); }
console.log(`→ ${lines.length} caption lines parsed`);

const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
const totalDuration = meta.duration || lines[lines.length - 1].end;

// ── 3. Compose timestamped transcript ─────────────────────────
const fmtTime = (s) => {
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${sec < 10 ? '0' : ''}${sec}`;
};
const timestamped = lines.map(l => `[${fmtTime(l.start)}] ${l.text}`).join('\n');

// ── 4. LLM segmentation ───────────────────────────────────────
console.log('→ Segmenting via OpenRouter (openai/gpt-4o-mini)…');
const llmResp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${OPENROUTER_KEY}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://secret-aardvark-418.convex.site/app/audioteca',
    'X-Title': 'auteque-gen'
  },
  body: JSON.stringify({
    model: 'openai/gpt-4o-mini',
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'segments',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            segments: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  start: { type: 'number' },
                  end: { type: 'number' },
                  title: { type: 'string' },
                  author: { type: 'string' },
                  category: { type: 'string', enum: ['Premise', 'Argument', 'Evidence', 'Anecdote', 'Synthesis'] },
                  icon: { type: 'string', enum: ['intro', 'lecture', 'guide', 'interview'] },
                  summary: { type: 'string' }
                },
                required: ['start', 'end', 'title', 'author', 'category', 'icon', 'summary'],
                additionalProperties: false
              }
            }
          },
          required: ['segments'],
          additionalProperties: false
        }
      }
    },
    messages: [
      {
        role: 'system',
        content:
          'You segment a timestamped transcript into 6 to 8 coherent listening chunks. ' +
          'Each chunk is a self-contained idea or beat. Pick natural cut points at topic shifts. ' +
          'Cover the full duration with no gaps and no overlaps; first chunk starts at 0 and last chunk ends at the total duration. ' +
          'Times are seconds. Title is 4-9 words. Summary is one sentence. ' +
          'Category options: Premise (framing/setup), Argument (a claim being made), Evidence (data/example), Anecdote (story), Synthesis (takeaway). ' +
          'Icon options: intro, lecture, guide, interview — pick the closest visual metaphor.'
      },
      {
        role: 'user',
        content:
          `Source: "${meta.title}" by ${meta.uploader}.\n` +
          `Total duration: ${totalDuration.toFixed(1)}s.\n\n` +
          `Transcript:\n${timestamped}\n\n` +
          `Return 6-8 segments.`
      }
    ]
  })
});

if (!llmResp.ok) {
  console.error(`OpenRouter failed (${llmResp.status}): ${await llmResp.text()}`);
  process.exit(1);
}
const llmData = await llmResp.json();
const { segments } = JSON.parse(llmData.choices[0].message.content);
console.log(`→ ${segments.length} segments produced`);

// Coerce: clamp ends, ensure first starts at 0 and last ends at totalDuration
segments.sort((a, b) => a.start - b.start);
segments[0].start = 0;
segments[segments.length - 1].end = totalDuration;
for (let i = 0; i < segments.length - 1; i++) {
  if (segments[i].end > segments[i + 1].start) segments[i].end = segments[i + 1].start;
  if (segments[i + 1].start > segments[i].end) segments[i + 1].start = segments[i].end;
}

// ── 5. Split + upload ─────────────────────────────────────────
async function uploadMp3(name, buffer) {
  const uploadUrl = await convex.mutation('files:generateUploadUrl');
  const putResp = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'audio/mpeg' },
    body: buffer
  });
  if (!putResp.ok) throw new Error(`Upload failed (${putResp.status}): ${await putResp.text()}`);
  const { storageId } = await putResp.json();
  await convex.mutation('files:save', { name, storageId, contentType: 'audio/mpeg', secret: PUBLISH_SECRET });
  return `/img/${name}`;
}

const tracks = [];
for (let i = 0; i < segments.length; i++) {
  const seg = segments[i];
  const id = `t${i + 1}`;
  const fileName = `audioteca-${id}.mp3`;
  const segPath = `${work}/${fileName}`;
  process.stdout.write(`→ ${id} [${fmtTime(seg.start)}–${fmtTime(seg.end)}] ${seg.title}… `);
  // Re-encode for clean cuts (stream-copy can leave clicks at MP3 frame boundaries)
  execSync(
    `ffmpeg -y -ss ${seg.start} -to ${seg.end} -i "${mp3Path}" -c:a libmp3lame -b:a 128k "${segPath}" 2>/dev/null`
  );
  const buf = readFileSync(segPath);
  const trackUrl = await uploadMp3(fileName, buf);
  console.log(`${(buf.length / 1024).toFixed(0)}KB → ${trackUrl}`);
  tracks.push({
    id,
    title: seg.title,
    author: seg.author,
    category: seg.category,
    icon: seg.icon,
    summary: seg.summary,
    url: trackUrl,
    start: seg.start,
    end: seg.end
  });
}

// ── 6. Manifest ────────────────────────────────────────────────
const manifest = {
  source: { url, videoId, title: meta.title, uploader: meta.uploader, channelUrl: meta.channel_url },
  totalDuration,
  generatedAt: new Date().toISOString(),
  model: 'openai/gpt-4o-mini',
  tracks
};
const manifestPath = new URL('../demo/audioteca.manifest.json', import.meta.url).pathname;
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`\n✓ Manifest: ${manifestPath}`);

// ── 7. SEED snippet for audioteca.html ────────────────────────
const seedBlock = tracks.map(t => `      {
        id: '${t.id}',
        title: ${JSON.stringify(t.title)},
        author: ${JSON.stringify(t.author)},
        category: ${JSON.stringify(t.category)},
        icon: '${t.icon}',
        url: '${t.url}'
      }`).join(',\n');
const cats = [...new Set(tracks.map(t => t.category))];
console.log('\n--- SEED block (paste into audioteca.html) ---\n');
console.log(`    const SEED = [\n${seedBlock}\n    ];\n`);
console.log(`    const CATEGORIES = ['Todas', ${cats.map(c => `'${c}'`).join(', ')}];`);

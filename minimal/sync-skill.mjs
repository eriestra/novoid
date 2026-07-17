#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// sync-skill — embed the canonical minimal runtime into skill markdown.
//
// The runtime lives in ONE place: minimal/nv-core.js + minimal/nv-min.css
// (tested against test-runner/). This script copies each into the fenced block
// between its <!-- embed:<file>:begin --> / :end markers in the target docs, so
// the skill is self-distributing (an agent reads it and inlines verbatim bytes,
// not a paraphrase) without a second source of truth to drift.
//
//   node minimal/sync-skill.mjs           # embed (rewrite the marked blocks)
//   node minimal/sync-skill.mjs --check   # verify in sync; exit 1 on drift (CI)
// ═══════════════════════════════════════════════════════════════════════
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const check = process.argv.includes('--check');

// Sources embedded (id → file + fence language)
const SOURCES = [
  { id: 'nv-core.js', file: path.join(HERE, 'nv-core.js'), lang: 'js' },
  { id: 'nv-min.css', file: path.join(HERE, 'nv-min.css'), lang: 'css' },
];

// Docs that carry embed markers
const TARGETS = [
  path.join(ROOT, 'skills', 'novoid-minimal.md'),
  path.join(ROOT, 'SKILL.md'),
];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

let drift = false;
for (const target of TARGETS) {
  if (!fs.existsSync(target)) continue;
  let md = fs.readFileSync(target, 'utf8');
  let changed = false;
  for (const s of SOURCES) {
    const begin = `<!-- embed:${s.id}:begin -->`;
    const end = `<!-- embed:${s.id}:end -->`;
    const re = new RegExp(esc(begin) + '[\\s\\S]*?' + esc(end));
    if (!re.test(md)) continue;   // this target doesn't embed this source
    const src = fs.readFileSync(s.file, 'utf8').replace(/\s+$/, '');
    const block = `${begin}\n\`\`\`${s.lang}\n${src}\n\`\`\`\n${end}`;
    if (md.match(re)[0] !== block) { drift = true; changed = true; md = md.replace(re, block); }
  }
  if (changed && !check) fs.writeFileSync(target, md);
  if (changed) console.error(`${check ? 'DRIFT' : 'updated'}: ${path.relative(ROOT, target)}`);
}

if (check) {
  if (drift) { console.error('\nEmbedded runtime is out of sync. Run: node minimal/sync-skill.mjs'); process.exit(1); }
  console.log('skill embeds in sync ✓');
} else {
  console.log(drift ? 'skill embeds updated ✓' : 'skill embeds already in sync ✓');
}

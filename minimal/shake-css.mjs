#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// shake-css — emit only the CSS rules an app (or the whole corpus) uses.
//
// The full design system defines ~436 nv- classes; the 45-app corpus uses ~187.
// This tool keeps design tokens + base rules + only the rules whose selectors
// reference an nv- class actually present in the given HTML file(s), so a
// minimal-tier app can ship a per-app CSS subset instead of the 41 KB sheet.
//
// Usage:
//   node shake-css.mjs <app.html> [<app2.html> ...]   > app.css
//   node shake-css.mjs --stats <glob-of-html...>        (report only, no output)
//
// CSS source: dist/core.min.css + dist/components.min.css (resolved from repo root).
// ═══════════════════════════════════════════════════════════════════════
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const stats = args[0] === '--stats';
const files = (stats ? args.slice(1) : args).filter(Boolean);
if (!files.length) { process.stderr.write('usage: node shake-css.mjs [--stats] <app.html>...\n'); process.exit(2); }

// ── used nv- classes across all given files (covers HTML class="" and JS class:'') ──
const used = new Set();
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/nv-[a-z0-9-]+/gi)) used.add(m[0]);
}

// ── load full CSS ──
const cssFiles = ['dist/core.min.css', 'dist/components.min.css'].map(p => path.join(ROOT, p));
let css = '';
for (const p of cssFiles) { try { css += fs.readFileSync(p, 'utf8') + '\n'; } catch {} }

// ── split into top-level blocks (rules + @media), brace-matched ──
function splitBlocks(s) {
  const blocks = []; let depth = 0, start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { blocks.push(s.slice(start, i + 1)); start = i + 1; } }
  }
  return blocks.map(b => b.trim()).filter(Boolean);
}

const KEEP_ALWAYS = /^(:root|\*|html|body|\[data-theme|\.nv-dark|@font-face|@keyframes)/;
const definedClasses = new Set([...css.matchAll(/\.(nv-[a-z0-9-]+)/gi)].map(m => m[1]));

function selectorUsesClass(selectorList) {
  const cls = [...selectorList.matchAll(/\.(nv-[a-z0-9-]+)/gi)].map(m => m[1]);
  if (!cls.length) return KEEP_ALWAYS.test(selectorList.trim());   // non-class base rule
  return cls.some(c => used.has(c));
}

function shakeRules(s) {
  return splitBlocks(s).filter(block => {
    const head = block.slice(0, block.indexOf('{')).trim();
    if (head.startsWith('@media')) return true;   // media wrappers handled by caller
    return selectorUsesClass(head);
  });
}

const out = [];
for (const block of splitBlocks(css)) {
  const head = block.slice(0, block.indexOf('{')).trim();
  if (head.startsWith('@media')) {
    const inner = block.slice(block.indexOf('{') + 1, block.lastIndexOf('}'));
    const kept = shakeRules(inner);
    if (kept.length) out.push(`${head}{${kept.join('')}}`);
  } else if (KEEP_ALWAYS.test(head) || selectorUsesClass(head)) {
    out.push(block);
  }
}

const shaken = out.join('\n');
if (stats) {
  process.stderr.write(
    `files:            ${files.length}\n` +
    `nv- classes used: ${used.size}\n` +
    `nv- classes defined: ${definedClasses.size}\n` +
    `full CSS:  ${css.length} B\n` +
    `shaken CSS: ${shaken.length} B  (${Math.round(100 - shaken.length / css.length * 100)}% smaller)\n`
  );
} else {
  process.stdout.write(shaken + '\n');
}

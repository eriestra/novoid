#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// no∅ test runner — pure-JS replacement for the Rust `novoid-browser --test`
//
// Zero npm dependencies. Uses only Node builtins (node:vm, node:fs, node:path).
// Reuses the exact same JS harness shims the Rust runner embedded
// (shims/{dom-polyfill,convex-mock,observer}.js), swapping QuickJS for
// Node's built-in `vm`. The whole stack is now JS an agent can read AND patch.
//
// Usage:
//   node novoid-test.mjs --test <spec.json> <app.html> \
//        [--seed <ref> <json>]... [--hash <#/route>] [--peek|--compact]
//
// Exit code: 0 = all steps passed, 1 = failure (drop-in for verify.sh phase 3).
// ═══════════════════════════════════════════════════════════════════════

import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHIM_DIR = path.join(HERE, 'shims');

// ─── CLI parsing ───────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { specPath: null, file: null, seeds: [], hash: null, mode: 'json', browse: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--test') out.specPath = argv[++i];
    else if (a === '--browse') out.browse = true;
    else if (a === '--seed') { out.seeds.push([argv[++i], argv[++i]]); }
    else if (a === '--hash') out.hash = argv[++i];
    else if (a === '--peek') out.mode = 'peek';
    else if (a === '--compact' || a === '-c') out.mode = 'compact';
    else if (a === '--json') out.mode = 'json';
    else if (!a.startsWith('--')) out.file = a;
  }
  // No spec → browse mode (schema synthesis), replacing the Rust `novoid-browser <file>`.
  if (!out.specPath && out.file) out.browse = true;
  return out;
}

// ─── HTML parsing (replaces scraper) ───────────────────────────────────
const VOID_TAGS = new Set(['area','base','br','col','embed','hr','img','input',
  'link','meta','param','source','track','wbr']);

function attrValue(attrs, name) {
  const m = attrs.match(new RegExp(name + '\\s*=\\s*"([^"]*)"', 'i'))
        || attrs.match(new RegExp(name + "\\s*=\\s*'([^']*)'", 'i'));
  return m ? m[1] : null;
}

function parseBodyElements(html) {
  const bm = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  if (!bm) return [];
  const inner = bm[1]
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  const els = [];
  const stack = [];
  const tagRe = /<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>])*?)(\/?)>/g;
  let m;
  while ((m = tagRe.exec(inner))) {
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    const attrs = m[3] || '';
    const selfClose = m[4] === '/';
    if (closing) { stack.pop(); continue; }
    const idx = els.length;
    els.push({
      tag,
      id: attrValue(attrs, 'id'),
      class: attrValue(attrs, 'class'),
      parentIdx: stack.length ? stack[stack.length - 1] : null,
    });
    if (!selfClose && !VOID_TAGS.has(tag)) stack.push(idx);
  }
  return els;
}

function parseHtml(html) {
  const scriptSrcs = [];
  const inlineScripts = [];
  let isNovoid = false;
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1] || '';
    const body = m[2] || '';
    const src = attrValue(attrs, 'src');
    if (src) {
      if (/core\.min\.js|core\.js|novoid\.min\.js|novoid\.js/.test(src)) isNovoid = true;
      scriptSrcs.push(src);
    } else {
      const type = (attrValue(attrs, 'type') || '').trim().toLowerCase();
      if (type && type !== 'text/javascript' && type !== 'module') continue;
      const trimmed = body.trim();
      if (!trimmed) continue;
      inlineScripts.push(trimmed);
      if (trimmed.includes('Novoid.')) isNovoid = true;
    }
  }
  return { scriptSrcs, inlineScripts, isNovoid, bodyElements: parseBodyElements(html) };
}

// ─── Context (replaces QuickJS runtime) ────────────────────────────────
function readShim(name) { return fs.readFileSync(path.join(SHIM_DIR, name), 'utf8'); }

function buildContext() {
  const ctx = vm.createContext({});
  run(ctx, readShim('dom-polyfill.js'), 'dom-polyfill.js');
  run(ctx, readShim('convex-mock.js'), 'convex-mock.js');
  return ctx;
}

// Cap synchronous execution so a runaway app (e.g. a requestAnimationFrame
// animation loop the polyfill executes eagerly) fails gracefully instead of
// hanging — a guard the QuickJS host couldn't offer. 0 disables (trusted shims).
const APP_TIMEOUT_MS = Number(process.env.NOVOID_TEST_TIMEOUT || 15000);

function run(ctx, code, filename, timeout = 0) {
  return vm.runInContext(code, ctx, timeout ? { filename, timeout } : { filename });
}

function evalString(ctx, code, timeout = APP_TIMEOUT_MS) {
  const v = vm.runInContext(code, ctx, timeout ? { filename: 'eval', timeout } : { filename: 'eval' });
  if (v === null || v === undefined) return null;
  return String(v);
}

function jsLit(s) { return JSON.stringify(String(s)); }

function setupBodyElements(ctx, els) {
  if (!els.length) return;
  let js = '(function(){\n';
  els.forEach((el, i) => {
    js += `var e${i}=document.createElement(${jsLit(el.tag)});`;
    if (el.id) js += ` e${i}.id=${jsLit(el.id)}; e${i}._attributes.id=${jsLit(el.id)};`;
    if (el.class) js += ` e${i}.className=${jsLit(el.class)};`;
    js += el.parentIdx === null
      ? ` document.body.appendChild(e${i});\n`
      : ` e${el.parentIdx}.appendChild(e${i});\n`;
  });
  js += '})()';
  run(ctx, js, 'setup-body');
}

function runAppScript(ctx, appJs) {
  const wrapped = `try { ${appJs} } catch(__e){ __novoid_browser.captureError('uncaught', __e.message||String(__e), __e.stack||''); }`;
  try { run(ctx, wrapped, 'app-inline', APP_TIMEOUT_MS); }
  catch (e) {
    if (/timed out/i.test(e.message)) throw new Error(`app execution exceeded ${APP_TIMEOUT_MS}ms (runaway loop?)`);
    try { run(ctx, appJs, 'app-inline-raw', APP_TIMEOUT_MS); } catch (e2) {
      run(ctx, `__novoid_browser.captureError('parse', ${jsLit(e2.message || String(e2))}, '')`, 'capture'); } }
}

// Bridge the QuickJS→Node scoping gap: core declares `const Novoid` (script-local
// in vm, unlike QuickJS global eval) but sets window.Novoid. Promote it to a real
// global so the observer's bare `Novoid` reference resolves.
const NOVOID_BRIDGE = 'if (typeof Novoid==="undefined" && typeof window!=="undefined" && window.Novoid) globalThis.Novoid = window.Novoid;';

function novoidReady(ctx) {
  return evalString(ctx, 'String(typeof Novoid!=="undefined" || (typeof window!=="undefined" && !!window.Novoid))', 0) === 'true';
}

// ─── Load app + shims into the context ─────────────────────────────────
// Attaches the observer as soon as Novoid appears — whether from an external
// <script> (mainline apps) or from an inline core <script> (minimal-tier
// single-file apps). The observer MUST sit between core and app so it can patch
// signal()/createStore() before the app calls them.
function loadApp(ctx, file, parsed, spec, opts) {
  const dir = path.dirname(path.resolve(file));
  setupBodyElements(ctx, parsed.bodyElements);

  let attached = false;
  const attachObserver = () => {
    run(ctx, NOVOID_BRIDGE, 'novoid-bridge');
    run(ctx, readShim('observer.js'), 'observer.js');
    const err = evalString(ctx, 'typeof __novoid_observed!=="undefined" && __novoid_observed.error ? __novoid_observed.error : ""', 0);
    if (err) throw new Error('Observer could not attach: ' + err);
    for (const [ref, data] of Object.entries(spec.seed || {}))
      run(ctx, `__convex_headless.seed(${jsLit(ref)}, ${JSON.stringify(data)})`, 'seed');
    for (const [ref, data] of opts.seeds)
      run(ctx, `__convex_headless.seed(${jsLit(ref)}, ${data})`, 'seed-cli');
    if (opts.hash) {
      const h = opts.hash.startsWith('#') ? opts.hash : '#' + opts.hash;
      run(ctx, `location.hash = ${jsLit(h)};`, 'hash');
    }
    attached = true;
  };

  for (const src of parsed.scriptSrcs) {
    if (src.includes('unpkg.com') || src.includes('cdn.')) continue;   // headless: skip CDN
    const p = path.resolve(dir, src);
    let code;
    try { code = fs.readFileSync(p, 'utf8'); }
    catch (e) { throw new Error(`Failed to read script ${src}: ${e.message}`); }
    run(ctx, code, src);
  }
  if (novoidReady(ctx)) attachObserver();               // external core (mainline)

  for (const s of parsed.inlineScripts) {
    if (!attached) {
      // This inline script is (or contains) the core. Run it, then attach the
      // observer before the next script — which is the app.
      runAppScript(ctx, s);
      if (novoidReady(ctx)) attachObserver();
    } else {
      runAppScript(ctx, s);
    }
  }
  if (!attached) throw new Error('Novoid never became available (not a no∅ app?)');
  run(ctx, '__novoid_browser.flushRAFs();', 'flush', APP_TIMEOUT_MS);
}

// ─── Assertions (eq, length, contains, matches + eq_path improvement) ──
function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a && b && typeof a === 'object') {
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every(k => deepEqual(a[k], b[k]));
  }
  return false;
}

function resolvePath(obj, dotted) {
  let cur = obj;
  for (const part of String(dotted).split('.')) {
    if (cur == null) return undefined;
    cur = cur[part];
  }
  return cur;
}

// Returns { pass, reason }
function checkAssertion(actual, a) {
  if (a == null) return { pass: true };
  if ('eq' in a && !deepEqual(actual, a.eq))
    return { pass: false, reason: `eq: expected ${JSON.stringify(a.eq)}, got ${JSON.stringify(actual)}` };
  if ('length' in a) {
    if (!Array.isArray(actual)) return { pass: false, reason: `length: value is not an array` };
    if (actual.length !== a.length) return { pass: false, reason: `length: expected ${a.length}, got ${actual.length}` };
  }
  if ('contains' in a) {
    const needle = a.contains;
    if (Array.isArray(actual)) {
      if (!actual.some(x => deepEqual(x, needle))) return { pass: false, reason: `contains: array missing ${JSON.stringify(needle)}` };
    } else if (typeof actual === 'string') {
      if (typeof needle !== 'string' || !actual.includes(needle)) return { pass: false, reason: `contains: string missing ${JSON.stringify(needle)}` };
    } else return { pass: false, reason: `contains: value is not array/string` };
  }
  if ('matches' in a) {
    const pat = String(a.matches).replace(/^\*+|\*+$/g, '');
    if (typeof actual !== 'string' || !actual.includes(pat)) return { pass: false, reason: `matches: ${JSON.stringify(a.matches)} not found` };
  }
  // eq_path — implemented here (Rust ignores it → vacuous pass; see README).
  if ('eq_path' in a) {
    for (const [p, expected] of Object.entries(a.eq_path)) {
      const got = resolvePath(actual, p);
      if (!deepEqual(got, expected))
        return { pass: false, reason: `eq_path ${p}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(got)}` };
    }
  }
  return { pass: true };
}

// ─── Resource reads ────────────────────────────────────────────────────
const READ_HELPER = `
globalThis.__test_read_resource = function(name){
  const obs = __novoid_observed;
  const sigs = obs.getSignals();
  const stores = obs.getStores();
  for (const s of sigs){ if ((s.name || ('signal_'+s.id))===name) return JSON.stringify(s.value); }
  for (let i=0;i<stores.length;i++){
    const key='store_'+i;
    if (key===name) return JSON.stringify(stores[i].state);
    if (typeof stores[i].state==='object' && stores[i].state!==null){
      if (name in stores[i].state) return JSON.stringify(stores[i].state[name]);
    }
  }
  for (let i=0;i<stores.length;i++){
    const parts=name.split('.'); let cur=stores[i].state; let found=true;
    for (const p of parts){ if (cur && typeof cur==='object' && p in cur){ cur=cur[p]; } else { found=false; break; } }
    if (found) return JSON.stringify(cur);
  }
  return null;
};`;

function readResource(ctx, name) {
  const key = name.startsWith('novoid://')
    ? name.slice('novoid://'.length).split('/').slice(2).join('/')
    : name;
  const raw = evalString(ctx, `__test_read_resource(${jsLit(key)})`);
  if (raw === null || raw === '' || raw === 'null')
    return { err: `Resource '${name}' not found` };
  try { return { value: JSON.parse(raw) }; }
  catch (e) { return { err: `Failed to parse resource '${name}': ${e.message}` }; }
}

function callAction(ctx, tool, args) {
  let argsArray;
  try {
    const parsed = args === undefined ? {} : args;
    argsArray = Array.isArray(parsed) ? JSON.stringify(parsed) : `[${JSON.stringify(parsed)}]`;
  } catch { argsArray = '[{}]'; }
  const js = `(function(){
    const idx = __novoid_observed.findAction(${jsLit(tool)});
    if (idx < 0) return JSON.stringify({ ok:false, error:"action not found: ${tool}" });
    const result = __novoid_observed.callAction(idx, ${jsLit(tool)}, ${argsArray});
    return JSON.stringify(result);
  })()`;
  const raw = evalString(ctx, js);
  try { return JSON.parse(raw); } catch { return { ok: false, error: 'call returned non-JSON' }; }
}

// ─── Step execution ────────────────────────────────────────────────────
function executeStep(ctx, idx, step) {
  const base = { step: idx, action: step.action };
  if (step.action === 'read') {
    if (!step.resource) return { ...base, passed: false, error: "Missing 'resource' field" };
    const r = readResource(ctx, step.resource);
    if (r.err) return { ...base, resource: step.resource, passed: false, error: r.err };
    const chk = checkAssertion(r.value, step.assert);
    return { ...base, resource: step.resource, passed: chk.pass, actual: r.value,
             error: chk.pass ? undefined : (chk.reason || 'assertion failed') };
  }
  if (step.action === 'call') {
    if (!step.tool) return { ...base, passed: false, error: "Missing 'tool' field" };
    const res = callAction(ctx, step.tool, step.args);
    if (res && res.ok === false) return { ...base, tool: step.tool, passed: false, error: res.error || 'unknown' };
    run(ctx, '__novoid_browser.flushRAFs();', 'flush', APP_TIMEOUT_MS);
    if (step.then && step.then.read) return applyThen(ctx, base, step, step.tool);
    return { ...base, tool: step.tool, passed: true };
  }
  if (step.action === 'push') {
    if (!step.query) return { ...base, passed: false, error: "Missing 'query' field" };
    const data = step.data === undefined ? '[]' : JSON.stringify(step.data);
    try { run(ctx, `__convex_headless.push(${jsLit(step.query)}, ${data})`, 'push'); }
    catch (e) { return { ...base, passed: false, error: e.message }; }
    run(ctx, '__novoid_browser.flushRAFs();', 'flush', APP_TIMEOUT_MS);
    if (step.then && step.then.read) return applyThen(ctx, base, step, null);
    return { ...base, resource: step.query, passed: true };
  }
  return { ...base, passed: false, error: `Unknown action: ${step.action}` };
}

function applyThen(ctx, base, step, tool) {
  const readName = step.then.read;
  const r = readResource(ctx, readName);
  if (r.err) return { ...base, resource: readName, tool: tool || undefined, passed: false, error: r.err };
  const chk = checkAssertion(r.value, step.then.assert);
  return { ...base, resource: readName, tool: tool || undefined, passed: chk.pass, actual: r.value,
           error: chk.pass ? undefined : (chk.reason || 'then assertion failed') };
}

function runTests(ctx, spec) {
  const start = process.hrtime.bigint();
  run(ctx, READ_HELPER, 'read-helper');
  const steps = [];
  const errors = [];
  let allPass = true;
  for (let i = 0; i < spec.steps.length; i++) {
    const r = executeStep(ctx, i, spec.steps[i]);
    if (!r.passed) { allPass = false; if (r.error) errors.push(`step ${i}: ${r.error}`); }
    steps.push(r);
  }
  const duration_ms = Number((process.hrtime.bigint() - start) / 1000000n);
  return { passed: allPass, steps, errors, duration_ms };
}

// ─── Browse: synthesize a schema (replaces synthesizer.rs) ─────────────
function readJson(ctx, expr) {
  const raw = evalString(ctx, expr, 0);
  if (raw == null) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function typeName(v) {
  if (Array.isArray(v)) return 'array';
  if (v === null) return 'null';
  const t = typeof v;
  return t === 'boolean' || t === 'number' || t === 'string' ? t : 'object';
}

function browse(ctx, url) {
  const observed = readJson(ctx, '__novoid_observed.getAll()') || {};
  const consoleArr = readJson(ctx, '__novoid_browser.getCapturedConsole()') || [];
  const uncaught = readJson(ctx, '__novoid_browser.getUncaughtErrors()') || [];
  const convexRaw = readJson(ctx, 'typeof __convex_headless!=="undefined" ? __convex_headless.getAll() : null');

  const signals = observed.signals || [];
  const stores = observed.stores || [];

  const state = {};
  signals.forEach((s, i) => { state[s.name || ('signal_' + i)] = s.value; });
  stores.forEach((s, i) => { state['store_' + i] = s.state; });

  const actions = [];
  stores.forEach((s, i) => (s.actions || []).forEach(name => actions.push({ name, source: 'store_' + i, confidence: 1.0 })));

  // entities: any array-of-objects (recursively), same heuristic as the Rust synthesizer
  const entities = {};
  function findEntities(prefix, val) {
    if (Array.isArray(val) && val.length && val[0] && typeof val[0] === 'object' && !Array.isArray(val[0])) {
      const schema = {};
      for (const k of Object.keys(val[0])) schema[k] = typeName(val[0][k]);
      entities[prefix] = { schema, count: val.length };
    } else if (val && typeof val === 'object' && !Array.isArray(val)) {
      for (const [k, v] of Object.entries(val)) findEntities(prefix ? `${prefix}.${k}` : k, v);
    }
  }
  for (const [k, v] of Object.entries(state)) findEntities(k, v);

  const errors = (observed.errors || []).map(e => ({ message: e.message, component: e.component ?? null }));
  for (const ue of uncaught) errors.push({ message: `[${ue.type}] ${ue.message}`, component: null });
  for (const c of consoleArr) {
    if (c.level === 'error') {
      const msg = (c.args || []).join(' ');
      if (!errors.some(e => msg.includes(e.message) || e.message.includes(msg)))
        errors.push({ message: msg, component: null });
    }
  }

  let convex = (convexRaw && typeof convexRaw === 'object')
    ? { subscriptions: convexRaw.subscriptions || [], mutations: convexRaw.mutations || [], actions: convexRaw.actions || [], seeds: convexRaw.seeds || [] }
    : { subscriptions: [], mutations: [], actions: [], seeds: [] };
  for (const m of (observed.mutations || [])) if (!convex.mutations.some(c => c.ref === m.ref)) convex.mutations.push({ ref: m.ref, args: null });
  for (const a of (observed.actions || [])) if (!convex.actions.some(c => c.ref === a.ref)) convex.actions.push({ ref: a.ref, args: null });

  const schema = {
    url, state, actions, entities,
    navigation: (observed.routes || []).map(r => ({ path: r.path, hasGuard: r.hasGuard })),
    components: observed.components || [],
    forms: (observed.forms || []).map(f => ({ id: f.id, fields: f.fields, schema: f.schema })),
    errors, console: consoleArr,
  };
  if (convex.subscriptions.length || convex.mutations.length || convex.actions.length) schema.convex = convex;
  return schema;
}

// ─── Output ────────────────────────────────────────────────────────────
const C = { g: '\x1b[32m', r: '\x1b[31m', dim: '\x1b[2m', x: '\x1b[0m' };

function detail(s) {
  const val = s.actual !== undefined ? ` = ${JSON.stringify(s.actual)}` : '';
  if (s.action === 'read') return `read ${s.resource || ''}${val}`;
  if (s.action === 'call') return s.resource ? `call ${s.tool} → ${s.resource}${val}` : `call ${s.tool}`;
  if (s.action === 'push') return `push ${s.resource || ''}${val}`;
  return s.action;
}

function outputPeek(report) {
  const E = (l) => process.stderr.write(l + '\n');
  E('┌─ test ────────────────────────────────────────────┐');
  for (const s of report.steps) {
    const ic = s.passed ? `${C.g}✓${C.x}` : `${C.r}✗${C.x}`;
    const line = `│ ${ic} step ${s.step}  ${detail(s)}`;
    E(s.passed ? line : `${line} — ${s.error || 'assertion failed'}`);
  }
  const total = report.steps.length;
  const passed = report.steps.filter(s => s.passed).length;
  E('├───────────────────────────────────────────────────────┤');
  const col = report.passed ? C.g : C.r;
  const ic = report.passed ? '✓' : '✗';
  E(`│ ${col}${ic} ${passed}/${total} passed (${report.duration_ms}ms)${C.x}`);
  E('└───────────────────────────────────────────────────────┘');
}

// ─── Main ──────────────────────────────────────────────────────────────
async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.file) {
    process.stderr.write('usage:\n  test:   node novoid-test.mjs --test <spec.json> <app.html> [--seed ref json]... [--hash h] [--peek|--compact]\n  browse: node novoid-test.mjs --browse <app.html> [--seed ref json]... [--hash h] [-c]\n');
    process.exit(2);
  }

  // ── Browse mode: synthesize a schema (replaces `novoid-browser <file>`) ──
  if (opts.browse) {
    let schema;
    try {
      const html = fs.readFileSync(opts.file, 'utf8');
      const parsed = parseHtml(html);
      if (!parsed.isNovoid) throw new Error('Not a no∅ app (no Novoid references found)');
      const ctx = buildContext();
      loadApp(ctx, opts.file, parsed, {}, opts);
      await new Promise(r => setTimeout(r, 0));
      schema = browse(ctx, 'file://' + path.resolve(opts.file));
    } catch (e) {
      process.stderr.write(`Error: ${e.message}\n`);
      process.exit(1);
    }
    process.stdout.write((opts.mode === 'compact' ? JSON.stringify(schema) : JSON.stringify(schema, null, 2)) + '\n');
    process.exit(0);   // runtime errors live in schema.errors; the caller decides
  }

  let spec;
  try { spec = JSON.parse(fs.readFileSync(opts.specPath, 'utf8')); }
  catch (e) { process.stderr.write(`Error reading spec: ${e.message}\n`); process.exit(1); }

  if (!Array.isArray(spec.steps)) {
    // Faithful to Rust (which requires top-level `steps`) but with a CLEAR error
    // instead of a silent no-op — this is the "schema fork" liability.
    const hint = Array.isArray(spec.tests)
      ? " — this spec uses the nested tests[]/snapshot shape, which is NOT executable. Convert to top-level 'steps' with read/call/push."
      : "";
    process.stderr.write(`Error: test spec has no top-level 'steps' array${hint}\n`);
    process.exit(1);
  }

  let report;
  try {
    const html = fs.readFileSync(opts.file, 'utf8');
    const parsed = parseHtml(html);
    if (!parsed.isNovoid) throw new Error('Not a no∅ app (no Novoid references found)');
    const ctx = buildContext();
    loadApp(ctx, opts.file, parsed, spec, opts);
    await new Promise(r => setTimeout(r, 0));  // drain any microtasks
    report = runTests(ctx, spec);
  } catch (e) {
    process.stderr.write(`Error: ${e.message}\n`);
    process.exit(1);
  }

  if (opts.mode === 'peek') outputPeek(report);
  else if (opts.mode === 'compact') process.stdout.write(JSON.stringify(report) + '\n');
  else process.stdout.write(JSON.stringify(report, null, 2) + '\n');

  process.exit(report.passed ? 0 : 1);
}

main();

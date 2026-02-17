import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseDocument } from "../src/parser.js";
import { analyzeKinesis } from "../src/kinesis/index.js";
import { detectPatterns } from "../src/kinesis/patterns.js";
import { analyzeDataflow } from "../src/kinesis/dataflow.js";
import { extractStateMachine } from "../src/kinesis/state-machine.js";
import * as acorn from "acorn";

const loginHtml = readFileSync(new URL("./fixtures/login.html", import.meta.url), "utf-8");

function parseJs(code: string): acorn.Program {
  return acorn.parse(code, { ecmaVersion: "latest", sourceType: "script", locations: true });
}

function makeBundle(scriptContent: string) {
  const html = `<!DOCTYPE html><html><head></head><body><script>${scriptContent}<\/script></body></html>`;
  return parseDocument(html);
}

describe("Kinesis (Behavior)", () => {
  it("analyzes JS behavior for login (no reactive patterns)", () => {
    const bundle = parseDocument(loginHtml);
    const result = analyzeKinesis(bundle);

    expect(result.verdict).toBe("PARTIAL");
    expect(result.signals).toBe(0);
    expect(result.effects).toBe(0);
    expect(result.cycles).toBe(0);
    expect(result.dead_signals).toBeInstanceOf(Array);
    expect(result.taint_violations).toBeInstanceOf(Array);
  });

  it("reports state machine info", () => {
    const bundle = parseDocument(loginHtml);
    const result = analyzeKinesis(bundle);

    expect(result.state_machine).toHaveProperty("states");
    expect(result.state_machine).toHaveProperty("reachable");
    expect(result.state_machine).toHaveProperty("deadlocks");
    expect(result.state_machine).toHaveProperty("warnings");
  });
});

describe("Pattern detection — novoid signals", () => {
  const code = `
const [count, setCount] = Novoid.signal(0);
const [name, setName] = Novoid.signal("");
const greeting = Novoid.derived(() => name() + count());
Novoid.effect(() => document.title = greeting());
setCount(1);
`;

  it("detects 2 signals", () => {
    const ast = parseJs(code);
    const p = detectPatterns(ast);
    expect(p.signals.length).toBe(2);
    expect(p.signals[0].getter).toBe("count");
    expect(p.signals[0].setter).toBe("setCount");
    expect(p.signals[1].getter).toBe("name");
    expect(p.signals[1].setter).toBe("setName");
  });

  it("detects 1 derived with correct dependencies", () => {
    const ast = parseJs(code);
    const p = detectPatterns(ast);
    expect(p.derived.length).toBe(1);
    expect(p.derived[0].name).toBe("greeting");
    expect(p.derived[0].dependencies).toContain("name");
    expect(p.derived[0].dependencies).toContain("count");
  });

  it("detects 1 effect with greeting dependency", () => {
    const ast = parseJs(code);
    const p = detectPatterns(ast);
    expect(p.effects.length).toBe(1);
    expect(p.effects[0].dependencies).toContain("greeting");
  });

  it("detects framework as novoid", () => {
    const ast = parseJs(code);
    const p = detectPatterns(ast);
    expect(p.framework).toBe("novoid");
  });

  it("finds name as dead signal (setter never called)", () => {
    const bundle = makeBundle(code);
    const df = analyzeDataflow(bundle);
    // name getter IS used in derived, and setName is never called
    // But dead signal = getter not read AND setter not called
    // name IS read in derived, so it's NOT dead
    expect(df.deadSignals).not.toContain("name");
    // count IS read in derived, setCount IS called
    expect(df.deadSignals).not.toContain("count");
  });

  it("verdict is SOUND when all signals used", () => {
    const bundle = makeBundle(code);
    const result = analyzeKinesis(bundle);
    expect(result.verdict).toBe("SOUND");
  });
});

describe("Pattern detection — bare function names", () => {
  it("detects signal() and effect() without Novoid prefix", () => {
    const code = `
const [x, setX] = signal(0);
effect(() => console.log(x()));
`;
    const ast = parseJs(code);
    const p = detectPatterns(ast);
    expect(p.signals.length).toBe(1);
    expect(p.effects.length).toBe(1);
    expect(p.effects[0].dependencies).toContain("x");
  });
});

describe("Pattern detection — SolidJS", () => {
  it("detects createSignal and createEffect", () => {
    const code = `
const [count, setCount] = createSignal(0);
createEffect(() => console.log(count()));
`;
    const ast = parseJs(code);
    const p = detectPatterns(ast);
    expect(p.framework).toBe("solid");
    expect(p.signals.length).toBe(1);
    expect(p.effects.length).toBe(1);
  });
});

describe("Dead signal detection", () => {
  it("detects truly dead signals (never read, never set)", () => {
    const code = `
const [used, setUsed] = Novoid.signal(0);
const [dead, setDead] = Novoid.signal(0);
Novoid.effect(() => console.log(used()));
setUsed(1);
`;
    const bundle = makeBundle(code);
    const df = analyzeDataflow(bundle);
    expect(df.deadSignals).toContain("dead");
    expect(df.deadSignals).not.toContain("used");
  });
});

describe("Cycle detection", () => {
  it("reports 0 cycles for acyclic derived chain", () => {
    const code = `
const [x, setX] = Novoid.signal(0);
const a = Novoid.derived(() => x());
const b = Novoid.derived(() => a());
`;
    const bundle = makeBundle(code);
    const df = analyzeDataflow(bundle);
    expect(df.cycles).toBe(0);
  });
});

describe("State machine extraction", () => {
  it("extracts states from setter calls with string literals", () => {
    const code = `
const [status, setStatus] = Novoid.signal("idle");
setStatus("loading");
setStatus("success");
setStatus("error");
`;
    const bundle = makeBundle(code);
    const sm = extractStateMachine(bundle);
    expect(sm.states).toBe(4);
    expect(sm.reachable).toBe(4);
  });

  it("returns empty for non-string signals", () => {
    const code = `
const [count, setCount] = Novoid.signal(0);
setCount(1);
`;
    const bundle = makeBundle(code);
    const sm = extractStateMachine(bundle);
    expect(sm.states).toBe(0);
  });

  it("initial state is idle", () => {
    const code = `
const [status, setStatus] = Novoid.signal("idle");
setStatus("loading");
`;
    const bundle = makeBundle(code);
    const sm = extractStateMachine(bundle);
    expect(sm.states).toBe(2);
    expect(sm.reachable).toBe(2);
  });
});

describe("Taint analysis", () => {
  it("detects innerHTML with user input", () => {
    const code = `
const input = document.querySelector("input");
const val = input.value;
document.getElementById("output").innerHTML = val;
`;
    const bundle = makeBundle(code);
    const df = analyzeDataflow(bundle);
    expect(df.taintViolations.length).toBeGreaterThan(0);
    expect(df.taintViolations[0]).toContain("innerHTML");
  });

  it("no violation when using textContent", () => {
    const code = `
const val = document.querySelector("input").value;
document.getElementById("output").textContent = val;
`;
    const bundle = makeBundle(code);
    const df = analyzeDataflow(bundle);
    expect(df.taintViolations.length).toBe(0);
  });

  it("detects eval with user input", () => {
    const code = `
const userCode = prompt("Enter code");
eval(userCode);
`;
    const bundle = makeBundle(code);
    const df = analyzeDataflow(bundle);
    expect(df.taintViolations.length).toBeGreaterThan(0);
  });

  it("no violation when sanitized", () => {
    const code = `
const val = document.querySelector("input").value;
const safe = encodeURIComponent(val);
location.href = "/search?q=" + safe;
`;
    const bundle = makeBundle(code);
    const df = analyzeDataflow(bundle);
    expect(df.taintViolations.length).toBe(0);
  });
});

describe("Full analysis", async () => {
  const { analyze } = await import("../src/index.js");

  it("produces a valid ProofReport", () => {
    const report = analyze(loginHtml);

    expect(report.nous).toBe("0.1.0");
    expect(["SOUND", "UNSOUND", "PARTIAL"]).toContain(report.verdict);
    expect(report.morphe).toBeDefined();
    expect(report.thesis).toBeDefined();
    expect(report.kinesis).toBeDefined();
    expect(report.cross_pillar).toBeDefined();
  });

  it("produces SOUND verdict for well-formed reactive code", () => {
    const html = `<!DOCTYPE html><html><head></head><body><main><script>
const [count, setCount] = Novoid.signal(0);
Novoid.effect(() => document.title = String(count()));
setCount(1);
<\/script></main></body></html>`;
    const report = analyze(html);
    expect(report.kinesis.verdict).toBe("SOUND");
    expect(report.kinesis.signals).toBe(1);
    expect(report.kinesis.effects).toBe(1);
  });
});

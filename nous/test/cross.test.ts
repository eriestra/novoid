import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseDocument } from "../src/parser.js";
import { analyzeMorphe } from "../src/morphe/index.js";
import { analyzeThesis } from "../src/thesis/index.js";
import { analyzeKinesis } from "../src/kinesis/index.js";
import { analyzeCrossPillar } from "../src/cross/index.js";
import { analyze } from "../src/index.js";
import type { MorpheResult, ThesisResult, KinesisResult } from "../src/types.js";

const loginHtml = readFileSync(new URL("./fixtures/login.html", import.meta.url), "utf-8");

// Helpers to create mock results
function baseMorphe(overrides: Partial<MorpheResult> = {}): MorpheResult {
  return {
    verdict: "PARTIAL",
    node_count: 5,
    contracts_checked: 0,
    contracts_passed: 0,
    accessibility: { tab_order_complete: true, all_inputs_labeled: true, landmark_structure: "valid" },
    ...overrides,
  };
}

function baseThesis(overrides: Partial<ThesisResult> = {}): ThesisResult {
  return {
    verdict: "PARTIAL",
    viewport_range: [320, 1920],
    feasible: true,
    breakpoints: [],
    developer_breakpoints: [],
    unmatched_breakpoints: [],
    cascade_conflicts: 0,
    overflow_risks: [],
    ...overrides,
  };
}

function baseKinesis(overrides: Partial<KinesisResult> = {}): KinesisResult {
  return {
    verdict: "PARTIAL",
    signals: 0,
    effects: 0,
    cycles: 0,
    dead_signals: [],
    taint_violations: [],
    state_machine: { states: 0, reachable: 0, deadlocks: 0, warnings: [] },
    ...overrides,
  };
}

const dummyBundle = parseDocument("<html><body></body></html>");

describe("Cross-Pillar: structure_x_presentation", () => {
  it("no CSS, has content → unstyled nodes detected (UNSOUND)", () => {
    const html = '<html><body><main><div class="card">Hello</div></main></body></html>';
    const bundle = parseDocument(html);
    const morphe = analyzeMorphe(bundle, []);
    // No CSS means nodes won't be covered by selectors
    const result = analyzeCrossPillar(bundle, morphe, analyzeThesis(bundle, [320, 1920]), analyzeKinesis(bundle));
    // selector_coverage always exists from analyzeMorphe; with no CSS, nodes should be uncovered
    expect(result.structure_x_presentation.verdict).toBe("UNSOUND");
    expect(result.structure_x_presentation.unstyled_nodes.length).toBeGreaterThan(0);
  });

  it("login.html with CSS → checks coverage", () => {
    const bundle = parseDocument(loginHtml);
    const morphe = analyzeMorphe(bundle, []);
    const result = analyzeCrossPillar(bundle, morphe, analyzeThesis(bundle, [320, 1920]), analyzeKinesis(bundle));
    // login.html has CSS covering .login-form elements; verdict depends on coverage completeness
    expect(["SOUND", "UNSOUND"]).toContain(result.structure_x_presentation.verdict);
  });

  it("no selector_coverage → PARTIAL", () => {
    const morphe = baseMorphe(); // no selector_coverage field
    const result = analyzeCrossPillar(dummyBundle, morphe, baseThesis(), baseKinesis());
    expect(result.structure_x_presentation.verdict).toBe("PARTIAL");
    expect(result.structure_x_presentation.unstyled_nodes).toEqual([]);
  });

  it("all covered → SOUND", () => {
    const morphe = baseMorphe({
      selector_coverage: { total: 5, covered: 5, uncovered: [] },
    });
    const result = analyzeCrossPillar(dummyBundle, morphe, baseThesis(), baseKinesis());
    expect(result.structure_x_presentation.verdict).toBe("SOUND");
  });
});

describe("Cross-Pillar: behavior_x_structure", () => {
  it("no JS + SOUND morphe → SOUND", () => {
    const morphe = baseMorphe({ verdict: "SOUND" });
    const kinesis = baseKinesis({ signals: 0, effects: 0 });
    const result = analyzeCrossPillar(dummyBundle, morphe, baseThesis(), kinesis);
    expect(result.behavior_x_structure).toBe("SOUND");
  });

  it("has signals + contracts → PARTIAL", () => {
    const morphe = baseMorphe({ contracts_checked: 2 });
    const kinesis = baseKinesis({ signals: 3, effects: 1 });
    const result = analyzeCrossPillar(dummyBundle, morphe, baseThesis(), kinesis);
    expect(result.behavior_x_structure).toBe("PARTIAL");
  });

  it("UNSOUND kinesis → UNSOUND", () => {
    const kinesis = baseKinesis({ verdict: "UNSOUND", signals: 1 });
    const result = analyzeCrossPillar(dummyBundle, baseMorphe(), baseThesis(), kinesis);
    expect(result.behavior_x_structure).toBe("UNSOUND");
  });
});

describe("Cross-Pillar: behavior_x_presentation", () => {
  it("no signals + SOUND thesis → SOUND", () => {
    const thesis = baseThesis({ verdict: "SOUND" });
    const kinesis = baseKinesis({ signals: 0 });
    const result = analyzeCrossPillar(dummyBundle, baseMorphe(), thesis, kinesis);
    expect(result.behavior_x_presentation).toBe("SOUND");
  });

  it("UNSOUND kinesis → UNSOUND", () => {
    const kinesis = baseKinesis({ verdict: "UNSOUND", signals: 2 });
    const result = analyzeCrossPillar(dummyBundle, baseMorphe(), baseThesis(), kinesis);
    expect(result.behavior_x_presentation).toBe("UNSOUND");
  });

  it("has signals + cascade conflicts → UNSOUND", () => {
    const thesis = baseThesis({ cascade_conflicts: 3 });
    const kinesis = baseKinesis({ signals: 2 });
    const result = analyzeCrossPillar(dummyBundle, baseMorphe(), thesis, kinesis);
    expect(result.behavior_x_presentation).toBe("UNSOUND");
  });

  it("has signals but no conflicts → PARTIAL", () => {
    const thesis = baseThesis({ cascade_conflicts: 0 });
    const kinesis = baseKinesis({ signals: 2 });
    const result = analyzeCrossPillar(dummyBundle, baseMorphe(), thesis, kinesis);
    expect(result.behavior_x_presentation).toBe("PARTIAL");
  });
});

describe("Cross-Pillar: full integration via analyze()", () => {
  it("login.html cross_pillar has valid structure", () => {
    const report = analyze(loginHtml);
    expect(report.cross_pillar).toBeDefined();
    expect(["SOUND", "UNSOUND", "PARTIAL"]).toContain(report.cross_pillar.behavior_x_structure);
    expect(["SOUND", "UNSOUND", "PARTIAL"]).toContain(report.cross_pillar.behavior_x_presentation);
    expect(["SOUND", "UNSOUND", "PARTIAL"]).toContain(report.cross_pillar.structure_x_presentation.verdict);
    expect(Array.isArray(report.cross_pillar.structure_x_presentation.unstyled_nodes)).toBe(true);
  });
});

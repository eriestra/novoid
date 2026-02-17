// Realistic LLM-generated app fixtures — verify Nous catches common bugs
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { analyze } from "../src/index.js";
import { parseDocument } from "../src/parser.js";
import { detectCascadeConflicts } from "../src/thesis/cascade.js";
import { analyzeBreakpoints } from "../src/thesis/breakpoints.js";
import { analyzeDataflow } from "../src/kinesis/dataflow.js";
import { extractStateMachine } from "../src/kinesis/state-machine.js";
import { detectPatterns } from "../src/kinesis/patterns.js";
import { analyzeConstraints } from "../src/thesis/constraints.js";

const taskManager = readFileSync(new URL("./fixtures/task-manager.html", import.meta.url), "utf-8");
const dashboard = readFileSync(new URL("./fixtures/dashboard.html", import.meta.url), "utf-8");
const settingsForm = readFileSync(new URL("./fixtures/settings-form.html", import.meta.url), "utf-8");

// ============================================================
// Task Manager — cascade conflicts, dead signals, stuck FSM
// ============================================================
describe("Task Manager — LLM bug detection", () => {
  const report = analyze(taskManager);

  it("overall verdict is not SOUND (multiple bugs)", () => {
    expect(report.verdict).not.toBe("SOUND");
  });

  // --- Kinesis: dead signals ---
  it("detects dead signal (newId: setter called but getter never read)", () => {
    const bundle = parseDocument(taskManager);
    const df = analyzeDataflow(bundle);
    // newId getter is never read in any effect/derived
    // setNewId IS called, but the getter is dead
    expect(df.deadSignals).toContain("newId");
  });

  it("detects dead signal (tempDraft: never read, never set)", () => {
    const bundle = parseDocument(taskManager);
    const df = analyzeDataflow(bundle);
    expect(df.deadSignals).toContain("tempDraft");
  });

  it("does NOT flag live signals as dead", () => {
    const bundle = parseDocument(taskManager);
    const df = analyzeDataflow(bundle);
    expect(df.deadSignals).not.toContain("tasks");
    expect(df.deadSignals).not.toContain("filter");
    expect(df.deadSignals).not.toContain("filtered");
  });

  // --- Kinesis: state machine ---
  it("detects state machine states including syncStatus FSM", () => {
    const bundle = parseDocument(taskManager);
    const sm = extractStateMachine(bundle);
    // syncStatus: idle, syncing, synced, error + other string signals (filter, tempDraft)
    expect(sm.states).toBeGreaterThanOrEqual(4);
    // Should have warnings (unreachable states from independent string signals)
    expect(sm.warnings.length).toBeGreaterThan(0);
  });

  // --- Kinesis: signal count ---
  it("detects all novoid signals", () => {
    const bundle = parseDocument(taskManager);
    const patterns = detectPatterns(bundle.js!);
    expect(patterns.framework).toBe("novoid");
    // tasks, filter, newId, tempDraft, syncStatus = 5 signals
    expect(patterns.signals.length).toBe(5);
  });

  // --- Thesis: cascade conflicts ---
  it("detects cascade conflicts on .btn (competing selectors at same specificity)", () => {
    const bundle = parseDocument(taskManager);
    const cascade = detectCascadeConflicts(bundle);
    expect(cascade.count).toBeGreaterThan(0);
    const btnConflict = cascade.conflicts.find(c => c.element.includes(".btn"));
    expect(btnConflict).toBeDefined();
  });

  // --- Thesis: breakpoints ---
  it("detects @media breakpoints at 768px and 1024px", () => {
    const bundle = parseDocument(taskManager);
    const bp = analyzeBreakpoints(bundle, [320, 1920]);
    expect(bp.developer).toContain(768);
    expect(bp.developer).toContain(1024);
  });

  // --- Thesis: flex overflow (HTML-aware) ---
  it("detects flex overflow from .sidebar + .main-content min-widths (250+400=650 > 320)", () => {
    const bundle = parseDocument(taskManager);
    const result = analyzeConstraints(bundle, [320, 1920]);
    expect(result.feasible).toBe(false);
    expect(result.overflowRisks.length).toBeGreaterThan(0);
    expect(result.overflowRisks.some(r => r.includes("650") || r.includes("container"))).toBe(true);
  });
});

// ============================================================
// Dashboard — missing landmarks, dead signals, cascade conflict
// ============================================================
describe("Dashboard — LLM bug detection", () => {
  const report = analyze(dashboard);

  it("detects missing landmark structure (no <main>)", () => {
    expect(report.morphe.accessibility.landmark_structure).not.toBe("valid");
  });

  it("detects dead signal (totalRevenue: getter never read)", () => {
    const bundle = parseDocument(dashboard);
    const df = analyzeDataflow(bundle);
    expect(df.deadSignals).toContain("totalRevenue");
  });

  it("detects cascade conflict on .value (stat-card vs metric)", () => {
    const bundle = parseDocument(dashboard);
    const cascade = detectCascadeConflicts(bundle);
    const valueConflict = cascade.conflicts.find(c => c.property === "font-size");
    expect(valueConflict).toBeDefined();
  });

  it("detects @media breakpoints", () => {
    const bundle = parseDocument(dashboard);
    const bp = analyzeBreakpoints(bundle, [320, 1920]);
    expect(bp.developer).toContain(768);
    expect(bp.developer).toContain(1200);
  });

  it("detects state machine states including loadState FSM", () => {
    const bundle = parseDocument(dashboard);
    const sm = extractStateMachine(bundle);
    // loadState: initial, loading, loaded, refreshing + timeRange: "7d"
    expect(sm.states).toBeGreaterThanOrEqual(4);
  });

  // --- Thesis: flex overflow (HTML-aware) ---
  it("detects flex overflow from 3 stat-cards (300*3=900 > 320)", () => {
    const bundle = parseDocument(dashboard);
    const result = analyzeConstraints(bundle, [320, 1920]);
    expect(result.feasible).toBe(false);
    expect(result.overflowRisks.length).toBeGreaterThan(0);
    expect(result.overflowRisks.some(r => r.includes("dashboard"))).toBe(true);
  });
});

// ============================================================
// Settings Form — unlabeled inputs, dead signals, stuck FSM
// ============================================================
describe("Settings Form — LLM bug detection", () => {
  const report = analyze(settingsForm);

  it("detects unlabeled inputs (textarea and select missing labels)", () => {
    expect(report.morphe.accessibility.all_inputs_labeled).toBe(false);
  });

  it("landmark structure is valid (has <main>)", () => {
    expect(report.morphe.accessibility.landmark_structure).toBe("valid");
  });

  it("detects dead signal (errors: never read)", () => {
    const bundle = parseDocument(settingsForm);
    const df = analyzeDataflow(bundle);
    expect(df.deadSignals).toContain("errors");
  });

  it("does NOT flag formData as dead (read by isDirty derived)", () => {
    const bundle = parseDocument(settingsForm);
    const df = analyzeDataflow(bundle);
    expect(df.deadSignals).not.toContain("formData");
  });

  it("detects state machine (idle → saving → saved/error)", () => {
    const bundle = parseDocument(settingsForm);
    const sm = extractStateMachine(bundle);
    // saveStatus: idle, saving, saved, error
    expect(sm.states).toBeGreaterThanOrEqual(3);
    // All 4 states reachable (conservative: null-source transitions connect all)
    expect(sm.reachable).toBeGreaterThanOrEqual(3);
  });

  it("thesis is SOUND (no cascade conflicts, simple layout)", () => {
    expect(report.thesis.cascade_conflicts).toBe(0);
    expect(report.thesis.verdict).toBe("SOUND");
  });
});

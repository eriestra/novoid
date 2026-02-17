import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseDocument } from "../src/parser.js";
import { analyzeThesis } from "../src/thesis/index.js";
import { detectCascadeConflicts } from "../src/thesis/cascade.js";
import { analyzeBreakpoints } from "../src/thesis/breakpoints.js";
import { analyzeConstraints } from "../src/thesis/constraints.js";

const loginHtml = readFileSync(new URL("./fixtures/login.html", import.meta.url), "utf-8");

describe("Thesis (Presentation)", () => {
  describe("cascade conflict detection", () => {
    it("detects no conflicts when selectors target different elements", () => {
      const bundle = parseDocument(`<style>
        .btn { color: red; }
        .button { color: blue; }
      </style>`);
      const result = detectCascadeConflicts(bundle);
      expect(result.count).toBe(0);
    });

    it("detects conflict when same target has same specificity with different values", () => {
      const bundle = parseDocument(`<style>
        .foo .bar { color: red; }
        .baz .bar { color: blue; }
      </style>`);
      const result = detectCascadeConflicts(bundle);
      expect(result.count).toBe(1);
      expect(result.conflicts[0].element).toBe(".bar");
      expect(result.conflicts[0].property).toBe("color");
      expect(result.conflicts[0].competingSelectors).toHaveLength(2);
    });

    it("returns zero conflicts when no CSS present", () => {
      const bundle = parseDocument(`<html><body>Hello</body></html>`);
      const result = detectCascadeConflicts(bundle);
      expect(result.count).toBe(0);
    });
  });

  describe("breakpoint detection", () => {
    it("extracts developer breakpoints from @media queries", () => {
      const bundle = parseDocument(`<style>
        @media (min-width: 768px) { .foo { display: block; } }
        @media (max-width: 1024px) { .bar { display: none; } }
      </style>`);
      const result = analyzeBreakpoints(bundle, [320, 1920]);
      expect(result.developer).toEqual([768, 1024]);
    });

    it("filters breakpoints to viewport range", () => {
      const bundle = parseDocument(`<style>
        @media (min-width: 768px) { .foo { display: block; } }
        @media (min-width: 2000px) { .bar { display: none; } }
      </style>`);
      const result = analyzeBreakpoints(bundle, [320, 1920]);
      expect(result.developer).toEqual([768]);
    });

    it("returns empty arrays when no CSS", () => {
      const bundle = parseDocument(`<html><body>Hello</body></html>`);
      const result = analyzeBreakpoints(bundle, [320, 1920]);
      expect(result.developer).toEqual([]);
    });

    it("detects natural breakpoint from flex children min-widths", () => {
      const html = `<style>
        .row { display: flex; gap: 16px; }
        .row .col-a { min-width: 200px; flex: 1; }
        .row .col-b { min-width: 300px; flex: 1; }
      </style><body><div class="row"><div class="col-a"></div><div class="col-b"></div></div></body>`;
      const bundle = parseDocument(html);
      const bp = analyzeBreakpoints(bundle, [320, 1920]);
      // 200 + 300 + 16 (1 gap) = 516px natural breakpoint
      expect(bp.natural.length).toBeGreaterThan(0);
      // Should be around 516px
      expect(bp.natural.some(n => n >= 500 && n <= 520)).toBe(true);
    });

    it("reports unmatched natural breakpoints", () => {
      const html = `<style>
        .row { display: flex; }
        .row .a { min-width: 400px; }
        .row .b { min-width: 400px; }
        @media (min-width: 768px) { .row { gap: 2rem; } }
      </style><body><div class="row"><div class="a"></div><div class="b"></div></div></body>`;
      const bundle = parseDocument(html);
      const bp = analyzeBreakpoints(bundle, [320, 1920]);
      // Natural: 800px, Developer: 768px — within 50px so should match
      expect(bp.natural.length).toBeGreaterThan(0);
    });
  });

  describe("verdict logic", () => {
    it("returns PARTIAL when no CSS exists", () => {
      const bundle = parseDocument(`<html><body>Hello</body></html>`);
      const result = analyzeThesis(bundle, [320, 1920]);
      expect(result.verdict).toBe("PARTIAL");
    });

    it("returns SOUND for clean CSS with no conflicts", () => {
      const bundle = parseDocument(loginHtml);
      const result = analyzeThesis(bundle, [320, 1920]);
      expect(result.verdict).toBe("SOUND");
      expect(result.feasible).toBe(true);
      expect(result.cascade_conflicts).toBe(0);
    });

    it("returns UNSOUND when cascade conflicts exist", () => {
      const bundle = parseDocument(`<style>
        .bar { color: red; }
        .bar { color: blue; }
      </style>`);
      const result = analyzeThesis(bundle, [320, 1920]);
      expect(result.verdict).toBe("UNSOUND");
      expect(result.cascade_conflicts).toBe(1);
    });

    it("returns SOUND when cascade conflicts are warning-only (different parents)", () => {
      const bundle = parseDocument(`<style>
        .foo .bar { color: red; }
        .baz .bar { color: blue; }
      </style>`);
      const result = analyzeThesis(bundle, [320, 1920]);
      expect(result.verdict).toBe("SOUND");
      expect(result.cascade_conflicts).toBe(1); // still counted, but warning severity
    });
  });

  describe("flex overflow detection (HTML-aware)", () => {
    it("detects overflow when independent selectors style flex children", () => {
      const bundle = parseDocument(`
        <style>
          .container { display: flex; }
          .sidebar { min-width: 250px; }
          .main-content { min-width: 400px; }
        </style>
        <div class="container">
          <aside class="sidebar">Sidebar</aside>
          <div class="main-content">Main</div>
        </div>
      `);
      const result = analyzeConstraints(bundle, [320, 1920]);
      expect(result.feasible).toBe(false);
      expect(result.overflowRisks).toHaveLength(1);
      expect(result.overflowRisks[0]).toContain("650px");
      expect(result.overflowRisks[0]).toContain("320px");
    });

    it("includes gap in overflow calculation", () => {
      const bundle = parseDocument(`
        <style>
          .row { display: flex; gap: 1rem; }
          .col { min-width: 200px; }
        </style>
        <div class="row">
          <div class="col">A</div>
          <div class="col">B</div>
        </div>
      `);
      // 200 + 200 + 16 (1rem gap) = 416
      const result = analyzeConstraints(bundle, [320, 1920]);
      expect(result.feasible).toBe(false);
      expect(result.overflowRisks[0]).toContain("416px");
    });

    it("skips flex-direction: column containers", () => {
      const bundle = parseDocument(`
        <style>
          .stack { display: flex; flex-direction: column; }
          .item { min-width: 500px; }
        </style>
        <div class="stack">
          <div class="item">A</div>
          <div class="item">B</div>
        </div>
      `);
      const result = analyzeConstraints(bundle, [320, 1920]);
      expect(result.feasible).toBe(true);
      expect(result.overflowRisks).toHaveLength(0);
    });

    it("reports no overflow when sum fits in viewport", () => {
      const bundle = parseDocument(`
        <style>
          .row { display: flex; }
          .a { min-width: 100px; }
          .b { min-width: 150px; }
        </style>
        <div class="row">
          <div class="a">A</div>
          <div class="b">B</div>
        </div>
      `);
      const result = analyzeConstraints(bundle, [320, 1920]);
      expect(result.feasible).toBe(true);
    });

    it("matches children by tag selector", () => {
      const bundle = parseDocument(`
        <style>
          .nav { display: flex; }
          li { min-width: 200px; }
        </style>
        <ul class="nav">
          <li>One</li>
          <li>Two</li>
        </ul>
      `);
      const result = analyzeConstraints(bundle, [320, 1920]);
      expect(result.feasible).toBe(false);
      expect(result.overflowRisks[0]).toContain("400px");
    });

    it("ignores @media rules for base analysis", () => {
      const bundle = parseDocument(`
        <style>
          .flex { display: flex; }
          .child { min-width: 300px; }
          @media (max-width: 768px) {
            .flex { flex-direction: column; }
            .child { min-width: auto; }
          }
        </style>
        <div class="flex">
          <div class="child">A</div>
          <div class="child">B</div>
        </div>
      `);
      // Base rules: 300 + 300 = 600 > 320 → overflow (media override not applied in base)
      const result = analyzeConstraints(bundle, [320, 1920]);
      expect(result.feasible).toBe(false);
    });
  });

  it("reports breakpoint data", () => {
    const bundle = parseDocument(loginHtml);
    const result = analyzeThesis(bundle, [320, 1920]);

    expect(result.breakpoints).toBeInstanceOf(Array);
    expect(result.developer_breakpoints).toBeInstanceOf(Array);
    expect(result.unmatched_breakpoints).toBeInstanceOf(Array);
    expect(result.overflow_risks).toBeInstanceOf(Array);
    expect(result.viewport_range).toEqual([320, 1920]);
  });
});

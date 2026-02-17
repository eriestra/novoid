import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import * as yaml from "js-yaml";
import { parseDocument } from "../src/parser.js";
import { analyzeMorphe } from "../src/morphe/index.js";
import { checkContracts } from "../src/morphe/tree-automaton.js";
import { analyzeSelectorCoverage } from "../src/morphe/selectors.js";
import type { Contract } from "../src/types.js";

const loginHtml = readFileSync(new URL("./fixtures/login.html", import.meta.url), "utf-8");
const loginContract = yaml.load(
  readFileSync(new URL("../contracts/login-form.yaml", import.meta.url), "utf-8")
) as Contract;

describe("Morphe (Structure)", () => {
  it("parses and analyzes a login form with no contracts → PARTIAL", () => {
    const bundle = parseDocument(loginHtml);
    const result = analyzeMorphe(bundle, []);

    expect(result.verdict).toBe("PARTIAL");
    expect(result.node_count).toBeGreaterThan(0);
    expect(result.contracts_checked).toBe(0);
    expect(result.contracts_passed).toBe(0);
  });

  it("counts nodes correctly", () => {
    const bundle = parseDocument("<div><p>Hello</p><p>World</p></div>");
    const result = analyzeMorphe(bundle, []);

    // html, head, body, div, p, p = 6 elements
    expect(result.node_count).toBeGreaterThanOrEqual(3);
  });

  it("reports accessibility structure", () => {
    const bundle = parseDocument(loginHtml);
    const result = analyzeMorphe(bundle, []);

    expect(result.accessibility).toHaveProperty("tab_order_complete");
    expect(result.accessibility).toHaveProperty("all_inputs_labeled");
    expect(result.accessibility).toHaveProperty("landmark_structure");
  });

  it("login.html has all_inputs_labeled = true (inputs have aria-label)", () => {
    const bundle = parseDocument(loginHtml);
    const result = analyzeMorphe(bundle, []);

    expect(result.accessibility.all_inputs_labeled).toBe(true);
  });

  it("login.html has landmark_structure = valid (has <main>)", () => {
    const bundle = parseDocument(loginHtml);
    const result = analyzeMorphe(bundle, []);

    expect(result.accessibility.landmark_structure).toBe("valid");
  });

  it("detects missing landmarks", () => {
    const bundle = parseDocument("<html><body><div>No landmarks</div></body></html>");
    const result = analyzeMorphe(bundle, []);

    expect(result.accessibility.landmark_structure).toBe("missing");
  });

  it("detects unlabeled inputs", () => {
    const bundle = parseDocument('<html><body><main><input type="text"></main></body></html>');
    const result = analyzeMorphe(bundle, []);

    expect(result.accessibility.all_inputs_labeled).toBe(false);
  });

  it("detects tab order gaps", () => {
    const html = '<html><body><main><button tabindex="1">A</button><button tabindex="5">B</button></main></body></html>';
    const bundle = parseDocument(html);
    const result = analyzeMorphe(bundle, []);

    expect(result.accessibility.tab_order_complete).toBe(false);
  });

  describe("contract checking", () => {
    it("login-form contract passes on login.html", () => {
      const bundle = parseDocument(loginHtml);
      const result = checkContracts(bundle.html, [loginContract]);

      expect(result.checked).toBe(3);
      expect(result.passed).toBe(3);
      expect(result.failures).toHaveLength(0);
    });

    it("login.html with contract → SOUND verdict", () => {
      const bundle = parseDocument(loginHtml);
      const result = analyzeMorphe(bundle, [loginContract]);

      expect(result.verdict).toBe("SOUND");
    });

    it("contract fails when submit button is missing", () => {
      const noSubmitHtml = `
        <html><body><main>
          <form>
            <input type="email">
            <input type="password">
          </form>
        </main></body></html>`;
      const bundle = parseDocument(noSubmitHtml);
      const result = checkContracts(bundle.html, [loginContract]);

      expect(result.passed).toBeLessThan(result.checked);
      expect(result.failures.length).toBeGreaterThan(0);
      const submitFailure = result.failures.find((f) => f.selector === "button[type=submit]");
      expect(submitFailure).toBeDefined();
      expect(submitFailure!.actual).toBe(0);
    });

    it("missing submit button → UNSOUND verdict", () => {
      const noSubmitHtml = `
        <html><body><main>
          <form>
            <input type="email">
            <input type="password">
          </form>
        </main></body></html>`;
      const bundle = parseDocument(noSubmitHtml);
      const result = analyzeMorphe(bundle, [loginContract]);

      expect(result.verdict).toBe("UNSOUND");
    });
  });

  describe("selector coverage", () => {
    it("login.html has some elements covered by CSS", () => {
      const bundle = parseDocument(loginHtml);
      const coverage = analyzeSelectorCoverage(bundle);

      expect(coverage.total).toBeGreaterThan(0);
      expect(coverage.covered).toBeGreaterThan(0);
    });

    it("result includes selector_coverage field", () => {
      const bundle = parseDocument(loginHtml);
      const result = analyzeMorphe(bundle, []);

      expect(result.selector_coverage).toBeDefined();
      expect(result.selector_coverage!.total).toBeGreaterThan(0);
      expect(result.selector_coverage!.covered).toBeGreaterThan(0);
    });

    it("reports uncovered elements when no CSS", () => {
      const bundle = parseDocument("<html><body><main><div>Hello</div></main></body></html>");
      const coverage = analyzeSelectorCoverage(bundle);

      expect(coverage.covered).toBe(0);
      expect(coverage.uncovered.length).toBeGreaterThan(0);
    });
  });
});

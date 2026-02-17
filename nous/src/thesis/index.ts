// Pillar II — Thesis (Presentation)
import type { DocumentBundle, ThesisResult } from "../types.js";
import { detectCascadeConflicts } from "./cascade.js";
import { analyzeConstraints } from "./constraints.js";
import { analyzeBreakpoints } from "./breakpoints.js";

export function analyzeThesis(bundle: DocumentBundle, viewport: [number, number]): ThesisResult {
  const cascadeConflicts = detectCascadeConflicts(bundle);
  const constraints = analyzeConstraints(bundle, viewport);
  const breakpoints = analyzeBreakpoints(bundle, viewport);

  // Determine verdict
  let verdict: "SOUND" | "UNSOUND" | "PARTIAL";
  if (!bundle.css) {
    verdict = "PARTIAL";
  } else if (cascadeConflicts.errorCount > 0 || !constraints.feasible) {
    verdict = "UNSOUND";
  } else {
    verdict = "SOUND";
  }

  return {
    verdict,
    viewport_range: viewport,
    feasible: constraints.feasible,
    breakpoints: breakpoints.natural,
    developer_breakpoints: breakpoints.developer,
    unmatched_breakpoints: breakpoints.unmatched,
    cascade_conflicts: cascadeConflicts.count,
    cascade_details: cascadeConflicts.conflicts,
    overflow_risks: constraints.overflowRisks,
  };
}

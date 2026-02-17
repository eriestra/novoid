// Cross-pillar analysis
import type { DocumentBundle, MorpheResult, ThesisResult, KinesisResult, CrossPillarResult, Verdict } from "../types.js";

/** Analyze cross-pillar interactions */
export function analyzeCrossPillar(
  _bundle: DocumentBundle,
  morphe: MorpheResult,
  thesis: ThesisResult,
  kinesis: KinesisResult,
): CrossPillarResult {
  return {
    behavior_x_structure: behaviorXStructure(morphe, kinesis),
    behavior_x_presentation: behaviorXPresentation(thesis, kinesis),
    structure_x_presentation: structureXPresentation(morphe),
  };
}

function structureXPresentation(morphe: MorpheResult): CrossPillarResult["structure_x_presentation"] {
  if (!morphe.selector_coverage) {
    return { verdict: "PARTIAL", unstyled_nodes: [] };
  }
  if (morphe.selector_coverage.uncovered.length > 0) {
    return { verdict: "UNSOUND", unstyled_nodes: morphe.selector_coverage.uncovered };
  }
  return { verdict: "SOUND", unstyled_nodes: [] };
}

function behaviorXStructure(morphe: MorpheResult, kinesis: KinesisResult): Verdict {
  const hasBehavior = kinesis.signals > 0 || kinesis.effects > 0;

  if (kinesis.verdict === "UNSOUND") return "UNSOUND";
  if (!hasBehavior && morphe.verdict === "SOUND") return "SOUND";
  if (hasBehavior && morphe.contracts_checked > 0) return "PARTIAL";
  return "PARTIAL";
}

function behaviorXPresentation(thesis: ThesisResult, kinesis: KinesisResult): Verdict {
  const hasBehavior = kinesis.signals > 0;

  if (kinesis.verdict === "UNSOUND") return "UNSOUND";
  if (!hasBehavior && thesis.verdict === "SOUND") return "SOUND";
  if (hasBehavior && thesis.cascade_conflicts > 0) return "UNSOUND";
  return "PARTIAL";
}

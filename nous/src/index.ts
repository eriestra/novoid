// Nous — Entry point
// analyze(html) → ProofReport
import { parseDocument } from "./parser.js";
import { analyzeMorphe } from "./morphe/index.js";
import { analyzeThesis } from "./thesis/index.js";
import { analyzeKinesis } from "./kinesis/index.js";
import { analyzeCrossPillar } from "./cross/index.js";
import type { ProofReport, Verdict, AnalyzeOptions } from "./types.js";

export { parseDocument } from "./parser.js";
export { analyzeMorphe } from "./morphe/index.js";
export { analyzeThesis } from "./thesis/index.js";
export { analyzeKinesis } from "./kinesis/index.js";
export { analyzeCrossPillar } from "./cross/index.js";
export type * from "./types.js";

function overallVerdict(morphe: Verdict, thesis: Verdict, kinesis: Verdict): Verdict {
  if (morphe === "UNSOUND" || thesis === "UNSOUND" || kinesis === "UNSOUND") return "UNSOUND";
  if (morphe === "PARTIAL" || thesis === "PARTIAL" || kinesis === "PARTIAL") return "PARTIAL";
  return "SOUND";
}

/** Analyze an HTML document and produce a formal ProofReport */
export function analyze(html: string, options: AnalyzeOptions = {}): ProofReport {
  const bundle = parseDocument(html);
  const viewport: [number, number] = options.viewport ?? [320, 1920];

  const morphe = analyzeMorphe(bundle, options.contracts ?? []);
  const thesis = analyzeThesis(bundle, viewport);
  const kinesis = analyzeKinesis(bundle);
  const cross_pillar = analyzeCrossPillar(bundle, morphe, thesis, kinesis);

  return {
    nous: "0.1.0",
    document: "",
    timestamp: new Date().toISOString(),
    verdict: overallVerdict(morphe.verdict, thesis.verdict, kinesis.verdict),
    morphe,
    thesis,
    kinesis,
    cross_pillar,
  };
}

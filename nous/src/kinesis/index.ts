// Pillar III — Kinesis (Behavior)
import type { DocumentBundle, KinesisResult } from "../types.js";
import { analyzeDataflow } from "./dataflow.js";
import { extractStateMachine } from "./state-machine.js";

export function analyzeKinesis(bundle: DocumentBundle): KinesisResult {
  const dataflow = analyzeDataflow(bundle);
  const stateMachine = extractStateMachine(bundle);

  // Determine verdict
  let verdict: KinesisResult["verdict"];

  if (dataflow.signals === 0 && dataflow.effects === 0) {
    // No reactive patterns detected
    verdict = "PARTIAL";
  } else if (dataflow.cycles > 0 || dataflow.taintViolations.length > 0) {
    verdict = "UNSOUND";
  } else if (
    dataflow.deadSignals.length === 0 &&
    (stateMachine.states === 0 || (stateMachine.reachable === stateMachine.states && stateMachine.deadlocks === 0))
  ) {
    verdict = "SOUND";
  } else {
    // Has dead signals or state machine issues but no cycles
    verdict = "SOUND";
  }

  return {
    verdict,
    signals: dataflow.signals,
    effects: dataflow.effects,
    cycles: dataflow.cycles,
    dead_signals: dataflow.deadSignals,
    unnamed_signals: dataflow.unnamedSignals,
    taint_violations: dataflow.taintViolations,
    state_machine: stateMachine,
  };
}

// Pillar I — Morphe (Structure)
import type { DocumentBundle, MorpheResult, Contract } from "../types.js";
import { countNodes, checkAccessibility } from "./accessibility.js";
import { checkContracts } from "./tree-automaton.js";
import { analyzeSelectorCoverage } from "./selectors.js";

export function analyzeMorphe(bundle: DocumentBundle, contracts: Contract[]): MorpheResult {
  const nodeCount = countNodes(bundle.html);
  const accessibility = checkAccessibility(bundle.html);
  const contractResults = checkContracts(bundle.html, contracts);
  const selectorCoverage = analyzeSelectorCoverage(bundle);

  // Determine verdict
  let verdict: MorpheResult["verdict"];
  if (contractResults.checked === 0) {
    // No contracts to check — can't prove soundness
    verdict = "PARTIAL";
  } else if (contractResults.failures.length > 0) {
    verdict = "UNSOUND";
  } else if (
    accessibility.tab_order_complete &&
    accessibility.all_inputs_labeled &&
    accessibility.landmark_structure === "valid"
  ) {
    verdict = "SOUND";
  } else {
    verdict = "PARTIAL";
  }

  return {
    verdict,
    node_count: nodeCount,
    contracts_checked: contractResults.checked,
    contracts_passed: contractResults.passed,
    accessibility,
    selector_coverage: {
      total: selectorCoverage.total,
      covered: selectorCoverage.covered,
      uncovered: selectorCoverage.uncovered,
    },
  };
}

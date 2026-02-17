// Specificity lattice and cascade conflict detection
import * as csstree from "css-tree";
import type { DocumentBundle } from "../types.js";

export interface CascadeConflict {
  element: string;
  property: string;
  competingSelectors: string[];
  severity: "error" | "warning"; // "warning" for different-parent selectors
}

export interface CascadeResult {
  count: number;       // total conflicts
  errorCount: number;  // only same-context conflicts (drive UNSOUND verdict)
  conflicts: CascadeConflict[];
}

type Specificity = [number, number, number, number]; // inline, id, class, element

interface DeclarationRecord {
  selector: string;
  property: string;
  value: string;
  specificity: Specificity;
  target: string; // last simple selector
  mediaContext: string; // @media condition or "" for top-level
}

function computeSpecificity(selector: string): Specificity {
  let ids = 0;
  let classes = 0;
  let elements = 0;

  // Count IDs: #foo
  const idMatches = selector.match(/#[a-zA-Z_-][\w-]*/g);
  if (idMatches) ids = idMatches.length;

  // Count classes: .foo, [attr], :pseudo-class (but not ::pseudo-element)
  const classMatches = selector.match(/\.[a-zA-Z_-][\w-]*/g);
  if (classMatches) classes += classMatches.length;
  const attrMatches = selector.match(/\[[^\]]*\]/g);
  if (attrMatches) classes += attrMatches.length;
  // :pseudo-class but not ::pseudo-element
  const pseudoClassMatches = selector.match(/(?<!:):[a-zA-Z][\w-]*/g);
  if (pseudoClassMatches) classes += pseudoClassMatches.length;

  // Count elements and ::pseudo-elements
  const pseudoElementMatches = selector.match(/::[a-zA-Z][\w-]*/g);
  if (pseudoElementMatches) elements += pseudoElementMatches.length;

  // Element selectors: bare identifiers not preceded by . # : or [
  // Remove IDs, classes, attrs, pseudo-classes, pseudo-elements, combinators first
  let stripped = selector
    .replace(/::[a-zA-Z][\w-]*/g, "")
    .replace(/(?<!:):[a-zA-Z][\w-]*/g, "")
    .replace(/#[a-zA-Z_-][\w-]*/g, "")
    .replace(/\.[a-zA-Z_-][\w-]*/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/[>+~]/g, " ");
  const elementMatches = stripped.match(/\b[a-zA-Z][\w-]*/g);
  if (elementMatches) elements += elementMatches.length;

  return [0, ids, classes, elements];
}

function getLastSimpleSelector(selector: string): string {
  // Split by combinators and whitespace, take the last part
  const parts = selector.trim().split(/\s*[>+~\s]\s*/);
  return parts[parts.length - 1].trim();
}

function specificityEqual(a: Specificity, b: Specificity): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}

/**
 * Determine if two selectors likely target different elements due to
 * having disjoint ancestor contexts (e.g., `.foo img` vs `.bar img`).
 * Returns "warning" for different-parent, "error" for same/overlapping parent.
 */
function conflictSeverity(selA: string, selB: string): "error" | "warning" {
  const partsA = selA.trim().split(/\s*[>+~\s]\s*/);
  const partsB = selB.trim().split(/\s*[>+~\s]\s*/);

  // Single selector (no ancestry) — could be same element
  if (partsA.length <= 1 || partsB.length <= 1) return "error";

  const ancestorsA = partsA.slice(0, -1).join(" ");
  const ancestorsB = partsB.slice(0, -1).join(" ");

  // Same or overlapping ancestors — real conflict
  if (ancestorsA === ancestorsB) return "error";
  if (ancestorsA.startsWith(ancestorsB) || ancestorsB.startsWith(ancestorsA)) return "error";

  // Disjoint ancestors — likely different elements
  return "warning";
}

/** Detect cascade conflicts: multiple rules at same specificity for same element+property */
export function detectCascadeConflicts(bundle: DocumentBundle): CascadeResult {
  if (!bundle.css) {
    return { count: 0, conflicts: [] };
  }

  const records: DeclarationRecord[] = [];

  // Track @keyframes and @media context during walk
  const atRuleStack: Array<{ type: string; name?: string; prelude?: string }> = [];

  csstree.walk(bundle.css, {
    enter(node) {
      if (node.type === "Atrule") {
        const name = node.name.toLowerCase();
        atRuleStack.push({
          type: name,
          prelude: node.prelude ? csstree.generate(node.prelude) : undefined,
        });
      }

      if (node.type !== "Rule") return;

      // Skip rules inside @keyframes — keyframe stops aren't cascade selectors
      if (atRuleStack.some((r) => r.type === "keyframes" || r.type === "-webkit-keyframes")) {
        return;
      }

      if (!node.prelude || !node.block) return;
      const selectorStr = csstree.generate(node.prelude);
      const selectors = selectorStr.split(",").map((s) => s.trim());

      // Determine media context
      const mediaRule = atRuleStack.find((r) => r.type === "media");
      const mediaContext = mediaRule?.prelude || "";

      const declarations: Array<{ property: string; value: string }> = [];
      csstree.walk(node.block, {
        visit: "Declaration",
        enter(decl) {
          declarations.push({
            property: decl.property,
            value: csstree.generate(decl.value),
          });
        },
      });

      for (const sel of selectors) {
        const specificity = computeSpecificity(sel);
        const target = getLastSimpleSelector(sel);
        for (const decl of declarations) {
          records.push({
            selector: sel,
            property: decl.property,
            value: decl.value,
            specificity,
            target,
            mediaContext,
          });
        }
      }
    },
    leave(node) {
      if (node.type === "Atrule") {
        atRuleStack.pop();
      }
    },
  });

  // Group by (target, property, mediaContext)
  const groups = new Map<string, DeclarationRecord[]>();
  for (const rec of records) {
    const key = `${rec.target}|||${rec.property}|||${rec.mediaContext}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(rec);
  }

  const conflicts: CascadeConflict[] = [];

  for (const [, recs] of groups) {
    if (recs.length < 2) continue;
    // Find pairs with same specificity but different values
    for (let i = 0; i < recs.length; i++) {
      for (let j = i + 1; j < recs.length; j++) {
        if (
          specificityEqual(recs[i].specificity, recs[j].specificity) &&
          recs[i].value !== recs[j].value
        ) {
          const severity = conflictSeverity(recs[i].selector, recs[j].selector);
          // Check if this conflict already recorded
          const existing = conflicts.find(
            (c) =>
              c.element === recs[i].target && c.property === recs[i].property
          );
          if (existing) {
            if (!existing.competingSelectors.includes(recs[j].selector)) {
              existing.competingSelectors.push(recs[j].selector);
            }
            // Escalate to error if any pair is an error
            if (severity === "error") existing.severity = "error";
          } else {
            conflicts.push({
              element: recs[i].target,
              property: recs[i].property,
              competingSelectors: [recs[i].selector, recs[j].selector],
              severity,
            });
          }
        }
      }
    }
  }

  const errorCount = conflicts.filter((c) => c.severity === "error").length;
  return { count: conflicts.length, errorCount, conflicts };
}

// Viewport parametric analysis — breakpoint detection
import * as csstree from "css-tree";
import type { DocumentBundle } from "../types.js";

export interface BreakpointResult {
  natural: number[];
  developer: number[];
  unmatched: number[];
}

interface FlexContainerInfo {
  selector: string;
  gap: number;
}

interface ChildConstraint {
  selector: string;
  minWidth: number;
  maxWidth: number;
}

/** Parse a CSS length value to px (handles px, rem, em). Returns NaN if unparseable. */
function parsePx(value: string): number {
  const match = value.match(/^(\d+(?:\.\d+)?)\s*(px|rem|em)$/);
  if (!match) return NaN;
  const num = parseFloat(match[1]);
  const unit = match[2];
  if (unit === "px") return num;
  if (unit === "rem" || unit === "em") return num * 16;
  return NaN;
}

/** Extract the last simple selector segment (e.g. ".row .col" → ".col") */
function lastSegment(selector: string): string {
  const parts = selector.trim().split(/\s+/);
  return parts[parts.length - 1];
}

/** Check if childSel could be a child of parentSel using heuristic:
 *  child selector starts with parent selector, or uses > combinator */
function isLikelyChild(parentSel: string, childSel: string): boolean {
  const pt = parentSel.trim();
  const ct = childSel.trim();
  // Direct patterns: ".row .col", ".row > .col", ".row .col-a"
  if (ct.startsWith(pt + " ") || ct.startsWith(pt + ">") || ct.startsWith(pt + " >")) {
    return true;
  }
  return false;
}

/** Detect natural breakpoints vs developer-declared @media breakpoints */
export function analyzeBreakpoints(bundle: DocumentBundle, viewport: [number, number]): BreakpointResult {
  if (!bundle.css) {
    return { natural: [], developer: [], unmatched: [] };
  }

  // --- 1. Extract developer breakpoints from @media queries ---
  const breakpointSet = new Set<number>();

  csstree.walk(bundle.css, {
    visit: "Atrule",
    enter(node) {
      if (node.name === "media" && node.prelude) {
        const mediaQuery = csstree.generate(node.prelude);
        const widthPattern = /(?:min-width|max-width|width)\s*[:>=<]+\s*(\d+(?:\.\d+)?)\s*px/gi;
        let match;
        while ((match = widthPattern.exec(mediaQuery)) !== null) {
          breakpointSet.add(parseFloat(match[1]));
        }
      }
    },
  });

  const [minVp, maxVp] = viewport;
  const developer = Array.from(breakpointSet)
    .filter((bp) => bp >= minVp && bp <= maxVp)
    .sort((a, b) => a - b);

  // --- 2. Find flex containers and their gap values ---
  const flexContainers: FlexContainerInfo[] = [];
  // Map selector → { prop → value } for all rules
  const ruleMap = new Map<string, Map<string, string>>();

  csstree.walk(bundle.css, {
    visit: "Rule",
    enter(node) {
      if (node.prelude && node.block) {
        const selector = csstree.generate(node.prelude).trim();
        if (!ruleMap.has(selector)) {
          ruleMap.set(selector, new Map());
        }
        const props = ruleMap.get(selector)!;

        csstree.walk(node.block, {
          visit: "Declaration",
          enter(decl) {
            const value = csstree.generate(decl.value).trim();
            props.set(decl.property, value);
          },
        });
      }
    },
  });

  // Identify flex containers
  for (const [selector, props] of ruleMap) {
    const display = props.get("display");
    if (display === "flex" || display === "inline-flex") {
      const direction = props.get("flex-direction") || "row";
      // Only handle row (horizontal) layouts for now
      if (direction === "column" || direction === "column-reverse") continue;

      let gap = 0;
      const gapVal = props.get("gap") || props.get("column-gap");
      if (gapVal) {
        const parsed = parsePx(gapVal);
        if (!isNaN(parsed)) gap = parsed;
      }

      flexContainers.push({ selector, gap });
    }
  }

  // --- 3. For each flex container, find children and compute natural breakpoints ---
  const naturalSet = new Set<number>();

  for (const container of flexContainers) {
    const children: ChildConstraint[] = [];

    for (const [selector, props] of ruleMap) {
      if (selector === container.selector) continue;
      if (!isLikelyChild(container.selector, selector)) continue;

      const minW = props.get("min-width");
      const maxW = props.get("max-width");
      const minPx = minW ? parsePx(minW) : NaN;
      const maxPx = maxW ? parsePx(maxW) : NaN;

      if (!isNaN(minPx) || !isNaN(maxPx)) {
        children.push({
          selector,
          minWidth: isNaN(minPx) ? 0 : minPx,
          maxWidth: isNaN(maxPx) ? Infinity : maxPx,
        });
      }
    }

    if (children.length === 0) continue;

    const gapTotal = (children.length - 1) * container.gap;

    // Natural breakpoint from min-widths: sum of all min-widths + gaps
    const sumMin = children.reduce((s, c) => s + c.minWidth, 0);
    if (sumMin > 0) {
      naturalSet.add(Math.round(sumMin + gapTotal));
    }

    // Natural breakpoint from max-widths: sum of all max-widths + gaps
    const sumMax = children.reduce((s, c) => s + c.maxWidth, 0);
    if (isFinite(sumMax) && sumMax > 0) {
      naturalSet.add(Math.round(sumMax + gapTotal));
    }
  }

  const natural = Array.from(naturalSet)
    .filter((bp) => bp >= minVp && bp <= maxVp)
    .sort((a, b) => a - b);

  // --- 4. Find unmatched natural breakpoints (no developer bp within ±50px) ---
  const TOLERANCE = 50;
  const unmatched = natural.filter(
    (nbp) => !developer.some((dbp) => Math.abs(nbp - dbp) <= TOLERANCE)
  );

  return { natural, developer, unmatched };
}

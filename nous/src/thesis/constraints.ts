// Flex/Grid → LP constraint system
import * as csstree from "css-tree";
import type { DefaultTreeAdapterMap } from "parse5";
import type { DocumentBundle } from "../types.js";

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];

export interface ConstraintResult {
  feasible: boolean;
  overflowRisks: string[];
}

interface RuleInfo {
  selector: string;
  declarations: Map<string, string>;
  inMedia: boolean; // true if inside @media
}

interface ParsedSimpleSelector {
  tag?: string;
  classes: string[];
  id?: string;
}

function isElement(node: Node): node is Element {
  return "tagName" in node;
}

function getAttr(el: Element, name: string): string | undefined {
  return el.attrs.find((a) => a.name === name)?.value;
}

function getClasses(el: Element): Set<string> {
  const cls = getAttr(el, "class") ?? "";
  return new Set(cls.split(/\s+/).filter(Boolean));
}

/** Parse a simple selector segment into tag/classes/id */
function parseSimpleSelector(seg: string): ParsedSimpleSelector | null {
  const cleaned = seg.replace(/[>+~]/g, "").trim();
  if (!cleaned) return null;
  const parsed: ParsedSimpleSelector = { classes: [] };

  const idMatch = cleaned.match(/#([a-zA-Z_-][a-zA-Z0-9_-]*)/);
  if (idMatch) parsed.id = idMatch[1];

  const classMatches = cleaned.matchAll(/\.([a-zA-Z_-][a-zA-Z0-9_-]*)/g);
  for (const m of classMatches) parsed.classes.push(m[1]);

  const tagMatch = cleaned.match(/^([a-zA-Z][a-zA-Z0-9-]*)/);
  if (tagMatch) parsed.tag = tagMatch[1].toLowerCase();

  if (parsed.tag || parsed.classes.length > 0 || parsed.id) return parsed;
  return null;
}

/** Check if an element matches a simple selector */
function elementMatchesSimple(el: Element, sel: ParsedSimpleSelector): boolean {
  if (sel.tag && el.tagName !== sel.tag) return false;
  if (sel.id && getAttr(el, "id") !== sel.id) return false;
  if (sel.classes.length > 0) {
    const elClasses = getClasses(el);
    for (const c of sel.classes) {
      if (!elClasses.has(c)) return false;
    }
  }
  return true;
}

/** Check if an element matches a full CSS selector string (simplified: matches last segment) */
function elementMatchesSelector(el: Element, selectorStr: string): boolean {
  // Handle comma-separated selectors
  const parts = selectorStr.split(",");
  for (const part of parts) {
    const segments = part.trim().split(/\s+(?![^[]*\])/);
    const last = segments[segments.length - 1];
    const parsed = parseSimpleSelector(last);
    if (parsed && elementMatchesSimple(el, parsed)) return true;
  }
  return false;
}

/** Get all declarations that apply to an element from non-media rules */
function getDeclarationsForElement(el: Element, rules: RuleInfo[]): Map<string, string> {
  const result = new Map<string, string>();
  for (const rule of rules) {
    if (rule.inMedia) continue; // base rules only
    if (elementMatchesSelector(el, rule.selector)) {
      for (const [prop, val] of rule.declarations) {
        result.set(prop, val);
      }
    }
  }
  return result;
}

function parsePxValue(val: string): number {
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}

/** Parse gap value (e.g. "1rem" → 16, "16px" → 16, "1rem" ≈ 16) */
function parseGap(val: string): number {
  if (val.endsWith("px")) return parsePxValue(val);
  if (val.endsWith("rem")) return parsePxValue(val) * 16;
  if (val.endsWith("em")) return parsePxValue(val) * 16;
  return parsePxValue(val);
}

/** Collect all rules from the CSS AST, noting whether they're inside @media */
function collectRules(css: csstree.CssNode): RuleInfo[] {
  const rules: RuleInfo[] = [];

  csstree.walk(css, {
    visit: "Rule",
    enter(node) {
      if (!node.prelude || !node.block) return;
      const selector = csstree.generate(node.prelude);
      const declarations = new Map<string, string>();

      csstree.walk(node.block, {
        visit: "Declaration",
        enter(decl) {
          declarations.set(decl.property, csstree.generate(decl.value));
        },
      });

      // Check if this rule is inside an Atrule (like @media)
      // We detect this by checking the parent chain — css-tree doesn't give us parent,
      // so we use a separate walk
      rules.push({ selector, declarations, inMedia: false });
    },
  });

  // Mark rules inside @media
  csstree.walk(css, {
    visit: "Atrule",
    enter(atrule) {
      if (atrule.name !== "media" || !atrule.block) return;
      csstree.walk(atrule.block, {
        visit: "Rule",
        enter(node) {
          if (!node.prelude) return;
          const selector = csstree.generate(node.prelude);
          // Find and mark matching rules
          for (const r of rules) {
            if (r.selector === selector && !r.inMedia) {
              // Check if declarations match (same rule object)
              // Simple approach: mark rules whose selector appears inside @media
              r.inMedia = true;
              break;
            }
          }
        },
      });
    },
  });

  // Actually, the above approach is flawed — a selector can appear both inside and outside @media.
  // Let's redo: collect separately.
  rules.length = 0;

  // Collect top-level rules (not inside @media)
  if (css.type === "StyleSheet") {
    for (const child of (css as csstree.StyleSheet).children) {
      if (child.type === "Rule" && child.prelude && child.block) {
        const selector = csstree.generate(child.prelude);
        const declarations = new Map<string, string>();
        csstree.walk(child.block, {
          visit: "Declaration",
          enter(decl) {
            declarations.set(decl.property, csstree.generate(decl.value));
          },
        });
        rules.push({ selector, declarations, inMedia: false });
      } else if (child.type === "Atrule" && child.name === "media" && child.block) {
        for (const mediaChild of child.block.children) {
          if (mediaChild.type === "Rule" && mediaChild.prelude && mediaChild.block) {
            const selector = csstree.generate(mediaChild.prelude);
            const declarations = new Map<string, string>();
            csstree.walk(mediaChild.block, {
              visit: "Declaration",
              enter(decl) {
                declarations.set(decl.property, csstree.generate(decl.value));
              },
            });
            rules.push({ selector, declarations, inMedia: true });
          }
        }
      }
    }
  }

  return rules;
}

/** Walk the HTML tree and collect all elements */
function walkElements(node: Node | DefaultTreeAdapterMap["document"]): Element[] {
  const elements: Element[] = [];
  if (isElement(node)) elements.push(node);
  if ("childNodes" in node) {
    for (const child of node.childNodes) {
      elements.push(...walkElements(child));
    }
  }
  return elements;
}

/** Get direct child elements of an element */
function directChildElements(el: Element): Element[] {
  return el.childNodes.filter(isElement);
}

/** Describe an element for error messages */
function describeElement(el: Element): string {
  const cls = getAttr(el, "class");
  const id = getAttr(el, "id");
  let desc = el.tagName;
  if (id) desc += `#${id}`;
  if (cls) desc += `.${cls.split(/\s+/)[0]}`;
  return desc;
}

/** Compile CSS layout to constraint system and check feasibility */
export function analyzeConstraints(bundle: DocumentBundle, viewport: [number, number]): ConstraintResult {
  if (!bundle.css) {
    return { feasible: true, overflowRisks: [] };
  }

  const rules = collectRules(bundle.css);
  const baseRules = rules.filter((r) => !r.inMedia);
  const overflowRisks: string[] = [];
  const [minViewport] = viewport;

  // Strategy 1: HTML-aware analysis (when HTML tree is available)
  const allElements = walkElements(bundle.html);

  if (allElements.length > 0) {
    // Find elements that have display: flex applied
    for (const el of allElements) {
      const decls = getDeclarationsForElement(el, rules);
      const display = decls.get("display");
      if (display !== "flex" && display !== "inline-flex") continue;

      // Check flex-direction — only horizontal matters
      const direction = decls.get("flex-direction");
      if (direction === "column" || direction === "column-reverse") continue;

      const children = directChildElements(el);
      if (children.length === 0) continue;

      const childMinWidths: number[] = [];
      for (const child of children) {
        const childDecls = getDeclarationsForElement(child, rules);
        const minWidth = childDecls.get("min-width");
        if (minWidth && minWidth !== "auto" && minWidth !== "0") {
          const px = parsePxValue(minWidth);
          if (px > 0) childMinWidths.push(px);
        }
      }

      if (childMinWidths.length > 0) {
        // Add gap
        const gap = decls.get("gap") || decls.get("column-gap");
        let gapTotal = 0;
        if (gap && children.length > 1) {
          gapTotal = parseGap(gap) * (children.length - 1);
        }

        const total = childMinWidths.reduce((a, b) => a + b, 0) + gapTotal;
        if (total > minViewport) {
          const containerDesc = describeElement(el);
          overflowRisks.push(
            `"${containerDesc}" children min-width sum (${total}px) exceeds viewport minimum (${minViewport}px)`
          );
        }
      }
    }
  }

  // Strategy 2: CSS-only fallback (original heuristic for cases without HTML context)
  // Only run if HTML-aware analysis found nothing (to avoid duplicates)
  if (overflowRisks.length === 0) {
    const flexContainers = baseRules.filter((r) => {
      const display = r.declarations.get("display");
      return display === "flex" || display === "inline-flex";
    });

    for (const container of flexContainers) {
      const childMinWidths: number[] = [];

      for (const rule of baseRules) {
        if (rule.selector === container.selector) continue;
        if (!rule.selector.startsWith(container.selector)) continue;

        const minWidth = rule.declarations.get("min-width");
        if (minWidth) {
          const px = parseFloat(minWidth);
          if (!isNaN(px)) childMinWidths.push(px);
        }
      }

      if (childMinWidths.length > 0) {
        const direction = container.declarations.get("flex-direction");
        if (!direction || direction === "row" || direction === "row-reverse") {
          const total = childMinWidths.reduce((a, b) => a + b, 0);
          if (total > minViewport) {
            overflowRisks.push(
              `"${container.selector}" children min-width sum (${total}px) exceeds viewport minimum (${minViewport}px)`
            );
          }
        }
      }
    }
  }

  return {
    feasible: overflowRisks.length === 0,
    overflowRisks,
  };
}

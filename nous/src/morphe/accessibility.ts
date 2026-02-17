// Accessibility analysis: tab order, ARIA, landmarks, label coverage
import type { DefaultTreeAdapterMap } from "parse5";
import type { AccessibilityResult } from "../types.js";

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];
type Document = DefaultTreeAdapterMap["document"];

function isElement(node: Node): node is Element {
  return "tagName" in node;
}

function getAttr(el: Element, name: string): string | undefined {
  const attr = el.attrs.find((a) => a.name === name);
  return attr?.value;
}

function walkElements(node: Node | Document, cb: (el: Element) => void): void {
  if (isElement(node)) cb(node);
  if ("childNodes" in node) {
    for (const child of node.childNodes) walkElements(child, cb);
  }
}

function hasAncestor(node: Node, doc: Document, test: (el: Element) => boolean): boolean {
  // Walk tree to find parent of node — simple approach: collect parent map
  const parentMap = new Map<Node, Node>();
  function buildMap(parent: Node | Document) {
    if ("childNodes" in parent) {
      for (const child of parent.childNodes) {
        parentMap.set(child, parent as Node);
        buildMap(child);
      }
    }
  }
  buildMap(doc);

  let current: Node | undefined = parentMap.get(node);
  while (current) {
    if (isElement(current) && test(current)) return true;
    current = parentMap.get(current);
  }
  return false;
}

/** Count all element nodes in the tree */
export function countNodes(doc: Document): number {
  let count = 0;
  function walk(node: Node) {
    if (isElement(node)) count++;
    if ("childNodes" in node) {
      for (const child of node.childNodes) walk(child);
    }
  }
  walk(doc);
  return count;
}

/** Check accessibility properties of the document */
export function checkAccessibility(doc: Document): AccessibilityResult {
  const allElements: Element[] = [];
  walkElements(doc, (el) => allElements.push(el));

  // --- tab_order_complete ---
  const INTERACTIVE_TAGS = new Set(["input", "button", "select", "textarea", "a"]);
  const interactiveEls: Element[] = [];
  for (const el of allElements) {
    if (INTERACTIVE_TAGS.has(el.tagName)) {
      if (el.tagName === "a" && !getAttr(el, "href")) continue;
      interactiveEls.push(el);
    } else if (getAttr(el, "tabindex") !== undefined) {
      interactiveEls.push(el);
    }
  }

  let tab_order_complete = true;
  const tabindexValues: number[] = [];
  for (const el of interactiveEls) {
    const ti = getAttr(el, "tabindex");
    if (ti !== undefined) {
      const n = parseInt(ti, 10);
      if (!isNaN(n) && n > 0) tabindexValues.push(n);
    }
  }
  if (tabindexValues.length > 0) {
    tabindexValues.sort((a, b) => a - b);
    // Check for gaps: each value should be <= previous + 1 (starting from 1)
    for (let i = 0; i < tabindexValues.length; i++) {
      const expected = i === 0 ? tabindexValues[0] : tabindexValues[i - 1] + 1;
      if (tabindexValues[i] > expected) {
        tab_order_complete = false;
        break;
      }
    }
  }

  // --- all_inputs_labeled ---
  const INPUT_TAGS = new Set(["input", "select", "textarea"]);
  const labelForIds = new Set<string>();
  for (const el of allElements) {
    if (el.tagName === "label") {
      const forAttr = getAttr(el, "for");
      if (forAttr) labelForIds.add(forAttr);
    }
  }

  let all_inputs_labeled = true;
  for (const el of allElements) {
    if (!INPUT_TAGS.has(el.tagName)) continue;
    if (getAttr(el, "type") === "hidden") continue;

    const hasAriaLabel = !!getAttr(el, "aria-label");
    const hasAriaLabelledBy = !!getAttr(el, "aria-labelledby");
    const id = getAttr(el, "id");
    const hasLabelFor = !!id && labelForIds.has(id);
    const hasParentLabel = hasAncestor(el, doc, (p) => p.tagName === "label");

    if (!hasAriaLabel && !hasAriaLabelledBy && !hasLabelFor && !hasParentLabel) {
      all_inputs_labeled = false;
      break;
    }
  }

  // --- landmark_structure ---
  const LANDMARK_TAGS = new Set(["main", "nav", "header", "footer"]);
  const LANDMARK_ROLES = new Set(["main", "navigation", "banner", "contentinfo"]);
  const landmarkCounts: Record<string, number> = {};

  for (const el of allElements) {
    let landmark: string | null = null;
    if (LANDMARK_TAGS.has(el.tagName)) {
      landmark = el.tagName;
    }
    const role = getAttr(el, "role");
    if (role && LANDMARK_ROLES.has(role)) {
      const roleToTag: Record<string, string> = {
        main: "main",
        navigation: "nav",
        banner: "header",
        contentinfo: "footer",
      };
      landmark = roleToTag[role] ?? role;
    }
    if (landmark) {
      landmarkCounts[landmark] = (landmarkCounts[landmark] ?? 0) + 1;
    }
  }

  let landmark_structure: AccessibilityResult["landmark_structure"];
  const totalLandmarks = Object.keys(landmarkCounts).length;
  if (totalLandmarks === 0) {
    landmark_structure = "missing";
  } else if ((landmarkCounts["main"] ?? 0) > 1) {
    // Check if multiple mains have distinct aria-labels
    const mainEls = allElements.filter(
      (el) => el.tagName === "main" || getAttr(el, "role") === "main"
    );
    const labels = mainEls.map((el) => getAttr(el, "aria-label")).filter(Boolean);
    const uniqueLabels = new Set(labels);
    if (uniqueLabels.size < mainEls.length) {
      landmark_structure = "invalid";
    } else {
      landmark_structure = "valid";
    }
  } else if (landmarkCounts["main"]) {
    landmark_structure = "valid";
  } else {
    // Has landmarks but no main
    landmark_structure = "missing";
  }

  return { tab_order_complete, all_inputs_labeled, landmark_structure };
}

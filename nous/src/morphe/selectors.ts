// CSS selector coverage analysis
// Determines which tree nodes are matched by at least one CSS rule

import * as csstree from "css-tree";
import type { DefaultTreeAdapterMap } from "parse5";
import type { DocumentBundle } from "../types.js";

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];

function isElement(node: Node): node is Element {
  return "tagName" in node;
}

function getAttr(el: Element, name: string): string | undefined {
  return el.attrs.find((a) => a.name === name)?.value;
}

// Tags to skip in coverage analysis (non-content/non-interactive)
const SKIP_TAGS = new Set([
  "html", "head", "meta", "link", "title", "style", "script", "base", "br", "hr",
]);

interface ParsedSimpleSelector {
  tag?: string;
  classes: string[];
  id?: string;
}

function parseSimpleSelectors(selectorStr: string): ParsedSimpleSelector[] {
  // Split compound selectors and extract simple parts
  // Handle comma-separated selector lists
  const results: ParsedSimpleSelector[] = [];
  const parts = selectorStr.split(",");
  for (const part of parts) {
    // Take the last simple selector in each combinator chain
    const segments = part.trim().split(/\s+(?![^[]*\])/);
    for (const seg of segments) {
      const cleaned = seg.replace(/[>+~]/g, "").trim();
      if (!cleaned) continue;
      const parsed: ParsedSimpleSelector = { classes: [] };

      // Extract ID
      const idMatch = cleaned.match(/#([a-zA-Z_-][a-zA-Z0-9_-]*)/);
      if (idMatch) parsed.id = idMatch[1];

      // Extract classes
      const classMatches = cleaned.matchAll(/\.([a-zA-Z_-][a-zA-Z0-9_-]*)/g);
      for (const m of classMatches) parsed.classes.push(m[1]);

      // Extract tag (leading identifier before any . or #)
      const tagMatch = cleaned.match(/^([a-zA-Z][a-zA-Z0-9-]*)/);
      if (tagMatch) parsed.tag = tagMatch[1].toLowerCase();

      if (parsed.tag || parsed.classes.length > 0 || parsed.id) {
        results.push(parsed);
      }
    }
  }
  return results;
}

function elementMatchesSimple(el: Element, sel: ParsedSimpleSelector): boolean {
  if (sel.tag && el.tagName !== sel.tag) return false;
  if (sel.id) {
    const elId = getAttr(el, "id");
    if (elId !== sel.id) return false;
  }
  if (sel.classes.length > 0) {
    const elClass = getAttr(el, "class") ?? "";
    const elClasses = new Set(elClass.split(/\s+/));
    for (const c of sel.classes) {
      if (!elClasses.has(c)) return false;
    }
  }
  return true;
}

/** Analyze CSS selector coverage over the HTML tree */
export function analyzeSelectorCoverage(bundle: DocumentBundle): {
  total: number;
  covered: number;
  uncovered: string[];
} {
  // Collect all content elements from HTML
  const contentElements: Element[] = [];
  function walkHtml(node: Node | DefaultTreeAdapterMap["document"]) {
    if (isElement(node) && !SKIP_TAGS.has(node.tagName)) {
      contentElements.push(node);
    }
    if ("childNodes" in node) {
      for (const child of node.childNodes) walkHtml(child);
    }
  }
  walkHtml(bundle.html);

  if (!bundle.css) {
    // No CSS — everything uncovered
    const uncovered = contentElements.map((el) => {
      const cls = getAttr(el, "class");
      const id = getAttr(el, "id");
      let desc = el.tagName;
      if (id) desc += `#${id}`;
      if (cls) desc += `.${cls.split(/\s+/)[0]}`;
      return desc;
    });
    return { total: contentElements.length, covered: 0, uncovered };
  }

  // Extract all selectors from CSS
  const allParsedSelectors: ParsedSimpleSelector[] = [];
  csstree.walk(bundle.css, {
    visit: "Rule",
    enter(node) {
      if (node.prelude.type === "SelectorList") {
        const selectorStr = csstree.generate(node.prelude);
        const parsed = parseSimpleSelectors(selectorStr);
        allParsedSelectors.push(...parsed);
      }
    },
  });

  // Check each content element
  const coveredSet = new Set<Element>();
  for (const el of contentElements) {
    for (const sel of allParsedSelectors) {
      if (elementMatchesSimple(el, sel)) {
        coveredSet.add(el);
        break;
      }
    }
  }

  const uncovered: string[] = [];
  for (const el of contentElements) {
    if (!coveredSet.has(el)) {
      const cls = getAttr(el, "class");
      const id = getAttr(el, "id");
      let desc = el.tagName;
      if (id) desc += `#${id}`;
      if (cls) desc += `.${cls.split(/\s+/)[0]}`;
      uncovered.push(desc);
    }
  }

  return {
    total: contentElements.length,
    covered: coveredSet.size,
    uncovered,
  };
}

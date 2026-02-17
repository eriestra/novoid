// Tree automaton: contract YAML → automaton, membership check
import type { DefaultTreeAdapterMap } from "parse5";
type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];
type Document = DefaultTreeAdapterMap["document"];
import type { Contract, ContractSelector } from "../types.js";

export interface ContractFailure {
  contract: string;
  parent: string;
  selector: string;
  expected: { min?: number; max?: number };
  actual: number;
}

export interface ContractCheckResult {
  checked: number;
  passed: number;
  failures: ContractFailure[];
}

function isElement(node: Node): node is Element {
  return "tagName" in node;
}

function getAttr(el: Element, name: string): string | undefined {
  return el.attrs.find((a) => a.name === name)?.value;
}

/** Parse a simple CSS selector like "input[type=email]" or "[attr]" or "button" */
function parseSelector(sel: string): { tag?: string; attrs: Array<{ name: string; value?: string }> } {
  const result: { tag?: string; attrs: Array<{ name: string; value?: string }> } = { attrs: [] };
  const match = sel.match(/^([a-zA-Z][a-zA-Z0-9-]*)?(.*)$/);
  if (!match) return result;

  if (match[1]) result.tag = match[1].toLowerCase();

  const attrRegex = /\[([a-zA-Z_-]+)(?:=([^\]]+))?\]/g;
  let m: RegExpExecArray | null;
  while ((m = attrRegex.exec(match[2])) !== null) {
    result.attrs.push({ name: m[1], value: m[2] });
  }
  return result;
}

function matchesSelector(el: Element, sel: string): boolean {
  const parsed = parseSelector(sel);
  if (parsed.tag && el.tagName !== parsed.tag) return false;
  for (const attr of parsed.attrs) {
    const val = getAttr(el, attr.name);
    if (val === undefined) return false;
    if (attr.value !== undefined && val !== attr.value) return false;
  }
  return true;
}

function findAll(node: Node | Document, sel: string): Element[] {
  const results: Element[] = [];
  function walk(n: Node | Document) {
    if (isElement(n) && matchesSelector(n, sel)) results.push(n);
    if ("childNodes" in n) {
      for (const child of n.childNodes) walk(child);
    }
  }
  walk(node);
  return results;
}

function countDescendants(parent: Element, sel: string): number {
  let count = 0;
  function walk(n: Node) {
    if (isElement(n) && n !== parent && matchesSelector(n, sel)) count++;
    if ("childNodes" in n) {
      for (const child of n.childNodes) walk(child);
    }
  }
  walk(parent);
  return count;
}

/** Check HTML tree against structural contracts */
export function checkContracts(doc: Document, contracts: Contract[]): ContractCheckResult {
  let checked = 0;
  let passed = 0;
  const failures: ContractFailure[] = [];

  for (const contract of contracts) {
    for (const [parentSel, structure] of Object.entries(contract.structure)) {
      const parents = findAll(doc, parentSel);
      if (!structure.contains) continue;

      for (const [childSel, bounds] of Object.entries(structure.contains)) {
        checked++;
        let allParentsPass = true;

        if (parents.length === 0) {
          // No parent found — fail
          allParentsPass = false;
          failures.push({
            contract: contract.name,
            parent: parentSel,
            selector: childSel,
            expected: bounds as ContractSelector,
            actual: 0,
          });
        } else {
          for (const parent of parents) {
            const count = countDescendants(parent, childSel);
            const min = (bounds as ContractSelector).min;
            const max = (bounds as ContractSelector).max;
            if ((min !== undefined && count < min) || (max !== undefined && count > max)) {
              allParentsPass = false;
              failures.push({
                contract: contract.name,
                parent: parentSel,
                selector: childSel,
                expected: bounds as ContractSelector,
                actual: count,
              });
            }
          }
        }

        if (allParentsPass) passed++;
      }
    }
  }

  return { checked, passed, failures };
}

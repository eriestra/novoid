// Signal/effect DAG: cycle detection, liveness, taint analysis
import type { DocumentBundle } from "../types.js";
import type { Node } from "acorn";
import { detectPatterns } from "./patterns.js";

export interface DataflowResult {
  signals: number;
  effects: number;
  cycles: number;
  deadSignals: string[];
  unnamedSignals: number;
  taintViolations: string[];
}

type AstNode = Node & Record<string, unknown>;
type AstIdentifier = AstNode & { name: string };

// Walk AST collecting all identifier names that appear in CallExpression position
function collectAllCalledNames(node: unknown): Set<string> {
  const names = new Set<string>();
  walkNode(node, (n: AstNode) => {
    if (n.type === "CallExpression") {
      const callee = n.callee as AstNode;
      if (callee.type === "Identifier") {
        names.add((callee as AstIdentifier).name);
      }
    }
  });
  return names;
}

function walkNode(node: unknown, visitor: (n: AstNode) => void): void {
  if (!node || typeof node !== "object") return;
  const n = node as AstNode;
  if (typeof n.type === "string") visitor(n);
  for (const key of Object.keys(n)) {
    const val = (n as Record<string, unknown>)[key];
    if (Array.isArray(val)) {
      for (const item of val) walkNode(item, visitor);
    } else if (val && typeof val === "object" && typeof (val as AstNode).type === "string") {
      walkNode(val, visitor);
    }
  }
}

/** Build signal->effect DAG from JS AST and analyze */
export function analyzeDataflow(bundle: DocumentBundle): DataflowResult {
  if (!bundle.js) {
    return { signals: 0, effects: 0, cycles: 0, deadSignals: [], unnamedSignals: 0, taintViolations: [] };
  }

  const patterns = detectPatterns(bundle.js);

  // Build adjacency: signal getter -> list of effect/derived indices that depend on it
  // Nodes: signals (by getter name) + derived (by name) + effects (by index)
  // Edges: if effect/derived reads signal getter, signal -> effect/derived

  // For cycle detection we only care about derived->derived cycles (effects are sinks)
  // Build graph among derived nodes
  const derivedNames = new Set(patterns.derived.map(d => d.name));
  const adj = new Map<string, string[]>();
  for (const d of patterns.derived) {
    adj.set(d.name, d.dependencies.filter(dep => derivedNames.has(dep)));
  }

  // Kahn's algorithm for cycle detection among derived
  const inDegree = new Map<string, number>();
  for (const name of derivedNames) inDegree.set(name, 0);
  for (const [, deps] of adj) {
    for (const dep of deps) {
      inDegree.set(dep, (inDegree.get(dep) ?? 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const [name, deg] of inDegree) {
    if (deg === 0) queue.push(name);
  }

  let sorted = 0;
  while (queue.length > 0) {
    const node = queue.shift()!;
    sorted++;
    for (const dep of adj.get(node) ?? []) {
      const newDeg = (inDegree.get(dep) ?? 1) - 1;
      inDegree.set(dep, newDeg);
      if (newDeg === 0) queue.push(dep);
    }
  }

  const cycles = derivedNames.size - sorted;

  // Dead signal detection: getter never read in any effect/derived AND setter never called anywhere
  const allDeps = new Set<string>();
  for (const e of patterns.effects) for (const d of e.dependencies) allDeps.add(d);
  for (const d of patterns.derived) for (const dep of d.dependencies) allDeps.add(dep);

  // Also check if setter is called anywhere in the AST
  const allCalledNames = collectAllCalledNames(bundle.js);

  const deadSignals: string[] = [];
  for (const sig of patterns.signals) {
    const getterUsed = allDeps.has(sig.getter);
    // A signal is dead if its getter is never read by any effect or derived.
    // Even if the setter is called, writing to a value nobody reads is dead code.
    if (!getterUsed) {
      deadSignals.push(sig.getter);
    }
  }

  // --- Unnamed signal detection ---
  const unnamedSignals = patterns.signals.filter(s => !s.named).length;

  // --- Taint analysis ---
  const taintViolations = analyzeTaint(bundle.js);

  return {
    signals: patterns.signals.length,
    effects: patterns.effects.length,
    cycles,
    deadSignals,
    unnamedSignals,
    taintViolations,
  };
}

// --- Taint analysis helpers ---

/** Collect all identifier names in an AST subtree */
function collectIdentifiers(node: unknown): Set<string> {
  const ids = new Set<string>();
  walkNode(node, (n: AstNode) => {
    if (n.type === "Identifier") {
      ids.add((n as AstIdentifier).name);
    }
  });
  return ids;
}

/** Check if an expression subtree wraps a tainted var in a sanitizer */
function isSanitized(expr: unknown, taintedName: string): boolean {
  let sanitized = false;
  walkNode(expr, (n: AstNode) => {
    if (n.type === "CallExpression") {
      const callee = n.callee as AstNode;
      // encodeURIComponent(tainted) or encodeURI(tainted)
      if (callee.type === "Identifier") {
        const name = (callee as AstIdentifier).name;
        if (name === "encodeURIComponent" || name === "encodeURI") {
          const args = n.arguments as unknown[];
          for (const arg of args) {
            if (collectIdentifiers(arg).has(taintedName)) {
              sanitized = true;
            }
          }
        }
      }
      // something.sanitize(tainted)
      if (callee.type === "MemberExpression") {
        const prop = (callee as AstNode).property as AstNode;
        if (prop.type === "Identifier" && (prop as AstIdentifier).name === "sanitize") {
          const args = n.arguments as unknown[];
          for (const arg of args) {
            if (collectIdentifiers(arg).has(taintedName)) {
              sanitized = true;
            }
          }
        }
      }
    }
  });
  return sanitized;
}

/** Check if a variable was sanitized via assignment: `const safe = encodeURIComponent(tainted)` */
function buildSanitizedSet(ast: Node, tainted: Set<string>): Set<string> {
  const sanitized = new Set<string>();
  walkNode(ast, (n: AstNode) => {
    // const safe = encodeURIComponent(val)
    if (n.type === "VariableDeclarator") {
      const id = n.id as AstNode;
      const init = n.init as AstNode | null;
      if (id?.type === "Identifier" && init) {
        const varName = (id as AstIdentifier).name;
        // Check if init is a sanitizer call wrapping a tainted var
        for (const t of tainted) {
          if (isSanitized(init, t)) {
            sanitized.add(varName);
          }
        }
      }
    }
  });
  return sanitized;
}

function analyzeTaint(ast: Node): string[] {
  const tainted = new Set<string>();
  const violations: string[] = [];

  // Pass 1: find taint sources
  walkNode(ast, (n: AstNode) => {
    // const x = something.value  (input.value, event.target.value)
    if (n.type === "VariableDeclarator") {
      const id = n.id as AstNode;
      const init = n.init as AstNode | null;
      if (id?.type === "Identifier" && init?.type === "MemberExpression") {
        const prop = init.property as AstNode;
        if (prop?.type === "Identifier" && (prop as AstIdentifier).name === "value") {
          tainted.add((id as AstIdentifier).name);
        }
      }
    }
    // const x = prompt(...)
    if (n.type === "VariableDeclarator") {
      const id = n.id as AstNode;
      const init = n.init as AstNode | null;
      if (id?.type === "Identifier" && init?.type === "CallExpression") {
        const callee = init.callee as AstNode;
        if (callee?.type === "Identifier" && (callee as AstIdentifier).name === "prompt") {
          tainted.add((id as AstIdentifier).name);
        }
      }
    }
    // const x = location.search / location.hash
    if (n.type === "VariableDeclarator") {
      const id = n.id as AstNode;
      const init = n.init as AstNode | null;
      if (id?.type === "Identifier" && init?.type === "MemberExpression") {
        const obj = init.object as AstNode;
        const prop = init.property as AstNode;
        if (obj?.type === "Identifier" && (obj as AstIdentifier).name === "location" &&
            prop?.type === "Identifier" &&
            ((prop as AstIdentifier).name === "search" || (prop as AstIdentifier).name === "hash")) {
          tainted.add((id as AstIdentifier).name);
        }
      }
    }
  });

  if (tainted.size === 0) return violations;

  // Build sanitized set (vars assigned from sanitizer calls on tainted vars)
  const sanitizedVars = buildSanitizedSet(ast, tainted);

  // Pass 2: find sinks and check for taint
  walkNode(ast, (n: AstNode) => {
    const line = n.loc ? (n.loc as { start: { line: number } }).start.line : 0;

    // .innerHTML = expr
    if (n.type === "AssignmentExpression") {
      const left = n.left as AstNode;
      if (left?.type === "MemberExpression") {
        const prop = left.property as AstNode;
        if (prop?.type === "Identifier" && (prop as AstIdentifier).name === "innerHTML") {
          const exprIds = collectIdentifiers(n.right);
          for (const t of tainted) {
            if (exprIds.has(t) && !sanitizedVars.has(t)) {
              if (!isSanitized(n.right, t)) {
                violations.push(`User input '${t}' flows to innerHTML without sanitization (line ${line})`);
              }
            }
          }
        }
      }
    }

    // eval(expr) / new Function(expr)
    if (n.type === "CallExpression") {
      const callee = n.callee as AstNode;
      if (callee?.type === "Identifier" && (callee as AstIdentifier).name === "eval") {
        const args = n.arguments as unknown[];
        for (const arg of args) {
          const exprIds = collectIdentifiers(arg);
          for (const t of tainted) {
            if (exprIds.has(t) && !sanitizedVars.has(t)) {
              violations.push(`User input '${t}' flows to eval without sanitization (line ${line})`);
            }
          }
        }
      }
    }

    // document.write(expr) / document.writeln(expr)
    if (n.type === "CallExpression") {
      const callee = n.callee as AstNode;
      if (callee?.type === "MemberExpression") {
        const obj = callee.object as AstNode;
        const prop = callee.property as AstNode;
        if (obj?.type === "Identifier" && (obj as AstIdentifier).name === "document" &&
            prop?.type === "Identifier" &&
            ((prop as AstIdentifier).name === "write" || (prop as AstIdentifier).name === "writeln")) {
          const args = n.arguments as unknown[];
          for (const arg of args) {
            const exprIds = collectIdentifiers(arg);
            for (const t of tainted) {
              if (exprIds.has(t) && !sanitizedVars.has(t)) {
                violations.push(`User input '${t}' flows to document.write without sanitization (line ${line})`);
              }
            }
          }
        }
      }
    }

    // location.href = expr / location.assign(expr)
    if (n.type === "AssignmentExpression") {
      const left = n.left as AstNode;
      if (left?.type === "MemberExpression") {
        const obj = left.object as AstNode;
        const prop = left.property as AstNode;
        if (obj?.type === "Identifier" && (obj as AstIdentifier).name === "location" &&
            prop?.type === "Identifier" && (prop as AstIdentifier).name === "href") {
          const exprIds = collectIdentifiers(n.right);
          for (const t of tainted) {
            if (exprIds.has(t) && !sanitizedVars.has(t)) {
              if (!isSanitized(n.right, t)) {
                violations.push(`User input '${t}' flows to location.href without sanitization (line ${line})`);
              }
            }
          }
        }
      }
    }

    // element.setAttribute("on*", expr)
    if (n.type === "CallExpression") {
      const callee = n.callee as AstNode;
      if (callee?.type === "MemberExpression") {
        const prop = callee.property as AstNode;
        if (prop?.type === "Identifier" && (prop as AstIdentifier).name === "setAttribute") {
          const args = n.arguments as unknown[];
          if (args.length >= 2) {
            const firstArg = args[0] as AstNode;
            if (firstArg?.type === "Literal" && typeof firstArg.value === "string" &&
                (firstArg.value as string).startsWith("on")) {
              const exprIds = collectIdentifiers(args[1]);
              for (const t of tainted) {
                if (exprIds.has(t) && !sanitizedVars.has(t)) {
                  violations.push(`User input '${t}' flows to setAttribute("${firstArg.value}") without sanitization (line ${line})`);
                }
              }
            }
          }
        }
      }
    }
  });

  return violations;
}

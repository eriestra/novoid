// FSM extraction + model checking — per-signal, with sequential transition inference
import type { DocumentBundle, StateMachineResult } from "../types.js";
import type { Node } from "acorn";
import { detectPatterns } from "./patterns.js";

type AstNode = Node & Record<string, unknown>;
type AstIdentifier = AstNode & { name: string };

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

interface Edge {
  from: string;
  to: string;
}

/**
 * Collect setter calls that are direct in a scope (not inside nested functions),
 * along with nested function nodes in source order.
 */
function collectDirectItems(
  scope: AstNode,
  setterName: string
): Array<{ type: "call"; target: string; pos: number } | { type: "fn"; node: AstNode; pos: number }> {
  const items: Array<{ type: "call"; target: string; pos: number } | { type: "fn"; node: AstNode; pos: number }> = [];

  function walk(node: unknown, isRoot: boolean): void {
    if (!node || typeof node !== "object") return;
    const n = node as AstNode;
    if (typeof n.type !== "string") return;

    // Stop at nested function boundaries (but record them)
    if (
      !isRoot &&
      (n.type === "FunctionDeclaration" ||
        n.type === "FunctionExpression" ||
        n.type === "ArrowFunctionExpression")
    ) {
      items.push({ type: "fn", node: n, pos: n.start ?? 0 });
      return;
    }

    // Check if this is a setter call
    if (n.type === "CallExpression") {
      const callee = n.callee as AstNode;
      if (callee.type === "Identifier" && (callee as AstIdentifier).name === setterName) {
        const args = n.arguments as AstNode[];
        if (args.length > 0) {
          const arg = args[0];
          if (arg.type === "Literal" && typeof (arg as AstNode & { value: unknown }).value === "string") {
            items.push({
              type: "call",
              target: (arg as AstNode & { value: unknown }).value as string,
              pos: n.start ?? 0,
            });
          }
        }
      }
    }

    for (const key of Object.keys(n)) {
      const val = (n as Record<string, unknown>)[key];
      if (Array.isArray(val)) {
        for (const item of val) walk(item, false);
      } else if (val && typeof val === "object" && typeof (val as AstNode).type === "string") {
        walk(val, false);
      }
    }
  }

  walk(scope, true);
  items.sort((a, b) => a.pos - b.pos);
  return items;
}

/**
 * Recursively infer transitions in a scope.
 * entryState is what state the signal is in when this scope starts executing.
 * Returns edges and the "last known state" after this scope runs.
 */
function inferEdges(
  scope: AstNode,
  setterName: string,
  entryState: string
): Edge[] {
  const edges: Edge[] = [];
  const items = collectDirectItems(scope, setterName);

  let lastState = entryState;

  for (const item of items) {
    if (item.type === "call") {
      if (item.target !== lastState) {
        edges.push({ from: lastState, to: item.target });
      }
      lastState = item.target;
    } else {
      // Nested function — recurse with the current lastState as entry
      const fnBody = item.node.body as AstNode;
      if (fnBody) {
        const subEdges = inferEdges(fnBody, setterName, lastState);
        edges.push(...subEdges);
      }
      // After a nested function, we don't know what state we're in
      // (the function may or may not have been called, may be async callback)
      // Keep lastState unchanged — the function is a branch, not sequential.
    }
  }

  return edges;
}

/** Extract finite state machine from reactive patterns and model-check */
export function extractStateMachine(bundle: DocumentBundle): StateMachineResult {
  if (!bundle.js) {
    return { states: 0, reachable: 0, deadlocks: 0, warnings: [] };
  }

  const patterns = detectPatterns(bundle.js);

  // Find signals with string literal initial values — these are state machines
  const stateMachineSignals = patterns.signals.filter(
    s => typeof s.initialValue === "string"
  );

  if (stateMachineSignals.length === 0) {
    return { states: 0, reachable: 0, deadlocks: 0, warnings: [] };
  }

  // Analyze each signal as its own independent FSM
  let totalStates = 0;
  let totalReachable = 0;
  let totalDeadlocks = 0;
  const allWarnings: string[] = [];

  for (const sig of stateMachineSignals) {
    const initialState = sig.initialValue as string;
    const states = new Set<string>();
    states.add(initialState);

    // Collect all string targets for this setter
    walkNode(bundle.js, (n: AstNode) => {
      if (n.type !== "CallExpression") return;
      const callee = n.callee as AstNode;
      if (callee.type !== "Identifier") return;
      if ((callee as AstIdentifier).name !== sig.setter) return;
      const args = n.arguments as AstNode[];
      if (args.length === 0) return;
      const arg = args[0];
      if (arg.type === "Literal" && typeof (arg as AstNode & { value: unknown }).value === "string") {
        states.add((arg as AstNode & { value: unknown }).value as string);
      }
    });

    // Infer transitions
    const edges = inferEdges(bundle.js as unknown as AstNode, sig.setter, initialState);

    const statesArray = Array.from(states);
    totalStates += statesArray.length;

    // Build adjacency
    const adj = new Map<string, Set<string>>();
    for (const s of statesArray) adj.set(s, new Set());
    for (const e of edges) {
      adj.get(e.from)?.add(e.to);
    }

    // BFS reachability from initial state
    const reachable = new Set<string>();
    const queue = [initialState];
    reachable.add(initialState);
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const next of adj.get(current) ?? []) {
        if (!reachable.has(next)) {
          reachable.add(next);
          queue.push(next);
        }
      }
    }
    totalReachable += reachable.size;

    // Unreachable states
    for (const s of statesArray) {
      if (!reachable.has(s)) {
        allWarnings.push(`Unreachable state in "${sig.getter}": "${s}"`);
      }
    }

    // Terminal/sink states: reachable states with no outgoing transitions
    for (const s of reachable) {
      const outgoing = adj.get(s);
      if (!outgoing || outgoing.size === 0) {
        if (s !== initialState || statesArray.length > 1) {
          totalDeadlocks++;
          if (s !== initialState) {
            allWarnings.push(`Terminal state (no recovery path) in "${sig.getter}": "${s}"`);
          }
        }
      }
    }
  }

  return {
    states: totalStates,
    reachable: totalReachable,
    deadlocks: totalDeadlocks,
    warnings: allWarnings,
  };
}

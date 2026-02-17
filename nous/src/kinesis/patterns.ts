// Reactive pattern recognizers for known frameworks
// Supports: novoid, SolidJS, Preact Signals

import type { Program, Node } from "acorn";

export type Framework = "novoid" | "solid" | "preact" | "unknown";

export interface SignalInfo {
  getter: string;
  setter: string;
  initialValue?: unknown;
  named: boolean;
  line: number;
}

export interface EffectInfo {
  line: number;
  dependencies: string[];
}

export interface DerivedInfo {
  name: string;
  line: number;
  dependencies: string[];
}

export interface DetectedPattern {
  framework: Framework;
  signals: SignalInfo[];
  effects: EffectInfo[];
  derived: DerivedInfo[];
}

// Signal creation function names per framework
const SIGNAL_CREATORS: Record<string, Framework> = {
  signal: "novoid",       // also preact, resolved by context
  createSignal: "solid",
};

const MEMBER_SIGNAL_CREATORS: Record<string, Record<string, Framework>> = {
  Novoid: { signal: "novoid", derived: "novoid", effect: "novoid" },
};

const EFFECT_NAMES = new Set(["effect", "createEffect"]);
const DERIVED_NAMES: Record<string, Framework> = {
  derived: "novoid",
  computed: "preact",
  createMemo: "solid",
};

// Simple AST walker
function walk(node: unknown, visitor: (n: AstNode) => void): void {
  if (!node || typeof node !== "object") return;
  const n = node as AstNode;
  if (typeof n.type === "string") visitor(n);
  for (const key of Object.keys(n)) {
    const val = (n as Record<string, unknown>)[key];
    if (Array.isArray(val)) {
      for (const item of val) walk(item, visitor);
    } else if (val && typeof val === "object" && typeof (val as AstNode).type === "string") {
      walk(val, visitor);
    }
  }
}

// Collect all identifiers called as functions inside a node (for dependency tracking)
function collectCalledIdentifiers(node: unknown, knownGetters: Set<string>): string[] {
  const deps: string[] = [];
  walk(node, (n: AstNode) => {
    if (n.type === "CallExpression") {
      const callee = n.callee as AstNode;
      if (callee.type === "Identifier" && knownGetters.has((callee as AstIdentifier).name)) {
        deps.push((callee as AstIdentifier).name);
      }
    }
  });
  return deps;
}

// Minimal AST node type aliases
type AstNode = Node & Record<string, unknown>;
type AstIdentifier = AstNode & { name: string };

function getLine(node: AstNode): number {
  return node.loc?.start?.line ?? 0;
}

function isCallTo(callee: AstNode, name: string): boolean {
  return callee.type === "Identifier" && (callee as AstIdentifier).name === name;
}

function isMemberCall(callee: AstNode, obj: string, prop: string): boolean {
  if (callee.type !== "MemberExpression") return false;
  const o = callee.object as AstNode;
  const p = callee.property as AstNode;
  return o.type === "Identifier" && (o as AstIdentifier).name === obj &&
    p.type === "Identifier" && (p as AstIdentifier).name === prop;
}

/** Detect which reactive framework is in use and extract patterns */
export function detectPatterns(ast: Program): DetectedPattern {
  const signals: SignalInfo[] = [];
  const effects: EffectInfo[] = [];
  const derived: DerivedInfo[] = [];
  let framework: Framework = "unknown";

  // First pass: collect signals so we know getter names for dependency tracking
  const getterNames = new Set<string>();

  walk(ast, (node: AstNode) => {
    if (node.type !== "VariableDeclaration") return;
    const declarations = node.declarations as AstNode[];
    for (const decl of declarations) {
      const init = decl.init as AstNode | null;
      if (!init || init.type !== "CallExpression") continue;
      const callee = init.callee as AstNode;

      // Check if this is a signal creation call
      let detectedFw: Framework | null = null;

      // Novoid.signal(...) or Novoid.derived(...)
      if (callee.type === "MemberExpression") {
        const obj = callee.object as AstNode;
        const prop = callee.property as AstNode;
        if (obj.type === "Identifier" && prop.type === "Identifier") {
          const objName = (obj as AstIdentifier).name;
          const propName = (prop as AstIdentifier).name;
          const mapping = MEMBER_SIGNAL_CREATORS[objName];
          if (mapping && mapping[propName]) {
            detectedFw = mapping[propName];
            if (propName === "derived" || propName === "computed" || propName === "createMemo") {
              // Handle as derived below
            }
          }
        }
      }
      // signal(...), createSignal(...)
      else if (callee.type === "Identifier") {
        const name = (callee as AstIdentifier).name;
        if (SIGNAL_CREATORS[name]) {
          detectedFw = SIGNAL_CREATORS[name];
        } else if (DERIVED_NAMES[name]) {
          detectedFw = DERIVED_NAMES[name];
        }
      }

      if (!detectedFw) continue;
      if (framework === "unknown") framework = detectedFw;

      const calleeId = callee.type === "Identifier"
        ? (callee as AstIdentifier).name
        : callee.type === "MemberExpression"
          ? ((callee.property as AstIdentifier).name)
          : "";

      // Is this a derived/computed/createMemo?
      if (calleeId === "derived" || calleeId === "computed" || calleeId === "createMemo") {
        const id = decl.id as AstNode;
        const name = id.type === "Identifier" ? (id as AstIdentifier).name : "anonymous";
        // Getter name for derived — the variable itself is callable
        getterNames.add(name);
        derived.push({ name, line: getLine(node), dependencies: [] }); // deps filled in pass 2
        continue;
      }

      // Signal: expect ArrayPattern [getter, setter]
      const id = decl.id as AstNode;
      if (id.type === "ArrayPattern") {
        const elements = id.elements as (AstNode | null)[];
        const getter = elements[0] && elements[0].type === "Identifier" ? (elements[0] as AstIdentifier).name : "";
        const setter = elements[1] && elements[1].type === "Identifier" ? (elements[1] as AstIdentifier).name : "";
        const args = init.arguments as AstNode[];
        const initialValue = args[0]?.type === "Literal" ? (args[0] as AstNode & { value: unknown }).value : undefined;
        const named = args.length >= 2 && args[1]?.type === "Literal" && typeof (args[1] as AstNode & { value: unknown }).value === "string";

        if (getter) getterNames.add(getter);
        signals.push({ getter, setter, initialValue, named, line: getLine(node) });
      }
    }
  });

  // Second pass: effects and dependency resolution for derived
  walk(ast, (node: AstNode) => {
    // ExpressionStatement: effect(() => ...) or Novoid.effect(() => ...)
    if (node.type === "ExpressionStatement") {
      const expr = node.expression as AstNode;
      if (expr.type !== "CallExpression") return;
      const callee = expr.callee as AstNode;

      let isEffect = false;
      if (callee.type === "Identifier" && EFFECT_NAMES.has((callee as AstIdentifier).name)) {
        isEffect = true;
        if (framework === "unknown") {
          framework = (callee as AstIdentifier).name === "createEffect" ? "solid" : "novoid";
        }
      } else if (callee.type === "MemberExpression") {
        if (isMemberCall(callee, "Novoid", "effect")) {
          isEffect = true;
          if (framework === "unknown") framework = "novoid";
        }
      }

      if (isEffect) {
        const args = expr.arguments as AstNode[];
        const callback = args[0];
        const deps = callback ? collectCalledIdentifiers(callback, getterNames) : [];
        effects.push({ line: getLine(node), dependencies: deps });
      }
    }
  });

  // Resolve derived dependencies
  // Re-walk AST to find derived callbacks and extract deps
  let derivedIdx = 0;
  walk(ast, (node: AstNode) => {
    if (node.type !== "VariableDeclaration") return;
    const declarations = node.declarations as AstNode[];
    for (const decl of declarations) {
      const init = decl.init as AstNode | null;
      if (!init || init.type !== "CallExpression") continue;
      const callee = init.callee as AstNode;
      const calleeId = callee.type === "Identifier"
        ? (callee as AstIdentifier).name
        : callee.type === "MemberExpression"
          ? ((callee.property as AstIdentifier).name)
          : "";

      if (calleeId === "derived" || calleeId === "computed" || calleeId === "createMemo") {
        const args = init.arguments as AstNode[];
        const callback = args[0];
        if (callback && derivedIdx < derived.length) {
          derived[derivedIdx].dependencies = collectCalledIdentifiers(callback, getterNames);
        }
        derivedIdx++;
      }
    }
  });

  return { framework, signals, effects, derived };
}

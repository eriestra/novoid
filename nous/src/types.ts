// Nous — Proof Report Types
// Matches the JSON format defined in NOUS.md

export type Verdict = "SOUND" | "UNSOUND" | "PARTIAL";

// --- Pillar I: Morphe (Structure) ---

export interface AccessibilityResult {
  tab_order_complete: boolean;
  all_inputs_labeled: boolean;
  landmark_structure: "valid" | "invalid" | "missing";
}

export interface MorpheResult {
  verdict: Verdict;
  node_count: number;
  contracts_checked: number;
  contracts_passed: number;
  accessibility: AccessibilityResult;
  selector_coverage?: { total: number; covered: number; uncovered: string[] };
}

// --- Pillar II: Thesis (Presentation) ---

export interface ThesisResult {
  verdict: Verdict;
  viewport_range: [number, number];
  feasible: boolean;
  breakpoints: number[];
  developer_breakpoints: number[];
  unmatched_breakpoints: number[];
  cascade_conflicts: number;
  overflow_risks: string[];
}

// --- Pillar III: Kinesis (Behavior) ---

export interface StateMachineResult {
  states: number;
  reachable: number;
  deadlocks: number;
  warnings: string[];
}

export interface KinesisResult {
  verdict: Verdict;
  signals: number;
  effects: number;
  cycles: number;
  dead_signals: string[];
  unnamed_signals: number;
  taint_violations: string[];
  state_machine: StateMachineResult;
}

// --- Cross-Pillar ---

export interface CrossPillarStructurePresentation {
  verdict: Verdict;
  unstyled_nodes: string[];
}

export interface CrossPillarResult {
  behavior_x_structure: Verdict;
  behavior_x_presentation: Verdict;
  structure_x_presentation: CrossPillarStructurePresentation;
}

// --- Proof Report ---

export interface ProofReport {
  nous: string;
  document: string;
  timestamp: string;
  verdict: Verdict;
  morphe: MorpheResult;
  thesis: ThesisResult;
  kinesis: KinesisResult;
  cross_pillar: CrossPillarResult;
}

// --- Contracts ---

export interface ContractSelector {
  min?: number;
  max?: number;
}

export interface ContractStructure {
  contains?: Record<string, ContractSelector>;
  accessibility?: string[];
}

export interface Contract {
  name: string;
  structure: Record<string, ContractStructure>;
}

// --- Parser output ---

export interface DocumentBundle {
  html: import("parse5").DefaultTreeAdapterMap["document"];
  css: import("css-tree").CssNode | null;
  js: import("acorn").Program | null;
  rawHtml: string;
  rawCss: string;
  rawJs: string;
}

export interface AnalyzeOptions {
  viewport?: [number, number];
  contracts?: Contract[];
}

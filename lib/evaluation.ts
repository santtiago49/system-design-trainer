import type { Category } from "./catalog";

export type EvaluationInput = {
  scenarioId: string;
  users: number;
  components: { name: string; category: Category; units: number; multiAz: boolean }[];
  connections: string[];
  simulation: {
    peakRps: number;
    supportedUsers: number;
    bottleneck: string | null;
    availability: number;
    findings: string[];
  };
  explanation: string;
};

export type ScoreAnswer = {
  score: number;
  max: number;
  confidence: number;
  probabilities: number[];
};

export type EvaluationResult = {
  model: string;
  mock: boolean;
  scores: {
    scalability: ScoreAnswer | null;
    reliability: ScoreAnswer | null;
    data_design: ScoreAnswer | null;
    explanation: ScoreAnswer | null;
  };
  nextFocus: { choice: string; confidence: number; probabilities: Record<string, number> } | null;
  rubric: { id: string; check: string; probability: number }[];
};

export const FOCUS_LABELS: Record<string, string> = {
  capacity: "Throughput",
  caching: "Caching",
  redundancy: "Redundancy",
  async: "Async processing",
  data_model: "Data storage",
  edge: "Edge delivery",
  observability: "Observability",
  none: "Nothing major",
};

export const SCORE_LEVELS: Record<keyof EvaluationResult["scores"], string[]> = {
  scalability: ["Can't reach target", "Hard bottleneck", "Meets target", "Scales out everywhere"],
  reliability: ["Many SPOFs", "A critical SPOF", "Mostly redundant", "Multi-AZ, no SPOF"],
  data_design: ["Missing / wrong", "Ignores access pattern", "Good fit", "Deliberate choices"],
  explanation: ["No reasoning", "Some reasons", "Estimates or trade-offs", "Interview-ready"],
};

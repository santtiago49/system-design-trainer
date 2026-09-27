"use client";

import { CircleAlert, CircleCheck, Info, Loader2, Sparkles, TriangleAlert } from "lucide-react";
import { FOCUS_LABELS, SCORE_LEVELS, type EvaluationResult, type ScoreAnswer } from "@/lib/evaluation";
import type { Finding } from "@/lib/simulate";

type Props = {
  findings: Finding[];
  explanation: string;
  onExplanationChange: (value: string) => void;
  result: EvaluationResult | null;
  error: string | null;
  loading: boolean;
  stale: boolean;
  onEvaluate: () => void;
  onSelectNode: (id: string) => void;
};

const SEVERITY = {
  error: { Icon: CircleAlert, className: "text-over" },
  warn: { Icon: TriangleAlert, className: "text-warn" },
  info: { Icon: Info, className: "text-zinc-400" },
};

function ScoreRow({ label, levels, answer }: { label: string; levels: string[]; answer: ScoreAnswer }) {
  const ratio = answer.score / answer.max;
  const color = ratio >= 0.66 ? "bg-ok" : ratio >= 0.4 ? "bg-warn" : "bg-over";
  const level = Math.round(answer.score);
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-xs text-zinc-500">
          {answer.score.toFixed(1)} / {answer.max}
        </span>
      </div>
      <div className="mt-1 flex gap-0.5">
        {answer.probabilities.map((p, i) => (
          <div key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100" title={`${levels[i]}: ${Math.round(p * 100)}%`}>
            <div className={`h-full ${color}`} style={{ width: `${Math.round(p * 100)}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-0.5 text-[11px] text-zinc-500">
        {levels[level]} · {Math.round(answer.confidence * 100)}% confidence
      </div>
    </div>
  );
}

export function EvaluationPanel(props: Props) {
  const { findings, explanation, onExplanationChange, result, error, loading, stale, onEvaluate, onSelectNode } = props;

  return (
    <div className="space-y-5 p-4">
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Capacity model checks</h3>
        {findings.length === 0 ? (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-ok">
            <CircleCheck className="size-4" /> No structural issues found.
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {findings.map((f, i) => {
              const { Icon, className } = SEVERITY[f.severity];
              return (
                <li key={i}>
                  <button
                    disabled={!f.nodeId}
                    onClick={() => f.nodeId && onSelectNode(f.nodeId)}
                    className="flex w-full gap-2 rounded-md text-left text-sm enabled:hover:bg-zinc-50"
                  >
                    <Icon className={`mt-0.5 size-4 shrink-0 ${className}`} />
                    <span>{f.message}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Your explanation</h3>
        <textarea
          value={explanation}
          onChange={(e) => onExplanationChange(e.target.value)}
          rows={6}
          placeholder="Talk through it like in the interview: assumptions, back-of-envelope numbers, why each component, trade-offs…"
          className="mt-2 w-full resize-y rounded-lg border border-line p-2.5 text-sm outline-none focus:border-zinc-400"
        />
        <button
          onClick={onEvaluate}
          disabled={loading}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-ink py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {loading ? "Jev is grading…" : result ? "Re-evaluate with Jev" : "Evaluate with Jev"}
        </button>
        {error && <p className="mt-2 text-sm text-over">{error}</p>}
      </section>

      {result && (
        <section className={`space-y-4 ${stale ? "opacity-50" : ""}`}>
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Interviewer scorecard</h3>
            <span className="text-[11px] text-zinc-400">{result.mock ? "mock (no API key)" : result.model}</span>
          </div>
          {stale && <p className="text-xs text-zinc-500">The design changed since this evaluation.</p>}

          {result.nextFocus && (
            <div className="rounded-lg bg-zinc-50 p-3">
              <div className="text-[11px] text-zinc-500">Improve next</div>
              <div className="text-sm font-semibold">{FOCUS_LABELS[result.nextFocus.choice] ?? result.nextFocus.choice}</div>
              {!result.mock && (
                <div className="mt-1 text-[11px] text-zinc-500">
                  {Object.entries(result.nextFocus.probabilities)
                    .sort((a, b) => b[1] - a[1])
                    .slice(1, 3)
                    .filter(([, p]) => p > 0.1)
                    .map(([k, p]) => `${FOCUS_LABELS[k] ?? k} ${Math.round(p * 100)}%`)
                    .join(" · ") || `${Math.round(result.nextFocus.confidence * 100)}% confidence`}
                </div>
              )}
            </div>
          )}

          {(Object.keys(SCORE_LEVELS) as (keyof typeof SCORE_LEVELS)[]).map((key) => {
            const answer = result.scores[key];
            if (!answer) return null;
            const label = { scalability: "Scalability", reliability: "Reliability", data_design: "Data design", explanation: "Explanation" }[key];
            return <ScoreRow key={key} label={label} levels={SCORE_LEVELS[key]} answer={answer} />;
          })}

          <div>
            <div className="mb-1.5 text-sm font-medium">Checklist</div>
            <ul className="space-y-1.5">
              {result.rubric.map((r) => {
                const passed = r.probability >= 0.5;
                return (
                  <li key={r.id} className="flex gap-2 text-sm">
                    {passed ? (
                      <CircleCheck className="mt-0.5 size-4 shrink-0 text-ok" />
                    ) : (
                      <CircleAlert className="mt-0.5 size-4 shrink-0 text-zinc-300" />
                    )}
                    <span className={passed ? "" : "text-zinc-500"}>
                      {r.check} <span className="text-[11px] text-zinc-400">{Math.round(r.probability * 100)}%</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}

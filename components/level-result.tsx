"use client";

import { ArrowRight, BookOpen, CircleCheck, CircleX, RotateCcw, Star } from "lucide-react";
import type { Level, LevelResult } from "@/lib/levels";

type Props = {
  level: Level;
  result: LevelResult;
  xpGained: number;
  rankUp: string | null;
  nextLevel: Level | null;
  onNext: () => void;
  onClose: () => void;
};

export function LevelResultModal({ level, result, xpGained, rankUp, nextLevel, onNext, onClose }: Props) {
  const cleared = result.stars > 0;
  const headline = !cleared ? "Not yet" : result.stars === 3 ? "Perfect design" : result.stars === 2 ? "Great work" : "Level cleared";

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-ink/20 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-center gap-2">
          {[0, 1, 2].map((i) => (
            <Star
              key={i}
              className={`size-10 ${i < result.stars ? "star-pop fill-amber-400 text-amber-400" : "text-zinc-200"}`}
              style={{ animationDelay: `${i * 180}ms` }}
            />
          ))}
        </div>
        <h2 className="mt-3 text-center text-xl font-semibold">{headline}</h2>
        <p className="mt-1 text-center text-sm text-zinc-500">
          {cleared
            ? xpGained > 0
              ? `+${xpGained} XP`
              : "No new stars this time. Your best score is kept."
            : "Some required objectives failed. Check the run results, fix the design and run again."}
        </p>
        {rankUp && <p className="mt-2 rounded-lg bg-amber-50 py-1.5 text-center text-sm font-medium text-amber-900">Promoted to {rankUp}!</p>}

        <ul className="mt-4 space-y-1.5">
          {result.objectives.map((o) => (
            <li key={o.id} className="flex items-start gap-2 text-sm">
              {o.passed ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-ok" /> : <CircleX className="mt-0.5 size-4 shrink-0 text-over" />}
              <span className={o.passed ? "" : "text-zinc-500"}>{o.label}</span>
              {o.bonus && <Star className="mt-0.5 size-3.5 shrink-0 fill-amber-400 text-amber-400" />}
            </li>
          ))}
        </ul>

        {cleared && level.reference && (
          <a
            href={level.reference.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 flex items-center gap-2 rounded-lg border border-line p-3 text-sm hover:border-zinc-400"
          >
            <BookOpen className="size-4 shrink-0 text-azure" />
            <span>
              Compare with Microsoft's reference: <span className="font-medium">{level.reference.title}</span>
            </span>
          </a>
        )}

        <div className="mt-5 flex gap-2">
          <button onClick={onClose} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-line py-2 text-sm font-medium hover:bg-zinc-50">
            <RotateCcw className="size-4" /> {cleared ? "Keep improving" : "Back to the design"}
          </button>
          {cleared && nextLevel && (
            <button onClick={onNext} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-ink py-2 text-sm font-medium text-white">
              Next level <ArrowRight className="size-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

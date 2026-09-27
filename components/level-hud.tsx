"use client";

import { useState } from "react";
import { BookOpen, ChevronDown, ChevronUp, Circle, CircleCheck, CircleX, Lightbulb, Map as MapIcon, RotateCcw, Star } from "lucide-react";
import { LEVELS, type Level, type LevelResult } from "@/lib/levels";
import { Stars } from "./level-select";

type Props = {
  level: Level;
  bestStars: number;
  result: LevelResult | null;
  stale: boolean;
  onOpenLevels: () => void;
  onReset: () => void;
};

export function LevelHud({ level, bestStars, result, stale, onOpenLevels, onReset }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [hintsShown, setHintsShown] = useState(0);
  const number = LEVELS.indexOf(level) + 1;
  const objectives = [
    ...level.required.map((o) => ({ id: o.id, label: o.label, bonus: false })),
    ...level.bonus.map((o) => ({ id: `bonus-${o.id}`, label: o.label, bonus: true })),
  ];
  const checked = result && !stale ? new Map(result.objectives.map((o) => [o.id, o.passed])) : null;

  return (
    <div className="w-80 rounded-xl border border-line bg-white shadow-sm">
      <div className="flex items-center gap-2 px-3 pt-2.5">
        <button onClick={onOpenLevels} title="All levels" className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100 hover:text-ink">
          <MapIcon className="size-4" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-medium text-zinc-400">Level {number}</div>
          <div className="truncate text-sm font-semibold">{level.title}</div>
        </div>
        <Stars count={bestStars} size="size-3.5" />
        <button
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? "Expand" : "Collapse"}
          className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100 hover:text-ink"
        >
          {collapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
        </button>
      </div>

      {!collapsed && (
        <div className="space-y-3 px-3 pb-3 pt-2">
          <p className="text-xs leading-relaxed text-zinc-600">{level.brief}</p>

          <div>
            <div className="mb-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
              <span>Objectives</span>
              <span className="font-normal normal-case tracking-normal">
                {checked ? "from your last run" : stale ? "design changed: run again" : "press Run to check"}
              </span>
            </div>
            <ul className="space-y-1">
              {objectives.map((o) => {
                const passed = checked?.get(o.id);
                const Icon = passed === undefined ? Circle : passed ? CircleCheck : CircleX;
                const color = passed === undefined ? "text-zinc-300" : passed ? "text-ok" : "text-over";
                return (
                  <li key={o.id} className="flex items-start gap-2 text-xs">
                    <Icon className={`mt-px size-3.5 shrink-0 ${color}`} />
                    <span className={o.bonus ? "text-zinc-600" : ""}>{o.label}</span>
                    {o.bonus && <Star className="mt-px size-3 shrink-0 fill-amber-400 text-amber-400" />}
                  </li>
                );
              })}
            </ul>
            <p className="mt-1 text-[11px] text-zinc-400">All objectives without a star = 1 star. Each ★ bonus adds one.</p>
          </div>

          {hintsShown > 0 && (
            <ul className="space-y-1.5 rounded-lg bg-amber-50 p-2">
              {level.hints.slice(0, hintsShown).map((hint) => (
                <li key={hint} className="flex gap-1.5 text-xs text-amber-900">
                  <Lightbulb className="mt-px size-3.5 shrink-0" /> {hint}
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {hintsShown < level.hints.length && (
              <button onClick={() => setHintsShown(hintsShown + 1)} className="flex items-center gap-1 text-zinc-600 hover:text-ink">
                <Lightbulb className="size-3.5" /> {hintsShown === 0 ? "Show a hint" : "Another hint"}
              </button>
            )}
            <button
              onClick={() => {
                if (confirm("Clear your design for this level?")) onReset();
              }}
              className="flex items-center gap-1 text-zinc-600 hover:text-ink"
            >
              <RotateCcw className="size-3.5" /> Start over
            </button>
            {level.reference &&
              (bestStars > 0 ? (
                <a href={level.reference.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-azure hover:underline">
                  <BookOpen className="size-3.5" /> Compare with Microsoft's version
                </a>
              ) : (
                <span className="flex items-center gap-1 text-zinc-400" title="Unlocks after you clear the level">
                  <BookOpen className="size-3.5" /> Reference unlocks after clearing
                </span>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

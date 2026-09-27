"use client";

import { BookOpen, Lock, Pencil, Star, X } from "lucide-react";
import { CHAPTERS, LEVELS } from "@/lib/levels";
import { isUnlocked, rankFor, totalXp, type Progress } from "@/lib/progress";

export function Stars({ count, size = "size-4" }: { count: number; size?: string }) {
  return (
    <span className="flex gap-0.5">
      {[0, 1, 2].map((i) => (
        <Star key={i} className={`${size} ${i < count ? "fill-amber-400 text-amber-400" : "text-zinc-300"}`} />
      ))}
    </span>
  );
}

export function RankBadge({ progress }: { progress: Progress }) {
  const xp = totalXp(progress);
  const rank = rankFor(xp);
  const pct = rank.next ? ((xp - rank.xp) / (rank.next.xp - rank.xp)) * 100 : 100;
  return (
    <div className="min-w-48">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-semibold">{rank.title}</span>
        <span className="text-xs text-zinc-500">
          {xp} XP{rank.next && ` · ${rank.next.xp - xp} to ${rank.next.title}`}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100">
        <div className="h-full rounded-full bg-amber-400 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

type Props = {
  progress: Progress;
  currentLevelId: string | null;
  onPlay: (levelId: string) => void;
  onFreePlay: () => void;
  onClose: (() => void) | null;
};

export function LevelSelect({ progress, currentLevelId, onPlay, onFreePlay, onClose }: Props) {
  const earned = Object.values(progress.stars).reduce((a, b) => a + b, 0);

  return (
    <div className="absolute inset-0 z-40 overflow-y-auto bg-canvas/95 backdrop-blur-sm">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">System design levels</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Build the architecture, press Run to test it, and earn up to 3 stars per level. {earned}/{LEVELS.length * 3} stars.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <RankBadge progress={progress} />
            {onClose && (
              <button onClick={onClose} title="Close" className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-200 hover:text-ink">
                <X className="size-5" />
              </button>
            )}
          </div>
        </header>

        <button
          onClick={onFreePlay}
          className="mt-6 flex w-full items-center gap-3 rounded-xl border border-dashed border-zinc-300 bg-white/60 p-4 text-left hover:border-zinc-400 hover:bg-white"
        >
          <Pencil className="size-5 text-zinc-500" />
          <div>
            <div className="text-sm font-semibold">Free play</div>
            <div className="text-xs text-zinc-500">Open whiteboard with the 1M-user web app scenario. No objectives, no stars.</div>
          </div>
        </button>

        {CHAPTERS.map((chapter) => {
          const levels = LEVELS.filter((l) => l.chapter === chapter.number);
          return (
            <section key={chapter.number} className="mt-8">
              <div className="flex items-baseline gap-3">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Chapter {chapter.number}</h2>
                <span className="text-sm font-semibold">{chapter.title}</span>
                <span className="text-xs text-zinc-400">{chapter.blurb}</span>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {levels.map((level) => {
                  const number = LEVELS.indexOf(level) + 1;
                  const unlocked = isUnlocked(progress, level.id);
                  const stars = progress.stars[level.id] ?? 0;
                  const current = level.id === currentLevelId;
                  return (
                    <button
                      key={level.id}
                      disabled={!unlocked}
                      onClick={() => onPlay(level.id)}
                      className={`flex flex-col rounded-xl border bg-white p-4 text-left shadow-sm transition enabled:hover:-translate-y-0.5 enabled:hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 ${
                        current ? "border-ink ring-1 ring-ink" : "border-line"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-zinc-400">Level {number}</span>
                        {unlocked ? <Stars count={stars} /> : <Lock className="size-4 text-zinc-400" />}
                      </div>
                      <div className="mt-1 font-semibold">{level.title}</div>
                      <p className="mt-1 line-clamp-3 text-xs text-zinc-500">{level.brief}</p>
                      <div className="mt-auto flex items-center justify-between pt-3 text-[11px] text-zinc-400">
                        <span>{level.scenario.dailyActiveUsers.toLocaleString("en-US")} daily users</span>
                        {level.reference && (
                          <span className="flex items-center gap-1 text-azure">
                            <BookOpen className="size-3" /> Azure reference
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

"use client";

import { BookOpen, Lock, Pencil, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress as ProgressBar } from "@/components/ui/progress";
import { CHAPTERS, LEVELS } from "@/lib/levels";
import { isUnlocked, rankFor, totalXp, type Progress } from "@/lib/progress";

export function Stars({ count, size = "size-4" }: { count: number; size?: string }) {
  return (
    <span className="flex gap-0.5">
      {[0, 1, 2].map((i) => (
        <Star key={i} className={`${size} ${i < count ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`} />
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
        <span className="text-xs text-muted-foreground">
          {xp} XP{rank.next && ` · ${rank.next.xp - xp} to ${rank.next.title}`}
        </span>
      </div>
      <ProgressBar value={pct} className="mt-1.5 h-1.5 *:data-[slot=progress-indicator]:bg-amber-400" />
    </div>
  );
}

type Props = {
  progress: Progress;
  currentLevelId: string | null;
  onPlay: (levelId: string) => void;
  onFreePlay: () => void;
};

export function LevelSelect({ progress, currentLevelId, onPlay, onFreePlay }: Props) {
  const earned = Object.values(progress.stars).reduce((a, b) => a + b, 0);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">System design levels</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Build the architecture, press Run to test it, and earn up to 3 stars per level. {earned}/{LEVELS.length * 3} stars.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <RankBadge progress={progress} />
          </div>
        </header>

        <div className="mt-6 grid gap-3">
          <button
            onClick={onFreePlay}
            className="flex items-center gap-3 rounded-xl border border-dashed bg-card p-4 text-left transition-colors hover:bg-accent"
          >
            <Pencil className="size-5 shrink-0 text-muted-foreground" />
            <div>
              <div className="text-sm font-semibold">Free play</div>
              <div className="text-xs text-muted-foreground">Open whiteboard with the 1M-user web app scenario. No objectives, no stars.</div>
            </div>
          </button>
        </div>

        {CHAPTERS.map((chapter) => {
          const levels = LEVELS.filter((l) => l.chapter === chapter.number);
          return (
            <section key={chapter.number} className="mt-8">
              <div className="flex items-baseline gap-3">
                <Badge variant="secondary">Chapter {chapter.number}</Badge>
                <span className="text-sm font-semibold">{chapter.title}</span>
                <span className="text-xs text-muted-foreground">{chapter.blurb}</span>
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
                      className={`flex flex-col rounded-xl border bg-card p-4 text-left text-card-foreground shadow-xs transition enabled:hover:bg-accent/50 disabled:cursor-not-allowed disabled:opacity-50 ${
                        current ? "border-primary ring-1 ring-primary" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">Level {number}</span>
                        {unlocked ? <Stars count={stars} /> : <Lock className="size-4 text-muted-foreground" />}
                      </div>
                      <div className="mt-1 font-semibold">{level.title}</div>
                      <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{level.brief}</p>
                      <div className="mt-auto flex items-center justify-between pt-3 text-[11px] text-muted-foreground">
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

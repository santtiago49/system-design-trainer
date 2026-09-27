import { LEVELS } from "./levels";

export type Progress = { stars: Record<string, number> };

const KEY = "sdt:progress";
export const XP_PER_STAR = 100;

export const RANKS = [
  { title: "Intern", xp: 0 },
  { title: "Junior Engineer", xp: 300 },
  { title: "Engineer", xp: 900 },
  { title: "Senior Engineer", xp: 1_500 },
  { title: "Staff Engineer", xp: 2_100 },
  { title: "Principal Engineer", xp: 2_700 },
];

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Progress;
  } catch {}
  return { stars: {} };
}

export function saveProgress(progress: Progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(progress));
  } catch {}
}

export function totalXp(progress: Progress): number {
  return Object.values(progress.stars).reduce((sum, stars) => sum + stars * XP_PER_STAR, 0);
}

export function rankFor(xp: number) {
  const index = RANKS.findLastIndex((r) => xp >= r.xp);
  return { ...RANKS[index], next: RANKS[index + 1] ?? null };
}

/**
 * A level unlocks once the previous level in its track has at least one star.
 * Chapters 1–3 are one track; the Azure Architecture Center chapter is its own,
 * so it's playable from the start.
 */
export function isUnlocked(progress: Progress, levelId: string): boolean {
  const level = LEVELS.find((l) => l.id === levelId);
  if (!level) return false;
  const track = LEVELS.filter((l) => (l.chapter === 4) === (level.chapter === 4));
  const index = track.indexOf(level);
  return index <= 0 || (progress.stars[track[index - 1].id] ?? 0) > 0;
}

/** Records a result, keeping the best star count. Returns the XP gained. */
export function recordStars(progress: Progress, levelId: string, stars: number): { progress: Progress; xpGained: number } {
  const best = progress.stars[levelId] ?? 0;
  if (stars <= best) return { progress, xpGained: 0 };
  return { progress: { stars: { ...progress.stars, [levelId]: stars } }, xpGained: (stars - best) * XP_PER_STAR };
}

// Spaced-repetition scheduler — port of back/bots/services/srs.py (pure SM-2).

export type Rating = "again" | "hard" | "good" | "easy";

export const RATINGS: Rating[] = ["again", "hard", "good", "easy"];
export const MIN_EASE = 1.3;
export const DEFAULT_EASE = 2.5;
const FIRST_INTERVAL_DAYS = 1;
const SECOND_INTERVAL_DAYS = 6;
const LAPSE_INTERVAL_DAYS = 1 / 6; // ~4h
const EASE_DELTA: Record<Rating, number> = { again: -0.2, hard: -0.15, good: 0, easy: 0.15 };
const EASY_BONUS = 1.3;
const HARD_MULT = 1.2;

export interface Sm2Result {
  due_at: string;
  interval_days: number;
  ease: number;
  reps: number;
  lapses: number;
  last_reviewed_at: string;
}

export function isRating(v: unknown): v is Rating {
  return v === "again" || v === "hard" || v === "good" || v === "easy";
}

// Pure: computes the next scheduling state without saving (caller persists).
export function applySm2(
  card: { interval_days: number; ease: number; reps: number; lapses: number },
  rating: Rating,
  now: Date = new Date(),
): Sm2Result {
  let { interval_days: interval, ease, reps, lapses } = card;
  if (rating === "again") {
    reps = 0;
    lapses += 1;
    interval = LAPSE_INTERVAL_DAYS;
  } else if (rating === "hard") {
    interval = Math.max(1, interval * HARD_MULT);
  } else if (rating === "good") {
    interval = interval <= 0 ? FIRST_INTERVAL_DAYS : interval < SECOND_INTERVAL_DAYS ? SECOND_INTERVAL_DAYS : interval * ease;
  } else {
    // easy
    interval = interval <= 0 ? FIRST_INTERVAL_DAYS : interval < SECOND_INTERVAL_DAYS ? SECOND_INTERVAL_DAYS : interval * ease * EASY_BONUS;
  }
  ease = Math.max(MIN_EASE, ease + EASE_DELTA[rating]);
  if (rating !== "again") reps += 1;
  const due_at = new Date(now.getTime() + interval * 86400_000).toISOString();
  return { due_at, interval_days: interval, ease, reps, lapses, last_reviewed_at: now.toISOString() };
}

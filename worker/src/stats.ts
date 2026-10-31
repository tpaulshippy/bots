// Kid-visible stats — port of back/bots/services/stats.py.
//
// UTC-calendar-day activity: a day is active with >= 1 user message or review.
// Streaks anchor the current run to today, else yesterday (Django parity).

interface DayBucket {
  date: string;
  messages: number;
  reviews: number;
}

export interface ProfileStats {
  profile_id: string;
  name: string;
  current_streak: number;
  longest_streak: number;
  total_chats: number;
  total_messages: number;
  total_reviews: number;
  chatted_today: boolean;
  studied_today: boolean;
  week: DayBucket[];
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function activeDates(messageTimes: string[], reviewTimes: string[]): Set<string> {
  const s = new Set<string>();
  for (const t of [...messageTimes, ...reviewTimes]) s.add(dayKey(new Date(t)));
  return s;
}

function streaks(dates: Set<string>, todayKey: string, yesterdayKey: string): { current: number; longest: number } {
  const sorted = [...dates].sort();
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    if (prev && Date.parse(d) - Date.parse(prev) === 86400_000) run += 1;
    else run = 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  let current = 0;
  if (dates.has(todayKey) || dates.has(yesterdayKey)) {
    let cursor = dates.has(todayKey) ? todayKey : yesterdayKey;
    while (dates.has(cursor)) {
      current += 1;
      cursor = dayKey(new Date(Date.parse(cursor) - 86400_000));
    }
  }
  return { current, longest };
}

export async function getProfileStats(db: D1Database, profileId: number): Promise<ProfileStats | null> {
  const profile = await db.prepare("SELECT profile_id, name FROM bots_profile WHERE id = ?").bind(profileId).first<{
    profile_id: string;
    name: string;
  }>();
  if (!profile) return null;

  const msgRows = (
    await db
      .prepare(
        `SELECT m.created_at AS t FROM bots_message m JOIN bots_chat c ON c.id = m.chat_id
         WHERE c.profile_id = ? AND m.role = 'user' ORDER BY m.created_at`,
      )
      .bind(profileId)
      .all<{ t: string }>()
  ).results.map((r) => r.t);

  const chatRows = (
    await db
      .prepare(
        `SELECT DISTINCT c.id FROM bots_chat c JOIN bots_message m ON m.chat_id = c.id
         WHERE c.profile_id = ? AND m.role = 'user'`,
      )
      .bind(profileId)
      .all<{ id: number }>()
  ).results;

  const reviewRows = (
    await db
      .prepare("SELECT reviewed_at AS t FROM bots_flashcardreview WHERE profile_id = ? ORDER BY reviewed_at")
      .bind(profileId)
      .all<{ t: string }>()
  ).results.map((r) => r.t);

  const now = new Date();
  const today = dayKey(now);
  const yesterday = dayKey(new Date(now.getTime() - 86400_000));
  const dates = activeDates(msgRows, reviewRows);
  const { current, longest } = streaks(dates, today, yesterday);

  const msgByDay = new Map<string, number>();
  for (const t of msgRows) msgByDay.set(dayKey(new Date(t)), (msgByDay.get(dayKey(new Date(t))) ?? 0) + 1);
  const revByDay = new Map<string, number>();
  for (const t of reviewRows) revByDay.set(dayKey(new Date(t)), (revByDay.get(dayKey(new Date(t))) ?? 0) + 1);

  const week: DayBucket[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = dayKey(new Date(now.getTime() - i * 86400_000));
    week.push({ date: d, messages: msgByDay.get(d) ?? 0, reviews: revByDay.get(d) ?? 0 });
  }

  return {
    profile_id: profile.profile_id,
    name: profile.name,
    current_streak: current,
    longest_streak: longest,
    total_chats: chatRows.length,
    total_messages: msgRows.length,
    total_reviews: reviewRows.length,
    chatted_today: (msgByDay.get(today) ?? 0) > 0,
    studied_today: (revByDay.get(today) ?? 0) > 0,
    week,
  };
}

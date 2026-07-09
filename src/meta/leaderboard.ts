export interface LeaderboardEntry {
  rank: number;
  name: string;
  score: number;
  timeSec?: number;
}

const MOCK_NAMES = ['RycerzPL', 'ZamekMaster', 'Katapulta99', 'Murarz', 'Strzelec', 'Ty'];

export function getWeeklyLeaderboard(playerScore: number, playerName = 'Ty'): LeaderboardEntry[] {
  const entries: LeaderboardEntry[] = MOCK_NAMES.map((name, i) => ({
    rank: 0,
    name,
    score: 1200 - i * 140 + (name === 'Ty' ? 0 : Math.floor(Math.random() * 80)),
  }));
  entries.push({ rank: 0, name: playerName, score: playerScore });
  entries.sort((a, b) => b.score - a.score);
  return entries.map((e, i) => ({ ...e, rank: i + 1 })).slice(0, 10);
}

export function getDailyLeaderboard(playerScore: number, playerName = 'Ty'): LeaderboardEntry[] {
  return getWeeklyLeaderboard(playerScore + 200, playerName).map((e) => ({
    ...e,
    score: Math.round(e.score * 0.6),
  }));
}

/** Gotowe pod Supabase — na razie zapis lokalny najlepszych wyników tygodnia */
const WEEKLY_KEY = 'armata-weekly-best';

export function saveWeeklyBest(score: number): void {
  try {
    const prev = Number(localStorage.getItem(WEEKLY_KEY) ?? 0);
    if (score > prev) localStorage.setItem(WEEKLY_KEY, String(score));
  } catch {
    /* ignore */
  }
}

export function loadWeeklyBest(): number {
  try {
    return Number(localStorage.getItem(WEEKLY_KEY) ?? 0);
  } catch {
    return 0;
  }
}

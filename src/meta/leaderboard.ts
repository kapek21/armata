export interface LeaderboardEntry {
  rank: number;
  name: string;
  score: number;
  timeSec?: number;
}

interface WeeklyBoardState {
  weekId: string;
  playerBest: number;
  /** Zamrożone wyniki NPC na tydzień (bez reshuffle). */
  npc: { name: string; score: number }[];
}

const MOCK_NAMES = ['RycerzPL', 'ZamekMaster', 'Katapulta99', 'Murarz', 'Strzelec', 'Oblężenie'];
const WEEKLY_BOARD_KEY = 'armata-weekly-board-v1';
/** Legacy single-score key — migracja przy pierwszym odczycie. */
const WEEKLY_BEST_LEGACY = 'armata-weekly-best';

/** Id tygodnia ISO (UTC), np. 2026-W29. */
export function currentWeekId(date = new Date()): string {
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashWeek(weekId: string): number {
  let h = 2166136261;
  for (let i = 0; i < weekId.length; i++) {
    h ^= weekId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function buildNpc(weekId: string): { name: string; score: number }[] {
  const rng = mulberry32(hashWeek(weekId) ^ 0x41a7);
  return MOCK_NAMES.map((name, i) => ({
    name,
    score: Math.max(0, 1400 - i * 155 + Math.floor(rng() * 90)),
  }));
}

function readLegacyBest(): number {
  try {
    return Math.max(0, Number(localStorage.getItem(WEEKLY_BEST_LEGACY) ?? 0) || 0);
  } catch {
    return 0;
  }
}

function loadBoardRaw(): WeeklyBoardState | null {
  try {
    const raw = localStorage.getItem(WEEKLY_BOARD_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WeeklyBoardState>;
    if (!parsed.weekId || !Array.isArray(parsed.npc)) return null;
    return {
      weekId: parsed.weekId,
      playerBest: Math.max(0, Math.floor(parsed.playerBest ?? 0)),
      npc: parsed.npc
        .filter((e) => e && typeof e.name === 'string' && typeof e.score === 'number')
        .map((e) => ({ name: e.name, score: Math.max(0, Math.floor(e.score)) })),
    };
  } catch {
    return null;
  }
}

function saveBoard(board: WeeklyBoardState): void {
  try {
    localStorage.setItem(WEEKLY_BOARD_KEY, JSON.stringify(board));
    localStorage.setItem(WEEKLY_BEST_LEGACY, String(board.playerBest));
  } catch {
    /* ignore */
  }
}

/** Aktualna tablica tygodnia — reset przy zmianie weekId. */
export function ensureWeeklyBoard(): WeeklyBoardState {
  const weekId = currentWeekId();
  const existing = loadBoardRaw();
  if (existing && existing.weekId === weekId && existing.npc.length > 0) {
    return existing;
  }
  const board: WeeklyBoardState = {
    weekId,
    playerBest: 0,
    npc: buildNpc(weekId),
  };
  // Pierwszy start: przenieś legacy best (bez weekId) do bieżącego tygodnia.
  if (!existing) {
    board.playerBest = readLegacyBest();
  }
  saveBoard(board);
  return board;
}

/**
 * Ranking tygodnia: NPC zamrożone na ISO-week + wynik gracza.
 * Backend-ready: ten sam kształt da się podmienić na Supabase.
 */
export function getWeeklyLeaderboard(playerScore: number, playerName = 'Ty'): LeaderboardEntry[] {
  const board = ensureWeeklyBoard();
  const score = Math.max(0, Math.floor(Math.max(playerScore, board.playerBest)));

  const entries: LeaderboardEntry[] = [
    ...board.npc.map((e) => ({ rank: 0, name: e.name, score: e.score })),
    { rank: 0, name: playerName, score },
  ];
  entries.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'pl'));
  return entries.map((e, i) => ({ ...e, rank: i + 1 })).slice(0, 10);
}

export function getDailyLeaderboard(playerScore: number, playerName = 'Ty'): LeaderboardEntry[] {
  return getWeeklyLeaderboard(playerScore, playerName).map((e) => ({
    ...e,
    score: Math.round(e.score * 0.6),
  }));
}

/** Zapis najlepszego wyniku w bieżącym tygodniu. */
export function saveWeeklyBest(score: number): void {
  const board = ensureWeeklyBoard();
  const next = Math.max(0, Math.floor(score));
  if (next > board.playerBest) {
    board.playerBest = next;
    saveBoard(board);
  }
}

export function loadWeeklyBest(): number {
  return ensureWeeklyBoard().playerBest;
}

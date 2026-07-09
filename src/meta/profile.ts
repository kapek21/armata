const KEY = 'armata-profile-v2';

import type { PowerupType } from '../core/types.js';
import { defaultEconomy } from './economy.js';

export const AIM_HINT_SHOTS = 3;

export interface LevelResult {
  stars: number;
  bestShots: number;
  bestTimeSec: number;
  bestScore: number;
}

export interface Profile {
  unlockedLevels: number;
  levels: Record<string, LevelResult>;
  aimHintsRemaining?: number;
  coins: number;
  powerups: Record<PowerupType, number>;
  adsRemoved: boolean;
  winStreak: number;
}

function defaultProfile(): Profile {
  const eco = defaultEconomy();
  return {
    unlockedLevels: 1,
    levels: {},
    aimHintsRemaining: AIM_HINT_SHOTS,
    coins: eco.coins,
    powerups: { ...eco.powerups },
    adsRemoved: false,
    winStreak: 0,
  };
}

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultProfile();
    const parsed = JSON.parse(raw) as Partial<Profile>;
    const levels = parsed.levels ?? {};
    const playedBefore = Object.keys(levels).length > 0;
    const eco = defaultEconomy();
    return {
      unlockedLevels: Math.max(1, parsed.unlockedLevels ?? 1),
      levels: migrateLevelResults(levels),
      aimHintsRemaining:
        parsed.aimHintsRemaining ?? (playedBefore ? 0 : AIM_HINT_SHOTS),
      coins: parsed.coins ?? eco.coins,
      powerups: { ...eco.powerups, ...parsed.powerups },
      adsRemoved: parsed.adsRemoved ?? false,
      winStreak: parsed.winStreak ?? 0,
    };
  } catch {
    return defaultProfile();
  }
}

function migrateLevelResults(
  levels: Record<string, Partial<LevelResult>>,
): Record<string, LevelResult> {
  const out: Record<string, LevelResult> = {};
  for (const [id, r] of Object.entries(levels)) {
    out[id] = {
      stars: r.stars ?? 0,
      bestShots: r.bestShots ?? 99,
      bestTimeSec: r.bestTimeSec ?? 0,
      bestScore: r.bestScore ?? 0,
    };
  }
  return out;
}

export function saveProfile(profile: Profile): void {
  localStorage.setItem(KEY, JSON.stringify(profile));
}

export function applyLevelWin(
  profile: Profile,
  levelId: string,
  stars: number,
  shots: number,
  timeLeftSec: number,
  score: number,
): Profile {
  const prev = profile.levels[levelId];
  const bestShots = prev ? Math.min(prev.bestShots, shots) : shots;
  const bestStars = prev ? Math.max(prev.stars, stars) : stars;
  const bestTimeSec = prev ? Math.max(prev.bestTimeSec, timeLeftSec) : timeLeftSec;
  const bestScore = prev ? Math.max(prev.bestScore, score) : score;
  return {
    ...profile,
    winStreak: profile.winStreak + 1,
    levels: {
      ...profile.levels,
      [levelId]: { stars: bestStars, bestShots, bestTimeSec, bestScore },
    },
  };
}

export function applyLevelLoss(profile: Profile): Profile {
  return { ...profile, winStreak: 0 };
}

export function unlockNextLevel(
  profile: Profile,
  levelIndex: number,
  totalLevels: number,
): Profile {
  if (levelIndex + 1 >= totalLevels) return profile;
  return {
    ...profile,
    unlockedLevels: Math.max(profile.unlockedLevels, levelIndex + 2),
  };
}

export function starsForShots(used: number, thresholds: [number, number, number]): number {
  if (used <= thresholds[0]) return 3;
  if (used <= thresholds[1]) return 2;
  if (used <= thresholds[2]) return 1;
  return 0;
}

export function shouldShowAimHint(profile: Profile): boolean {
  return (profile.aimHintsRemaining ?? 0) > 0;
}

export function consumeAimHint(profile: Profile): Profile {
  const left = profile.aimHintsRemaining ?? 0;
  if (left <= 0) return profile;
  return { ...profile, aimHintsRemaining: left - 1 };
}

export function consumePowerup(profile: Profile, type: PowerupType): Profile {
  const n = profile.powerups[type] ?? 0;
  if (n <= 0) return profile;
  return {
    ...profile,
    powerups: { ...profile.powerups, [type]: n - 1 },
  };
}

export function addCoins(profile: Profile, amount: number): Profile {
  return { ...profile, coins: profile.coins + amount };
}

export function spendCoins(profile: Profile, amount: number): Profile | null {
  if (profile.coins < amount) return null;
  return { ...profile, coins: profile.coins - amount };
}

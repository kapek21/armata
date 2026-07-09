const KEY = 'armata-profile-v1';

export const AIM_HINT_SHOTS = 3;

export interface LevelResult {
  stars: number;
  bestShots: number;
}

export interface Profile {
  unlockedLevels: number;
  levels: Record<string, LevelResult>;
  aimHintsRemaining?: number;
}

function defaultProfile(): Profile {
  return { unlockedLevels: 1, levels: {}, aimHintsRemaining: AIM_HINT_SHOTS };
}

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultProfile();
    const parsed = JSON.parse(raw) as Profile;
    const levels = parsed.levels ?? {};
    const playedBefore = Object.keys(levels).length > 0;
    return {
      unlockedLevels: Math.max(1, parsed.unlockedLevels ?? 1),
      levels,
      aimHintsRemaining:
        parsed.aimHintsRemaining ?? (playedBefore ? 0 : AIM_HINT_SHOTS),
    };
  } catch {
    return defaultProfile();
  }
}

export function saveProfile(profile: Profile): void {
  localStorage.setItem(KEY, JSON.stringify(profile));
}

export function applyLevelWin(profile: Profile, levelId: string, stars: number, shots: number): Profile {
  const prev = profile.levels[levelId];
  const bestShots = prev ? Math.min(prev.bestShots, shots) : shots;
  const bestStars = prev ? Math.max(prev.stars, stars) : stars;
  const next: Profile = {
    unlockedLevels: Math.max(profile.unlockedLevels, 0),
    levels: { ...profile.levels, [levelId]: { stars: bestStars, bestShots } },
  };
  return next;
}

export function unlockNextLevel(profile: Profile, levelIndex: number, totalLevels: number): Profile {
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

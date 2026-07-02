const KEY = 'armata-profile-v1';

export interface LevelResult {
  stars: number;
  bestShots: number;
}

export interface Profile {
  unlockedLevels: number;
  levels: Record<string, LevelResult>;
}

function defaultProfile(): Profile {
  return { unlockedLevels: 1, levels: {} };
}

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultProfile();
    const parsed = JSON.parse(raw) as Profile;
    return {
      unlockedLevels: Math.max(1, parsed.unlockedLevels ?? 1),
      levels: parsed.levels ?? {},
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

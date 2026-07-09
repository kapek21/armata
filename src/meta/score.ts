import type { LevelDefinition } from '../core/types.js';

export const KEYSTONE_HIT_POINTS = 500;
export const KEYSTONE_DESTROY_BONUS = 1000;
export const SECONDARY_DESTROY_POINTS = 50;

export function ballHitDamage(power: number, heavy = false): number {
  const base = 25 + power * 45;
  return heavy ? base * 1.5 : base;
}

export function computeRunScore(params: {
  keystoneHits: number;
  keystoneDestroyed: boolean;
  secondaryDestroyed: number;
  timeLeftSec: number;
  shotsUsed: number;
  usedPowerup: boolean;
}): number {
  let score = params.keystoneHits * KEYSTONE_HIT_POINTS;
  if (params.keystoneDestroyed) score += KEYSTONE_DESTROY_BONUS;
  score += params.secondaryDestroyed * SECONDARY_DESTROY_POINTS;
  score += Math.round(params.timeLeftSec * 12);
  score += Math.max(0, 120 - params.shotsUsed * 18);
  if (!params.usedPowerup) score = Math.round(score * 1.1);
  return Math.max(0, score);
}

export function starsForTime(
  timeLeftSec: number,
  thresholds: [number, number, number],
): number {
  if (timeLeftSec >= thresholds[0]) return 3;
  if (timeLeftSec >= thresholds[1]) return 2;
  if (timeLeftSec >= thresholds[2]) return 1;
  return 0;
}

export function starsForScore(
  score: number,
  thresholds: [number, number, number],
): number {
  if (score >= thresholds[0]) return 3;
  if (score >= thresholds[1]) return 2;
  if (score >= thresholds[2]) return 1;
  return 0;
}

export function hybridStars(
  timeLeftSec: number,
  shotsUsed: number,
  score: number,
  level: LevelDefinition,
): number {
  const t = starsForTime(timeLeftSec, level.starTimeSec);
  const s = starsForShotsLocal(shotsUsed, level.starShots);
  const p = starsForScore(score, level.starScore);
  return Math.min(t, s, p);
}

function starsForShotsLocal(
  used: number,
  thresholds: [number, number, number],
): number {
  if (used <= thresholds[0]) return 3;
  if (used <= thresholds[1]) return 2;
  if (used <= thresholds[2]) return 1;
  return 0;
}

export function defaultLevelTiming(chapter: number): {
  timeLimitSec: number;
  starTimeSec: [number, number, number];
  starScore: [number, number, number];
  ammoLimit: number;
  starShots: [number, number, number];
} {
  const timeLimitSec = Math.max(40, 120 - chapter * 14);
  const starTimeSec: [number, number, number] = [
    Math.round(timeLimitSec * 0.55),
    Math.round(timeLimitSec * 0.38),
    Math.round(timeLimitSec * 0.22),
  ];
  const ammoLimit = Math.max(2, 6 - Math.floor(chapter / 2));
  const starShots: [number, number, number] = [
    Math.max(1, ammoLimit - 2),
    Math.max(1, ammoLimit - 1),
    ammoLimit,
  ];
  const base = 400 + chapter * 120;
  const starScore: [number, number, number] = [
    base + 400,
    base + 200,
    base,
  ];
  return { timeLimitSec, starTimeSec, starScore, ammoLimit, starShots };
}

import type { LevelDefinition } from '../core/types.js';
import { allLevels } from '../levels/index.js';

/** Cała kampania — jedna rozgrywka trwa 3 minuty. */
export const CAMPAIGN_TIME_SEC = 180;

let cachedWeight = 0;

function totalLevelTimeWeight(): number {
  if (cachedWeight > 0) return cachedWeight;
  cachedWeight = allLevels().reduce((sum, lvl) => sum + lvl.timeLimitSec, 0);
  return cachedWeight;
}

/** Udział poziomu w globalnym zegarze kampanii (proporcjonalnie do trudności). */
export function levelCampaignBudgetSec(level: LevelDefinition): number {
  const weight = totalLevelTimeWeight();
  if (weight <= 0) return CAMPAIGN_TIME_SEC;
  return Math.max(2, Math.round((CAMPAIGN_TIME_SEC * level.timeLimitSec) / weight));
}

export function levelCampaignStarTimeSec(level: LevelDefinition): [number, number, number] {
  const budget = levelCampaignBudgetSec(level);
  return [
    Math.round(budget * 0.55),
    Math.round(budget * 0.38),
    Math.round(budget * 0.22),
  ];
}

/** Limit czasu całej kampanii (HUD „Kampania”). */
export function totalCampaignTimeSec(): number {
  return CAMPAIGN_TIME_SEC;
}

/** Budżet czasu od danego poziomu do końca (start z menu w środku kampanii). */
export function campaignTimeBudgetFromLevel(levelIndex: number): number {
  return allLevels()
    .slice(Math.max(0, levelIndex))
    .reduce((sum, lvl) => sum + levelCampaignBudgetSec(lvl), 0);
}

export function clampCampaignTimeLeftSec(sec: number | undefined | null): number | undefined {
  if (sec == null) return undefined;
  return Math.max(0, Math.min(sec, CAMPAIGN_TIME_SEC));
}

export function formatCampaignClock(sec: number): string {
  const total = Math.max(0, Math.ceil(sec));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

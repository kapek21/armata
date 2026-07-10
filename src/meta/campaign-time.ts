import { allLevels } from '../levels/index.js';

/** Suma limitów czasu wszystkich poziomów — jeden zegar na całą kampanię. */
export function totalCampaignTimeSec(): number {
  return allLevels().reduce((sum, lvl) => sum + lvl.timeLimitSec, 0);
}

/** Budżet czasu od danego poziomu do końca (start z menu w środku kampanii). */
export function campaignTimeBudgetFromLevel(levelIndex: number): number {
  return allLevels()
    .slice(Math.max(0, levelIndex))
    .reduce((sum, lvl) => sum + lvl.timeLimitSec, 0);
}

export function formatCampaignClock(sec: number): string {
  const total = Math.max(0, Math.ceil(sec));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

import type { PowerupType } from '../core/types.js';
import { powerupRewardsForWin } from './economy.js';
import type { Profile } from './profile.js';
import { addCoins, applyLevelLoss, grantPowerup } from './profile.js';
import { RUN_TARGET_COUNT } from './run-state.js';

export function coinsForRun(runScore: number, targetsCleared: number): number {
  return Math.floor(runScore / 150) + targetsCleared * 25;
}

export function powerupsForRun(targetsCleared: number, runScore: number): PowerupType[] {
  if (targetsCleared >= RUN_TARGET_COUNT || runScore >= 8000) return powerupRewardsForWin(3);
  if (targetsCleared >= 2) return powerupRewardsForWin(2);
  return [];
}

export function applyRunResult(
  profile: Profile,
  runScore: number,
  targetsCleared: number,
  won: boolean,
): { profile: Profile; coins: number; powerups: PowerupType[] } {
  let next = profile;
  const coins = coinsForRun(runScore, targetsCleared);
  const rewards = powerupsForRun(targetsCleared, runScore);

  next = addCoins(next, coins);
  for (const type of rewards) {
    next = grantPowerup(next, type);
  }

  const bestRunScore = Math.max(next.bestRunScore ?? 0, runScore);
  next = {
    ...next,
    bestRunScore,
    lastRunScore: runScore,
    runsPlayed: (next.runsPlayed ?? 0) + 1,
    winStreak: won ? next.winStreak + 1 : 0,
  };

  if (!won) {
    next = applyLevelLoss(next);
  }

  return { profile: next, coins, powerups: rewards };
}

export function runEndMessage(
  won: boolean,
  runScore: number,
  targetsCleared: number,
  coins: number,
  powerups: PowerupType[],
): string {
  if (won) {
    const bonus =
      powerups.length > 0 ? ` +${powerups.join(', ')}` : '';
    return `Run ukończony! ${runScore} pkt · +${coins} 🪙${bonus}`;
  }
  if (targetsCleared > 0) {
    return `Czas minął — ${targetsCleared}/${RUN_TARGET_COUNT} celów · ${runScore} pkt · +${coins} 🪙`;
  }
  return 'Czas minął — spróbuj ponownie';
}

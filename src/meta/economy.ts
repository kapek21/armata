import type { PowerupType } from '../core/types.js';

export const COIN_WIN_BASE = 25;
export const COIN_STAR_BONUS = 15;
export const POWERUP_COST: Record<PowerupType, number> = {
  heavy: 80,
  explosive: 100,
  trajectory: 60,
};
export const NO_ADS_COST = 500;

export interface EconomyState {
  coins: number;
  powerups: Record<PowerupType, number>;
  adsRemoved: boolean;
}

export const POWERUP_TYPES: PowerupType[] = ['heavy', 'explosive', 'trajectory'];

/** Zapas startowy — każdy gracz dostaje po jednym z każdego typu. */
export const STARTER_POWERUPS: Record<PowerupType, number> = {
  heavy: 1,
  explosive: 1,
  trajectory: 1,
};

/** Gdy zapis ma pusty ekwipunek — jednorazowy refill. */
export const EMPTY_INVENTORY_REFILL: Record<PowerupType, number> = {
  heavy: 1,
  explosive: 0,
  trajectory: 1,
};

export function defaultEconomy(): EconomyState {
  return { coins: 100, powerups: { ...STARTER_POWERUPS }, adsRemoved: false };
}

export function powerupTotal(powerups: Record<PowerupType, number>): number {
  return POWERUP_TYPES.reduce((sum, type) => sum + Math.max(0, powerups[type] ?? 0), 0);
}

export function coinsForWin(stars: number, score: number): number {
  return COIN_WIN_BASE + stars * COIN_STAR_BONUS + Math.floor(score / 200);
}

export function canAfford(coins: number, cost: number): boolean {
  return coins >= cost;
}

/** Nagroda za wygraną: 2★ = 1 losowy, 3★ = +1 dodatkowy (inny typ jeśli możliwe). */
export function powerupRewardsForWin(stars: number): PowerupType[] {
  if (stars < 2) return [];
  const first = pickPowerupReward(stars);
  if (stars < 3) return [first];
  let second = pickPowerupReward(stars);
  if (second === first) {
    const alt = POWERUP_TYPES.find((t) => t !== first);
    if (alt) second = alt;
  }
  return [first, second];
}

function pickPowerupReward(stars: number): PowerupType {
  const roll = Math.random();
  if (stars >= 3 && roll < 0.28) return 'explosive';
  if (roll < 0.58) return 'trajectory';
  return 'heavy';
}

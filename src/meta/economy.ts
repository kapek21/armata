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

export function defaultEconomy(): EconomyState {
  return { coins: 100, powerups: { heavy: 1, explosive: 0, trajectory: 1 }, adsRemoved: false };
}

export function coinsForWin(stars: number, score: number): number {
  return COIN_WIN_BASE + stars * COIN_STAR_BONUS + Math.floor(score / 200);
}

export function canAfford(coins: number, cost: number): boolean {
  return coins >= cost;
}

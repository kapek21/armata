import type { RunTargetDefinition } from '../core/types.js';
import { CAMPAIGN_TIME_SEC } from './campaign-time.js';

export const RUN_TARGET_COUNT = 10;
export const VARIANTS_PER_DIFFICULTY = 10;

export interface RunState {
  timeLeftSec: number;
  runScore: number;
  currentDifficulty: number;
  variantByDifficulty: number[];
  targetsCleared: number;
  seed: number;
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

export function pickVariants(seed?: number): number[] {
  const rng = mulberry32(seed ?? (Date.now() & 0x7fffffff));
  return Array.from({ length: RUN_TARGET_COUNT }, () => 1 + Math.floor(rng() * VARIANTS_PER_DIFFICULTY));
}

export function createNewRun(seed?: number): RunState {
  const resolvedSeed = seed ?? (Date.now() & 0x7fffffff);
  return {
    timeLeftSec: CAMPAIGN_TIME_SEC,
    runScore: 0,
    currentDifficulty: 1,
    variantByDifficulty: pickVariants(resolvedSeed),
    targetsCleared: 0,
    seed: resolvedSeed,
  };
}

export function variantForDifficulty(state: RunState, difficulty: number): number {
  return state.variantByDifficulty[difficulty - 1] ?? 1;
}

export function advanceAfterClear(state: RunState): RunState {
  return {
    ...state,
    targetsCleared: state.targetsCleared + 1,
    currentDifficulty: Math.min(RUN_TARGET_COUNT, state.currentDifficulty + 1),
  };
}

export function isRunComplete(state: RunState): boolean {
  return state.targetsCleared >= RUN_TARGET_COUNT;
}

export function isRunOver(state: RunState): boolean {
  return state.timeLeftSec <= 0;
}

export function runTargetIndex(state: RunState): number {
  return Math.min(RUN_TARGET_COUNT, state.targetsCleared + 1);
}

export function getClearReward(level: RunTargetDefinition): number {
  return level.clearReward ?? 350 + level.runDifficulty * 150;
}

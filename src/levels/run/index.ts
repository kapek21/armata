import type { RunTargetDefinition } from '../../core/types.js';
import { RUN_TARGET_COUNT, VARIANTS_PER_DIFFICULTY } from '../../meta/run-state.js';
import {
  allSiegeTargets,
  siegeRunTarget,
  siegeTargetCount,
} from '../siege/index.js';

/** Run korzysta z puli machin oblężniczych (tier 1–10 × 10 wariantów). */
export function allRunTargets(): RunTargetDefinition[] {
  return allSiegeTargets().filter((t) => (t.siegeTier ?? t.runDifficulty) <= RUN_TARGET_COUNT);
}

export function runTarget(difficulty: number, variant: number): RunTargetDefinition {
  return siegeRunTarget(difficulty, variant);
}

export function runTargetCount(): number {
  return siegeTargetCount();
}

export { RUN_TARGET_COUNT, VARIANTS_PER_DIFFICULTY };

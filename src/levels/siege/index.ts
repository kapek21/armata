import type { RunTargetDefinition } from '../../core/types.js';
import { normalizeLevel } from '../normalize.js';
import { VARIANTS_PER_DIFFICULTY } from '../../meta/run-state.js';

const SIEGE_TIER_MAX = 30;

const modules = import.meta.glob('./data/t*-v*.json', {
  eager: true,
  import: 'default',
}) as Record<string, RunTargetDefinition>;

const TARGETS: RunTargetDefinition[] = Object.entries(modules)
  .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
  .map(([, raw]) => normalizeLevel(raw) as RunTargetDefinition);

/** Klucz: siegeTier/runDifficulty + variant */
const byKey = new Map<string, RunTargetDefinition>();
for (const t of TARGETS) {
  const tier = t.siegeTier ?? t.runDifficulty;
  byKey.set(`${tier}-${t.variant}`, t);
}

export function allSiegeTargets(): RunTargetDefinition[] {
  return TARGETS;
}

/** Cel runu po tierze maszyny (1–30) × wariant (1–10). */
export function siegeRunTarget(tier: number, variant: number): RunTargetDefinition {
  return siegeTarget(tier, variant);
}

/** Pełna pula 1–30. */
export function siegeTarget(tier: number, variant: number): RunTargetDefinition {
  const t = Math.max(1, Math.min(SIEGE_TIER_MAX, tier));
  const v = Math.max(1, Math.min(VARIANTS_PER_DIFFICULTY, variant));
  return byKey.get(`${t}-${v}`) ?? TARGETS[0];
}

export function siegeTargetCount(): number {
  return TARGETS.length;
}

export { VARIANTS_PER_DIFFICULTY, SIEGE_TIER_MAX };

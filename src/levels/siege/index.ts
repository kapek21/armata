import type { RunTargetDefinition } from '../../core/types.js';
import { normalizeLevel } from '../normalize.js';
import { RUN_TARGET_COUNT, VARIANTS_PER_DIFFICULTY } from '../../meta/run-state.js';

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

/** Cel runu: trudność 1–10 mapuje się na siege tier 1–10. */
export function siegeRunTarget(difficulty: number, variant: number): RunTargetDefinition {
  const d = Math.max(1, Math.min(RUN_TARGET_COUNT, difficulty));
  const v = Math.max(1, Math.min(VARIANTS_PER_DIFFICULTY, variant));
  return byKey.get(`${d}-${v}`) ?? TARGETS[0];
}

/** Pełna pula 1–30 (rozszerzenie poza bieżący run). */
export function siegeTarget(tier: number, variant: number): RunTargetDefinition {
  const t = Math.max(1, Math.min(30, tier));
  const v = Math.max(1, Math.min(VARIANTS_PER_DIFFICULTY, variant));
  return byKey.get(`${t}-${v}`) ?? TARGETS[0];
}

export function siegeTargetCount(): number {
  return TARGETS.length;
}

export { RUN_TARGET_COUNT, VARIANTS_PER_DIFFICULTY };

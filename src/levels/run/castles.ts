import type { RunTargetDefinition } from '../../core/types.js';
import { normalizeLevel } from '../normalize.js';
import { VARIANTS_PER_DIFFICULTY } from '../../meta/run-state.js';

const modules = import.meta.glob('./data/d*-v*.json', {
  eager: true,
  import: 'default',
}) as Record<string, RunTargetDefinition>;

const TARGETS: RunTargetDefinition[] = Object.entries(modules)
  .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
  .map(([, raw]) => normalizeLevel(raw) as RunTargetDefinition);

const byKey = new Map<string, RunTargetDefinition>();
for (const t of TARGETS) {
  byKey.set(`${t.runDifficulty}-${t.variant}`, t);
}

/** Ile trudności zamków jest w puli run/data (d01–d10). */
export const CASTLE_DIFFICULTY_COUNT = 10;

export function allCastleRunTargets(): RunTargetDefinition[] {
  return TARGETS;
}

/** Zamek runowy: trudność 1–10 × wariant 1–10. */
export function castleRunTarget(difficulty: number, variant: number): RunTargetDefinition {
  const d = Math.max(1, Math.min(CASTLE_DIFFICULTY_COUNT, difficulty));
  const v = Math.max(1, Math.min(VARIANTS_PER_DIFFICULTY, variant));
  return byKey.get(`${d}-${v}`) ?? TARGETS[0];
}

export function castleRunTargetCount(): number {
  return TARGETS.length;
}

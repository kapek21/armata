import type { RunTargetDefinition } from '../../core/types.js';
import { normalizeLevel } from '../normalize.js';
import { RUN_TARGET_COUNT, VARIANTS_PER_DIFFICULTY } from '../../meta/run-state.js';

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

export function allRunTargets(): RunTargetDefinition[] {
  return TARGETS;
}

export function runTarget(difficulty: number, variant: number): RunTargetDefinition {
  const d = Math.max(1, Math.min(RUN_TARGET_COUNT, difficulty));
  const v = Math.max(1, Math.min(VARIANTS_PER_DIFFICULTY, variant));
  return byKey.get(`${d}-${v}`) ?? TARGETS[0];
}

export function runTargetCount(): number {
  return TARGETS.length;
}

export { RUN_TARGET_COUNT, VARIANTS_PER_DIFFICULTY };

import type { RunTargetDefinition } from '../../core/types.js';
import { RUN_TARGET_COUNT, VARIANTS_PER_DIFFICULTY } from '../../meta/run-state.js';
import { siegeTarget, allSiegeTargets } from '../siege/index.js';
import {
  CASTLE_DIFFICULTY_COUNT,
  castleRunTarget,
  allCastleRunTargets,
} from './castles.js';

export type RunSlotKind = 'siege' | 'castle';

export interface RunSlot {
  kind: RunSlotKind;
  /** Indeks celu w runie 1…RUN_TARGET_COUNT */
  runDifficulty: number;
  /**
   * Źródło w puli:
   * - siege → siegeTier (1–30)
   * - castle → runDifficulty zamku (1–10)
   */
  sourceDifficulty: number;
}

/**
 * Harmonogram 20 celów:
 * - baza: maszyny oblężnicze
 * - co 3. slot = zamek (3,6,9,12,15,18)
 * - reszta zamków (z puli 10) dopychana od końca runu
 * - każdy slot ma własny poziom trudności; wariant 1/10 losowany osobno
 */
export function buildRunSchedule(
  runCount = RUN_TARGET_COUNT,
  castlePool = CASTLE_DIFFICULTY_COUNT,
): RunSlot[] {
  const kinds: Array<RunSlotKind | null> = Array.from({ length: runCount }, () => null);

  // 1) co trzeci = zamek
  for (let i = 3; i <= runCount; i += 3) {
    kinds[i - 1] = 'castle';
  }

  let castlesPlaced = kinds.filter((k) => k === 'castle').length;
  let remaining = Math.max(0, castlePool - castlesPlaced);

  // 2) reszta zamków od końca (wolne sloty)
  for (let i = runCount; i >= 1 && remaining > 0; i--) {
    if (kinds[i - 1] == null) {
      kinds[i - 1] = 'castle';
      remaining -= 1;
      castlesPlaced += 1;
    }
  }

  // 3) reszta = maszyny oblężnicze
  for (let i = 0; i < runCount; i++) {
    if (kinds[i] == null) kinds[i] = 'siege';
  }

  let castleOrder = 0;
  const slots: RunSlot[] = [];

  for (let i = 0; i < runCount; i++) {
    const runDifficulty = i + 1;
    const kind = kinds[i] ?? 'siege';

    if (kind === 'castle') {
      castleOrder += 1;
      // Zamki rosną trudnością w kolejności pojawiania się (1…10).
      const sourceDifficulty = Math.min(castlePool, castleOrder);
      slots.push({ kind: 'castle', runDifficulty, sourceDifficulty });
    } else {
      // Maszyny: tier = numer slotu runu (skalowanie 1…20 w dostępnej puli 1–30).
      slots.push({ kind: 'siege', runDifficulty, sourceDifficulty: runDifficulty });
    }
  }

  return slots;
}

const RUN_SCHEDULE: RunSlot[] = buildRunSchedule();

export function runSlot(difficulty: number): RunSlot {
  const d = Math.max(1, Math.min(RUN_TARGET_COUNT, difficulty));
  return RUN_SCHEDULE[d - 1]!;
}

function withRunMeta(
  target: RunTargetDefinition,
  slot: RunSlot,
  variant: number,
): RunTargetDefinition {
  const clearReward = target.clearReward ?? 350 + slot.runDifficulty * 120;
  return {
    ...target,
    runDifficulty: slot.runDifficulty,
    variant,
    difficulty: Math.min(10, Math.ceil(slot.runDifficulty / 2)),
    clearReward,
  };
}

/** Wszystkie cele możliwe w runie (wg harmonogramu × warianty). */
export function allRunTargets(): RunTargetDefinition[] {
  const out: RunTargetDefinition[] = [];
  for (const slot of RUN_SCHEDULE) {
    for (let v = 1; v <= VARIANTS_PER_DIFFICULTY; v++) {
      out.push(runTarget(slot.runDifficulty, v));
    }
  }
  return out;
}

export function runTarget(difficulty: number, variant: number): RunTargetDefinition {
  const slot = runSlot(difficulty);
  const v = Math.max(1, Math.min(VARIANTS_PER_DIFFICULTY, variant));

  if (slot.kind === 'castle') {
    return withRunMeta(castleRunTarget(slot.sourceDifficulty, v), slot, v);
  }
  return withRunMeta(siegeTarget(slot.sourceDifficulty, v), slot, v);
}

export function runTargetCount(): number {
  return RUN_TARGET_COUNT;
}

export function runSchedule(): readonly RunSlot[] {
  return RUN_SCHEDULE;
}

export { RUN_TARGET_COUNT, VARIANTS_PER_DIFFICULTY, allCastleRunTargets, allSiegeTargets };

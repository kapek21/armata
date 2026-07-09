import type { CastleModule, LevelDefinition } from '../core/types.js';
import { defaultLevelTiming } from '../meta/score.js';

const DEFAULT_HP: Record<string, number> = {
  keystone: 100,
  gate: 60,
  wall: 80,
  tower: 90,
  foundation: 9999,
};

export function normalizeLevel(raw: LevelDefinition): LevelDefinition {
  const chapter = raw.chapter ?? 1;
  const defaults = defaultLevelTiming(chapter);

  const modules = raw.enemyCastle?.modules?.length
    ? raw.enemyCastle.modules
    : legacyToModules(raw);

  const enriched = modules.map((m) => ({
    ...m,
    hitPoints:
      m.hitPoints ??
      (m.importance === 'critical' || m.type === 'keystone'
        ? DEFAULT_HP.keystone
        : DEFAULT_HP[m.type] ?? 70),
  }));

  return {
    id: raw.id,
    name: raw.name,
    chapter,
    difficulty: raw.difficulty ?? Math.min(5, chapter),
    ammoLimit: raw.ammoLimit ?? defaults.ammoLimit,
    timeLimitSec: raw.timeLimitSec ?? defaults.timeLimitSec,
    starTimeSec: raw.starTimeSec ?? defaults.starTimeSec,
    starShots: raw.starShots ?? defaults.starShots,
    starScore: raw.starScore ?? defaults.starScore,
    killZoneY: raw.killZoneY ?? -2,
    cannon: raw.cannon ?? {
      position: [0, 0.6, 8.2],
      angleMinDeg: 12,
      angleMaxDeg: 48,
    },
    enemyCastle: {
      origin: raw.enemyCastle?.origin ?? [0, 0, -2],
      modules: enriched,
    },
  };
}

function legacyToModules(level: LevelDefinition): CastleModule[] {
  const modules: CastleModule[] = [];
  for (const b of level.blocks ?? []) {
    const type =
      b.type === 'ground'
        ? 'foundation'
        : b.isStatic
          ? 'wall'
          : 'tower';
    modules.push({
      id: `legacy-b-${modules.length}`,
      type,
      material: b.type === 'ground' ? 'stone' : b.type,
      position: b.position,
      size: b.size,
      importance: 'structural',
      isStatic: b.isStatic ?? b.type === 'ground',
    });
  }
  for (const t of level.targets ?? []) {
    modules.push({
      id: t.id,
      type: 'keystone',
      material: 'wood',
      position: t.position,
      size: t.size,
      importance: 'critical',
      hitPoints: DEFAULT_HP.keystone,
    });
  }
  if (modules.length === 0) {
    modules.push({
      id: 'k1',
      type: 'keystone',
      material: 'wood',
      position: [0, 2.5, -2],
      size: [0.9, 0.9, 0.9],
      importance: 'critical',
      hitPoints: DEFAULT_HP.keystone,
    });
  }
  return modules;
}

export function countKeystones(level: LevelDefinition): number {
  return level.enemyCastle.modules.filter(
    (m) => m.type === 'keystone' || m.importance === 'critical',
  ).length;
}

export function getKeystoneModule(level: LevelDefinition): CastleModule | undefined {
  return level.enemyCastle.modules.find(
    (m) => m.type === 'keystone' || m.importance === 'critical',
  );
}

export function isKeystone(entry: { moduleType: string; importance: string }): boolean {
  return entry.moduleType === 'keystone' || entry.importance === 'critical';
}

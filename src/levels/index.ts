import type { LevelDefinition } from '../core/types.js';
import level001 from './data/level-001.json';
import level002 from './data/level-002.json';
import level003 from './data/level-003.json';

const LEVELS = [level001, level002, level003] as LevelDefinition[];

export function allLevels(): LevelDefinition[] {
  return LEVELS;
}

export function levelByIndex(index: number): LevelDefinition {
  return LEVELS[Math.max(0, Math.min(index, LEVELS.length - 1))];
}

export function levelCount(): number {
  return LEVELS.length;
}

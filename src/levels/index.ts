import type { LevelDefinition } from '../core/types.js';
import { normalizeLevel } from './normalize.js';

const modules = import.meta.glob('./data/level-*.json', {
  eager: true,
  import: 'default',
}) as Record<string, LevelDefinition>;

const LEVELS: LevelDefinition[] = Object.entries(modules)
  .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
  .map(([, raw]) => normalizeLevel(raw));

export function allLevels(): LevelDefinition[] {
  return LEVELS;
}

export function levelByIndex(index: number): LevelDefinition {
  return LEVELS[Math.max(0, Math.min(index, LEVELS.length - 1))];
}

export function levelCount(): number {
  return LEVELS.length;
}

export function levelsByChapter(chapter: number): LevelDefinition[] {
  return LEVELS.filter((l) => l.chapter === chapter);
}

export function chapterCount(): number {
  return Math.max(...LEVELS.map((l) => l.chapter), 1);
}

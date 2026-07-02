import type { BlockType } from '../core/types.js';

export interface MaterialDef {
  color: number;
  density: number;
  friction: number;
  restitution: number;
}

export const MATERIALS: Record<BlockType, MaterialDef> = {
  wood: { color: 0xb8860b, density: 0.45, friction: 0.65, restitution: 0.15 },
  metal: { color: 0x8899aa, density: 1.4, friction: 0.45, restitution: 0.1 },
  glass: { color: 0x88ddff, density: 0.35, friction: 0.25, restitution: 0.05 },
  ground: { color: 0x3d4f3a, density: 0, friction: 0.9, restitution: 0.02 },
};

export const TARGET_COLOR = 0xff3344;
export const CANNON_COLOR = 0x444444;
export const BALL_COLOR = 0x222222;

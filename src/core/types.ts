export type BlockType = 'wood' | 'metal' | 'glass' | 'ground';
export type GamePhase = 'loading' | 'menu' | 'aiming' | 'simulating' | 'won' | 'lost';
export type QualityTier = 'low' | 'medium' | 'high';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface LevelBlock {
  type: BlockType;
  position: [number, number, number];
  size: [number, number, number];
  isStatic?: boolean;
}

export interface LevelTarget {
  id: string;
  position: [number, number, number];
  size: [number, number, number];
}

export interface LevelDefinition {
  id: string;
  name: string;
  ammoLimit: number;
  starShots: [number, number, number];
  killZoneY: number;
  cannon: {
    position: [number, number, number];
    angleMinDeg: number;
    angleMaxDeg: number;
  };
  blocks: LevelBlock[];
  targets: LevelTarget[];
}

export interface AimState {
  active: boolean;
  originX: number;
  originY: number;
  currentX: number;
  currentY: number;
}

export interface HudSnapshot {
  phase: GamePhase;
  levelId: string;
  levelName: string;
  levelIndex: number;
  levelCount: number;
  ammoLeft: number;
  ammoTotal: number;
  targetsLeft: number;
  targetsTotal: number;
  starsEarned: number;
  message: string;
  ready: boolean;
  unlockedLevels: number;
}

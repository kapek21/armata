export type BlockType = 'wood' | 'metal' | 'glass' | 'ground' | 'stone';
export type GamePhase = 'loading' | 'menu' | 'aiming' | 'simulating' | 'won' | 'lost';
export type QualityTier = 'low' | 'medium' | 'high';

export type CastleModuleType =
  | 'foundation'
  | 'wall'
  | 'tower'
  | 'gate'
  | 'keystone';

export type ModuleImportance = 'critical' | 'structural' | 'decorative';

export type PowerupType = 'heavy' | 'explosive' | 'trajectory';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** @deprecated Legacy — używaj enemyCastle.modules */
export interface LevelBlock {
  type: BlockType;
  position: [number, number, number];
  size: [number, number, number];
  isStatic?: boolean;
}

/** @deprecated Legacy — keystone w enemyCastle */
export interface LevelTarget {
  id: string;
  position: [number, number, number];
  size: [number, number, number];
}

export interface CastleModule {
  id: string;
  type: CastleModuleType;
  material: BlockType;
  position: [number, number, number];
  size: [number, number, number];
  importance: ModuleImportance;
  isStatic?: boolean;
  hitPoints?: number;
}

export interface EnemyCastle {
  origin: [number, number, number];
  modules: CastleModule[];
}

export type CastleBlueprint =
  | 'watchtower'
  | 'gatehouse'
  | 'curtain_wall'
  | 'twin_towers'
  | 'courtyard'
  | 'bastion'
  | 'citadel';

export interface LevelDefinition {
  id: string;
  name: string;
  chapter: number;
  difficulty: number;
  /** Szablon zamku z generatora poziomów */
  blueprint?: CastleBlueprint;
  ammoLimit: number;
  timeLimitSec: number;
  starTimeSec: [number, number, number];
  starShots: [number, number, number];
  starScore: [number, number, number];
  killZoneY: number;
  cannon: {
    position: [number, number, number];
    angleMinDeg: number;
    angleMaxDeg: number;
  };
  enemyCastle: EnemyCastle;
  /** Legacy — opcjonalne dla starych JSON */
  blocks?: LevelBlock[];
  targets?: LevelTarget[];
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
  chapter: number;
  ammoLeft: number;
  ammoTotal: number;
  timeLeftSec: number;
  timeLimitSec: number;
  runScore: number;
  keystoneHp: number;
  keystoneHpMax: number;
  starsEarned: number;
  finalScore: number;
  message: string;
  ready: boolean;
  unlockedLevels: number;
  activePowerup: PowerupType | null;
}

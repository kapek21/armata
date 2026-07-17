export type BlockType = 'wood' | 'metal' | 'glass' | 'ground' | 'stone';
export type GamePhase = 'loading' | 'menu' | 'aiming' | 'simulating' | 'won' | 'lost';
export type QualityTier = 'low' | 'medium' | 'high';

export type CastleModuleType =
  | 'foundation'
  | 'wall'
  | 'tower'
  | 'gate'
  | 'keystone'
  | 'lintel'
  | 'gable';

/** Geometria collisji i mesha — domyślnie box; `wedge` = trójkątny pryzmat (szczyt). */
export type ModuleShape = 'box' | 'wedge';

export type ModuleImportance = 'critical' | 'structural' | 'decorative';

export type PowerupType = 'heavy' | 'explosive' | 'trajectory' | 'breach';

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
  /** Domyślnie `box`; `gable` bez `shape` ⇒ `wedge`. */
  shape?: ModuleShape;
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
  /** Tryb run: trudność / siege tier */
  runDifficulty?: number;
  /** Tryb run: wariant 1–10 w puli trudności */
  variant?: number;
  /** Pula machin oblężniczych: tier 1–30 */
  siegeTier?: number;
  /** Archetyp machiny (trebuchet, ram, …) */
  archetype?: string;
  /** Tryb run: punkty za zniszczenie keystone */
  clearReward?: number;
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

export interface RunTargetDefinition extends LevelDefinition {
  runDifficulty: number;
  variant: number;
  clearReward: number;
}

export interface HudSnapshot {
  phase: GamePhase;
  levelId: string;
  levelName: string;
  levelIndex: number;
  levelCount: number;
  chapter: number;
  /** Bieżący cel runu 1–10 */
  runTargetIndex: number;
  runTargetCount: number;
  runDifficulty: number;
  runVariant: number;
  /** Cały run ukończony (10/10) */
  runComplete: boolean;
  /** Run zakończony — pokaż ekran podsumowania */
  runEnded: boolean;
  ammoLeft: number;
  ammoTotal: number;
  timeLeftSec: number;
  timeLimitSec: number;
  runScore: number;
  keystoneHp: number;
  keystoneHpMax: number;
  keystoneTotal: number;
  keystoneCleared: number;
  starsEarned: number;
  finalScore: number;
  message: string;
  ready: boolean;
  unlockedLevels: number;
  activePowerup: PowerupType | null;
}

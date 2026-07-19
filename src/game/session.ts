import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type {
  AimState,
  CastleModuleType,
  GamePhase,
  ModuleImportance,
  PowerupType,
  QualityTier,
  RunTargetDefinition,
  BlockType,
} from '../core/types.js';
import { createCannonMesh, disposeCannonMaterials } from './cannon-renderer.js';
import { MATERIALS, BALL_COLOR } from '../physics/materials.js';
import { pixelRatioForTier } from '../platform/quality-tier.js';
import {
  consumeAimHint,
  consumePowerup,
  loadProfile,
  saveProfile,
  shouldShowAimHint,
} from '../meta/profile.js';
import { totalCampaignTimeSec } from '../meta/campaign-time.js';
import { saveWeeklyBest } from '../meta/leaderboard.js';
import {
  applyRunResult,
  runEndMessage,
} from '../meta/run-rewards.js';
import {
  advanceAfterClear,
  createNewRun,
  getClearReward,
  isRunComplete,
  RUN_TARGET_COUNT,
  runTargetIndex,
  type RunState,
  variantForDifficulty,
} from '../meta/run-state.js';
import {
  ballHitDamage,
  runTargetClearScore,
} from '../meta/score.js';
import { runTarget } from '../levels/run/index.js';
import { countKeystones, getKeystoneModule } from '../levels/normalize.js';
import { useHudStore } from '../ui/hud-store.js';
import { applySiegeAlbedoMaps, setupCastleScene } from './castle-assets.js';
import {
  pulseKeystoneAssembly,
  pulseSpyKeystone,
  setModuleSpyReveal,
} from './siege-visuals.js';
import { createModuleMesh, disposeModuleVisual, getCastleMaterials, skylineModuleIds } from './castle-renderer.js';
import {
  clearDestructionVfx,
  spawnModuleShatter,
  updateDestructionVfx,
} from './destruction-vfx.js';
import { createModuleCollider } from './module-shapes.js';
import {
  BREACH_STATIC_DAMAGE,
  EXPLOSIVE_IMPULSE,
  EXPLOSIVE_RADIUS,
  IMPULSE_HEAVY_MULT,
} from './powerups.js';
import {
  aimArcColorFromPower,
  aimCannonBallistic,
  applyWorldOffset,
  ballisticPowerForTarget,
  BALL_RADIUS,
  barrelWorldDirection,
  computeGoalFrame,
  frameGameplayCamera,
  muzzleWorldPosition,
  pickAimTarget,
  powerFromDrag,
  resetCannonAim,
  sanitizeAimClientCoords,
  shotImpulse,
  simulateBallisticArc,
  updateGameplayCameraAspect,
  type GoalFrame,
} from './camera-frame.js';

const _cullBox = new THREE.Box3();

interface BodyEntry {
  mesh: THREE.Object3D;
  moduleId: string;
  moduleType: CastleModuleType;
  material: BlockType;
  importance: ModuleImportance;
  isStatic: boolean;
  isKeystone: boolean;
  cleared: boolean;
  hitPoints: number;
  maxHitPoints: number;
  /** Poza spoczynkowa po grawitacji (pin do 1. strzału). */
  spawnPos: [number, number, number];
  spawnRot: [number, number, number, number];
  spawnSize: [number, number, number];
}

const POST_BALL_READY_MS = 350;
const BALL_STILL_MS = 200;
const BALL_STILL_SPEED = 0.1;
const BALL_MAX_AGE_MS = 4000;
const MIN_DRAG_PX = 18;
const MAX_DRAG_PX = 160;
/** Kroki Rapiera przy ładowaniu zamków (maszyny: bez settle — wyglądały jak rozbite). */
const LOAD_SETTLE_STEPS_CASTLE = 48;

const TARGET_ADVANCE_MS = 800;

const _hitClosest = new THREE.Vector3();


function ballIntersectsBox(center: THREE.Vector3, radius: number, box: THREE.Box3): boolean {
  _hitClosest.set(
    THREE.MathUtils.clamp(center.x, box.min.x, box.max.x),
    THREE.MathUtils.clamp(center.y, box.min.y, box.max.y),
    THREE.MathUtils.clamp(center.z, box.min.z, box.max.z),
  );
  return _hitClosest.distanceToSquared(center) <= radius * radius;
}

export class GameSession {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(54, 1, 0.1, 120);
  private renderer!: THREE.WebGLRenderer;
  private world!: RAPIER.World;
  private entries: BodyEntry[] = [];
  private cannonMesh!: THREE.Group;
  private aimLine!: THREE.Line;
  private aimLineMaterial!: THREE.LineBasicMaterial;
  private ballBody: RAPIER.RigidBody | null = null;
  private ballMesh: THREE.Mesh | null = null;
  private ballAgeMs = 0;
  private ballStillMs = 0;
  private postBallIdleMs = 0;
  private level!: RunTargetDefinition;
  private runState!: RunState;
  private ammoLeft = 0;
  private shotsUsed = 0;
  private phase: GamePhase = 'loading';
  private menuReturnPhase: GamePhase = 'aiming';
  private aim: AimState = { active: false, originX: 0, originY: 0, currentX: 0, currentY: 0 };
  private activePointerId = -1;
  private aimWorldTarget: THREE.Vector3 | null = null;
  private aimTargetMesh: THREE.Object3D | null = null;
  /** Offset lokalny względem aimTargetMesh — zachowuje narożnik przy refresh. */
  private aimLocalOffset = new THREE.Vector3();
  private aimHasLocalOffset = false;
  private clearedTargets = new Set<string>();
  private keystoneDestroyed = false;
  private timeLeftSec = 0;
  private keystoneHits = 0;
  private secondaryDestroyed = 0;
  private activePowerup: PowerupType | null = null;
  private usedPowerupThisLevel = false;
  private lastShotPower = 0.5;
  private keystoneHp = 100;
  private keystoneHpMax = 100;
  private keystoneTotal = 1;
  private animTime = 0;
  private ballHitCooldown = new Set<string>();
  private lastExplosiveShot = false;
  private lastBreachShot = false;
  private lastHeavyShot = false;
  private goalFrame!: GoalFrame;
  private viewportW = 0;
  private viewportH = 0;
  private host!: HTMLElement;
  private tier!: QualityTier;
  private advanceDelayMs = 0;
  private runComplete = false;
  private runEnding = false;
  private lastHudKey = '';
  /** Chroni strzał przed anulowaniem przez lostpointercapture w trakcie pointerup. */
  private pointerUpInProgress = false;
  private onPointerDown = (e: PointerEvent): void => this.handlePointerDown(e);
  private onPointerMove = (e: PointerEvent): void => this.handlePointerMove(e);
  private onPointerUp = (e: PointerEvent): void => this.handlePointerUp(e);
  private onPointerCancel = (e: PointerEvent): void => this.handlePointerCancel(e);

  async init(host: HTMLElement, tier: QualityTier): Promise<void> {
    this.host = host;
    this.tier = tier;
    setupCastleScene(this.scene, tier);
    const mats = getCastleMaterials(tier);
    await applySiegeAlbedoMaps(mats);

    this.renderer = new THREE.WebGLRenderer({
      antialias: tier !== 'low',
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(pixelRatioForTier(tier));
    this.renderer.shadowMap.enabled = tier !== 'low';
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    host.appendChild(this.renderer.domElement);
    const canvas = this.renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.touchAction = 'none';

    await RAPIER.init();
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

    this.buildCannon();
    this.buildAimLine();
    this.startNewRun();
    this.resize();
    this.attachInput();
    useHudStore.getState().reloadProfile();
    useHudStore.getState().setBriefingOpen(true);
    useHudStore.getState().setSnapshot({ phase: 'aiming', ready: true });
    this.phase = 'aiming';
  }

  private buildCannon(): void {
    this.cannonMesh = createCannonMesh(this.tier);
    this.scene.add(this.cannonMesh);
  }

  private buildAimLine(): void {
    const geom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(),
    ]);
    this.aimLineMaterial = new THREE.LineBasicMaterial({
      color: 0xffee44,
      transparent: true,
      opacity: 0.9,
    });
    this.aimLine = new THREE.Line(geom, this.aimLineMaterial);
    this.scene.add(this.aimLine);
    this.aimLine.visible = false;
  }

  startNewRun(): void {
    this.runState = createNewRun();
    this.runComplete = false;
    this.runEnding = false;
    this.advanceDelayMs = 0;
    this.timeLeftSec = this.runState.timeLeftSec;
    this.loadRunTarget(this.runState.currentDifficulty);
  }

  loadRunTarget(difficulty: number): void {
    const variant = variantForDifficulty(this.runState, difficulty);
    const nextLevel = runTarget(difficulty, variant);
    if (!nextLevel?.enemyCastle?.modules?.length) {
      throw new Error(`Brak modułów celu d=${difficulty} v=${variant}`);
    }

    this.clearLevel();
    this.level = nextLevel;
    this.ammoLeft = this.level.ammoLimit;
    this.shotsUsed = 0;
    this.keystoneHits = 0;
    this.secondaryDestroyed = 0;
    this.keystoneDestroyed = false;
    this.usedPowerupThisLevel = false;
    this.activePowerup = null;
    this.clearedTargets.clear();
    this.phase = 'aiming';
    this.advanceDelayMs = 0;
    this.removeBall();
    this.postBallIdleMs = 0;
    this.activePointerId = -1;
    this.aim.active = false;
    this.aimWorldTarget = null;
    this.aimTargetMesh = null;
    this.aimHasLocalOffset = false;

    const ks = getKeystoneModule(this.level);
    this.keystoneTotal = countKeystones(this.level);
    this.keystoneHpMax = ks?.hitPoints ?? 100;
    this.keystoneHp = this.keystoneHpMax;

    this.goalFrame = computeGoalFrame(this.level);

    const isCastle =
      this.level.siegeTier == null && !this.level.archetype;
    const skyline = isCastle
      ? skylineModuleIds(this.level.enemyCastle.modules)
      : new Set<string>();

    for (const mod of this.level.enemyCastle.modules) {
      const pos = applyWorldOffset(mod.position, this.goalFrame.worldOffset);
      this.spawnModule(mod, pos, {
        kind: isCastle ? 'castle' : 'siege',
        isSkyline: skyline.has(mod.id),
      });
    }

    this.applyCameraFrame();
    resetCannonAim(this.cannonMesh, this.level);
    this.settlePhysicsOnLoad();
    useHudStore.getState().reloadProfile();
    this.syncHud('');
  }

  private arcPreferenceFromDrag(): number {
    const dx = this.aim.originX - this.aim.currentX;
    const dy = this.aim.originY - this.aim.currentY;
    const len = Math.hypot(dx, dy);
    if (len < 10) return 0.28;
    // Palec w górę = wyższy łuk; w dół = płaska balistyka (siła z długości przeciągnięcia).
    const loft = THREE.MathUtils.clamp(dy / len, -1, 1);
    return THREE.MathUtils.clamp(0.28 + loft * 0.42, 0, 1);
  }

  private staticObstacleBoxesForLoft(target: THREE.Vector3): THREE.Box3[] {
    const boxes: THREE.Box3[] = [];
    const muzzle = muzzleWorldPosition(this.cannonMesh);
    for (const entry of this.entries) {
      if (!entry.isStatic || entry.cleared || entry.moduleType === 'foundation' || entry.isKeystone) {
        continue;
      }
      const box = new THREE.Box3().setFromObject(entry.mesh);
      if (box.max.y < target.y - 0.35) continue;
      if (box.min.z > Math.max(muzzle.z, target.z) + 0.5) continue;
      if (box.max.z < Math.min(muzzle.z, target.z) - 0.5) continue;
      box.expandByScalar(BALL_RADIUS * 0.4);
      boxes.push(box);
    }
    return boxes;
  }

  private syncViewport(force = false): void {
    const w = this.host?.clientWidth ?? 0;
    const h = this.host?.clientHeight ?? 0;
    if (w <= 0 || h <= 0) return;
    if (!force && w === this.viewportW && h === this.viewportH) return;

    this.viewportW = w;
    this.viewportH = h;
    this.renderer.setSize(w, h, true);
    updateGameplayCameraAspect(this.camera, w / h);
  }

  private clearLevel(): void {
    clearDestructionVfx();
    for (const entry of this.entries) {
      // destroyModule już zdjął body + dispose — nie powtarzaj (to wywalało loadRunTarget).
      if (entry.cleared) {
        if (entry.mesh.parent) this.scene.remove(entry.mesh);
        continue;
      }
      setModuleSpyReveal(entry.mesh, 'off');
      const body = this.world.getRigidBody(entry.mesh.userData.bodyHandle as number);
      if (body) this.world.removeRigidBody(body);
      this.scene.remove(entry.mesh);
      disposeModuleVisual(entry.mesh);
    }
    this.entries = [];
    this.removeBall();
  }

  private spawnModule(
    mod: import('../core/types.js').CastleModule,
    pos: [number, number, number],
    visual: import('./castle-renderer.js').ModuleVisualOptions = { kind: 'siege' },
  ): void {
    const isKeystone = mod.type === 'keystone' || mod.importance === 'critical';
    const isStatic = mod.isStatic ?? mod.type === 'foundation';
    const matKey = mod.material in MATERIALS ? mod.material : 'stone';
    const mat = MATERIALS[matKey as keyof typeof MATERIALS];
    const hp = mod.hitPoints ?? (isKeystone ? 100 : 70);

    const mesh = createModuleMesh({ ...mod, position: pos }, this.tier, visual);

    this.scene.add(mesh);

    const desc = isStatic
      ? RAPIER.RigidBodyDesc.fixed()
      : RAPIER.RigidBodyDesc.dynamic().setCanSleep(true);
    const body = this.world.createRigidBody(desc.setTranslation(pos[0], pos[1], pos[2]));
    const collider = createModuleCollider(mod, mat, isStatic);
    this.world.createCollider(collider, body);
    mesh.userData.bodyHandle = body.handle;

    this.entries.push({
      mesh,
      moduleId: mod.id,
      moduleType: mod.type,
      material: matKey as BlockType,
      importance: mod.importance,
      isStatic,
      isKeystone,
      cleared: false,
      hitPoints: hp,
      maxHitPoints: hp,
      spawnPos: [pos[0], pos[1], pos[2]],
      spawnRot: [0, 0, 0, 1],
      spawnSize: [mod.size[0], mod.size[1], mod.size[2]],
    });
  }

  private aimDragLength(): number {
    const dx = this.aim.originX - this.aim.currentX;
    const dy = this.aim.originY - this.aim.currentY;
    return Math.hypot(dx, dy);
  }

  private onLostPointerCapture = (e: PointerEvent): void => {
    // W Chromium lostpointercapture często leci PRZED pointerup i kasował aim.active,
    // przez co strzał nigdy nie padał. Cleanup robi pointerup / pointercancel.
    if (this.pointerUpInProgress) return;
    if (e.pointerId !== this.activePointerId) return;
  };

  private handlePointerUp(e: PointerEvent): void {
    if (!this.aim.active) return;
    if (this.activePointerId >= 0 && e.pointerId !== this.activePointerId) return;

    this.pointerUpInProgress = true;
    try {
      this.aim.currentX = e.clientX;
      this.aim.currentY = e.clientY;
      const len = this.aimDragLength();

      this.releasePointer(e);
      this.activePointerId = -1;
      this.aim.active = false;
      this.aimLine.visible = false;

      // Ponów pick przy puszczeniu — bez celu nie ma strzału.
      if (!this.aimWorldTarget) {
        this.lockAimTarget(e.clientX, e.clientY);
      }

      const fired =
        len >= MIN_DRAG_PX && this.aimWorldTarget != null && this.canFireNow();
      if (fired) {
        const power = this.ballisticPowerForShot(powerFromDrag(len, MAX_DRAG_PX));
        this.refreshAimTargetPoint();
        aimCannonBallistic(
          this.cannonMesh,
          this.aimWorldTarget!,
          power,
          this.aimObstaclesForBallistic(),
          this.arcPreferenceFromDrag(),
        );
        this.fireShot(power);
      } else {
        resetCannonAim(this.cannonMesh, this.level);
      }
      this.aimWorldTarget = null;
      this.aimTargetMesh = null;
      this.aimHasLocalOffset = false;
    } finally {
      this.pointerUpInProgress = false;
    }
  }

  private attachInput(): void {
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('pointercancel', this.onPointerCancel);
    el.addEventListener('lostpointercapture', this.onLostPointerCapture);
  }

  private detachInput(): void {
    const el = this.renderer.domElement;
    el.removeEventListener('pointerdown', this.onPointerDown);
    el.removeEventListener('pointermove', this.onPointerMove);
    el.removeEventListener('pointerup', this.onPointerUp);
    el.removeEventListener('pointercancel', this.onPointerCancel);
    el.removeEventListener('lostpointercapture', this.onLostPointerCapture);
  }

  private releasePointer(e: PointerEvent): void {
    const el = this.renderer.domElement;
    if (el.hasPointerCapture(e.pointerId)) {
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* już zwolniony */
      }
    }
  }

  private aimMeshes(): THREE.Object3D[] {
    return this.entries
      .filter((e) => {
        if (e.cleared || e.mesh.parent === null) return false;
        if (!e.isStatic) return true;
        // Architektura wskazywalna także gdy legacy JSON ma isStatic.
        return e.moduleType === 'lintel' || e.moduleType === 'gable' || e.moduleType === 'gate';
      })
      .map((e) => e.mesh);
  }

  selectPowerup(type: PowerupType): void {
    const profile = loadProfile();
    if ((profile.powerups[type] ?? 0) <= 0) return;
    this.activePowerup = this.activePowerup === type ? null : type;
    this.refreshSpyReveal();
    this.syncHud('');
  }

  /** Podświetlenie keystone’ów przy aktywnym Szpiegu. */
  private refreshSpyReveal(): void {
    const on = this.activePowerup === 'spy';
    for (const entry of this.entries) {
      if (entry.cleared || entry.moduleType === 'foundation') {
        setModuleSpyReveal(entry.mesh, 'off');
        continue;
      }
      if (!on) {
        setModuleSpyReveal(entry.mesh, 'off');
        continue;
      }
      setModuleSpyReveal(entry.mesh, entry.isKeystone ? 'keystone' : 'dim');
    }
  }

  grantBonusShot(): void {
    if (this.phase !== 'lost') return;
    this.ammoLeft += 1;
    this.phase = 'aiming';
    this.syncHud('Dodatkowy strzał!');
  }

  private aimObstaclesForBallistic(): THREE.Box3[] {
    if (!this.aimWorldTarget) return [];
    const arcPref = this.arcPreferenceFromDrag();
    const boxes: THREE.Box3[] = [];
    if (this.activePowerup === 'trajectory') {
      boxes.push(...this.aimObstacleBoxes());
    }
    if (arcPref > 0.68) {
      boxes.push(...this.staticObstacleBoxesForLoft(this.aimWorldTarget));
    }
    return boxes;
  }

  private ballisticPowerForShot(basePower: number): number {
    if (!this.aimWorldTarget) return basePower;
    return ballisticPowerForTarget(
      muzzleWorldPosition(this.cannonMesh),
      this.aimWorldTarget,
      basePower,
    );
  }

  private previewDragPower(): number {
    const dx = this.aim.originX - this.aim.currentX;
    const dy = this.aim.originY - this.aim.currentY;
    const len = Math.hypot(dx, dy);
    if (len < MIN_DRAG_PX) return 0.62;
    return Math.max(0.38, powerFromDrag(len, MAX_DRAG_PX));
  }

  private aimObstacleBoxes(): THREE.Box3[] {
    const margin = BALL_RADIUS * 0.85;
    const boxes: THREE.Box3[] = [];
    for (const entry of this.entries) {
      if (entry.isStatic || entry.cleared || entry.mesh === this.aimTargetMesh || entry.mesh.parent === null) {
        continue;
      }
      const box = new THREE.Box3().setFromObject(entry.mesh);
      box.expandByScalar(margin);
      boxes.push(box);
    }
    return boxes;
  }

  private refreshAimTargetPoint(): void {
    if (!this.aimTargetMesh || !this.aimWorldTarget) return;
    if (!this.aimHasLocalOffset) return;
    this.aimTargetMesh.localToWorld(this.aimWorldTarget.copy(this.aimLocalOffset));
  }

  private applyBallisticAim(power = this.previewDragPower()): void {
    if (!this.aimWorldTarget) return;
    this.refreshAimTargetPoint();
    const resolvedPower = this.ballisticPowerForShot(power);
    aimCannonBallistic(
      this.cannonMesh,
      this.aimWorldTarget,
      resolvedPower,
      this.aimObstaclesForBallistic(),
      this.arcPreferenceFromDrag(),
    );
  }

  private lockAimTarget(clientX: number, clientY: number): void {
    const meshes = this.aimMeshes();
    const pickHost = this.renderer?.domElement ?? this.host;
    let pick = pickAimTarget(this.camera, clientX, clientY, pickHost, meshes);
    if (!pick) {
      const lifted = sanitizeAimClientCoords(clientX, clientY, pickHost);
      if (lifted.x !== clientX || lifted.y !== clientY) {
        pick = pickAimTarget(this.camera, lifted.x, lifted.y, pickHost, meshes);
      }
    }
    if (pick) {
      this.aimWorldTarget = pick.point;
      this.aimTargetMesh = pick.mesh;
      if (pick.mesh) {
        this.aimLocalOffset.copy(pick.point);
        pick.mesh.worldToLocal(this.aimLocalOffset);
        this.aimHasLocalOffset = true;
      } else {
        this.aimHasLocalOffset = false;
      }
    } else {
      this.aimWorldTarget = null;
      this.aimTargetMesh = null;
      this.aimHasLocalOffset = false;
    }
  }

  private canAimNow(): boolean {
    if (this.timeLeftSec <= 0) return false;
    if (this.ammoLeft <= 0) return false;
    if (this.phase === 'aiming') return true;
    return this.phase === 'simulating' && !this.ballBody;
  }

  private canFireNow(): boolean {
    if (this.timeLeftSec <= 0) return false;
    if (this.ammoLeft <= 0) return false;
    if (this.phase === 'aiming') return true;
    if (this.phase === 'simulating' && !this.ballBody) return this.canTakeNextShot();
    return false;
  }

  private handlePointerDown(e: PointerEvent): void {
    if (useHudStore.getState().briefingOpen || useHudStore.getState().helpOpen) return;
    if (!this.canAimNow()) return;
    if (e.button !== 0) return;

    e.preventDefault();
    this.activePointerId = e.pointerId;
    this.renderer.domElement.setPointerCapture(e.pointerId);

    this.aim = {
      active: true,
      originX: e.clientX,
      originY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
    };
    this.lockAimTarget(e.clientX, e.clientY);
    this.updateAimVisual();
  }

  private handlePointerMove(e: PointerEvent): void {
    if (!this.aim.active || e.pointerId !== this.activePointerId) return;
    e.preventDefault();
    this.aim.currentX = e.clientX;
    this.aim.currentY = e.clientY;
    if (this.aimWorldTarget && this.aimDragLength() >= MIN_DRAG_PX) {
      this.applyBallisticAim();
    }
    this.updateAimVisual();
  }

  private handlePointerCancel(e: PointerEvent): void {
    if (e.pointerId !== this.activePointerId) return;
    this.releasePointer(e);
    this.activePointerId = -1;
    this.aim.active = false;
    this.aimWorldTarget = null;
    this.aimTargetMesh = null;
    this.aimHasLocalOffset = false;
    this.aimLine.visible = false;
    resetCannonAim(this.cannonMesh, this.level);
  }

  private updateAimVisual(): void {
    const len = this.aimDragLength();
    const minLen = this.activePowerup === 'trajectory' ? 8 : MIN_DRAG_PX;
    if (len < minLen) {
      if (this.activePowerup !== 'trajectory') {
        this.aimLine.visible = false;
        return;
      }
    }

    const power = len < MIN_DRAG_PX ? 0.55 : powerFromDrag(len, MAX_DRAG_PX);
    if (this.aimWorldTarget && len >= MIN_DRAG_PX) {
      this.applyBallisticAim(power);
    }
    this.aimLineMaterial.color.setHex(aimArcColorFromPower(power));
    const origin = muzzleWorldPosition(this.cannonMesh);
    const arc = simulateBallisticArc(origin, power, this.cannonMesh);
    if (arc.length >= 2) {
      this.aimLine.geometry.setFromPoints(arc);
      this.aimLine.visible = true;
    }
  }

  private fireShot(power: number): void {
    if (this.ammoLeft <= 0) return;

    this.lastShotPower = power;
    const wasExplosive = this.activePowerup === 'explosive';
    const wasBreach = this.activePowerup === 'breach';
    if (this.activePowerup) this.usedPowerupThisLevel = true;

    const dir = barrelWorldDirection(this.cannonMesh);
    const spawn = muzzleWorldPosition(this.cannonMesh);
    const heavy = this.activePowerup === 'heavy';
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(spawn.x, spawn.y, spawn.z)
        .setCcdEnabled(true)
        .setLinearDamping(0.12)
        .setAngularDamping(0.25),
    );
    const density = heavy ? 3.8 : 2.2;
    this.world.createCollider(
      RAPIER.ColliderDesc.ball(BALL_RADIUS).setDensity(density).setRestitution(0.22),
      body,
    );
    let impulse = shotImpulse(power);
    if (heavy) impulse *= IMPULSE_HEAVY_MULT;
    body.applyImpulse({ x: dir.x * impulse, y: dir.y * impulse, z: dir.z * impulse }, true);

    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_RADIUS, 14, 12),
      new THREE.MeshStandardMaterial({
        color: heavy ? 0x555555 : BALL_COLOR,
        roughness: 0.35,
        metalness: heavy ? 0.5 : 0.1,
      }),
    );
    mesh.castShadow = this.tier !== 'low';
    this.scene.add(mesh);
    mesh.userData.bodyHandle = body.handle;
    this.ballBody = body;
    this.ballMesh = mesh;
    this.ballAgeMs = 0;
    this.ballStillMs = 0;
    this.postBallIdleMs = 0;
    this.ballHitCooldown = new Set();
    this.lastExplosiveShot = wasExplosive;
    this.lastBreachShot = wasBreach;
    this.lastHeavyShot = heavy;

    if (this.activePowerup) {
      const profile = loadProfile();
      const next = consumePowerup(profile, this.activePowerup);
      saveProfile(next);
      useHudStore.getState().reloadProfile();
      this.activePowerup = null;
      this.refreshSpyReveal();
    }

    this.ammoLeft -= 1;
    this.shotsUsed += 1;

    let profile = loadProfile();
    if (shouldShowAimHint(profile)) {
      profile = consumeAimHint(profile);
      saveProfile(profile);
      useHudStore.getState().reloadProfile();
    }

    this.phase = 'simulating';
    this.syncHud('Strzał!');
  }

  private removeBall(): void {
    if (this.ballBody) {
      this.world.removeRigidBody(this.ballBody);
      this.ballBody = null;
    }
    if (this.ballMesh) {
      this.scene.remove(this.ballMesh);
      this.ballMesh.geometry.dispose();
      (this.ballMesh.material as THREE.Material).dispose();
      this.ballMesh = null;
    }
    this.ballAgeMs = 0;
    this.ballStillMs = 0;
    this.lastExplosiveShot = false;
    this.lastBreachShot = false;
    this.lastHeavyShot = false;
  }

  private removeBallAndStartCooldown(): void {
    this.removeBall();
    this.postBallIdleMs = 0;
  }

  tick(dtMs: number): void {
    if (this.phase === 'loading') return;

    this.animTime += dtMs / 1000;
    updateDestructionVfx(dtMs);

    const spyOn = this.activePowerup === 'spy';
    for (const entry of this.entries) {
      if (!entry.isKeystone || entry.cleared) continue;
      if (spyOn) pulseSpyKeystone(entry.mesh, this.animTime);
      else pulseKeystoneAssembly(entry.mesh, this.animTime);
    }

    // Instrukcja / pomoc — pauza czasu i fizyki (overlay blokuje też input).
    const ui = useHudStore.getState();
    if (ui.briefingOpen || ui.helpOpen) {
      this.syncHudIfChanged('');
      return;
    }

    if (this.phase !== 'menu' && !this.runEnding) {
      this.timeLeftSec = Math.max(0, this.timeLeftSec - dtMs / 1000);
      this.runState.timeLeftSec = this.timeLeftSec;
    }

    if (this.phase === 'won' && !this.runEnding) {
      if (this.advanceDelayMs > 0) {
        this.advanceDelayMs -= dtMs;
      }
      if (this.advanceDelayMs <= 0) {
        this.advanceAfterTargetWin();
      }
      return;
    }

    if (this.phase === 'menu') return;

    this.world.integrationParameters.dt = Math.min(1 / 30, dtMs / 1000);
    this.world.step();
    // Do 1. strzału: trzymamy pozę PO settle grawitacji (bez wiszenia w powietrzu).
    // Po strzale: zwykły sync — fizyka zbijania bez zmian.
    if (this.shotsUsed === 0 && (this.phase === 'aiming' || this.phase === 'simulating')) {
      this.pinRestingPoses();
    } else {
      this.syncMeshes();
    }

    if (this.ballBody && this.ballMesh) {
      this.ballAgeMs += dtMs;
      this.checkBallHits();
      const t = this.ballBody.translation();
      const lv = this.ballBody.linvel();
      const speed = Math.hypot(lv.x, lv.y, lv.z);
      if (speed < BALL_STILL_SPEED) {
        this.ballStillMs += dtMs;
        if (this.ballStillMs >= BALL_STILL_MS) this.removeBallAndStartCooldown();
      } else {
        this.ballStillMs = 0;
      }
      if (
        this.ballBody &&
        (this.ballAgeMs > BALL_MAX_AGE_MS ||
          t.y < this.level.killZoneY - 5 ||
          Math.abs(t.x) > 20 ||
          t.z < -30)
      ) {
        this.removeBallAndStartCooldown();
      }
    } else if (this.ballBody && !this.ballMesh) {
      // Awaria stanu — bez mesha kula i tak blokuje celowanie.
      this.world.removeRigidBody(this.ballBody);
      this.ballBody = null;
      this.postBallIdleMs = 0;
    }

    this.checkCastleModules();

    if (this.keystoneDestroyed && this.phase !== 'won' && !this.runEnding) {
      this.handleTargetCleared();
      return;
    }

    if (
      !this.runEnding &&
      this.timeLeftSec <= 0 &&
      !this.keystoneDestroyed &&
      this.phase !== 'won' &&
      this.advanceDelayMs <= 0
    ) {
      this.finishRun(false, 'Czas minął!');
      return;
    }

    if (this.phase === 'simulating' && !this.ballBody) {
      this.postBallIdleMs += dtMs;
      if (this.canTakeNextShot()) {
        if (this.ammoLeft > 0 && this.timeLeftSec > 0) {
          this.phase = 'aiming';
          resetCannonAim(this.cannonMesh, this.level);
          this.syncHud('');
        } else if (!this.keystoneDestroyed && !this.runEnding) {
          this.finishRun(false, this.ammoLeft <= 0 ? 'Brak amunicji!' : 'Czas minął!');
        }
      }
    }

    if (this.phase === 'aiming' || this.phase === 'simulating') {
      this.syncHudIfChanged('');
    }
  }

  /**
   * Maszyny oblężnicze: tylko dociśnięcie luk + poza pionowa (settle grawitacji
   * zawalał je i wyglądały jak już rozbite na starcie).
   * Zamki: krótki settle; przy zawaleniu/przechyle → wrót do snapu pionowego.
   * Po 1. strzale fizyka zbijania bez zmian.
   */
  private settlePhysicsOnLoad(): void {
    this.snapFloatingModulesToSupports();
    for (const entry of this.entries) {
      entry.spawnRot = [0, 0, 0, 1];
    }

    const isSiege = this.level.siegeTier != null || Boolean(this.level.archetype);
    if (isSiege) {
      // Snap (dół / strop / dosunięcie XZ) + pin do 1. strzału — bez settle 3D
      // (wywracał maszyny). Po strzale zwykła fizyka zbijania.
      this.pinRestingPoses();
      return;
    }

    const before = this.entries.map((e) => ({
      id: e.moduleId,
      pos: [...e.spawnPos] as [number, number, number],
    }));

    this.pinRestingPoses();
    const dt = 1 / 60;
    this.world.integrationParameters.dt = dt;
    for (const entry of this.entries) {
      if (entry.isStatic || entry.cleared) continue;
      const body = this.world.getRigidBody(entry.mesh.userData.bodyHandle as number);
      body?.wakeUp();
    }
    for (let i = 0; i < LOAD_SETTLE_STEPS_CASTLE; i++) {
      this.world.step();
    }

    let bad = false;
    const killY = this.level.killZoneY;
    for (const entry of this.entries) {
      if (entry.cleared) continue;
      const body = this.world.getRigidBody(entry.mesh.userData.bodyHandle as number);
      if (!body) continue;
      const t = body.translation();
      const r = body.rotation();
      // Przechył: |w| zbyt małe / składowe rotacji za duże.
      const tilt = 1 - Math.abs(r.w);
      const prev = before.find((b) => b.id === entry.moduleId);
      const drift = prev
        ? Math.hypot(t.x - prev.pos[0], t.z - prev.pos[2])
        : 0;
      if (entry.isKeystone && t.y < killY + 0.75) bad = true;
      if (!entry.isStatic && t.y < killY + 0.25) bad = true;
      if (!entry.isStatic && tilt > 0.08) bad = true;
      if (!entry.isStatic && drift > 0.45) bad = true;
      entry.spawnPos = [t.x, t.y, t.z];
      entry.spawnRot = [r.x, r.y, r.z, r.w];
    }

    if (bad) {
      for (const entry of this.entries) {
        if (entry.cleared || entry.isStatic) continue;
        const mod = this.level.enemyCastle.modules.find((m) => m.id === entry.moduleId);
        if (!mod) continue;
        const pos = applyWorldOffset(mod.position, this.goalFrame.worldOffset);
        entry.spawnPos = [pos[0], pos[1], pos[2]];
        entry.spawnRot = [0, 0, 0, 1];
      }
      this.snapFloatingModulesToSupports();
      for (const entry of this.entries) entry.spawnRot = [0, 0, 0, 1];
    }

    this.pinRestingPoses();
  }

  /**
   * Domknij luki we WSZYSTKICH maszynach (grawitacja AABB):
   * 1) spadnij na podporę przy nakładającym się footprint XZ
   * 2) dociśnij do stropu (tarany)
   * 3) elementy obok belki (końcówki ramion) — dosuń w XZ i usiądź na podporze
   */
  private snapFloatingModulesToSupports(): void {
    type Box = {
      entry: BodyEntry;
      minX: number;
      maxX: number;
      minY: number;
      maxY: number;
      minZ: number;
      maxZ: number;
    };

    const boxOf = (e: BodyEntry): Box => {
      const [x, y, z] = e.spawnPos;
      const [w, h, d] = e.spawnSize;
      return {
        entry: e,
        minX: x - w / 2,
        maxX: x + w / 2,
        minY: y - h / 2,
        maxY: y + h / 2,
        minZ: z - d / 2,
        maxZ: z + d / 2,
      };
    };

    const overlapXZ = (a: Box, b: Box, pad = 0.08): boolean =>
      a.minX < b.maxX + pad &&
      a.maxX > b.minX - pad &&
      a.minZ < b.maxZ + pad &&
      a.maxZ > b.minZ - pad;

    const edgeDistXZ = (a: Box, b: Box): number => {
      const dx = Math.max(0, Math.max(a.minX - b.maxX, b.minX - a.maxX));
      const dz = Math.max(0, Math.max(a.minZ - b.maxZ, b.minZ - a.maxZ));
      return Math.hypot(dx, dz);
    };

    const applyPos = (entry: BodyEntry, x: number, y: number, z: number): void => {
      entry.spawnPos = [x, y, z];
      entry.mesh.position.set(x, y, z);
      const body = this.world.getRigidBody(entry.mesh.userData.bodyHandle as number);
      if (body) body.setTranslation({ x, y, z }, true);
    };

    const applyY = (entry: BodyEntry, newY: number): void => {
      applyPos(entry, entry.spawnPos[0], newY, entry.spawnPos[2]);
    };

    const MAX_GAP = 20;
    const GROUND_Y = 0;
    const SUPPORT_TOL = 0.08;

    /** Podparcie od dołu / ziemi (bez wiszenia pod stropem). */
    const isSupportedFromBelow = (entry: BodyEntry): boolean => {
      const self = boxOf(entry);
      if (self.minY <= GROUND_Y + SUPPORT_TOL) return true;
      for (const other of this.entries) {
        if (other.moduleId === entry.moduleId || other.cleared) continue;
        const o = boxOf(other);
        if (!overlapXZ(self, o)) continue;
        const gapBelow = self.minY - o.maxY;
        if (gapBelow >= -0.05 && gapBelow <= SUPPORT_TOL) return true;
      }
      return false;
    };

    const isHangOnly = (entry: BodyEntry): boolean => {
      if (isSupportedFromBelow(entry)) return false;
      const self = boxOf(entry);
      for (const other of this.entries) {
        if (other.moduleId === entry.moduleId || other.cleared) continue;
        const o = boxOf(other);
        if (!overlapXZ(self, o)) continue;
        const gapAbove = o.minY - self.maxY;
        if (gapAbove >= -0.05 && gapAbove <= SUPPORT_TOL) return true;
      }
      return false;
    };

    /** Do snapUp (tarany): dół lub strop. */
    const isSupported = (entry: BodyEntry): boolean =>
      isSupportedFromBelow(entry) || isHangOnly(entry);

    const snapDownPass = (): void => {
      const ordered = [...this.entries]
        .filter((e) => !e.isStatic && !e.cleared)
        .sort(
          (a, b) =>
            a.spawnPos[1] - a.spawnSize[1] / 2 - (b.spawnPos[1] - b.spawnSize[1] / 2),
        );

      for (const entry of ordered) {
        const self = boxOf(entry);
        let bestTop = -Infinity;
        let found = false;

        for (const other of this.entries) {
          if (other.moduleId === entry.moduleId || other.cleared) continue;
          const o = boxOf(other);
          if (!overlapXZ(self, o)) continue;
          if (o.maxY > self.minY + 0.25) continue;
          if (o.maxY > bestTop) {
            bestTop = o.maxY;
            found = true;
          }
        }

        // Ziemia tylko gdy footprint nachodzi na fundament / nisko.
        if (self.minY <= 1.25) {
          for (const other of this.entries) {
            if (other.cleared) continue;
            if (other.moduleType !== 'foundation' && !other.isStatic) continue;
            const o = boxOf(other);
            if (!overlapXZ(self, o, 0.15)) continue;
            if (GROUND_Y > bestTop) {
              bestTop = GROUND_Y;
              found = true;
            }
          }
          if (!found && self.minY <= 0.35) {
            bestTop = GROUND_Y;
            found = true;
          }
        }

        if (!found) continue;
        const gap = self.minY - bestTop;
        if (gap <= 0.001 || gap > MAX_GAP) continue;
        applyY(entry, entry.spawnPos[1] - gap);
      }
    };

    const snapUpPass = (): void => {
      const ordered = [...this.entries]
        .filter((e) => !e.isStatic && !e.cleared)
        .sort(
          (a, b) =>
            b.spawnPos[1] + b.spawnSize[1] / 2 - (a.spawnPos[1] + a.spawnSize[1] / 2),
        );

      for (const entry of ordered) {
        if (isSupported(entry)) continue;
        const self = boxOf(entry);
        let bestCeil = Infinity;
        let found = false;
        for (const other of this.entries) {
          if (other.moduleId === entry.moduleId || other.cleared) continue;
          const o = boxOf(other);
          if (!overlapXZ(self, o)) continue;
          if (o.minY < self.maxY - 0.05) continue;
          if (o.minY < bestCeil) {
            bestCeil = o.minY;
            found = true;
          }
        }
        if (!found) continue;
        const gap = bestCeil - self.maxY;
        if (gap <= 0.001 || gap > MAX_GAP) continue;
        applyY(entry, entry.spawnPos[1] + gap);
      }
    };

    /**
     * Końcówki ramion / wystające platformy: dosuń w XZ na najbliższą belkę i usiądź.
     */
    const lateralRescuePass = (opts?: { belowOnly?: boolean; maxLateral?: number }): void => {
      const MAX_LATERAL = opts?.maxLateral ?? 2.8;
      const belowOnly = Boolean(opts?.belowOnly);
      for (const entry of this.entries) {
        if (entry.isStatic || entry.cleared) continue;
        // Hang-only: nadal ratuj (szukaj podpory od dołu). Reszta — tylko gdy brak podparcia.
        if (!belowOnly && isSupportedFromBelow(entry)) continue;
        if (belowOnly && !isHangOnly(entry)) continue;

        const self = boxOf(entry);
        let best: {
          o: Box;
          mode: 'below' | 'above';
        } | null = null;
        let bestScore = Infinity;

        for (const other of this.entries) {
          if (other.moduleId === entry.moduleId || other.cleared) continue;
          if (other.moduleType === 'foundation') continue;
          const o = boxOf(other);
          const dist = edgeDistXZ(self, o);
          if (dist > MAX_LATERAL) continue;

          const yLift = Math.abs(self.minY - o.maxY);
          if (o.maxY <= self.maxY + 0.5 && yLift < 3.5) {
            const score = dist + yLift * 0.35;
            if (score < bestScore) {
              bestScore = score;
              best = { o, mode: 'below' };
            }
          }
          if (!belowOnly) {
            const yHang = Math.abs(o.minY - self.maxY);
            if (o.minY >= self.minY - 0.5 && yHang < 3.5) {
              // Mocna kara za wiszenie pod stropem (wieże oblężnicze).
              const score = dist + yHang * 0.35 + 1.75;
              if (score < bestScore) {
                bestScore = score;
                best = { o, mode: 'above' };
              }
            }
          }
        }

        if (!best) continue;
        const { o, mode } = best;
        const [hw, , hd] = [entry.spawnSize[0] / 2, entry.spawnSize[1] / 2, entry.spawnSize[2] / 2];
        let x = entry.spawnPos[0];
        let z = entry.spawnPos[2];
        if (self.maxX < o.minX) x = o.minX - hw + 0.04;
        else if (self.minX > o.maxX) x = o.maxX + hw - 0.04;
        if (self.maxZ < o.minZ) z = o.minZ - hd + 0.04;
        else if (self.minZ > o.maxZ) z = o.maxZ + hd - 0.04;

        const h = entry.spawnSize[1];
        const y = mode === 'below' ? o.maxY + h / 2 : o.minY - h / 2;
        applyPos(entry, x, y, z);
      }
    };

    /** Ostatecznie: hang-only → szerszy lateral „od dołu”, potem najbliższa półka poniżej / ziemia. */
    const resolveHangOnlyPass = (): void => {
      lateralRescuePass({ belowOnly: true, maxLateral: 4.5 });
      snapDownPass();
      for (const entry of this.entries) {
        if (entry.isStatic || entry.cleared) continue;
        if (!isHangOnly(entry)) continue;
        const self = boxOf(entry);
        const h = entry.spawnSize[1];
        let best: { x: number; y: number; z: number; score: number } | null = null;
        for (const other of this.entries) {
          if (other.moduleId === entry.moduleId || other.cleared) continue;
          const o = boxOf(other);
          if (o.maxY > self.minY + 0.05) continue;
          const cx = (o.minX + o.maxX) / 2;
          const cz = (o.minZ + o.maxZ) / 2;
          const midX = (self.minX + self.maxX) / 2;
          const midZ = (self.minZ + self.maxZ) / 2;
          const dist = Math.hypot(midX - cx, midZ - cz);
          if (dist > 5.5) continue;
          const score = dist + (self.minY - o.maxY) * 0.15;
          if (!best || score < best.score) {
            best = { x: cx, y: o.maxY + h / 2, z: cz, score };
          }
        }
        if (best) {
          applyPos(entry, best.x, best.y, best.z);
        } else if (self.minY <= 3.5) {
          applyY(entry, GROUND_Y + h / 2);
        }
      }
      for (let i = 0; i < 3; i++) snapDownPass();
    };

    for (let i = 0; i < 5; i++) snapDownPass();
    for (let i = 0; i < 2; i++) snapUpPass();
    for (let i = 0; i < 4; i++) {
      lateralRescuePass();
      snapDownPass();
    }
    for (let i = 0; i < 3; i++) snapDownPass();
    resolveHangOnlyPass();
  }

  /** Poza spoczynkowa (po grawitacji) + sleep — używane do 1. strzału. */
  private pinRestingPoses(): void {
    for (const entry of this.entries) {
      if (entry.cleared) continue;
      const body = this.world.getRigidBody(entry.mesh.userData.bodyHandle as number);
      if (!body) continue;
      const [x, y, z] = entry.spawnPos;
      const [qx, qy, qz, qw] = entry.spawnRot;
      body.setTranslation({ x, y, z }, true);
      body.setRotation({ x: qx, y: qy, z: qz, w: qw }, true);
      if (!body.isFixed()) {
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        body.sleep();
      }
      entry.mesh.position.set(x, y, z);
      entry.mesh.quaternion.set(qx, qy, qz, qw);
    }
  }

  private canCheckKeystoneKillZone(): boolean {
    // Bez strzału nie karz za „upadek” — cele są trzymane w pozie spawnu.
    if (this.shotsUsed <= 0) return false;
    return true;
  }

  private canTakeNextShot(): boolean {
    // Globalnie dla wszystkich celów (maszyny i zamki): nie czekaj na uspokojenie gruzu.
    return this.postBallIdleMs >= POST_BALL_READY_MS;
  }

  private syncMeshes(): void {
    for (const entry of this.entries) {
      if (entry.cleared) continue;
      const body = this.world.getRigidBody(entry.mesh.userData.bodyHandle as number);
      if (!body) continue;
      const t = body.translation();
      const r = body.rotation();
      entry.mesh.position.set(t.x, t.y, t.z);
      entry.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
    if (this.ballBody && this.ballMesh) {
      const t = this.ballBody.translation();
      const r = this.ballBody.rotation();
      this.ballMesh.position.set(t.x, t.y, t.z);
      this.ballMesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
  }

  private checkBallHits(): void {
    if (!this.ballBody || !this.ballMesh) return;
    const t = this.ballBody.translation();
    const ballPos = new THREE.Vector3(t.x, t.y, t.z);
    for (const entry of this.entries) {
      if (entry.cleared) continue;
      const aimableDecor =
        entry.moduleType === 'lintel' ||
        entry.moduleType === 'gable' ||
        entry.moduleType === 'gate';
      if (entry.isStatic && !aimableDecor) {
        if (!this.lastBreachShot || entry.moduleType === 'foundation') continue;
      }
      if (this.ballHitCooldown.has(entry.moduleId)) continue;

      const box = new THREE.Box3().setFromObject(entry.mesh);
      if (!ballIntersectsBox(ballPos, BALL_RADIUS, box)) continue;

      const dmg =
        this.lastBreachShot && entry.isStatic && !aimableDecor
          ? BREACH_STATIC_DAMAGE
          : ballHitDamage(this.lastShotPower, this.lastHeavyShot);

      this.ballHitCooldown.add(entry.moduleId);
      this.applyModuleDamage(entry, dmg);

      if (this.lastExplosiveShot) {
        this.applyExplosion(ballPos);
      }
    }
  }

  private applyExplosion(center: THREE.Vector3): void {
    for (const entry of this.entries) {
      if (entry.cleared) continue;
      if (entry.isStatic && (!this.lastBreachShot || entry.moduleType === 'foundation')) continue;
      const dist = entry.mesh.position.distanceTo(center);
      if (dist > EXPLOSIVE_RADIUS) continue;
      const body = this.world.getRigidBody(entry.mesh.userData.bodyHandle as number);
      if (!body) continue;
      const dir = entry.mesh.position.clone().sub(center);
      if (dir.lengthSq() < 0.01) dir.set(0, 1, 0);
      dir.normalize();
      const force = EXPLOSIVE_IMPULSE * (1 - dist / EXPLOSIVE_RADIUS);
      body.applyImpulse({ x: dir.x * force, y: dir.y * force, z: dir.z * force }, true);
    }
  }

  private applyModuleDamage(entry: BodyEntry, damage: number): void {
    entry.hitPoints -= damage;
    if (entry.isKeystone) {
      this.keystoneHits += 1;
      this.refreshKeystoneHud();
      this.syncHud('Trafienie w klucz!');
    }

    if (entry.hitPoints <= 0) {
      this.destroyModule(entry);
    }
  }

  private destroyModule(
    entry: BodyEntry,
    opts?: { burst?: boolean; origin?: THREE.Vector3 },
  ): void {
    if (entry.cleared) return;
    entry.cleared = true;
    this.clearedTargets.add(entry.moduleId);

    if (entry.isKeystone) {
      this.keystoneDestroyed = this.allKeystonesCleared();
      this.refreshKeystoneHud();
    } else if (entry.importance === 'structural' || entry.isStatic) {
      this.secondaryDestroyed += 1;
    }

    // VFX przed usunięciem mesha (pozycja / kolor).
    if (entry.mesh.parent) {
      spawnModuleShatter(this.scene, entry.mesh, entry.spawnSize, {
        tier: this.tier,
        burst: opts?.burst,
        origin: opts?.origin,
        material: entry.material,
      });
    }

    setModuleSpyReveal(entry.mesh, 'off');
    const body = this.world.getRigidBody(entry.mesh.userData.bodyHandle as number);
    if (body) this.world.removeRigidBody(body);
    this.scene.remove(entry.mesh);
    disposeModuleVisual(entry.mesh);
  }

  /** Końcowy wybuch całego celu — odłamki od środka, bez Rapiera. */
  private explodeRemainingTarget(): void {
    const alive = this.entries.filter(
      (e) => !e.cleared && e.moduleType !== 'foundation' && e.mesh.parent,
    );
    if (alive.length === 0) return;

    const origin = new THREE.Vector3();
    let n = 0;
    for (const e of alive) {
      origin.add(e.mesh.position);
      n += 1;
    }
    if (n > 0) origin.multiplyScalar(1 / n);

    for (const entry of alive) {
      this.destroyModule(entry, { burst: true, origin });
    }
  }

  private refreshKeystoneHud(): void {
    const active = this.entries.filter((e) => e.isKeystone && !e.cleared);
    if (active.length === 0) {
      this.keystoneHp = 0;
      this.keystoneHpMax = 1;
      return;
    }
    const weakest = active.reduce((a, b) => (a.hitPoints < b.hitPoints ? a : b));
    this.keystoneHp = Math.max(0, weakest.hitPoints);
    this.keystoneHpMax = weakest.maxHitPoints;
  }

  /**
   * Stabilność celu:
   * - każda zniszczona tarcza odejmuje ~1/N (przy 3 tarczach ≈ 1/3),
   * - przesunięcie / zniszczenie zwykłych klocków dodatkowo ściąga pasek,
   * - wszystkie tarcze zniszczone → 0.
   */
  private computeStabilityPct(): number {
    const keystones = this.entries.filter((e) => e.isKeystone);
    const totalKS = keystones.length;
    const remainingKS = keystones.filter((e) => !e.cleared).length;
    const keystoneFrac = totalKS > 0 ? remainingKS / totalKS : 1;

    if (totalKS > 0 && remainingKS === 0) return 0;

    const structureFrac = this.computeStructureIntegrity();
    // Tarcze wiodą (~pełne 1/N za każdą); klocki mogą ściągnąć resztę do ~20% przy żywych tarczach.
    const pct = keystoneFrac * (0.2 + 0.8 * structureFrac) * 100;
    return Math.max(0, Math.min(100, Math.round(pct)));
  }

  /** 1 = na miejscu, 0 = zniszczony / mocno przesunięty. */
  private moduleIntegrity(entry: BodyEntry): number {
    if (entry.cleared) return 0;
    if (this.shotsUsed === 0) return 1;
    const p = entry.mesh.position;
    const [sx, sy, sz] = entry.spawnPos;
    const dist = Math.hypot(p.x - sx, p.y - sy, p.z - sz);
    const soft = 0.28;
    const hard = 1.5;
    if (dist <= soft) return 1;
    if (dist >= hard) return 0;
    return 1 - (dist - soft) / (hard - soft);
  }

  private computeStructureIntegrity(): number {
    const mods = this.entries.filter(
      (e) => e.moduleType !== 'foundation' && !e.isKeystone,
    );
    if (mods.length === 0) return 1;
    let sum = 0;
    for (const e of mods) sum += this.moduleIntegrity(e);
    return sum / mods.length;
  }

  private keystoneClearedCount(): number {
    return this.entries.filter((e) => e.isKeystone && e.cleared).length;
  }

  private allKeystonesCleared(): boolean {
    const keystones = this.entries.filter((e) => e.isKeystone);
    return keystones.length > 0 && keystones.every((e) => e.cleared);
  }

  private checkCastleModules(): void {
    if (!this.canCheckKeystoneKillZone()) return;
    this.cullFallenDebris();
    this.keystoneDestroyed = this.allKeystonesCleared();
  }

  /**
   * Usuń gruz z rozbryzgiem przy kontakcie z podłożem (zanim element zniknie pod ziemią).
   * Keystone’y — to samo (zaliczenie celu), bez czekania na głęboki killZoneY.
   */
  private cullFallenDebris(): void {
    const killY = this.level.killZoneY;
    // Wizualne podłoże ~-0.5; rozbryzg gdy spadający klocek wniknie tuż pod poziom gry (~0).
    const groundSplashMinY = -0.12;
    const nearSurfaceY = 0.22;
    const dropFromSpawn = 0.55;
    const box = _cullBox;

    for (const entry of this.entries) {
      if (entry.cleared || entry.moduleType === 'foundation') continue;
      const y = entry.mesh.position.y;
      const spawnY = entry.spawnPos[1];
      const dropped = y < spawnY - dropFromSpawn;
      box.setFromObject(entry.mesh);
      const minY = Number.isFinite(box.min.y) ? box.min.y : y;

      // Ruch w dół albo osiadanie w gruncie — nie cull przechylonych na belce.
      const body = this.world.getRigidBody(entry.mesh.userData.bodyHandle as number);
      const lv = body?.linvel();
      const vy = lv?.y ?? 0;
      const speed = lv ? Math.hypot(lv.x, lv.y, lv.z) : 0;
      const falling = Boolean(body) && !body!.isSleeping() && vy < -0.15;
      const settledInDirt =
        dropped && y < nearSurfaceY && minY < groundSplashMinY && speed < 0.4;
      const deepUnder = y < killY;
      const hittingGround =
        settledInDirt ||
        (dropped && falling && (minY < groundSplashMinY || y < nearSurfaceY));

      if (entry.isKeystone) {
        if (hittingGround || deepUnder) this.destroyModule(entry);
        continue;
      }
      if (entry.isStatic) continue;

      const [w, h, d] = entry.spawnSize;
      const minDim = Math.min(w, h, d);
      const maxDim = Math.max(w, h, d);
      const isTinyDebris = maxDim <= 0.7 || (minDim <= 0.28 && maxDim <= 2.5);

      if (
        hittingGround ||
        deepUnder ||
        (isTinyDebris && dropped && falling && y < nearSurfaceY + 0.25)
      ) {
        this.destroyModule(entry);
      }
    }
  }

  /** Po zaliczeniu celu — nie czyść całej sceny (to dawało puste okno + „+pkt” i deadlock). */
  private handleTargetCleared(): void {
    if (this.phase === 'won' || this.runEnding) return;
    this.phase = 'won';

    // Punkty przed VFX wybuchu — inaczej explodeRemainingTarget zawyża secondaryDestroyed.
    const clearReward = getClearReward(this.level);
    const targetScore = runTargetClearScore({
      clearReward,
      keystoneHits: this.keystoneHits,
      secondaryDestroyed: this.secondaryDestroyed,
      shotsUsed: this.shotsUsed,
      usedPowerup: this.usedPowerupThisLevel,
    });
    this.runState = {
      ...advanceAfterClear(this.runState),
      runScore: this.runState.runScore + targetScore,
    };
    this.runComplete = isRunComplete(this.runState);
    this.advanceDelayMs = Math.max(TARGET_ADVANCE_MS, 1100);
    this.syncHud(`+${targetScore} pkt`);

    this.explodeRemainingTarget();
  }

  /** Następny cel / koniec runu — zawsze wychodzi ze stanu „won”. */
  private advanceAfterTargetWin(): void {
    if (this.runEnding) return;

    if (this.runComplete) {
      this.finishRun(true);
      return;
    }
    if (this.timeLeftSec <= 0) {
      this.finishRun(false, 'Czas minął!');
      return;
    }

    const nextDifficulty = this.runState.currentDifficulty;
    try {
      this.loadRunTarget(nextDifficulty);
    } catch (err) {
      console.error('loadRunTarget failed', nextDifficulty, err);
      try {
        this.loadRunTarget(nextDifficulty);
      } catch (err2) {
        console.error('loadRunTarget retry failed', err2);
        const detail =
          err2 instanceof Error
            ? err2.message
            : err instanceof Error
              ? err.message
              : '';
        this.finishRun(
          false,
          detail ? `Błąd ładowania celu (${detail})` : 'Błąd ładowania celu',
        );
      }
    }
  }

  private finishRun(won: boolean, reason = ''): void {
    if (this.runEnding) return;
    this.runEnding = true;
    this.advanceDelayMs = 0;
    this.phase = won ? 'won' : 'lost';

    let profile = loadProfile();
    const { profile: next, coins, powerups } = applyRunResult(
      profile,
      this.runState.runScore,
      this.runState.targetsCleared,
      won,
    );
    profile = next;
    saveProfile(profile);
    saveWeeklyBest(this.runState.runScore);
    useHudStore.getState().reloadProfile();

    const msg = won
      ? runEndMessage(true, this.runState.runScore, this.runState.targetsCleared, coins, powerups)
      : reason || runEndMessage(false, this.runState.runScore, this.runState.targetsCleared, coins, powerups);
    this.syncHud(msg);
  }

  retry(): void {
    this.startNewRun();
  }

  nextLevel(): void {
    this.startNewRun();
  }

  selectLevel(_index: number): void {
    this.startNewRun();
  }

  showMenu(): void {
    if (this.phase === 'menu') return;
    this.menuReturnPhase = this.phase;
    this.phase = 'menu';
    this.syncHud('');
  }

  closeMenu(): void {
    if (this.phase !== 'menu') return;
    this.phase = this.menuReturnPhase;
    this.syncHud('');
  }

  startFromMenu(_index?: number): void {
    this.startNewRun();
  }

  private syncHudIfChanged(message: string): void {
    const timeCeil = Math.ceil(this.timeLeftSec);
    const key = [
      this.phase,
      this.level.id,
      this.ammoLeft,
      timeCeil,
      this.runState.runScore,
      Math.round(this.keystoneHp),
      this.keystoneClearedCount(),
      this.keystoneTotal,
      this.computeStabilityPct(),
      this.activePowerup ?? '',
      this.runEnding ? '1' : '0',
      message,
    ].join('|');
    if (key === this.lastHudKey) return;
    this.lastHudKey = key;
    this.syncHud(message);
  }

  private syncHud(message: string): void {
    const timeCeil = Math.ceil(this.timeLeftSec);
    const stabilityPct = this.computeStabilityPct();
    this.lastHudKey = [
      this.phase,
      this.level.id,
      this.ammoLeft,
      timeCeil,
      this.runState.runScore,
      Math.round(this.keystoneHp),
      this.keystoneClearedCount(),
      this.keystoneTotal,
      stabilityPct,
      this.activePowerup ?? '',
      this.runEnding ? '1' : '0',
      message,
    ].join('|');
    useHudStore.getState().setSnapshot({
      phase: this.phase,
      levelId: this.level.id,
      levelName: this.level.name,
      levelIndex: this.runState.targetsCleared,
      levelCount: RUN_TARGET_COUNT,
      chapter: this.level.runDifficulty,
      runTargetIndex: runTargetIndex(this.runState),
      runTargetCount: RUN_TARGET_COUNT,
      runDifficulty: this.level.runDifficulty,
      runVariant: this.level.variant,
      runComplete: this.runComplete,
      runEnded: this.runEnding,
      ammoLeft: this.ammoLeft,
      ammoTotal: this.level.ammoLimit,
      timeLeftSec: timeCeil,
      timeLimitSec: totalCampaignTimeSec(),
      runScore: this.runState.runScore,
      keystoneHp: Math.max(0, Math.round(this.keystoneHp)),
      keystoneHpMax: this.keystoneHpMax,
      keystoneTotal: this.keystoneTotal,
      keystoneCleared: this.keystoneClearedCount(),
      stabilityPct,
      starsEarned: 0,
      finalScore: this.runState.runScore,
      message,
      unlockedLevels: RUN_TARGET_COUNT,
      activePowerup: this.activePowerup,
    });
  }

  private applyCameraFrame(): void {
    const w = this.host?.clientWidth ?? 0;
    const h = this.host?.clientHeight ?? 0;
    if (w <= 0 || h <= 0 || !this.goalFrame) return;
    frameGameplayCamera(this.camera, this.cannonMesh, this.goalFrame, w / h);
  }

  render(): void {
    this.syncViewport();
    this.renderer.render(this.scene, this.camera);
  }

  resize(): void {
    this.syncViewport(true);
  }

  destroy(): void {
    if (this.renderer) {
      try {
        this.detachInput();
      } catch {
        /* ignore */
      }
    }
    if (this.world) {
      try {
        this.clearLevel();
        this.removeBall();
      } catch {
        /* ignore */
      }
    } else {
      this.entries = [];
    }
    disposeCannonMaterials();
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.domElement.remove();
    }
    if (this.world) {
      this.world.free();
    }
  }
}

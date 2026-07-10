import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type {
  AimState,
  CastleModuleType,
  GamePhase,
  LevelDefinition,
  ModuleImportance,
  PowerupType,
  QualityTier,
} from '../core/types.js';
import { createCannonMesh, disposeCannonMaterials } from './cannon-renderer.js';
import { MATERIALS, BALL_COLOR } from '../physics/materials.js';
import { pixelRatioForTier } from '../platform/quality-tier.js';
import {
  addCoins,
  applyLevelLoss,
  applyLevelWin,
  applyWinPowerupRewards,
  consumeAimHint,
  consumePowerup,
  loadProfile,
  saveCampaignClock,
  saveProfile,
  shouldShowAimHint,
  unlockNextLevel,
} from '../meta/profile.js';
import { coinsForWin } from '../meta/economy.js';
import {
  campaignTimeBudgetFromLevel,
  clampCampaignTimeLeftSec,
  levelCampaignBudgetSec,
  levelCampaignStarTimeSec,
  totalCampaignTimeSec,
} from '../meta/campaign-time.js';
import { saveWeeklyBest } from '../meta/leaderboard.js';
import {
  ballHitDamage,
  computeRunScore,
  hybridStars,
  KEYSTONE_HIT_POINTS,
} from '../meta/score.js';
import { levelByIndex, levelCount } from '../levels/index.js';
import { countKeystones, getKeystoneModule } from '../levels/normalize.js';
import { useHudStore } from '../ui/hud-store.js';
import { setupCastleScene } from './castle-assets.js';
import { pulseKeystoneAssembly } from './siege-visuals.js';
import { createModuleMesh, disposeModuleVisual, getCastleMaterials } from './castle-renderer.js';
import {
  BREACH_STATIC_DAMAGE,
  EXPLOSIVE_IMPULSE,
  EXPLOSIVE_RADIUS,
  IMPULSE_HEAVY_MULT,
  powerupLabel,
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

interface BodyEntry {
  mesh: THREE.Object3D;
  moduleId: string;
  moduleType: CastleModuleType;
  importance: ModuleImportance;
  isStatic: boolean;
  isKeystone: boolean;
  cleared: boolean;
  hitPoints: number;
  maxHitPoints: number;
}

const SETTLE_SPEED = 0.2;
const SETTLE_ANG = 0.3;
const POST_BALL_READY_MS = 350;
const POST_BALL_FORCE_MS = 2000;
const BALL_STILL_MS = 200;
const BALL_STILL_SPEED = 0.1;
const BALL_MAX_AGE_MS = 4000;
const MIN_DRAG_PX = 18;
const MAX_DRAG_PX = 160;

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
  private level!: LevelDefinition;
  private levelIndex = 0;
  private ammoLeft = 0;
  private shotsUsed = 0;
  private phase: GamePhase = 'loading';
  private menuReturnPhase: GamePhase = 'aiming';
  private aim: AimState = { active: false, originX: 0, originY: 0, currentX: 0, currentY: 0 };
  private activePointerId = -1;
  private aimWorldTarget: THREE.Vector3 | null = null;
  private aimTargetMesh: THREE.Object3D | null = null;
  private clearedTargets = new Set<string>();
  private keystoneDestroyed = false;
  private timeLeftSec = 0;
  private campaignTimeLimitSec = 0;
  private campaignAnchorLevel = 0;
  private levelStartCampaignTime = 0;
  private lastCampaignLevelIndex = -1;
  private runScore = 0;
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
  private goalFrame!: GoalFrame;
  private viewportW = 0;
  private viewportH = 0;
  private host!: HTMLElement;
  private tier!: QualityTier;
  private onPointerDown = (e: PointerEvent): void => this.handlePointerDown(e);
  private onPointerMove = (e: PointerEvent): void => this.handlePointerMove(e);
  private onPointerUp = (e: PointerEvent): void => this.handlePointerUp(e);
  private onPointerCancel = (e: PointerEvent): void => this.handlePointerCancel(e);

  async init(host: HTMLElement, tier: QualityTier): Promise<void> {
    this.host = host;
    this.tier = tier;
    setupCastleScene(this.scene, tier);
    getCastleMaterials(tier);

    this.renderer = new THREE.WebGLRenderer({
      antialias: tier !== 'low',
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(pixelRatioForTier(tier));
    this.renderer.shadowMap.enabled = tier !== 'low';
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
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
    this.loadLevel(0);
    this.resize();
    this.attachInput();
    useHudStore.getState().reloadProfile();
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

  loadLevel(index: number): void {
    this.clearLevel();
    this.levelIndex = index;
    this.level = levelByIndex(index);
    this.ammoLeft = this.level.ammoLimit;
    this.shotsUsed = 0;
    this.runScore = 0;
    this.resolveCampaignTimer(index);
    this.keystoneHits = 0;
    this.secondaryDestroyed = 0;
    this.keystoneDestroyed = false;
    this.usedPowerupThisLevel = false;
    this.activePowerup = null;
    this.clearedTargets.clear();
    this.phase = 'aiming';
    this.removeBall();
    this.postBallIdleMs = 0;
    this.activePointerId = -1;
    this.aim.active = false;
    this.aimWorldTarget = null;
    this.aimTargetMesh = null;

    const ks = getKeystoneModule(this.level);
    this.keystoneTotal = countKeystones(this.level);
    this.keystoneHpMax = ks?.hitPoints ?? 100;
    this.keystoneHp = this.keystoneHpMax;

    this.goalFrame = computeGoalFrame(this.level);

    for (const mod of this.level.enemyCastle.modules) {
      const pos = applyWorldOffset(mod.position, this.goalFrame.worldOffset);
      this.spawnModule(mod, pos);
    }

    this.applyCameraFrame();
    resetCannonAim(this.cannonMesh, this.level);
    useHudStore.getState().reloadProfile();
    this.syncHud('');
  }

  private resolveCampaignTimer(index: number): void {
    const profile = loadProfile();
    const prevIndex = this.lastCampaignLevelIndex;
    const hadTimer = this.timeLeftSec > 0;
    const continueRun = prevIndex >= 0 && hadTimer && (index === prevIndex || index === prevIndex + 1);

    if (continueRun) {
      this.campaignTimeLimitSec =
        this.campaignAnchorLevel === 0
          ? totalCampaignTimeSec()
          : campaignTimeBudgetFromLevel(this.campaignAnchorLevel);
    } else if (
      index === 0 &&
      profile.campaignAnchorLevel === 0 &&
      profile.campaignTimeLeftSec != null &&
      profile.campaignTimeLeftSec > 0
    ) {
      this.campaignTimeLimitSec = totalCampaignTimeSec();
      this.timeLeftSec = clampCampaignTimeLeftSec(profile.campaignTimeLeftSec) ?? totalCampaignTimeSec();
      this.campaignAnchorLevel = 0;
    } else if (index === 0) {
      this.campaignTimeLimitSec = totalCampaignTimeSec();
      this.timeLeftSec = this.campaignTimeLimitSec;
      this.campaignAnchorLevel = 0;
    } else {
      this.campaignAnchorLevel = index;
      this.campaignTimeLimitSec = campaignTimeBudgetFromLevel(index);
      if (
        profile.campaignAnchorLevel === index &&
        profile.campaignTimeLeftSec != null &&
        profile.campaignTimeLeftSec > 0
      ) {
        const saved = clampCampaignTimeLeftSec(profile.campaignTimeLeftSec) ?? this.campaignTimeLimitSec;
        this.timeLeftSec = Math.min(saved, this.campaignTimeLimitSec);
      } else {
        this.timeLeftSec = this.campaignTimeLimitSec;
      }
    }

    this.levelStartCampaignTime = this.timeLeftSec;
    this.lastCampaignLevelIndex = index;
  }

  private persistCampaignClock(): void {
    let profile = loadProfile();
    profile = saveCampaignClock(profile, this.timeLeftSec, this.campaignAnchorLevel);
    saveProfile(profile);
  }

  private arcPreferenceFromDrag(): number {
    const dx = this.aim.originX - this.aim.currentX;
    const dy = this.aim.originY - this.aim.currentY;
    const len = Math.hypot(dx, dy);
    if (len < 10) return 0.28;
    const loft = THREE.MathUtils.clamp(-dy / len, -1, 1);
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
    for (const entry of this.entries) {
      this.scene.remove(entry.mesh);
      disposeModuleVisual(entry.mesh);
      const body = this.world.getRigidBody(entry.mesh.userData.bodyHandle as number);
      if (body) this.world.removeRigidBody(body);
    }
    this.entries = [];
    this.removeBall();
  }

  private spawnModule(
    mod: import('../core/types.js').CastleModule,
    pos: [number, number, number],
  ): void {
    const isKeystone = mod.type === 'keystone' || mod.importance === 'critical';
    const isStatic = mod.isStatic ?? mod.type === 'foundation';
    const matKey = mod.material in MATERIALS ? mod.material : 'stone';
    const mat = MATERIALS[matKey as keyof typeof MATERIALS];
    const hp = mod.hitPoints ?? (isKeystone ? 100 : 70);

    const mesh = createModuleMesh(
      { ...mod, position: pos },
      this.tier,
    );

    this.scene.add(mesh);

    const [w, h, d] = mod.size;
    const desc = isStatic
      ? RAPIER.RigidBodyDesc.fixed()
      : RAPIER.RigidBodyDesc.dynamic().setCanSleep(true);
    const body = this.world.createRigidBody(desc.setTranslation(pos[0], pos[1], pos[2]));
    const collider = RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2)
      .setDensity(isStatic ? 0 : mat.density)
      .setFriction(mat.friction)
      .setRestitution(mat.restitution);
    this.world.createCollider(collider, body);
    mesh.userData.bodyHandle = body.handle;

    this.entries.push({
      mesh,
      moduleId: mod.id,
      moduleType: mod.type,
      importance: mod.importance,
      isStatic,
      isKeystone,
      cleared: false,
      hitPoints: hp,
      maxHitPoints: hp,
    });
  }

  private onLostPointerCapture = (e: PointerEvent): void => {
    if (e.pointerId !== this.activePointerId || !this.aim.active) return;
    this.activePointerId = -1;
    this.aim.active = false;
    this.aimLine.visible = false;
  };

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
      .filter((e) => !e.isStatic && !e.cleared && e.mesh.parent !== null)
      .map((e) => e.mesh);
  }

  selectPowerup(type: PowerupType): void {
    const profile = loadProfile();
    if ((profile.powerups[type] ?? 0) <= 0) return;
    this.activePowerup = this.activePowerup === type ? null : type;
    this.syncHud('');
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
    const box = new THREE.Box3().setFromObject(this.aimTargetMesh);
    box.getCenter(this.aimWorldTarget);
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
    const pickCoords = sanitizeAimClientCoords(clientX, clientY, this.host);
    const pick = pickAimTarget(this.camera, pickCoords.x, pickCoords.y, this.host, this.aimMeshes());
    if (pick) {
      this.aimWorldTarget = pick.point;
      this.aimTargetMesh = pick.mesh;
      this.applyBallisticAim(0.55);
    } else {
      this.aimWorldTarget = null;
      this.aimTargetMesh = null;
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
    if (this.aimWorldTarget) {
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
    this.aimLine.visible = false;
  }

  private handlePointerUp(e: PointerEvent): void {
    if (!this.aim.active || e.pointerId !== this.activePointerId) return;

    this.aim.currentX = e.clientX;
    this.aim.currentY = e.clientY;
    const dx = this.aim.originX - this.aim.currentX;
    const dy = this.aim.originY - this.aim.currentY;
    const len = Math.hypot(dx, dy);

    this.releasePointer(e);
    this.activePointerId = -1;
    this.aim.active = false;
    this.aimLine.visible = false;

    if (len >= MIN_DRAG_PX && this.aimWorldTarget && this.canFireNow()) {
      const power = this.ballisticPowerForShot(powerFromDrag(len, MAX_DRAG_PX));
      this.refreshAimTargetPoint();
      aimCannonBallistic(
        this.cannonMesh,
        this.aimWorldTarget,
        power,
        this.aimObstaclesForBallistic(),
        this.arcPreferenceFromDrag(),
      );
      this.fireShot(power);
    }
    this.aimWorldTarget = null;
    this.aimTargetMesh = null;
  }

  private updateAimVisual(): void {
    const dx = this.aim.originX - this.aim.currentX;
    const dy = this.aim.originY - this.aim.currentY;
    const len = Math.hypot(dx, dy);
    const minLen = this.activePowerup === 'trajectory' ? 8 : MIN_DRAG_PX;
    if (len < minLen) {
      if (this.activePowerup !== 'trajectory') {
        this.aimLine.visible = false;
        return;
      }
    }

    const power = len < MIN_DRAG_PX ? 0.55 : powerFromDrag(len, MAX_DRAG_PX);
    this.applyBallisticAim(power);
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

    if (this.activePowerup) {
      const profile = loadProfile();
      const next = consumePowerup(profile, this.activePowerup);
      saveProfile(next);
      useHudStore.getState().reloadProfile();
      this.activePowerup = null;
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
  }

  private removeBallAndStartCooldown(): void {
    this.removeBall();
    this.postBallIdleMs = 0;
  }

  tick(dtMs: number): void {
    if (this.phase === 'loading') return;

    this.animTime += dtMs / 1000;
    for (const entry of this.entries) {
      if (!entry.isKeystone || entry.cleared) continue;
      pulseKeystoneAssembly(entry.mesh, this.animTime);
    }

    if (this.phase !== 'menu') {
      this.timeLeftSec = Math.max(0, this.timeLeftSec - dtMs / 1000);
      if (this.timeLeftSec <= 0 && !this.keystoneDestroyed) {
        this.handleLose('Czas minął!');
        return;
      }
    }

    if (this.phase === 'menu') return;

    this.world.integrationParameters.dt = Math.min(1 / 30, dtMs / 1000);
    this.world.step();
    this.syncMeshes();

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
      if (this.ballAgeMs > BALL_MAX_AGE_MS || t.y < this.level.killZoneY - 5 || Math.abs(t.x) > 20 || t.z < -30) {
        this.removeBallAndStartCooldown();
      }
    }

    this.checkCastleModules();

    if (this.keystoneDestroyed) {
      this.handleWin();
      return;
    }

    if (this.phase === 'simulating' && !this.ballBody) {
      this.postBallIdleMs += dtMs;
      if (this.canTakeNextShot()) {
        if (this.ammoLeft > 0 && this.timeLeftSec > 0) {
          this.phase = 'aiming';
          resetCannonAim(this.cannonMesh, this.level);
          this.syncHud('');
        } else if (!this.keystoneDestroyed) {
          this.handleLose(this.ammoLeft <= 0 ? 'Brak amunicji!' : 'Czas minął!');
        }
      }
    }

    if (this.phase === 'aiming' || this.phase === 'simulating') {
      this.syncHud('');
    }
  }

  private canTakeNextShot(): boolean {
    if (this.postBallIdleMs < POST_BALL_READY_MS) return false;
    if (this.postBallIdleMs >= POST_BALL_FORCE_MS) return true;

    let moving = false;
    this.world.forEachRigidBody((body) => {
      if (body.isFixed() || !body.isEnabled() || body.isSleeping()) return;
      const lv = body.linvel();
      const av = body.angvel();
      if (Math.hypot(lv.x, lv.y, lv.z) > SETTLE_SPEED || Math.hypot(av.x, av.y, av.z) > SETTLE_ANG) {
        moving = true;
      }
    });
    return !moving;
  }

  private syncMeshes(): void {
    for (const entry of this.entries) {
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
    const heavyShot = this.activePowerup === 'heavy';

    for (const entry of this.entries) {
      if (entry.cleared) continue;
      if (entry.isStatic) {
        if (!this.lastBreachShot || entry.moduleType === 'foundation') continue;
      }
      if (this.ballHitCooldown.has(entry.moduleId)) continue;

      const box = new THREE.Box3().setFromObject(entry.mesh);
      if (!ballIntersectsBox(ballPos, BALL_RADIUS, box)) continue;

      const dmg =
        this.lastBreachShot && entry.isStatic
          ? BREACH_STATIC_DAMAGE
          : ballHitDamage(this.lastShotPower, heavyShot);

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
      this.runScore += KEYSTONE_HIT_POINTS;
      this.refreshKeystoneHud();
      this.syncHud('Trafienie w klucz!');
    }

    if (entry.hitPoints <= 0) {
      this.destroyModule(entry);
    }
  }

  private destroyModule(entry: BodyEntry): void {
    if (entry.cleared) return;
    entry.cleared = true;
    this.clearedTargets.add(entry.moduleId);

    if (entry.isKeystone) {
      this.runScore += 1000;
      this.keystoneDestroyed = this.allKeystonesCleared();
      this.refreshKeystoneHud();
    } else if (entry.importance === 'structural' || entry.isStatic) {
      this.secondaryDestroyed += 1;
      this.runScore += 50;
    }

    const body = this.world.getRigidBody(entry.mesh.userData.bodyHandle as number);
    if (body) this.world.removeRigidBody(body);
    this.scene.remove(entry.mesh);
    disposeModuleVisual(entry.mesh);
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

  private keystoneClearedCount(): number {
    return this.entries.filter((e) => e.isKeystone && e.cleared).length;
  }

  private allKeystonesCleared(): boolean {
    const keystones = this.entries.filter((e) => e.isKeystone);
    return keystones.length > 0 && keystones.every((e) => e.cleared);
  }

  private checkCastleModules(): void {
    for (const entry of this.entries) {
      if (entry.cleared || !entry.isKeystone) continue;
      const y = entry.mesh.position.y;
      if (y < this.level.killZoneY) {
        this.destroyModule(entry);
      }
    }
    this.keystoneDestroyed = this.allKeystonesCleared();
  }

  private handleWin(): void {
    if (this.phase === 'won') return;
    this.phase = 'won';
    const levelBudget = levelCampaignBudgetSec(this.level);
    const levelElapsed = this.levelStartCampaignTime - this.timeLeftSec;
    const levelTimeLeft = Math.max(0, levelBudget - levelElapsed);
    const finalScore = computeRunScore({
      keystoneHits: this.keystoneHits,
      keystoneDestroyed: true,
      secondaryDestroyed: this.secondaryDestroyed,
      timeLeftSec: levelTimeLeft,
      shotsUsed: this.shotsUsed,
      usedPowerup: this.usedPowerupThisLevel,
    });
    this.runScore = finalScore;
    const stars = hybridStars(
      levelTimeLeft,
      this.shotsUsed,
      finalScore,
      { ...this.level, starTimeSec: levelCampaignStarTimeSec(this.level) },
    );
    let profile = loadProfile();
    profile = applyLevelWin(
      profile,
      this.level.id,
      stars,
      this.shotsUsed,
      Math.round(levelTimeLeft),
      finalScore,
    );
    profile = addCoins(profile, coinsForWin(stars, finalScore));
    const { profile: withPowerups, rewards } = applyWinPowerupRewards(profile, stars);
    profile = unlockNextLevel(withPowerups, this.levelIndex, levelCount());
    profile = saveCampaignClock(profile, this.timeLeftSec, this.campaignAnchorLevel);
    saveProfile(profile);
    saveWeeklyBest(finalScore);
    useHudStore.getState().reloadProfile();
    const rewardNote =
      rewards.length > 0
        ? ` +${rewards.map((r) => powerupLabel(r)).join(', ')}`
        : '';
    this.syncHud(`Zamek zdobyty!${rewardNote}`);
  }

  private handleLose(reason = 'Porażka'): void {
    if (this.phase === 'lost' || this.phase === 'won') return;
    this.phase = 'lost';
    let profile = loadProfile();
    profile = applyLevelLoss(profile);
    profile = saveCampaignClock(profile, this.timeLeftSec, this.campaignAnchorLevel);
    saveProfile(profile);
    useHudStore.getState().reloadProfile();
    this.syncHud(reason);
  }

  retry(): void {
    this.loadLevel(this.levelIndex);
  }

  nextLevel(): void {
    this.loadLevel(Math.min(this.levelIndex + 1, levelCount() - 1));
  }

  selectLevel(index: number): void {
    const profile = loadProfile();
    if (index < profile.unlockedLevels) this.loadLevel(index);
  }

  showMenu(): void {
    if (this.phase === 'menu') return;
    this.menuReturnPhase = this.phase;
    this.phase = 'menu';
    this.persistCampaignClock();
    this.syncHud('');
  }

  closeMenu(): void {
    if (this.phase !== 'menu') return;
    this.phase = this.menuReturnPhase;
    this.syncHud('');
  }

  startFromMenu(index: number): void {
    this.loadLevel(index);
  }

  private syncHud(message: string): void {
    const levelBudget = levelCampaignBudgetSec(this.level);
    const levelElapsed = this.levelStartCampaignTime - this.timeLeftSec;
    const levelTimeLeft = Math.max(0, levelBudget - levelElapsed);
    const stars =
      this.phase === 'won'
        ? hybridStars(
            levelTimeLeft,
            this.shotsUsed,
            this.runScore,
            { ...this.level, starTimeSec: levelCampaignStarTimeSec(this.level) },
          )
        : 0;
    useHudStore.getState().setSnapshot({
      phase: this.phase,
      levelId: this.level.id,
      levelName: this.level.name,
      levelIndex: this.levelIndex,
      levelCount: levelCount(),
      chapter: this.level.chapter,
      ammoLeft: this.ammoLeft,
      ammoTotal: this.level.ammoLimit,
      timeLeftSec: Math.ceil(this.timeLeftSec),
      timeLimitSec: this.campaignTimeLimitSec || totalCampaignTimeSec(),
      runScore: this.runScore,
      keystoneHp: Math.max(0, Math.round(this.keystoneHp)),
      keystoneHpMax: this.keystoneHpMax,
      keystoneTotal: this.keystoneTotal,
      keystoneCleared: this.keystoneClearedCount(),
      starsEarned: stars,
      finalScore: this.runScore,
      message,
      unlockedLevels: loadProfile().unlockedLevels,
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
    this.detachInput();
    this.clearLevel();
    this.removeBall();
    disposeCannonMaterials();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.world.free();
  }
}

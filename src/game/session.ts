import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { AimState, GamePhase, LevelDefinition, QualityTier } from '../core/types.js';
import {
  BALL_COLOR,
  CANNON_COLOR,
  MATERIALS,
  TARGET_COLOR,
} from '../physics/materials.js';
import { pixelRatioForTier } from '../platform/quality-tier.js';
import {
  applyLevelWin,
  loadProfile,
  saveProfile,
  starsForShots,
  unlockNextLevel,
} from '../meta/profile.js';
import { levelByIndex, levelCount } from '../levels/index.js';
import { useHudStore } from '../ui/hud-store.js';
import {
  aimArcColorFromPower,
  aimCannonBallistic,
  applyWorldOffset,
  BALL_RADIUS,
  barrelWorldDirection,
  computeGoalFrame,
  frameGameplayCamera,
  muzzleWorldPosition,
  pickAimTarget,
  powerFromDrag,
  resetCannonAim,
  shotImpulse,
  simulateBallisticArc,
  type GoalFrame,
} from './camera-frame.js';

interface BodyEntry {
  mesh: THREE.Mesh;
  isTarget: boolean;
  isStatic: boolean;
  targetId?: string;
  cleared: boolean;
}

const SETTLE_SPEED = 0.2;
const SETTLE_ANG = 0.3;
const POST_BALL_READY_MS = 350;
const POST_BALL_FORCE_MS = 2000;
const BALL_STILL_MS = 200;
const BALL_STILL_SPEED = 0.1;
const BALL_MAX_AGE_MS = 4000;
const MIN_DRAG_PX = 24;
const MAX_DRAG_PX = 140;

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
  private aimTargetMesh: THREE.Mesh | null = null;
  private clearedTargets = new Set<string>();
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
    this.scene.background = new THREE.Color(0x9ec4e8);
    this.scene.fog = new THREE.Fog(0x9ec4e8, 22, 45);

    this.renderer = new THREE.WebGLRenderer({
      antialias: tier !== 'low',
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(pixelRatioForTier(tier));
    this.renderer.shadowMap.enabled = tier === 'high';
    host.appendChild(this.renderer.domElement);
    const canvas = this.renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.touchAction = 'none';

    const hemi = new THREE.HemisphereLight(0xffffff, 0x556677, 1.1);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.15);
    sun.position.set(2, 14, 10);
    if (tier === 'high') {
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
    }
    this.scene.add(sun);

    await RAPIER.init();
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

    this.buildCannon();
    this.buildAimLine();
    this.loadLevel(0);
    this.resize();
    this.attachInput();
    useHudStore.getState().setSnapshot({ phase: 'aiming', ready: true });
    this.phase = 'aiming';
  }

  private buildCannon(): void {
    this.cannonMesh = new THREE.Group();
    this.cannonMesh.name = 'cannon-root';

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.88, 1.05, 0.58, 14),
      new THREE.MeshStandardMaterial({ color: CANNON_COLOR, roughness: 0.75 }),
    );
    base.position.y = 0.26;
    base.castShadow = this.tier === 'high';

    const yawMount = new THREE.Group();
    yawMount.name = 'yaw-pivot';
    yawMount.position.y = 0.48;

    const pitchPivot = new THREE.Group();
    pitchPivot.name = 'pitch-pivot';

    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.24, 1.6, 12),
      new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.55, metalness: 0.35 }),
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0, -0.82);
    barrel.castShadow = this.tier === 'high';

    const muzzleRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.21, 0.045, 8, 16),
      new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.5 }),
    );
    muzzleRing.rotation.x = Math.PI / 2;
    // Wyrównane z końcem lufy (−0.82 − 1.6/2); balistyka nadal używa z = −1.58.
    muzzleRing.position.set(0, 0, -1.62);

    pitchPivot.add(barrel, muzzleRing);
    yawMount.add(pitchPivot);
    this.cannonMesh.add(base, yawMount);
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
    this.clearedTargets.clear();
    this.phase = 'aiming';
    this.removeBall();
    this.postBallIdleMs = 0;
    this.activePointerId = -1;
    this.aim.active = false;
    this.aimWorldTarget = null;
    this.aimTargetMesh = null;

    this.goalFrame = computeGoalFrame(this.level);

    for (const block of this.level.blocks) {
      const pos = applyWorldOffset(block.position, this.goalFrame.worldOffset);
      this.spawnBox(pos, block.size, block.type, block.isStatic ?? false, false);
    }
    for (const target of this.level.targets) {
      const pos = applyWorldOffset(target.position, this.goalFrame.worldOffset);
      this.spawnBox(pos, target.size, 'wood', false, true, target.id);
    }

    this.applyCameraFrame();
    resetCannonAim(this.cannonMesh, this.level);

    this.syncHud('');
  }

  private syncViewport(force = false): void {
    const w = this.host?.clientWidth ?? 0;
    const h = this.host?.clientHeight ?? 0;
    if (w <= 0 || h <= 0) return;
    if (!force && w === this.viewportW && h === this.viewportH) return;

    this.viewportW = w;
    this.viewportH = h;
    this.renderer.setSize(w, h, true);
    this.applyCameraFrame();
  }

  private clearLevel(): void {
    for (const entry of this.entries) {
      this.scene.remove(entry.mesh);
      entry.mesh.geometry.dispose();
      (entry.mesh.material as THREE.Material).dispose();
      const body = this.world.getRigidBody(entry.mesh.userData.bodyHandle as number);
      if (body) this.world.removeRigidBody(body);
    }
    this.entries = [];
    this.removeBall();
  }

  private spawnBox(
    pos: [number, number, number],
    size: [number, number, number],
    type: keyof typeof MATERIALS,
    isStatic: boolean,
    isTarget: boolean,
    targetId?: string,
  ): void {
    const mat = MATERIALS[type];
    const [w, h, d] = size;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({
        color: isTarget ? TARGET_COLOR : mat.color,
        roughness: 0.85,
        metalness: type === 'metal' ? 0.6 : 0.05,
      }),
    );
    mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.castShadow = this.tier === 'high';
    mesh.receiveShadow = this.tier === 'high';
    this.scene.add(mesh);

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
    this.entries.push({ mesh, isTarget, isStatic, targetId, cleared: false });
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

  private currentDragPower(): number {
    const dx = this.aim.originX - this.aim.currentX;
    const dy = this.aim.originY - this.aim.currentY;
    return Math.max(0.3, powerFromDrag(Math.hypot(dx, dy), MAX_DRAG_PX));
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

  private applyBallisticAim(power = this.currentDragPower()): void {
    if (!this.aimWorldTarget) return;
    this.refreshAimTargetPoint();
    aimCannonBallistic(this.cannonMesh, this.aimWorldTarget, power, this.aimObstacleBoxes());
  }

  private lockAimTarget(clientX: number, clientY: number): void {
    const pick = pickAimTarget(this.camera, clientX, clientY, this.host, this.aimMeshes());
    if (pick) {
      this.aimWorldTarget = pick.point;
      this.aimTargetMesh = pick.mesh as THREE.Mesh | null;
      this.applyBallisticAim(0.55);
    } else {
      this.aimWorldTarget = null;
      this.aimTargetMesh = null;
    }
  }

  private canAimNow(): boolean {
    if (this.ammoLeft <= 0) return false;
    if (this.phase === 'aiming') return true;
    return this.phase === 'simulating' && !this.ballBody;
  }

  private canFireNow(): boolean {
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
      const power = powerFromDrag(len, MAX_DRAG_PX);
      this.refreshAimTargetPoint();
      aimCannonBallistic(this.cannonMesh, this.aimWorldTarget, power, this.aimObstacleBoxes());
      this.fireShot(power);
    }
    this.aimWorldTarget = null;
    this.aimTargetMesh = null;
  }

  private updateAimVisual(): void {
    const dx = this.aim.originX - this.aim.currentX;
    const dy = this.aim.originY - this.aim.currentY;
    const len = Math.hypot(dx, dy);
    if (len < MIN_DRAG_PX) {
      this.aimLine.visible = false;
      return;
    }

    const power = powerFromDrag(len, MAX_DRAG_PX);
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

    const dir = barrelWorldDirection(this.cannonMesh);
    const spawn = muzzleWorldPosition(this.cannonMesh);
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(spawn.x, spawn.y, spawn.z)
        .setCcdEnabled(true)
        .setLinearDamping(0.12)
        .setAngularDamping(0.25),
    );
    this.world.createCollider(RAPIER.ColliderDesc.ball(0.35).setDensity(2.2).setRestitution(0.22), body);
    const impulse = shotImpulse(power);
    body.applyImpulse({ x: dir.x * impulse, y: dir.y * impulse, z: dir.z * impulse }, true);

    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 12, 10),
      new THREE.MeshStandardMaterial({ color: BALL_COLOR, roughness: 0.4 }),
    );
    mesh.castShadow = this.tier === 'high';
    this.scene.add(mesh);
    mesh.userData.bodyHandle = body.handle;
    this.ballBody = body;
    this.ballMesh = mesh;
    this.ballAgeMs = 0;
    this.ballStillMs = 0;
    this.postBallIdleMs = 0;

    this.ammoLeft -= 1;
    this.shotsUsed += 1;
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
  }

  private removeBallAndStartCooldown(): void {
    this.removeBall();
    this.postBallIdleMs = 0;
  }

  tick(dtMs: number): void {
    if (this.phase === 'loading' || this.phase === 'menu') return;

    this.world.integrationParameters.dt = Math.min(1 / 30, dtMs / 1000);
    this.world.step();
    this.syncMeshes();

    if (this.ballBody && this.ballMesh) {
      this.ballAgeMs += dtMs;
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

    this.checkTargets();

    if (this.clearedTargets.size >= this.level.targets.length) {
      this.handleWin();
      return;
    }

    if (this.phase === 'simulating' && !this.ballBody) {
      this.postBallIdleMs += dtMs;
      if (this.canTakeNextShot()) {
        if (this.ammoLeft > 0) {
          this.phase = 'aiming';
          resetCannonAim(this.cannonMesh, this.level);
          this.syncHud('');
        } else {
          this.handleLose();
        }
      }
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

  private checkTargets(): void {
    for (const entry of this.entries) {
      if (!entry.isTarget || entry.cleared || !entry.targetId) continue;
      const y = entry.mesh.position.y;
      if (y < this.level.killZoneY) {
        entry.cleared = true;
        this.clearedTargets.add(entry.targetId);
        const body = this.world.getRigidBody(entry.mesh.userData.bodyHandle as number);
        if (body) this.world.removeRigidBody(body);
        this.scene.remove(entry.mesh);
      }
    }
  }

  private handleWin(): void {
    if (this.phase === 'won') return;
    this.phase = 'won';
    const stars = starsForShots(this.shotsUsed, this.level.starShots);
    let profile = loadProfile();
    profile = applyLevelWin(profile, this.level.id, stars, this.shotsUsed);
    profile = unlockNextLevel(profile, this.levelIndex, levelCount());
    saveProfile(profile);
    useHudStore.getState().reloadProfile();
    this.syncHud('Poziom ukończony!');
  }

  private handleLose(): void {
    if (this.phase === 'lost') return;
    this.phase = 'lost';
    this.syncHud('Brak amunicji — spróbuj ponownie');
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
    useHudStore.getState().setSnapshot({
      phase: this.phase,
      levelId: this.level.id,
      levelName: this.level.name,
      levelIndex: this.levelIndex,
      levelCount: levelCount(),
      ammoLeft: this.ammoLeft,
      ammoTotal: this.level.ammoLimit,
      targetsLeft: this.level.targets.length - this.clearedTargets.size,
      targetsTotal: this.level.targets.length,
      starsEarned: starsForShots(this.shotsUsed, this.level.starShots),
      message,
      unlockedLevels: loadProfile().unlockedLevels,
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
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.world.free();
  }
}

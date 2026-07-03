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
  aimAnglesFromDrag,
  applyCannonAim,
  applyWorldOffset,
  barrelWorldDirection,
  computeGoalFrame,
  frameGameplayCamera,
  muzzleWorldPosition,
  resetCannonAim,
  type GoalFrame,
} from './camera-frame.js';

interface BodyEntry {
  mesh: THREE.Mesh;
  isTarget: boolean;
  targetId?: string;
  cleared: boolean;
}

const SETTLE_SPEED = 0.08;
const SETTLE_ANG = 0.15;
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
  private ballBody: RAPIER.RigidBody | null = null;
  private ballMesh: THREE.Mesh | null = null;
  private ballAgeMs = 0;
  private level!: LevelDefinition;
  private levelIndex = 0;
  private ammoLeft = 0;
  private shotsUsed = 0;
  private phase: GamePhase = 'loading';
  private aim: AimState = { active: false, originX: 0, originY: 0, currentX: 0, currentY: 0 };
  private clearedTargets = new Set<string>();
  private goalFrame!: GoalFrame;
  private viewportW = 0;
  private viewportH = 0;
  private host!: HTMLElement;
  private tier!: QualityTier;
  private onPointerDown = (e: PointerEvent): void => this.handlePointerDown(e);
  private onPointerMove = (e: PointerEvent): void => this.handlePointerMove(e);
  private onPointerUp = (e: PointerEvent): void => this.handlePointerUp(e);

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
      new THREE.CylinderGeometry(1.05, 1.25, 0.65, 14),
      new THREE.MeshStandardMaterial({ color: CANNON_COLOR, roughness: 0.75 }),
    );
    base.position.y = 0.28;
    base.castShadow = this.tier === 'high';

    const yawMount = new THREE.Group();
    yawMount.name = 'yaw-pivot';
    yawMount.position.y = 0.52;

    const pitchPivot = new THREE.Group();
    pitchPivot.name = 'pitch-pivot';

    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.26, 1.75, 12),
      new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.55, metalness: 0.35 }),
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0, -0.88);
    barrel.castShadow = this.tier === 'high';

    const muzzleRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.24, 0.05, 8, 16),
      new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.5 }),
    );
    muzzleRing.rotation.x = Math.PI / 2;
    muzzleRing.position.set(0, 0, -1.72);

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
    this.aimLine = new THREE.Line(
      geom,
      new THREE.LineBasicMaterial({ color: 0xffee88, transparent: true, opacity: 0.85 }),
    );
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
    this.entries.push({ mesh, isTarget, targetId, cleared: false });
  }

  private attachInput(): void {
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
  }

  private detachInput(): void {
    const el = this.renderer.domElement;
    el.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
  }

  private handlePointerDown(e: PointerEvent): void {
    if (this.phase !== 'aiming' || this.ammoLeft <= 0) return;
    this.aim = { active: true, originX: e.clientX, originY: e.clientY, currentX: e.clientX, currentY: e.clientY };
    this.phase = 'aiming';
  }

  private handlePointerMove(e: PointerEvent): void {
    if (!this.aim.active) return;
    this.aim.currentX = e.clientX;
    this.aim.currentY = e.clientY;
    this.updateAimVisual();
  }

  private handlePointerUp(e: PointerEvent): void {
    if (!this.aim.active) return;
    this.aim.currentX = e.clientX;
    this.aim.currentY = e.clientY;
    this.aim.active = false;
    this.aimLine.visible = false;
    const dx = this.aim.originX - this.aim.currentX;
    const dy = this.aim.originY - this.aim.currentY;
    const len = Math.hypot(dx, dy);
    if (len >= MIN_DRAG_PX) this.fireShot(dx, dy, len);
  }

  private updateAimVisual(): void {
    const dx = this.aim.originX - this.aim.currentX;
    const dy = this.aim.originY - this.aim.currentY;
    const len = Math.min(MAX_DRAG_PX, Math.hypot(dx, dy));
    if (len < MIN_DRAG_PX) {
      this.aimLine.visible = false;
      return;
    }

    const { pitchRad, yawRad, power } = aimAnglesFromDrag(dx, dy, len, this.level);
    applyCannonAim(this.cannonMesh, pitchRad, yawRad);

    const origin = muzzleWorldPosition(this.cannonMesh);
    const dir = barrelWorldDirection(this.cannonMesh);
    const end = origin.clone().add(dir.multiplyScalar(2.5 + power * 5));
    this.aimLine.geometry.setFromPoints([origin, end]);
    this.aimLine.visible = true;
  }

  private fireShot(_dx: number, _dy: number, len: number): void {
    if (this.ammoLeft <= 0) return;

    const dx = this.aim.originX - this.aim.currentX;
    const dy = this.aim.originY - this.aim.currentY;
    const { pitchRad, yawRad, power } = aimAnglesFromDrag(dx, dy, len, this.level);
    applyCannonAim(this.cannonMesh, pitchRad, yawRad);
    const dir = barrelWorldDirection(this.cannonMesh);
    const spawn = muzzleWorldPosition(this.cannonMesh);
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(spawn.x, spawn.y, spawn.z)
        .setCcdEnabled(true)
        .setLinearDamping(0.08)
        .setAngularDamping(0.25),
    );
    this.world.createCollider(RAPIER.ColliderDesc.ball(0.35).setDensity(2.2).setRestitution(0.22), body);
    const impulse = 4.5 + power * 11;
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
  }

  tick(dtMs: number): void {
    if (this.phase === 'loading' || this.phase === 'menu') return;

    this.world.integrationParameters.dt = Math.min(1 / 30, dtMs / 1000);
    this.world.step();
    this.syncMeshes();

    if (this.ballBody && this.ballMesh) {
      this.ballAgeMs += dtMs;
      const t = this.ballBody.translation();
      if (this.ballAgeMs > 8000 || t.y < this.level.killZoneY - 5 || Math.abs(t.x) > 20 || t.z < -30) {
        this.removeBall();
      }
    }

    this.checkTargets();

    if (this.clearedTargets.size >= this.level.targets.length) {
      this.handleWin();
      return;
    }

    if (this.phase === 'simulating' && !this.ballBody && this.isSettled()) {
      if (this.ammoLeft > 0) {
        this.phase = 'aiming';
        this.syncHud('');
      } else {
        this.handleLose();
      }
    }
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

  private isSettled(): boolean {
    let settled = true;
    this.world.forEachRigidBody((body) => {
      if (body.isFixed() || !body.isEnabled()) return;
      const lv = body.linvel();
      const av = body.angvel();
      const speed = Math.hypot(lv.x, lv.y, lv.z);
      const ang = Math.hypot(av.x, av.y, av.z);
      if (speed > SETTLE_SPEED || ang > SETTLE_ANG) settled = false;
    });
    return settled;
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
    this.phase = 'menu';
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

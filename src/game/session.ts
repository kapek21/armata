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
  private readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
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
  private host!: HTMLElement;
  private tier!: QualityTier;
  private onPointerDown = (e: PointerEvent): void => this.handlePointerDown(e);
  private onPointerMove = (e: PointerEvent): void => this.handlePointerMove(e);
  private onPointerUp = (e: PointerEvent): void => this.handlePointerUp(e);

  async init(host: HTMLElement, tier: QualityTier): Promise<void> {
    this.host = host;
    this.tier = tier;
    this.scene.background = new THREE.Color(0x87a8c8);
    this.scene.fog = new THREE.Fog(0x87a8c8, 20, 45);

    this.renderer = new THREE.WebGLRenderer({
      antialias: tier !== 'low',
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(pixelRatioForTier(tier));
    this.renderer.shadowMap.enabled = tier === 'high';
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.touchAction = 'none';

    const hemi = new THREE.HemisphereLight(0xffffff, 0x556677, 1.1);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(-6, 12, 8);
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
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.9, 0.5, 12),
      new THREE.MeshStandardMaterial({ color: CANNON_COLOR }),
    );
    base.position.y = 0.25;
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.22, 1.6, 10),
      new THREE.MeshStandardMaterial({ color: 0x333333 }),
    );
    barrel.rotation.z = Math.PI / 2;
    barrel.position.set(0.8, 0.55, 0);
    this.cannonMesh.add(base, barrel);
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

    const [cx, cy, cz] = this.level.camera.position;
    const [lx, ly, lz] = this.level.camera.lookAt;
    this.camera.position.set(cx, cy, cz);
    this.camera.lookAt(lx, ly, lz);

    const [px, py, pz] = this.level.cannon.position;
    this.cannonMesh.position.set(px, py, pz);

    for (const block of this.level.blocks) {
      this.spawnBox(block.position, block.size, block.type, block.isStatic ?? false, false);
    }
    for (const target of this.level.targets) {
      this.spawnBox(target.position, target.size, 'wood', false, true, target.id);
    }

    this.syncHud('');
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
    const power = len / MAX_DRAG_PX;
    const angleDeg =
      this.level.cannon.angleMinDeg +
      power * (this.level.cannon.angleMaxDeg - this.level.cannon.angleMinDeg);
    const angleRad = (angleDeg * Math.PI) / 180;
    const dir = new THREE.Vector3(Math.cos(angleRad), Math.sin(angleRad), 0).normalize();
    const origin = this.cannonMesh.position.clone().add(new THREE.Vector3(0.5, 0.55, 0));
    const end = origin.clone().add(dir.multiplyScalar(2 + power * 4));
    const pts = [origin, end];
    this.aimLine.geometry.setFromPoints(pts);
    this.aimLine.visible = true;
    this.cannonMesh.rotation.z = angleRad - Math.PI / 2;
  }

  private fireShot(_dx: number, _dy: number, len: number): void {
    if (this.ammoLeft <= 0) return;
    const clamped = Math.min(MAX_DRAG_PX, len);
    const power = clamped / MAX_DRAG_PX;
    const angleDeg =
      this.level.cannon.angleMinDeg +
      power * (this.level.cannon.angleMaxDeg - this.level.cannon.angleMinDeg);
    const angleRad = (angleDeg * Math.PI) / 180;
    const dir = new THREE.Vector3(Math.cos(angleRad), Math.sin(angleRad), 0).normalize();

    const origin = this.cannonMesh.position;
    const spawn = new THREE.Vector3(origin.x + 1.2, origin.y + 0.55, origin.z);
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(spawn.x, spawn.y, spawn.z)
        .setLinearDamping(0.05)
        .setAngularDamping(0.2),
    );
    this.world.createCollider(RAPIER.ColliderDesc.ball(0.35).setDensity(2.2).setRestitution(0.25), body);
    const impulse = 18 + power * 42;
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

    this.world.step();
    this.syncMeshes();

    if (this.ballBody && this.ballMesh) {
      this.ballAgeMs += dtMs;
      const t = this.ballBody.translation();
      if (this.ballAgeMs > 8000 || t.y < this.level.killZoneY - 5 || Math.abs(t.x) > 30) {
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

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  resize(): void {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (w <= 0 || h <= 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
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

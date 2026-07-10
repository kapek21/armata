import * as THREE from 'three';
import type { LevelDefinition } from '../core/types.js';

/** Cel — przed armatą w osi Z. */
export const GOAL_PLANE_Z = -4;

/** Armata — wyśrodkowana na dole ekranu, kompaktowa. */
export const CANNON_WORLD_X = 0;
export const CANNON_WORLD_Y = 0.45;
export const CANNON_WORLD_Z = 8.2;
export const CANNON_SCALE = 0.42;

/** Kamera nad armatą — cel w górnej części kadru. */
const CAMERA_X = 0;
const CAMERA_Y = 1.28;
const CAMERA_Z = 9.35;
const CAMERA_FOV = 55;

export const BALL_RADIUS = 0.35;
export const BALL_DENSITY = 2.2;
export const GRAVITY = 9.81;

const BALL_MASS = BALL_DENSITY * ((4 / 3) * Math.PI * BALL_RADIUS ** 3);

export interface GoalFrame {
  center: THREE.Vector3;
  size: THREE.Vector3;
  worldOffset: THREE.Vector3;
}

export function computeGoalFrame(level: LevelDefinition): GoalFrame {
  const box = new THREE.Box3();

  const addBox = (pos: [number, number, number], size: [number, number, number]) => {
    const [x, y, z] = pos;
    const [hw, hh, hd] = size.map((s) => s / 2) as [number, number, number];
    box.expandByPoint(new THREE.Vector3(x - hw, y - hh, z - hd));
    box.expandByPoint(new THREE.Vector3(x + hw, y + hh, z + hd));
  };

  const modules = level.enemyCastle?.modules ?? [];
  for (const m of modules) {
    if (m.isStatic && m.type === 'foundation') continue;
    if (m.importance === 'decorative' && m.type !== 'keystone') continue;
    addBox(m.position, m.size);
  }

  if (box.isEmpty()) {
    return {
      center: new THREE.Vector3(0, 3, GOAL_PLANE_Z),
      size: new THREE.Vector3(1, 1, 1),
      worldOffset: new THREE.Vector3(0, 0, GOAL_PLANE_Z + 2),
    };
  }

  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);

  const worldOffset = new THREE.Vector3(-center.x, 0, GOAL_PLANE_Z - center.z);
  return { center, size, worldOffset };
}

export function applyWorldOffset(
  pos: [number, number, number],
  offset: THREE.Vector3,
): [number, number, number] {
  return [pos[0] + offset.x, pos[1] + offset.y, pos[2] + offset.z];
}

export function updateGameplayCameraAspect(
  camera: THREE.PerspectiveCamera,
  aspect: number,
): void {
  if (!Number.isFinite(aspect) || aspect <= 0) return;
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
}

export function frameGameplayCamera(
  camera: THREE.PerspectiveCamera,
  cannonRoot: THREE.Object3D,
  goalFrame: GoalFrame,
  aspect: number,
): void {
  if (!Number.isFinite(aspect) || aspect <= 0) return;

  cannonRoot.position.set(CANNON_WORLD_X, CANNON_WORLD_Y, CANNON_WORLD_Z);
  cannonRoot.rotation.set(0, 0, 0);
  cannonRoot.scale.setScalar(CANNON_SCALE);

  const lookAtY = THREE.MathUtils.lerp(2.1, goalFrame.center.y, 0.68);
  const lookAt = new THREE.Vector3(0, lookAtY, GOAL_PLANE_Z);

  camera.position.set(CAMERA_X, CAMERA_Y, CAMERA_Z);
  camera.up.set(0, 1, 0);
  camera.fov = CAMERA_FOV;
  camera.aspect = aspect;
  camera.near = 0.1;
  camera.far = 100;
  camera.lookAt(lookAt);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  cannonRoot.updateMatrixWorld(true);
  applyCannonVisualForPitch(cannonRoot);
}

export function muzzleWorldPosition(cannonRoot: THREE.Object3D): THREE.Vector3 {
  const pitch = cannonRoot.getObjectByName('pitch-pivot');
  if (pitch) return pitch.localToWorld(new THREE.Vector3(0, 0, -1.58));
  return cannonRoot.localToWorld(new THREE.Vector3(0, 0.58, -1.05));
}

function restMuzzleWorld(cannonRoot: THREE.Object3D): THREE.Vector3 {
  const yawP = cannonRoot.getObjectByName('yaw-pivot');
  const pitchP = cannonRoot.getObjectByName('pitch-pivot');
  if (!yawP || !pitchP) return muzzleWorldPosition(cannonRoot);
  const savedYaw = yawP.rotation.y;
  const savedPitch = pitchP.rotation.x;
  yawP.rotation.y = 0;
  pitchP.rotation.x = 0;
  cannonRoot.updateMatrixWorld(true);
  const muzzle = pitchP.localToWorld(new THREE.Vector3(0, 0, -1.58)).clone();
  yawP.rotation.y = savedYaw;
  pitchP.rotation.x = savedPitch;
  cannonRoot.updateMatrixWorld(true);
  return muzzle;
}

const _goalPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 4);
const _raycaster = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _hit = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _localDir = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _box = new THREE.Box3();
const _center = new THREE.Vector3();
const _arcPos = new THREE.Vector3();
const _arcVel = new THREE.Vector3();

export interface AimTargetPick {
  point: THREE.Vector3;
  mesh: THREE.Object3D | null;
}

function moduleRootFromObject(mesh: THREE.Object3D): THREE.Object3D {
  let node: THREE.Object3D = mesh;
  while (node.parent && node.parent.userData.moduleId) {
    node = node.parent;
  }
  return node.userData.moduleId ? node : mesh;
}

function meshAimPoint(mesh: THREE.Object3D): THREE.Vector3 {
  _box.setFromObject(moduleRootFromObject(mesh));
  _box.getCenter(_center);
  return _center.clone();
}

function screenDistToMesh(
  mesh: THREE.Object3D,
  camera: THREE.PerspectiveCamera,
  clientX: number,
  clientY: number,
  rect: DOMRect,
): number {
  _box.setFromObject(moduleRootFromObject(mesh));
  _box.getCenter(_center);
  _center.project(camera);
  const sx = (_center.x * 0.5 + 0.5) * rect.width + rect.left;
  const sy = (-_center.y * 0.5 + 0.5) * rect.height + rect.top;
  return Math.hypot(sx - clientX, sy - clientY);
}

/** Promień z ekranu — wybiera klocek najbliższy dotknięciu (nie pierwszy wzdłuż promienia). */
export function pickAimTarget(
  camera: THREE.PerspectiveCamera,
  clientX: number,
  clientY: number,
  host: HTMLElement,
  meshes: THREE.Object3D[],
): AimTargetPick | null {
  const rect = host.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  _ndc.set(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1,
  );
  _raycaster.setFromCamera(_ndc, camera);

  if (meshes.length > 0) {
    const hits = _raycaster.intersectObjects(meshes, true);
    if (hits.length > 0) {
      let best = hits[0];
      let bestScreen = Infinity;
      for (const hit of hits) {
        const root = moduleRootFromObject(hit.object);
        const d = screenDistToMesh(root, camera, clientX, clientY, rect);
        if (d < bestScreen) {
          bestScreen = d;
          best = { ...hit, object: root };
        }
      }
      return { point: meshAimPoint(best.object), mesh: best.object };
    }
  }

  return _raycaster.ray.intersectPlane(_goalPlane, _hit)
    ? { point: _hit.clone(), mesh: null }
    : null;
}

function worldDirFromAim(yaw: number, pitch: number, out: THREE.Vector3): THREE.Vector3 {
  const cp = Math.cos(pitch);
  // Pivot yaw: dodatni obrót skręca lufę w lewo — odwracamy składową X.
  return out.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
}

function arcHitsObstacle(
  muzzle: THREE.Vector3,
  yaw: number,
  pitch: number,
  speed: number,
  obstacles: THREE.Box3[],
  target: THREE.Vector3,
): boolean {
  if (obstacles.length === 0) return false;
  worldDirFromAim(yaw, pitch, _arcVel).multiplyScalar(speed);
  _arcPos.copy(muzzle);
  const dt = 0.045;
  for (let step = 0; step < 42; step++) {
    _arcPos.addScaledVector(_arcVel, dt);
    _arcVel.y -= GRAVITY * dt;
    if (_arcPos.distanceToSquared(target) < 0.28 * 0.28) return false;
    for (const box of obstacles) {
      if (box.min.y > target.y + 0.2) continue;
      if (box.containsPoint(_arcPos)) return true;
    }
    if (_arcPos.y < -4) return false;
  }
  return false;
}

function selectBallisticPitch(
  pitchLow: number,
  pitchHigh: number,
  _direct: number,
  muzzle: THREE.Vector3,
  yaw: number,
  speed: number,
  obstacles: THREE.Box3[],
  target: THREE.Vector3,
  arcPreference: number,
): number {
  const wantLoft = arcPreference > 0.68;
  const maxPitch = wantLoft && obstacles.length > 0 ? MAX_LOFT_PITCH_RAD : MAX_AIM_PITCH_RAD;

  if (obstacles.length === 0) {
    if (wantLoft && pitchHigh > pitchLow + 0.05) {
      return Math.min(pitchHigh, maxPitch);
    }
    return Math.min(pitchLow, maxPitch);
  }

  const lowBlocked = arcHitsObstacle(muzzle, yaw, pitchLow, speed, obstacles, target);
  const highBlocked = arcHitsObstacle(muzzle, yaw, pitchHigh, speed, obstacles, target);

  if (!lowBlocked) return Math.min(pitchLow, maxPitch);
  if (wantLoft && !highBlocked) return Math.min(pitchHigh, maxPitch);
  return Math.min(pitchLow, maxPitch);
}

export const MAX_AIM_PITCH_RAD = (48 * Math.PI) / 180;
export const MAX_LOFT_PITCH_RAD = (58 * Math.PI) / 180;
export const MIN_AIM_PITCH_RAD = (5 * Math.PI) / 180;

export function clampBallisticTarget(target: THREE.Vector3, muzzle: THREE.Vector3): THREE.Vector3 {
  const dx = target.x - muzzle.x;
  const dz = target.z - muzzle.z;
  let dh = Math.hypot(dx, dz);
  if (dh < 2) {
    const push = 2 / Math.max(dh, 0.05);
    target.x = muzzle.x + dx * push;
    target.z = muzzle.z + dz * push;
    dh = 2;
  }
  const dy = target.y - muzzle.y;
  if (dy > dh * 0.95) {
    target.y = muzzle.y + dh * 0.62;
  } else if (dy > dh * 1.1) {
    target.y = muzzle.y + dh * 0.75;
  }
  return target;
}

/** Podbija moc strzału dla wysokich celów, żeby trajektoria była osiągalna bez pionowej lufy. */
export function ballisticPowerForTarget(
  muzzle: THREE.Vector3,
  target: THREE.Vector3,
  power: number,
): number {
  const dx = target.x - muzzle.x;
  const dz = target.z - muzzle.z;
  const dh = Math.hypot(dx, dz);
  if (dh < 0.12) return Math.max(power, 0.78);
  const elevation = (target.y - muzzle.y) / dh;
  if (elevation > 0.65) return Math.max(power, 0.82);
  if (elevation > 0.4) return Math.max(power, 0.62);
  if (elevation > 0.25) return Math.max(power, 0.5);
  return power;
}

/** Korekta współrzędnych dotyku — dolna strefa (armata) mapowana na pole celu. */
export function sanitizeAimClientCoords(
  clientX: number,
  clientY: number,
  host: HTMLElement,
): { x: number; y: number } {
  const rect = host.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return { x: clientX, y: clientY };
  const relY = (clientY - rect.top) / rect.height;
  if (relY > 0.68) {
    return {
      x: rect.left + rect.width * 0.5,
      y: rect.top + rect.height * 0.38,
    };
  }
  return { x: clientX, y: clientY };
}

export function shotImpulse(power: number): number {
  return 6 + power * 16;
}

export function ballLaunchSpeed(power: number): number {
  return shotImpulse(power) / BALL_MASS;
}

/** Kąty lufy tak, by kula wpadła w punkt celu (uwzględnia grawitację). */
export function aimCannonBallistic(
  cannonRoot: THREE.Object3D,
  target: THREE.Vector3,
  power: number,
  obstacles: THREE.Box3[] = [],
  arcPreference = 0.28,
): boolean {
  const muzzle = restMuzzleWorld(cannonRoot);
  const aimTarget = target.clone();
  clampBallisticTarget(aimTarget, muzzle);
  power = ballisticPowerForTarget(muzzle, aimTarget, power);
  const dx = aimTarget.x - muzzle.x;
  const dy = aimTarget.y - muzzle.y;
  const dz = aimTarget.z - muzzle.z;
  const dh = Math.hypot(dx, dz);
  if (dh < 0.08) return false;

  const v = ballLaunchSpeed(power);
  const v2 = v * v;
  const g = GRAVITY;
  const disc = v2 * v2 - g * (g * dh * dh + 2 * dy * v2);
  const yawWorld = -Math.atan2(dx, -dz);

  let pitchWorld: number;
  if (disc < 0) {
    pitchWorld = Math.min(Math.atan2(Math.max(dy, 0), dh), MAX_AIM_PITCH_RAD);
  } else {
    const sqrtDisc = Math.sqrt(disc);
    const pitchLow = Math.atan((v2 - sqrtDisc) / (g * dh));
    const pitchHigh = Math.atan((v2 + sqrtDisc) / (g * dh));
    const direct = Math.atan2(dy, dh);
    pitchWorld = selectBallisticPitch(
      pitchLow,
      pitchHigh,
      direct,
      muzzle,
      yawWorld,
      v,
      obstacles,
      aimTarget,
      arcPreference,
    );
  }

  const wantLoft = arcPreference > 0.68;
  const maxPitch =
    wantLoft && obstacles.length > 0 ? MAX_LOFT_PITCH_RAD : MAX_AIM_PITCH_RAD;
  pitchWorld = THREE.MathUtils.clamp(pitchWorld, MIN_AIM_PITCH_RAD, maxPitch);
  const yaw = THREE.MathUtils.clamp(yawWorld, (-42 * Math.PI) / 180, (42 * Math.PI) / 180);

  applyCannonAim(cannonRoot, pitchWorld, yaw);
  cannonRoot.updateMatrixWorld(true);
  return true;
}

/** Proste celowanie liniowe — bez kompensacji grawitacji. */
export function aimCannonAtWorldPoint(cannonRoot: THREE.Object3D, target: THREE.Vector3): void {
  const muzzle = muzzleWorldPosition(cannonRoot);
  _dir.copy(target).sub(muzzle);
  if (_dir.lengthSq() < 0.01) return;
  _dir.normalize();

  cannonRoot.getWorldQuaternion(_quat);
  _localDir.copy(_dir).applyQuaternion(_quat.invert());

  let pitch = Math.atan2(_localDir.y, Math.hypot(_localDir.x, _localDir.z));
  let yaw = -Math.atan2(_localDir.x, -_localDir.z);

  pitch = THREE.MathUtils.clamp(pitch, (3 * Math.PI) / 180, (74 * Math.PI) / 180);
  yaw = THREE.MathUtils.clamp(yaw, (-42 * Math.PI) / 180, (42 * Math.PI) / 180);

  applyCannonAim(cannonRoot, pitch, yaw);
}

/** @deprecated Prefer pickAimTarget + aimCannonAtWorldPoint */
export function screenToGoalPlane(
  camera: THREE.PerspectiveCamera,
  clientX: number,
  clientY: number,
  host: HTMLElement,
): THREE.Vector3 | null {
  const rect = host.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  _ndc.set(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1,
  );
  _raycaster.setFromCamera(_ndc, camera);
  return _raycaster.ray.intersectPlane(_goalPlane, _hit) ? _hit.clone() : null;
}

/** Celuj lufą w punkt ekranu — używane gdy brak trafienia w klocek. */
export function aimCannonAtScreen(
  cannonRoot: THREE.Object3D,
  camera: THREE.PerspectiveCamera,
  clientX: number,
  clientY: number,
  host: HTMLElement,
  meshes: THREE.Object3D[],
): boolean {
  const target = pickAimTarget(camera, clientX, clientY, host, meshes);
  if (!target) return false;
  aimCannonAtWorldPoint(cannonRoot, target.point);
  return true;
}

export function powerFromDrag(len: number, maxPx = 140): number {
  return Math.min(maxPx, len) / maxPx;
}

const _aimArcYellow = new THREE.Color(0xffee44);
const _aimArcGreen = new THREE.Color(0x44dd55);
const _aimArcRed = new THREE.Color(0xff3322);
const _aimArcColor = new THREE.Color();

/** Żółty = słaby, zielony = średni, czerwony = mocny (power 0…1). */
export function aimArcColorFromPower(power: number): number {
  const p = THREE.MathUtils.clamp(power, 0, 1);
  if (p <= 0.5) {
    _aimArcColor.copy(_aimArcYellow).lerp(_aimArcGreen, p * 2);
  } else {
    _aimArcColor.copy(_aimArcGreen).lerp(_aimArcRed, (p - 0.5) * 2);
  }
  return _aimArcColor.getHex();
}

/** @deprecated Użyj aimCannonAtScreen + powerFromDrag */
export function aimAnglesFromDrag(dx: number, _dy: number, len: number, level: LevelDefinition): {
  pitchRad: number;
  yawRad: number;
  power: number;
} {
  const power = powerFromDrag(len);
  const pitchDeg =
    level.cannon.angleMinDeg +
    power * (level.cannon.angleMaxDeg - level.cannon.angleMinDeg);
  const pitchRad = (pitchDeg * Math.PI) / 180;
  const yawRad = (dx / 140) * (32 * Math.PI) / 180;
  return { pitchRad, yawRad, power };
}

export function simulateBallisticArc(
  muzzle: THREE.Vector3,
  power: number,
  cannonRoot: THREE.Object3D,
  steps = 24,
): THREE.Vector3[] {
  const dir = barrelWorldDirection(cannonRoot);
  const speed = ballLaunchSpeed(power);
  const vel = dir.multiplyScalar(speed);
  const points: THREE.Vector3[] = [];
  const p = muzzle.clone();
  const dt = 0.055;
  for (let i = 0; i < steps; i++) {
    points.push(p.clone());
    vel.y -= GRAVITY * dt;
    p.add(vel.clone().multiplyScalar(dt));
    if (p.y < -3) break;
  }
  return points;
}

export function barrelWorldDirection(cannonRoot: THREE.Object3D): THREE.Vector3 {
  const pitch = cannonRoot.getObjectByName('pitch-pivot');
  if (pitch) {
    const from = pitch.localToWorld(new THREE.Vector3(0, 0, -0.18));
    const to = pitch.localToWorld(new THREE.Vector3(0, 0, -1.58));
    return to.sub(from).normalize();
  }
  const from = new THREE.Vector3(0, 0.58, -0.15);
  const to = new THREE.Vector3(0, 0.58, -1.7);
  cannonRoot.localToWorld(from);
  cannonRoot.localToWorld(to);
  return to.sub(from).normalize();
}

export function applyCannonAim(cannonRoot: THREE.Object3D, pitchRad: number, yawRad: number): void {
  const yawPivot = cannonRoot.getObjectByName('yaw-pivot');
  const pitchPivot = cannonRoot.getObjectByName('pitch-pivot');
  if (yawPivot) yawPivot.rotation.y = yawRad;
  if (pitchPivot) pitchPivot.rotation.x = pitchRad;
  applyCannonVisualForPitch(cannonRoot);
}

function setCannonMeshOpacity(mesh: THREE.Object3D | null, opacity: number): void {
  if (!mesh) return;
  mesh.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;
    const m = child as THREE.Mesh;
    const materials = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of materials) {
      if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
      const isTransparent = opacity < 0.995;
      mat.opacity = opacity;
      mat.transparent = isTransparent;
      mat.depthWrite = !isTransparent;
      mat.needsUpdate = true;
    }
  });
}

/** Półprzezroczysta podstawa/lufa tylko gdy obręcz jest ukryta (ten sam próg pitch). */
export function applyCannonVisualForPitch(cannonRoot: THREE.Object3D): void {
  const pitchPivot = cannonRoot.getObjectByName('pitch-pivot');
  if (!pitchPivot) return;

  const pitch = Math.max(0, pitchPivot.rotation.x);
  const muzzleHiddenAt = (36 * Math.PI) / 180;
  const fadeEnd = (56 * Math.PI) / 180;
  const hideMuzzle = pitch >= muzzleHiddenAt;
  const fadeT = hideMuzzle ? THREE.MathUtils.smoothstep(pitch, muzzleHiddenAt, fadeEnd) : 0;
  // Gdy obręcz znika, armata od razu półprzezroczysta (wcześniej fade startował od 100%).
  const opacity = hideMuzzle ? THREE.MathUtils.lerp(0.48, 0.2, fadeT) : 1;

  setCannonMeshOpacity(cannonRoot.getObjectByName('cannon-base') ?? null, opacity);
  setCannonMeshOpacity(cannonRoot.getObjectByName('cannon-barrel') ?? null, opacity);

  const muzzle = cannonRoot.getObjectByName('cannon-muzzle');
  if (muzzle) {
    muzzle.visible = !hideMuzzle;
    if (!hideMuzzle) setCannonMeshOpacity(muzzle, 1);
  }

  const wheels = ['wheel-l', 'wheel-r'];
  for (const id of wheels) {
    const w = cannonRoot.getObjectByName(id);
    if (w) setCannonMeshOpacity(w, opacity);
  }
}

export function resetCannonAim(cannonRoot: THREE.Object3D, level: LevelDefinition): void {
  const pitchRad = (level.cannon.angleMinDeg * Math.PI) / 180;
  applyCannonAim(cannonRoot, pitchRad, 0);
}

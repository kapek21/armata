import * as THREE from 'three';
import type { LevelDefinition } from '../core/types.js';

/** Cel dokładnie w centrum ekranu (NDC 0,0). */
const TARGET_NDC = new THREE.Vector2(0, 0);
/** Podstawa armaty — dolny środek, nad HUD-em. */
const CANNON_NDC = new THREE.Vector2(0, -0.62);

export function levelTargetCenter(level: LevelDefinition): THREE.Vector3 {
  if (level.targets.length === 0) return new THREE.Vector3(0, 3, -3);
  const sum = level.targets.reduce(
    (acc, t) => acc.add(new THREE.Vector3(t.position[0], t.position[1], t.position[2])),
    new THREE.Vector3(),
  );
  return sum.multiplyScalar(1 / level.targets.length);
}

function projectNdc(camera: THREE.PerspectiveCamera, point: THREE.Vector3): THREE.Vector2 {
  const v = point.clone().project(camera);
  return new THREE.Vector2(v.x, v.y);
}

function cannonLocalOffset(aspect: number): THREE.Vector3 {
  if (aspect < 0.55) return new THREE.Vector3(0, -0.62, -1.85);
  if (aspect < 0.85) return new THREE.Vector3(0, -0.56, -2.0);
  return new THREE.Vector3(0, -0.48, -2.25);
}

function attachCannonToCamera(
  camera: THREE.PerspectiveCamera,
  cannonRoot: THREE.Object3D,
  aspect: number,
): void {
  if (cannonRoot.parent !== camera) {
    cannonRoot.parent?.remove(cannonRoot);
    camera.add(cannonRoot);
  }
  cannonRoot.position.copy(cannonLocalOffset(aspect));
  cannonRoot.rotation.set(0, 0, 0);
  cannonRoot.updateMatrixWorld(true);
}

export function frameGameplayCamera(
  camera: THREE.PerspectiveCamera,
  cannonRoot: THREE.Object3D,
  level: LevelDefinition,
  aspect: number,
): void {
  const target = levelTargetCenter(level);
  const portrait = aspect < 0.85;

  camera.fov = portrait ? 52 : 48;
  camera.aspect = aspect;
  camera.near = 0.1;
  camera.far = 150;
  camera.updateProjectionMatrix();

  const camPos = new THREE.Vector3(target.x, target.y + 0.6, target.z + (portrait ? 9.5 : 8.5));

  attachCannonToCamera(camera, cannonRoot, aspect);

  for (let i = 0; i < 40; i++) {
    camera.position.copy(camPos);
    camera.lookAt(target);
    camera.updateMatrixWorld(true);

    const targetNdc = projectNdc(camera, target);
    const cannonWorld = new THREE.Vector3();
    cannonRoot.getWorldPosition(cannonWorld);
    const cannonNdc = projectNdc(camera, cannonWorld);

    const errTx = targetNdc.x - TARGET_NDC.x;
    const errTy = targetNdc.y - TARGET_NDC.y;
    const errCy = cannonNdc.y - CANNON_NDC.y;

    const dist = Math.max(4, camPos.distanceTo(target));
    camPos.x -= errTx * dist * 0.85;
    camPos.y -= errTy * dist * 0.85;
    camPos.z += errTy * dist * 0.35;

    const off = cannonLocalOffset(aspect);
    off.y -= errCy * 0.35;
    off.z -= errCy * 0.15;
    off.y = THREE.MathUtils.clamp(off.y, -0.85, -0.35);
    off.z = THREE.MathUtils.clamp(off.z, -2.8, -1.5);
    cannonRoot.position.copy(off);
  }

  camera.position.copy(camPos);
  camera.lookAt(target);
  camera.updateProjectionMatrix();
  cannonRoot.updateMatrixWorld(true);
}

export function muzzleWorldPosition(cannonRoot: THREE.Object3D): THREE.Vector3 {
  return cannonRoot.localToWorld(new THREE.Vector3(0, 0.58, -1.05));
}

export function cannonBaseWorld(cannonRoot: THREE.Object3D): THREE.Vector3 {
  return cannonRoot.localToWorld(new THREE.Vector3(0, 0.2, 0));
}

export function aimAnglesFromDrag(dx: number, _dy: number, len: number, level: LevelDefinition): {
  pitchRad: number;
  yawRad: number;
  power: number;
} {
  const clamped = Math.min(140, len);
  const power = clamped / 140;
  const pitchDeg =
    level.cannon.angleMinDeg +
    power * (level.cannon.angleMaxDeg - level.cannon.angleMinDeg);
  const pitchRad = (pitchDeg * Math.PI) / 180;
  const yawRad = (dx / 140) * (14 * Math.PI) / 180;
  return { pitchRad, yawRad, power };
}

export function barrelWorldDirection(cannonRoot: THREE.Object3D): THREE.Vector3 {
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
  if (pitchPivot) pitchPivot.rotation.x = -pitchRad;
}

/** @deprecated use levelTargetCenter */
export function levelFocusPoint(level: LevelDefinition): THREE.Vector3 {
  return levelTargetCenter(level);
}

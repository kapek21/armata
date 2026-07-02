import * as THREE from 'three';
import type { LevelDefinition } from '../core/types.js';

/** Cannon fixed near camera — bottom-center of the viewport. */
export const CANNON_WORLD = new THREE.Vector3(0, 0.6, 8.2);

const CAMERA_HEIGHT = 1.45;
const CAMERA_DISTANCE = 4.2;
const DEFAULT_FOV = 54;

export function levelFocusPoint(level: LevelDefinition): THREE.Vector3 {
  const points: THREE.Vector3[] = [];
  for (const t of level.targets) {
    points.push(new THREE.Vector3(t.position[0], t.position[1], t.position[2]));
  }
  for (const b of level.blocks) {
    if (b.type === 'ground') continue;
    points.push(new THREE.Vector3(b.position[0], b.position[1], b.position[2]));
  }
  if (points.length === 0) return new THREE.Vector3(0, 3, 0);
  const sum = points.reduce((acc, p) => acc.add(p), new THREE.Vector3());
  return sum.multiplyScalar(1 / points.length);
}

export function frameGameplayCamera(
  camera: THREE.PerspectiveCamera,
  level: LevelDefinition,
  aspect: number,
): void {
  const focus = levelFocusPoint(level);
  focus.z = Math.min(focus.z, 0.5);

  camera.position.set(
    CANNON_WORLD.x,
    CANNON_WORLD.y + CAMERA_HEIGHT,
    CANNON_WORLD.z + CAMERA_DISTANCE,
  );
  camera.lookAt(focus.x, focus.y, focus.z);
  camera.fov = DEFAULT_FOV;
  camera.aspect = aspect;
  camera.near = 0.1;
  camera.far = 120;
  camera.updateProjectionMatrix();
}

export function muzzleWorldPosition(cannonRoot: THREE.Object3D): THREE.Vector3 {
  const local = new THREE.Vector3(0, 0.58, -1.05);
  return cannonRoot.localToWorld(local);
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
  const yawRad = (dx / 140) * (12 * Math.PI) / 180;
  return { pitchRad, yawRad, power };
}

export function shotDirection(pitchRad: number, yawRad: number): THREE.Vector3 {
  return new THREE.Vector3(
    Math.sin(yawRad) * Math.cos(pitchRad),
    Math.sin(pitchRad),
    -Math.cos(yawRad) * Math.cos(pitchRad),
  ).normalize();
}

export function applyCannonAim(cannonRoot: THREE.Object3D, pitchRad: number, yawRad: number): void {
  const yawPivot = cannonRoot.getObjectByName('yaw-pivot');
  const pitchPivot = cannonRoot.getObjectByName('pitch-pivot');
  if (yawPivot) yawPivot.rotation.y = yawRad;
  if (pitchPivot) pitchPivot.rotation.x = -pitchRad;
}

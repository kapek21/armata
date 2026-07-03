import * as THREE from 'three';
import type { LevelDefinition } from '../core/types.js';

/** Cel — przed armatą w osi Z. */
export const GOAL_PLANE_Z = -4;

/** Armata między kamerą a celem (+Z = strona gracza). */
export const CANNON_WORLD_Y = 0.55;
export const CANNON_WORLD_Z = 7.6;

/** Kamera tuż za armatą. */
const CAMERA_Y = 0.92;
const CAMERA_Z = 9.35;
const CAMERA_FOV = 54;

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

  for (const t of level.targets) addBox(t.position, t.size);
  for (const b of level.blocks) {
    if (!b.isStatic && b.type !== 'ground') addBox(b.position, b.size);
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

export function frameGameplayCamera(
  camera: THREE.PerspectiveCamera,
  cannonRoot: THREE.Object3D,
  goalFrame: GoalFrame,
  aspect: number,
): void {
  if (!Number.isFinite(aspect) || aspect <= 0) return;

  cannonRoot.position.set(0, CANNON_WORLD_Y, CANNON_WORLD_Z);
  cannonRoot.rotation.set(0, 0, 0);

  const lookAt = new THREE.Vector3(0, goalFrame.center.y, GOAL_PLANE_Z);

  camera.position.set(0, CAMERA_Y, CAMERA_Z);
  camera.up.set(0, 1, 0);
  camera.fov = CAMERA_FOV;
  camera.aspect = aspect;
  camera.near = 0.1;
  camera.far = 100;
  camera.lookAt(lookAt);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  cannonRoot.updateMatrixWorld(true);
}

export function muzzleWorldPosition(cannonRoot: THREE.Object3D): THREE.Vector3 {
  return cannonRoot.localToWorld(new THREE.Vector3(0, 0.58, -1.05));
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

export function resetCannonAim(cannonRoot: THREE.Object3D, level: LevelDefinition): void {
  const pitchRad = (level.cannon.angleMinDeg * Math.PI) / 180;
  applyCannonAim(cannonRoot, pitchRad, 0);
}

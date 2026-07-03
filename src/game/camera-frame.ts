import * as THREE from 'three';
import type { LevelDefinition } from '../core/types.js';

/** Płaszczyzna celu po normalizacji poziomu (ujemne Z = przed armatą). */
export const GOAL_PLANE_Z = -4;

/** Armata — pierwszy plan, przed kamerą w osi Z. */
export const CANNON_WORLD_Y = 0.45;
export const CANNON_WORLD_Z = 5.5;

/** Cel w górnej połowie kadru; armata na dole. */
const GOAL_NDC = new THREE.Vector2(0, 0.18);
const CANNON_NDC = new THREE.Vector2(0, -0.48);

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

export function normalizedGoalLookAt(goalFrame: GoalFrame): THREE.Vector3 {
  return new THREE.Vector3(0, goalFrame.center.y, GOAL_PLANE_Z);
}

function projectNdc(camera: THREE.PerspectiveCamera, point: THREE.Vector3): THREE.Vector2 {
  const v = point.clone().project(camera);
  return new THREE.Vector2(v.x, v.y);
}

function goalBoxCorners(lookAt: THREE.Vector3, size: THREE.Vector3): THREE.Vector3[] {
  const hx = size.x / 2;
  const hy = size.y / 2;
  const hz = size.z / 2;
  const corners: THREE.Vector3[] = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        corners.push(new THREE.Vector3(lookAt.x + sx * hx, lookAt.y + sy * hy, lookAt.z + sz * hz));
      }
    }
  }
  return corners;
}

function cannonAnchor(): THREE.Vector3 {
  return new THREE.Vector3(0, CANNON_WORLD_Y + 0.4, CANNON_WORLD_Z);
}

function placeCannonInWorld(cannonRoot: THREE.Object3D): void {
  cannonRoot.position.set(0, CANNON_WORLD_Y, CANNON_WORLD_Z);
  cannonRoot.rotation.set(0, 0, 0);
  cannonRoot.updateMatrixWorld(true);
}

function goalOverflow(
  camera: THREE.PerspectiveCamera,
  corners: THREE.Vector3[],
): { maxX: number; maxY: number; minY: number } {
  let maxX = 0;
  let maxY = 0;
  let minY = 0;
  for (const corner of corners) {
    const ndc = projectNdc(camera, corner);
    maxX = Math.max(maxX, Math.abs(ndc.x));
    maxY = Math.max(maxY, ndc.y);
    minY = Math.min(minY, ndc.y);
  }
  return { maxX, maxY, minY };
}

export function frameGameplayCamera(
  camera: THREE.PerspectiveCamera,
  cannonRoot: THREE.Object3D,
  goalFrame: GoalFrame,
  aspect: number,
): void {
  if (!Number.isFinite(aspect) || aspect <= 0) return;

  placeCannonInWorld(cannonRoot);

  const lookAt = normalizedGoalLookAt(goalFrame);
  const corners = goalBoxCorners(lookAt, goalFrame.size);
  const cannonPt = cannonAnchor();
  const portrait = aspect < 0.85;

  /** Kamera tuż za armatą, na wysokości lufy. */
  const camZ = CANNON_WORLD_Z + 2.35;
  let camY = CANNON_WORLD_Y + 0.85;
  let fov = portrait ? 56 : 50;

  camera.aspect = aspect;
  camera.near = 0.05;
  camera.far = 80;

  for (let i = 0; i < 36; i++) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
    camera.position.set(0, camY, camZ);
    camera.lookAt(lookAt);
    camera.updateMatrixWorld(true);

    const centerNdc = projectNdc(camera, lookAt);
    camY -= (centerNdc.y - GOAL_NDC.y) * 0.45;

    const { maxX, maxY, minY } = goalOverflow(camera, corners);
    const cannonNdc = projectNdc(camera, cannonPt);
    const cannErr = cannonNdc.y - CANNON_NDC.y;

    const tooWide = maxX > 0.42 || maxY > GOAL_NDC.y + 0.38 || minY < -0.05;
    if (tooWide) fov += 1.6;
    else if (fov > (portrait ? 52 : 46)) fov -= 0.3;

    camY += cannErr * 0.55;

    camY = THREE.MathUtils.clamp(camY, CANNON_WORLD_Y + 0.55, lookAt.y + 1.1);
    fov = THREE.MathUtils.clamp(fov, portrait ? 50 : 44, 72);

    if (
      !tooWide &&
      Math.abs(centerNdc.y - GOAL_NDC.y) < 0.015 &&
      Math.abs(cannErr) < 0.07 &&
      maxX < 0.4
    ) {
      break;
    }
  }

  camera.position.set(0, camY, camZ);
  camera.lookAt(lookAt);
  camera.updateProjectionMatrix();
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

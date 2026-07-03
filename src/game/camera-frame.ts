import * as THREE from 'three';
import type { LevelDefinition } from '../core/types.js';

/** Płaszczyzna celu po normalizacji poziomu (ujemne Z = przed armatą). */
export const GOAL_PLANE_Z = -4;

/** Armata w stałej pozycji świata — bliżej kamery niż cel. */
export const CANNON_WORLD_Y = 0.45;
export const CANNON_WORLD_Z = 5.5;

/** Cel w górnej części kadru; armata w dolnej. */
const GOAL_NDC = new THREE.Vector2(0, 0.22);
const GOAL_NDC_MARGIN = new THREE.Vector2(0.44, 0.38);
const CANNON_NDC = new THREE.Vector2(0, -0.52);

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
  return new THREE.Vector3(0, CANNON_WORLD_Y + 0.35, CANNON_WORLD_Z);
}

function placeCannonInWorld(cannonRoot: THREE.Object3D): void {
  cannonRoot.position.set(0, CANNON_WORLD_Y, CANNON_WORLD_Z);
  cannonRoot.rotation.set(0, 0, 0);
  cannonRoot.updateMatrixWorld(true);
}

export function frameGameplayCamera(
  camera: THREE.PerspectiveCamera,
  cannonRoot: THREE.Object3D,
  goalFrame: GoalFrame,
  aspect: number,
): void {
  placeCannonInWorld(cannonRoot);

  const lookAt = normalizedGoalLookAt(goalFrame);
  const corners = goalBoxCorners(lookAt, goalFrame.size);
  const cannonPt = cannonAnchor();
  const portrait = aspect < 0.85;

  camera.fov = portrait ? 50 : 44;
  camera.aspect = aspect;
  camera.near = 0.05;
  camera.far = 120;
  camera.updateProjectionMatrix();

  const goalSpan = Math.max(goalFrame.size.y * 1.12, goalFrame.size.x / aspect * 1.08, 2.2);
  const camToGoal = CANNON_WORLD_Z - GOAL_PLANE_Z + 2.8;
  let camZ = CANNON_WORLD_Z + 2.2 + goalSpan * 0.22;
  let camY = lookAt.y + Math.max(1.6, goalFrame.size.y * 0.42);

  for (let i = 0; i < 32; i++) {
    camera.position.set(0, camY, camZ);
    camera.lookAt(lookAt);
    camera.updateMatrixWorld(true);

    const centerNdc = projectNdc(camera, lookAt);
    const errCx = centerNdc.x - GOAL_NDC.x;
    const errCy = centerNdc.y - GOAL_NDC.y;

    let maxDx = 0;
    let maxDyTop = 0;
    let maxDyBot = 0;
    for (const corner of corners) {
      const ndc = projectNdc(camera, corner);
      maxDx = Math.max(maxDx, Math.abs(ndc.x - GOAL_NDC.x));
      const dy = ndc.y - GOAL_NDC.y;
      maxDyTop = Math.max(maxDyTop, dy);
      maxDyBot = Math.max(maxDyBot, -dy);
    }

    if (maxDx > GOAL_NDC_MARGIN.x || maxDyTop > GOAL_NDC_MARGIN.y || maxDyBot > GOAL_NDC_MARGIN.y) {
      camZ += 0.28;
    }

    camY -= errCy * 0.55;
    camZ += errCy * 0.08;

    const cannonNdc = projectNdc(camera, cannonPt);
    const errCannY = cannonNdc.y - CANNON_NDC.y;
    if (errCannY > 0.06) camZ += 0.14;
    if (errCannY < -0.06) camZ -= 0.1;

    camZ = THREE.MathUtils.clamp(camZ, CANNON_WORLD_Z + 1.6, camToGoal + 8);
    camY = THREE.MathUtils.clamp(camY, lookAt.y + 0.8, lookAt.y + 6.5);

    if (
      Math.abs(errCx) < 0.012 &&
      Math.abs(errCy) < 0.012 &&
      maxDx < GOAL_NDC_MARGIN.x + 0.02 &&
      maxDyTop < GOAL_NDC_MARGIN.y + 0.02 &&
      maxDyBot < GOAL_NDC_MARGIN.y + 0.02 &&
      Math.abs(errCannY) < 0.07
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

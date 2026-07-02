import * as THREE from 'three';
import type { LevelDefinition } from '../core/types.js';

/** Screen-space target for the cannon base (NDC: x center, y near bottom). */
const CANNON_NDC_Y = -0.68;
/** Screen-space target for level focus (NDC: center, upper-middle). */
const FOCUS_NDC_Y = 0.12;

export function levelFocusPoint(level: LevelDefinition): THREE.Vector3 {
  const points: THREE.Vector3[] = [];
  for (const t of level.targets) {
    points.push(new THREE.Vector3(t.position[0], t.position[1], t.position[2]));
  }
  for (const b of level.blocks) {
    if (b.type === 'ground') continue;
    points.push(new THREE.Vector3(b.position[0], b.position[1], b.position[2]));
  }
  if (points.length === 0) return new THREE.Vector3(0, 3, -2);
  const sum = points.reduce((acc, p) => acc.add(p), new THREE.Vector3());
  sum.multiplyScalar(1 / points.length);
  return new THREE.Vector3(0, sum.y, -2);
}

function projectToNdc(camera: THREE.PerspectiveCamera, point: THREE.Vector3): THREE.Vector3 {
  const v = point.clone().project(camera);
  return v;
}

/**
 * Places the world camera so `focus` lands near screen center and `cannonAnchor`
 * (muzzle area) lands near the bottom center of the viewport.
 */
export function frameGameplayCamera(
  camera: THREE.PerspectiveCamera,
  focus: THREE.Vector3,
  cannonAnchor: THREE.Vector3,
  aspect: number,
): void {
  camera.fov = aspect < 0.85 ? 58 : 52;
  camera.aspect = aspect;
  camera.near = 0.15;
  camera.far = 120;
  camera.updateProjectionMatrix();

  const camPos = new THREE.Vector3(0, focus.y * 0.35 + 1.2, 9.5 + (aspect < 0.85 ? 2 : 0));

  for (let i = 0; i < 28; i++) {
    camera.position.copy(camPos);
    camera.lookAt(focus);
    camera.updateMatrixWorld(true);

    const focusNdc = projectToNdc(camera, focus);
    const cannonNdc = projectToNdc(camera, cannonAnchor);

    const focusErrX = focusNdc.x;
    const focusErrY = focusNdc.y - FOCUS_NDC_Y;
    const cannonErrY = cannonNdc.y - CANNON_NDC_Y;

    camPos.x -= focusErrX * 1.8;
    camPos.y -= focusErrY * 2.4 + cannonErrY * 0.35;
    camPos.z += focusErrY * 1.2 - cannonErrY * 1.6;
  }

  camera.position.copy(camPos);
  camera.lookAt(focus);
  camera.updateProjectionMatrix();
}

/** World position of the cannon rig — close to camera, bottom of the view. */
export function placeCannonForCamera(
  camera: THREE.PerspectiveCamera,
  cannonRoot: THREE.Object3D,
  aspect: number,
): THREE.Vector3 {
  camera.updateMatrixWorld(true);
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
  const up = new THREE.Vector3().crossVectors(right, forward).normalize();

  const dist = aspect < 0.85 ? 3.2 : 2.85;
  const down = aspect < 0.85 ? 1.05 : 0.85;

  const worldPos = camera.position
    .clone()
    .add(forward.clone().multiplyScalar(-dist))
    .add(up.clone().multiplyScalar(-down));

  cannonRoot.position.copy(worldPos);
  cannonRoot.updateMatrixWorld(true);
  return worldPos;
}

export function cannonAnchorWorld(cannonRoot: THREE.Object3D): THREE.Vector3 {
  const anchor = new THREE.Vector3(0, 0.45, 0);
  return cannonRoot.localToWorld(anchor);
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

export function alignCannonToCamera(cannonRoot: THREE.Object3D, camera: THREE.PerspectiveCamera): void {
  const camQuat = camera.quaternion;
  cannonRoot.quaternion.copy(camQuat);
}

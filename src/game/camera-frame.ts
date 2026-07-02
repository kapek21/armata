import * as THREE from 'three';
import type { LevelDefinition } from '../core/types.js';

/** Bottom HUD + safe-area reserve (~14% viewport height). */
const HUD_BOTTOM_NDC = 0.14;

interface LayoutProfile {
  cannonNdcY: number;
  focusNdcY: number;
  fov: number;
  cameraStartZ: number;
  cannonForward: number;
  cannonDown: number;
}

function layoutProfile(aspect: number): LayoutProfile {
  const portrait = aspect < 0.85;
  const narrow = aspect < 0.55;

  if (portrait) {
    return {
      // Just above bottom HUD — barrel visible, not clipped
      cannonNdcY: -0.52 - HUD_BOTTOM_NDC * 0.35,
      focusNdcY: narrow ? 0.24 : 0.2,
      fov: narrow ? 54 : 56,
      cameraStartZ: narrow ? 11.2 : 10.6,
      cannonForward: narrow ? 2.65 : 2.85,
      cannonDown: narrow ? 0.62 : 0.72,
    };
  }

  return {
    cannonNdcY: -0.58,
    focusNdcY: 0.14,
    fov: 50,
    cameraStartZ: 9.4,
    cannonForward: 3.05,
    cannonDown: 0.82,
  };
}

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
  return new THREE.Vector3(sum.x, sum.y, -2);
}

function projectToNdc(camera: THREE.PerspectiveCamera, point: THREE.Vector3): THREE.Vector3 {
  return point.clone().project(camera);
}

function placeCannonRelative(
  camera: THREE.PerspectiveCamera,
  cannonRoot: THREE.Object3D,
  forward: number,
  down: number,
): void {
  camera.updateMatrixWorld(true);
  const viewForward = new THREE.Vector3();
  camera.getWorldDirection(viewForward);
  const right = new THREE.Vector3().crossVectors(viewForward, camera.up).normalize();
  const up = new THREE.Vector3().crossVectors(right, viewForward).normalize();

  cannonRoot.position
    .copy(camera.position)
    .add(viewForward.clone().multiplyScalar(-forward))
    .add(up.clone().multiplyScalar(-down));
  cannonRoot.updateMatrixWorld(true);
}

export function frameGameplayCamera(
  camera: THREE.PerspectiveCamera,
  cannonRoot: THREE.Object3D,
  focus: THREE.Vector3,
  aspect: number,
): void {
  const profile = layoutProfile(aspect);
  let forward = profile.cannonForward;
  let down = profile.cannonDown;

  camera.fov = profile.fov;
  camera.aspect = aspect;
  camera.near = 0.12;
  camera.far = 120;
  camera.updateProjectionMatrix();

  const camPos = new THREE.Vector3(focus.x * 0.15, focus.y * 0.32 + 1.15, profile.cameraStartZ);

  for (let i = 0; i < 32; i++) {
    placeCannonRelative(camera, cannonRoot, forward, down);
    alignCannonToCamera(cannonRoot, camera);

    camera.position.copy(camPos);
    camera.lookAt(focus);
    camera.updateMatrixWorld(true);

    const focusNdc = projectToNdc(camera, focus);
    const anchor = cannonAnchorWorld(cannonRoot);
    const cannonNdc = projectToNdc(camera, anchor);

    const focusErrX = focusNdc.x;
    const focusErrY = focusNdc.y - profile.focusNdcY;
    const cannonErrY = cannonNdc.y - profile.cannonNdcY;

    camPos.x -= focusErrX * 2.0;
    camPos.y -= focusErrY * 2.2;
    camPos.z += focusErrY * 1.0 - cannonErrY * 0.9;

    down += cannonErrY * 0.55;
    forward += cannonErrY * 0.25;

    down = THREE.MathUtils.clamp(down, 0.45, 1.35);
    forward = THREE.MathUtils.clamp(forward, 2.2, 4.2);
  }

  placeCannonRelative(camera, cannonRoot, forward, down);
  alignCannonToCamera(cannonRoot, camera);
  camera.position.copy(camPos);
  camera.lookAt(focus);
  camera.updateProjectionMatrix();
}

export function placeCannonForCamera(
  camera: THREE.PerspectiveCamera,
  cannonRoot: THREE.Object3D,
  aspect: number,
): THREE.Vector3 {
  const profile = layoutProfile(aspect);
  placeCannonRelative(camera, cannonRoot, profile.cannonForward, profile.cannonDown);
  alignCannonToCamera(cannonRoot, camera);
  return cannonRoot.position.clone();
}

export function cannonAnchorWorld(cannonRoot: THREE.Object3D): THREE.Vector3 {
  const anchor = new THREE.Vector3(0, 0.35, 0.15);
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
  cannonRoot.quaternion.copy(camera.quaternion);
}

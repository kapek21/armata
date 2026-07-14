#!/usr/bin/env node
/**
 * Weryfikacja celowania na celach run — nisko / lewo / strefa armaty.
 */
import * as THREE from '../node_modules/three/build/three.module.js';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const GOAL_PLANE_Z = -4;
const CANNON_WORLD_Y = 0.45;
const CANNON_WORLD_Z = 8.2;
const CANNON_SCALE = 0.42;
const CAMERA_Y = 1.28;
const CAMERA_Z = 9.35;
const CAMERA_FOV = 55;
const GRAVITY = 9.81;
const BALL_RADIUS = 0.35;
const BALL_MASS = 2.2 * ((4 / 3) * Math.PI * BALL_RADIUS ** 3);
const AIM_CANNON_DEAD_ZONE_Y = 0.72;

function computeGoalFrame(level) {
  const box = new THREE.Box3();
  const add = (pos, size) => {
    const [x, y, z] = pos;
    const [hw, hh, hd] = size.map((s) => s / 2);
    box.expandByPoint(new THREE.Vector3(x - hw, y - hh, z - hd));
    box.expandByPoint(new THREE.Vector3(x + hw, y + hh, z + hd));
  };
  for (const m of level.enemyCastle.modules) {
    if (m.isStatic && m.type === 'foundation') continue;
    if (m.importance === 'decorative' && m.type !== 'keystone') continue;
    add(m.position, m.size);
  }
  const center = new THREE.Vector3();
  box.getCenter(center);
  return { center, worldOffset: new THREE.Vector3(-center.x, 0, GOAL_PLANE_Z - center.z) };
}

function off(pos, o) {
  return [pos[0] + o.x, pos[1] + o.y, pos[2] + o.z];
}

function buildCannon() {
  const root = new THREE.Group();
  root.position.set(0, CANNON_WORLD_Y, CANNON_WORLD_Z);
  root.scale.setScalar(CANNON_SCALE);
  const yawP = new THREE.Group();
  yawP.name = 'yaw-pivot';
  yawP.position.y = 0.48;
  const pitchP = new THREE.Group();
  pitchP.name = 'pitch-pivot';
  pitchP.add(new THREE.Object3D());
  yawP.add(pitchP);
  root.add(yawP);
  return root;
}

function frameCamera(camera, goalFrame, aspect) {
  const lookAtY = THREE.MathUtils.lerp(2.1, goalFrame.center.y, 0.68);
  camera.position.set(0, CAMERA_Y, CAMERA_Z);
  camera.fov = CAMERA_FOV;
  camera.aspect = aspect;
  camera.lookAt(0, lookAtY, GOAL_PLANE_Z);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}

function sanitize(clientX, clientY, rect) {
  const relY = (clientY - rect.top) / rect.height;
  if (relY > AIM_CANNON_DEAD_ZONE_Y) {
    return { x: clientX, y: rect.top + rect.height * AIM_CANNON_DEAD_ZONE_Y };
  }
  return { x: clientX, y: clientY };
}

function sanitizeOld(clientX, clientY, rect) {
  const relY = (clientY - rect.top) / rect.height;
  if (relY > 0.68) {
    return { x: rect.left + rect.width * 0.5, y: rect.top + rect.height * 0.38 };
  }
  return { x: clientX, y: clientY };
}

function pickTarget(camera, clientX, clientY, rect, meshes) {
  const ndc = new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1,
  );
  const rc = new THREE.Raycaster();
  rc.setFromCamera(ndc, camera);
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 4);
  const hit = new THREE.Vector3();

  if (meshes.length > 0) {
    const hits = rc.intersectObjects(meshes, false);
    if (hits.length > 0) {
      let best = hits[0];
      let bestD = Infinity;
      for (const h of hits) {
        const box = new THREE.Box3().setFromObject(h.object);
        const c = box.getCenter(new THREE.Vector3());
        c.project(camera);
        const sx = (c.x * 0.5 + 0.5) * rect.width + rect.left;
        const sy = (-c.y * 0.5 + 0.5) * rect.height + rect.top;
        const d = Math.hypot(sx - clientX, sy - clientY);
        if (d < bestD) {
          bestD = d;
          best = h;
        }
      }
      const box = new THREE.Box3().setFromObject(best.object);
      return { point: box.getCenter(new THREE.Vector3()), id: best.object.userData.id };
    }
  }
  return rc.ray.intersectPlane(plane, hit)
    ? { point: hit.clone(), id: 'plane' }
    : null;
}

function restMuzzle(cannon) {
  const yawP = cannon.getObjectByName('yaw-pivot');
  const pitchP = cannon.getObjectByName('pitch-pivot');
  yawP.rotation.y = 0;
  pitchP.rotation.x = 0;
  cannon.updateMatrixWorld(true);
  return pitchP.localToWorld(new THREE.Vector3(0, 0, -1.58)).clone();
}

function ballSpeed(power) {
  return (6 + power * 16) / BALL_MASS;
}

function aimAndSim(cannon, target, power = 0.85) {
  const muzzle = restMuzzle(cannon);
  const dx = target.x - muzzle.x;
  const dy = target.y - muzzle.y;
  const dz = target.z - muzzle.z;
  const dh = Math.hypot(dx, dz);
  const v = ballSpeed(power);
  const g = GRAVITY;
  const disc = v * v * v * v - g * (g * dh * dh + 2 * dy * v * v);
  let pitch;
  const yaw = THREE.MathUtils.clamp(-Math.atan2(dx, -dz), (-50 * Math.PI) / 180, (50 * Math.PI) / 180);
  if (disc < 0) {
    pitch = THREE.MathUtils.clamp(Math.atan2(dy, dh), (-10 * Math.PI) / 180, (48 * Math.PI) / 180);
  } else {
    const sd = Math.sqrt(disc);
    pitch = Math.atan((v * v - sd) / (g * dh));
    pitch = THREE.MathUtils.clamp(pitch, (-10 * Math.PI) / 180, (48 * Math.PI) / 180);
  }
  const yawP = cannon.getObjectByName('yaw-pivot');
  const pitchP = cannon.getObjectByName('pitch-pivot');
  yawP.rotation.y = yaw;
  pitchP.rotation.x = pitch;
  cannon.updateMatrixWorld(true);
  const from = pitchP.localToWorld(new THREE.Vector3(0, 0, -0.18));
  const to = pitchP.localToWorld(new THREE.Vector3(0, 0, -1.58));
  const vel = to.sub(from).normalize().multiplyScalar(v);
  const pos = pitchP.localToWorld(new THREE.Vector3(0, 0, -1.58));
  let minD = Infinity;
  for (let i = 0; i < 90; i++) {
    pos.addScaledVector(vel, 0.04);
    vel.y -= g * 0.04;
    minD = Math.min(minD, pos.distanceTo(target));
    if (minD < 0.55) return { hit: true, minD, yawDeg: (yaw * 180) / Math.PI, pitchDeg: (pitch * 180) / Math.PI, discOk: disc >= 0 };
    if (pos.y < -3) break;
  }
  return { hit: false, minD, yawDeg: (yaw * 180) / Math.PI, pitchDeg: (pitch * 180) / Math.PI, discOk: disc >= 0 };
}

function testLevel(file, sanitizeFn, label) {
  const level = JSON.parse(readFileSync(file, 'utf8'));
  const gf = computeGoalFrame(level);
  const meshes = [];
  let minX = Infinity;
  let minY = Infinity;
  let minId = '';
  for (const m of level.enemyCastle.modules) {
    if (m.isStatic && m.type === 'foundation') continue;
    const p = off(m.position, gf.worldOffset);
    if (p[0] < minX) {
      minX = p[0];
      minId = m.id;
    }
    if (p[1] < minY) minY = p[1];
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...m.size));
    mesh.position.set(...p);
    mesh.userData.id = m.id;
    mesh.updateMatrixWorld(true);
    meshes.push(mesh);
  }
  const lowLeft = meshes.find((m) => m.userData.id === minId) ?? meshes[0];
  const lowCenter = meshes.reduce((a, b) => {
    const ca = new THREE.Box3().setFromObject(a).getCenter(new THREE.Vector3());
    const cb = new THREE.Box3().setFromObject(b).getCenter(new THREE.Vector3());
    return Math.abs(ca.x) + ca.y * 0.3 < Math.abs(cb.x) + cb.y * 0.3 ? a : b;
  });

  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 390 / 700, 0.1, 100);
  frameCamera(camera, gf, 390 / 700);
  const rect = { left: 0, top: 0, width: 390, height: 700 };
  const cannon = buildCannon();

  function screenOf(mesh) {
    const c = new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3());
    c.project(camera);
    return { x: (c.x * 0.5 + 0.5) * 390, y: (-c.y * 0.5 + 0.5) * 700 };
  }

  let fails = 0;
  for (const [tag, mesh] of [
    ['low-left', lowLeft],
    ['low-center', lowCenter],
  ]) {
    const s = screenOf(mesh);
    for (const [zone, cy] of [
      ['direct', s.y],
      ['deadzone', Math.min(680, s.y + 120)],
    ]) {
      for (const fn of [[sanitizeFn, label]]) {
        const c = fn[0](s.x, cy, rect);
        const pick = pickTarget(camera, c.x, c.y, rect, meshes);
        if (!pick) {
          fails++;
          continue;
        }
        const shot = aimAndSim(cannon, pick.point);
        if (!shot.hit) fails++;
      }
    }
  }
  return fails;
}

const dataDir = join(import.meta.dirname, '../src/levels/run/data');
const files = readdirSync(dataDir).filter((f) => f.endsWith('.json')).sort();
let oldFails = 0;
let newFails = 0;
for (const f of files) {
  const path = join(dataDir, f);
  oldFails += testLevel(path, sanitizeOld, 'old');
  newFails += testLevel(path, sanitize, 'new');
}
console.log('Stara sanitize — błędy:', oldFails, '/', files.length * 4);
console.log('Nowa sanitize — błędy:', newFails, '/', files.length * 4);

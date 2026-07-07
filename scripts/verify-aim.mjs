import * as THREE from '../node_modules/three/build/three.module.js';
import { readFileSync } from 'fs';

const GOAL_PLANE_Z = -4;
const CANNON_WORLD_Y = 0.55;
const CANNON_WORLD_Z = 8.2;
const CANNON_SCALE = 0.55;
const CAMERA_Y = 1.4;
const CAMERA_Z = 9.2;
const CAMERA_FOV = 54;
const GRAVITY = 9.81;
const BALL_RADIUS = 0.35;
const BALL_MASS = 2.2 * ((4 / 3) * Math.PI * BALL_RADIUS ** 3);

function computeGoalFrame(level) {
  const box = new THREE.Box3();
  const add = (pos, size) => {
    const [x, y, z] = pos;
    const [hw, hh, hd] = size.map((s) => s / 2);
    box.expandByPoint(new THREE.Vector3(x - hw, y - hh, z - hd));
    box.expandByPoint(new THREE.Vector3(x + hw, y + hh, z + hd));
  };
  for (const t of level.targets) add(t.position, t.size);
  for (const b of level.blocks) {
    if (!b.isStatic && b.type !== 'ground') add(b.position, b.size);
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
  yawP.position.y = 0.52;
  const pitchP = new THREE.Group();
  pitchP.name = 'pitch-pivot';
  pitchP.add(new THREE.Object3D());
  yawP.add(pitchP);
  root.add(yawP);
  return root;
}

function applyAim(cannon, pitch, yaw, pitchSign) {
  const yawP = cannon.getObjectByName('yaw-pivot');
  const pitchP = cannon.getObjectByName('pitch-pivot');
  yawP.rotation.y = yaw;
  pitchP.rotation.x = pitchSign * pitch;
  cannon.updateMatrixWorld(true);
}

function restMuzzle(cannon) {
  const yawP = cannon.getObjectByName('yaw-pivot');
  const pitchP = cannon.getObjectByName('pitch-pivot');
  yawP.rotation.y = 0;
  pitchP.rotation.x = 0;
  cannon.updateMatrixWorld(true);
  return pitchP.localToWorld(new THREE.Vector3(0, 0, -1.72)).clone();
}

function ballSpeed(power) {
  return (6 + power * 16) / BALL_MASS;
}

function worldDir(yaw, pitch) {
  const cp = Math.cos(pitch);
  return new THREE.Vector3(Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
}

function arcBlocked(muzzle, yaw, pitch, speed, obstacles, target) {
  const vel = worldDir(yaw, pitch).multiplyScalar(speed);
  const pos = muzzle.clone();
  const dt = 0.045;
  for (let i = 0; i < 42; i++) {
    pos.addScaledVector(vel, dt);
    vel.y -= GRAVITY * dt;
    if (pos.distanceToSquared(target) < 0.28 * 0.28) return false;
    for (const box of obstacles) {
      if (box.min.y > target.y + 0.2) continue;
      if (box.containsPoint(pos)) return true;
    }
    if (pos.y < -4) return false;
  }
  return false;
}

function ballisticPitch(muzzle, target, power, obstacles) {
  const dx = target.x - muzzle.x;
  const dy = target.y - muzzle.y;
  const dz = target.z - muzzle.z;
  const dh = Math.hypot(dx, dz);
  const v = ballSpeed(power);
  const v2 = v * v;
  const g = GRAVITY;
  const disc = v2 * v2 - g * (g * dh * dh + 2 * dy * v2);
  const yaw = Math.atan2(dx, -dz);
  if (disc < 0) return { yaw, pitch: Math.atan2(dy + 1.2, dh) };
  const sd = Math.sqrt(disc);
  const pitchLow = Math.atan((v2 - sd) / (g * dh));
  const pitchHigh = Math.atan((v2 + sd) / (g * dh));
  const direct = Math.atan2(dy, dh);
  const lb = arcBlocked(muzzle, yaw, pitchLow, v, obstacles, target);
  const hb = arcBlocked(muzzle, yaw, pitchHigh, v, obstacles, target);
  let pitch;
  if (lb && !hb) pitch = pitchHigh;
  else if (!lb && hb) pitch = pitchLow;
  else if (lb && hb) pitch = pitchHigh;
  else pitch = pitchLow >= direct * 0.85 ? pitchLow : pitchHigh;
  return { yaw, pitch: THREE.MathUtils.clamp(pitch, (4 * Math.PI) / 180, (72 * Math.PI) / 180) };
}

function fireBall(cannon, target, power, obstacles, pitchSign) {
  const muzzle = restMuzzle(cannon);
  const { yaw, pitch } = ballisticPitch(muzzle, target, power, obstacles);
  applyAim(cannon, pitch, yaw, pitchSign);
  const pitchP = cannon.getObjectByName('pitch-pivot');
  const spawn = pitchP.localToWorld(new THREE.Vector3(0, 0, -1.72));
  const from = pitchP.localToWorld(new THREE.Vector3(0, 0, -0.2));
  const to = pitchP.localToWorld(new THREE.Vector3(0, 0, -1.72));
  const vel = to.sub(from).normalize().multiplyScalar(ballSpeed(power));
  const pos = spawn.clone();
  let minD = Infinity;
  let hit = false;
  for (let i = 0; i < 90; i++) {
    pos.addScaledVector(vel, 0.04);
    vel.y -= GRAVITY * 0.04;
    const d = pos.distanceTo(target);
    minD = Math.min(minD, d);
    if (d < 0.5) {
      hit = true;
      break;
    }
    if (pos.y < -3) break;
  }
  return { hit, minD };
}

function pickNew(camera, cx, cy, rect, meshes) {
  const ndc = new THREE.Vector2(
    ((cx - rect.left) / rect.width) * 2 - 1,
    -((cy - rect.top) / rect.height) * 2 + 1,
  );
  const rc = new THREE.Raycaster();
  rc.setFromCamera(ndc, camera);
  const hits = rc.intersectObjects(meshes, false);
  if (!hits.length) return null;
  let best = hits[0];
  let bestD = Infinity;
  for (const h of hits) {
    const box = new THREE.Box3().setFromObject(h.object);
    const c = box.getCenter(new THREE.Vector3());
    c.project(camera);
    const sx = (c.x * 0.5 + 0.5) * rect.width + rect.left;
    const sy = (-c.y * 0.5 + 0.5) * rect.height + rect.top;
    const d = Math.hypot(sx - cx, sy - cy);
    if (d < bestD) {
      bestD = d;
      best = h;
    }
  }
  const box = new THREE.Box3().setFromObject(best.object);
  return { mesh: best.object, point: box.getCenter(new THREE.Vector3()), hitCount: hits.length };
}

function pickOld(camera, cx, cy, rect, meshes) {
  const ndc = new THREE.Vector2(
    ((cx - rect.left) / rect.width) * 2 - 1,
    -((cy - rect.top) / rect.height) * 2 + 1,
  );
  const rc = new THREE.Raycaster();
  rc.setFromCamera(ndc, camera);
  const hits = rc.intersectObjects(meshes, false);
  if (!hits.length) return null;
  const box = new THREE.Box3().setFromObject(hits[0].object);
  return { mesh: hits[0].object, point: box.getCenter(new THREE.Vector3()), hitCount: hits.length };
}

function testLevel(file, pitchSign, label) {
  const level = JSON.parse(readFileSync(file, 'utf8'));
  const gf = computeGoalFrame(level);
  const meshes = [];
  const labels = [];
  for (const b of level.blocks) {
    if (b.isStatic) continue;
    const p = off(b.position, gf.worldOffset);
    const m = new THREE.Mesh(new THREE.BoxGeometry(...b.size));
    m.position.set(...p);
    m.updateMatrixWorld(true);
    meshes.push(m);
    labels.push(`wood@${b.position[1]}`);
  }
  for (const t of level.targets) {
    const p = off(t.position, gf.worldOffset);
    const m = new THREE.Mesh(new THREE.BoxGeometry(...t.size));
    m.position.set(...p);
    m.updateMatrixWorld(true);
    meshes.push(m);
    labels.push(`target:${t.id}`);
  }

  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 9 / 16, 0.1, 100);
  camera.position.set(0, CAMERA_Y, CAMERA_Z);
  camera.lookAt(0, gf.center.y, GOAL_PLANE_Z);
  camera.updateMatrixWorld(true);
  const rect = { left: 0, top: 0, width: 390, height: 844 };
  const cannon = buildCannon();

  console.log(`\n${label} — ${level.id} (${level.name})`);
  let newPick = 0;
  let oldPick = 0;
  let hits = 0;

  for (let i = 0; i < meshes.length; i++) {
    const mesh = meshes[i];
    const box = new THREE.Box3().setFromObject(mesh);
    const center = box.getCenter(new THREE.Vector3());
    const projected = center.clone().project(camera);
    const cx = (projected.x * 0.5 + 0.5) * rect.width;
    const cy = (-projected.y * 0.5 + 0.5) * rect.height;

    const pn = pickNew(camera, cx, cy, rect, meshes);
    const po = pickOld(camera, cx, cy, rect, meshes);
    const newOk = pn && Math.abs(pn.point.y - center.y) < 0.06;
    const oldOk = po && Math.abs(po.point.y - center.y) < 0.06;
    if (newOk) newPick++;
    if (oldOk) oldPick++;

    const obstacles = meshes
      .filter((m) => m !== pn?.mesh)
      .map((m) => {
        const b = new THREE.Box3().setFromObject(m);
        b.expandByScalar(BALL_RADIUS * 0.85);
        return b;
      });
    const shot = pn ? fireBall(cannon, pn.point, 1, obstacles, pitchSign) : null;
    if (shot?.hit) hits++;

    console.log(
      `  ${labels[i]} y=${center.y.toFixed(1)} | nowy:${newOk ? 'OK' : 'ZŁY'} stary:${oldOk ? 'OK' : 'ZŁY'} (${po?.hitCount ?? 0} traf.) | strzał:${shot?.hit ? 'TRAF' : `miss ${shot?.minD.toFixed(2)}`}`,
    );
  }
  console.log(`  PODSUMOWANIE: wybór nowy ${newPick}/${meshes.length}, stary ${oldPick}/${meshes.length}, trafienia ${hits}/${meshes.length}`);
}

console.log('=== WERYFIKACJA CELOWANIA W WIEŻĘ ===');
testLevel('./src/levels/data/level-001.json', -1, 'OBECNY KOD (pitch.x = -pitch)');
testLevel('./src/levels/data/level-001.json', +1, 'POPRAWIONY ZNAK PITCH');
testLevel('./src/levels/data/level-002.json', -1, 'OBECNY L2');
testLevel('./src/levels/data/level-002.json', +1, 'POPRAWIONY L2');
testLevel('./src/levels/data/level-003.json', +1, 'POPRAWIONY L3');

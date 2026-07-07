import * as THREE from '../node_modules/three/build/three.module.js';
import { readFileSync } from 'fs';

const GOAL_PLANE_Z = -4;
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

function pickAimTarget(camera, clientX, clientY, rect, meshes) {
  const ndc = new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1,
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
    const d = Math.hypot(sx - clientX, sy - clientY);
    if (d < bestD) {
      bestD = d;
      best = h;
    }
  }
  const box = new THREE.Box3().setFromObject(best.object);
  return { mesh: best.object, point: box.getCenter(new THREE.Vector3()), hitCount: hits.length };
}

function screenOf(mesh, camera, rect) {
  const box = new THREE.Box3().setFromObject(mesh);
  const c = box.getCenter(new THREE.Vector3());
  c.project(camera);
  return {
    x: (c.x * 0.5 + 0.5) * rect.width + rect.left,
    y: (-c.y * 0.5 + 0.5) * rect.height + rect.top,
    center: box.getCenter(new THREE.Vector3()),
  };
}

function buildLevelMeshes(level) {
  const gf = computeGoalFrame(level);
  const items = [];
  for (const b of level.blocks) {
    if (b.isStatic) continue;
    const p = off(b.position, gf.worldOffset);
    const m = new THREE.Mesh(new THREE.BoxGeometry(...b.size));
    m.position.set(...p);
    m.userData.label = `wood@${b.position[1]}:${p[0].toFixed(1)}`;
    m.updateMatrixWorld(true);
    items.push({ mesh: m, label: m.userData.label, cleared: false });
  }
  for (const t of level.targets) {
    const p = off(t.position, gf.worldOffset);
    const m = new THREE.Mesh(new THREE.BoxGeometry(...t.size));
    m.position.set(...p);
    m.userData.label = `target:${t.id}`;
    m.updateMatrixWorld(true);
    items.push({ mesh: m, label: m.userData.label, cleared: false, isTarget: true });
  }
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 9 / 16, 0.1, 100);
  camera.position.set(0, CAMERA_Y, CAMERA_Z);
  camera.lookAt(0, gf.center.y, GOAL_PLANE_Z);
  camera.updateMatrixWorld(true);
  return { items, camera, gf, rect: { left: 0, top: 0, width: 390, height: 844 } };
}

function aimMeshesCurrent(items) {
  return items.filter((e) => !e.cleared).map((e) => e.mesh);
}

function aimMeshesBuggy(items) {
  return items.map((e) => e.mesh);
}

function testPickPerShot(label, items, camera, rect, meshFilter) {
  const meshes = meshFilter(items);
  let ok = 0;
  const rows = [];
  for (let shot = 1; shot <= 5; shot++) {
    for (const item of items.filter((e) => !e.cleared)) {
      const sc = screenOf(item.mesh, camera, rect);
      const pick = pickAimTarget(camera, sc.x, sc.y, rect, meshes);
      const good = pick && pick.mesh === item.mesh;
      if (good) ok++;
      rows.push({ shot, label: item.label, good, hits: pick?.hitCount ?? 0 });
    }
  }
  const total = rows.length;
  console.log(`  ${label}: ${ok}/${total} poprawnych wyborów (5 rund × aktywne klocki)`);
  const fails = rows.filter((r) => !r.good);
  if (fails.length) {
    for (const f of fails.slice(0, 5)) {
      console.log(`    strzał ${f.shot} ${f.label} FAIL (${f.hits} trafień raycast)`);
    }
    if (fails.length > 5) console.log(`    ... i ${fails.length - 5} więcej`);
  }
  return { ok, total, fails };
}

function simulateTowerShift(items) {
  const tower = items.filter((e) => !e.cleared && !e.isTarget);
  for (const item of tower) {
    item.mesh.position.x += 0.15;
    item.mesh.position.y -= 0.08;
    item.mesh.rotation.z = 0.12;
    item.mesh.updateMatrixWorld(true);
  }
}

function clearFirstTarget(items) {
  const t = items.find((e) => e.isTarget && !e.cleared);
  if (t) {
    t.cleared = true;
    t.mesh.parent?.remove?.(t.mesh);
  }
}

console.log('=== WERYFIKACJA: KAŻDY STRZAŁ OSOBNY CEL ===\n');

const level = JSON.parse(readFileSync('./src/levels/data/level-002.json', 'utf8'));
let ctx = buildLevelMeshes(level);
console.log('Level-002 (kolumna + boczne klocki):');
testPickPerShot('Strzały 1–5, klocki na miejscu', ctx.items, ctx.camera, ctx.rect, aimMeshesCurrent);

simulateTowerShift(ctx.items);
console.log('\nPo przesunięciu wieży (symulacja po 1. strzale):');
testPickPerShot('Strzały 1–5, przesunięta wieża', ctx.items, ctx.camera, ctx.rect, aimMeshesCurrent);

clearFirstTarget(ctx.items);
console.log('\nPo zestrzeleniu celu (mesh usunięty, wpis w tablicy):');
const r1 = testPickPerShot('Filtr: tylko aktywne (poprawny)', ctx.items, ctx.camera, ctx.rect, aimMeshesCurrent);
const r2 = testPickPerShot('Filtr: wszystkie wpisy (bug jak w kodzie)', ctx.items, ctx.camera, ctx.rect, aimMeshesBuggy);
if (r2.fails.length > r1.fails.length) {
  console.log('  ⚠ Usunięte cele w aimMeshes() mogą psuć kolejne strzały');
}

console.log('\n--- Siatka 3×4 (test horyzontalny + wertykalny) ---');
const gridItems = [];
const gridCamera = new THREE.PerspectiveCamera(CAMERA_FOV, 9 / 16, 0.1, 100);
gridCamera.position.set(0, CAMERA_Y, CAMERA_Z);
gridCamera.lookAt(0, 2, GOAL_PLANE_Z);
gridCamera.updateMatrixWorld(true);
const gridRect = { left: 0, top: 0, width: 390, height: 844 };
for (let row = 0; row < 4; row++) {
  for (let col = 0; col < 3; col++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8));
    m.position.set((col - 1) * 1.0, 0.4 + row * 0.85, GOAL_PLANE_Z);
    m.userData.label = `r${row}c${col}`;
    m.updateMatrixWorld(true);
    gridItems.push({ mesh: m, label: m.userData.label, cleared: false });
  }
}
testPickPerShot('Siatka 3×4, 5 rund', gridItems, gridCamera, gridRect, aimMeshesCurrent);

console.log('\n--- Fizyka: każdy strzał w inny klocek (level-001) ---');
const l1 = JSON.parse(readFileSync('./src/levels/data/level-001.json', 'utf8'));
const l1ctx = buildLevelMeshes(l1);
const cannon = new THREE.Group();
cannon.position.set(0, 0.55, 8.2);
cannon.scale.setScalar(0.55);
const yawP = new THREE.Group();
yawP.name = 'yaw-pivot';
yawP.position.y = 0.52;
const pitchP = new THREE.Group();
pitchP.name = 'pitch-pivot';
pitchP.add(new THREE.Object3D());
yawP.add(pitchP);
cannon.add(yawP);

function fireAt(targetPt, obstacles) {
  yawP.rotation.y = 0;
  pitchP.rotation.x = 0;
  cannon.updateMatrixWorld(true);
  const muzzle = pitchP.localToWorld(new THREE.Vector3(0, 0, -1.72));
  const v = (6 + 16) / BALL_MASS;
  const dx = targetPt.x - muzzle.x;
  const dy = targetPt.y - muzzle.y;
  const dz = targetPt.z - muzzle.z;
  const dh = Math.hypot(dx, dz);
  const disc = v * v * v * v - GRAVITY * (GRAVITY * dh * dh + 2 * dy * v * v);
  const yaw = Math.atan2(dx, -dz);
  const sd = Math.sqrt(Math.max(0, disc));
  const pl = Math.atan((v * v - sd) / (GRAVITY * dh));
  const ph = Math.atan((v * v + sd) / (GRAVITY * dh));
  const direct = Math.atan2(dy, dh);
  function blocked(pitch) {
    const cp = Math.cos(pitch);
    const vel = new THREE.Vector3(Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp).multiplyScalar(v);
    const pos = muzzle.clone();
    for (let i = 0; i < 42; i++) {
      pos.addScaledVector(vel, 0.045);
      vel.y -= GRAVITY * 0.045;
      if (pos.distanceToSquared(targetPt) < 0.28 * 0.28) return false;
      for (const ob of obstacles) {
        if (ob.min.y > targetPt.y + 0.2) continue;
        if (ob.containsPoint(pos)) return true;
      }
      if (pos.y < -4) return false;
    }
    return false;
  }
  const lb = blocked(pl);
  const hb = blocked(ph);
  let pitch;
  if (lb && !hb) pitch = ph;
  else if (!lb && hb) pitch = pl;
  else if (lb && hb) pitch = ph;
  else pitch = pl >= direct * 0.85 ? pl : ph;
  yawP.rotation.y = yaw;
  pitchP.rotation.x = pitch;
  cannon.updateMatrixWorld(true);
  const spawn = pitchP.localToWorld(new THREE.Vector3(0, 0, -1.72));
  const f = pitchP.localToWorld(new THREE.Vector3(0, 0, -0.2));
  const t = pitchP.localToWorld(new THREE.Vector3(0, 0, -1.72));
  const vel = t.sub(f).normalize().multiplyScalar(v);
  const pos = spawn.clone();
  const targetBox = new THREE.Box3().setFromCenterAndSize(targetPt, new THREE.Vector3(1, 1, 1));
  targetBox.expandByScalar(BALL_RADIUS);
  for (let i = 0; i < 100; i++) {
    pos.addScaledVector(vel, 0.04);
    vel.y -= GRAVITY * 0.04;
    if (targetBox.containsPoint(pos)) return 'HIT';
    for (const ob of obstacles) {
      if (ob.containsPoint(pos)) return 'BLOCKED';
    }
    if (pos.y < -3) break;
  }
  return 'MISS';
}

const shotOrder = [0, 2, 1, 3];
for (let s = 0; s < shotOrder.length; s++) {
  const idx = shotOrder[s];
  const item = l1ctx.items[idx];
  const sc = screenOf(item.mesh, l1ctx.camera, l1ctx.rect);
  const meshes = aimMeshesCurrent(l1ctx.items);
  const pick = pickAimTarget(l1ctx.camera, sc.x, sc.y, l1ctx.rect, meshes);
  const pickOk = pick?.mesh === item.mesh;
  const obstacles = meshes
    .filter((m) => m !== item.mesh)
    .map((m) => {
      const b = new THREE.Box3().setFromObject(m);
      b.expandByScalar(BALL_RADIUS * 0.85);
      return b;
    });
  const result = pickOk ? fireAt(pick.point, obstacles) : 'PICK_FAIL';
  console.log(`  Strzał ${s + 1} → ${item.label}: wybór ${pickOk ? 'OK' : 'FAIL'}, fizyka ${result}`);
  if (result === 'HIT') {
    item.cleared = true;
    item.mesh.visible = false;
    for (const other of l1ctx.items) {
      if (!other.cleared && other !== item) {
        other.mesh.position.y -= 0.9;
        other.mesh.updateMatrixWorld(true);
      }
    }
  }
}

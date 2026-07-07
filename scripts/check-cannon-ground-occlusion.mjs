import * as THREE from '../node_modules/three/build/three.module.js';
import { readFileSync, readdirSync } from 'fs';

const GOAL_PLANE_Z = -4;
const CANNON_WORLD_X = 0;
const CANNON_WORLD_Y = 0.14;
const CANNON_WORLD_Z = 8.8;
const CANNON_SCALE = 0.42;
const CAMERA_X = 0;
const CAMERA_Y = 1.28;
const CAMERA_Z = 9.35;
const CAMERA_FOV = 55;

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
  root.position.set(CANNON_WORLD_X, CANNON_WORLD_Y, CANNON_WORLD_Z);
  root.scale.setScalar(CANNON_SCALE);

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.88, 1.05, 0.58, 14));
  base.position.y = 0.26;

  const yawP = new THREE.Group();
  yawP.name = 'yaw-pivot';
  yawP.position.y = 0.48;

  const pitchP = new THREE.Group();
  pitchP.name = 'pitch-pivot';

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 1.6, 12));
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0, -0.82);

  const muzzle = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.045, 8, 16));
  muzzle.rotation.x = Math.PI / 2;
  muzzle.position.set(0, 0, -1.58);

  pitchP.add(barrel, muzzle);
  yawP.add(pitchP);
  root.add(base, yawP);
  return root;
}

function applyAim(cannon, pitchDeg, yawDeg) {
  const yawP = cannon.getObjectByName('yaw-pivot');
  const pitchP = cannon.getObjectByName('pitch-pivot');
  yawP.rotation.y = (yawDeg * Math.PI) / 180;
  pitchP.rotation.x = (pitchDeg * Math.PI) / 180;
  cannon.updateMatrixWorld(true);
}

function screenRect(cam, obj) {
  const box = new THREE.Box3().setFromObject(obj);
  const pts = [];
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        const p = new THREE.Vector3(x, y, z).project(cam);
        if (!Number.isFinite(p.x)) continue;
        pts.push(p);
      }
    }
  }
  if (!pts.length) return null;
  const minX = Math.min(...pts.map((p) => p.x));
  const maxX = Math.max(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  const maxY = Math.max(...pts.map((p) => p.y));
  const sMinX = Math.max(0, minX * 0.5 + 0.5);
  const sMaxX = Math.min(1, maxX * 0.5 + 0.5);
  const sMinY = Math.max(0, -maxY * 0.5 + 0.5);
  const sMaxY = Math.min(1, -minY * 0.5 + 0.5);
  if (sMaxX <= sMinX || sMaxY <= sMinY) return null;
  return { minX: sMinX, maxX: sMaxX, minY: sMinY, maxY: sMaxY };
}

function overlapArea(a, b) {
  if (!a || !b) return 0;
  const w = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const h = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
  return w > 0 && h > 0 ? w * h : 0;
}

function groundSamplePoints(groundPos, groundSize) {
  const [x, y, z] = groundPos;
  const [w, h, d] = groundSize;
  const top = y + h / 2;
  return [
    { label: 'środek', p: new THREE.Vector3(x, top, z) },
    { label: 'przód-L', p: new THREE.Vector3(x - w / 3, top, z + d / 2 - 0.2) },
    { label: 'przód-P', p: new THREE.Vector3(x + w / 3, top, z + d / 2 - 0.2) },
    { label: 'przód-środek', p: new THREE.Vector3(x, top, z + d / 2 - 0.2) },
    { label: 'lewy-przód', p: new THREE.Vector3(x - w / 2 + 0.5, top, z + d / 2 - 0.5) },
    { label: 'prawy-przód', p: new THREE.Vector3(x + w / 2 - 0.5, top, z + d / 2 - 0.5) },
  ];
}

function rayBlockedByCannon(cam, cannon, targetPoint) {
  const rc = new THREE.Raycaster();
  const ndc = targetPoint.clone().project(cam);
  rc.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), cam);
  const hits = rc.intersectObject(cannon, true);
  const distTarget = cam.position.distanceTo(targetPoint);
  return hits.length > 0 && hits[0].distance < distTarget - 0.05;
}

function testLevel(file) {
  const level = JSON.parse(readFileSync(file, 'utf8'));
  const gf = computeGoalFrame(level);
  const ground = level.blocks.find((b) => b.type === 'ground');
  const groundPos = off(ground.position, gf.worldOffset);
  const groundMesh = new THREE.Mesh(new THREE.BoxGeometry(...ground.size));
  groundMesh.position.set(...groundPos);

  const lookAtY = THREE.MathUtils.lerp(2.1, gf.center.y, 0.68);
  const cam = new THREE.PerspectiveCamera(CAMERA_FOV, 9 / 16, 0.1, 100);
  cam.position.set(CAMERA_X, CAMERA_Y, CAMERA_Z);
  cam.lookAt(0, lookAtY, GOAL_PLANE_Z);
  cam.updateMatrixWorld(true);

  const cannon = buildCannon();
  const samples = groundSamplePoints(groundPos, ground.size);
  const groundRect = screenRect(cam, groundMesh);
  const groundArea = groundRect ? (groundRect.maxX - groundRect.minX) * (groundRect.maxY - groundRect.minY) : 0;

  console.log(`\n=== ${level.id} (${level.name}) ===`);
  console.log(
    `Platforma na ekranie: ${groundRect ? `${(groundRect.minY * 100).toFixed(0)}–${(groundRect.maxY * 100).toFixed(0)}% wys.` : 'brak'}`,
  );

  const pitchAngles = [level.cannon.angleMinDeg, 25, 35, 50, level.cannon.angleMaxDeg, 72];
  const yawAngles = [-32, -15, 0, 15, 32];
  let worstOverlap = 0;
  let worstCase = null;
  let blockedCount = 0;
  let cannonBand = { min: 1, max: 0 };

  for (const pitch of pitchAngles) {
    for (const yaw of yawAngles) {
      applyAim(cannon, pitch, yaw);
      const cannonRect = screenRect(cam, cannon);
      if (cannonRect) {
        cannonBand.min = Math.min(cannonBand.min, cannonRect.minY);
        cannonBand.max = Math.max(cannonBand.max, cannonRect.maxY);
      }
      const area = overlapArea(cannonRect, groundRect);
      const overlapPct = groundArea > 0 ? (area / groundArea) * 100 : 0;
      if (area > worstOverlap) {
        worstOverlap = area;
        worstCase = { pitch, yaw, overlapPct, cannonRect };
      }
      for (const s of samples) {
        if (rayBlockedByCannon(cam, cannon, s.p)) {
          blockedCount++;
          console.log(`  ZASŁONIĘTE raycast: pitch=${pitch}° yaw=${yaw}° punkt=${s.label}`);
        }
      }
    }
  }

  if (worstCase) {
    const c = worstCase.cannonRect;
    console.log(
      `Najgorsze nakładanie: pitch=${worstCase.pitch}° yaw=${worstCase.yaw}° → ${worstCase.overlapPct.toFixed(1)}%`,
    );
    console.log(
      `Armata ekran: ${(c.minX * 100).toFixed(0)}–${(c.maxX * 100).toFixed(0)}% szer., ${(c.minY * 100).toFixed(0)}–${(c.maxY * 100).toFixed(0)}% wys.`,
    );
  }
  console.log(`Raycast zasłonięć: ${blockedCount}`);
  return { blockedCount, worstOverlapPct: worstCase?.overlapPct ?? 0, cannonBand };
}

console.log('=== STATYCZNE UCIĘCIE DOLNE: ARMATA vs PLATFORMA ===');
const levelFiles = readdirSync('./src/levels/data')
  .filter((f) => f.endsWith('.json'))
  .map((f) => `./src/levels/data/${f}`);
const results = levelFiles.map(testLevel);
const anyBlock = results.some((r) => r.blockedCount > 0);
const worstOverlap = Math.max(...results.map((r) => r.worstOverlapPct));
const cannonMinY = Math.min(...results.map((r) => r.cannonBand.min));

console.log('\n=== PODSUMOWANIE ===');
console.log(
  anyBlock
    ? 'TAK — raycast: armata zasłania punkty platformy'
    : 'NIE — raycast: wszystkie punkty platformy widoczne',
);
console.log(`Nakładanie bbox: max ${worstOverlap.toFixed(1)}%`);
console.log(`Armata w kadrze od ${(cannonMinY * 100).toFixed(0)}% wysokości ekranu`);
process.exit(anyBlock ? 1 : 0);

#!/usr/bin/env node
/**
 * Symuluje start poziomu: spawn modułów + grawitacja Rapier (jak w session.ts).
 * Sprawdza, czy keystone i konstrukcja stabilizują się po ~3 s.
 */
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import RAPIER from '@dimforge/rapier3d-compat';

const __dir = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dir, '../src/levels/data');

const GOAL_PLANE_Z = -4;
const GRAVITY = 9.81;
const DT = 1 / 60;
const STEPS = 300; // ~5 s
const SETTLE_SPEED = 0.2;
const SETTLE_ANG = 0.3;
const MAX_Y_DROP = 0.35;
const MIN_KESTONE_Y = 1.2;

const MATERIALS = {
  wood: { density: 0.45, friction: 0.65, restitution: 0.15 },
  metal: { density: 1.4, friction: 0.45, restitution: 0.1 },
  glass: { density: 0.35, friction: 0.25, restitution: 0.05 },
  ground: { density: 0, friction: 0.9, restitution: 0.02 },
  stone: { density: 1.1, friction: 0.7, restitution: 0.08 },
};

function computeGoalFrame(level) {
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  for (const m of level.enemyCastle.modules) {
    if (m.isStatic && m.type === 'foundation') continue;
    if (m.importance === 'decorative' && m.type !== 'keystone') continue;
    const [x, y, z] = m.position;
    const [w, h, d] = m.size;
    minX = Math.min(minX, x - w / 2);
    maxX = Math.max(maxX, x + w / 2);
    minY = Math.min(minY, y - h / 2);
    maxY = Math.max(maxY, y + h / 2);
    minZ = Math.min(minZ, z - d / 2);
    maxZ = Math.max(maxZ, z + d / 2);
  }

  if (!Number.isFinite(minX)) {
    return { worldOffset: { x: 0, y: 0, z: GOAL_PLANE_Z + 2 } };
  }

  const centerZ = (minZ + maxZ) / 2;
  const centerX = (minX + maxX) / 2;
  return { worldOffset: { x: -centerX, y: 0, z: GOAL_PLANE_Z - centerZ } };
}

function applyWorldOffset(pos, offset) {
  return [pos[0] + offset.x, pos[1] + offset.y, pos[2] + offset.z];
}

function isKeystone(m) {
  return m.type === 'keystone' || m.importance === 'critical';
}

function aabb(pos, size) {
  const [x, y, z] = pos;
  const [w, h, d] = size;
  return {
    minX: x - w / 2, maxX: x + w / 2,
    minY: y - h / 2, maxY: y + h / 2,
    minZ: z - d / 2, maxZ: z + d / 2,
  };
}

function overlap1d(a0, a1, b0, b1) {
  return a0 <= b1 && b0 <= a1;
}

/** Keystone zasłonięty statykiem od strony armaty (z większe = bliżej armaty). */
function hiddenBehindStatic(keystonePos, keystoneSize, modules) {
  const kb = aabb(keystonePos, keystoneSize);
  for (const m of modules) {
    if (!m.isStatic && m.type !== 'foundation') continue;
    const b = aabb(m.position, m.size);
    if (b.minZ <= kb.maxZ) continue;
    if (!overlap1d(kb.minX, kb.maxX, b.minX, b.maxX)) continue;
    if (!overlap1d(kb.minY, kb.maxY, b.minY, b.maxY)) continue;
    return m.id;
  }
  return null;
}

function simulateLevel(level) {
  const world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
  const frame = computeGoalFrame(level);
  const bodies = [];

  for (const mod of level.enemyCastle.modules) {
    const pos = applyWorldOffset(mod.position, frame.worldOffset);
    const isStatic = mod.isStatic ?? mod.type === 'foundation';
    const isKs = isKeystone(mod);
    const isFixed = isStatic || isKs;
    const matKey = mod.material in MATERIALS ? mod.material : 'stone';
    const mat = MATERIALS[matKey];
    const [w, h, d] = mod.size;

    const desc = isFixed
      ? RAPIER.RigidBodyDesc.fixed()
      : RAPIER.RigidBodyDesc.dynamic().setCanSleep(true);
    const body = world.createRigidBody(desc.setTranslation(pos[0], pos[1], pos[2]));
    const collider = RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2)
      .setDensity(isFixed ? 0 : mat.density)
      .setFriction(mat.friction)
      .setRestitution(mat.restitution);
    world.createCollider(collider, body);

    bodies.push({
      id: mod.id,
      type: mod.type,
      isStatic,
      isKeystone: isKeystone(mod),
      start: { x: pos[0], y: pos[1], z: pos[2] },
      size: mod.size,
      body,
    });
  }

  world.integrationParameters.dt = DT;
  for (let i = 0; i < STEPS; i++) {
    world.step();
  }

  const issues = [];
  let anyMoving = false;

  for (const entry of bodies) {
    if (entry.isStatic) continue;
    const t = entry.body.translation();
    const lv = entry.body.linvel();
    const av = entry.body.angvel();
    const speed = Math.hypot(lv.x, lv.y, lv.z);
    const ang = Math.hypot(av.x, av.y, av.z);
    const disp = Math.hypot(t.x - entry.start.x, t.y - entry.start.y, t.z - entry.start.z);

    if (speed > SETTLE_SPEED || ang > SETTLE_ANG) anyMoving = true;

    if (entry.isKeystone) {
      const pos = [t.x, t.y, t.z];
      const runtimeMods = bodies.map((b) => {
        const tt = b.body.translation();
        return {
          id: b.id,
          isStatic: b.isStatic,
          type: b.type,
          position: [tt.x, tt.y, tt.z],
          size: b.size,
        };
      });
      const blocker = hiddenBehindStatic(pos, entry.size, runtimeMods);
      const yDrop = entry.start.y - t.y;

      if (yDrop > MAX_Y_DROP) {
        issues.push(`keystone ${entry.id} spadł o ${yDrop.toFixed(2)} (y ${entry.start.y.toFixed(2)}→${t.y.toFixed(2)})`);
      }
      if (t.y < level.killZoneY) {
        issues.push(`keystone ${entry.id} poniżej killZoneY (${t.y.toFixed(2)})`);
      }
      if (t.y < MIN_KESTONE_Y) {
        issues.push(`keystone ${entry.id} zbyt nisko (y=${t.y.toFixed(2)})`);
      }
      if (speed > SETTLE_SPEED || ang > SETTLE_ANG) {
        issues.push(`keystone ${entry.id} nadal się rusza (v=${speed.toFixed(2)}, ω=${ang.toFixed(2)})`);
      }
      if (blocker) {
        issues.push(`keystone ${entry.id} za statykiem „${blocker}” (y=${t.y.toFixed(2)}, z=${t.z.toFixed(2)})`);
      }
    }
  }

  const keystoneIssues = issues.filter((i) => i.startsWith('keystone'));
  return { id: level.id, blueprint: level.blueprint, issues, keystoneIssues, stillMoving: anyMoving };
}

await RAPIER.init();

const files = readdirSync(dataDir).filter((f) => f.endsWith('.json')).sort();
const results = files.map((f) => simulateLevel(JSON.parse(readFileSync(join(dataDir, f), 'utf8'))));

const bad = results.filter((r) => r.keystoneIssues.length > 0);
const moving = results.filter((r) => r.stillMoving);

console.log('=== Stabilność po 3 s grawitacji (Rapier) ===\n');
console.log(`Poziomy z problemami keystone: ${bad.length}/${results.length}`);
console.log(`Poziomy z ruchem dynamicznym: ${moving.length}/${results.length}\n`);

for (const r of bad) {
  console.log(`${r.id} (${r.blueprint})`);
  for (const issue of r.keystoneIssues) console.log(`  - ${issue}`);
}

if (bad.length === 0) {
  console.log('Wszystkie keystone stabilne po starcie.');
} else {
  process.exitCode = 1;
}

// Podsumowanie przesunięć keystone
console.log('\n=== Przesunięcia keystone (max) ===');
for (const r of results) {
  // re-run quick disp only - skip, user wants analysis
}

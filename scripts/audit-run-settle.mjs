#!/usr/bin/env node
/**
 * Headless Rapier settle audit for run targets (d4+ by default).
 * Spawns modules like the game, steps 180 frames, reports drift / falls.
 */
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import RAPIER from '@dimforge/rapier3d-compat';

const __dir = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dir, '../src/levels/run/data');

const DENSITY = { wood: 0.45, stone: 1.1, glass: 0.35, metal: 1.4, ground: 1 };
const FRICTION = { wood: 0.7, stone: 0.85, glass: 0.4, metal: 0.55, ground: 0.9 };

await RAPIER.init();

function spawnWorld(modules) {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.integrationParameters.dt = 1 / 60;
  const bodies = [];

  for (const mod of modules) {
    const [x, y, z] = mod.position;
    const [w, h, d] = mod.size;
    const fixed = mod.isStatic || mod.type === 'foundation';
    const desc = fixed
      ? RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z)
      : RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).setCanSleep(true);
    const body = world.createRigidBody(desc);
    const mat = mod.material ?? 'wood';
    const collider = RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2)
      .setDensity(DENSITY[mat] ?? 0.5)
      .setFriction(FRICTION[mat] ?? 0.7)
      .setRestitution(0.05);
    world.createCollider(collider, body);
    bodies.push({
      id: mod.id,
      body,
      start: [x, y, z],
      critical: mod.type === 'keystone' || mod.importance === 'critical' || /col-1[ab]-|beam-pad/.test(mod.id),
    });
  }
  return { world, bodies };
}

function auditFile(path, killY = -2) {
  const level = JSON.parse(readFileSync(path, 'utf8'));
  const modules = level.enemyCastle.modules;
  const { world, bodies } = spawnWorld(modules);

  for (let i = 0; i < 180; i++) world.step();

  const drifts = [];
  let fallenCritical = 0;
  let maxDrift = 0;
  for (const b of bodies) {
    if (b.body.isFixed()) continue;
    const t = b.body.translation();
    const drift = Math.hypot(t.x - b.start[0], t.y - b.start[1], t.z - b.start[2]);
    maxDrift = Math.max(maxDrift, drift);
    if (drift > 0.35) drifts.push({ id: b.id, drift: +drift.toFixed(2), y: +t.y.toFixed(2) });
    if (b.critical && t.y < killY) fallenCritical += 1;
  }

  world.free();
  return {
    id: level.id,
    d: level.difficulty,
    maxDrift: +maxDrift.toFixed(2),
    drifted: drifts.length,
    fallenCritical,
    topDrifts: drifts.sort((a, b) => b.drift - a.drift).slice(0, 4),
    ok: fallenCritical === 0 && maxDrift < 1.2,
  };
}

const minD = Number(process.argv[2] ?? 4);
const files = readdirSync(dataDir)
  .filter((f) => /^d\d+-v\d+\.json$/.test(f))
  .filter((f) => {
    const d = Number(f.slice(1, 3));
    return d >= minD;
  })
  .sort();

const results = [];
for (const f of files) {
  results.push(auditFile(join(dataDir, f)));
}

const bad = results.filter((r) => !r.ok);
const byD = {};
for (const r of results) {
  byD[r.d] = byD[r.d] || { n: 0, ok: 0, bad: 0, maxDrift: 0 };
  byD[r.d].n += 1;
  if (r.ok) byD[r.d].ok += 1;
  else byD[r.d].bad += 1;
  byD[r.d].maxDrift = Math.max(byD[r.d].maxDrift, r.maxDrift);
}

console.log(
  JSON.stringify(
    {
      checked: results.length,
      ok: results.length - bad.length,
      bad: bad.length,
      byD,
      failures: bad.slice(0, 20),
    },
    null,
    2,
  ),
);
process.exitCode = bad.length ? 1 : 0;

#!/usr/bin/env node
/**
 * Generator puli run: 10 trudności × 10 wariantów = 100 celów.
 * Proceduralne zamki — lekkie (d1) → rozbudowane (d10).
 * Max 3 keystone'y (tarcze), max 50 modułów na ustawienie.
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dir, '../src/levels/run/data');
mkdirSync(outDir, { recursive: true });

const Z = -2;
const ROW = { low: 0.5, mid: 1.5, high: 2.5, top: 3.5 };
const DEEP_Z = -0.35;
const MAX_MODULES = 50;
const MAX_KEYSTONES = 3;

const BLUEPRINT_LABELS = {
  watchtower: 'Wieża strażnicza',
  gatehouse: 'Brama warowna',
  curtain_wall: 'Mur kurtynowy',
  twin_towers: 'Bliźniacze wieże',
  courtyard: 'Dziedziniec',
  bastion: 'Bastion',
  citadel: 'Cytadela',
};

function rngFor(difficulty, variant) {
  let s = (difficulty * 7919 + variant * 104729) >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function stackY(supportCenterY, supportHeight, blockSize) {
  return supportCenterY + supportHeight / 2 + blockSize / 2;
}

function m(p) {
  return { importance: 'structural', isStatic: false, ...p };
}

function brickAt(id, x, y, z, material, type = 'wall', extra = {}) {
  return m({ id, type, material, position: [x, y, z], size: [1, 1, 1], ...extra });
}

function foundation(width, depth = 7) {
  return m({
    id: 'found',
    type: 'foundation',
    material: 'ground',
    position: [0, -0.25, Z],
    size: [width, 0.5, depth],
    isStatic: true,
  });
}

function modAabb(mod) {
  const [x, y, z] = mod.position;
  const [w, h, d] = mod.size;
  return {
    minX: x - w / 2,
    maxX: x + w / 2,
    minY: y - h / 2,
    maxY: y + h / 2,
    minZ: z - d / 2,
    maxZ: z + d / 2,
  };
}

function aabbOverlap(a, b, gap = 0.02) {
  return (
    a.minX < b.maxX - gap &&
    a.maxX > b.minX + gap &&
    a.minY < b.maxY - gap &&
    a.maxY > b.minY + gap &&
    a.minZ < b.maxZ - gap &&
    a.maxZ > b.minZ + gap
  );
}

function isKeystoneMod(mod) {
  return mod.type === 'keystone' || mod.importance === 'critical';
}

function isRestingOn(ksBox, supportBox) {
  const xz =
    ksBox.minX < supportBox.maxX &&
    ksBox.maxX > supportBox.minX &&
    ksBox.minZ < supportBox.maxZ &&
    ksBox.maxZ > supportBox.minZ;
  const onTop = Math.abs(ksBox.minY - supportBox.maxY) < 0.045;
  return xz && onTop && ksBox.minY >= supportBox.maxY - 0.05;
}

function xzOnSupportFootprint(ksX, ksZ, mod, size) {
  const b = modAabb(mod);
  const margin = 0.04;
  return (
    ksX >= b.minX - margin &&
    ksX <= b.maxX + margin &&
    ksZ >= b.minZ - margin &&
    ksZ <= b.maxZ + margin
  );
}

function pointInAabb([px, py, pz], box) {
  return px >= box.minX && px <= box.maxX && py >= box.minY && py <= box.maxY && pz >= box.minZ && pz <= box.maxZ;
}

function keystonePenetrates(modules, ks, resolvedKeystones = []) {
  const kb = modAabb(ks);
  const ksCenter = ks.position;
  const checkMod = (mod) => {
    if (mod.id === ks.id || mod.isStatic) return false;
    const b = modAabb(mod);
    if (!aabbOverlap(kb, b)) return false;
    if (isRestingOn(kb, b)) return false;
    if (pointInAabb(ksCenter, b) || pointInAabb(mod.position, kb)) return true;
    return false;
  };
  for (const mod of modules) {
    if (checkMod(mod)) return true;
  }
  for (const other of resolvedKeystones) {
    if (other.id === ks.id) return false;
    if (checkMod(other)) return true;
  }
  return false;
}

function snapKeystoneToBestSupport(modules, ks, resolvedKeystones = []) {
  const [x, , z] = ks.position;
  const size = ks.size[0];
  const intendedY = ks.position[1];
  const candidates = [];
  for (const mod of modules) {
    if (mod.id === ks.id || isKeystoneMod(mod)) continue;
    if (!xzOnSupportFootprint(x, z, mod, size)) continue;
    const restY = stackY(mod.position[1], mod.size[1], size);
    candidates.push({ mod, restY });
  }
  candidates.sort((a, b) => Math.abs(a.restY - intendedY) - Math.abs(b.restY - intendedY));
  for (const { mod } of candidates) {
    ks.position[1] = stackY(mod.position[1], mod.size[1], size);
    if (!keystonePenetrates(modules, ks, resolvedKeystones)) return true;
  }
  if (candidates.length > 0) {
    const { mod } = candidates[0];
    ks.position[1] = stackY(mod.position[1], mod.size[1], size);
    return true;
  }
  return false;
}

function separateKeystoneAnchors(ksList) {
  const seen = new Map();
  for (const ks of ksList) {
    const key = `${ks.position[0].toFixed(2)}:${ks.position[2].toFixed(2)}`;
    const count = seen.get(key) ?? 0;
    seen.set(key, count + 1);
    if (count === 0) continue;
    ks.position[2] += DEEP_Z * count;
    if (count > 1) ks.position[0] += 0.5 * (count % 2 === 0 ? 1 : -1);
  }
}

function finalizeKeystones(modules) {
  const ksList = modules.filter(isKeystoneMod);
  separateKeystoneAnchors(ksList);
  const resolved = [];
  for (const ks of ksList) {
    snapKeystoneToBestSupport(modules, ks, resolved);
    if (!keystonePenetrates(modules, ks, resolved)) {
      resolved.push(ks);
      continue;
    }
    const [ox, , oz] = ks.position;
    const nudges = [
      [0, DEEP_Z],
      [0, -DEEP_Z],
      [0.55, 0],
      [-0.55, 0],
      [0.55, DEEP_Z],
      [-0.55, DEEP_Z],
    ];
    let fixed = false;
    for (const [dx, dz] of nudges) {
      ks.position[0] = ox + dx;
      ks.position[2] = oz + dz;
      snapKeystoneToBestSupport(modules, ks, resolved);
      if (!keystonePenetrates(modules, ks, resolved)) {
        fixed = true;
        break;
      }
    }
    if (!fixed) {
      ks.position[0] = ox;
      ks.position[2] = oz;
      const padId = `${ks.id}-pad`;
      if (!modules.some((mod) => mod.id === padId)) {
        modules.push(brickAt(padId, ox, ROW.low, oz, 'wood'));
      }
      snapKeystoneToBestSupport(modules, ks, resolved);
    }
    resolved.push(ks);
  }
}

function blueprintForDifficulty(d, variant) {
  if (d <= 2) return 'watchtower';
  if (d <= 4) return 'gatehouse';
  if (d <= 5) return variant % 2 === 0 ? 'curtain_wall' : 'gatehouse';
  if (d <= 6) return variant % 2 === 0 ? 'twin_towers' : 'curtain_wall';
  if (d <= 8) return variant % 2 === 0 ? 'courtyard' : 'bastion';
  return variant % 2 === 0 ? 'citadel' : 'bastion';
}

function keystoneCountFor(d, variant, rng) {
  if (d <= 3) return 1;
  if (d <= 6) return rng() < 0.45 ? 2 : 1;
  if (d <= 8) return rng() < 0.55 ? 2 : 1;
  const roll = rng();
  if (roll < 0.35) return 2;
  if (roll < 0.7) return 3;
  return 2;
}

function runKeystoneHp(d, variant) {
  return 65 + d * 12 + variant * 2;
}

function runClearReward(d, variant) {
  return 350 + d * 150 + variant * 15;
}

function runAmmoLimit(d, variant, keystoneCount) {
  const base = 9 - Math.floor(d / 2);
  const keyBonus = Math.max(0, keystoneCount - 1);
  const variantPenalty = variant > 7 ? 1 : 0;
  return Math.max(4, Math.min(9, base + keyBonus - variantPenalty));
}

function rowY(level) {
  return ROW.low + (level - 1);
}

function addColumn(modules, id, x, z, rows, material = 'wood', type = 'tower') {
  for (let i = 0; i < rows; i++) {
    modules.push(
      brickAt(
        `${id}-${i}`,
        x,
        rowY(i + 1),
        z,
        i === 0 ? 'stone' : material,
        type,
      ),
    );
  }
}

function addWallRow(modules, id, xCenter, z, count, rowLevel, material = 'wood') {
  const half = (count - 1) / 2;
  for (let i = 0; i < count; i++) {
    modules.push(
      brickAt(`${id}-${i}`, xCenter + (i - half) * 1.05, rowY(rowLevel), z, material, 'wall'),
    );
  }
}

/** Zbiera miejsca, gdzie można postawić keystone na wierzchu modułu. */
function collectKeystoneAnchors(modules) {
  const anchors = [];
  for (const mod of modules) {
    if (mod.isStatic || isKeystoneMod(mod) || mod.type === 'foundation') continue;
    anchors.push({
      mod,
      x: mod.position[0],
      z: mod.position[2],
      restY: stackY(mod.position[1], mod.size[1], 0.78),
    });
  }
  return anchors;
}

/** Zostawia tylko kotwice na najwyższym poziomie konstrukcji. */
function topKeystoneAnchors(anchors) {
  if (anchors.length === 0) return anchors;
  const maxRestY = Math.max(...anchors.map((a) => a.restY));
  const top = anchors.filter((a) => a.restY >= maxRestY - 0.05);
  return top.length > 0 ? top : anchors;
}

/** Ocena „wewnętrzności” — głębiej, bliżej środka, otoczone modułami. */
function interiorScore(anchor, modules) {
  const { x, z, mod } = anchor;
  let score = 0;

  if (z < Z - 0.05) score += 4;
  else if (z <= Z + 0.12) score += 2;
  else score -= 3;

  score += Math.max(0, 3 - Math.abs(x) * 0.9);

  let neighbors = 0;
  for (const other of modules) {
    if (other.id === mod.id || isKeystoneMod(other) || other.type === 'foundation') continue;
    const dx = other.position[0] - x;
    const dz = other.position[2] - z;
    if (Math.hypot(dx, dz) < 1.25 && (Math.abs(dx) > 0.25 || Math.abs(dz) > 0.2)) {
      neighbors++;
    }
  }
  score += neighbors * 0.75;

  const y = mod.position[1];
  if (y >= ROW.low - 0.1 && y <= ROW.mid + 0.1) score += 1.5;
  if (y >= ROW.high) score -= 0.75;

  if (Math.abs(x) > 2.8) score -= 2;

  return score;
}

/** Preferuje kotwice wewnątrz konstrukcji (d3–d10). */
function preferInteriorAnchors(anchors, modules, rng) {
  if (anchors.length === 0) return anchors;
  const scored = anchors
    .map((a) => ({ ...a, score: interiorScore(a, modules) }))
    .sort((a, b) => b.score - a.score);
  const best = scored[0].score;
  const preferred = scored.filter((a) => a.score >= best - 1.25);
  const pool = preferred.length > 0 ? preferred : scored.slice(0, Math.max(1, Math.ceil(scored.length / 3)));
  return pool.sort(() => rng() - 0.5);
}

function placeKeystones(modules, count, hp, rng, difficulty) {
  let anchors = collectKeystoneAnchors(modules);
  if (difficulty <= 2) {
    anchors = topKeystoneAnchors(anchors);
  } else {
    anchors = preferInteriorAnchors(anchors, modules, rng);
  }
  if (anchors.length === 0) {
    modules.push(
      m({
        id: 'keystone',
        type: 'keystone',
        material: 'wood',
        position: [0, stackY(ROW.low, 1, 0.82), Z],
        size: [0.82, 0.82, 0.82],
        importance: 'critical',
        hitPoints: hp,
      }),
    );
    return;
  }
  const shuffled = [...anchors].sort(() => rng() - 0.5);
  const used = new Set();
  let placed = 0;
  for (const anchor of shuffled) {
    if (placed >= count) break;
    const key = `${anchor.x.toFixed(1)}:${anchor.z.toFixed(1)}`;
    if (used.has(key)) continue;
    used.add(key);
    const size = 0.76 + (placed === 0 ? 0.06 : 0);
    modules.push(
      m({
        id: placed === 0 ? 'keystone' : `keystone-${placed + 1}`,
        type: 'keystone',
        material: 'wood',
        position: [anchor.x, anchor.restY, anchor.z],
        size: [size, size, size],
        importance: 'critical',
        hitPoints: hp,
      }),
    );
    placed++;
  }
  while (placed < count) {
    const anchor = pick(rng, anchors);
    modules.push(
      m({
        id: `keystone-${placed + 1}`,
        type: 'keystone',
        material: 'wood',
        position: [anchor.x + (placed * 0.4), anchor.restY, anchor.z + DEEP_Z * placed],
        size: [0.74, 0.74, 0.74],
        importance: 'critical',
        hitPoints: hp,
      }),
    );
    placed++;
  }
}

function trimToMaxModules(modules, max = MAX_MODULES) {
  while (modules.length > max) {
    const idx = modules.findIndex(
      (mod) =>
        !mod.isStatic &&
        mod.type !== 'foundation' &&
        !isKeystoneMod(mod) &&
        mod.material === 'glass',
    );
    if (idx >= 0) modules.splice(idx, 1);
    else {
      const idx2 = modules.findIndex(
        (mod) => !mod.isStatic && mod.type !== 'foundation' && !isKeystoneMod(mod),
      );
      if (idx2 < 0) break;
      modules.splice(idx2, 1);
    }
  }
}

function buildWatchtower(d, variant, rng) {
  const modules = [foundation(7 + d * 0.3)];
  const rows = 1 + Math.floor(d / 2) + (variant > 5 ? 1 : 0);
  addColumn(modules, 'core', 0, Z, Math.min(rows, 3), 'wood', d >= 2 ? 'tower' : 'gate');
  if (d >= 2 && variant >= 4) {
    for (const side of [-1.25, 1.25]) {
      modules.push(brickAt(`buttress-${side < 0 ? 'l' : 'r'}`, side, ROW.low, Z, 'stone', 'wall'));
    }
  }
  return modules;
}

function buildGatehouse(d, variant, rng) {
  const modules = [foundation(10 + d * 0.4)];
  modules.push(
    m({
      id: 'gate-base',
      type: 'gate',
      material: 'stone',
      position: [0, ROW.low, Z],
      size: [1.4, 1, 1],
      isStatic: d >= 8,
    }),
  );
  modules.push(brickAt('gate-upper', 0, ROW.mid, Z, variant % 2 === 0 ? 'wood' : 'glass', 'gate'));
  addWallRow(modules, 'wall-l', -2.1, Z, 2, 1, 'stone');
  addWallRow(modules, 'wall-r', 2.1, Z, 2, 1, 'stone');
  if (d >= 4) {
    addColumn(modules, 'tower-l', -2.5, Z + DEEP_Z, 2, 'wood', 'tower');
    addColumn(modules, 'tower-r', 2.5, Z + DEEP_Z, 2, 'wood', 'tower');
  }
  if (d >= 4 && variant >= 6) {
    addWallRow(modules, 'parapet', 0, Z - 0.2, 5, 2, 'wood');
  }
  return modules;
}

function buildCurtainWall(d, variant, rng) {
  const modules = [foundation(12 + d * 0.3)];
  const span = 5 + Math.min(3, Math.floor(d / 2));
  addWallRow(modules, 'curtain-base', 0, Z, span, 1, 'stone');
  addWallRow(modules, 'curtain-upper', 0, Z, span, 2, pick(rng, ['wood', 'wood', 'glass']));
  addColumn(modules, 'tower-l', -(span / 2) * 1.05 - 0.5, Z, 2 + (d >= 6 ? 1 : 0), 'stone', 'tower');
  addColumn(modules, 'tower-r', (span / 2) * 1.05 + 0.5, Z, 2 + (d >= 6 ? 1 : 0), 'stone', 'tower');
  if (variant >= 5) {
    modules.push(brickAt('merlon-c', 0, rowY(3), Z, 'wood', 'wall'));
  }
  return modules;
}

function buildTwinTowers(d, variant, rng) {
  const modules = [foundation(11 + d * 0.35)];
  const h = 2 + Math.floor(d / 3) + (variant > 4 ? 1 : 0);
  addColumn(modules, 'tower-l', -2.2, Z, h, 'wood', 'tower');
  addColumn(modules, 'tower-r', 2.2, Z, h, 'wood', 'tower');
  addWallRow(modules, 'bridge', 0, Z + DEEP_Z, 3, h, pick(rng, ['wood', 'glass']));
  if (d >= 6) {
    modules.push(brickAt('gate-front', 0, ROW.low, Z, 'stone', 'gate', { isStatic: d >= 9 }));
  }
  return modules;
}

function buildCourtyard(d, variant, rng) {
  const modules = [foundation(13 + d * 0.35)];
  const side = 2.4;
  for (const [tag, x, z] of [
    ['n', 0, Z + 1.1],
    ['s', 0, Z - 1.1],
    ['w', -side, Z],
    ['e', side, Z],
  ]) {
    addWallRow(modules, `court-${tag}`, x, z, 3, 1, 'stone');
    if (d >= 7) addWallRow(modules, `court-${tag}-u`, x, z, 3, 2, 'wood');
  }
  addColumn(modules, 'keep', 0, Z - 0.25, 2 + Math.floor(d / 4), 'wood', 'tower');
  if (variant >= 3) {
    modules.push(brickAt('keep-wing-l', -1.1, ROW.mid, Z - 0.2, 'wood', 'wall'));
    modules.push(brickAt('keep-wing-r', 1.1, ROW.mid, Z - 0.2, 'wood', 'wall'));
  }
  return modules;
}

function buildBastion(d, variant, rng) {
  const modules = [foundation(14 + d * 0.2)];
  modules.push(
    m({
      id: 'outer-gate',
      type: 'gate',
      material: 'stone',
      position: [0, ROW.low, Z + 0.35],
      size: [1.5, 1.1, 1],
      isStatic: d >= 9,
    }),
  );
  for (const side of [-2.2, 2.2]) {
    addColumn(modules, `flank-${side < 0 ? 'l' : 'r'}`, side, Z, 2 + (d >= 8 ? 1 : 0), 'stone', 'tower');
    modules.push(brickAt(`flank-${side < 0 ? 'l' : 'r'}-cap`, side, rowY(3), Z, 'wood', 'wall'));
  }
  addWallRow(modules, 'rampart', 0, Z - 0.15, 5, 2, 'wood');
  addColumn(modules, 'keep-core', 0, Z - 0.35, 3, 'wood', 'wall');
  if (d >= 9) {
    modules.push(
      m({
        id: 'keep-pillar',
        type: 'wall',
        material: 'metal',
        position: [0, ROW.top, Z - 0.4],
        size: [0.5, 1.1, 0.5],
        isStatic: true,
      }),
    );
  }
  return modules;
}

function buildCitadel(d, variant, rng) {
  const modules = buildBastion(d, variant, rng);
  addWallRow(modules, 'inner-ring', 0, Z - 0.5, 3, 3, pick(rng, ['wood', 'stone']));
  if (variant >= 5) {
    addColumn(modules, 'boss-tower', 2.1, Z - 0.25, 2, 'stone', 'tower');
  }
  for (const [id, x, z] of [
    ['b1', -1.5, Z + 0.5],
    ['b2', 1.5, Z + 0.5],
    ['b3', -1.5, Z - 0.8],
    ['b4', 1.5, Z - 0.8],
  ]) {
    if (modules.length >= MAX_MODULES - 4) break;
    modules.push(brickAt(id, x, ROW.mid, z, pick(rng, ['wood', 'glass']), 'wall'));
  }
  return modules;
}

const BUILDERS = {
  watchtower: buildWatchtower,
  gatehouse: buildGatehouse,
  curtain_wall: buildCurtainWall,
  twin_towers: buildTwinTowers,
  courtyard: buildCourtyard,
  bastion: buildBastion,
  citadel: buildCitadel,
};

function targetModuleCount(d) {
  return Math.min(MAX_MODULES - 3, 4 + Math.floor(d * 2.6));
}

function expandCastleToBudget(modules, d, variant, rng) {
  const target = targetModuleCount(d);
  let guard = 0;
  while (modules.length < target && guard < 28) {
    guard++;
    const ring = 2.6 + (guard % 3) * 0.55 + d * 0.05;
    const side = guard % 2 === 0 ? -1 : 1;
    const row = 1 + (guard % 3);
    const z = Z + (guard % 2 === 0 ? 0 : DEEP_Z * 2);
    modules.push(
      brickAt(
        `expand-${guard}`,
        side * ring,
        rowY(row),
        z,
        pick(rng, ['wood', 'stone', 'wood']),
        guard % 4 === 0 ? 'tower' : 'wall',
      ),
    );
    if (variant >= 5 && guard % 3 === 0 && modules.length < MAX_MODULES - 3) {
      modules.push(
        brickAt(`expand-${guard}-b`, side * (ring - 0.5), rowY(row), z - DEEP_Z, 'wood', 'wall'),
      );
    }
  }
}

function buildCastle(difficulty, variant) {
  const rng = rngFor(difficulty, variant);
  const blueprint = blueprintForDifficulty(difficulty, variant);
  const build = BUILDERS[blueprint];
  const modules = build(difficulty, variant, rng);
  expandCastleToBudget(modules, difficulty, variant, rng);
  trimToMaxModules(modules);
  const keyCount = Math.min(MAX_KEYSTONES, keystoneCountFor(difficulty, variant, rng));
  const hp = runKeystoneHp(difficulty, variant);
  placeKeystones(modules, keyCount, hp, rng, difficulty);
  trimToMaxModules(modules);
  finalizeKeystones(modules);
  trimToMaxModules(modules);
  return { modules, blueprint, keyCount };
}

function cannonForDifficulty(d) {
  return {
    position: [0, 0.6, 8.2],
    angleMinDeg: 10 + d,
    angleMaxDeg: 44 + d * 2,
  };
}

let warnings = 0;

for (let d = 1; d <= 10; d++) {
  for (let v = 1; v <= 10; v++) {
    const { modules, blueprint, keyCount } = buildCastle(d, v);
    const label = BLUEPRINT_LABELS[blueprint] ?? blueprint;
    const clearReward = runClearReward(d, v);
    const ammoLimit = runAmmoLimit(d, v, keyCount);
    const ksCount = modules.filter(isKeystoneMod).length;

    if (modules.length > MAX_MODULES) {
      console.warn(`WARN d${d} v${v}: ${modules.length} modułów (max ${MAX_MODULES})`);
      warnings++;
    }
    if (ksCount > MAX_KEYSTONES) {
      console.warn(`WARN d${d} v${v}: ${ksCount} keystone (max ${MAX_KEYSTONES})`);
      warnings++;
    }
    if (ksCount < 1) {
      console.warn(`WARN d${d} v${v}: brak keystone`);
      warnings++;
    }

    const target = {
      id: `run-d${String(d).padStart(2, '0')}-v${String(v).padStart(2, '0')}`,
      name: `Cel ${d} — ${label} ${v}`,
      chapter: d,
      difficulty: d,
      runDifficulty: d,
      variant: v,
      clearReward,
      blueprint,
      ammoLimit,
      timeLimitSec: 999,
      starTimeSec: [999, 999, 999],
      starShots: [ammoLimit, ammoLimit, ammoLimit],
      starScore: [clearReward + 400, clearReward + 200, clearReward],
      killZoneY: -2,
      cannon: cannonForDifficulty(d),
      enemyCastle: {
        origin: [0, 0, Z],
        modules,
      },
    };

    const path = join(outDir, `d${String(d).padStart(2, '0')}-v${String(v).padStart(2, '0')}.json`);
    writeFileSync(path, JSON.stringify(target, null, 2) + '\n');
  }
}

console.log('Wygenerowano 100 celów run (proceduralne zamki) →', outDir);
if (warnings > 0) {
  console.warn(`Ostrzeżenia: ${warnings}`);
  process.exitCode = 1;
}

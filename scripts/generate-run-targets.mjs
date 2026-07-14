#!/usr/bin/env node
/**
 * Generator puli run: 10 trudności × 10 wariantów = 100 celów.
 * Proceduralne zamki — lekkie (d1) → rozbudowane (d10).
 * Max 3 keystone'y (tarcze), max 50 modułów na ustawienie.
 * Kolumna nad keystone: max 4 klocki (d1–2), max 5 (d3+).
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
const MIN_COLLAPSE_RATIO = 0.7;
const MAX_SURVIVING_RATIO = 1 - MIN_COLLAPSE_RATIO;

/** Max klocków w pionowej kolumnie nad keystone (d1–2: 4, d3+: 5). */
function maxBlocksAboveKeystone(difficulty) {
  return difficulty <= 2 ? 4 : 5;
}

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

function isKeystoneChokeSupport(mod, ks) {
  if (mod.type === 'foundation') return true;
  if (/ped|gate-base|core-|forced-ped|forced-gate/.test(mod.id)) return true;
  const dx = Math.abs(mod.position[0] - ks.position[0]);
  const dz = Math.abs(mod.position[2] - ks.position[2]);
  return dx < 0.42 && dz < 0.42;
}

function snapKeystoneToBestSupport(modules, ks, resolvedKeystones = []) {
  const [x, , z] = ks.position;
  const size = ks.size[0];
  const intendedY = ks.position[1];
  const candidates = [];
  for (const mod of modules) {
    if (mod.id === ks.id || isKeystoneMod(mod)) continue;
    if (!isKeystoneChokeSupport(mod, ks)) continue;
    if (!xzOnSupportFootprint(x, z, mod, size)) continue;
    const restY = stackY(mod.position[1], mod.size[1], size);
    if (restY > intendedY + 0.25) continue;
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
    ks.position[0] += 1.55 * (count % 2 === 0 ? 1 : -1) * Math.ceil(count / 2);
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
      [0.55, 0],
      [-0.55, 0],
      [1.1, 0],
      [-1.1, 0],
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

/** Kotwice na głównej osi zamku (d1–d2: tarcza widoczna na wieży, nie na boku). */
function isCentralKeystoneAnchor(anchor) {
  return Math.abs(anchor.x) <= 1.6 && Math.abs(anchor.z - Z) <= 0.75;
}

function centralTopKeystoneAnchors(anchors) {
  const central = anchors.filter(isCentralKeystoneAnchor);
  if (central.length === 0) return topKeystoneAnchors(anchors);
  return topKeystoneAnchors(central);
}

/** Usuwa kotwice na szczycie konstrukcji (d3+). */
function excludeTopKeystoneAnchors(anchors) {
  if (anchors.length === 0) return anchors;

  const supportTop = (a) => a.mod.position[1] + a.mod.size[1] / 2;
  const maxTop = Math.max(...anchors.map(supportTop));

  let filtered = anchors.filter((a) => supportTop(a) < maxTop - 0.45);
  if (filtered.length > 0) return filtered;

  const minY = Math.min(...anchors.map((a) => a.mod.position[1]));
  filtered = anchors.filter((a) => a.mod.position[1] <= minY + 0.01);
  return filtered.length > 0 ? filtered : anchors;
}

function structuralModules(modules) {
  return modules.filter((mod) => !isKeystoneMod(mod) && mod.type !== 'foundation');
}

function dynamicStructuralModules(modules) {
  return modules.filter(
    (mod) => !mod.isStatic && mod.type !== 'foundation' && !isKeystoneMod(mod),
  );
}

function modTopY(mod) {
  return mod.position[1] + mod.size[1] / 2;
}

function modBottomY(mod) {
  return mod.position[1] - mod.size[1] / 2;
}

function createKeystone(id, x, y, z, hp, size = 0.82) {
  return m({
    id,
    type: 'keystone',
    material: 'wood',
    position: [x, y, z],
    size: [size, size, size],
    importance: 'critical',
    hitPoints: hp,
  });
}

/** Bezpośrednie podpory modułu (kontakt od góry, zgodnie z grawitacją Rapier). */
function directSupporters(mod, modules, excludedIds = new Set()) {
  if (mod.isStatic || mod.type === 'foundation') return [];
  const box = modAabb(mod);
  const supporters = [];
  for (const other of modules) {
    if (other.id === mod.id || excludedIds.has(other.id)) continue;
    if (isRestingOn(box, modAabb(other))) supporters.push(other);
  }
  return supporters;
}

/** Moduły zakotwiczone do fundamentu / statyki (transitive closure). Keystones w łańcuchu. */
function computeStartupAnchored(modules) {
  const anchored = new Set();
  for (const mod of modules) {
    if (mod.isStatic || mod.type === 'foundation') anchored.add(mod.id);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const mod of modules) {
      if (mod.isStatic || mod.type === 'foundation' || anchored.has(mod.id)) continue;
      const supporters = directSupporters(mod, modules);
      if (supporters.some((s) => anchored.has(s.id))) {
        anchored.add(mod.id);
        changed = true;
      }
    }
  }
  return anchored;
}

/** Po zniszczeniu wszystkich keystone — keystone pomijane w łańcuchu podpór. */
function computeAnchoredIds(modules, excludedIds = new Set()) {
  const anchored = new Set();
  for (const mod of modules) {
    if (mod.isStatic || mod.type === 'foundation') anchored.add(mod.id);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const mod of modules) {
      if (anchored.has(mod.id) || excludedIds.has(mod.id) || isKeystoneMod(mod)) continue;
      const supporters = directSupporters(mod, modules, excludedIds);
      if (supporters.some((s) => anchored.has(s.id))) {
        anchored.add(mod.id);
        changed = true;
      }
    }
  }
  return anchored;
}

/** Po zniszczeniu wszystkich keystone — jaki ułamek konstrukcji nośnej (nad/pod keystone) by runął. */
function collapseRatioWhenKeystonesRemoved(modules) {
  const tree = keystoneStructureIds(modules);
  const chainBelow = supportChainBelowKeystones(modules);
  const dynamic = modules.filter(
    (mod) =>
      tree.has(mod.id) &&
      (isKeystoneMod(mod) ||
        (!mod.isStatic && mod.type !== 'foundation' && !chainBelow.has(mod.id))),
  );
  if (dynamic.length === 0) return 1;

  const ksIds = new Set(modules.filter(isKeystoneMod).map((k) => k.id));
  const anchored = computeAnchoredIds(modules, ksIds);
  let collapsed = modules.filter(isKeystoneMod).length;
  for (const mod of dynamic) {
    if (isKeystoneMod(mod)) continue;
    if (!anchored.has(mod.id)) collapsed += 1;
  }
  return collapsed / dynamic.length;
}

function stripKeystones(modules) {
  return modules.filter((mod) => !isKeystoneMod(mod));
}

/** Szacuje masę konstrukcji zależną od danego filaru (kolumna XZ + wszystko powyżej). */
function estimateColumnMass(anchor, modules) {
  const [ax, , az] = anchor.mod.position;
  const minY = modTopY(anchor.mod) - 0.05;
  const inColumn = modules.filter((mod) => {
    if (mod.isStatic || mod.type === 'foundation' || isKeystoneMod(mod)) return false;
    const [x, , z] = mod.position;
    if (Math.hypot(x - ax, z - az) > 0.72) return false;
    return modBottomY(mod) >= minY - 0.08;
  });
  const ids = new Set(inColumn.map((m) => m.id));
  let added = true;
  while (added) {
    added = false;
    for (const mod of modules) {
      if (mod.isStatic || mod.type === 'foundation' || isKeystoneMod(mod) || ids.has(mod.id)) {
        continue;
      }
      const supporters = directSupporters(mod, modules);
      if (supporters.some((s) => ids.has(s.id))) {
        ids.add(mod.id);
        added = true;
      }
    }
  }
  return ids.size;
}

function preferLateralKeystoneAnchors(anchors) {
  const lateral = anchors.filter((a) => Math.abs(a.x) >= 1.0);
  return lateral.length > 0 ? lateral : anchors;
}

function findChokeAnchors(modules, count, difficulty, rng) {
  let anchors = collectKeystoneAnchors(modules);
  if (difficulty <= 2) {
    anchors = centralTopKeystoneAnchors(anchors);
  } else {
    anchors = excludeTopKeystoneAnchors(anchors);
    anchors = preferInteriorAnchors(anchors, modules, rng);
    if (count === 1) {
      anchors = preferLateralKeystoneAnchors(anchors);
    }
  }
  if (anchors.length === 0) {
    return [
      {
        mod: modules.find((mod) => !mod.isStatic && mod.type !== 'foundation') ?? modules[0],
        x: 0,
        z: Z,
        restY: stackY(ROW.low, 1, 0.82),
      },
    ];
  }

  const scored = anchors
    .map((a) => ({ ...a, score: estimateColumnMass(a, modules) + interiorScore(a, modules) * 0.5 }))
    .sort((a, b) => b.score - a.score);

  const picked = [];
  for (const anchor of scored) {
    if (picked.length >= count) break;
    const tooClose = picked.some(
      (p) => Math.hypot(p.x - anchor.x, p.z - anchor.z) < 1.35,
    );
    if (tooClose) continue;
    picked.push(anchor);
  }

  while (picked.length < count) {
    const xs = keystoneSpreadXs(count);
    const tx = xs[picked.length];
    const template = scored[picked.length % scored.length];
    picked.push({
      ...template,
      x: tx,
      z: Z,
    });
  }
  return picked.slice(0, count);
}

function countBlocksAboveKeystone(modules, ks) {
  let count = 0;
  let top = ks;
  let found = true;
  while (found) {
    found = false;
    for (const mod of modules) {
      if (mod.isStatic || isKeystoneMod(mod)) continue;
      if (
        Math.hypot(mod.position[0] - top.position[0], mod.position[2] - top.position[2]) < 0.75 &&
        Math.abs(modBottomY(mod) - modTopY(top)) < 0.06
      ) {
        count += 1;
        top = mod;
        found = true;
        break;
      }
    }
  }
  return count;
}

function keystoneColumnHead(modules, ks) {
  let top = ks;
  let found = true;
  while (found) {
    found = false;
    for (const mod of modules) {
      if (mod.isStatic || isKeystoneMod(mod)) continue;
      if (
        Math.hypot(mod.position[0] - top.position[0], mod.position[2] - top.position[2]) < 0.75 &&
        Math.abs(modBottomY(mod) - modTopY(top)) < 0.06
      ) {
        top = mod;
        found = true;
        break;
      }
    }
  }
  return top;
}

function findKeystoneForColumn(modules, support) {
  if (isKeystoneMod(support)) return support;
  return modules.find(
    (mod) =>
      isKeystoneMod(mod) &&
      Math.hypot(mod.position[0] - support.position[0], mod.position[2] - support.position[2]) < 0.75,
  );
}

function stackColumnOnSupport(modules, support, rows, idPrefix, rng, difficulty) {
  const ksRoot = findKeystoneForColumn(modules, support);
  const cap = maxBlocksAboveKeystone(difficulty);
  let allowedRows = rows;
  if (ksRoot) {
    allowedRows = Math.min(rows, Math.max(0, cap - countBlocksAboveKeystone(modules, ksRoot)));
  }
  let current = support;
  for (let i = 0; i < allowedRows; i++) {
    const y = stackY(current.position[1], current.size[1], 1);
    const mod = brickAt(
      `${idPrefix}-${i}`,
      current.position[0],
      y,
      current.position[2],
      pick(rng, ['wood', 'stone', 'wood']),
      i === rows - 1 && rows > 1 ? 'tower' : 'wall',
    );
    modules.push(mod);
    current = mod;
  }
  return current;
}

function modulePenetrates(modules, mod) {
  const kb = modAabb(mod);
  for (const other of modules) {
    if (other.id === mod.id || other.isStatic) continue;
    const b = modAabb(other);
    if (!aabbOverlap(kb, b)) continue;
    if (isRestingOn(kb, b) || isRestingOn(b, kb)) continue;
    const xzOverlap =
      kb.minX < b.maxX && kb.maxX > b.minX && kb.minZ < b.maxZ && kb.maxZ > b.minZ;
    const yTouch =
      Math.abs(kb.minY - b.maxY) < 0.06 || Math.abs(b.minY - kb.maxY) < 0.06;
    if (xzOverlap && yTouch) continue;
    return true;
  }
  return false;
}

function keystoneBeltTop(modules) {
  const ks = modules.filter(isKeystoneMod);
  return ks.length ? Math.max(...ks.map((m) => modTopY(m))) : ROW.mid;
}

function shouldPreserveLateralPlacement(mod, modules) {
  if (/^ks-col-|^forced-col-|^ks-expand-/.test(mod.id)) return false;
  return modBottomY(mod) <= keystoneBeltTop(modules) + 0.12;
}

/** Dokładne stackowanie — ten sam filar XZ, bez luzu (Rapier). */
function snapDynamicModuleToSupport(modules, mod) {
  if (mod.isStatic || mod.type === 'foundation' || isKeystoneMod(mod)) return true;
  const preserveXZ = shouldPreserveLateralPlacement(mod, modules);
  const blockH = mod.size[1];
  let best = null;
  for (const other of modules) {
    if (other.id === mod.id || other.type === 'foundation') continue;
    const top = modTopY(other);
    if (top > modBottomY(mod) + 0.08) continue;
    const dx = mod.position[0] - other.position[0];
    const dz = mod.position[2] - other.position[2];
    const xzLimit = preserveXZ ? 0.72 : 0.78;
    if (Math.hypot(dx, dz) > xzLimit) continue;
    if (!best || top > best.top) {
      best = { other, top };
    }
  }
  if (!best) {
    for (const other of modules) {
      if (other.id === mod.id || other.type !== 'foundation') continue;
      const top = modTopY(other);
      const dx = mod.position[0] - other.position[0];
      const dz = mod.position[2] - other.position[2];
      const xzLimit = preserveXZ ? 1.05 : 2.8;
      if (Math.hypot(dx, dz) > xzLimit) continue;
      if (!best || top > best.top) best = { other, top };
    }
  }
  if (!best) return false;
  if (!preserveXZ) {
    mod.position[0] = best.other.position[0];
    mod.position[2] = best.other.position[2];
  }
  mod.position[1] = stackY(best.other.position[1], best.other.size[1], blockH);
  return true;
}

function snapAllModulesToSupports(modules) {
  const ordered = modules
    .filter((m) => !m.isStatic && m.type !== 'foundation')
    .sort((a, b) => a.position[1] - b.position[1]);
  for (const mod of ordered) {
    snapDynamicModuleToSupport(modules, mod);
  }
}

function startupStabilityReport(modules) {
  const structure = keystoneStructureIds(modules);
  const belt = keystoneBeltTop(modules);
  const dynamic = modules.filter((mod) => !mod.isStatic && mod.type !== 'foundation');
  const anchored = computeStartupAnchored(modules);
  const allowedBase = (mod) =>
    !structure.has(mod.id) && modBottomY(mod) <= belt + 0.12 && anchored.has(mod.id);
  const orphans = dynamic.filter((mod) => !structure.has(mod.id) && !allowedBase(mod));
  const unanchored = dynamic.filter((mod) => !anchored.has(mod.id));
  const ksCount = modules.filter(isKeystoneMod).length;
  return {
    ok: ksCount >= 1 && orphans.length === 0 && unanchored.length === 0,
    unanchored: orphans.length + unanchored.length,
    penetrating: 0,
    ksCount,
  };
}

/** Fizyczna stabilność startowa — pionowe filary, bez luźnych klocków. */
function finalizeStructurePhysics(modules) {
  finalizeKeystones(modules);
  for (let pass = 0; pass < 3; pass++) {
    snapAllModulesToSupports(modules);
  }
}

function bridgeRowOnKeystones(modules, keystones, rng) {
  if (keystones.length < 2) return;
  const sorted = [...keystones].sort((a, b) => a.position[0] - b.position[0]);
  const left = sorted[0];
  const right = sorted[sorted.length - 1];
  const y = stackY(left.position[1], left.size[1], 1);
  const z = (left.position[2] + right.position[2]) / 2;
  const gap = right.position[0] - left.position[0];
  if (gap < COLUMN_STEP * 0.9) return;
  for (let x = left.position[0] + COLUMN_STEP; x < right.position[0] - 0.45; x += COLUMN_STEP) {
    const sx = Math.round(x * 20) / 20;
    if (moduleSlotTaken(modules, sx, y, z)) continue;
    modules.push(
      brickAt(`ks-bridge-${Math.round(sx * 100)}`, sx, y, z, pick(rng, ['wood', 'wood', 'glass']), 'wall'),
    );
  }
}

/**
 * Przebudowuje zamek: fundament + niska baza, keystone jako węzeł nośny,
 * reszta konstrukcji tylko powyżej keystone'ów.
 */
function restructureAsLoadBearing(modules, keyCount, hp, difficulty, variant, rng) {
  const base = stripKeystones(modules);
  const anchors = findChokeAnchors(base, keyCount, difficulty, rng);
  const anchorTops = anchors.map((a) => modTopY(a.mod));
  const splitY = Math.min(...anchorTops) + 0.02;

  const kept = base.filter((mod) => {
    if (mod.isStatic || mod.type === 'foundation') return true;
    return modTopY(mod) <= splitY + 0.06;
  });

  const keystones = [];
  for (let i = 0; i < keyCount; i++) {
    const anchor = anchors[i];
    const size = 0.76 + (i === 0 ? 0.06 : 0);
    const ks = createKeystone(
      i === 0 ? 'keystone' : `keystone-${i + 1}`,
      anchor.x,
      anchor.restY,
      anchor.z,
      hp,
      size,
    );
    keystones.push(ks);
    kept.push(ks);
  }

  const target = targetModuleCount(difficulty);
  const colCap = maxBlocksAboveKeystone(difficulty);
  const minRows = difficulty <= 3 ? 2 : 1;
  const rowsPerKey = Math.min(
    colCap,
    Math.max(minRows, Math.ceil((target - kept.length) / Math.max(1, keystones.length * 1.15))),
  );
  for (let i = 0; i < keystones.length; i++) {
    stackColumnOnSupport(kept, keystones[i], rowsPerKey, `ks-col-${i + 1}`, rng, difficulty);
  }

  return kept;
}

function topKeystoneModules(modules) {
  return modules.filter(isKeystoneMod).map((ks) => keystoneColumnHead(modules, ks));
}

/** Dokłada moduły w pionowych kolumnach nad keystone do limitu wysokości. */
function expandOnKeystoneTree(modules, d, variant, rng) {
  const target = targetModuleCount(d);
  const colCap = maxBlocksAboveKeystone(d);
  let guard = 0;
  const maxGuard = 36 + Math.floor(d / 2) * 6;
  while (modules.length < target && guard < maxGuard) {
    guard++;
    const keystones = modules.filter(isKeystoneMod).filter(
      (ks) => countBlocksAboveKeystone(modules, ks) < colCap,
    );
    if (keystones.length === 0) break;
    const ks = keystones[guard % keystones.length];
    const cap = keystoneColumnHead(modules, ks);
    const y = stackY(cap.position[1], cap.size[1], 1);
    modules.push(
      brickAt(
        `ks-expand-${guard}`,
        cap.position[0],
        y,
        cap.position[2],
        pick(rng, ['wood', 'stone', 'wood']),
        guard % 5 === 0 ? 'tower' : 'wall',
      ),
    );
  }
}

/** Wszystkie moduły połączone z keystone (w górę + wąski filar w dół). */
function keystoneStructureIds(modules) {
  const ids = new Set(modules.filter(isKeystoneMod).map((k) => k.id));

  let changed = true;
  while (changed) {
    changed = false;
    for (const mod of modules) {
      if (mod.isStatic || mod.type === 'foundation' || ids.has(mod.id)) continue;
      if (directSupporters(mod, modules).some((s) => ids.has(s.id))) {
        ids.add(mod.id);
        changed = true;
      }
    }
  }

  changed = true;
  while (changed) {
    changed = false;
    for (const mod of modules) {
      if (ids.has(mod.id) || mod.isStatic || mod.type === 'foundation') continue;
      for (const above of modules) {
        if (!ids.has(above.id)) continue;
        if (!directSupporters(above, modules).some((s) => s.id === mod.id)) continue;
        const anchor = modules.filter(isKeystoneMod).find((ks) => ids.has(ks.id) &&
          Math.hypot(mod.position[0] - ks.position[0], mod.position[2] - ks.position[2]) < 0.9);
        if (!anchor) continue;
        ids.add(mod.id);
        changed = true;
        break;
      }
    }
  }
  return ids;
}

/** Moduły w filarze pod keystone (nie wolno ich usuwać przy prune). */
function supportChainBelowKeystones(modules) {
  const chain = new Set(modules.filter(isKeystoneMod).map((k) => k.id));
  let changed = true;
  while (changed) {
    changed = false;
    for (const mod of modules) {
      if (chain.has(mod.id)) continue;
      for (const above of modules) {
        if (!chain.has(above.id)) continue;
        if (directSupporters(above, modules).some((s) => s.id === mod.id)) {
          chain.add(mod.id);
          changed = true;
          break;
        }
      }
    }
  }
  return chain;
}

function castleBaseScore(mod) {
  let score = Math.abs(mod.position[0]) * 1.2 + Math.abs(mod.position[2] - Z) * 0.4;
  if (mod.type === 'gate') score += 4;
  if (mod.type === 'tower') score += 3;
  if (mod.id.includes('wall') || mod.id.includes('curtain')) score += 2;
  return score;
}

/** Usuwa klocki niepołączone z keystone; zachowuje niski pas zamku (mury, brama, wieże). */
function pruneOrphanModules(modules) {
  const keep = keystoneStructureIds(modules);
  const ksBeltY = keystoneBeltTop(modules);
  const anchored = computeStartupAnchored(modules);
  const dynamicCount = modules.filter((m) => !m.isStatic && m.type !== 'foundation').length;
  const maxBaseKeep = Math.min(5, Math.max(2, Math.floor(dynamicCount * MAX_SURVIVING_RATIO) - 1));

  const baseCandidates = modules.filter(
    (mod) =>
      !mod.isStatic &&
      mod.type !== 'foundation' &&
      !keep.has(mod.id) &&
      modBottomY(mod) <= ksBeltY + 0.12 &&
      anchored.has(mod.id),
  );
  baseCandidates.sort((a, b) => castleBaseScore(b) - castleBaseScore(a));
  const baseKeepIds = new Set(baseCandidates.slice(0, maxBaseKeep).map((m) => m.id));

  for (let i = modules.length - 1; i >= 0; i--) {
    const mod = modules[i];
    if (mod.isStatic || mod.type === 'foundation') continue;
    if (keep.has(mod.id) || baseKeepIds.has(mod.id)) continue;
    modules.splice(i, 1);
  }
}

/** Rozpiętość pozioma konstrukcji — wykrywa pojedynczą kolumnę. */
function castleLayoutReport(modules) {
  const structural = [
    ...modules.filter(isKeystoneMod),
    ...dynamicStructuralModules(modules),
  ];
  if (structural.length === 0) {
    return { singleColumn: true, spanX: 0, spanZ: 0, columnCount: 0 };
  }
  const xs = structural.map((m) => m.position[0]);
  const zs = structural.map((m) => m.position[2]);
  const spanX = Math.max(...xs) - Math.min(...xs);
  const spanZ = Math.max(...zs) - Math.min(...zs);
  const buckets = new Set(
    structural.map((m) => `${Math.round(m.position[0] * 2) / 2}:${Math.round(m.position[2] * 2) / 2}`),
  );
  const singleColumn = spanX < 1.15 && spanZ < 1.15;
  return { singleColumn, spanX, spanZ, columnCount: buckets.size };
}

function layoutOkForDifficulty(modules, difficulty) {
  const layout = castleLayoutReport(modules);
  if (difficulty <= 2) return true;
  return !layout.singleColumn && layout.spanX >= 1.8;
}

/** Dokłada skrzydła / mury boczne, gdy konstrukcja jest zbyt wąska (d3+). */
function ensureCastleFootprint(modules, difficulty, rng) {
  if (difficulty < 3 || !castleLayoutReport(modules).singleColumn) return;

  const occupied = (x, y, z) =>
    modules.some(
      (m) =>
        !m.isStatic &&
        m.type !== 'foundation' &&
        Math.hypot(m.position[0] - x, m.position[2] - z) < 0.55 &&
        Math.abs(m.position[1] - y) < 0.55,
    );

  for (const side of [-2.1, 2.1]) {
    if (!modules.some((m) => Math.abs(m.position[0] - side) < 0.65 && modBottomY(m) < ROW.mid + 0.3)) {
      if (!occupied(side, ROW.low, Z)) {
        modules.push(brickAt(`castle-wing-${side < 0 ? 'l' : 'r'}-0`, side, ROW.low, Z, 'stone', 'wall'));
      }
      if (difficulty >= 5 && !occupied(side, ROW.mid, Z)) {
        modules.push(
          brickAt(`castle-wing-${side < 0 ? 'l' : 'r'}-1`, side, ROW.mid, Z, pick(rng, ['wood', 'stone']), 'wall'),
        );
      }
    }
  }
}

/** Korony wież nad filarami keystone (d3+, w limicie kolumny). */
function addCastleSuperstructure(modules, difficulty, rng) {
  if (difficulty < 3) return;
  const colCap = maxBlocksAboveKeystone(difficulty);
  modules.filter(isKeystoneMod).forEach((ks, idx) => {
    if (countBlocksAboveKeystone(modules, ks) >= colCap) return;
    const cap = keystoneColumnHead(modules, ks);
    if (modules.some((m) => m.id.startsWith(`castle-crown-${idx}-`))) return;
    const y = stackY(cap.position[1], cap.size[1], 1);
    modules.push(
      brickAt(`castle-crown-${idx}-0`, cap.position[0], y, cap.position[2], pick(rng, ['wood', 'stone']), 'tower'),
    );
  });
}

/** Obcina kolumny powyżej limitu (zachowuje fizykę stosu). */
function enforceKeystoneColumnCap(modules, difficulty) {
  const colCap = maxBlocksAboveKeystone(difficulty);
  for (const ks of modules.filter(isKeystoneMod)) {
    while (countBlocksAboveKeystone(modules, ks) > colCap) {
      const top = keystoneColumnHead(modules, ks);
      if (isKeystoneMod(top)) break;
      const idx = modules.findIndex((mod) => mod.id === top.id);
      if (idx < 0) break;
      modules.splice(idx, 1);
    }
  }
}

/** Usuwa moduły nośne spoza drzewa keystone, które przetrwałyby bez keystone (max 30%). */
function pruneIndependentSurvivors(modules, maxSurvivingRatio = MAX_SURVIVING_RATIO) {
  pruneOrphanModules(modules);
  const tree = keystoneStructureIds(modules);
  const ksIds = new Set(modules.filter(isKeystoneMod).map((k) => k.id));
  const keystoneChain = supportChainBelowKeystones(modules);
  let guard = 0;
  while (guard < 40) {
    guard++;
    const dynamic = dynamicStructuralModules(modules).filter((mod) => tree.has(mod.id));
    if (dynamic.length === 0) break;
    const anchored = computeAnchoredIds(modules, ksIds);
    const survivors = dynamic.filter(
      (mod) => anchored.has(mod.id) && !keystoneChain.has(mod.id),
    );
    if (survivors.length / dynamic.length <= maxSurvivingRatio) break;

    survivors.sort((a, b) => {
      const score = (mod) => {
        let s = Math.hypot(mod.position[0], mod.position[2] - Z);
        if (mod.id.startsWith('expand-')) s += 5;
        if (mod.id.startsWith('ks-')) s -= 3;
        return s;
      };
      return score(b) - score(a);
    });

    const victim = survivors[0];
    const idx = modules.findIndex((mod) => mod.id === victim.id);
    if (idx < 0) break;
    modules.splice(idx, 1);
  }
}

const COLUMN_STEP = 1.05;

function keystoneSpreadXs(count) {
  if (count <= 1) return [0];
  if (count === 2) return [-COLUMN_STEP, COLUMN_STEP];
  return [-COLUMN_STEP * 2, 0, COLUMN_STEP * 2].slice(0, count);
}

function isKeystoneColumnModule(mod) {
  return /^ks-col-|^forced-col-|^ks-expand-|^castle-crown-|^ks-link-/.test(mod.id);
}

function moduleSlotTaken(modules, x, y, z, margin = 0.55) {
  return modules.some(
    (m) =>
      !m.isStatic &&
      m.type !== 'foundation' &&
      Math.hypot(m.position[0] - x, m.position[2] - z) < margin &&
      Math.abs(m.position[1] - y) < margin,
  );
}

function shiftKeystoneColumn(modules, ks, dx, dz, colIndex) {
  const ox = ks.position[0] - dx;
  const oz = ks.position[2] - dz;
  const colPrefixes =
    colIndex >= 0 ? [`ks-col-${colIndex + 1}-`, `forced-col-${colIndex + 1}-`] : [];
  const pedIds =
    colIndex >= 0
      ? [`forced-ped-${colIndex}`, `${ks.id}-pad`]
      : [`${ks.id}-pad`];

  for (const mod of modules) {
    if (mod.isStatic || mod.type === 'foundation') continue;
    if (mod.id === ks.id) continue;
    if (pedIds.includes(mod.id)) {
      mod.position[0] += dx;
      mod.position[2] += dz;
      continue;
    }
    if (colPrefixes.some((p) => mod.id.startsWith(p))) {
      mod.position[0] += dx;
      mod.position[2] += dz;
      continue;
    }
    if (isKeystoneColumnModule(mod) && Math.hypot(mod.position[0] - ox, mod.position[2] - oz) < 0.85) {
      mod.position[0] += dx;
      mod.position[2] += dz;
    }
  }
}

/** Wyrównuje filary keystone w jednej linii fasady (obok siebie). */
function alignKeystoneLayout(modules) {
  const keystones = [...modules.filter(isKeystoneMod)].sort((a, b) => a.position[0] - b.position[0]);
  if (keystones.length === 0) return;
  const xs = keystoneSpreadXs(keystones.length);
  for (let i = 0; i < keystones.length; i++) {
    const ks = keystones[i];
    const tx = xs[Math.min(i, xs.length - 1)];
    const dx = tx - ks.position[0];
    const dz = Z - ks.position[2];
    if (Math.abs(dx) < 0.01 && Math.abs(dz) < 0.01) continue;
    ks.position[0] = tx;
    ks.position[2] = Z;
    shiftKeystoneColumn(modules, ks, dx, dz, i);
  }
}

/** Łączy sąsiednie filary bramą i poziomymi belkami (fizyczne klocki). */
function connectKeystoneColumns(modules, difficulty, rng) {
  const keystones = [...modules.filter(isKeystoneMod)].sort((a, b) => a.position[0] - b.position[0]);
  if (keystones.length < 2) return;

  const z = keystones[0].position[2];
  const left = keystones[0];
  const right = keystones[keystones.length - 1];
  const spanX = right.position[0] - left.position[0];
  if (spanX < COLUMN_STEP * 0.9) return;

  if (
    !modules.some(
      (m) => m.type === 'gate' && Math.abs(m.position[0]) < 0.85 && Math.abs(m.position[2] - z) < 0.65,
    )
  ) {
    modules.push(
      m({
        id: 'ks-gate',
        type: 'gate',
        material: 'stone',
        position: [0, ROW.low, z],
        size: [Math.min(1.5, spanX * 0.55), 1, 1],
        isStatic: difficulty >= 9,
      }),
    );
  }

  const y = rowY(1);
  for (let x = left.position[0] + COLUMN_STEP; x < right.position[0] - 0.45; x += COLUMN_STEP) {
    const sx = Math.round(x * 20) / 20;
    if (moduleSlotTaken(modules, sx, y, z)) continue;
    modules.push(
      brickAt(
        `ks-link-${Math.round(sx * 100)}`,
        sx,
        y,
        z,
        pick(rng, ['stone', 'wood', 'stone']),
        'wall',
      ),
    );
  }

  if (keystones.length === 2) {
    bridgeRowOnKeystones(modules, keystones, rng);
  }
}

function buildForcedLoadBearingTower(difficulty, variant, keyCount, hp) {
  const rng = rngFor(difficulty, variant + 999);
  const modules = [foundation(8 + difficulty * 0.3)];
  const xs = keystoneSpreadXs(keyCount);
  const keystones = [];

  for (let i = 0; i < keyCount; i++) {
    const x = xs[i];
    const pedestal = brickAt(`forced-ped-${i}`, x, rowY(1), Z, 'stone', 'wall');
    modules.push(pedestal);
    const ks = createKeystone(
      i === 0 ? 'keystone' : `keystone-${i + 1}`,
      x,
      stackY(pedestal.position[1], pedestal.size[1], 0.82),
      Z,
      hp,
    );
    keystones.push(ks);
    modules.push(ks);
  }

  const colCap = maxBlocksAboveKeystone(difficulty);
  const rows = Math.min(
    colCap,
    Math.max(2, Math.ceil(targetModuleCount(difficulty) / keyCount) - 1),
  );
  for (let i = 0; i < keystones.length; i++) {
    stackColumnOnSupport(modules, keystones[i], rows, `forced-col-${i + 1}`, rng, difficulty);
  }
  return modules;
}

/** Zapasowy układ zamkowy (d3+) — mury boczne i co najmniej dwa filary. */
function buildForcedLoadBearingCastle(difficulty, variant, keyCount, hp) {
  const rng = rngFor(difficulty, variant + 1999);
  const effectiveKeys = Math.max(keyCount, 2);
  const modules = [foundation(10 + difficulty * 0.35)];
  modules.push(
    m({
      id: 'forced-gate',
      type: 'gate',
      material: 'stone',
      position: [0, ROW.low, Z],
      size: [1.4, 1, 1],
    }),
  );
  addWallRow(modules, 'forced-wall-l', -2.1, Z, 2, 1, 'stone');
  addWallRow(modules, 'forced-wall-r', 2.1, Z, 2, 1, 'stone');
  if (difficulty >= 5) {
    addColumn(modules, 'forced-tower-l', -2.5, Z + DEEP_Z, 2, 'stone', 'tower');
    addColumn(modules, 'forced-tower-r', 2.5, Z + DEEP_Z, 2, 'stone', 'tower');
  }

  const xs = keystoneSpreadXs(effectiveKeys);
  const keystones = [];
  for (let i = 0; i < effectiveKeys; i++) {
    const x = xs[i];
    const pedestal = brickAt(`forced-ped-${i}`, x, rowY(1), Z, 'stone', 'wall');
    modules.push(pedestal);
    const ks = createKeystone(
      i === 0 ? 'keystone' : `keystone-${i + 1}`,
      x,
      stackY(pedestal.position[1], pedestal.size[1], 0.82),
      Z,
      hp,
    );
    keystones.push(ks);
    modules.push(ks);
  }

  const colCap = maxBlocksAboveKeystone(difficulty);
  const rows = Math.min(
    colCap,
    Math.max(2, Math.ceil(targetModuleCount(difficulty) / effectiveKeys) - 2),
  );
  for (let i = 0; i < keystones.length; i++) {
    stackColumnOnSupport(modules, keystones[i], rows, `forced-col-${i + 1}`, rng, difficulty);
  }
  return modules;
}

function globalMaxSupportTop(modules) {
  const struct = structuralModules(modules).filter((mod) => !mod.isStatic);
  if (struct.length === 0) return 0;
  return Math.max(...struct.map((mod) => mod.position[1] + mod.size[1] / 2));
}

/** Po finalize: d3+ nie mogą stać na najwyższym rzędzie konstrukcji. */
function clampKeystonesBelowPeak(modules) {
  const maxTop = globalMaxSupportTop(modules);
  const struct = structuralModules(modules);
  const resolved = [];

  for (const ks of modules.filter(isKeystoneMod)) {
    const ksSupportTop = ks.position[1] - ks.size[0] / 2;
    if (ksSupportTop < maxTop - 0.45) {
      resolved.push(ks);
      continue;
    }

    const [ox, , oz] = ks.position;
    const size = ks.size[0];
    let placed = false;

    const lowerSupports = struct
      .filter((mod) => !mod.isStatic && mod.position[1] + mod.size[1] / 2 < maxTop - 0.45)
      .sort(
        (a, b) =>
          b.position[1] + b.size[1] / 2 - (a.position[1] + a.size[1] / 2),
      );

    for (const mod of lowerSupports) {
      ks.position[0] = mod.position[0];
      ks.position[2] = mod.position[2];
      ks.position[1] = stackY(mod.position[1], mod.size[1], size);
      if (!keystonePenetrates(modules, ks, resolved)) {
        placed = true;
        break;
      }
    }

    if (!placed) {
      ks.position[0] = ox;
      ks.position[2] = oz;
      for (const mod of lowerSupports) {
        ks.position[0] = mod.position[0];
        ks.position[2] = mod.position[2];
        ks.position[1] = stackY(mod.position[1], mod.size[1], size);
        if (!keystonePenetrates(modules, ks, resolved)) {
          placed = true;
          break;
        }
      }
    }

    resolved.push(ks);
  }
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
  if (y >= ROW.high) score -= 2.5;

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
    anchors = centralTopKeystoneAnchors(anchors);
  } else {
    anchors = excludeTopKeystoneAnchors(anchors);
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
  if (d >= 3) {
    addColumn(modules, 'tower-l', -2.5, Z + DEEP_Z, 1 + (d >= 5 ? 1 : 0), 'wood', 'tower');
    addColumn(modules, 'tower-r', 2.5, Z + DEEP_Z, 1 + (d >= 5 ? 1 : 0), 'wood', 'tower');
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

function buildCastle(difficulty, variant) {
  const blueprint = blueprintForDifficulty(difficulty, variant);
  const build = BUILDERS[blueprint];
  const keyCount = Math.min(MAX_KEYSTONES, keystoneCountFor(difficulty, variant, rngFor(difficulty, variant)));
  const hp = runKeystoneHp(difficulty, variant);

  for (let attempt = 0; attempt < 16; attempt++) {
    const rng = rngFor(difficulty, variant * 31 + attempt * 509);
    let modules = build(difficulty, variant, rng);
    modules = restructureAsLoadBearing(modules, keyCount, hp, difficulty, variant, rng);
    alignKeystoneLayout(modules);
    connectKeystoneColumns(modules, difficulty, rng);
    expandOnKeystoneTree(modules, difficulty, variant, rng);
    addCastleSuperstructure(modules, difficulty, rng);
    ensureCastleFootprint(modules, difficulty, rng);
    trimToMaxModules(modules);
    if (difficulty >= 3) {
      clampKeystonesBelowPeak(modules);
    }
    pruneIndependentSurvivors(modules);
    enforceKeystoneColumnCap(modules, difficulty);
    finalizeStructurePhysics(modules);
    trimToMaxModules(modules);

    const ksCount = modules.filter(isKeystoneMod).length;
    const collapse = collapseRatioWhenKeystonesRemoved(modules);
    const stability = startupStabilityReport(modules);
    const layout = castleLayoutReport(modules);
    if (
      ksCount >= 1 &&
      collapse >= MIN_COLLAPSE_RATIO &&
      stability.ok &&
      layoutOkForDifficulty(modules, difficulty)
    ) {
      return { modules, blueprint, keyCount: ksCount, collapse, stability, layout };
    }
  }

  let modules =
    difficulty <= 2
      ? buildForcedLoadBearingTower(difficulty, variant, keyCount, hp)
      : buildForcedLoadBearingCastle(difficulty, variant, keyCount, hp);
  alignKeystoneLayout(modules);
  connectKeystoneColumns(modules, difficulty, rngFor(difficulty, variant + 777));
  trimToMaxModules(modules);
  if (difficulty >= 3) clampKeystonesBelowPeak(modules);
  pruneIndependentSurvivors(modules);
  enforceKeystoneColumnCap(modules, difficulty);
  finalizeStructurePhysics(modules);
  return {
    modules,
    blueprint,
    keyCount: modules.filter(isKeystoneMod).length,
    collapse: collapseRatioWhenKeystonesRemoved(modules),
    stability: startupStabilityReport(modules),
    layout: castleLayoutReport(modules),
  };
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
    const { modules, blueprint, keyCount, collapse, stability, layout } = buildCastle(d, v);
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
    if (collapse < MIN_COLLAPSE_RATIO) {
      console.warn(
        `WARN d${d} v${v}: zapadnięcie ${(collapse * 100).toFixed(0)}% (min ${MIN_COLLAPSE_RATIO * 100}%)`,
      );
      warnings++;
    }
    if (!stability.ok) {
      console.warn(
        `WARN d${d} v${v}: niestabilny start (unanchored=${stability.unanchored}, penetrate=${stability.penetrating})`,
      );
      warnings++;
    }
    if (!layoutOkForDifficulty(modules, d)) {
      console.warn(
        `WARN d${d} v${v}: zbyt prosta kolumna (spanX=${layout.spanX.toFixed(1)}, spanZ=${layout.spanZ.toFixed(1)})`,
      );
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

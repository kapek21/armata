#!/usr/bin/env node
/**
 * Generator 50 poziomów — szablony zamków modułowych.
 * watchtower → gatehouse → curtain_wall → twin_towers → courtyard → bastion → citadel
 */
import { writeFileSync, mkdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dir, '../src/levels/data');
mkdirSync(outDir, { recursive: true });

const Z = -2;
/** Środki rzędów muru (wysokość bloku = 1). */
const ROW = { low: 0.5, mid: 1.5, high: 2.5 };
const DEEP_Z = -0.35;

const CHAPTER_NAMES = [
  'Folwark',
  'Warownia',
  'Bastiony',
  'Oblężenie',
  'Królewska cytadela',
];

const BLUEPRINTS = [
  { id: 'watchtower', label: 'Wieża strażnicza', levels: [1, 5] },
  { id: 'gatehouse', label: 'Brama warowna', levels: [6, 12] },
  { id: 'curtain_wall', label: 'Mur kurtynowy', levels: [13, 20] },
  { id: 'twin_towers', label: 'Bliźniacze wieże', levels: [21, 28] },
  { id: 'courtyard', label: 'Dziedziniec', levels: [29, 36] },
  { id: 'bastion', label: 'Bastion', levels: [37, 44] },
  { id: 'citadel', label: 'Cytadela', levels: [45, 50] },
];

function chapterOf(index) {
  return Math.ceil(index / 10);
}

function blueprintForLevel(index) {
  return BLUEPRINTS.find((b) => index >= b.levels[0] && index <= b.levels[1]) ?? BLUEPRINTS[0];
}

function keystoneCount(levelIndex) {
  if (levelIndex < 10) return 1;
  if (levelIndex < 20) return 2;
  if (levelIndex < 35) return 3;
  return 4;
}

function timing(chapter, slot, levelIndex) {
  const keys = keystoneCount(levelIndex);
  const timeLimitSec = Math.max(38, 118 - chapter * 14 - slot * 2);
  const ammoLimit = Math.max(2, 6 - Math.floor(chapter / 2) - (slot > 6 ? 1 : 0) + keys - 1);
  const starTimeSec = [
    Math.round(timeLimitSec * 0.55),
    Math.round(timeLimitSec * 0.38),
    Math.round(timeLimitSec * 0.22),
  ];
  const starShots = [
    Math.max(1, ammoLimit - 2),
    Math.max(1, ammoLimit - 1),
    ammoLimit,
  ];
  const base = 350 + chapter * 100 + slot * 15;
  const starScore = [base + 450, base + 250, base];
  return { timeLimitSec, ammoLimit, starTimeSec, starShots, starScore };
}

function keystoneHp(chapter, slot) {
  return 70 + chapter * 14 + slot * 3;
}

/** Środek bloku stojącego na podporze (bez luzu — fizyka Rapier). */
function stackY(supportCenterY, supportHeight, blockSize) {
  return supportCenterY + supportHeight / 2 + blockSize / 2;
}

/** @param {object} p */
function m(p) {
  return {
    importance: 'structural',
    isStatic: false,
    ...p,
  };
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

function keystone(id, x, y, z, chapter, slot, size = 0.82) {
  return m({
    id,
    type: 'keystone',
    material: 'wood',
    position: [x, y, z],
    size: [size, size, size],
    importance: 'critical',
    hitPoints: keystoneHp(chapter, slot),
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

/** Keystone spoczywa na górnej ściance podpory (styk bez penetracji). */
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
  const candidates = [];

  for (const mod of modules) {
    if (mod.id === ks.id || isKeystoneMod(mod)) continue;
    if (!xzOnSupportFootprint(x, z, mod, size)) continue;
    const top = mod.position[1] + mod.size[1] / 2;
    candidates.push({ mod, top });
  }

  candidates.sort((a, b) => b.top - a.top);
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

/** Rozdziela cele, które startują w tym samym punkcie XZ. */
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

/**
 * Po złożeniu zamku: dopasuj Y keystone do podpory, usuń penetracje (bez zmiany roli / strefy XZ).
 */
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
      [0, DEEP_Z * 2],
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

/** Rola głównego klucza — mieszany hash (peak/mid/deep/low) na wszystkich 50 poziomach. */
function primaryRole(levelIndex, slot) {
  const chapter = Math.ceil(levelIndex / 10);
  return ['peak', 'mid', 'deep', 'low'][(levelIndex * 7 + slot * 11 + chapter) % 4];
}

/** Role dodatkowych kluczy — ogranicza „peak”, żeby cele nie były zawsze na górze. */
function extraRoles(levelIndex, slot, count, primary) {
  const cycle = ['mid', 'low', 'deep', 'flank', 'peak'];
  const start = (levelIndex * 3 + slot * 2) % cycle.length;
  const roles = [];
  for (let i = 0; i < count; i++) {
    roles.push(cycle[(start + i) % cycle.length]);
  }
  if (primary === 'peak' && roles[0] === 'peak') {
    roles[0] = cycle[(start + count + 1) % cycle.length];
  }
  let peaks = roles.filter((r) => r === 'peak').length;
  for (let i = roles.length - 1; i >= 0 && peaks > 1; i--) {
    if (roles[i] === 'peak') {
      roles[i] = 'low';
      peaks--;
    }
  }
  return roles;
}

/** Y środka keystone na wierzchu bloku w danym rzędzie. */
function onRow(rowY, size) {
  return stackY(rowY, 1, size);
}

function brickAt(id, x, y, z, material, type = 'wall', extra = {}) {
  return m({ id, type, material, position: [x, y, z], size: [1, 1, 1], ...extra });
}

/** Poziomy rząd klocków (np. mur kurtynowy). */
function brickRow(id, xCenter, y, z, count, spacing, material, type = 'wall') {
  const mods = [];
  const half = (count - 1) / 2;
  for (let i = 0; i < count; i++) {
    const mat = Array.isArray(material) ? material[i % material.length] : material;
    mods.push(brickAt(`${id}-${i}`, xCenter + (i - half) * spacing, y, z, mat, type));
  }
  return mods;
}

/** Segment 2-rzędowy: podstawa kamienna + piętro drewniane/szklane. */
function tieredWall(id, x, z, upperMat = 'wood', baseType = 'wall') {
  return [
    brickAt(`${id}-base`, x, ROW.low, z, 'stone', baseType),
    brickAt(`${id}-upper`, x, ROW.mid, z, upperMat),
  ];
}

/** Kolumna klocków + keystone na szczycie (stabilna fizyka). */
function keySpot(id, x, z, columns, chapter, slot, size = 0.74) {
  const mods = [];
  for (let c = 0; c < columns; c++) {
    mods.push(
      brickAt(`${id}-col-${c}`, x, ROW.low + c, z, c === 0 ? 'stone' : 'wood', 'tower'),
    );
  }
  const topY = ROW.low + columns - 1;
  mods.push(keystone(id, x, stackY(topY, 1, size), z, chapter, slot, size));
  return mods;
}

/**
 * Umieszcza keystone wg roli: peak | mid | low | deep | flank.
 * anchor: { x, z, columns?, rowY?, towerTopY?, towerH?, supportY?, supportH?, zDeep?, flankX?, addDeepSupport? }
 */
function placeByRole(modules, id, role, anchor, chapter, slot, size = 0.74) {
  const { x, z } = anchor;
  const zDeep = anchor.zDeep ?? DEEP_Z;

  switch (role) {
    case 'peak': {
      if (anchor.columns != null) {
        const topY = ROW.low + anchor.columns - 1;
        modules.push(keystone(id, x, stackY(topY, 1, size), z, chapter, slot, size));
        break;
      }
      if (anchor.towerTopY != null) {
        modules.push(
          keystone(
            id,
            x,
            stackY(anchor.towerTopY, anchor.towerH ?? 1.2, size),
            z,
            chapter,
            slot,
            size,
          ),
        );
        break;
      }
      if (anchor.supportY != null) {
        modules.push(
          keystone(
            id,
            x,
            stackY(anchor.supportY, anchor.supportH ?? 1, size),
            z,
            chapter,
            slot,
            size,
          ),
        );
        break;
      }
      modules.push(keystone(id, x, onRow(anchor.rowY ?? ROW.high, size), z, chapter, slot, size));
      break;
    }
    case 'mid':
      modules.push(keystone(id, x, onRow(anchor.rowY ?? ROW.mid, size), z, chapter, slot, size));
      break;
    case 'low':
      modules.push(keystone(id, x, onRow(ROW.low, size), z, chapter, slot, size));
      break;
    case 'deep': {
      const rowY = anchor.rowY ?? ROW.low;
      const dz = z + zDeep;
      if (anchor.addDeepSupport !== false) {
        const hasSupport = modules.some((mod) => {
          const [mx, my, mz] = mod.position;
          return Math.abs(mx - x) < 0.55 && Math.abs(my - rowY) < 0.55 && Math.abs(mz - dz) < 0.55;
        });
        if (!hasSupport) {
          modules.push(brickAt(`${id}-deep-support`, x, rowY, dz, 'wood'));
        }
      }
      modules.push(keystone(id, x, onRow(rowY, size), dz, chapter, slot, size));
      break;
    }
    case 'flank':
      modules.push(
        keystone(
          id,
          anchor.flankX ?? x,
          onRow(anchor.rowY ?? ROW.mid, size),
          anchor.flankZ ?? z,
          chapter,
          slot,
          size,
        ),
      );
      break;
    default:
      modules.push(keystone(id, x, onRow(ROW.mid, size), z, chapter, slot, size));
  }
}

/** Dodatkowe keystone'y wg poziomu (od 10). spots: { id?, role, x, z, ... } */
function appendKeystones(modules, spots, chapter, slot, levelIndex) {
  const need = keystoneCount(levelIndex);
  for (let i = 1; i < need && i - 1 < spots.length; i++) {
    const s = spots[i - 1];
    const id = s.id ?? `keystone-${i + 1}`;
    const size = s.size ?? 0.74;
    if (s.role) {
      placeByRole(modules, id, s.role, s, chapter, slot, size);
    } else if (s.y != null) {
      modules.push(keystone(id, s.x, s.y, s.z, chapter, slot, size));
    } else if (s.useExisting) {
      placeByRole(modules, id, 'peak', { x: s.x, z: s.z, columns: s.columns }, chapter, slot, size);
    } else if (s.columns) {
      modules.push(...keySpot(id, s.x, s.z, s.columns, chapter, slot, size));
    }
  }
}

/** Poziomy 1–5: wieża 2+ rzędów + boczne podpory */
function watchtower(chapter, slot, levelIndex) {
  const h = Math.max(2, 2 + Math.floor(slot / 2) + (chapter > 1 ? 1 : 0));
  const modules = [foundation(9 + slot * 0.2)];
  const role = primaryRole(levelIndex, slot);
  const ksSize = 0.82;
  const extras = extraRoles(levelIndex, slot, 2, role);

  for (let i = 0; i < h; i++) {
    modules.push(
      brickAt(
        `core-${i}`,
        0,
        ROW.low + i,
        Z,
        i % 2 === 0 ? 'wood' : 'stone',
        i === 0 ? 'gate' : 'wall',
      ),
    );
  }

  if (slot >= 3) {
    for (const side of [-1.3, 1.3]) {
      const tag = side < 0 ? 'l' : 'r';
      modules.push(
        ...tieredWall(`buttress-${tag}`, side, Z, 'wood', 'tower'),
      );
    }
  }

  if (role === 'deep') {
    modules.push(brickAt('core-deep', 0, ROW.low, Z + DEEP_Z, 'stone'));
  }

  placeByRole(modules, 'keystone', role, {
    x: 0,
    z: Z,
    columns: role === 'peak' ? h : undefined,
    rowY: role === 'mid' ? ROW.mid : role === 'low' ? ROW.low : ROW.low,
    zDeep: DEEP_Z,
    addDeepSupport: false,
  }, chapter, slot, ksSize);

  appendKeystones(
    modules,
    [
      {
        id: 'keystone-2',
        role: extras[0],
        x: -1.3,
        z: Z,
        flankX: -1.3,
        rowY: ROW.mid,
        zDeep: DEEP_Z,
        size: 0.74,
      },
      {
        id: 'keystone-3',
        role: extras[1],
        x: 1.3,
        z: Z,
        flankX: 1.3,
        rowY: ROW.low,
        zDeep: DEEP_Z,
        size: 0.74,
      },
    ],
    chapter,
    slot,
    levelIndex,
  );
  return modules;
}

/** Poziomy 6–12: brama 2-rzędowa, klucz peak/mid/low/deep */
function gatehouse(chapter, slot, levelIndex) {
  const modules = [foundation(12)];
  const gateStatic = chapter >= 2 || slot >= 5;
  const role = primaryRole(levelIndex, slot);
  const ksSize = 0.78;
  const extras = extraRoles(levelIndex, slot, 2, role);

  modules.push(
    m({
      id: 'gate',
      type: 'gate',
      material: 'stone',
      position: [0, 0.55, Z],
      size: [1.5, 1.15, 1.1],
      isStatic: gateStatic,
    }),
    ...tieredWall('wing-l', -1.8, Z, 'wood'),
    ...tieredWall('wing-r', 1.8, Z, 'wood'),
    m({
      id: 'tower-l',
      type: 'tower',
      material: 'stone',
      position: [-1.8, 1.55, Z],
      size: [0.85, 1.2, 0.85],
    }),
    m({
      id: 'tower-r',
      type: 'tower',
      material: 'stone',
      position: [1.8, 1.55, Z],
      size: [0.85, 1.2, 0.85],
    }),
    m({
      id: 'lintel',
      type: 'wall',
      material: 'wood',
      position: [0, 1.55, Z],
      size: [1.3, 0.7, 0.9],
    }),
    brickAt('inner-l', -0.9, ROW.mid, Z + DEEP_Z, 'wood'),
    brickAt('inner-r', 0.9, ROW.mid, Z + DEEP_Z, 'wood'),
  );

  if (role === 'deep') {
    modules.push(brickAt('gate-deep', 0, ROW.low, Z + DEEP_Z, 'stone'));
  }
  if (role === 'mid') {
    modules.push(brickAt('gate-mid', 0, ROW.mid, Z, 'wood'));
  }

  const primaryX =
    role === 'low'
      ? slot % 2 === 0
        ? -1.8
        : 1.8
      : role === 'mid'
        ? 0
        : role === 'deep'
          ? 0
          : 0;
  const primaryZ = role === 'deep' ? Z + DEEP_Z : role === 'mid' && slot % 2 === 0 ? Z + DEEP_Z : Z;

  placeByRole(modules, 'keystone', role, {
    x: primaryX,
    z: primaryZ,
    supportY: role === 'peak' ? 1.55 : undefined,
    supportH: role === 'peak' ? 0.7 : undefined,
    rowY: role === 'mid' ? ROW.mid : ROW.low,
    zDeep: DEEP_Z,
    addDeepSupport: false,
  }, chapter, slot, ksSize);

  appendKeystones(
    modules,
    [
      {
        id: 'keystone-2',
        role: extras[0],
        x: -1.8,
        z: Z,
        flankX: -1.8,
        towerTopY: 1.55,
        towerH: 1.3,
        rowY: ROW.mid,
        zDeep: DEEP_Z,
        size: 0.74,
      },
      {
        id: 'keystone-3',
        role: extras[1],
        x: 1.8,
        z: Z,
        flankX: 1.8,
        towerTopY: 1.55,
        towerH: 1.3,
        rowY: ROW.low,
        zDeep: DEEP_Z,
        size: 0.74,
      },
    ],
    chapter,
    slot,
    levelIndex,
  );

  return modules;
}

/** Poziomy 13–20: mur 2-rzędowy, klucze peak/mid/low/deep/flank */
function curtain_wall(chapter, slot, levelIndex) {
  const spread = 3 + Math.floor(slot / 3);
  const modules = [foundation(10 + spread * 2)];
  const role = primaryRole(levelIndex, slot);
  const keySide = slot % 2 === 0 ? 1 : -1;
  const ksSize = 0.82;
  const extras = extraRoles(levelIndex, slot, 3, role);

  for (let x = -spread; x <= spread; x++) {
    const upperMat = Math.abs(x) === 0 && slot % 3 === 0 ? 'glass' : 'wood';
    modules.push(...tieredWall(`wall-${x}`, x * 1.1, Z, upperMat));
  }

  modules.push(
    m({
      id: 'tower-l',
      type: 'tower',
      material: 'stone',
      position: [-spread * 1.1 - 0.5, 1.55, Z],
      size: [0.9, 1.3, 0.9],
    }),
    m({
      id: 'tower-r',
      type: 'tower',
      material: 'stone',
      position: [spread * 1.1 + 0.5, 1.55, Z],
      size: [0.9, 1.3, 0.9],
    }),
  );

  if (slot >= 5) {
    modules.push(
      m({
        id: 'parapet',
        type: 'wall',
        material: 'stone',
        position: [0, 1.55, Z],
        size: [spread * 1.6, 0.55, 0.85],
        isStatic: chapter >= 2,
      }),
    );
  }

  const keyX = keySide * (spread * 0.75);
  const keyZ = role === 'deep' ? Z + DEEP_Z : Z;

  if (role === 'deep') {
    modules.push(brickAt('keep-deep', keyX, ROW.low, keyZ, 'wood'));
  }
  if (role === 'peak') {
    modules.push(brickAt('keep-peak', keyX, ROW.high, keyZ, 'stone'));
  }

  placeByRole(modules, 'keystone', role, {
    x: keyX,
    z: keyZ,
    rowY: role === 'mid' ? ROW.mid : role === 'peak' ? ROW.high : ROW.low,
    towerTopY: role === 'peak' ? undefined : undefined,
    zDeep: DEEP_Z,
    addDeepSupport: false,
  }, chapter, slot, ksSize);

  appendKeystones(
    modules,
    [
      {
        id: 'keystone-2',
        role: extras[0],
        x: -spread * 1.1 - 0.5,
        z: Z,
        towerTopY: 1.55,
        towerH: 1.3,
        rowY: ROW.mid,
        zDeep: DEEP_Z,
        size: 0.74,
      },
      {
        id: 'keystone-3',
        role: extras[1],
        x: 0,
        z: Z,
        rowY: ROW.mid,
        zDeep: DEEP_Z,
        size: 0.74,
      },
      {
        id: 'keystone-4',
        role: extras[2],
        x: -keySide * (spread * 0.75),
        z: Z,
        rowY: ROW.low,
        zDeep: DEEP_Z,
        size: 0.74,
      },
    ],
    chapter,
    slot,
    levelIndex,
  );

  return modules;
}

/** Poziomy 21–28: dwie wieże 2-rzędowe + most, klucze zróżnicowane */
function twin_towers(chapter, slot, levelIndex) {
  const towerH = 2 + Math.floor(slot / 4);
  const gap = 2.2 + (slot % 3) * 0.15;
  const modules = [foundation(11)];
  const role = primaryRole(levelIndex, slot);
  const bridgeY = ROW.low + towerH - 0.2;
  const bridgeH = 0.35;
  const ksSize = 0.8;
  const extras = extraRoles(levelIndex, slot, 2, role);

  for (const side of [-1, 1]) {
    const tx = side * gap;
    modules.push(...tieredWall(`tower${side < 0 ? '-l' : '-r'}-base`, tx, Z, 'stone', 'tower'));
    for (let i = 1; i < towerH; i++) {
      modules.push(
        brickAt(
          `tower${side < 0 ? '-l' : '-r'}-${i}`,
          tx,
          ROW.low + i,
          Z,
          i % 2 === 0 ? 'wood' : 'stone',
          'tower',
          { isStatic: i === 0 && chapter >= 3 },
        ),
      );
    }
  }

  modules.push(
    m({
      id: 'bridge',
      type: 'wall',
      material: 'glass',
      position: [0, bridgeY, Z],
      size: [gap * 1.7, bridgeH, 0.75],
    }),
    brickAt('tie-l', -gap * 0.55, bridgeY - 0.5, Z, 'wood'),
    brickAt('tie-r', gap * 0.55, bridgeY - 0.5, Z, 'wood'),
  );

  if (role === 'deep') {
    modules.push(brickAt('bridge-deep', 0, ROW.low, Z + DEEP_Z, 'wood'));
  }

  const primaryX =
    role === 'peak' ? 0 : role === 'mid' ? -gap : role === 'low' ? gap : 0;
  const primaryZ = role === 'deep' ? Z + DEEP_Z : Z;

  placeByRole(modules, 'keystone', role, {
    x: primaryX,
    z: primaryZ,
    supportY: role === 'peak' ? bridgeY : undefined,
    supportH: role === 'peak' ? bridgeH : undefined,
    rowY: role === 'mid' || role === 'low' ? ROW.mid : ROW.low,
    zDeep: DEEP_Z,
    addDeepSupport: false,
  }, chapter, slot, ksSize);

  appendKeystones(
    modules,
    [
      {
        id: 'keystone-2',
        role: extras[0],
        x: -gap,
        z: Z,
        columns: towerH,
        rowY: ROW.mid,
        zDeep: DEEP_Z,
        size: 0.74,
      },
      {
        id: 'keystone-3',
        role: extras[1],
        x: gap,
        z: Z,
        columns: towerH,
        rowY: ROW.low,
        zDeep: DEEP_Z,
        size: 0.74,
      },
    ],
    chapter,
    slot,
    levelIndex,
  );

  return modules;
}

/** Poziomy 29–36: dziedziniec 2-rzędowy, klucze w narożniku / wewnątrz */
function courtyard(chapter, slot, levelIndex) {
  const arm = 2 + Math.floor(slot / 3);
  const modules = [foundation(12, 8)];
  const role = primaryRole(levelIndex, slot);
  const ksSize = 0.76;
  const extras = extraRoles(levelIndex, slot, 3, role);

  for (let i = 0; i < arm; i++) {
    modules.push(
      ...tieredWall(`back-${i}`, -1.5 + i * 1.1, Z - 1.2, i === arm - 1 ? 'stone' : 'wood'),
      ...tieredWall(`side-${i}`, -2.4, Z + i * 0.55, 'wood'),
    );
  }

  modules.push(
    m({
      id: 'corner-tower',
      type: 'tower',
      material: 'stone',
      position: [-2.4, 1.55, Z - 1.2],
      size: [1, 1.2, 1],
      isStatic: slot >= 6,
    }),
    brickAt('inner-1', -1.2, ROW.mid, Z - 0.5, 'wood'),
    brickAt('inner-2', -1.8, ROW.mid, Z - 0.2, 'glass'),
  );

  if (chapter >= 4) {
    modules.push(
      m({
        id: 'pillar',
        type: 'wall',
        material: 'metal',
        position: [-0.5, 1.5, Z],
        size: [0.35, 1.6, 0.35],
        isStatic: true,
      }),
    );
  }

  if (role === 'deep') {
    modules.push(brickAt('court-deep', -1.2, ROW.low, Z - 0.5 + DEEP_Z, 'wood'));
  }
  if (role === 'low') {
    modules.push(brickAt('court-low', -1.8, ROW.low, Z - 0.2, 'wood'));
  }

  placeByRole(modules, 'keystone', role, {
    x: role === 'peak' ? -2.4 : role === 'low' ? -1.8 : -1.2,
    z: role === 'deep' ? Z - 0.5 + DEEP_Z : role === 'peak' ? Z - 1.2 : Z - 0.2,
    towerTopY: role === 'peak' ? 1.55 : undefined,
    towerH: role === 'peak' ? 1.2 : undefined,
    rowY: role === 'mid' ? ROW.mid : ROW.low,
    zDeep: DEEP_Z,
    addDeepSupport: false,
  }, chapter, slot, ksSize);

  appendKeystones(
    modules,
    [
      {
        id: 'keystone-2',
        role: extras[0],
        x: -1.2,
        z: Z - 0.5,
        rowY: ROW.mid,
        zDeep: DEEP_Z,
        size: 0.74,
      },
      {
        id: 'keystone-3',
        role: extras[1],
        x: -1.8,
        z: Z - 0.2,
        rowY: ROW.low,
        zDeep: DEEP_Z,
        size: 0.74,
      },
      {
        id: 'keystone-4',
        role: extras[2],
        x: -0.5,
        z: Z,
        supportY: 1.5,
        supportH: 1.6,
        rowY: ROW.mid,
        zDeep: DEEP_Z,
        size: 0.72,
      },
    ],
    chapter,
    slot,
    levelIndex,
  );

  return modules;
}

/** Poziomy 37–44: bastion 2-rzędowy, klucze na każdym poziomie */
function bastion(chapter, slot, levelIndex) {
  const modules = [foundation(13)];
  const role = primaryRole(levelIndex, slot);
  const ksSize = 0.75;
  const ksZ = Z + DEEP_Z;
  const extras = extraRoles(levelIndex, slot, 3, role);

  for (const [cx] of [[-2.8], [2.8], [-2.5], [2.5]]) {
    modules.push(
      m({
        id: `corner-${cx}`,
        type: 'tower',
        material: 'metal',
        position: [cx, 0.55, Z],
        size: [0.7, 1.15, 0.7],
        isStatic: true,
      }),
    );
  }

  for (const x of [-1.5, 0, 1.5]) {
    modules.push(...tieredWall(`ring-${x}`, x, Z, x === 0 ? 'glass' : 'wood'));
  }

  modules.push(
    m({
      id: 'gate',
      type: 'gate',
      material: 'stone',
      position: [0, 0.55, Z + 0.2],
      size: [1.4, 1.1, 1],
      isStatic: true,
    }),
    m({
      id: 'window',
      type: 'wall',
      material: 'glass',
      position: [1.2, 1.55, Z - 0.25],
      size: [1.2, 0.45, 0.7],
    }),
    brickAt('vault-l', -0.8, ROW.high, Z + DEEP_Z, 'wood'),
    brickAt('vault-r', 0.8, ROW.high, Z + DEEP_Z, 'wood'),
  );

  const primaryAnchor = {
    x: 0,
    z: Z,
    rowY: role === 'mid' ? ROW.mid : role === 'low' ? ROW.low : ROW.mid,
    zDeep: DEEP_Z,
    supportY: role === 'peak' ? ROW.high : undefined,
    supportH: role === 'peak' ? 0.8 : undefined,
    addDeepSupport: false,
  };
  if (role === 'deep') {
    primaryAnchor.x = 0;
    primaryAnchor.z = Z;
    primaryAnchor.rowY = ROW.mid;
  }
  if (role === 'peak') {
    primaryAnchor.x = slot % 2 === 0 ? -0.8 : 0.8;
    primaryAnchor.z = ksZ;
    primaryAnchor.rowY = ROW.high;
    delete primaryAnchor.supportY;
    delete primaryAnchor.supportH;
  }

  placeByRole(modules, 'keystone', role, primaryAnchor, chapter, slot, ksSize);

  appendKeystones(
    modules,
    [
      {
        id: 'keystone-2',
        role: extras[0],
        x: -1.5,
        z: Z,
        rowY: ROW.low,
        zDeep: DEEP_Z,
        size: 0.74,
      },
      {
        id: 'keystone-3',
        role: extras[1],
        x: 1.5,
        z: Z,
        rowY: ROW.mid,
        zDeep: DEEP_Z,
        size: 0.74,
      },
      {
        id: 'keystone-4',
        role: extras[2],
        x: 1.2,
        z: Z - 0.25,
        supportY: 1.55,
        supportH: 0.45,
        rowY: ROW.high,
        zDeep: DEEP_Z,
        size: 0.72,
      },
    ],
    chapter,
    slot,
    levelIndex,
  );

  return modules;
}

/** Poziomy 45–50: cytadela wielopiętrowa, 4 role kluczy */
function citadel(chapter, slot, levelIndex) {
  const modules = [foundation(14, 8)];
  const role = primaryRole(levelIndex, slot);
  const ksSize = 0.78;
  const ksZ = Z + DEEP_Z;
  const extras = extraRoles(levelIndex, slot, 3, role);

  modules.push(
    m({
      id: 'outer-gate',
      type: 'gate',
      material: 'stone',
      position: [0, 0.55, Z + 0.35],
      size: [1.6, 1.2, 1.1],
      isStatic: true,
    }),
  );

  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      modules.push(
        brickAt(
          `flank-${side}-${i}`,
          side * (2 + i * 0.3),
          ROW.low + i,
          Z,
          i === 0 ? 'stone' : i === 1 ? 'wood' : 'glass',
          i === 0 ? 'tower' : 'wall',
          { isStatic: i === 0 },
        ),
      );
    }
  }

  modules.push(
    brickAt('keep-0', 0, ROW.mid, Z - 0.15, 'stone', 'wall', { isStatic: true }),
    brickAt('keep-1', 0, ROW.high, Z - 0.25, 'wood'),
    brickAt('keep-2', -0.9, ROW.high, Z + DEEP_Z, 'wood'),
    brickAt('keep-3', 0.9, ROW.high, Z + DEEP_Z, 'wood'),
    m({
      id: 'core-pillar',
      type: 'wall',
      material: 'metal',
      position: [0, 3.5, Z - 0.45],
      size: [0.5, 1.2, 0.5],
      isStatic: true,
    }),
  );

  if (levelIndex === 50) {
    modules.push(
      ...tieredWall('boss-base', 2.2, Z - 0.2, 'stone', 'tower'),
      m({
        id: 'boss-tower',
        type: 'tower',
        material: 'stone',
        position: [2.2, 1.55, Z - 0.2],
        size: [0.9, 1.2, 0.9],
      }),
    );
  }

  const primaryAnchor = {
    x: 0,
    z: ksZ,
    rowY: ROW.high,
    zDeep: DEEP_Z,
    addDeepSupport: false,
  };
  if (role === 'peak') {
    primaryAnchor.supportY = 3.5;
    primaryAnchor.supportH = 1.2;
    primaryAnchor.z = Z - 0.45;
  } else if (role === 'mid') {
    primaryAnchor.x = 0;
    primaryAnchor.z = Z - 0.15;
    primaryAnchor.rowY = ROW.mid;
  } else if (role === 'low') {
    primaryAnchor.x = -2;
    primaryAnchor.z = Z;
    primaryAnchor.rowY = ROW.low;
  } else if (role === 'deep') {
    primaryAnchor.x = -0.9;
    primaryAnchor.z = Z;
    primaryAnchor.rowY = ROW.high;
  }

  placeByRole(modules, 'keystone', role, primaryAnchor, chapter, slot, ksSize);

  appendKeystones(
    modules,
    [
      {
        id: 'keystone-2',
        role: extras[0],
        x: -2,
        z: Z,
        flankX: -2,
        rowY: ROW.mid,
        zDeep: DEEP_Z,
        size: 0.74,
      },
      {
        id: 'keystone-3',
        role: extras[1],
        x: 2,
        z: Z,
        columns: 3,
        rowY: ROW.mid,
        zDeep: DEEP_Z,
        size: 0.74,
      },
      {
        id: 'keystone-4',
        role: extras[2],
        x: levelIndex === 50 ? 2.2 : 2.6,
        z: levelIndex === 50 ? Z - 0.2 : Z,
        rowY: levelIndex === 50 ? ROW.mid : ROW.low,
        columns: levelIndex === 50 ? 2 : 3,
        zDeep: DEEP_Z,
        size: 0.72,
      },
    ],
    chapter,
    slot,
    levelIndex,
  );

  return modules;
}

const BUILDERS = {
  watchtower,
  gatehouse,
  curtain_wall,
  twin_towers,
  courtyard,
  bastion,
  citadel,
};

for (let i = 1; i <= 50; i++) {
  const chapter = chapterOf(i);
  const slot = ((i - 1) % 10) + 1;
  const bp = blueprintForLevel(i);
  const t = timing(chapter, slot, i);
  const build = BUILDERS[bp.id];
  const modules = build(chapter, slot, i);
  finalizeKeystones(modules);

  const level = {
    id: `level-${String(i).padStart(3, '0')}`,
    name: `${CHAPTER_NAMES[Math.min(chapter - 1, CHAPTER_NAMES.length - 1)]} — ${bp.label} ${slot}`,
    chapter,
    difficulty: Math.min(5, chapter),
    blueprint: bp.id,
    ammoLimit: t.ammoLimit,
    timeLimitSec: t.timeLimitSec,
    starTimeSec: t.starTimeSec,
    starShots: t.starShots,
    starScore: t.starScore,
    killZoneY: -2,
    cannon: {
      position: [0, 0.6, 8.2],
      angleMinDeg: 10 + chapter,
      angleMaxDeg: 44 + chapter * 2,
    },
    enemyCastle: {
      origin: [0, 0, Z],
      modules,
    },
  };

  const path = join(outDir, `level-${String(i).padStart(3, '0')}.json`);
  writeFileSync(path, JSON.stringify(level, null, 2) + '\n');
}

function isKeystone(mod) {
  return mod.type === 'keystone' || mod.importance === 'critical';
}

function overlap1d(a0, a1, b0, b1) {
  return a0 <= b1 && b0 <= a1;
}

function keystoneRestsCleanly(modules, ks) {
  return !keystonePenetrates(
    modules,
    ks,
    modules.filter((m) => isKeystoneMod(m) && m.id !== ks.id),
  );
}

let floatWarnings = 0;
let overlapWarnings = 0;
for (let i = 1; i <= 50; i++) {
  const path = join(outDir, `level-${String(i).padStart(3, '0')}.json`);
  const level = JSON.parse(readFileSync(path, 'utf8'));
  const mods = level.enemyCastle.modules;
  for (const ks of mods.filter(isKeystone)) {
    const kb = modAabb(ks);
    let supportTop = -999;
    for (const m of mods) {
      if (m.id === ks.id) continue;
      const b = modAabb(m);
      if (
        overlap1d(kb.minX, kb.maxX, b.minX, b.maxX) &&
        overlap1d(kb.minZ, kb.maxZ, b.minZ, b.maxZ) &&
        b.maxY <= kb.minY + 0.05 &&
        b.maxY > supportTop
      ) {
        supportTop = b.maxY;
      }
    }
    const gap = kb.minY - supportTop;
    if (supportTop === -999 || gap > 0.06) {
      console.warn(
        `WARN ${level.id} ${ks.id}: luz ${gap.toFixed(2)} pod keystone (supportTop=${supportTop})`,
      );
      floatWarnings += 1;
    }
    if (!keystoneRestsCleanly(mods, ks)) {
      console.warn(`WARN ${level.id} ${ks.id}: penetracja po finalize`);
      overlapWarnings += 1;
    }
  }
}

console.log('Wygenerowano 50 poziomów (szablony zamków) →', outDir);
if (floatWarnings > 0) {
  console.warn(`Ostrzeżenia: ${floatWarnings} keystone(ów) bez pewnej podpory`);
}
if (overlapWarnings > 0) {
  console.warn(`Ostrzeżenia: ${overlapWarnings} nachodzących keystone(ów)`);
  process.exitCode = 1;
}

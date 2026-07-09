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
  if (levelIndex < 50) return 4;
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

/** Rząd klocków muru — wygląd zamku z bloczków. */
function brickRow(id, x, y, z, count, material = 'stone', spacing = 1.05) {
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(
      m({
        id: `${id}-${i}`,
        type: 'wall',
        material,
        position: [x + (i - (count - 1) / 2) * spacing, y, z],
        size: [1, 1, 1],
      }),
    );
  }
  return out;
}

/** Blanki wieży — kilka klocków w pionie. */
function brickTower(id, x, z, height, baseMaterial = 'stone', topMaterial = 'wood') {
  const out = [];
  for (let i = 0; i < height; i++) {
    out.push(
      m({
        id: `${id}-${i}`,
        type: 'tower',
        material: i === 0 ? baseMaterial : i === height - 1 ? topMaterial : 'stone',
        position: [x, 0.5 + i, z],
        size: [0.95, 1, 0.95],
      }),
    );
  }
  return out;
}

/** Kolumna klocków + keystone na szczycie (stabilna fizyka). */
function keySpot(id, x, z, columns, chapter, slot, size = 0.74) {
  const mods = [];
  for (let c = 0; c < columns; c++) {
    mods.push(
      m({
        id: `${id}-col-${c}`,
        type: 'tower',
        material: c === 0 ? 'stone' : 'wood',
        position: [x, 0.5 + c, z],
        size: [1, 1, 1],
      }),
    );
  }
  const topY = 0.5 + columns - 1;
  mods.push(keystone(id, x, stackY(topY, 1, size), z, chapter, slot, size));
  return mods;
}

/** Dodatkowe keystone'y wg poziomu (od 10). spots: { id, x, z, columns, size?, useExisting? } */
function appendKeystones(modules, spots, chapter, slot, levelIndex) {
  const need = keystoneCount(levelIndex);
  for (let i = 1; i < need && i - 1 < spots.length; i++) {
    const s = spots[i - 1];
    const id = s.id ?? `keystone-${i + 1}`;
    const size = s.size ?? 0.74;
    if (s.useExisting) {
      const topY = 0.5 + s.columns - 1;
      modules.push(keystone(id, s.x, stackY(topY, 1, size), s.z, chapter, slot, size));
    } else {
      modules.push(...keySpot(id, s.x, s.z, s.columns, chapter, slot, size));
    }
  }
}

/** Poziomy 1–5: prosta wieża + boczne podpory */
function watchtower(chapter, slot, levelIndex) {
  const h = 2 + Math.floor(slot / 2) + (chapter > 1 ? 1 : 0);
  const modules = [foundation(9 + slot * 0.2)];

  modules.push(...brickRow('row-base', 0, 0.5, Z, 3, 'stone'));
  for (let i = 1; i < h; i++) {
    modules.push(
      m({
        id: `core-${i}`,
        type: i === h - 1 ? 'tower' : 'wall',
        material: i % 2 === 0 ? 'wood' : 'stone',
        position: [0, 0.5 + i, Z],
        size: [1, 1, 1],
      }),
    );
  }

  if (slot >= 3) {
    modules.push(...brickTower('buttress-l', -1.35, Z, 2, 'wood', 'wood'));
    modules.push(...brickTower('buttress-r', 1.35, Z, 2, 'wood', 'wood'));
  }

  modules.push(keystone('keystone', 0, stackY(0.5 + h - 1, 1, 0.82), Z, chapter, slot));
  return modules;
}

/** Poziomy 6–12: statyczna brama, keystone za nią / wyżej */
function gatehouse(chapter, slot, levelIndex) {
  const modules = [foundation(12)];
  const gateStatic = chapter >= 2 || slot >= 5;

  modules.push(
    m({
      id: 'gate',
      type: 'gate',
      material: 'stone',
      position: [0, 0.55, Z],
      size: [1.5, 1.15, 1.1],
      isStatic: gateStatic,
    }),
    m({
      id: 'wing-l',
      type: 'wall',
      material: 'wood',
      position: [-1.8, 0.5, Z],
      size: [1, 1, 1],
    }),
    m({
      id: 'wing-r',
      type: 'wall',
      material: 'wood',
      position: [1.8, 0.5, Z],
      size: [1, 1, 1],
    }),
  );

  if (levelIndex >= 10) {
    modules.push(...brickTower('tower-l', -1.8, Z, 2, 'stone', 'stone'));
    modules.push(...brickTower('tower-r', 1.8, Z, 2, 'stone', 'stone'));
  } else {
    modules.push(
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
    );
  }

  modules.push(
    m({
      id: 'lintel',
      type: 'wall',
      material: 'wood',
      position: [0, 1.55, Z],
      size: [1.5, 0.7, 1.1],
    }),
  );

  const lintelY = 1.55;
  const lintelH = 0.7;
  const lintelZ = Z;
  const ksSize = 0.78;

  modules.push(
    m({
      id: 'inner-l',
      type: 'wall',
      material: 'wood',
      position: [-0.9, 1.5, Z - 0.35],
      size: [0.8, 1, 0.8],
    }),
    m({
      id: 'inner-r',
      type: 'wall',
      material: 'wood',
      position: [0.9, 1.5, Z - 0.35],
      size: [0.8, 1, 0.8],
    }),
    keystone('keystone', 0, stackY(lintelY, lintelH, ksSize), lintelZ, chapter, slot, ksSize),
  );

  appendKeystones(
    modules,
    [
      { id: 'keystone-2', x: -1.8, z: Z, columns: 2, useExisting: levelIndex >= 10, size: 0.74 },
      { id: 'keystone-3', x: 1.8, z: Z, columns: 2, useExisting: levelIndex >= 10, size: 0.74 },
      { id: 'keystone-4', x: 0, z: Z - 0.35, columns: 2, size: 0.7 },
    ],
    chapter,
    slot,
    levelIndex,
  );

  return modules;
}

/** Poziomy 13–20: poziomy mur, keystone na skrzydle */
function curtain_wall(chapter, slot, levelIndex) {
  const spread = 3 + Math.floor(slot / 3);
  const modules = [foundation(10 + spread * 2)];

  for (let x = -spread; x <= spread; x++) {
    modules.push(
      m({
        id: `wall-${x}`,
        type: 'wall',
        material: Math.abs(x) === spread ? 'stone' : 'wood',
        position: [x * 1.1, 0.5, Z],
        size: [1, 1, 1],
      }),
    );
  }

  if (levelIndex >= 10) {
    modules.push(...brickRow('row-upper', 0, 1.5, Z, spread * 2 + 1, 'wood', 1.05));
  }

  modules.push(
    ...brickTower('tower-l', -spread * 1.1 - 0.5, Z, levelIndex >= 10 ? 2 : 1, 'stone', 'stone'),
    ...brickTower('tower-r', spread * 1.1 + 0.5, Z, levelIndex >= 10 ? 2 : 1, 'stone', 'stone'),
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

  const keySide = slot % 2 === 0 ? 1 : -1;
  const kx = keySide * (spread * 0.75);
  const kx2 = -keySide * (spread * 0.75);
  const ksSize = 0.82;
  modules.push(
    m({
      id: 'keep-column',
      type: 'tower',
      material: 'stone',
      position: [kx, 0.5, Z - 0.2],
      size: [1, 1, 1],
    }),
    m({
      id: 'keep-base',
      type: 'wall',
      material: 'wood',
      position: [kx, 1.5, Z - 0.2],
      size: [1, 1, 1],
    }),
    keystone('keystone', kx, stackY(1.5, 1, ksSize), Z - 0.2, chapter, slot, ksSize),
  );

  if (levelIndex >= 10) {
    modules.push(
      m({
        id: 'keep-column-2',
        type: 'tower',
        material: 'stone',
        position: [kx2, 0.5, Z - 0.2],
        size: [1, 1, 1],
      }),
      m({
        id: 'keep-base-2',
        type: 'wall',
        material: 'wood',
        position: [kx2, 1.5, Z - 0.2],
        size: [1, 1, 1],
      }),
    );
  }

  appendKeystones(
    modules,
    [
      { id: 'keystone-2', x: kx2, z: Z - 0.2, columns: 2, useExisting: levelIndex >= 10, size: 0.76 },
      { id: 'keystone-3', x: -spread * 1.1 - 0.5, z: Z, columns: 2, useExisting: true, size: 0.74 },
      { id: 'keystone-4', x: spread * 1.1 + 0.5, z: Z, columns: 2, useExisting: true, size: 0.74 },
    ],
    chapter,
    slot,
    levelIndex,
  );

  return modules;
}

/** Poziomy 21–28: dwie wieże + most szklany z keystone */
function twin_towers(chapter, slot, levelIndex) {
  const towerH = 2 + Math.floor(slot / 4);
  const gap = 2.2 + (slot % 3) * 0.15;
  const modules = [foundation(11)];

  for (const side of [-1, 1]) {
    const tx = side * gap;
    for (let i = 0; i < towerH; i++) {
      modules.push(
        m({
          id: `tower${side < 0 ? '-l' : '-r'}-${i}`,
          type: 'tower',
          material: i === 0 ? 'stone' : 'wood',
          position: [tx, 0.5 + i, Z],
          size: [0.85, 1, 0.85],
          isStatic: i === 0 && chapter >= 3,
        }),
      );
    }
  }

  const bridgeY = 0.5 + towerH - 0.2;
  const bridgeH = 0.35;
  const ksSize = 0.8;
  modules.push(
    m({
      id: 'bridge',
      type: 'wall',
      material: 'glass',
      position: [0, bridgeY, Z],
      size: [gap * 1.7, bridgeH, 0.75],
    }),
    m({
      id: 'tie-l',
      type: 'wall',
      material: 'wood',
      position: [-gap * 0.55, bridgeY - 0.5, Z],
      size: [0.6, 0.6, 0.6],
    }),
    m({
      id: 'tie-r',
      type: 'wall',
      material: 'wood',
      position: [gap * 0.55, bridgeY - 0.5, Z],
      size: [0.6, 0.6, 0.6],
    }),
    keystone('keystone', 0, stackY(bridgeY, bridgeH, ksSize), Z, chapter, slot, ksSize),
  );

  appendKeystones(
    modules,
    [
      { id: 'keystone-2', x: -gap, z: Z, columns: towerH, useExisting: true, size: 0.76 },
      { id: 'keystone-3', x: gap, z: Z, columns: towerH, useExisting: true, size: 0.76 },
      { id: 'keystone-4', x: 0, z: Z + 0.15, columns: 1, size: 0.72 },
    ],
    chapter,
    slot,
    levelIndex,
  );

  return modules;
}

/** Poziomy 29–36: układ L, keystone w narożniku dziedzińca */
function courtyard(chapter, slot, levelIndex) {
  const arm = 2 + Math.floor(slot / 3);
  const modules = [foundation(12, 8)];

  for (let i = 0; i < arm; i++) {
    modules.push(
      m({
        id: `back-${i}`,
        type: 'wall',
        material: i === arm - 1 ? 'stone' : 'wood',
        position: [-1.5 + i * 1.1, 0.5, Z - 1.2],
        size: [1, 1, 1],
      }),
      m({
        id: `side-${i}`,
        type: 'wall',
        material: 'wood',
        position: [-2.4, 0.5, Z + i * 0.55],
        size: [1, 1, 1],
      }),
    );
  }

  const ksSize = 0.76;
  const towerY = 1.55;
  const towerH = 1.2;
  const ksX = -2.4;
  const ksZ = Z - 1.2;

  modules.push(
    m({
      id: 'inner-1',
      type: 'wall',
      material: 'wood',
      position: [-1.2, 1.5, Z - 0.5],
      size: [0.9, 0.9, 0.9],
    }),
    m({
      id: 'inner-2',
      type: 'wall',
      material: 'glass',
      position: [-1.8, 1.5, Z - 0.2],
      size: [0.8, 0.8, 0.8],
    }),
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

  modules.push(
    m({
      id: 'corner-base',
      type: 'tower',
      material: 'stone',
      position: [ksX, 0.5, ksZ],
      size: [1, 1, 1],
    }),
    m({
      id: 'corner-tower',
      type: 'tower',
      material: 'stone',
      position: [ksX, towerY, ksZ],
      size: [1, towerH, 1],
      isStatic: slot >= 6,
    }),
    keystone('keystone', ksX, stackY(towerY, towerH, ksSize), ksZ, chapter, slot, ksSize),
  );

  if (levelIndex >= 10) {
    const ks2X = 2.1;
    const ks2Z = Z - 0.8;
    modules.push(
      ...brickTower('east-base', ks2X, ks2Z, 2, 'stone', 'wood'),
      m({
        id: 'east-wall',
        type: 'wall',
        material: 'wood',
        position: [1.2, 1.5, Z - 0.4],
        size: [1.2, 1, 1],
      }),
    );
  }

  appendKeystones(
    modules,
    [
      { id: 'keystone-2', x: 2.1, z: Z - 0.8, columns: 2, useExisting: levelIndex >= 10, size: 0.74 },
      { id: 'keystone-3', x: -1.2, z: Z - 0.5, columns: 2, size: 0.72 },
      { id: 'keystone-4', x: 0.5, z: Z, columns: 2, size: 0.7 },
    ],
    chapter,
    slot,
    levelIndex,
  );

  return modules;
}

/** Poziomy 37–44: metalowe narożniki, warstwy, keystone głęboko */
function bastion(chapter, slot, levelIndex) {
  const modules = [foundation(13)];

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

  for (let x of [-1.5, 0, 1.5]) {
    for (let y = 0; y < 2; y++) {
      modules.push(
        m({
          id: `ring-${x}-${y}`,
          type: 'wall',
          material: y === 0 ? 'stone' : 'wood',
          position: [x, 0.5 + y, Z],
          size: [1, 1, 1],
        }),
      );
    }
  }

  if (levelIndex >= 10) {
    modules.push(...brickRow('battle-front', 0, 2.55, Z, 5, 'stone', 0.7));
  }

  const ksSize = 0.75;
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
    m({
      id: 'vault-l',
      type: 'wall',
      material: 'wood',
      position: [-0.8, 2.5, Z - 0.4],
      size: [0.8, 0.8, 0.8],
    }),
    m({
      id: 'vault-r',
      type: 'wall',
      material: 'wood',
      position: [0.8, 2.5, Z - 0.4],
      size: [0.8, 0.8, 0.8],
    }),
    keystone('keystone', 0, stackY(1.5, 1, ksSize), Z, chapter, slot, ksSize),
  );

  appendKeystones(
    modules,
    [
      { id: 'keystone-2', x: -1.5, z: Z, columns: 2, useExisting: true, size: 0.72 },
      { id: 'keystone-3', x: 1.5, z: Z, columns: 2, useExisting: true, size: 0.72 },
      { id: 'keystone-4', x: -0.8, z: Z - 0.4, columns: 3, size: 0.7 },
    ],
    chapter,
    slot,
    levelIndex,
  );

  return modules;
}

/** Poziomy 45–50: wielowarstwowa cytadela, boss z 2 keystone */
function citadel(chapter, slot, levelIndex) {
  const modules = [foundation(14, 8)];

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
        m({
          id: `flank-${side}-${i}`,
          type: i === 0 ? 'tower' : 'wall',
          material: i === 0 ? 'stone' : i === 1 ? 'wood' : 'glass',
          position: [side * (2 + i * 0.3), 0.5 + i, Z],
          size: [0.9, 1, 0.9],
          isStatic: i === 0,
        }),
      );
    }
  }

  const ksSize = 0.78;
  modules.push(
    m({
      id: 'keep-0',
      type: 'wall',
      material: 'stone',
      position: [0, 1.5, Z - 0.15],
      size: [1.2, 1, 1.1],
      isStatic: true,
    }),
    m({
      id: 'keep-1',
      type: 'wall',
      material: 'wood',
      position: [0, 2.5, Z - 0.25],
      size: [1, 1, 1],
    }),
    m({
      id: 'keep-2',
      type: 'wall',
      material: 'wood',
      position: [-0.9, 2.5, Z - 0.35],
      size: [0.75, 0.75, 0.75],
    }),
    m({
      id: 'keep-3',
      type: 'wall',
      material: 'wood',
      position: [0.9, 2.5, Z - 0.35],
      size: [0.75, 0.75, 0.75],
    }),
    m({
      id: 'core-pillar',
      type: 'wall',
      material: 'metal',
      position: [0, 3.5, Z - 0.45],
      size: [0.5, 1.2, 0.5],
      isStatic: true,
    }),
    keystone('keystone', 0, stackY(1.5, 1, ksSize), Z - 0.15, chapter, slot, ksSize),
  );

  const bossY = 1.5;
  const bossH = 1.2;

  if (levelIndex === 50) {
    modules.push(
      m({
        id: 'boss-tower',
        type: 'tower',
        material: 'stone',
        position: [2.2, bossY, Z - 0.2],
        size: [0.9, bossH, 0.9],
      }),
      m({
        id: 'boss-cap',
        type: 'wall',
        material: 'wood',
        position: [2.2, stackY(bossY, bossH, 0.2), Z - 0.2],
        size: [0.95, 0.2, 0.95],
      }),
    );
  }

  appendKeystones(
    modules,
    [
      { id: 'keystone-2', x: -2, z: Z, columns: 2, useExisting: true, size: 0.74 },
      { id: 'keystone-3', x: 2, z: Z, columns: 2, useExisting: true, size: 0.74 },
    ],
    chapter,
    slot,
    levelIndex,
  );

  if (keystoneCount(levelIndex) >= 4) {
    if (levelIndex === 50) {
      const capY = stackY(bossY, bossH, 0.2);
      modules.push(keystone('keystone-4', 2.2, stackY(capY, 0.2, 0.72), Z - 0.2, chapter, slot, 0.72));
    } else {
      modules.push(keystone('keystone-4', 0, stackY(2.5, 1, 0.7), Z - 0.25, chapter, slot, 0.7));
    }
  }

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

function aabb(pos, size) {
  const [x, y, z] = pos;
  const [w, h, d] = size;
  return {
    minX: x - w / 2,
    maxX: x + w / 2,
    minY: y - h / 2,
    maxY: y + h / 2,
    minZ: z - d / 2,
    maxZ: z + d / 2,
  };
}

function overlap1d(a0, a1, b0, b1) {
  return a0 <= b1 && b0 <= a1;
}

let floatWarnings = 0;
for (let i = 1; i <= 50; i++) {
  const path = join(outDir, `level-${String(i).padStart(3, '0')}.json`);
  const level = JSON.parse(readFileSync(path, 'utf8'));
  const mods = level.enemyCastle.modules;
  for (const ks of mods.filter(isKeystone)) {
    const kb = aabb(ks.position, ks.size);
    let supportTop = -999;
    for (const m of mods) {
      if (m.id === ks.id) continue;
      const b = aabb(m.position, m.size);
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
  }
}

console.log('Wygenerowano 50 poziomów (szablony zamków) →', outDir);
if (floatWarnings > 0) {
  console.warn(`Ostrzeżenia: ${floatWarnings} keystone(ów) bez pewnej podpory`);
  process.exitCode = 1;
}

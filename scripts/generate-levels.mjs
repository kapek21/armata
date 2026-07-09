#!/usr/bin/env node
/**
 * Generator 50 poziomów — szablony zamków modułowych.
 * watchtower → gatehouse → curtain_wall → twin_towers → courtyard → bastion → citadel
 */
import { writeFileSync, mkdirSync } from 'fs';
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

function timing(chapter, slot) {
  const timeLimitSec = Math.max(38, 118 - chapter * 14 - slot * 2);
  const ammoLimit = Math.max(2, 6 - Math.floor(chapter / 2) - (slot > 6 ? 1 : 0));
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

/** Poziomy 1–5: prosta wieża + boczne podpory */
function watchtower(chapter, slot) {
  const h = 2 + Math.floor(slot / 2) + (chapter > 1 ? 1 : 0);
  const modules = [foundation(9 + slot * 0.2)];

  for (let i = 0; i < h; i++) {
    modules.push(
      m({
        id: `core-${i}`,
        type: i === 0 ? 'gate' : 'wall',
        material: i % 2 === 0 ? 'wood' : 'stone',
        position: [0, 0.5 + i, Z],
        size: [1, 1, 1],
      }),
    );
  }

  if (slot >= 3) {
    modules.push(
      m({
        id: 'buttress-l',
        type: 'tower',
        material: 'wood',
        position: [-1.3, 0.5, Z],
        size: [0.6, 1.4, 0.6],
      }),
      m({
        id: 'buttress-r',
        type: 'tower',
        material: 'wood',
        position: [1.3, 0.5, Z],
        size: [0.6, 1.4, 0.6],
      }),
    );
  }

  modules.push(keystone('keystone', 0, 0.5 + h, Z, chapter, slot));
  return modules;
}

/** Poziomy 6–12: statyczna brama, keystone za nią / wyżej */
function gatehouse(chapter, slot) {
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

  if (slot % 2 === 0) {
    modules.push(
      m({
        id: 'lintel',
        type: 'wall',
        material: 'wood',
        position: [0, 1.55, Z],
        size: [1.3, 0.7, 0.9],
      }),
    );
  } else {
    modules.push(
      m({
        id: 'lintel-glass',
        type: 'wall',
        material: 'glass',
        position: [0, 1.55, Z + 0.15],
        size: [1.1, 0.5, 0.7],
      }),
    );
  }

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
    keystone('keystone', 0, 2.65, Z - 0.45, chapter, slot, 0.78),
  );

  return modules;
}

/** Poziomy 13–20: poziomy mur, keystone na skrzydle */
function curtain_wall(chapter, slot) {
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

  const keySide = slot % 2 === 0 ? 1 : -1;
  modules.push(
    m({
      id: 'keep-base',
      type: 'wall',
      material: 'wood',
      position: [keySide * (spread * 0.75), 1.5, Z - 0.2],
      size: [1, 1, 1],
    }),
    keystone(
      'keystone',
      keySide * (spread * 0.75),
      2.55,
      Z - 0.35,
      chapter,
      slot,
    ),
  );

  return modules;
}

/** Poziomy 21–28: dwie wieże + most szklany z keystone */
function twin_towers(chapter, slot) {
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
  modules.push(
    m({
      id: 'bridge',
      type: 'wall',
      material: 'glass',
      position: [0, bridgeY, Z],
      size: [gap * 1.7, 0.35, 0.75],
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
    keystone('keystone', 0, bridgeY + 0.75, Z, chapter, slot, 0.8),
  );

  return modules;
}

/** Poziomy 29–36: układ L, keystone w narożniku dziedzińca */
function courtyard(chapter, slot) {
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

  modules.push(
    m({
      id: 'corner-tower',
      type: 'tower',
      material: 'stone',
      position: [-2.4, 1.55, Z - 1.2],
      size: [1, 1.2, 1],
      isStatic: slot >= 6,
    }),
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

  modules.push(keystone('keystone', -1.35, 2.55, Z - 0.55, chapter, slot, 0.76));
  return modules;
}

/** Poziomy 37–44: metalowe narożniki, warstwy, keystone głęboko */
function bastion(chapter, slot) {
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
    keystone('keystone', 0, 3.35, Z - 0.55, chapter, slot, 0.75),
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

  modules.push(
    m({
      id: 'keep-0',
      type: 'wall',
      material: 'stone',
      position: [0, 1.5, Z - 0.15],
      size: [1.2, 1, 1.1],
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
    keystone('keystone', 0, 4.35, Z - 0.5, chapter, slot, 0.78),
  );

  if (levelIndex === 50) {
    modules.push(
      keystone('keystone-2', 2.2, 3.2, Z - 0.4, chapter, slot, 0.72),
      m({
        id: 'boss-tower',
        type: 'tower',
        material: 'stone',
        position: [2.2, 1.5, Z - 0.2],
        size: [0.9, 1.2, 0.9],
      }),
    );
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
  const t = timing(chapter, slot);
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

console.log('Wygenerowano 50 poziomów (szablony zamków) →', outDir);

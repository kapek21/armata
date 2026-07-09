#!/usr/bin/env node
/**
 * Generuje 50 poziomów modułowych zamków (level-001 … level-050).
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dir, '../src/levels/data');
mkdirSync(outDir, { recursive: true });

const CHAPTER_NAMES = [
  'Mur Podstawowy',
  'Drewniane Wieże',
  'Kamienne Bastiony',
  'Oblężenie',
  'Cytadela',
];

function chapterOf(index) {
  return Math.ceil(index / 10);
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

function towerHeight(chapter, slot) {
  return 1 + Math.floor((chapter - 1) * 0.8) + Math.floor(slot / 4);
}

function buildCastle(chapter, slot) {
  const modules = [];
  const z = -2;
  const spread = 0.5 + chapter * 0.15;

  modules.push({
    id: 'found',
    type: 'foundation',
    material: 'ground',
    position: [0, -0.25, z],
    size: [10 + chapter * 0.4, 0.5, 7],
    importance: 'structural',
    isStatic: true,
  });

  const h = towerHeight(chapter, slot);
  for (let i = 0; i < h; i++) {
    modules.push({
      id: `wall-${i}`,
      type: i === 0 ? 'gate' : 'wall',
      material: i % 3 === 0 ? 'stone' : 'wood',
      position: [0, 0.5 + i, z],
      size: [1 + (i === 0 ? 0.2 : 0), 1, 1],
      importance: 'structural',
      isStatic: i === 0 && chapter >= 3,
    });
  }

  if (slot % 3 === 1) {
    modules.push({
      id: 'side-l',
      type: 'tower',
      material: 'stone',
      position: [-1.2 - spread * 0.3, 0.5, z],
      size: [0.7, 1.2, 0.7],
      importance: 'structural',
    });
    modules.push({
      id: 'side-r',
      type: 'tower',
      material: 'stone',
      position: [1.2 + spread * 0.3, 0.5, z],
      size: [0.7, 1.2, 0.7],
      importance: 'structural',
    });
  }

  if (chapter >= 2 && slot % 2 === 0) {
    modules.push({
      id: 'bridge',
      type: 'wall',
      material: 'glass',
      position: [0.8, 1.2 + h * 0.3, z],
      size: [1.8, 0.35, 0.7],
      importance: 'decorative',
    });
  }

  if (chapter >= 4) {
    modules.push({
      id: 'pillar',
      type: 'wall',
      material: 'metal',
      position: [-0.6, h * 0.6, z],
      size: [0.4, 1.8, 0.4],
      importance: 'structural',
      isStatic: true,
    });
  }

  const keyY = 0.5 + h + (slot % 5 === 0 ? 0.5 : 0);
  modules.push({
    id: 'keystone',
    type: 'keystone',
    material: 'wood',
    position: [0, keyY, z],
    size: [0.85, 0.85, 0.85],
    importance: 'critical',
    hitPoints: 80 + chapter * 8,
  });

  if (slot === 9) {
    modules.push({
      id: 'keystone-2',
      type: 'keystone',
      material: 'wood',
      position: [1.4, keyY - 0.5, z - 0.3],
      size: [0.75, 0.75, 0.75],
      importance: 'critical',
      hitPoints: 60 + chapter * 6,
    });
  }

  return modules;
}

for (let i = 1; i <= 50; i++) {
  const chapter = chapterOf(i);
  const slot = ((i - 1) % 10) + 1;
  const t = timing(chapter, slot);
  const level = {
    id: `level-${String(i).padStart(3, '0')}`,
    name: `${CHAPTER_NAMES[chapter - 1]} ${slot}`,
    chapter,
    difficulty: Math.min(5, chapter),
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
      origin: [0, 0, -2],
      modules: buildCastle(chapter, slot),
    },
  };
  const path = join(outDir, `level-${String(i).padStart(3, '0')}.json`);
  writeFileSync(path, JSON.stringify(level, null, 2) + '\n');
}

console.log('Wygenerowano 50 poziomów w', outDir);

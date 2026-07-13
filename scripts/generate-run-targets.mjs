#!/usr/bin/env node
/**
 * Generator puli run: 10 trudności × 10 wariantów = 100 celów.
 * Bazuje na szablonach kampanii z src/levels/data, skaluje HP i nagrody.
 */
import { writeFileSync, mkdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const campaignDir = join(__dir, '../src/levels/data');
const outDir = join(__dir, '../src/levels/run/data');
mkdirSync(outDir, { recursive: true });

const BLUEPRINT_LABELS = {
  watchtower: 'Wieża strażnicza',
  gatehouse: 'Brama warowna',
  curtain_wall: 'Mur kurtynowy',
  twin_towers: 'Bliźniacze wieże',
  courtyard: 'Dziedziniec',
  bastion: 'Bastion',
  citadel: 'Cytadela',
};

function isKeystone(mod) {
  return mod.type === 'keystone' || mod.importance === 'critical';
}

function sourceCampaignIndex(difficulty, variant) {
  if (difficulty <= 5) return (difficulty - 1) * 10 + variant;
  const bases = [21, 29, 37, 45, 45];
  return Math.min(50, bases[difficulty - 6] + (variant - 1));
}

function readCampaignLevel(index) {
  const path = join(campaignDir, `level-${String(index).padStart(3, '0')}.json`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

function keepPrimaryKeystone(modules) {
  const keystones = modules.filter(isKeystone);
  if (keystones.length <= 1) return;
  const primary = keystones.find((k) => k.id === 'keystone') ?? keystones[0];
  for (let i = modules.length - 1; i >= 0; i--) {
    const mod = modules[i];
    if (isKeystone(mod) && mod.id !== primary.id) {
      modules.splice(i, 1);
    }
  }
}

function runKeystoneHp(difficulty, variant) {
  return 70 + difficulty * 14 + variant * 3;
}

function runClearReward(difficulty, variant) {
  return 350 + difficulty * 150 + variant * 15;
}

function runAmmoLimit(difficulty, variant) {
  return Math.max(2, 7 - Math.floor(difficulty / 2) - (variant > 7 ? 1 : 0));
}

function buildRunTarget(difficulty, variant) {
  const sourceIndex = sourceCampaignIndex(difficulty, variant);
  const source = readCampaignLevel(sourceIndex);
  const modules = structuredClone(source.enemyCastle.modules);
  keepPrimaryKeystone(modules);

  const hp = runKeystoneHp(difficulty, variant);
  for (const mod of modules) {
    if (isKeystone(mod)) {
      mod.hitPoints = hp;
    }
  }

  const blueprint = source.blueprint ?? 'watchtower';
  const label = BLUEPRINT_LABELS[blueprint] ?? blueprint;
  const clearReward = runClearReward(difficulty, variant);
  const ammoLimit = runAmmoLimit(difficulty, variant);

  return {
    id: `run-d${String(difficulty).padStart(2, '0')}-v${String(variant).padStart(2, '0')}`,
    name: `Cel ${difficulty} — ${label} ${variant}`,
    chapter: difficulty,
    difficulty,
    runDifficulty: difficulty,
    variant,
    clearReward,
    blueprint,
    ammoLimit,
    timeLimitSec: 999,
    starTimeSec: [999, 999, 999],
    starShots: [ammoLimit, ammoLimit, ammoLimit],
    starScore: [clearReward + 400, clearReward + 200, clearReward],
    killZoneY: source.killZoneY ?? -2,
    cannon: source.cannon,
    enemyCastle: {
      origin: source.enemyCastle.origin,
      modules,
    },
  };
}

for (let d = 1; d <= 10; d++) {
  for (let v = 1; v <= 10; v++) {
    const target = buildRunTarget(d, v);
    const path = join(outDir, `d${String(d).padStart(2, '0')}-v${String(v).padStart(2, '0')}.json`);
    writeFileSync(path, JSON.stringify(target, null, 2) + '\n');
  }
}

console.log('Wygenerowano 100 celów run →', outDir);

// Imports public/siege/machines/.../blocks.json into src/levels/siege/data/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const machinesDir = path.join(root, 'public', 'siege', 'machines');
const outDir = path.join(root, 'src', 'levels', 'siege', 'data');

const ORIGIN_Z = -2;

const ARCHETYPE_LABELS = {
  trebuchet: 'Trebusz',
  mangonel: 'Mangonela',
  ram: 'Taran',
  siege_tower: 'Wieża oblężnicza',
  ballista: 'Balista',
  mantlet: 'Hulajgród',
};

function roleToType(role, material) {
  if (role === 'foundation' || material === 'ground') return 'foundation';
  if (role === 'critical') return 'keystone';
  if (role === 'decorative') return 'wall';
  return 'tower';
}

function roleToImportance(role) {
  if (role === 'critical') return 'critical';
  if (role === 'decorative') return 'decorative';
  return 'structural';
}

function keystoneHp(tier) {
  return Math.round(70 + tier * 10);
}

function clearReward(tier, criticalCount) {
  return Math.round(450 + tier * 130 + criticalCount * 90);
}

function ammoLimit(tier, criticalCount) {
  return Math.min(16, Math.max(6, 5 + Math.ceil(tier / 2) + criticalCount));
}

function cannonForTier(tier) {
  return {
    position: [0, 0.6, 8.2],
    angleMinDeg: 10 + Math.min(8, Math.floor(tier / 4)),
    angleMaxDeg: 44 + Math.min(12, Math.floor(tier / 3)),
  };
}

function convertBlocks(raw) {
  const tier = raw.tier ?? 1;
  const variant = raw.variant ?? 1;
  const archetype = raw.archetype ?? 'trebuchet';
  const label = ARCHETYPE_LABELS[archetype] ?? archetype;
  const criticalCount =
    raw.critical_count ??
    (raw.blocks ?? []).filter((b) => b.role === 'critical').length;

  const modules = (raw.blocks ?? []).map((b) => {
    const material = b.material === 'ground' ? 'ground' : b.material;
    const role = b.role ?? 'structural';
    const type = roleToType(role, material);
    const importance = roleToImportance(role);
    const isFoundation = type === 'foundation' || material === 'ground';
    const isCritical = importance === 'critical';
    const [x, y, z] = b.pos ?? b.position ?? [0, 0, 0];
    const size = b.size ?? [1, 1, 1];

    return {
      id: b.id,
      type,
      material: isFoundation ? 'ground' : material,
      position: [x, y, z + ORIGIN_Z],
      size,
      importance: isFoundation ? 'structural' : importance,
      isStatic: isFoundation,
      ...(isCritical ? { hitPoints: keystoneHp(tier) } : {}),
    };
  });

  const reward = clearReward(tier, criticalCount);
  const ammo = ammoLimit(tier, criticalCount);
  const runDifficulty = tier;

  return {
    id: `siege-t${String(tier).padStart(2, '0')}-v${String(variant).padStart(2, '0')}`,
    name: label,
    chapter: tier,
    difficulty: Math.min(10, tier),
    runDifficulty,
    siegeTier: tier,
    variant,
    archetype,
    clearReward: reward,
    ammoLimit: ammo,
    timeLimitSec: 999,
    starTimeSec: [999, 999, 999],
    starShots: [ammo, ammo, ammo],
    starScore: [reward + 400, reward + 200, reward],
    killZoneY: -2,
    cannon: cannonForTier(tier),
    enemyCastle: {
      origin: [0, 0, ORIGIN_Z],
      modules,
    },
  };
}

function main() {
  if (!fs.existsSync(machinesDir)) {
    console.error('Missing directory', machinesDir);
    process.exit(1);
  }
  fs.mkdirSync(outDir, { recursive: true });
  for (const old of fs.readdirSync(outDir)) {
    if (old.endsWith('.json')) fs.unlinkSync(path.join(outDir, old));
  }

  const dirs = fs
    .readdirSync(machinesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith('SE-T'))
    .map((d) => d.name)
    .sort();

  let written = 0;
  let maxCrit = 0;
  for (const name of dirs) {
    const blocksPath = path.join(machinesDir, name, 'blocks.json');
    if (!fs.existsSync(blocksPath)) {
      console.warn('Missing blocks.json:', name);
      continue;
    }
    const raw = JSON.parse(fs.readFileSync(blocksPath, 'utf8'));
    const level = convertBlocks(raw);
    const crit = level.enemyCastle.modules.filter((m) => m.importance === 'critical').length;
    maxCrit = Math.max(maxCrit, crit);
    const outName = `t${String(level.siegeTier).padStart(2, '0')}-v${String(level.variant).padStart(2, '0')}.json`;
    fs.writeFileSync(path.join(outDir, outName), `${JSON.stringify(level, null, 2)}\n`);
    written++;
  }

  console.log(`Imported ${written} siege targets to ${outDir}`);
  console.log(`Max critical bricks: ${maxCrit}`);
}

main();

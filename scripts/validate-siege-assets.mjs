/**
 * Walidacja public/siege — materiały, critical, kompletność.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const machinesDir = path.join(root, 'public', 'siege', 'machines');
const texturesDir = path.join(root, 'public', 'siege', 'textures');

const MATERIALS = new Set(['wood', 'metal', 'stone', 'ground']);
const REQUIRED_TEX = [
  'tex_wood_albedo_512.png',
  'tex_metal_albedo_512.png',
  'tex_stone_albedo_512.png',
  'tex_ground_albedo_512.png',
  'tex_keystone_shield_256.png',
];

function main() {
  const errors = [];
  const warnings = [];

  for (const t of REQUIRED_TEX) {
    if (!fs.existsSync(path.join(texturesDir, t))) errors.push(`Brak tekstury ${t}`);
  }

  if (!fs.existsSync(machinesDir)) {
    console.error('Brak', machinesDir);
    process.exit(1);
  }

  const dirs = fs
    .readdirSync(machinesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith('SE-T'))
    .map((d) => d.name);

  if (dirs.length !== 300) warnings.push(`Oczekiwano 300 maszyn, jest ${dirs.length}`);

  let maxCrit = 0;
  for (const name of dirs) {
    const p = path.join(machinesDir, name, 'blocks.json');
    if (!fs.existsSync(p)) {
      errors.push(`${name}: brak blocks.json`);
      continue;
    }
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    const blocks = raw.blocks ?? [];
    const ids = new Set();
    for (const b of blocks) {
      if (ids.has(b.id)) errors.push(`${name}: duplikat id ${b.id}`);
      ids.add(b.id);
      if (!MATERIALS.has(b.material)) errors.push(`${name}: zły material ${b.material}`);
      if (!b.size || !b.pos) errors.push(`${name}: ${b.id} bez size/pos`);
    }
    const crits = blocks.filter((b) => b.role === 'critical');
    maxCrit = Math.max(maxCrit, crits.length);
    if (crits.length < 1) errors.push(`${name}: brak critical`);
  }

  console.log(`Machines: ${dirs.length}, max critical: ${maxCrit}`);
  console.log(`Warnings: ${warnings.length}`);
  for (const w of warnings.slice(0, 20)) console.log('  WARN', w);
  console.log(`Errors: ${errors.length}`);
  for (const e of errors.slice(0, 40)) console.log('  ERR', e);
  if (errors.length) process.exit(1);
  console.log('OK');
}

main();

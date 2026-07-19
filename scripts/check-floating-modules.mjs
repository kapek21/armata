import fs from 'fs';
import path from 'path';

const ROOT = 'c:/Fundusz/Gry/Armata/src/levels';

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function aabb(m) {
  const [x, y, z] = m.position;
  const [w, h, d] = m.size;
  return {
    minX: x - w / 2,
    maxX: x + w / 2,
    minY: y - h / 2,
    maxY: y + h / 2,
    minZ: z - d / 2,
    maxZ: z + d / 2,
    m,
  };
}

function overlapXZ(a, b, eps = 0.02) {
  return (
    a.minX < b.maxX - eps &&
    a.maxX > b.minX + eps &&
    a.minZ < b.maxZ - eps &&
    a.maxZ > b.minZ + eps
  );
}

function supported(box, others, groundY = 0, gapTol = 0.12) {
  if (box.minY <= groundY + gapTol) return { ok: true, via: 'ground' };
  for (const o of others) {
    if (o.m.id === box.m.id) continue;
    const dy = box.minY - o.maxY;
    if (dy >= -0.05 && dy <= gapTol && overlapXZ(box, o)) {
      return { ok: true, via: o.m.id };
    }
  }
  return { ok: false };
}

function analyze(file) {
  const j = loadJson(file);
  const mods = j.enemyCastle.modules;
  const boxes = mods.map(aabb);
  const floating = [];
  for (const b of boxes) {
    if (b.m.type === 'foundation' || b.m.isStatic) continue;
    const s = supported(b, boxes);
    if (!s.ok) {
      floating.push({
        id: b.m.id,
        type: b.m.type,
        pos: b.m.position,
        size: b.m.size,
        bottom: +b.minY.toFixed(3),
      });
    }
  }
  return { id: j.id, name: j.name, floating, total: mods.length };
}

function pad(n) {
  return String(n).padStart(2, '0');
}

// Same schedule as game
const runCount = 20;
const castlePool = 10;
const kinds = Array.from({ length: runCount }, () => null);
for (let i = 3; i <= runCount; i += 3) kinds[i - 1] = 'castle';
let castlesPlaced = kinds.filter((k) => k === 'castle').length;
let remaining = Math.max(0, castlePool - castlesPlaced);
for (let i = runCount; i >= 1 && remaining > 0; i--) {
  if (kinds[i - 1] == null) {
    kinds[i - 1] = 'castle';
    remaining--;
  }
}
for (let i = 0; i < runCount; i++) if (kinds[i] == null) kinds[i] = 'siege';

let castleOrder = 0;
const slots = kinds.map((kind, i) => {
  const run = i + 1;
  if (kind === 'castle') {
    castleOrder++;
    return { run, kind, src: Math.min(castlePool, castleOrder) };
  }
  return { run, kind, src: run };
});

const report = [];
for (const s of slots) {
  let worst = null;
  let floatVariants = 0;
  for (let v = 1; v <= 10; v++) {
    const file =
      s.kind === 'castle'
        ? path.join(ROOT, 'run/data', `d${pad(s.src)}-v${pad(v)}.json`)
        : path.join(ROOT, 'siege/data', `t${pad(s.src)}-v${pad(v)}.json`);
    if (!fs.existsSync(file)) continue;
    const a = analyze(file);
    if (a.floating.length) {
      floatVariants++;
      if (!worst || a.floating.length > worst.floating.length) worst = a;
    }
  }
  report.push({
    slot: s.run,
    kind: s.kind,
    src: s.src,
    floatVariants,
    floatMax: worst ? worst.floating.length : 0,
    sample: worst ? worst.id : null,
    examples: worst ? worst.floating.slice(0, 6) : [],
  });
}

const bad = report.filter((r) => r.floatMax > 0);
console.log('Slots with floating parts:', bad.length, '/', report.length);
for (const r of bad) {
  console.log(
    `\n#${r.slot} ${r.kind} src=${r.src} variantsWithFloat=${r.floatVariants}/10 maxFloat=${r.floatMax} ${r.sample}`,
  );
  console.log(JSON.stringify(r.examples));
}

function poolSummary(dir, re) {
  const files = fs.readdirSync(dir).filter((f) => re.test(f));
  let withFloat = 0;
  let totalFloat = 0;
  const top = [];
  for (const f of files) {
    const a = analyze(path.join(dir, f));
    if (a.floating.length) {
      withFloat++;
      totalFloat += a.floating.length;
      top.push({ id: a.id, n: a.floating.length, sample: a.floating[0] });
    }
  }
  top.sort((a, b) => b.n - a.n);
  return { files: files.length, withFloat, totalFloat, top: top.slice(0, 10) };
}

console.log('\n=== POOL siege ===');
console.log(JSON.stringify(poolSummary(path.join(ROOT, 'siege/data'), /^t\d+-v\d+\.json$/), null, 2));
console.log('\n=== POOL castles ===');
console.log(JSON.stringify(poolSummary(path.join(ROOT, 'run/data'), /^d\d+-v\d+\.json$/), null, 2));

// Detail one siege and one castle example
for (const id of ['siege-t01-v01', 'run-d04-v01']) {
  const kind = id.startsWith('siege') ? 'siege' : 'run';
  const file =
    kind === 'siege'
      ? path.join(ROOT, 'siege/data', 't01-v01.json')
      : path.join(ROOT, 'run/data', 'd04-v01.json');
  const a = analyze(file);
  console.log(`\nDETAIL ${a.id}: ${a.floating.length} floating / ${a.total} modules`);
  for (const f of a.floating.slice(0, 12)) {
    console.log(' ', f.id, f.type, 'bottomY=' + f.bottom, 'pos', f.pos, 'size', f.size);
  }
}

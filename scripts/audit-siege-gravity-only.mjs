import fs from 'fs';
import path from 'path';

const ROOT = 'c:/Fundusz/Gry/Armata/src/levels/siege/data';
const pad = (n) => String(n).padStart(2, '0');
const MAX_XZ = 2.6;
const MAX_GAP = 4.5;
const SUPPORT_TOL = 0.08;

function edgeDistXZ(a, b) {
  const dx = Math.max(0, Math.max(a.minX - b.maxX, b.minX - a.maxX));
  const dz = Math.max(0, Math.max(a.minZ - b.maxZ, b.minZ - a.maxZ));
  return Math.hypot(dx, dz);
}

function boxOf(e) {
  const [x, y, z] = e.spawnPos;
  const [w, h, d] = e.spawnSize;
  return {
    minX: x - w / 2,
    maxX: x + w / 2,
    minY: y - h / 2,
    maxY: y + h / 2,
    minZ: z - d / 2,
    maxZ: z + d / 2,
  };
}

function snapDown(entries) {
  for (let i = 0; i < 8; i++) {
    const ordered = [...entries]
      .filter((e) => !e.isStatic)
      .sort(
        (a, b) =>
          a.spawnPos[1] - a.spawnSize[1] / 2 - (b.spawnPos[1] - b.spawnSize[1] / 2),
      );
    for (const entry of ordered) {
      const self = boxOf(entry);
      let bestTop = -Infinity;
      let bestDist = Infinity;
      let found = false;
      for (const other of entries) {
        if (other.moduleId === entry.moduleId) continue;
        const o = boxOf(other);
        const dist = edgeDistXZ(self, o);
        if (dist > MAX_XZ) continue;
        if (o.maxY > self.minY + 0.2) continue;
        const better =
          o.maxY > bestTop + 0.001 || (Math.abs(o.maxY - bestTop) <= 0.001 && dist < bestDist);
        if (better) {
          bestTop = o.maxY;
          bestDist = dist;
          found = true;
        }
      }
      // ziemia y=0
      if (!found || bestTop < 0) {
        if (0 <= self.minY + 0.2) {
          const gBetter = 0 > bestTop + 0.001;
          if (!found || gBetter) {
            bestTop = 0;
            found = true;
          }
        }
      }
      if (!found) continue;
      const gap = self.minY - bestTop;
      if (gap <= 0.001 || gap > MAX_GAP) continue;
      entry.spawnPos[1] -= gap;
    }
  }
}

function floatsBelowOnly(entries) {
  const floats = [];
  for (const e of entries) {
    if (e.isStatic) continue;
    const self = boxOf(e);
    let bestTop = -Infinity;
    let found = false;
    for (const o of entries) {
      if (o.moduleId === e.moduleId) continue;
      const b = boxOf(o);
      if (edgeDistXZ(self, b) > MAX_XZ) continue;
      if (b.maxY > self.minY + 0.2) continue;
      if (b.maxY > bestTop) {
        bestTop = b.maxY;
        found = true;
      }
    }
    const groundGap = self.minY - 0;
    const okGround = groundGap >= -0.05 && groundGap <= SUPPORT_TOL;
    const gap = found ? self.minY - bestTop : null;
    const okBelow = found && gap != null && gap <= SUPPORT_TOL;
    if (!okBelow && !okGround) {
      floats.push({
        id: e.moduleId,
        type: e.type,
        bot: +self.minY.toFixed(3),
        gap: gap == null ? 'none' : +gap.toFixed(3),
      });
    }
  }
  return floats;
}

const bad = [];
const byA = new Map();
for (let t = 1; t <= 30; t++) {
  for (let v = 1; v <= 10; v++) {
    const file = path.join(ROOT, `t${pad(t)}-v${pad(v)}.json`);
    if (!fs.existsSync(file)) continue;
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    const entries = j.enemyCastle.modules.map((m) => ({
      moduleId: m.id,
      type: m.type,
      isStatic: !!(m.isStatic || m.type === 'foundation'),
      spawnPos: [...m.position],
      spawnSize: [...m.size],
    }));
    snapDown(entries);
    const f = floatsBelowOnly(entries);
    if (f.length) {
      bad.push({ id: j.id, archetype: j.archetype, n: f.length, floats: f.slice(0, 8) });
      byA.set(j.archetype, (byA.get(j.archetype) || 0) + 1);
    }
  }
}
bad.sort((a, b) => b.n - a.n);
console.log(`Still floating (gravity below-only + ground): ${bad.length}`);
console.log('By archetype:', Object.fromEntries([...byA.entries()].sort()));
for (const b of bad.slice(0, 40)) {
  console.log(`${b.id} (${b.archetype}) n=${b.n}`, JSON.stringify(b.floats));
}
if (bad.length > 40) console.log(`... +${bad.length - 40} more`);

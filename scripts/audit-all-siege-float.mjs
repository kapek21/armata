/**
 * Audyt floatów po snapie jak w session.ts (overlapXZ + snap up + lateral rescue).
 */
import fs from 'fs';
import path from 'path';

const ROOT = 'c:/Fundusz/Gry/Armata/src/levels/siege/data';
const pad = (n) => String(n).padStart(2, '0');
const MAX_GAP = 20;
const SUPPORT_TOL = 0.08;
const GROUND_Y = 0;
const PAD = 0.08;

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

function overlapXZ(a, b, pad = PAD) {
  return (
    a.minX < b.maxX + pad &&
    a.maxX > b.minX - pad &&
    a.minZ < b.maxZ + pad &&
    a.maxZ > b.minZ - pad
  );
}

function edgeDistXZ(a, b) {
  const dx = Math.max(0, Math.max(a.minX - b.maxX, b.minX - a.maxX));
  const dz = Math.max(0, Math.max(a.minZ - b.maxZ, b.minZ - a.maxZ));
  return Math.hypot(dx, dz);
}

function isSupported(entries, entry) {
  const self = boxOf(entry);
  if (self.minY <= GROUND_Y + SUPPORT_TOL) return true;
  for (const other of entries) {
    if (other.moduleId === entry.moduleId) continue;
    const o = boxOf(other);
    if (!overlapXZ(self, o)) continue;
    const gapBelow = self.minY - o.maxY;
    if (gapBelow >= -0.05 && gapBelow <= SUPPORT_TOL) return true;
    const gapAbove = o.minY - self.maxY;
    if (gapAbove >= -0.05 && gapAbove <= SUPPORT_TOL) return true;
  }
  return false;
}

function snapEntries(entries) {
  const snapDownPass = () => {
    const ordered = [...entries]
      .filter((e) => !e.isStatic)
      .sort(
        (a, b) =>
          a.spawnPos[1] - a.spawnSize[1] / 2 - (b.spawnPos[1] - b.spawnSize[1] / 2),
      );
    for (const entry of ordered) {
      const self = boxOf(entry);
      let bestTop = -Infinity;
      let found = false;
      for (const other of entries) {
        if (other.moduleId === entry.moduleId) continue;
        const o = boxOf(other);
        if (!overlapXZ(self, o)) continue;
        if (o.maxY > self.minY + 0.25) continue;
        if (o.maxY > bestTop) {
          bestTop = o.maxY;
          found = true;
        }
      }
      if (self.minY <= 1.25) {
        for (const other of entries) {
          if (!(other.isStatic || other.type === 'foundation')) continue;
          const o = boxOf(other);
          if (!overlapXZ(self, o, 0.15)) continue;
          if (GROUND_Y > bestTop) {
            bestTop = GROUND_Y;
            found = true;
          }
        }
        if (!found && self.minY <= 0.35) {
          bestTop = GROUND_Y;
          found = true;
        }
      }
      if (!found) continue;
      const gap = self.minY - bestTop;
      if (gap <= 0.001 || gap > MAX_GAP) continue;
      entry.spawnPos[1] -= gap;
    }
  };

  const snapUpPass = () => {
    const ordered = [...entries]
      .filter((e) => !e.isStatic)
      .sort(
        (a, b) =>
          b.spawnPos[1] + b.spawnSize[1] / 2 - (a.spawnPos[1] + a.spawnSize[1] / 2),
      );
    for (const entry of ordered) {
      if (isSupported(entries, entry)) continue;
      const self = boxOf(entry);
      let bestCeil = Infinity;
      let found = false;
      for (const other of entries) {
        if (other.moduleId === entry.moduleId) continue;
        const o = boxOf(other);
        if (!overlapXZ(self, o)) continue;
        if (o.minY < self.maxY - 0.05) continue;
        if (o.minY < bestCeil) {
          bestCeil = o.minY;
          found = true;
        }
      }
      if (!found) continue;
      const gap = bestCeil - self.maxY;
      if (gap <= 0.001 || gap > MAX_GAP) continue;
      entry.spawnPos[1] += gap;
    }
  };

  const lateralRescuePass = () => {
    const MAX_LATERAL = 2.8;
    for (const entry of entries) {
      if (entry.isStatic) continue;
      if (isSupported(entries, entry)) continue;
      const self = boxOf(entry);
      let best = null;
      let bestScore = Infinity;
      for (const other of entries) {
        if (other.moduleId === entry.moduleId) continue;
        if (other.type === 'foundation' || other.isStatic) continue;
        const o = boxOf(other);
        const dist = edgeDistXZ(self, o);
        if (dist > MAX_LATERAL) continue;
        const yLift = Math.abs(self.minY - o.maxY);
        if (o.maxY <= self.maxY + 0.5 && yLift < 3.5) {
          const score = dist + yLift * 0.35;
          if (score < bestScore) {
            bestScore = score;
            best = { o, mode: 'below' };
          }
        }
        const yHang = Math.abs(o.minY - self.maxY);
        if (o.minY >= self.minY - 0.5 && yHang < 3.5) {
          const score = dist + yHang * 0.35 + 0.02;
          if (score < bestScore) {
            bestScore = score;
            best = { o, mode: 'above' };
          }
        }
      }
      if (!best) continue;
      const { o, mode } = best;
      const hw = entry.spawnSize[0] / 2;
      const hd = entry.spawnSize[2] / 2;
      let x = entry.spawnPos[0];
      let z = entry.spawnPos[2];
      if (self.maxX < o.minX) x = o.minX - hw + 0.04;
      else if (self.minX > o.maxX) x = o.maxX + hw - 0.04;
      if (self.maxZ < o.minZ) z = o.minZ - hd + 0.04;
      else if (self.minZ > o.maxZ) z = o.maxZ + hd - 0.04;
      const h = entry.spawnSize[1];
      const y = mode === 'below' ? o.maxY + h / 2 : o.minY - h / 2;
      entry.spawnPos = [x, y, z];
    }
  };

  for (let i = 0; i < 5; i++) snapDownPass();
  for (let i = 0; i < 3; i++) snapUpPass();
  for (let i = 0; i < 4; i++) {
    lateralRescuePass();
    snapDownPass();
    snapUpPass();
  }
}

function remainingFloats(entries) {
  const floats = [];
  for (const e of entries) {
    if (e.isStatic) continue;
    if (isSupported(entries, e)) continue;
    const self = boxOf(e);
    floats.push({
      id: e.moduleId,
      type: e.type,
      bot: +self.minY.toFixed(3),
      pos: e.spawnPos.map((n) => +n.toFixed(2)),
    });
  }
  return floats;
}

const bad = [];
const byArchetype = new Map();
let checked = 0;
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
    snapEntries(entries);
    const floats = remainingFloats(entries);
    checked++;
    if (floats.length) {
      bad.push({ id: j.id, archetype: j.archetype, n: floats.length, floats });
      byArchetype.set(j.archetype, (byArchetype.get(j.archetype) || 0) + 1);
    }
  }
}

bad.sort((a, b) => b.n - a.n);
console.log(`Checked ${checked} siege levels`);
console.log(`Still floating after snap+rescue: ${bad.length}`);
console.log('By archetype:', Object.fromEntries([...byArchetype.entries()].sort()));
for (const b of bad.slice(0, 40)) {
  console.log(`${b.id} (${b.archetype}) n=${b.n}`, JSON.stringify(b.floats));
}
if (bad.length > 40) console.log(`... +${bad.length - 40} more`);

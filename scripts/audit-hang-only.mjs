/**
 * Po snapie: ile elementów opiera się TYLKO na stropie (wiszenie), a ile ma podporę od dołu.
 */
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

// Reuse snap from audit by duplicating minimal classify after running audit script logic
const auditPath = new URL('./audit-all-siege-float.mjs', import.meta.url);
// We'll inline classify by importing functions — audit doesn't export. Duplicate snap call via vm:
const src = fs.readFileSync(new URL('./audit-all-siege-float.mjs', import.meta.url), 'utf8');
// Extract by running snapEntries from a copy — simpler: exec the snap code path here.

const ROOT = 'c:/Fundusz/Gry/Armata/src/levels/siege/data';
const pad = (n) => String(n).padStart(2, '0');
const SUPPORT_TOL = 0.08;
const GROUND_Y = 0;
const PAD = 0.08;
const MAX_GAP = 20;

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
function supportKind(entries, entry) {
  const self = boxOf(entry);
  if (self.minY <= GROUND_Y + SUPPORT_TOL) return 'ground';
  let below = false;
  let above = false;
  for (const other of entries) {
    if (other.moduleId === entry.moduleId) continue;
    const o = boxOf(other);
    if (!overlapXZ(self, o)) continue;
    const gapBelow = self.minY - o.maxY;
    if (gapBelow >= -0.05 && gapBelow <= SUPPORT_TOL) below = true;
    const gapAbove = o.minY - self.maxY;
    if (gapAbove >= -0.05 && gapAbove <= SUPPORT_TOL) above = true;
  }
  if (below) return 'below';
  if (above) return 'hang';
  return 'none';
}

/** Snap zgodny z session.ts (prefer below, resolve hang-only). */
function isSupportedFromBelow(entries, entry) {
  return supportKind(entries, entry) === 'ground' || supportKind(entries, entry) === 'below';
}
function isHangOnly(entries, entry) {
  return supportKind(entries, entry) === 'hang';
}
function isSupported(entries, entry) {
  return supportKind(entries, entry) !== 'none';
}
function snapEntries(entries) {
  const applyPos = (entry, x, y, z) => {
    entry.spawnPos = [x, y, z];
  };
  const applyY = (entry, y) => {
    entry.spawnPos[1] = y;
  };

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
      applyY(entry, entry.spawnPos[1] - gap);
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
      applyY(entry, entry.spawnPos[1] + gap);
    }
  };

  const lateralRescuePass = (opts = {}) => {
    const MAX_LATERAL = opts.maxLateral ?? 2.8;
    const belowOnly = Boolean(opts.belowOnly);
    for (const entry of entries) {
      if (entry.isStatic) continue;
      if (!belowOnly && isSupportedFromBelow(entries, entry)) continue;
      if (belowOnly && !isHangOnly(entries, entry)) continue;
      const self = boxOf(entry);
      let best = null;
      let bestScore = Infinity;
      for (const other of entries) {
        if (other.moduleId === entry.moduleId) continue;
        if (other.type === 'foundation') continue;
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
        if (!belowOnly) {
          const yHang = Math.abs(o.minY - self.maxY);
          if (o.minY >= self.minY - 0.5 && yHang < 3.5) {
            const score = dist + yHang * 0.35 + 1.75;
            if (score < bestScore) {
              bestScore = score;
              best = { o, mode: 'above' };
            }
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
      applyPos(entry, x, y, z);
    }
  };

  const resolveHangOnlyPass = () => {
    lateralRescuePass({ belowOnly: true, maxLateral: 4.5 });
    snapDownPass();
    for (const entry of entries) {
      if (entry.isStatic) continue;
      if (!isHangOnly(entries, entry)) continue;
      const self = boxOf(entry);
      const h = entry.spawnSize[1];
      let best = null;
      for (const other of entries) {
        if (other.moduleId === entry.moduleId) continue;
        const o = boxOf(other);
        if (o.maxY > self.minY + 0.05) continue;
        const cx = (o.minX + o.maxX) / 2;
        const cz = (o.minZ + o.maxZ) / 2;
        const midX = (self.minX + self.maxX) / 2;
        const midZ = (self.minZ + self.maxZ) / 2;
        const dist = Math.hypot(midX - cx, midZ - cz);
        if (dist > 5.5) continue;
        const score = dist + (self.minY - o.maxY) * 0.15;
        if (!best || score < best.score) best = { x: cx, y: o.maxY + h / 2, z: cz, score };
      }
      if (best) applyPos(entry, best.x, best.y, best.z);
      else if (self.minY <= 3.5) applyY(entry, GROUND_Y + h / 2);
    }
    for (let i = 0; i < 3; i++) snapDownPass();
  };

  for (let i = 0; i < 5; i++) snapDownPass();
  for (let i = 0; i < 2; i++) snapUpPass();
  for (let i = 0; i < 4; i++) {
    lateralRescuePass();
    snapDownPass();
  }
  for (let i = 0; i < 3; i++) snapDownPass();
  resolveHangOnlyPass();
}

let hangOnly = 0;
let hangLevels = 0;
const byArch = new Map();
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
    let levelHang = 0;
    for (const e of entries) {
      if (e.isStatic) continue;
      if (supportKind(entries, e) === 'hang') {
        hangOnly++;
        levelHang++;
      }
    }
    if (levelHang) {
      hangLevels++;
      byArch.set(j.archetype, (byArch.get(j.archetype) || 0) + 1);
    }
  }
}
console.log({ hangOnlyModules: hangOnly, levelsWithHangOnly: hangLevels, byArch: Object.fromEntries(byArch) });

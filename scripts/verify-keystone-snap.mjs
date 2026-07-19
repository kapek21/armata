/** Symulacja snap jak w session.ts — weryfikacja tarcz na tierach 5,7,10,11,13 */
import fs from 'fs';
import path from 'path';

const ROOT = 'c:/Fundusz/Gry/Armata/src/levels/siege/data';
const pad = (n) => String(n).padStart(2, '0');

function snapLevel(file) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  const entries = j.enemyCastle.modules.map((m) => ({
    moduleId: m.id,
    isStatic: !!(m.isStatic || m.type === 'foundation'),
    isKeystone: m.type === 'keystone' || m.importance === 'critical',
    cleared: false,
    spawnPos: [...m.position],
    spawnSize: [...m.size],
  }));

  const boxOf = (e) => {
    const [x, y, z] = e.spawnPos;
    const [w, h, d] = e.spawnSize;
    return {
      entry: e,
      minX: x - w / 2,
      maxX: x + w / 2,
      minY: y - h / 2,
      maxY: y + h / 2,
      minZ: z - d / 2,
      maxZ: z + d / 2,
    };
  };

  const overlapXZ = (a, b, pad = 0.06) =>
    a.minX < b.maxX + pad && a.maxX > b.minX - pad && a.minZ < b.maxZ + pad && a.maxZ > b.minZ - pad;

  const centerOver = (a, b) => {
    const cx = (a.minX + a.maxX) * 0.5;
    const cz = (a.minZ + a.maxZ) * 0.5;
    return (
      cx >= b.minX - 0.05 &&
      cx <= b.maxX + 0.05 &&
      cz >= b.minZ - 0.05 &&
      cz <= b.maxZ + 0.05
    );
  };

  const snapPass = (onlyKeystones) => {
    const ordered = [...entries]
      .filter((e) => !e.isStatic && (!onlyKeystones || e.isKeystone))
      .sort((a, b) => a.spawnPos[1] - a.spawnSize[1] / 2 - (b.spawnPos[1] - b.spawnSize[1] / 2));

    for (const entry of ordered) {
      const self = boxOf(entry);
      let bestTop = -Infinity;
      let found = false;
      let via = '';
      for (const other of entries) {
        if (other.moduleId === entry.moduleId) continue;
        const o = boxOf(other);
        const xzOk = entry.isKeystone
          ? overlapXZ(self, o, 0.08) || centerOver(self, o)
          : overlapXZ(self, o, 0.06);
        if (!xzOk) continue;
        if (o.maxY > self.minY + 0.12) continue;
        if (o.maxY > bestTop) {
          bestTop = o.maxY;
          found = true;
          via = other.moduleId;
        }
      }
      if (!found) continue;
      const gap = self.minY - bestTop;
      const maxGap = entry.isKeystone ? 1.6 : 0.7;
      const minGap = entry.isKeystone ? 0.005 : 0.02;
      if (gap <= minGap || gap > maxGap) continue;
      entry.spawnPos[1] -= gap;
      entry._snapped = { gap: +gap.toFixed(3), via };
    }
  };

  snapPass(false);
  snapPass(false);
  snapPass(true);
  snapPass(true);

  const keys = entries.filter((e) => e.isKeystone);
  return {
    id: j.id,
    keys: keys.map((e) => {
      const bot = e.spawnPos[1] - e.spawnSize[1] / 2;
      return {
        id: e.moduleId,
        y: +e.spawnPos[1].toFixed(3),
        bot: +bot.toFixed(3),
        snapped: e._snapped || null,
      };
    }),
  };
}

for (const t of [5, 7, 10, 11, 13]) {
  console.log(JSON.stringify(snapLevel(path.join(ROOT, `t${pad(t)}-v01.json`)), null, 2));
}

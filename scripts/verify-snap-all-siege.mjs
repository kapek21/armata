import fs from 'fs';
import path from 'path';

const ROOT = 'c:/Fundusz/Gry/Armata/src/levels/siege/data';
const pad = (n) => String(n).padStart(2, '0');

function snapFile(file) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  const entries = j.enemyCastle.modules.map((m) => ({
    moduleId: m.id,
    isStatic: !!(m.isStatic || m.type === 'foundation'),
    cleared: false,
    spawnPos: [...m.position],
    spawnSize: [...m.size],
  }));

  const boxOf = (e) => {
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
  };

  const edgeDistXZ = (a, b) => {
    const dx = Math.max(0, Math.max(a.minX - b.maxX, b.minX - a.maxX));
    const dz = Math.max(0, Math.max(a.minZ - b.maxZ, b.minZ - a.maxZ));
    return Math.hypot(dx, dz);
  };

  const pass = () => {
    const ordered = [...entries]
      .filter((e) => !e.isStatic)
      .sort((a, b) => a.spawnPos[1] - a.spawnSize[1] / 2 - (b.spawnPos[1] - b.spawnSize[1] / 2));
    for (const entry of ordered) {
      const self = boxOf(entry);
      let bestTop = -Infinity;
      let bestDist = Infinity;
      let found = false;
      for (const other of entries) {
        if (other.moduleId === entry.moduleId) continue;
        const o = boxOf(other);
        const dist = edgeDistXZ(self, o);
        if (dist > 1.35) continue;
        if (o.maxY > self.minY + 0.18) continue;
        const better =
          o.maxY > bestTop + 0.001 || (Math.abs(o.maxY - bestTop) <= 0.001 && dist < bestDist);
        if (better) {
          bestTop = o.maxY;
          bestDist = dist;
          found = true;
        }
      }
      if (!found) continue;
      const gap = self.minY - bestTop;
      if (gap <= 0.001 || gap > 2.6) continue;
      entry.spawnPos[1] -= gap;
    }
  };
  for (let i = 0; i < 6; i++) pass();

  const floats = [];
  for (const e of entries) {
    if (e.isStatic) continue;
    const self = boxOf(e);
    let bestTop = -Infinity;
    let found = false;
    for (const o of entries) {
      if (o.moduleId === e.moduleId) continue;
      const b = boxOf(o);
      if (edgeDistXZ(self, b) > 1.35) continue;
      if (b.maxY > self.minY + 0.18) continue;
      if (b.maxY > bestTop) {
        bestTop = b.maxY;
        found = true;
      }
    }
    const gap = found ? self.minY - bestTop : null;
    if (!found || gap > 0.06) {
      floats.push({ id: e.moduleId, bot: +self.minY.toFixed(3), gap: gap == null ? 'none' : +gap.toFixed(3) });
    }
  }
  return { id: j.id, archetype: j.archetype, floats };
}

const siegeSlots = [1, 2, 4, 5, 7, 8, 10, 11, 13, 14];
for (const t of siegeSlots) {
  let worst = null;
  let ok = 0;
  for (let v = 1; v <= 10; v++) {
    const r = snapFile(path.join(ROOT, `t${pad(t)}-v${pad(v)}.json`));
    if (!r.floats.length) ok++;
    else if (!worst || r.floats.length > worst.floats.length) worst = r;
  }
  console.log(
    `tier ${t}: ${ok}/10 ok`,
    worst ? `| worst ${worst.id} (${worst.archetype}) ${JSON.stringify(worst.floats.slice(0, 5))}` : '',
  );
}

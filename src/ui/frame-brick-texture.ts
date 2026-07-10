/** Proceduralna tekstura cegieł na obudowę wieży (CSS background). */

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function makeFrameBrickDataUrl(seed = 42, size = 256): string {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rand = seeded(seed);

  ctx.fillStyle = '#3a3228';
  ctx.fillRect(0, 0, size, size);

  const cols = 3;
  const rows = 6;
  const mortar = 5;

  for (let row = 0; row < rows; row++) {
    const rowH = size / rows + rand() * 4 - 2;
    const y = row * (size / rows);
    const offset = (row % 2) * (size / cols) * 0.38;

    for (let col = -1; col < cols + 1; col++) {
      const baseW = size / cols;
      const w = baseW - mortar + rand() * 10 - 5;
      const h = rowH - mortar + rand() * 6 - 3;
      const x = col * baseW + offset + mortar * 0.5 + rand() * 4 - 2;
      const shade = 34 + Math.floor(rand() * 16);
      const hue = 28 + rand() * 8;

      ctx.fillStyle = `hsl(${hue}, 14%, ${shade}%)`;
      ctx.fillRect(x, y + mortar * 0.5, w, h);

      ctx.fillStyle = `hsla(${hue}, 10%, ${shade + 12}%, 0.45)`;
      ctx.fillRect(x + 2, y + mortar * 0.5 + 2, w * 0.35, h * 0.28);

      if (rand() > 0.55) {
        const chip = 6 + rand() * 14;
        ctx.fillStyle = '#2a2218';
        const side = rand() > 0.5 ? 'right' : 'left';
        if (side === 'right') {
          ctx.beginPath();
          ctx.moveTo(x + w, y + mortar * 0.5);
          ctx.lineTo(x + w - chip, y + mortar * 0.5 + h * 0.35);
          ctx.lineTo(x + w, y + mortar * 0.5 + h * 0.55);
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.moveTo(x, y + mortar * 0.5 + h * 0.4);
          ctx.lineTo(x + chip, y + mortar * 0.5 + h);
          ctx.lineTo(x, y + mortar * 0.5 + h);
          ctx.closePath();
          ctx.fill();
        }
      }

      if (rand() > 0.72) {
        ctx.strokeStyle = `hsla(20, 8%, ${shade - 10}%, 0.7)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + w * 0.2, y + mortar * 0.5 + h * 0.3);
        ctx.lineTo(x + w * 0.75, y + mortar * 0.5 + h * 0.65);
        ctx.stroke();
      }
    }
  }

  const impacts = 5 + Math.floor(rand() * 4);
  for (let i = 0; i < impacts; i++) {
    const cx = rand() * size;
    const cy = rand() * size;
    const r = 4 + rand() * 10;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, 'rgba(18, 14, 10, 0.85)');
    grad.addColorStop(0.55, 'rgba(42, 34, 24, 0.55)');
    grad.addColorStop(1, 'rgba(42, 34, 24, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    for (let s = 0; s < 3; s++) {
      const a = rand() * Math.PI * 2;
      const len = r * (1.2 + rand());
      ctx.strokeStyle = 'rgba(20, 16, 12, 0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
      ctx.stroke();
    }
  }

  return canvas.toDataURL('image/png');
}

export function frameBrickStyle(seed = 42): { backgroundImage: string } {
  return { backgroundImage: `url(${makeFrameBrickDataUrl(seed)})` };
}

export function cornerBrickStyle(id: string): { backgroundImage: string } {
  return frameBrickStyle(hashSeed(id));
}

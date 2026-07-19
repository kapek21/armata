import * as THREE from 'three';
import type { QualityTier } from '../core/types.js';

/** Kolor wizualnej platformy / podłoża pod celem. */
export const PLATFORM_GROUND_COLOR = 0x4a5c32;

function makeStoneTexture(size = 128): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cols = 3;
  const rows = 3;
  const mortar = '#4a4642';

  ctx.fillStyle = mortar;
  ctx.fillRect(0, 0, size, size);

  for (let row = 0; row < rows; row++) {
    const offset = (row % 2) * (size / cols) * 0.33;
    for (let col = -1; col < cols + 1; col++) {
      const cellW = size / cols;
      const cellH = size / rows;
      const jitterX = ((row * 3 + col) % 5) * 1.2 - 2;
      const jitterY = ((row + col * 2) % 4) * 1.1 - 1.5;
      const w = cellW - 7 + ((col + row) % 3) * 2;
      const h = cellH - 8 + (row % 2) * 3;
      const x = col * cellW + offset + 3 + jitterX;
      const y = row * cellH + 3 + jitterY;
      const shade = 38 + ((row + col) % 4) * 9;

      ctx.fillStyle = `hsl(28, 8%, ${shade}%)`;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = `hsl(28, 6%, ${shade + 10}%)`;
      ctx.fillRect(x + 3, y + 2, w * 0.38, h * 0.28);

      if ((row + col) % 3 === 0) {
        ctx.fillStyle = '#35312c';
        ctx.beginPath();
        ctx.moveTo(x + w, y);
        ctx.lineTo(x + w - 8, y + h * 0.4);
        ctx.lineTo(x + w, y + h * 0.55);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  for (let i = 0; i < 6; i++) {
    const cx = 12 + (i * 37) % (size - 24);
    const cy = 18 + (i * 29) % (size - 24);
    const r = 3 + (i % 3) * 2;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(22, 18, 16, 0.9)');
    g.addColorStop(1, 'rgba(22, 18, 16, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function makeWoodTexture(size = 128): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const planks = 4;
  const plankH = size / planks;

  for (let i = 0; i < planks; i++) {
    const y = i * plankH;
    const shade = 28 + (i % 3) * 5;
    const wobble = (i % 2) * 3;
    ctx.fillStyle = `hsl(32, 44%, ${shade}%)`;
    ctx.fillRect(0, y + 1, size + wobble, plankH - 3);

    for (let g = 0; g < 18; g++) {
      ctx.strokeStyle = `hsla(30, 35%, ${shade - 8}%, 0.35)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y + 4 + g * 3);
      ctx.bezierCurveTo(size * 0.3, y + 6 + g * 3, size * 0.7, y + 2 + g * 3, size, y + 5 + g * 3);
      ctx.stroke();
    }

    ctx.fillStyle = `hsl(28, 40%, ${shade - 12}%)`;
    ctx.fillRect(0, y + plankH - 2, size, 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function makeGlassTexture(size = 128): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cols = 3;
  const rows = 3;
  const cellW = size / cols;
  const cellH = size / rows;
  const frame = '#6a8a9a';

  ctx.fillStyle = frame;
  ctx.fillRect(0, 0, size, size);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = col * cellW + 3;
      const y = row * cellH + 3;
      const w = cellW - 6;
      const h = cellH - 6;
      const grad = ctx.createLinearGradient(x, y, x + w, y + h);
      grad.addColorStop(0, 'rgba(180, 230, 255, 0.85)');
      grad.addColorStop(0.45, 'rgba(120, 200, 240, 0.55)');
      grad.addColorStop(1, 'rgba(200, 245, 255, 0.75)');
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 4, y + 4);
      ctx.lineTo(x + w * 0.55, y + h * 0.35);
      ctx.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function makeMetalTexture(size = 128): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#7a8a9a';
  ctx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += 2) {
    ctx.fillStyle = `hsl(210, 8%, ${48 + (y % 8)})`;
    ctx.fillRect(0, y, size, 1);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function makeGoldTexture(size = 128): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const base = ctx.createLinearGradient(0, 0, size, size);
  base.addColorStop(0, '#fff2b8');
  base.addColorStop(0.35, '#e8b830');
  base.addColorStop(0.7, '#c88a18');
  base.addColorStop(1, '#ffe08a');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 28; i++) {
    const y = (i / 28) * size;
    ctx.fillStyle = `rgba(255, 240, 180, ${0.08 + (i % 3) * 0.04})`;
    ctx.fillRect(0, y, size, 2 + (i % 2));
  }
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.fillStyle = `rgba(255, 255, 220, ${0.05 + Math.random() * 0.12})`;
    ctx.fillRect(x, y, 1 + Math.random() * 3, 1);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Stonowany emblemat tarczy — brąz, bez jaskrawego złota. */
export function makeShieldEmblemTexture(size = 256): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);

  const cx = size / 2;
  const top = size * 0.14;
  const bottom = size * 0.86;
  const shoulderY = size * 0.4;
  const width = size * 0.34;

  ctx.beginPath();
  ctx.moveTo(cx, top);
  ctx.lineTo(cx + width, shoulderY);
  ctx.lineTo(cx + width * 0.82, bottom);
  ctx.lineTo(cx - width * 0.82, bottom);
  ctx.lineTo(cx - width, shoulderY);
  ctx.closePath();

  const shieldGrad = ctx.createLinearGradient(cx, top, cx, bottom);
  shieldGrad.addColorStop(0, '#c4a878');
  shieldGrad.addColorStop(0.5, '#9a7a50');
  shieldGrad.addColorStop(1, '#6a5538');
  ctx.fillStyle = shieldGrad;
  ctx.fill();

  ctx.strokeStyle = 'rgba(50, 38, 24, 0.7)';
  ctx.lineWidth = size * 0.014;
  ctx.stroke();

  const bossR = size * 0.07;
  const boss = ctx.createRadialGradient(cx, size * 0.5, 0, cx, size * 0.5, bossR);
  boss.addColorStop(0, '#d8c090');
  boss.addColorStop(1, '#7a6240');
  ctx.fillStyle = boss;
  ctx.beginPath();
  ctx.arc(cx, size * 0.5, bossR, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

function makeGroundTexture(size = 128): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#4a5a42';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 80; i++) {
    ctx.fillStyle = `hsl(95, 18%, ${28 + Math.random() * 14}%)`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 6 + Math.random() * 10, 4 + Math.random() * 8);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export interface CastleMaterials {
  stone: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  ground: THREE.MeshStandardMaterial;
  keystone: THREE.MeshStandardMaterial;
  keystoneGold: THREE.MeshStandardMaterial;
  keystoneShield: THREE.MeshStandardMaterial;
}

export function createCastleMaterials(tier: QualityTier): CastleMaterials {
  const texSize = tier === 'high' ? 256 : tier === 'medium' ? 128 : 64;
  const stoneTex = makeStoneTexture(texSize);
  const woodTex = makeWoodTexture(texSize);
  const glassTex = makeGlassTexture(texSize);
  const metalTex = makeMetalTexture(texSize);
  const goldTex = makeGoldTexture(texSize);
  const shieldTex = makeShieldEmblemTexture(texSize === 64 ? 128 : 256);
  const groundTex = makeGroundTexture(texSize);

  const keystoneGold = new THREE.MeshStandardMaterial({
    map: goldTex,
    color: 0xa88858,
    emissive: 0x2a1c08,
    emissiveIntensity: 0.12,
    roughness: 0.55,
    metalness: 0.45,
  });

  return {
    stone: new THREE.MeshStandardMaterial({
      map: stoneTex,
      color: 0xa89888,
      roughness: 0.92,
      metalness: 0.03,
    }),
  // Canvas fallback też w stronę pomarańczowego drewna.
  wood: new THREE.MeshStandardMaterial({
      map: woodTex,
      color: 0xffc070,
      roughness: 0.68,
      metalness: 0.02,
    }),
    metal: new THREE.MeshStandardMaterial({
      map: metalTex,
      color: 0x9aa8b8,
      roughness: 0.38,
      metalness: 0.72,
    }),
    glass: new THREE.MeshStandardMaterial({
      map: glassTex,
      color: 0xd8f4ff,
      roughness: 0.08,
      metalness: 0.15,
      transparent: true,
      opacity: 0.82,
    }),
    ground: new THREE.MeshStandardMaterial({
      map: groundTex,
      color: PLATFORM_GROUND_COLOR,
      roughness: 0.96,
      metalness: 0,
    }),
    keystone: keystoneGold,
    keystoneGold,
    keystoneShield: new THREE.MeshStandardMaterial({
      map: shieldTex,
      color: 0xddd0b8,
      emissive: 0x1a1008,
      emissiveIntensity: 0.1,
      roughness: 0.62,
      metalness: 0.35,
      transparent: true,
      alphaTest: 0.1,
      side: THREE.FrontSide,
    }),
  };
}

const SIEGE_TEX = {
  wood: '/siege/textures/tex_wood_albedo_512.png',
  metal: '/siege/textures/tex_metal_albedo_512.png',
  stone: '/siege/textures/tex_stone_albedo_512.png',
  ground: '/siege/textures/tex_ground_albedo_512.png',
  shield: '/siege/textures/tex_keystone_shield_256.png',
} as const;

function loadTexture(url: string): Promise<THREE.Texture | null> {
  return new Promise((resolve) => {
    const loader = new THREE.TextureLoader();
    loader.load(
      url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.needsUpdate = true;
        resolve(tex);
      },
      undefined,
      () => resolve(null),
    );
  });
}

/** Podmienia canvasowe albedo na PNG z paczki siege (gdy dostępne). */
export async function applySiegeAlbedoMaps(mats: CastleMaterials): Promise<void> {
  const [wood, metal, stone, ground, shield] = await Promise.all([
    loadTexture(SIEGE_TEX.wood),
    loadTexture(SIEGE_TEX.metal),
    loadTexture(SIEGE_TEX.stone),
    loadTexture(SIEGE_TEX.ground),
    loadTexture(SIEGE_TEX.shield),
  ]);

  const swap = (mat: THREE.MeshStandardMaterial, tex: THREE.Texture | null): void => {
    if (!tex) return;
    const prev = mat.map;
    mat.map = tex;
    mat.needsUpdate = true;
    prev?.dispose();
  };

  swap(mats.wood, wood);
  swap(mats.metal, metal);
  swap(mats.stone, stone);
  swap(mats.ground, ground);
  if (shield) {
    swap(mats.keystoneShield, shield);
  }

  // Jaśniejsze, bardziej pomarańczowe drewno — bez mahoniowego brązu.
  mats.wood.color.setHex(0xffc878);
  mats.wood.roughness = 0.62;
  mats.metal.color.setHex(0xd8e2ec);
  mats.metal.metalness = 0.72;
  mats.metal.roughness = 0.3;
  mats.stone.color.setHex(0xe8dcc8);
  mats.stone.roughness = 0.84;
  mats.ground.color.setHex(PLATFORM_GROUND_COLOR);
  mats.keystoneGold.color.setHex(0xf0c070);
  mats.keystoneGold.emissiveIntensity = 0.2;
}

export function setupCastleScene(
  scene: THREE.Scene,
  tier: QualityTier,
): { sun: THREE.DirectionalLight; hemi: THREE.HemisphereLight } {
  scene.background = new THREE.Color(0x7eb8d8);
  scene.fog = new THREE.Fog(0x9ec4e8, 28, 55);

  const hemi = new THREE.HemisphereLight(0xddeeff, 0x3a4428, 1.15);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff5e6, 1.25);
  sun.position.set(4, 16, 8);
  if (tier !== 'low') {
    sun.castShadow = true;
    sun.shadow.mapSize.set(tier === 'high' ? 1024 : 512, tier === 'high' ? 1024 : 512);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 50;
  }
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshStandardMaterial({ color: PLATFORM_GROUND_COLOR, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.5;
  ground.receiveShadow = tier !== 'low';
  scene.add(ground);

  const hills = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 40),
    new THREE.MeshStandardMaterial({ color: 0x556838, roughness: 1 }),
  );
  hills.position.set(0, 8, -35);
  scene.add(hills);

  return { sun, hemi };
}

export function pulseKeystoneMaterial(mat: THREE.MeshStandardMaterial, t: number): void {
  mat.emissiveIntensity = 0.1 + Math.sin(t * 2.2) * 0.04;
}

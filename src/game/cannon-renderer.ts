import * as THREE from 'three';
import type { QualityTier } from '../core/types.js';

/** Lufa: środek −0.82, długość 1.6 → wylot z ≈ −1.62 (balistyka). */
export const BARREL_CENTER_Z = -0.82;
export const BARREL_LENGTH = 1.6;
export const MUZZLE_LOCAL_Z = -1.62;

let sharedCannonMaterials: CannonMaterials | null = null;

interface CannonMaterials {
  wood: THREE.MeshStandardMaterial;
  woodDark: THREE.MeshStandardMaterial;
  iron: THREE.MeshStandardMaterial;
  ironDark: THREE.MeshStandardMaterial;
  brass: THREE.MeshStandardMaterial;
  wheel: THREE.MeshStandardMaterial;
}

function makeWoodPlankTexture(size = 128): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const planks = 5;
  const ph = size / planks;
  for (let i = 0; i < planks; i++) {
    const y = i * ph;
    const shade = 30 + (i % 3) * 6;
    ctx.fillStyle = `hsl(32, 42%, ${shade}%)`;
    ctx.fillRect(0, y + 1, size, ph - 2);
    for (let g = 0; g < 12; g++) {
      ctx.strokeStyle = `hsla(28, 30%, ${shade - 10}%, 0.3)`;
      ctx.beginPath();
      ctx.moveTo(0, y + 6 + g * 4);
      ctx.bezierCurveTo(size * 0.35, y + 8 + g * 4, size * 0.65, y + 4 + g * 4, size, y + 7 + g * 4);
      ctx.stroke();
    }
    ctx.fillStyle = `hsl(25, 35%, ${shade - 14}%)`;
    ctx.fillRect(0, y + ph - 2, size, 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function makeForgedIronTexture(size = 128): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#3a3e44';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 120; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.fillStyle = `hsla(220, 6%, ${38 + Math.random() * 18}%, 0.35)`;
    ctx.fillRect(x, y, 2 + Math.random() * 6, 1 + Math.random() * 3);
  }
  for (let y = 0; y < size; y += 3) {
    ctx.fillStyle = `hsl(220, 5%, ${42 + (y % 9)})`;
    ctx.fillRect(0, y, size, 1);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function makeBrassTexture(size = 64): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, '#c9a227');
  g.addColorStop(0.5, '#8a7020');
  g.addColorStop(1, '#d4b84a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function getCannonMaterials(tier: QualityTier): CannonMaterials {
  if (sharedCannonMaterials) return sharedCannonMaterials;
  const texSize = tier === 'high' ? 256 : 128;
  const woodTex = makeWoodPlankTexture(texSize);
  const ironTex = makeForgedIronTexture(texSize);
  const brassTex = makeBrassTexture(texSize);

  sharedCannonMaterials = {
    wood: new THREE.MeshStandardMaterial({
      map: woodTex,
      color: 0xa07840,
      roughness: 0.82,
      metalness: 0.04,
    }),
    woodDark: new THREE.MeshStandardMaterial({
      map: woodTex.clone(),
      color: 0x6a5030,
      roughness: 0.88,
      metalness: 0.02,
    }),
    iron: new THREE.MeshStandardMaterial({
      map: ironTex,
      color: 0x6a7078,
      roughness: 0.48,
      metalness: 0.62,
    }),
    ironDark: new THREE.MeshStandardMaterial({
      map: ironTex.clone(),
      color: 0x3a4048,
      roughness: 0.55,
      metalness: 0.55,
    }),
    brass: new THREE.MeshStandardMaterial({
      map: brassTex,
      color: 0xc8a830,
      roughness: 0.35,
      metalness: 0.78,
    }),
    wheel: new THREE.MeshStandardMaterial({
      color: 0x4a3828,
      roughness: 0.9,
      metalness: 0.05,
    }),
  };
  return sharedCannonMaterials;
}

function addMesh(
  parent: THREE.Object3D,
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  pos: [number, number, number],
  rot: [number, number, number] | null,
  castShadow: boolean,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(...pos);
  if (rot) mesh.rotation.set(...rot);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = castShadow;
  parent.add(mesh);
  return mesh;
}

function buildCarriage(mats: CannonMaterials, tier: QualityTier, castShadow: boolean): THREE.Group {
  const carriage = new THREE.Group();
  carriage.name = 'cannon-base';

  addMesh(
    carriage,
    new THREE.BoxGeometry(1.75, 0.28, 1.05),
    mats.wood,
    [0, 0.14, 0.05],
    null,
    castShadow,
  );
  addMesh(
    carriage,
    new THREE.BoxGeometry(1.78, 0.06, 1.08),
    mats.woodDark,
    [0, 0.02, 0.05],
    null,
    castShadow,
  );

  for (const side of [-1, 1]) {
    addMesh(
      carriage,
      new THREE.BoxGeometry(0.12, 0.42, 0.9),
      mats.woodDark,
      [side * 0.82, 0.38, 0.02],
      [0, 0, side * 0.12],
      castShadow,
    );
    addMesh(
      carriage,
      new THREE.BoxGeometry(0.08, 0.5, 0.14),
      mats.ironDark,
      [side * 0.72, 0.42, 0.38],
      null,
      castShadow,
    );
  }

  const wheelSeg = tier === 'low' ? 10 : 16;
  for (const side of [-1, 1]) {
    const wheel = addMesh(
      carriage,
      new THREE.CylinderGeometry(0.36, 0.36, 0.14, wheelSeg),
      mats.wheel,
      [side * 0.88, 0.36, 0.42],
      [0, 0, Math.PI / 2],
      castShadow,
    );
    wheel.name = side < 0 ? 'wheel-l' : 'wheel-r';
    addMesh(
      carriage,
      new THREE.CylinderGeometry(0.1, 0.1, 0.16, 8),
      mats.iron,
      [side * 0.88, 0.36, 0.42],
      [0, 0, Math.PI / 2],
      castShadow,
    );
    for (let s = 0; s < 6; s++) {
      const a = (s / 6) * Math.PI * 2;
      addMesh(
        carriage,
        new THREE.BoxGeometry(0.06, 0.28, 0.05),
        mats.woodDark,
        [side * 0.88 + Math.cos(a) * 0.2, 0.36 + Math.sin(a) * 0.2, 0.42],
        [0, 0, a],
        false,
      );
    }
  }

  if (tier !== 'low') {
    addMesh(
      carriage,
      new THREE.BoxGeometry(0.35, 0.22, 0.35),
      mats.woodDark,
      [-0.55, 0.32, -0.28],
      null,
      castShadow,
    );
    addMesh(
      carriage,
      new THREE.BoxGeometry(0.32, 0.08, 0.32),
      mats.ironDark,
      [-0.55, 0.44, -0.28],
      null,
      castShadow,
    );
    for (let i = -1; i <= 1; i++) {
      addMesh(
        carriage,
        new THREE.CylinderGeometry(0.055, 0.055, 1.7, 6),
        mats.ironDark,
        [i * 0.35, 0.3, 0.05],
        [Math.PI / 2, 0, 0],
        castShadow,
      );
    }
  }

  return carriage;
}

function buildBarrelAssembly(mats: CannonMaterials, tier: QualityTier, castShadow: boolean): THREE.Group {
  const barrelGroup = new THREE.Group();
  barrelGroup.name = 'cannon-barrel';

  const barrelSeg = tier === 'low' ? 12 : 20;
  const barrel = addMesh(
    barrelGroup,
    new THREE.CylinderGeometry(0.17, 0.26, BARREL_LENGTH, barrelSeg),
    mats.iron,
    [0, 0, BARREL_CENTER_Z],
    [Math.PI / 2, 0, 0],
    castShadow,
  );
  barrel.name = 'barrel-core';

  addMesh(
    barrelGroup,
    new THREE.CylinderGeometry(0.28, 0.3, 0.32, barrelSeg),
    mats.ironDark,
    [0, 0, 0.08],
    [Math.PI / 2, 0, 0],
    castShadow,
  );

  const ringZ = [-0.35, -0.82, -1.28];
  for (let i = 0; i < ringZ.length; i++) {
    addMesh(
      barrelGroup,
      new THREE.TorusGeometry(0.22 + (i === 1 ? 0.02 : 0), 0.035, 8, tier === 'low' ? 12 : 18),
      i === 0 ? mats.brass : mats.ironDark,
      [0, 0, ringZ[i]],
      [Math.PI / 2, 0, 0],
      castShadow,
    );
  }

  addMesh(
    barrelGroup,
    new THREE.TorusGeometry(0.2, 0.04, 8, 16),
    mats.brass,
    [0, 0, MUZZLE_LOCAL_Z],
    [Math.PI / 2, 0, 0],
    castShadow,
  ).name = 'cannon-muzzle';

  if (tier !== 'low') {
    addMesh(
      barrelGroup,
      new THREE.BoxGeometry(0.08, 0.12, 0.08),
      mats.ironDark,
      [0, 0.14, 0.22],
      null,
      castShadow,
    );
    addMesh(
      barrelGroup,
      new THREE.CylinderGeometry(0.03, 0.03, 0.18, 6),
      mats.brass,
      [0.12, 0.08, -0.15],
      [0, 0, 0.4],
      castShadow,
    );
  }

  for (const side of [-1, 1]) {
    addMesh(
      barrelGroup,
      new THREE.CylinderGeometry(0.07, 0.07, 0.2, 8),
      mats.iron,
      [side * 0.22, 0, -0.55],
      [0, 0, Math.PI / 2],
      castShadow,
    );
  }

  return barrelGroup;
}

export function createCannonMesh(tier: QualityTier): THREE.Group {
  const mats = getCannonMaterials(tier);
  const castShadow = tier !== 'low';
  const root = new THREE.Group();
  root.name = 'cannon-root';

  const carriage = buildCarriage(mats, tier, castShadow);
  root.add(carriage);

  const yawMount = new THREE.Group();
  yawMount.name = 'yaw-pivot';
  yawMount.position.y = 0.48;

  const pitchPivot = new THREE.Group();
  pitchPivot.name = 'pitch-pivot';

  pitchPivot.add(buildBarrelAssembly(mats, tier, castShadow));
  yawMount.add(pitchPivot);
  root.add(yawMount);

  return root;
}

export function disposeCannonMaterials(): void {
  if (!sharedCannonMaterials) return;
  for (const mat of Object.values(sharedCannonMaterials)) {
    if (mat.map) mat.map.dispose();
    mat.dispose();
  }
  sharedCannonMaterials = null;
}

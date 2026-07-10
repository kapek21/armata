import * as THREE from 'three';
import type { CastleModule, QualityTier } from '../core/types.js';
import type { CastleMaterials } from './castle-assets.js';

function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

type AddMesh = (
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  pos: [number, number, number],
  rot?: [number, number, number],
  glow?: { halo?: boolean },
) => void;

function addGlowMesh(
  group: THREE.Group,
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  pos: [number, number, number],
  tier: QualityTier,
  rot?: [number, number, number],
  glow?: { halo?: boolean },
): void {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(...pos);
  if (rot) mesh.rotation.set(...rot);
  mesh.castShadow = tier !== 'low';
  mesh.receiveShadow = tier !== 'low';
  mesh.userData.keystoneGlow = true;
  if (glow?.halo) mesh.userData.keystoneHalo = true;
  group.add(mesh);
}

export function buildKeystoneAssembly(
  group: THREE.Group,
  mod: CastleModule,
  mats: CastleMaterials,
  tier: QualityTier,
  _addMesh: AddMesh,
): void {
  const [w, h, d] = mod.size;
  const shellMat = mats.stone.clone();
  shellMat.color.multiplyScalar(0.78);
  applyRepeat(shellMat, mod.size);

  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), shellMat);
  body.castShadow = tier !== 'low';
  body.receiveShadow = tier !== 'low';
  body.userData.moduleId = mod.id;
  group.add(body);

  const gold = mats.keystoneGold.clone();
  const shieldMat = mats.keystoneShield.clone();
  const frameT = Math.min(0.1, Math.min(w, h) * 0.11);
  const faceZ = d / 2 + 0.02;

  const pushGlow = (
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    pos: [number, number, number],
    rot?: [number, number, number],
    glow?: { halo?: boolean },
  ): void => {
    addGlowMesh(group, geo, mat, pos, tier, rot, glow);
  };

  pushGlow(new THREE.BoxGeometry(w + frameT * 0.3, frameT, d * 0.22), gold, [0, h / 2 - frameT * 0.35, 0]);
  pushGlow(new THREE.BoxGeometry(w + frameT * 0.3, frameT, d * 0.22), gold, [0, -h / 2 + frameT * 0.35, 0]);
  pushGlow(new THREE.BoxGeometry(frameT, h * 0.92, d * 0.22), gold, [-w / 2 + frameT * 0.45, 0, 0]);
  pushGlow(new THREE.BoxGeometry(frameT, h * 0.92, d * 0.22), gold, [w / 2 - frameT * 0.45, 0, 0]);

  const shieldW = Math.min(w, h) * 0.78;
  const shieldH = shieldW * 1.18;
  pushGlow(
    new THREE.PlaneGeometry(shieldW, shieldH),
    shieldMat,
    [0, 0, faceZ],
    undefined,
    { halo: false },
  );

  if (tier !== 'low') {
    const haloMat = gold.clone();
    haloMat.emissive.setHex(0xffcc44);
    haloMat.emissiveIntensity = 0.38;
    haloMat.transparent = true;
    haloMat.opacity = 0.55;
    pushGlow(
      new THREE.PlaneGeometry(shieldW * 1.18, shieldH * 1.12),
      haloMat,
      [0, 0, faceZ - 0.025],
      undefined,
      { halo: true },
    );
    pushGlow(
      new THREE.TorusGeometry(shieldW * 0.42, frameT * 0.35, 8, 20),
      gold,
      [0, 0, faceZ - 0.01],
      [Math.PI / 2, 0, 0],
    );
  }

  const coreSize = Math.min(w, h) * 0.34;
  pushGlow(
    new THREE.BoxGeometry(coreSize, coreSize, Math.min(d * 0.45, coreSize)),
    gold,
    [0, 0, -d * 0.06],
  );

  const bandMat = gold.clone();
  bandMat.color.multiplyScalar(0.88);
  const bandH = Math.min(0.09, h * 0.12);
  pushGlow(new THREE.BoxGeometry(w * 1.04, bandH, d * 0.18), bandMat, [0, h * 0.2, d * 0.08]);
  pushGlow(new THREE.BoxGeometry(w * 1.04, bandH, d * 0.18), bandMat, [0, -h * 0.2, d * 0.08]);

  if (tier !== 'low') {
    const rivetMat = bandMat.clone();
    rivetMat.emissiveIntensity = 0.75;
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        pushGlow(
          new THREE.CylinderGeometry(frameT * 0.35, frameT * 0.35, d * 0.22, 8),
          rivetMat,
          [sx * w * 0.4, sy * h * 0.38, d * 0.1],
          [Math.PI / 2, 0, 0],
        );
      }
    }
  }
}

export function addBattleScars(
  _group: THREE.Group,
  mod: CastleModule,
  _mats: CastleMaterials,
  tier: QualityTier,
  addMesh: AddMesh,
): void {
  if (tier === 'low') return;
  const rand = seeded(hashId(mod.id));
  const [w, h, d] = mod.size;
  const scarMat = new THREE.MeshStandardMaterial({
    color: mod.material === 'wood' ? 0x2a1a10 : 0x2e2a28,
    roughness: 0.96,
    metalness: 0,
  });
  const count = 1 + Math.floor(rand() * 3);

  for (let i = 0; i < count; i++) {
    const face = Math.floor(rand() * 4);
    const cw = 0.08 + rand() * 0.18 * Math.min(w, h);
    const ch = 0.06 + rand() * 0.14 * Math.min(w, h);
    const px = (rand() - 0.5) * w * 0.55;
    const py = (rand() - 0.5) * h * 0.55;
    const inset = 0.02;

    if (face === 0) {
      addMesh(new THREE.BoxGeometry(cw, ch, inset), scarMat, [px, py, d / 2 + inset * 0.5]);
    } else if (face === 1) {
      addMesh(new THREE.BoxGeometry(cw, ch, inset), scarMat, [px, py, -d / 2 - inset * 0.5]);
    } else if (face === 2) {
      addMesh(new THREE.BoxGeometry(inset, ch, cw), scarMat, [w / 2 + inset * 0.5, py, px]);
    } else {
      addMesh(new THREE.BoxGeometry(inset, ch, cw), scarMat, [-w / 2 - inset * 0.5, py, px]);
    }
  }

  if (rand() > 0.45) {
    const scorch = new THREE.MeshStandardMaterial({
      color: 0x1a1410,
      roughness: 1,
      transparent: true,
      opacity: 0.55,
    });
    const r = 0.1 + rand() * 0.16 * Math.min(w, d);
    addMesh(new THREE.CircleGeometry(r, 8), scorch, [
      (rand() - 0.5) * w * 0.4,
      (rand() - 0.5) * h * 0.3,
      d / 2 + 0.015,
    ], [-Math.PI / 2, 0, 0]);
  }
}

export function addSiegeMachineDecor(
  _group: THREE.Group,
  mod: CastleModule,
  mats: CastleMaterials,
  tier: QualityTier,
  addMesh: AddMesh,
): void {
  if (tier === 'low') return;
  const [w, h, d] = mod.size;
  const rand = seeded(hashId(`${mod.id}-siege`));
  const timber = mats.wood.clone();
  timber.color.multiplyScalar(0.68);
  const iron = mats.metal.clone();
  iron.color.multiplyScalar(0.7);

  if (mod.type === 'tower' && mod.position[1] < 1.1) {
    const wheelR = Math.min(0.22, w * 0.28);
    const wheelY = -h / 2 - wheelR * 0.75;
    addMesh(new THREE.CylinderGeometry(wheelR, wheelR, Math.min(0.1, d * 0.18), 10), timber, [
      -w * 0.42,
      wheelY,
      d * 0.35,
    ], [0, 0, Math.PI / 2]);
    addMesh(new THREE.CylinderGeometry(wheelR, wheelR, Math.min(0.1, d * 0.18), 10), timber, [
      w * 0.42,
      wheelY,
      d * 0.35,
    ], [0, 0, Math.PI / 2]);
    addMesh(new THREE.BoxGeometry(w * 1.05, Math.min(0.08, h * 0.1), d * 0.12), iron, [
      0,
      -h / 2 + 0.05,
      -d * 0.42,
    ]);
  }

  if (mod.type === 'tower' || mod.type === 'wall') {
    const braceLen = Math.min(h * 0.9, 0.85);
    const braceW = Math.min(0.09, w * 0.12);
    if (rand() > 0.35) {
      addMesh(new THREE.BoxGeometry(braceW, braceLen, braceW), timber, [
        -w * 0.38,
        0,
        d * 0.38,
      ], [0, 0, 0.32]);
      addMesh(new THREE.BoxGeometry(braceW, braceLen, braceW), timber, [
        w * 0.38,
        0,
        d * 0.38,
      ], [0, 0, -0.32]);
    }
    addMesh(new THREE.BoxGeometry(w * 0.92, Math.min(0.07, h * 0.08), Math.min(0.07, d * 0.1)), iron, [
      0,
      h * 0.28,
      d / 2 + 0.03,
    ]);
  }

  if (mod.type === 'gate') {
    for (let i = -1; i <= 1; i += 2) {
      addMesh(new THREE.BoxGeometry(Math.min(0.07, w * 0.08), h * 0.72, Math.min(0.07, d * 0.12)), iron, [
        i * w * 0.22,
        -h * 0.05,
        d * 0.18,
      ]);
    }
    addMesh(new THREE.BoxGeometry(w * 0.88, Math.min(0.12, h * 0.14), Math.min(0.14, d * 0.2)), timber, [
      0,
      h * 0.32,
      -d * 0.38,
    ]);
  }

  if (mod.material === 'metal' || mod.type === 'foundation') {
    addMesh(new THREE.BoxGeometry(w * 0.2, Math.min(0.08, h * 0.12), d * 0.2), iron, [
      (rand() - 0.5) * w * 0.3,
      h * 0.1,
      -d * 0.35,
    ]);
  }
}

function applyRepeat(mat: THREE.MeshStandardMaterial, size: [number, number, number]): void {
  if (!mat.map) return;
  mat.map = mat.map.clone();
  mat.map.repeat.set(Math.max(0.55, size[0] * 0.75), Math.max(0.55, size[1] * 0.75));
  mat.map.needsUpdate = true;
}

export function keystoneMaterialFromAssembly(root: THREE.Object3D): THREE.MeshStandardMaterial | null {
  let found: THREE.MeshStandardMaterial | null = null;
  root.traverse((child) => {
    if (found || !(child instanceof THREE.Mesh) || !child.userData.keystoneGlow) return;
    if (child.material instanceof THREE.MeshStandardMaterial) {
      found = child.material;
    }
  });
  return found;
}

export function pulseKeystoneAssembly(root: THREE.Object3D, t: number): void {
  const pulse = 0.5 + Math.sin(t * 4) * 0.3;
  const halo = 0.35 + Math.sin(t * 3.2 + 0.6) * 0.15;
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.userData.keystoneGlow) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (const m of mats) {
      if (!(m instanceof THREE.MeshStandardMaterial)) continue;
      m.emissiveIntensity = child.userData.keystoneHalo ? halo : pulse;
    }
  });
}

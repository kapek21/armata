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
) => void;

export function buildKeystoneAssembly(
  group: THREE.Group,
  mod: CastleModule,
  mats: CastleMaterials,
  tier: QualityTier,
  addMesh: AddMesh,
): void {
  const [w, h, d] = mod.size;
  const shellMat = mats.stone.clone();
  shellMat.color.multiplyScalar(0.82);
  applyRepeat(shellMat, mod.size);

  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), shellMat);
  body.castShadow = tier !== 'low';
  body.receiveShadow = tier !== 'low';
  body.userData.moduleId = mod.id;
  group.add(body);

  const coreSize = Math.min(w, h, d) * 0.42;
  const coreMat = mats.keystone.clone();
  addMesh(new THREE.BoxGeometry(coreSize, coreSize, coreSize * 1.1), coreMat, [0, 0, d * 0.06]);

  const bandMat = mats.metal.clone();
  bandMat.color.multiplyScalar(0.75);
  const bandH = Math.min(0.1, h * 0.14);
  addMesh(new THREE.BoxGeometry(w * 1.02, bandH, d * 1.02), bandMat, [0, h * 0.22, 0]);
  addMesh(new THREE.BoxGeometry(w * 1.02, bandH, d * 1.02), bandMat, [0, -h * 0.22, 0]);

  const strapW = Math.min(0.08, w * 0.1);
  addMesh(new THREE.BoxGeometry(strapW, h * 0.88, d * 1.04), bandMat, [-w * 0.38, 0, 0]);
  addMesh(new THREE.BoxGeometry(strapW, h * 0.88, d * 1.04), bandMat, [w * 0.38, 0, 0]);

  if (tier !== 'low') {
    const crackMat = new THREE.MeshStandardMaterial({
      color: 0x1a1010,
      roughness: 0.95,
      metalness: 0,
    });
    addMesh(new THREE.BoxGeometry(w * 0.08, h * 0.55, d * 0.06), crackMat, [w * 0.18, 0, d * 0.48]);
    addMesh(new THREE.BoxGeometry(w * 0.06, h * 0.35, d * 0.06), crackMat, [-w * 0.2, h * 0.08, d * 0.46]);
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
    if (found || !(child instanceof THREE.Mesh)) return;
    if (
      child.material instanceof THREE.MeshStandardMaterial &&
      child.material.emissive &&
      child.material.emissive.getHex() > 0
    ) {
      found = child.material;
    }
  });
  return found;
}

import * as THREE from 'three';
import type { BlockType, CastleModule, CastleModuleType, QualityTier } from '../core/types.js';
import { createCastleMaterials, type CastleMaterials } from './castle-assets.js';

let sharedMaterials: CastleMaterials | null = null;

export function getCastleMaterials(tier: QualityTier): CastleMaterials {
  if (!sharedMaterials) sharedMaterials = createCastleMaterials(tier);
  return sharedMaterials;
}

export function materialForModule(
  mats: CastleMaterials,
  mod: CastleModule,
): THREE.MeshStandardMaterial {
  if (mod.type === 'keystone' || mod.importance === 'critical') return mats.keystone;
  const key = mod.material as BlockType;
  if (key === 'ground') return mats.ground;
  if (key === 'stone') return mats.stone;
  if (key === 'wood') return mats.wood;
  if (key === 'metal') return mats.metal;
  if (key === 'glass') return mats.glass;
  return mats.stone;
}

function applyTextureRepeat(
  mat: THREE.MeshStandardMaterial,
  size: [number, number, number],
): void {
  if (!mat.map) return;
  mat.map = mat.map.clone();
  mat.map.repeat.set(Math.max(0.8, size[0] * 1.1), Math.max(0.8, size[1] * 1.1));
  mat.map.needsUpdate = true;
}

function makeModuleMaterial(
  mats: CastleMaterials,
  mod: CastleModule,
  shade = 1,
): THREE.MeshStandardMaterial {
  const mat = materialForModule(mats, mod).clone();
  if (shade !== 1) mat.color.multiplyScalar(shade);
  applyTextureRepeat(mat, mod.size);
  return mat;
}

function addMesh(
  group: THREE.Group,
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  pos: [number, number, number],
  tier: QualityTier,
): void {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(...pos);
  mesh.castShadow = tier !== 'low';
  mesh.receiveShadow = tier !== 'low';
  mesh.userData.moduleId = group.userData.moduleId;
  group.add(mesh);
}

function addCrenellations(
  group: THREE.Group,
  w: number,
  h: number,
  d: number,
  mat: THREE.MeshStandardMaterial,
  tier: QualityTier,
): void {
  const merlonW = Math.min(0.22, w * 0.22);
  const merlonH = Math.min(0.14, h * 0.18);
  const gap = merlonW * 0.55;
  const count = Math.max(2, Math.floor((w + gap) / (merlonW + gap)));
  const span = count * merlonW + (count - 1) * gap;
  const startX = -span / 2 + merlonW / 2;
  const y = h / 2 + merlonH / 2 - 0.02;

  for (let i = 0; i < count; i++) {
    addMesh(
      group,
      new THREE.BoxGeometry(merlonW, merlonH, d * 0.92),
      mat,
      [startX + i * (merlonW + gap), y, 0],
      tier,
    );
  }
}

function addDecorations(
  group: THREE.Group,
  mod: CastleModule,
  mats: CastleMaterials,
  tier: QualityTier,
): void {
  if (tier === 'low') return;

  const [w, h, d] = mod.size;
  const stoneAccent = makeModuleMaterial(mats, { ...mod, material: 'stone' }, 0.72);
  const woodAccent = makeModuleMaterial(mats, { ...mod, material: 'wood' }, 0.78);

  switch (mod.type as CastleModuleType) {
    case 'foundation': {
      const lipH = Math.min(0.08, h * 0.14);
      addMesh(
        group,
        new THREE.BoxGeometry(w * 1.04, lipH, d * 1.04),
        stoneAccent,
        [0, -h / 2 + lipH / 2, 0],
        tier,
      );
      break;
    }
    case 'wall': {
      if (mod.material === 'stone' || mod.material === 'wood') {
        addCrenellations(group, w, h, d, stoneAccent, tier);
      }
      break;
    }
    case 'tower': {
      const capW = w * 0.88;
      const capH = Math.min(0.16, h * 0.2);
      const capD = d * 0.88;
      addMesh(
        group,
        new THREE.BoxGeometry(capW, capH, capD),
        stoneAccent,
        [0, h / 2 + capH / 2 - 0.02, 0],
        tier,
      );
      addCrenellations(group, capW, capH, capD, stoneAccent, tier);
      break;
    }
    case 'gate': {
      const archW = w * 0.42;
      const archH = h * 0.55;
      const archD = d * 0.55;
      addMesh(
        group,
        new THREE.BoxGeometry(archW, archH, archD),
        woodAccent,
        [0, -h * 0.08, d * 0.12],
        tier,
      );
      addMesh(
        group,
        new THREE.BoxGeometry(w * 0.96, Math.min(0.12, h * 0.12), d * 0.94),
        stoneAccent,
        [0, h / 2 - 0.06, 0],
        tier,
      );
      break;
    }
    default:
      break;
  }
}

export function moduleRootFromPick(mesh: THREE.Object3D): THREE.Object3D {
  let node: THREE.Object3D = mesh;
  while (node.parent && node.parent.userData.moduleId) {
    node = node.parent;
  }
  return node.userData.moduleId ? node : mesh;
}

export function createModuleMesh(mod: CastleModule, tier: QualityTier): THREE.Group {
  const mats = getCastleMaterials(tier);
  const mat = makeModuleMaterial(mats, mod);
  const [w, h, d] = mod.size;

  const group = new THREE.Group();
  group.userData.moduleId = mod.id;
  group.userData.moduleType = mod.type;

  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  body.userData.moduleId = mod.id;
  body.castShadow = tier !== 'low';
  body.receiveShadow = tier !== 'low';
  group.add(body);

  addDecorations(group, mod, mats, tier);

  group.position.set(...mod.position);
  return group;
}

export function keystoneMaterialFromMesh(root: THREE.Object3D): THREE.MeshStandardMaterial | null {
  let found: THREE.MeshStandardMaterial | null = null;
  root.traverse((child) => {
    if (found || !(child instanceof THREE.Mesh)) return;
    if (child.material instanceof THREE.MeshStandardMaterial && child.material.emissive) {
      found = child.material;
    }
  });
  return found;
}

export function disposeModuleVisual(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const mat of materials) mat.dispose();
  });
}

export function disposeCastleMaterials(): void {
  if (!sharedMaterials) return;
  for (const mat of Object.values(sharedMaterials)) {
    if (mat.map) mat.map.dispose();
    mat.dispose();
  }
  sharedMaterials = null;
}

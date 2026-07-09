import * as THREE from 'three';
import type { BlockType, CastleModule, QualityTier } from '../core/types.js';
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
  [w, h]: [number, number, number],
): void {
  if (!mat.map) return;
  mat.map = mat.map.clone();
  mat.map.repeat.set(Math.max(0.8, w * 1.1), Math.max(0.8, h * 1.1));
  mat.map.needsUpdate = true;
}

export function createModuleMesh(
  mod: CastleModule,
  tier: QualityTier,
): THREE.Mesh {
  const mats = getCastleMaterials(tier);
  const mat = materialForModule(mats, mod).clone();
  applyTextureRepeat(mat, mod.size);

  const [w, h, d] = mod.size;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(...mod.position);
  mesh.castShadow = tier !== 'low';
  mesh.receiveShadow = tier !== 'low';
  mesh.userData.moduleId = mod.id;
  mesh.userData.moduleType = mod.type;
  return mesh;
}

export function disposeCastleMaterials(): void {
  if (!sharedMaterials) return;
  for (const mat of Object.values(sharedMaterials)) {
    if (mat.map) mat.map.dispose();
    mat.dispose();
  }
  sharedMaterials = null;
}

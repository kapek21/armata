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
  if (key === 'stone' || key === 'ground') return mats.stone;
  if (key === 'wood') return mats.wood;
  if (key === 'metal') return mats.metal;
  if (key === 'glass') return mats.glass;
  return mats.stone;
}

export function createModuleMesh(
  mod: CastleModule,
  tier: QualityTier,
): THREE.Mesh {
  const mats = getCastleMaterials(tier);
  const [w, h, d] = mod.size;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    materialForModule(mats, mod).clone(),
  );
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

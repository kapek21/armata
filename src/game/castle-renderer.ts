import * as THREE from 'three';
import type { BlockType, CastleModule, CastleModuleType, QualityTier } from '../core/types.js';
import { createCastleMaterials, type CastleMaterials } from './castle-assets.js';
import {
  addBattleScars,
  addSiegeMachineDecor,
  buildKeystoneAssembly,
  keystoneMaterialFromAssembly,
} from './siege-visuals.js';

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
  mat.map.repeat.set(Math.max(0.55, size[0] * 0.75), Math.max(0.55, size[1] * 0.75));
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
  rot?: [number, number, number],
): void {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(...pos);
  if (rot) mesh.rotation.set(...rot);
  mesh.castShadow = tier !== 'low';
  mesh.receiveShadow = tier !== 'low';
  mesh.userData.moduleId = group.userData.moduleId;
  group.add(mesh);
}

function makeAddMesh(
  group: THREE.Group,
  tier: QualityTier,
): (
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  pos: [number, number, number],
  rot?: [number, number, number],
) => void {
  return (geo, mat, pos, rot) => addMesh(group, geo, mat, pos, tier, rot);
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
      const lipH = Math.min(0.1, h * 0.16);
      addMesh(
        group,
        new THREE.BoxGeometry(w * 1.05, lipH, d * 1.05),
        stoneAccent,
        [0, -h / 2 + lipH / 2, 0],
        tier,
      );
      break;
    }
    case 'wall':
      break;
    case 'tower': {
      addMesh(
        group,
        new THREE.BoxGeometry(w * 0.15, h * 0.55, d * 0.12),
        woodAccent,
        [0, 0, d / 2 + 0.04],
        tier,
      );
      break;
    }
    case 'gate': {
      const archW = w * 0.44;
      const archH = h * 0.58;
      const archD = d * 0.58;
      addMesh(
        group,
        new THREE.BoxGeometry(archW, archH, archD),
        woodAccent,
        [0, -h * 0.08, d * 0.12],
        tier,
      );
      addMesh(
        group,
        new THREE.BoxGeometry(w * 0.98, Math.min(0.14, h * 0.14), d * 0.96),
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
  const isKeystone = mod.type === 'keystone' || mod.importance === 'critical';
  const [w, h, d] = mod.size;

  const group = new THREE.Group();
  group.userData.moduleId = mod.id;
  group.userData.moduleType = mod.type;

  const push = makeAddMesh(group, tier);

  if (isKeystone) {
    buildKeystoneAssembly(group, mod, mats, tier, push);
  } else {
    const mat = makeModuleMaterial(mats, mod);
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    body.userData.moduleId = mod.id;
    body.castShadow = tier !== 'low';
    body.receiveShadow = tier !== 'low';
    group.add(body);

    const gap = 0.018;
    const seamMat = new THREE.MeshStandardMaterial({
      color: 0x2a2420,
      roughness: 1,
      metalness: 0,
    });
    addMesh(group, new THREE.BoxGeometry(w + gap, gap, d + gap), seamMat, [0, h / 2 - gap / 2, 0], tier);
    addMesh(group, new THREE.BoxGeometry(w + gap, gap, d + gap), seamMat, [0, -h / 2 + gap / 2, 0], tier);

    addBattleScars(group, mod, mats, tier, push);
    addSiegeMachineDecor(group, mod, mats, tier, push);
    addDecorations(group, mod, mats, tier);
  }

  group.position.set(...mod.position);
  return group;
}

export function keystoneMaterialFromMesh(root: THREE.Object3D): THREE.MeshStandardMaterial | null {
  return keystoneMaterialFromAssembly(root);
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

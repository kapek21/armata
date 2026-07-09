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

function tagModule(mesh: THREE.Object3D, mod: CastleModule): void {
  mesh.userData.moduleId = mod.id;
  mesh.userData.moduleType = mod.type;
}

function addBrickStuds(
  group: THREE.Group,
  w: number,
  h: number,
  d: number,
  mat: THREE.MeshStandardMaterial,
  mod: CastleModule,
): void {
  if (mod.type === 'foundation' || mod.type === 'keystone') return;
  const studMat = mat.clone();
  studMat.color.offsetHSL(0, 0, mod.material === 'wood' ? -0.06 : 0.05);
  const sw = Math.min(0.22, w * 0.28);
  const sh = Math.min(0.1, h * 0.12);
  const cols = Math.max(1, Math.floor(w / 0.45));
  const rows = Math.max(1, Math.floor(d / 0.45));
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const stud = new THREE.Mesh(new THREE.BoxGeometry(sw, sh, sw), studMat);
      stud.position.set(
        -w / 2 + (c + 0.5) * (w / cols),
        h / 2 - sh * 0.35,
        -d / 2 + (r + 0.5) * (d / rows),
      );
      group.add(stud);
    }
  }
}

function addCrenellations(
  group: THREE.Group,
  w: number,
  h: number,
  d: number,
  mat: THREE.MeshStandardMaterial,
): void {
  const toothW = Math.min(0.22, w * 0.22);
  const toothH = Math.min(0.18, h * 0.2);
  const count = Math.max(3, Math.floor(w / toothW));
  const crenMat = mat.clone();
  crenMat.color.offsetHSL(0, 0, 0.04);
  for (let i = 0; i < count; i++) {
    if (i % 2 === 1) continue;
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(toothW, toothH, d * 0.88), crenMat);
    tooth.position.set(-w / 2 + (i + 0.5) * (w / count), h / 2 + toothH / 2, 0);
    group.add(tooth);
  }
}

function addGateArch(
  group: THREE.Group,
  w: number,
  h: number,
  d: number,
  mat: THREE.MeshStandardMaterial,
): void {
  const archMat = mat.clone();
  archMat.color.offsetHSL(0, 0, -0.12);
  const arch = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.45, h * 0.55, d * 0.7),
    archMat,
  );
  arch.position.set(0, -h * 0.08, d * 0.08);
  group.add(arch);
}

function addKeystoneTrim(
  group: THREE.Group,
  w: number,
  h: number,
  d: number,
): void {
  const trim = new THREE.Mesh(
    new THREE.BoxGeometry(w * 1.06, h * 0.14, d * 1.06),
    new THREE.MeshStandardMaterial({
      color: 0xffcc44,
      emissive: 0x442200,
      emissiveIntensity: 0.35,
      roughness: 0.4,
      metalness: 0.55,
    }),
  );
  trim.position.y = h / 2 + h * 0.04;
  group.add(trim);
}

function decorateModule(
  group: THREE.Group,
  mod: CastleModule,
  w: number,
  h: number,
  d: number,
  mat: THREE.MeshStandardMaterial,
): void {
  if (mod.type === 'tower') addCrenellations(group, w, h, d, mat);
  if (mod.type === 'gate') addGateArch(group, w, h, d, mat);
  if (mod.type === 'keystone') addKeystoneTrim(group, w, h, d);
  addBrickStuds(group, w, h, d, mat, mod);
}

export function createModuleMesh(
  mod: CastleModule,
  tier: QualityTier,
): THREE.Group {
  const mats = getCastleMaterials(tier);
  const [w, h, d] = mod.size;
  const group = new THREE.Group();
  const mat = materialForModule(mats, mod).clone();

  const inset = mod.type === 'foundation' ? 1 : 0.94;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(w * inset, h * inset, d * inset),
    mat,
  );
  group.add(body);

  if (mod.type !== 'foundation' && mod.material !== 'glass') {
    const mortar = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({
        color: mod.material === 'wood' ? 0x5a4210 : 0x4a4a52,
        roughness: 0.98,
        metalness: 0,
      }),
    );
    mortar.scale.set(1.02, 1.02, 1.02);
    body.renderOrder = 1;
    group.add(mortar);
    mortar.position.z = 0;
  }

  decorateModule(group, mod, w, h, d, mat);

  group.position.set(...mod.position);
  tagModule(group, mod);
  group.traverse((child) => tagModule(child, mod));

  const castShadow = tier !== 'low';
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = castShadow;
      child.receiveShadow = castShadow;
    }
  });

  return group;
}

export function disposeModuleMesh(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of mats) mat.dispose();
    }
  });
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

export function moduleRootFromPick(mesh: THREE.Object3D): THREE.Object3D {
  let node: THREE.Object3D = mesh;
  while (node.parent && node.parent.userData.moduleId) {
    node = node.parent;
  }
  return node.userData.moduleId ? node : mesh;
}

export function disposeCastleMaterials(): void {
  if (!sharedMaterials) return;
  for (const mat of Object.values(sharedMaterials)) {
    if (mat.map) mat.map.dispose();
    mat.dispose();
  }
  sharedMaterials = null;
}

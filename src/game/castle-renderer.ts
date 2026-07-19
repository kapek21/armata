import * as THREE from 'three';
import type { BlockType, CastleModule, CastleModuleType, QualityTier } from '../core/types.js';
import { createCastleMaterials, type CastleMaterials } from './castle-assets.js';
import {
  addBattleScars,
  addSiegeMachineDecor,
  buildKeystoneAssembly,
  keystoneMaterialFromAssembly,
} from './siege-visuals.js';
import { createWedgeGeometry, resolveModuleShape } from './module-shapes.js';

let sharedMaterials: CastleMaterials | null = null;

/** Kontekst wizualny — zamki dostają blanki/flagi, maszyny: dekor siege. */
export interface ModuleVisualOptions {
  kind: 'castle' | 'siege';
  /** Moduł na szczycie stosu (nic nad nim w XZ) — blanki. */
  isSkyline?: boolean;
}

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
  // Lekkie zróżnicowanie odcienia per klocek (bez zmiany fizyki).
  let h = 2166136261;
  for (let i = 0; i < mod.id.length; i++) {
    h ^= mod.id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const jitter = 0.98 + ((h >>> 0) % 12) / 100;
  mat.color.multiplyScalar(shade * jitter);
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
  decorOnly = false,
): void {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(...pos);
  if (rot) mesh.rotation.set(...rot);
  mesh.castShadow = tier !== 'low';
  mesh.receiveShadow = tier !== 'low';
  mesh.userData.moduleId = group.userData.moduleId;
  if (decorOnly) {
    mesh.userData.decorOnly = true;
    mesh.raycast = () => {};
  }
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
  const stoneAccent = makeModuleMaterial(mats, { ...mod, material: 'stone' }, 0.88);
  const woodAccent = makeModuleMaterial(mats, { ...mod, material: 'wood' }, 0.95);

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
    case 'lintel': {
      addMesh(
        group,
        new THREE.BoxGeometry(w * 1.02, Math.min(0.1, h * 0.18), d * 1.02),
        stoneAccent,
        [0, h / 2 - 0.04, 0],
        tier,
      );
      break;
    }
    case 'gable':
      break;
    default:
      break;
  }
}

/** Kamień / „cegła” (w danych zamków masonry = stone). */
function isMasonry(mod: CastleModule): boolean {
  return mod.material === 'stone' || mod.material === 'ground';
}

/**
 * Blanki (krenelaż) — tylko dekoracja na szczycie, bez colladera.
 * Rząd zębów wzdłuż dłuższej krawędzi górnej płaszczyzny.
 */
function addBattlements(
  group: THREE.Group,
  mod: CastleModule,
  mats: CastleMaterials,
  tier: QualityTier,
): void {
  if (tier === 'low') return;
  const [w, h, d] = mod.size;
  if (Math.min(w, d) < 0.45 || h < 0.35) return;

  const mat = makeModuleMaterial(mats, { ...mod, material: 'stone' }, 0.9);
  const alongX = w >= d;
  const length = alongX ? w : d;
  const depth = alongX ? d : w;

  const merlonH = THREE.MathUtils.clamp(Math.min(0.32, h * 0.28, length * 0.12), 0.1, 0.34);
  const merlonW = THREE.MathUtils.clamp(length * 0.1, 0.09, 0.2);
  const merlonD = THREE.MathUtils.clamp(depth * 0.28, 0.1, 0.2);
  // 2× gęściej niż wcześniej (step ~0.9× szerokość zęba zamiast ~1.85×).
  const step = merlonW * 0.92;
  const count = Math.max(3, Math.floor((length - merlonW) / step) + 1);
  const y = h / 2 + merlonH / 2 - 0.01;

  for (let i = 0; i < count; i++) {
    // co drugi ząb — klasyczny blank / przerwa
    if (i % 2 === 1) continue;
    const t = count === 1 ? 0.5 : i / (count - 1);
    const along = -length / 2 + merlonW / 2 + t * (length - merlonW);
    const edge = depth / 2 - merlonD / 2 - 0.01;
    for (const side of [-1, 1] as const) {
      const pos: [number, number, number] = alongX
        ? [along, y, side * edge]
        : [side * edge, y, along];
      addMesh(
        group,
        new THREE.BoxGeometry(
          alongX ? merlonW : merlonD,
          merlonH,
          alongX ? merlonD : merlonW,
        ),
        mat,
        pos,
        tier,
        undefined,
        true,
      );
    }
  }
}

/** Flaga na szczycie trójkąta — bez belek / „wystających linii”. */
function addGableFlag(
  group: THREE.Group,
  mod: CastleModule,
  mats: CastleMaterials,
  tier: QualityTier,
): void {
  if (tier === 'low') return;
  const [w, h, d] = mod.size;
  const poleH = THREE.MathUtils.clamp(Math.min(0.55, h * 0.5 + 0.12), 0.28, 0.65);
  const poleR = 0.028;
  const apexY = h / 2;

  const poleMat = makeModuleMaterial(mats, { ...mod, material: 'wood' }, 0.85);
  poleMat.color.setHex(0x5c4030);
  addMesh(
    group,
    new THREE.CylinderGeometry(poleR, poleR * 0.9, poleH, 6),
    poleMat,
    [0, apexY + poleH / 2 - 0.02, 0],
    tier,
    undefined,
    true,
  );

  // Prosty proporczyk (płaszczyzna), bez wystających belek.
  let hue = 0;
  for (let i = 0; i < mod.id.length; i++) hue = (hue + mod.id.charCodeAt(i) * 17) % 360;
  const flagMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setHSL((hue % 360) / 360, 0.55, 0.42),
    roughness: 0.85,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });
  const flagW = THREE.MathUtils.clamp(Math.max(w, d) * 0.28, 0.22, 0.42);
  const flagH = flagW * 0.62;
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(flagW, flagH), flagMat);
  flag.position.set(flagW * 0.42, apexY + poleH * 0.72, 0);
  flag.castShadow = true;
  flag.userData.moduleId = group.userData.moduleId;
  flag.userData.decorOnly = true;
  flag.raycast = () => {};
  group.add(flag);
}

/** Moduły na szczycie (nic nad nimi w rzucie XZ) — do blanków. */
export function skylineModuleIds(modules: CastleModule[]): Set<string> {
  const ids = new Set<string>();
  const boxOf = (m: CastleModule) => {
    const [x, y, z] = m.position;
    const [w, h, d] = m.size;
    return {
      id: m.id,
      minX: x - w / 2,
      maxX: x + w / 2,
      minY: y - h / 2,
      maxY: y + h / 2,
      minZ: z - d / 2,
      maxZ: z + d / 2,
    };
  };
  const overlapXZ = (
    a: ReturnType<typeof boxOf>,
    b: ReturnType<typeof boxOf>,
    pad = 0.06,
  ): boolean =>
    a.minX < b.maxX - pad &&
    a.maxX > b.minX + pad &&
    a.minZ < b.maxZ - pad &&
    a.maxZ > b.minZ + pad;

  const boxes = modules.map(boxOf);
  for (const self of boxes) {
    const mod = modules.find((m) => m.id === self.id);
    if (!mod || mod.type === 'foundation') continue;
    let covered = false;
    for (const other of boxes) {
      if (other.id === self.id) continue;
      if (other.minY < self.maxY - 0.08) continue;
      if (!overlapXZ(self, other)) continue;
      covered = true;
      break;
    }
    if (!covered) ids.add(self.id);
  }
  return ids;
}

export function moduleRootFromPick(mesh: THREE.Object3D): THREE.Object3D {
  let node: THREE.Object3D = mesh;
  while (node.parent && node.parent.userData.moduleId) {
    node = node.parent;
  }
  return node.userData.moduleId ? node : mesh;
}

export function createModuleMesh(
  mod: CastleModule,
  tier: QualityTier,
  options: ModuleVisualOptions = { kind: 'siege' },
): THREE.Group {
  const mats = getCastleMaterials(tier);
  const isKeystone = mod.type === 'keystone' || mod.importance === 'critical';
  const [w, h, d] = mod.size;
  const shape = resolveModuleShape(mod);
  const isGable = shape === 'wedge' || mod.type === 'gable';

  const group = new THREE.Group();
  group.userData.moduleId = mod.id;
  group.userData.moduleType = mod.type;

  const push = makeAddMesh(group, tier);

  if (isKeystone) {
    buildKeystoneAssembly(group, mod, mats, tier, push);
  } else {
    const mat = makeModuleMaterial(mats, mod);
    const geo =
      shape === 'wedge' ? createWedgeGeometry(w, h, d) : new THREE.BoxGeometry(w, h, d);
    const body = new THREE.Mesh(geo, mat);
    body.userData.moduleId = mod.id;
    body.castShadow = tier !== 'low';
    body.receiveShadow = tier !== 'low';
    group.add(body);

    if (shape === 'box') {
      const gap = 0.014;
      const seamMat = new THREE.MeshStandardMaterial({
        color: 0x4a4038,
        roughness: 1,
        metalness: 0,
      });
      addMesh(group, new THREE.BoxGeometry(w + gap, gap, d + gap), seamMat, [0, h / 2 - gap / 2, 0], tier);
      addMesh(group, new THREE.BoxGeometry(w + gap, gap, d + gap), seamMat, [0, -h / 2 + gap / 2, 0], tier);
    }

    if (options.kind === 'siege') {
      addBattleScars(group, mod, mats, tier, push);
      addSiegeMachineDecor(group, mod, mats, tier, push);
      addDecorations(group, mod, mats, tier);
    } else {
      // Zamek: bez dekoracji siege (belki / rowki na szczytach).
      if (isGable) {
        addGableFlag(group, mod, mats, tier);
      } else {
        addBattleScars(group, mod, mats, tier, push);
        addDecorations(group, mod, mats, tier);
        if (options.isSkyline && isMasonry(mod)) {
          addBattlements(group, mod, mats, tier);
        }
      }
    }
  }

  group.position.set(...mod.position);
  return group;
}

export function keystoneMaterialFromMesh(root: THREE.Object3D): THREE.MeshStandardMaterial | null {
  return keystoneMaterialFromAssembly(root);
}

export function disposeModuleVisual(root: THREE.Object3D): void {
  if (root.userData.visualDisposed) return;
  root.userData.visualDisposed = true;
  const seenMat = new Set<THREE.Material>();
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    if (!child.geometry.userData?.disposed) {
      child.geometry.dispose();
      child.geometry.userData.disposed = true;
    }
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const mat of materials) {
      if (!mat || seenMat.has(mat)) continue;
      seenMat.add(mat);
      mat.dispose();
    }
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

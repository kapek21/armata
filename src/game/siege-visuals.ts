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
  shellMat.color.setHex(0xe0d0b8);
  applyRepeat(shellMat, mod.size);

  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), shellMat);
  body.castShadow = tier !== 'low';
  body.receiveShadow = tier !== 'low';
  body.userData.moduleId = mod.id;
  group.add(body);

  const trim = mats.keystoneGold.clone();
  trim.emissiveIntensity = 0.1;
  const trimH = Math.min(0.06, h * 0.08);

  const pushGlow = (
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    pos: [number, number, number],
    rot?: [number, number, number],
  ): void => {
    addGlowMesh(group, geo, mat, pos, tier, rot);
  };

  pushGlow(new THREE.BoxGeometry(w * 0.96, trimH, d * 0.12), trim, [0, h / 2 - trimH * 0.6, d * 0.04]);

  const inset = 0.015;
  const shieldMat = mats.keystoneShield.clone();
  const placeShield = (
    faceW: number,
    faceH: number,
    pos: [number, number, number],
    rot: [number, number, number],
  ): void => {
    const shieldW = Math.min(faceW, faceH) * 0.44;
    const shieldH = shieldW * 1.12;
    pushGlow(new THREE.PlaneGeometry(shieldW, shieldH), shieldMat, pos, rot);
  };

  // Tarcza na każdej ścianie — widoczna po przewróceniu klocka.
  placeShield(w, h, [0, 0, d / 2 + inset], [0, 0, 0]);
  placeShield(w, h, [0, 0, -d / 2 - inset], [0, Math.PI, 0]);
  placeShield(d, h, [w / 2 + inset, 0, 0], [0, -Math.PI / 2, 0]);
  placeShield(d, h, [-w / 2 - inset, 0, 0], [0, Math.PI / 2, 0]);
  placeShield(w, d, [0, h / 2 + inset, 0], [-Math.PI / 2, 0, 0]);
  placeShield(w, d, [0, -h / 2 - inset, 0], [Math.PI / 2, 0, 0]);
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
  const style = Math.floor(rand() * 4); // 0–3 warianty wyglądu

  const timber = mats.wood.clone();
  timber.color.setHex(0xffc878);
  timber.color.multiplyScalar(1.0 + rand() * 0.1);
  applyRepeat(timber, mod.size);

  const timberLight = mats.wood.clone();
  timberLight.color.setHex(0xffd898);
  applyRepeat(timberLight, [w * 0.5, h * 0.5, d * 0.5]);

  const iron = mats.metal.clone();
  iron.color.setHex(0xd0dae4);
  iron.metalness = 0.72;
  iron.roughness = 0.28;
  applyRepeat(iron, [0.4, 0.4, 0.4]);

  const brass = mats.metal.clone();
  brass.color.setHex(0xe8bc58);
  brass.metalness = 0.6;
  brass.roughness = 0.36;

  const rivet = (px: number, py: number, pz: number, s = 0.045): void => {
    addMesh(new THREE.BoxGeometry(s, s, s * 0.7), brass, [px, py, pz]);
  };

  // Deski / rowki na drewnie
  if (mod.material === 'wood' && Math.min(w, h, d) > 0.35) {
    const grooves = 2 + Math.floor(rand() * 3);
    const grooveMat = timber.clone();
    grooveMat.color.multiplyScalar(0.85);
    for (let i = 0; i < grooves; i++) {
      const t = (i + 1) / (grooves + 1);
      if (h >= w && h >= d) {
        addMesh(
          new THREE.BoxGeometry(w * 0.98, 0.02, d * 0.04),
          grooveMat,
          [0, -h / 2 + t * h, d / 2 + 0.012],
        );
      } else {
        addMesh(
          new THREE.BoxGeometry(0.02, h * 0.92, d * 0.04),
          grooveMat,
          [-w / 2 + t * w, 0, d / 2 + 0.012],
        );
      }
    }
  }

  // Okucia narożne + nity (różnorodność)
  if (mod.type === 'tower' || mod.type === 'wall' || mod.material === 'metal') {
    const bandH = Math.min(0.09, h * 0.11);
    const bandZ = d / 2 + 0.028;
    if (style !== 1) {
      addMesh(new THREE.BoxGeometry(w * 0.96, bandH, 0.05), iron, [0, h * 0.32, bandZ]);
      addMesh(new THREE.BoxGeometry(w * 0.96, bandH, 0.05), iron, [0, -h * 0.28, bandZ]);
    } else {
      addMesh(new THREE.BoxGeometry(w * 0.2, h * 0.88, 0.05), iron, [-w * 0.4, 0, bandZ]);
      addMesh(new THREE.BoxGeometry(w * 0.2, h * 0.88, 0.05), iron, [w * 0.4, 0, bandZ]);
    }
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        rivet(sx * w * 0.42, sy * h * 0.38, bandZ + 0.02, 0.04 + rand() * 0.02);
      }
    }
    if (rand() > 0.4) {
      rivet(0, h * 0.1, bandZ + 0.02);
      rivet(-w * 0.2, -h * 0.05, bandZ + 0.02);
      rivet(w * 0.2, -h * 0.05, bandZ + 0.02);
    }
  }

  // Zastrzały / krzyżulce
  if ((mod.type === 'tower' || mod.type === 'wall') && h > 0.7 && rand() > 0.25) {
    const braceLen = Math.min(h * 0.85, Math.hypot(w, h) * 0.55);
    const braceW = Math.min(0.1, w * 0.14);
    const tilt = 0.28 + rand() * 0.2;
    if (style % 2 === 0) {
      addMesh(new THREE.BoxGeometry(braceW, braceLen, braceW), timberLight, [
        -w * 0.36,
        0,
        d * 0.36,
      ], [0, 0, tilt]);
      addMesh(new THREE.BoxGeometry(braceW, braceLen, braceW), timberLight, [
        w * 0.36,
        0,
        d * 0.36,
      ], [0, 0, -tilt]);
    } else {
      addMesh(new THREE.BoxGeometry(braceW * 0.85, braceLen * 0.9, braceW * 0.85), timber, [
        0,
        0,
        d * 0.4,
      ], [0, 0, 0.55]);
      addMesh(new THREE.BoxGeometry(braceW * 0.85, braceLen * 0.9, braceW * 0.85), timber, [
        0,
        0,
        d * 0.4,
      ], [0, 0, -0.55]);
    }
  }

  // Koła / piasty na niskich modułach (wizualnie — bez collidera)
  if (mod.type === 'tower' && mod.position[1] < 1.25 && w > 0.6) {
    const wheelR = Math.min(0.26, w * 0.3, h * 0.45);
    const wheelY = -h / 2 - wheelR * 0.55;
    const thick = Math.min(0.12, d * 0.22);
    for (const side of [-1, 1]) {
      addMesh(
        new THREE.CylinderGeometry(wheelR, wheelR, thick, 12),
        timber,
        [side * w * 0.4, wheelY, d * 0.28],
        [0, 0, Math.PI / 2],
      );
      addMesh(
        new THREE.CylinderGeometry(wheelR * 0.35, wheelR * 0.35, thick * 1.2, 8),
        iron,
        [side * w * 0.4, wheelY, d * 0.28],
        [0, 0, Math.PI / 2],
      );
      // „szprychy” jako cienkie belki
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI;
        addMesh(
          new THREE.BoxGeometry(wheelR * 1.6, 0.035, 0.035),
          timberLight,
          [side * w * 0.4, wheelY, d * 0.28],
          [0, a, Math.PI / 2],
        );
      }
    }
    addMesh(new THREE.BoxGeometry(w * 1.08, Math.min(0.09, h * 0.12), d * 0.14), iron, [
      0,
      -h / 2 + 0.06,
      -d * 0.38,
    ]);
  }

  // Głowica tarana / metalowy tip na długich belkach
  if (mod.material === 'metal' || (mod.type === 'tower' && w > h * 1.6 && w > 1.4)) {
    const tipW = Math.min(0.35, w * 0.22);
    addMesh(new THREE.BoxGeometry(tipW, Math.min(h, d) * 0.85, Math.min(h, d) * 0.85), iron, [
      w / 2 - tipW * 0.35,
      0,
      0,
    ]);
    addMesh(new THREE.BoxGeometry(tipW * 0.55, Math.min(h, d) * 0.55, Math.min(h, d) * 0.55), brass, [
      w / 2 + tipW * 0.15,
      0,
      0,
    ]);
  }

  // Zawiasy / klamry na „bramach” i szerokich ścianach
  if (mod.type === 'gate' || (mod.type === 'wall' && w > 1.2)) {
    for (let i = -1; i <= 1; i += 2) {
      addMesh(
        new THREE.BoxGeometry(Math.min(0.08, w * 0.09), h * 0.7, Math.min(0.08, d * 0.14)),
        iron,
        [i * w * 0.28, -h * 0.02, d * 0.2],
      );
      rivet(i * w * 0.28, h * 0.22, d * 0.26);
      rivet(i * w * 0.28, -h * 0.22, d * 0.26);
    }
    addMesh(
      new THREE.BoxGeometry(w * 0.9, Math.min(0.14, h * 0.16), Math.min(0.16, d * 0.22)),
      timberLight,
      [0, h * 0.3, -d * 0.35],
    );
  }

  // Balast / kamienne „worki” — jasne akcenty na stone
  if (mod.material === 'stone' && rand() > 0.35) {
    const pebble = mats.stone.clone();
    pebble.color.setHex(0xe8dcc8);
    applyRepeat(pebble, [0.3, 0.3, 0.3]);
    const n = 1 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i++) {
      const s = 0.12 + rand() * 0.16;
      addMesh(new THREE.BoxGeometry(s, s * 0.7, s), pebble, [
        (rand() - 0.5) * w * 0.55,
        h / 2 + s * 0.25,
        (rand() - 0.5) * d * 0.4,
      ]);
    }
  }

  // Liny / owinięcia na wysokich słupach
  if (mod.type === 'tower' && h > 1.4 && rand() > 0.45) {
    const rope = timberLight.clone();
    rope.color.setHex(0xffb868);
    for (let i = 0; i < 2; i++) {
      const yy = -h * 0.15 + i * h * 0.28;
      addMesh(new THREE.BoxGeometry(w * 1.06, 0.045, d * 1.06), rope, [0, yy, 0]);
    }
  }

  if (mod.type === 'foundation') {
    const lip = mats.stone.clone();
    lip.color.setHex(0xd4c4a8);
    addMesh(new THREE.BoxGeometry(w * 1.04, Math.min(0.12, h * 0.2), d * 1.04), lip, [
      0,
      -h / 2 + 0.05,
      0,
    ]);
    for (let i = 0; i < 4; i++) {
      rivet((rand() - 0.5) * w * 0.7, h * 0.15, d / 2 + 0.03, 0.05);
    }
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
  const pulse = 0.1 + Math.sin(t * 2.2) * 0.04;
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.userData.keystoneGlow) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (const m of mats) {
      if (!(m instanceof THREE.MeshStandardMaterial)) continue;
      m.emissiveIntensity = pulse;
    }
  });
}

interface SpyMatSnap {
  color: THREE.Color;
  emissive: THREE.Color;
  emissiveIntensity: number;
  opacity: number;
  transparent: boolean;
  depthTest: boolean;
  depthWrite: boolean;
}

interface SpyMeshState {
  /** Oryginalny materiał (przed klonem szpiega). */
  baseMat: THREE.Material | THREE.Material[];
  /** Klon używany podczas reveal — do dispose przy wyłączeniu. */
  spyMat: THREE.MeshStandardMaterial[];
  snaps: SpyMatSnap[];
  renderOrder: number;
}

function asStdList(mat: THREE.Material | THREE.Material[]): THREE.MeshStandardMaterial[] {
  const list = Array.isArray(mat) ? mat : [mat];
  return list.filter((m): m is THREE.MeshStandardMaterial => m instanceof THREE.MeshStandardMaterial);
}

function ensureSpyMeshState(mesh: THREE.Mesh): SpyMeshState | null {
  const existing = mesh.userData.spyState as SpyMeshState | undefined;
  if (existing) return existing;

  const base = mesh.material;
  const std = asStdList(base);
  if (std.length === 0) return null;

  const spyMat = std.map((m) => m.clone());
  const snaps: SpyMatSnap[] = spyMat.map((m) => ({
    color: m.color.clone(),
    emissive: m.emissive.clone(),
    emissiveIntensity: m.emissiveIntensity,
    opacity: m.opacity,
    transparent: m.transparent,
    depthTest: m.depthTest,
    depthWrite: m.depthWrite,
  }));
  mesh.material = spyMat.length === 1 ? spyMat[0]! : spyMat;
  const state: SpyMeshState = {
    baseMat: base,
    spyMat,
    snaps,
    renderOrder: mesh.renderOrder,
  };
  mesh.userData.spyState = state;
  return state;
}

function restoreSpyMesh(mesh: THREE.Mesh): void {
  const state = mesh.userData.spyState as SpyMeshState | undefined;
  if (!state) return;
  mesh.material = state.baseMat;
  mesh.renderOrder = state.renderOrder;
  for (const m of state.spyMat) m.dispose();
  delete mesh.userData.spyState;
}

/**
 * Szpieg (rentgen): reszta konstrukcji półprzezroczysta; keystone świeci
 * i rysuje się przez przesłony (depthTest off).
 */
export function setModuleSpyReveal(
  root: THREE.Object3D,
  mode: 'off' | 'keystone' | 'dim',
): void {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    if (child.userData.vfxShard) return;

    if (mode === 'off') {
      restoreSpyMesh(child);
      return;
    }

    const state = ensureSpyMeshState(child);
    if (!state) return;

    for (let i = 0; i < state.spyMat.length; i++) {
      const m = state.spyMat[i]!;
      const snap = state.snaps[i]!;
      if (mode === 'dim') {
        // Szkielet / rentgen — widać to, co jest za ścianą.
        m.color.copy(snap.color).multiplyScalar(0.45);
        m.emissive.setHex(0x000000);
        m.emissiveIntensity = 0;
        m.transparent = true;
        m.opacity = child.userData.decorOnly ? 0.08 : 0.22;
        m.depthTest = true;
        m.depthWrite = false;
        child.renderOrder = 0;
      } else {
        // Cel (tarcza) — „prześwit” przez zasłaniające obiekty.
        m.color.copy(snap.color);
        m.emissive.setHex(child.userData.keystoneGlow ? 0xffc14a : 0xffe08a);
        m.emissiveIntensity = child.userData.keystoneGlow ? 1.25 : 0.8;
        m.transparent = true;
        m.opacity = 0.95;
        m.depthTest = false;
        m.depthWrite = false;
        child.renderOrder = 1000;
      }
      m.needsUpdate = true;
    }
  });
}

/** Puls keystone przy aktywnym Szpiegu (silniejszy niż domyślny). */
export function pulseSpyKeystone(root: THREE.Object3D, t: number): void {
  const pulse = 0.85 + Math.sin(t * 4.2) * 0.4;
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const state = child.userData.spyState as SpyMeshState | undefined;
    if (!state) return;
    for (const m of state.spyMat) {
      if (child.userData.keystoneGlow) {
        m.emissiveIntensity = pulse;
        m.opacity = 0.88 + Math.sin(t * 4.2) * 0.1;
      } else {
        m.emissiveIntensity = 0.55 + Math.sin(t * 3.1) * 0.2;
      }
    }
  });
}

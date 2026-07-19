import * as THREE from 'three';
import type { BlockType, QualityTier } from '../core/types.js';
import { MATERIALS } from '../physics/materials.js';
const DEBRIS_COLOR = 0x0a0a0a;
const DUST_COLOR = 0x050505;

type DebrisKind = 'chunk' | 'dust';

interface Debris {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  age: number;
  life: number;
  kind: DebrisKind;
  /** Kurz: rozszerzanie skali w czasie. */
  grow?: number;
  drag?: number;
}

const debris: Debris[] = [];
const _color = new THREE.Color();
const GRAVITY = 11.5;
const MAX_DEBRIS = 110;
const GROUND_Y = 0.02;

function chunkBudget(tier: QualityTier, burst: boolean): number {
  if (tier === 'low') return burst ? 4 : 3;
  if (tier === 'medium') return burst ? 6 : 4;
  return burst ? 8 : 5;
}

function dustBudget(tier: QualityTier, burst: boolean): number {
  // +1/3 względem poprzednich wartości
  if (tier === 'low') return burst ? 5 : 4;
  if (tier === 'medium') return burst ? 11 : 7;
  return burst ? 16 : 9;
}

function disposeDebris(d: Debris): void {
  d.mesh.parent?.remove(d.mesh);
  d.mesh.geometry.dispose();
  const mats = Array.isArray(d.mesh.material) ? d.mesh.material : [d.mesh.material];
  for (const m of mats) m.dispose();
}

function trimBudget(want: number): number {
  if (MAX_DEBRIS - debris.length <= 0) {
    const drop = Math.min(debris.length, Math.max(10, want));
    for (let i = 0; i < drop; i++) {
      const d = debris.shift();
      if (d) disposeDebris(d);
    }
  }
  return Math.min(want, Math.max(0, MAX_DEBRIS - debris.length));
}

function meshVolumeApprox(mesh: THREE.Mesh): number {
  const box = new THREE.Box3().setFromObject(mesh);
  if (box.isEmpty()) return 0.01;
  const s = new THREE.Vector3();
  box.getSize(s);
  return Math.max(0.01, Math.abs(s.x * s.y * s.z));
}

/**
 * Kolor odłamka: przeważający kolor mesha ciała (nie dekoracji),
 * z lekkim uśrednieniem; fallback = MATERIALS[typ].
 */
export function colorFromHitObject(
  root: THREE.Object3D,
  materialHint?: BlockType,
): number {
  type Sample = { color: THREE.Color; weight: number };
  const samples: Sample[] = [];

  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    if (child.userData.decorOnly || child.userData.vfxShard) return;
    const raw = Array.isArray(child.material) ? child.material[0] : child.material;
    if (!raw || !('color' in raw) || !(raw.color instanceof THREE.Color)) return;

    let weight = Math.max(0.01, meshVolumeApprox(child));
    if (child.parent === root || child.parent?.userData?.moduleId === root.userData?.moduleId) {
      weight *= 2.5;
    }
    samples.push({ color: raw.color.clone(), weight });
  });

  if (samples.length > 0) {
    const acc = new THREE.Color(0, 0, 0);
    let wSum = 0;
    for (const s of samples) {
      acc.r += s.color.r * s.weight;
      acc.g += s.color.g * s.weight;
      acc.b += s.color.b * s.weight;
      wSum += s.weight;
    }
    if (wSum > 0) {
      acc.multiplyScalar(1 / wSum);
      return acc.getHex();
    }
  }

  if (materialHint && materialHint in MATERIALS) {
    return MATERIALS[materialHint].color;
  }
  return 0x9a7b5a;
}

function sizeFromRoot(root: THREE.Object3D, fallback: [number, number, number]): THREE.Vector3 {
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return new THREE.Vector3(...fallback);
  const s = new THREE.Vector3();
  box.getSize(s);
  s.x = Math.max(0.1, s.x);
  s.y = Math.max(0.1, s.y);
  s.z = Math.max(0.1, s.z);
  return s;
}

/** Czarny odłamek z lekką wariacją jasności. */
function chunkTint(): THREE.Color {
  const c = _color.setHex(DEBRIS_COLOR);
  c.offsetHSL(0, 0, (Math.random() - 0.5) * 0.03);
  return c.clone();
}

/** Nieregularny kawałek ruin: płyta / belka / okruch. */
function chunkSize(moduleSize: THREE.Vector3): THREE.Vector3 {
  const avg = (moduleSize.x + moduleSize.y + moduleSize.z) / 3;
  // −1/3 względem poprzedniej skali
  const base = THREE.MathUtils.clamp(avg * (0.12 + Math.random() * 0.15), 0.08, 0.37);
  const roll = Math.random();
  if (roll < 0.35) {
    // Płyta / cegła
    return new THREE.Vector3(
      base * (1.1 + Math.random() * 0.9),
      base * (0.28 + Math.random() * 0.35),
      base * (0.55 + Math.random() * 0.55),
    );
  }
  if (roll < 0.65) {
    // Belka / drzazga
    return new THREE.Vector3(
      base * (0.25 + Math.random() * 0.3),
      base * (0.25 + Math.random() * 0.3),
      base * (1.3 + Math.random() * 1.1),
    );
  }
  // Gruby okruch
  return new THREE.Vector3(
    base * (0.7 + Math.random() * 0.6),
    base * (0.55 + Math.random() * 0.55),
    base * (0.65 + Math.random() * 0.55),
  );
}

/**
 * Wizualne pęknięcie klocka — bez Rapiera (nie wpływa na strzały / collidery).
 */
export function spawnModuleShatter(
  scene: THREE.Scene,
  root: THREE.Object3D,
  fallbackSize: [number, number, number],
  opts: {
    tier: QualityTier;
    burst?: boolean;
    origin?: THREE.Vector3;
    outwardBoost?: number;
    material?: BlockType;
  },
): void {
  const burst = Boolean(opts.burst);
  const nChunks = trimBudget(chunkBudget(opts.tier, burst));
  if (nChunks <= 0) return;

  const size = sizeFromRoot(root, fallbackSize);
  const center = new THREE.Vector3();
  new THREE.Box3().setFromObject(root).getCenter(center);
  if (!Number.isFinite(center.x)) root.getWorldPosition(center);
  if (!opts.burst && center.y < 0.18) center.y = 0.18;

  const blastOrigin = opts.origin?.clone() ?? center.clone();
  if (!opts.burst && blastOrigin.y < 0.18) blastOrigin.y = 0.18;
  const boost = opts.outwardBoost ?? (burst ? 1.35 : 1);
  const castShadow = opts.tier === 'high';

  for (let i = 0; i < nChunks; i++) {
    const dim = chunkSize(size);
    const geo = new THREE.BoxGeometry(dim.x, dim.y, dim.z);
    const mat = new THREE.MeshStandardMaterial({
      color: chunkTint(),
      roughness: 0.96,
      metalness: 0.02,
      flatShading: true,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(center).add(
      new THREE.Vector3(
        (Math.random() - 0.5) * size.x * 0.35,
        (Math.random() - 0.5) * size.y * 0.3,
        (Math.random() - 0.5) * size.z * 0.35,
      ),
    );
    mesh.rotation.set(
      Math.random() * Math.PI * 0.6,
      Math.random() * Math.PI,
      Math.random() * Math.PI * 0.6,
    );
    mesh.castShadow = castShadow;
    mesh.userData.vfxShard = true;
    scene.add(mesh);

    const away = mesh.position.clone().sub(blastOrigin);
    if (away.lengthSq() < 0.01) {
      away.set(Math.random() - 0.5, 0.35, Math.random() - 0.5);
    }
    away.y = Math.max(0.15, away.y);
    away.normalize();

    // Cięższy lot: krótszy wybuch w bok, wyraźniejszy łuk w dół.
    const speed = (1.1 + Math.random() * 2.1) * boost;
    const vel = away.multiplyScalar(speed);
    vel.y = 1.2 + Math.random() * 2.4 + (burst ? 0.8 : 0);
    if (Math.random() < 0.35) vel.y *= 0.55;

    const tumble = 1.2 + Math.random() * 3.5;
    debris.push({
      mesh,
      vel,
      spin: new THREE.Vector3(
        (Math.random() - 0.5) * tumble,
        (Math.random() - 0.5) * tumble * 0.7,
        (Math.random() - 0.5) * tumble,
      ),
      age: 0,
      life: burst ? 1.6 + Math.random() * 0.7 : 1.15 + Math.random() * 0.55,
      kind: 'chunk',
      drag: 0.35,
    });
  }

  const nDust = trimBudget(dustBudget(opts.tier, burst));
  for (let i = 0; i < nDust; i++) {
    const puff = 0.18 + Math.random() * 0.42;
    const mat = new THREE.MeshBasicMaterial({
      color: DUST_COLOR,
      transparent: true,
      opacity: 0.4 + Math.random() * 0.22,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(puff, puff), mat);
    mesh.position.copy(center).add(
      new THREE.Vector3(
        (Math.random() - 0.5) * size.x * 0.45,
        (Math.random() - 0.5) * size.y * 0.25,
        (Math.random() - 0.5) * size.z * 0.45,
      ),
    );
    mesh.rotation.set(
      (Math.random() - 0.5) * 0.8,
      Math.random() * Math.PI,
      (Math.random() - 0.5) * 0.8,
    );
    mesh.userData.vfxShard = true;
    scene.add(mesh);

    const vel = new THREE.Vector3(
      (Math.random() - 0.5) * (1.4 + Math.random()),
      0.4 + Math.random() * 1.6,
      (Math.random() - 0.5) * (1.4 + Math.random()),
    );
    if (burst) vel.multiplyScalar(1.35);

    debris.push({
      mesh,
      vel,
      spin: new THREE.Vector3(
        (Math.random() - 0.5) * 0.8,
        (Math.random() - 0.5) * 1.2,
        (Math.random() - 0.5) * 0.8,
      ),
      age: 0,
      life: 0.85 + Math.random() * 0.65,
      kind: 'dust',
      grow: 1.6 + Math.random() * 1.8,
      drag: 2.8,
    });
  }
}

export function updateDestructionVfx(dtMs: number): void {
  if (debris.length === 0) return;
  const dt = Math.min(0.05, dtMs / 1000);

  for (let i = debris.length - 1; i >= 0; i--) {
    const d = debris[i]!;
    d.age += dt;
    const t = d.age / d.life;

    if (d.kind === 'dust') {
      const drag = d.drag ?? 2.5;
      d.vel.multiplyScalar(Math.max(0, 1 - drag * dt));
      d.vel.y += 0.35 * dt;
      d.mesh.position.addScaledVector(d.vel, dt);
      d.mesh.rotation.x += d.spin.x * dt;
      d.mesh.rotation.y += d.spin.y * dt;
      d.mesh.rotation.z += d.spin.z * dt;
      const grow = 1 + (d.grow ?? 1.5) * t;
      d.mesh.scale.setScalar(grow);
      const mat = d.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, (0.38 * (1 - t)) * (1 - t));
    } else {
      const drag = d.drag ?? 0.3;
      d.vel.x *= Math.max(0, 1 - drag * dt);
      d.vel.z *= Math.max(0, 1 - drag * dt);
      d.vel.y -= GRAVITY * dt;
      d.mesh.position.addScaledVector(d.vel, dt);
      d.mesh.rotation.x += d.spin.x * dt;
      d.mesh.rotation.y += d.spin.y * dt;
      d.mesh.rotation.z += d.spin.z * dt;

      // Lekkie uderzenie o podłoże — kawałek pada, nie znika w locie jak konfetti.
      if (d.mesh.position.y < GROUND_Y && d.vel.y < 0) {
        d.mesh.position.y = GROUND_Y;
        d.vel.y *= -0.18;
        d.vel.x *= 0.55;
        d.vel.z *= 0.55;
        d.spin.multiplyScalar(0.45);
        if (Math.abs(d.vel.y) < 0.4) d.vel.y = 0;
      }

      const mat = d.mesh.material as THREE.MeshStandardMaterial;
      if (t > 0.55) {
        mat.transparent = true;
        mat.opacity = Math.max(0, 1 - (t - 0.55) / 0.45);
      }
    }

    if (d.age >= d.life || d.mesh.position.y < -6) {
      disposeDebris(d);
      debris.splice(i, 1);
    }
  }
}

export function clearDestructionVfx(): void {
  for (const d of debris) disposeDebris(d);
  debris.length = 0;
}

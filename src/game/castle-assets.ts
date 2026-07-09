import * as THREE from 'three';
import type { QualityTier } from '../core/types.js';

function makeStoneTexture(size = 128): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#6a6a72';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 120; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const w = 4 + Math.random() * 14;
    const h = 3 + Math.random() * 10;
    ctx.fillStyle = `hsl(220, 5%, ${38 + Math.random() * 18}%)`;
    ctx.fillRect(x, y, w, h);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

function makeWoodTexture(size = 128): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#8b6914';
  ctx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += 6) {
    ctx.strokeStyle = `hsl(35, 45%, ${28 + (y % 24)}%)`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y + 2);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export interface CastleMaterials {
  stone: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  ground: THREE.MeshStandardMaterial;
  keystone: THREE.MeshStandardMaterial;
}

export function createCastleMaterials(tier: QualityTier): CastleMaterials {
  const texSize = tier === 'high' ? 256 : tier === 'medium' ? 128 : 64;
  const stoneTex = makeStoneTexture(texSize);
  const woodTex = makeWoodTexture(texSize);

  return {
    stone: new THREE.MeshStandardMaterial({
      map: stoneTex,
      color: 0xaaaaaa,
      roughness: 0.92,
      metalness: 0.05,
    }),
    wood: new THREE.MeshStandardMaterial({
      map: woodTex,
      color: 0xb8860b,
      roughness: 0.78,
      metalness: 0.02,
    }),
    metal: new THREE.MeshStandardMaterial({
      color: 0x8899aa,
      roughness: 0.45,
      metalness: 0.65,
    }),
    glass: new THREE.MeshStandardMaterial({
      color: 0x88ddff,
      roughness: 0.15,
      metalness: 0.1,
      transparent: true,
      opacity: 0.75,
    }),
    ground: new THREE.MeshStandardMaterial({
      color: 0x4a5a42,
      roughness: 0.95,
      metalness: 0,
    }),
    keystone: new THREE.MeshStandardMaterial({
      color: 0xff2244,
      emissive: 0x550011,
      emissiveIntensity: 0.45,
      roughness: 0.5,
      metalness: 0.2,
    }),
  };
}

export function setupCastleScene(
  scene: THREE.Scene,
  tier: QualityTier,
): { sun: THREE.DirectionalLight; hemi: THREE.HemisphereLight } {
  scene.background = new THREE.Color(0x7eb8d8);
  scene.fog = new THREE.Fog(0x9ec4e8, 28, 55);

  const hemi = new THREE.HemisphereLight(0xddeeff, 0x445533, 1.15);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff5e6, 1.25);
  sun.position.set(4, 16, 8);
  if (tier !== 'low') {
    sun.castShadow = true;
    sun.shadow.mapSize.set(tier === 'high' ? 1024 : 512, tier === 'high' ? 1024 : 512);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 50;
  }
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshStandardMaterial({ color: 0x5a7a48, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.5;
  ground.receiveShadow = tier !== 'low';
  scene.add(ground);

  const hills = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 40),
    new THREE.MeshStandardMaterial({ color: 0x6a8a5a, roughness: 1 }),
  );
  hills.position.set(0, 8, -35);
  scene.add(hills);

  return { sun, hemi };
}

export function pulseKeystoneMaterial(mat: THREE.MeshStandardMaterial, t: number): void {
  mat.emissiveIntensity = 0.35 + Math.sin(t * 4) * 0.15;
}

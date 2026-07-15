import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { CastleModule, ModuleShape } from '../core/types.js';

/** Wierzchołki lokalne klina (płaska baza −Y, grzbiet równoległy do Z). */
export function wedgeLocalVertices(w: number, h: number, d: number): Float32Array {
  const hw = w / 2;
  const hh = h / 2;
  const hd = d / 2;
  return new Float32Array([
    -hw, -hh, -hd,
     hw, -hh, -hd,
    -hw, -hh,  hd,
     hw, -hh,  hd,
      0,  hh, -hd,
      0,  hh,  hd,
  ]);
}

export function resolveModuleShape(mod: CastleModule): ModuleShape {
  if (mod.shape) return mod.shape;
  if (mod.type === 'gable') return 'wedge';
  return 'box';
}

export function createWedgeGeometry(w: number, h: number, d: number): THREE.BufferGeometry {
  const v = wedgeLocalVertices(w, h, d);
  // 0 BL-back, 1 BR-back, 2 BL-front, 3 BR-front, 4 apex-back, 5 apex-front
  const indices = [
    0, 1, 3, 0, 3, 2, // base (-Y)
    0, 1, 4, // back gable
    2, 5, 3, // front gable
    0, 2, 5, 0, 5, 4, // left slope
    1, 4, 5, 1, 5, 3, // right slope
  ];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(v, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function createModuleCollider(
  mod: CastleModule,
  mat: { density: number; friction: number; restitution: number },
  isStatic: boolean,
): RAPIER.ColliderDesc {
  const [w, h, d] = mod.size;
  const shape = resolveModuleShape(mod);
  let desc: RAPIER.ColliderDesc | null = null;

  if (shape === 'wedge') {
    desc = RAPIER.ColliderDesc.convexHull(wedgeLocalVertices(w, h, d));
  }
  if (!desc) {
    desc = RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2);
  }

  return desc
    .setDensity(isStatic ? 0 : mat.density)
    .setFriction(mat.friction)
    .setRestitution(mat.restitution);
}

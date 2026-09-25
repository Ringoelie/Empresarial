// Materiales TSL compartidos. Las ventanas se generan en el shader a partir de la
// posición en el mundo: sin texturas, sin coste de memoria y con luces nocturnas.
import * as THREE from 'three/webgpu';
import {
  abs, attribute, float, floor, fract, hash, mix, normalWorld, positionWorld, select, step, uniform, vec3,
} from 'three/tsl';

/** 0 = día, 1 = noche. Compartido por todos los materiales. */
export const nightU = uniform(0);

export function createBuildingMaterial(): THREE.MeshStandardNodeMaterial {
  const mat = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05 });
  const win = attribute<'float'>('win', 'float');
  const n = normalWorld;
  const wp = positionWorld;
  const vertical = step(abs(n.y), float(0.5));
  const h = select(abs(n.x).greaterThan(0.5), wp.z, wp.x);
  const fy = fract(wp.y.div(0.9));
  const fx = fract(h.div(0.75));
  const mask = step(0.3, fy).mul(step(fy, 0.78)).mul(step(0.18, fx)).mul(step(fx, 0.82)).mul(vertical).mul(win);
  const cell = floor(wp.y.div(0.9)).mul(131).add(floor(h.div(0.75).add(500)).mul(17)).add(floor(wp.x.add(wp.z).add(1000).div(4.5)).mul(7));
  const lit = step(0.55, hash(cell));
  mat.colorNode = mix(vec3(1, 1, 1), vec3(0.3, 0.36, 0.46), mask);
  mat.roughnessNode = mix(float(0.85), float(0.25), mask);
  mat.emissiveNode = vec3(1.0, 0.68, 0.32).mul(mask).mul(lit).mul(nightU).mul(0.9);
  return mat;
}

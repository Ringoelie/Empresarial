// Tráfico animado 100% en GPU: cada coche es una instancia cuya posición se calcula
// en el vertex shader a partir del tiempo. Coste de CPU por frame: cero.
import * as THREE from 'three/webgpu';
import {
  float, instancedBufferAttribute, mix, mod, normalGeometry, positionGeometry, select, time, vec3, vec4, abs, max,
} from 'three/tsl';
import { carGeometry } from './models';
import { nightU } from './materials';

const CAR_COLORS = ['#e5e7eb', '#1f2937', '#dc2626', '#2563eb', '#f59e0b', '#10b981', '#9ca3af', '#7c3aed', '#f3f4f6'];

export class Traffic {
  mesh: THREE.InstancedMesh;
  readonly max: number;

  constructor(roadLines: number[], span: number, capacity = 480) {
    const max_ = capacity;
    this.max = capacity;
    const a = new Float32Array(max_ * 4); // eje, línea, carril, velocidad
    const b = new Float32Array(max_ * 4); // fase, r, g, b
    const c = new THREE.Color();
    for (let i = 0; i < max_; i++) {
      const axis = i % 2;
      const line = roadLines[Math.floor(Math.random() * roadLines.length)];
      const lane = Math.random() < 0.5 ? 0.33 : -0.33;
      a.set([axis, line, lane, 2.5 + Math.random() * 3], i * 4);
      c.set(CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)]);
      b.set([Math.random() * span, c.r, c.g, c.b], i * 4);
    }
    const A = instancedBufferAttribute(new THREE.InstancedBufferAttribute(a, 4), 'vec4') as unknown as ReturnType<typeof vec4>;
    const B = instancedBufferAttribute(new THREE.InstancedBufferAttribute(b, 4), 'vec4') as unknown as ReturnType<typeof vec4>;
    const axis = A.x, line = A.y, lane = A.z, speed = A.w;
    const dir = select(lane.greaterThan(0), float(1), float(-1));
    const L = float(span);
    const along = mod(B.x.add(time.mul(speed)), L).sub(L.mul(0.5)).mul(dir);
    const p = positionGeometry;
    const px = p.x.mul(dir), pz = p.z.mul(dir);
    const onX = vec3(along.add(px), p.y, line.add(lane).add(pz));
    const onZ = vec3(line.sub(lane).sub(pz), p.y, along.add(px));
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.positionNode = mix(onX, onZ, axis);
    const shade = float(0.55).add(max(normalGeometry.y, 0).mul(0.4)).add(abs(normalGeometry.x).mul(0.15));
    const day = float(1).sub(nightU.mul(0.72));
    // faros: la cara delantera brilla de noche
    const front = max(normalGeometry.x, 0).mul(nightU).mul(2.5);
    mat.colorNode = vec3(B.y, B.z, B.w).mul(shade).mul(day).add(vec3(1, 0.9, 0.6).mul(front));
    this.mesh = new THREE.InstancedMesh(carGeometry(), mat, max_);
    this.mesh.frustumCulled = false;
    this.mesh.count = 60;
  }

  setDensity(n: number) {
    this.mesh.count = Math.max(0, Math.min(this.max, Math.round(n)));
  }
}

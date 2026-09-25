// Geometrías low-poly procedurales. Cada modelo se fusiona en una sola BufferGeometry
// con color por vértice y un atributo `win` (1 = superficie con ventanas) para dibujarlo
// con un único InstancedMesh por tipo y nivel: muy pocas draw calls.
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { BuildingId } from '../game/data';

const tmpColor = new THREE.Color();

export class GeoBuilder {
  private parts: THREE.BufferGeometry[] = [];

  private add(g: THREE.BufferGeometry, color: THREE.ColorRepresentation, win: number) {
    g.deleteAttribute('uv');
    const n = g.getAttribute('position').count;
    tmpColor.set(color);
    const c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { c[i * 3] = tmpColor.r; c[i * 3 + 1] = tmpColor.g; c[i * 3 + 2] = tmpColor.b; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    g.setAttribute('win', new THREE.BufferAttribute(new Float32Array(n).fill(win), 1));
    if (!g.index) g = mergeable(g);
    this.parts.push(g);
    return this;
  }

  /** Caja apoyada en y (la base está en y). */
  box(w: number, h: number, d: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, win = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y + h / 2, z);
    return this.add(g, color, win);
  }

  cyl(rt: number, rb: number, h: number, seg: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, win = 0) {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg);
    g.translate(x, y + h / 2, z);
    return this.add(g, color, win);
  }

  cone(r: number, h: number, seg: number, x: number, y: number, z: number, color: THREE.ColorRepresentation) {
    const g = new THREE.ConeGeometry(r, h, seg);
    g.translate(x, y + h / 2, z);
    return this.add(g, color, 0);
  }

  dome(r: number, x: number, y: number, z: number, color: THREE.ColorRepresentation) {
    const g = new THREE.SphereGeometry(r, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    g.translate(x, y, z);
    return this.add(g, color, 0);
  }

  build(): THREE.BufferGeometry {
    const g = mergeGeometries(this.parts, false)!;
    for (const p of this.parts) p.dispose();
    this.parts = [];
    g.computeBoundingSphere();
    return g;
  }
}

function mergeable(g: THREE.BufferGeometry) {
  const n = g.getAttribute('position').count;
  const idx = new Uint32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

// Paleta
const CONCRETE = '#c9c4ba';
const LIGHT = '#e8e4dc';
const DARK = '#3b4250';
const ROOF = '#6b7280';
const GLASS = '#8fb3c9';
const WHITE = '#f4f4f2';
const METAL = '#9aa3ad';
const GRASS = '#5f9e4f';
const TREE = '#3f7d3a';
const TRUNK = '#6b4f35';
const WATER = '#4b9fd6';

function tree(g: GeoBuilder, x: number, z: number, s = 1) {
  g.cyl(0.08 * s, 0.1 * s, 0.5 * s, 5, x, 0, z, TRUNK);
  g.cone(0.45 * s, 1.1 * s, 6, x, 0.4 * s, z, TREE);
}

/** Modelo de un edificio del jugador. `accent` es el color corporativo. */
export function buildingGeometry(type: BuildingId, level: number, accent: string): THREE.BufferGeometry {
  const g = new GeoBuilder();
  const L = level;
  switch (type) {
    case 'garage': {
      g.box(4.2, 0.08, 4.2, 0, 0, 0, '#8d8a84');
      g.box(3, 2.2, 3.2, -0.3, 0.08, 0, '#d9c7a7', 0);
      g.box(3.2, 0.25, 3.4, -0.3, 2.28, 0, '#8b5e3c');
      g.box(0.08, 1.5, 2.2, 1.23, 0.08, 0, '#9ca3af');
      g.box(0.1, 0.35, 1.2, 1.25, 1.75, 0, accent);
      g.box(0.9, 0.5, 0.6, 1.6, 0.08, 1.2, '#4b5563');
      break;
    }
    case 'office': {
      const floors = [4, 8, 14][L];
      const w = [3.2, 3.4, 3.2][L];
      g.box(4.4, 0.1, 4.4, 0, 0, 0, CONCRETE);
      g.box(w, floors * 0.9, w, 0, 0.1, 0, L === 2 ? '#7e98ad' : LIGHT, 1);
      g.box(w + 0.2, 0.25, w + 0.2, 0, 0.1 + floors * 0.9, 0, DARK);
      g.box(w * 0.5, 0.6, w * 0.5, 0, 0.35 + floors * 0.9, 0, METAL);
      g.box(0.15, floors * 0.9, 0.5, w / 2 + 0.02, 0.1, 0, accent);
      if (L >= 1) g.box(w * 0.8, 1.2, 1.2, 0, 0.1, w / 2 + 0.5, WHITE, 1);
      if (L === 2) g.cyl(0.05, 0.05, 2, 4, 0, 0.95 + floors * 0.9, 0, METAL);
      break;
    }
    case 'factory': {
      const len = [3.6, 4.2, 4.3][L];
      g.box(4.4, 0.1, 4.4, 0, 0, 0, '#9d9a92');
      g.box(len, 1.8 + L * 0.6, 2.6, 0, 0.1, -0.6, '#b7a78f', 1);
      // tejado en diente de sierra
      for (let i = 0; i < 3 + L; i++) {
        const x = -len / 2 + (i + 0.5) * (len / (3 + L));
        g.box(len / (3 + L) * 0.9, 0.5, 2.6, x, 1.9 + L * 0.6, -0.6, i % 2 ? ROOF : '#7c8591');
      }
      g.box(len, 0.3, 0.1, 0, 1.3 + L * 0.6, 0.72, accent);
      for (let i = 0; i <= L; i++) g.cyl(0.22, 0.3, 3.5 + L * 1.2, 8, 1.3 - i * 0.9, 0.1, 1.2, '#8a8f98');
      if (L >= 1) g.cyl(0.7, 0.7, 2.2, 10, -1.2, 0.1, 1.3, WHITE);
      if (L >= 2) g.box(1.4, 3.5, 1.3, 1.4, 0.1, -0.5, '#a8a29e', 1);
      break;
    }
    case 'store': {
      const floors = [1, 2, 3][L];
      const w = [3.4, 3.8, 4.2][L];
      g.box(4.4, 0.1, 4.4, 0, 0, 0, CONCRETE);
      g.box(w, floors * 1.4, w * 0.8, 0, 0.1, -0.2, '#efe6d8', 1);
      g.box(w + 0.1, 0.18, 0.9, 0, 1.1, w * 0.4 + 0.1, accent);
      g.box(w * 0.7, 0.9, 0.06, 0, 0.1, w * 0.4 - 0.18, GLASS);
      g.box(w * 0.6, 0.45, 0.12, 0, 0.1 + floors * 1.4, w * 0.3, accent);
      if (L === 2) g.box(w * 0.6, 0.8, w * 0.5, 0, 0.1 + floors * 1.4, -0.4, GLASS);
      break;
    }
    case 'warehouse': {
      const len = [3.4, 4.0, 4.3][L];
      const h = [1.8, 2.4, 3.2][L];
      g.box(4.4, 0.1, 4.4, 0, 0, 0, '#9d9a92');
      g.box(len, h, 3, 0, 0.1, -0.3, '#c2b59b');
      for (let i = 0; i < 5; i++) g.box(len + 0.05, 0.06, 3.05, 0, 0.1 + (h / 5) * i + 0.2, -0.3, '#a89c84');
      g.box(len + 0.2, 0.2, 3.2, 0, 0.1 + h, -0.3, ROOF);
      for (let i = 0; i < 2 + L; i++) g.box(0.8, h * 0.6, 0.06, -len / 2 + 0.7 + i * 1.1, 0.1, 1.22, '#6b7280');
      g.box(0.8, 0.5, 0.5, 1.4, 0.1, 1.7, accent);
      g.box(0.5, 0.5, 0.5, 0.6, 0.1, 1.8, '#d97706');
      break;
    }
    case 'lab': {
      const h = [1.8, 3.2, 5][L];
      g.box(4.4, 0.1, 4.4, 0, 0, 0, CONCRETE);
      g.box(3.4, h, 2.6, 0, 0.1, -0.4, WHITE, 1);
      g.box(3.5, 0.2, 2.7, 0, 0.1 + h, -0.4, accent);
      g.dome(0.9 + L * 0.2, 0.6, 0.3 + h, -0.4, '#dbe4ec');
      g.cyl(0.05, 0.05, 1.5, 4, -1.2, 0.3 + h, -1, METAL);
      if (L >= 1) g.box(1.6, h * 0.6, 1.2, -0.8, 0.1, 1.4, GLASS, 1);
      break;
    }
    case 'marketing': {
      const h = [2.2, 4.5, 7.5][L];
      g.box(4.4, 0.1, 4.4, 0, 0, 0, CONCRETE);
      g.box(2.8, h, 2.8, -0.3, 0.1, -0.3, '#e4dcf0', 1);
      g.box(0.12, 1.6 + L * 0.4, 3.2 + L * 0.3, 1.35, h - 0.2, -0.3, accent);
      g.box(0.1, 1.4 + L * 0.4, 3 + L * 0.3, 1.43, h - 0.1, -0.3, WHITE);
      g.cyl(0.08, 0.08, h, 4, 1.35, 0.1, -1.6, METAL);
      break;
    }
    case 'datacenter': {
      const n = L + 1;
      g.box(4.4, 0.1, 4.4, 0, 0, 0, '#8b8f96');
      for (let i = 0; i < Math.min(n, 3); i++) {
        g.box(3.8, 1.6 + L * 0.3, 1.1, 0, 0.1, -1.4 + i * 1.35, '#2f3542', 1);
        g.box(3.8, 0.08, 0.2, 0, 1.4 + L * 0.3, -0.87 + i * 1.35, accent);
        g.cyl(0.25, 0.25, 0.25, 8, -1.2, 1.7 + L * 0.3, -1.4 + i * 1.35, METAL);
        g.cyl(0.25, 0.25, 0.25, 8, 0, 1.7 + L * 0.3, -1.4 + i * 1.35, METAL);
        g.cyl(0.25, 0.25, 0.25, 8, 1.2, 1.7 + L * 0.3, -1.4 + i * 1.35, METAL);
      }
      break;
    }
    case 'hq': {
      const h = [9, 16, 25, 36][L];
      const w = [3.2, 3.3, 3.4, 3.5][L];
      g.box(4.5, 0.15, 4.5, 0, 0, 0, '#d6d3cc');
      g.box(4.2, 1.6, 4.2, 0, 0.15, 0, '#2d3748', 1);
      g.box(w, h * 0.55, w, 0, 1.75, 0, '#5b7a94', 1);
      g.box(w * 0.78, h * 0.3, w * 0.78, 0, 1.75 + h * 0.55, 0, '#6d8aa3', 1);
      g.box(w * 0.55, h * 0.15, w * 0.55, 0, 1.75 + h * 0.85, 0, '#7f9bb3', 1);
      g.box(w + 0.05, 0.3, 0.06, 0, 1.75 + h * 0.55 - 0.6, w / 2 + 0.01, accent);
      g.box(0.06, 0.3, w + 0.05, w / 2 + 0.01, 1.75 + h * 0.55 - 0.6, 0, accent);
      g.cyl(0.04, 0.12, 2 + L, 6, 0, 1.75 + h, 0, METAL);
      g.cyl(0.18, 0.18, 0.18, 8, 0, 3.75 + h + L, 0, accent);
      break;
    }
    case 'park': {
      g.box(4.4, 0.12, 4.4, 0, 0, 0, GRASS);
      g.cyl(0.9, 0.9, 0.05, 16, 0.8, 0.12, 0.8, WATER);
      g.box(3.6, 0.03, 0.5, 0, 0.12, -0.6, '#d6c9a8');
      g.box(0.5, 0.03, 2, -0.6, 0.12, 0.8, '#d6c9a8');
      for (const [x, z, s] of [[-1.5, -1.6, 1], [1.4, -1.5, 1.2], [-1.6, 1.4, 0.9], [-1.5, 0.2, 1.1], [1.7, 0.3, 0.8], [0.2, 1.8, 1]]) tree(g, x, z, s);
      break;
    }
  }
  return g.build();
}

/** Caja genérica (1x1x1 con base en y=0) para edificios de la ciudad ajena. */
export function unitBoxGeometry(): THREE.BufferGeometry {
  const g = new GeoBuilder();
  g.box(1, 1, 1, 0, 0, 0, '#ffffff', 1);
  // cornisa
  g.box(1.04, 0.03, 1.04, 0, 1, 0, '#bfbfbf', 0);
  return g.build();
}

export function treeGeometry(): THREE.BufferGeometry {
  const g = new GeoBuilder();
  tree(g, 0, 0, 1);
  return g.build();
}

export function carGeometry(): THREE.BufferGeometry {
  const g = new GeoBuilder();
  g.box(0.9, 0.28, 0.42, 0, 0.08, 0, '#ffffff');
  g.box(0.5, 0.22, 0.38, -0.05, 0.36, 0, '#9fb7c7');
  return g.build();
}

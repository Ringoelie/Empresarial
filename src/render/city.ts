// Vista de ciudad: parcelas, edificios instanciados, tráfico, ciclo día/noche.
import * as THREE from 'three/webgpu';
import { float, max, abs, uv, time, sin, uniform, color as tslColor } from 'three/tsl';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { GRID, BuildingId } from '../game/data';
import type { GameState, Building } from '../game/state';
import { buildingGeometry, unitBoxGeometry, treeGeometry } from './models';
import { createBuildingMaterial, nightU } from './materials';
import { Traffic } from './traffic';
import type { View } from './engine';

export const PITCH = 6;
export const PLOT = 4.6;
export const HALF = (GRID * PITCH) / 2;
const CYCLE = 300; // segundos reales por ciclo día/noche

export function plotCenter(i: number) {
  const x = i % GRID, z = Math.floor(i / GRID);
  return { x: (x - (GRID - 1) / 2) * PITCH, z: (z - (GRID - 1) / 2) * PITCH };
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NEUTRAL_COLORS = ['#b8b2a7', '#a9b4bf', '#c9bfae', '#9aa5b1', '#d2cbc0', '#b0a79a', '#8f9aa6', '#c4b7a6'];
const SKY_DAY = new THREE.Color('#a8cbe8');
const SKY_DUSK = new THREE.Color('#f2a97e');
const SKY_NIGHT = new THREE.Color('#0c1528');

interface NeutralBox { x: number; z: number; w: number; d: number; h: number; color: THREE.Color }
interface Slot { key: string; index: number }

export class CityView implements View {
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  controls: MapControls;
  onPlotClick: (plot: number | null) => void = () => {};
  onPlotHover: (plot: number | null, x: number, y: number) => void = () => {};

  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private buildingMat = createBuildingMaterial();
  private plotTiles: THREE.InstancedMesh;
  private neutral: THREE.InstancedMesh;
  private neutralBoxes: NeutralBox[][] = [];
  private meshes = new Map<string, THREE.InstancedMesh>();
  private slots = new Map<number, Slot>();
  private seen = new Map<number, string>(); // id -> tipo:nivel ya visto
  private anims = new Map<number, number>(); // id -> inicio
  private hoverMark: THREE.Mesh;
  private selectMark: THREE.Mesh;
  private ghost: THREE.Mesh;
  private ghostMat: THREE.MeshStandardNodeMaterial;
  private ghostColor = uniform(new THREE.Color('#22c55e'));
  private traffic: Traffic;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private downAt = { x: 0, y: 0, t: 0 };
  private keys = new Set<string>();
  private accent: string;
  private clock = 0;
  private cycle = 0.18;
  dayNight = true;
  hovered: number | null = null;
  selected: number | null = null;
  buildMode: BuildingId | null = null;
  private state: GameState | null = null;
  private dom: HTMLElement;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private sc = new THREE.Vector3();

  constructor(dom: HTMLElement, accent: string) {
    this.dom = dom;
    this.accent = accent;
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 600);
    this.camera.position.set(20, 26, 30);
    this.controls = new MapControls(this.camera, dom);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = 1.3;
    this.controls.minDistance = 12;
    this.controls.maxDistance = 150;
    this.controls.target.set(0, 0, 0);
    this.controls.zoomToCursor = true;
    this.controls.update();

    this.scene.background = SKY_DAY.clone();
    this.scene.fog = new THREE.Fog(SKY_DAY.clone(), 120, 320);

    this.hemi = new THREE.HemisphereLight('#dbeafe', '#6b705c', 1.1);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff4e0', 2.6);
    this.sun.castShadow = true;
    const cam = this.sun.shadow.camera;
    cam.left = -HALF - 12; cam.right = HALF + 12; cam.top = HALF + 12; cam.bottom = -HALF - 12;
    cam.near = 1; cam.far = 260;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target);

    this.buildGround();
    this.plotTiles = this.buildPlots();
    this.neutral = this.buildNeutral();
    this.buildOutskirts();

    const roadLines: number[] = [];
    for (let k = 0; k <= GRID; k++) roadLines.push((k - GRID / 2) * PITCH);
    this.traffic = new Traffic(roadLines, GRID * PITCH + PITCH);
    this.scene.add(this.traffic.mesh);

    this.hoverMark = this.makeMarker('#ffffff', 0.9);
    this.selectMark = this.makeMarker(accent, 1.0);
    this.ghostMat = new THREE.MeshStandardNodeMaterial({ transparent: true, opacity: 0.55, depthWrite: false });
    this.ghostMat.colorNode = this.ghostColor;
    this.ghostMat.emissiveNode = this.ghostColor.mul(0.35);
    this.ghost = new THREE.Mesh(buildingGeometry('factory', 0, accent), this.ghostMat);
    this.ghost.userData.key = 'ghost:factory';
    this.ghost.visible = false;
    this.scene.add(this.ghost);

    this.bindInput();
  }

  // ------------------------------------------------------------------ escena estática

  private buildGround() {
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardNodeMaterial({ color: '#7a9a5e', roughness: 1 }));
    grass.rotation.x = -Math.PI / 2;
    grass.receiveShadow = true;
    this.scene.add(grass);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(GRID * PITCH + PITCH * 0.5, GRID * PITCH + PITCH * 0.5), new THREE.MeshStandardNodeMaterial({ color: '#3d4047', roughness: 0.95 }));
    road.rotation.x = -Math.PI / 2;
    road.position.y = 0.01;
    road.receiveShadow = true;
    this.scene.add(road);

    // marcas viales: un único InstancedMesh
    const dashes: THREE.Vector3[] = [];
    for (let k = 0; k <= GRID; k++) {
      const line = (k - GRID / 2) * PITCH;
      for (let s = -HALF; s <= HALF; s += 1.5) {
        const nearCross = Math.abs(((s + HALF) % PITCH + PITCH) % PITCH - 0) < 1.2 || Math.abs(((s + HALF) % PITCH) - PITCH) < 1.2;
        if (nearCross) continue;
        dashes.push(new THREE.Vector3(s, 0, line), new THREE.Vector3(line, 1, s));
      }
    }
    const dashMat = new THREE.MeshBasicNodeMaterial({ color: '#e7e2c8' });
    const dashGeo = new THREE.PlaneGeometry(0.7, 0.09);
    dashGeo.rotateX(-Math.PI / 2);
    const dm = new THREE.InstancedMesh(dashGeo, dashMat, dashes.length);
    dashes.forEach((d, i) => {
      this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), d.y ? Math.PI / 2 : 0);
      this.m.compose(this.v.set(d.x, 0.025, d.z), this.q, this.sc.set(1, 1, 1));
      dm.setMatrixAt(i, this.m);
    });
    this.scene.add(dm);
  }

  private buildPlots(): THREE.InstancedMesh {
    const n = GRID * GRID;
    const side = new THREE.InstancedMesh(new THREE.BoxGeometry(PLOT + 0.8, 0.14, PLOT + 0.8), new THREE.MeshStandardNodeMaterial({ color: '#cfcac0', roughness: 0.9 }), n);
    const tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(PLOT, 0.2, PLOT), new THREE.MeshStandardNodeMaterial({ roughness: 1 }), n);
    for (let i = 0; i < n; i++) {
      const c = plotCenter(i);
      this.m.makeTranslation(c.x, 0.07, c.z);
      side.setMatrixAt(i, this.m);
      this.m.makeTranslation(c.x, 0.1, c.z);
      tiles.setMatrixAt(i, this.m);
      tiles.setColorAt(i, new THREE.Color('#a9a79f'));
    }
    side.receiveShadow = true;
    tiles.receiveShadow = true;
    this.scene.add(side, tiles);
    return tiles;
  }

  private buildNeutral(): THREE.InstancedMesh {
    const n = GRID * GRID;
    const cc = (GRID - 1) / 2;
    for (let i = 0; i < n; i++) {
      const r = rng(i * 7919 + 17);
      const x = i % GRID, z = Math.floor(i / GRID);
      const d = Math.hypot(x - cc, z - cc) / (GRID / 2);
      const tall = Math.max(0.15, 1 - d);
      const boxes: NeutralBox[] = [];
      const c = plotCenter(i);
      const count = r() < 0.5 ? 1 : 2;
      for (let k = 0; k < count; k++) {
        const w = count === 1 ? 2.6 + r() * 1.6 : 1.6 + r() * 0.6;
        const dd = count === 1 ? 2.6 + r() * 1.6 : 3 + r() * 1.2;
        const ox = count === 1 ? (r() - 0.5) * (PLOT - w) : (k === 0 ? -1 : 1) * (PLOT / 4);
        const oz = count === 1 ? (r() - 0.5) * (PLOT - dd) : (r() - 0.5) * (PLOT - dd);
        const h = 1.2 + r() * 2.5 + tall * tall * r() * 9;
        boxes.push({ x: c.x + ox, z: c.z + oz, w, d: dd, h, color: new THREE.Color(NEUTRAL_COLORS[Math.floor(r() * NEUTRAL_COLORS.length)]) });
      }
      this.neutralBoxes.push(boxes);
    }
    const mesh = new THREE.InstancedMesh(unitBoxGeometry(), this.buildingMat, n * 2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.count = 0;
    this.scene.add(mesh);
    return mesh;
  }

  private buildOutskirts() {
    const r = rng(99);
    const blocks: NeutralBox[] = [];
    const trees: THREE.Vector3[] = [];
    for (let i = 0; i < 520; i++) {
      const a = r() * Math.PI * 2;
      const dist = HALF + 6 + r() * 70;
      const x = Math.cos(a) * dist * 1.1, z = Math.sin(a) * dist * 1.1;
      if (Math.abs(x) < HALF + 3 && Math.abs(z) < HALF + 3) continue;
      if (r() < 0.35) blocks.push({ x, z, w: 2 + r() * 3, d: 2 + r() * 3, h: 1 + r() * 6 * Math.max(0.2, 1 - (dist - HALF) / 70), color: new THREE.Color(NEUTRAL_COLORS[Math.floor(r() * NEUTRAL_COLORS.length)]) });
      else trees.push(new THREE.Vector3(x, 0.6 + r() * 0.9, z));
    }
    const bm = new THREE.InstancedMesh(unitBoxGeometry(), this.buildingMat, blocks.length);
    blocks.forEach((b, i) => {
      this.m.compose(this.v.set(b.x, 0, b.z), this.q.identity(), this.sc.set(b.w, b.h, b.d));
      bm.setMatrixAt(i, this.m);
      bm.setColorAt(i, b.color);
    });
    const tm = new THREE.InstancedMesh(treeGeometry(), this.buildingMat, trees.length);
    trees.forEach((t, i) => {
      this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.x);
      this.m.compose(this.v.set(t.x, 0, t.z), this.q, this.sc.setScalar(t.y));
      tm.setMatrixAt(i, this.m);
    });
    tm.castShadow = true;
    this.scene.add(bm, tm);
  }

  private makeMarker(col: string, strength: number): THREE.Mesh {
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
    const e = max(abs(uv().x.sub(0.5)), abs(uv().y.sub(0.5))).mul(2);
    const border = e.smoothstep(float(0.86), float(0.95));
    const pulse = sin(time.mul(4)).mul(0.15).add(0.85);
    mat.colorNode = tslColor(col);
    mat.opacityNode = border.mul(pulse).mul(strength).add(float(0.12).mul(strength));
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(PLOT + 0.5, PLOT + 0.5), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.24;
    mesh.visible = false;
    mesh.renderOrder = 2;
    this.scene.add(mesh);
    return mesh;
  }

  // ------------------------------------------------------------------ sincronización con el estado

  private meshFor(type: BuildingId, level: number): THREE.InstancedMesh {
    const key = `${type}:${level}`;
    let mesh = this.meshes.get(key);
    if (!mesh) {
      mesh = new THREE.InstancedMesh(buildingGeometry(type, level, this.accent), this.buildingMat, GRID * GRID);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.count = 0;
      mesh.frustumCulled = false;
      this.meshes.set(key, mesh);
      this.scene.add(mesh);
    }
    return mesh;
  }

  sync(s: GameState, animate = true) {
    this.state = s;
    const byPlot = new Map<number, Building>();
    for (const b of s.buildings) byPlot.set(b.plot, b);

    // parcelas
    const tmp = new THREE.Color();
    for (let i = 0; i < GRID * GRID; i++) {
      const b = byPlot.get(i);
      tmp.set(!s.owned[i] ? '#a9a79f' : b ? (b.type === 'park' ? '#6fa05a' : '#bdb8ad') : '#86b86f');
      this.plotTiles.setColorAt(i, tmp);
    }
    this.plotTiles.instanceColor!.needsUpdate = true;

    // ciudad ajena: sólo en parcelas que no son tuyas
    let n = 0;
    for (let i = 0; i < GRID * GRID; i++) {
      if (s.owned[i]) continue;
      for (const b of this.neutralBoxes[i]) {
        this.m.compose(this.v.set(b.x, 0.2, b.z), this.q.identity(), this.sc.set(b.w, b.h, b.d));
        this.neutral.setMatrixAt(n, this.m);
        this.neutral.setColorAt(n, b.color);
        n++;
      }
    }
    this.neutral.count = n;
    this.neutral.instanceMatrix.needsUpdate = true;
    if (this.neutral.instanceColor) this.neutral.instanceColor.needsUpdate = true;

    // edificios propios
    for (const mesh of this.meshes.values()) mesh.count = 0;
    this.slots.clear();
    const now = this.clock;
    for (const b of s.buildings) {
      const key = `${b.type}:${b.level}`;
      const mesh = this.meshFor(b.type, b.level);
      const index = mesh.count++;
      this.slots.set(b.id, { key, index });
      const prev = this.seen.get(b.id);
      if (animate && prev !== key) this.anims.set(b.id, now);
      this.seen.set(b.id, key);
      this.writeMatrix(b, mesh, index, this.anims.has(b.id) ? 0.02 : 1);
    }
    for (const id of [...this.seen.keys()]) if (!this.slots.has(id)) this.seen.delete(id);
    for (const mesh of this.meshes.values()) {
      mesh.visible = mesh.count > 0;
      mesh.instanceMatrix.needsUpdate = true;
    }

    // tráfico según tamaño de la empresa
    this.traffic.setDensity(70 + s.stage * 60 + s.buildings.length * 1.5);
    this.updateMarkers();
  }

  private writeMatrix(b: Building, mesh: THREE.InstancedMesh, index: number, sy: number) {
    const c = plotCenter(b.plot);
    const rot = ((b.plot * 2654435761) >>> 0) % 4;
    this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (rot * Math.PI) / 2);
    this.m.compose(this.v.set(c.x, 0.2, c.z), this.q, this.sc.set(1, sy, 1));
    mesh.setMatrixAt(index, this.m);
  }

  private updateMarkers() {
    const show = (mark: THREE.Mesh, plot: number | null) => {
      mark.visible = plot !== null;
      if (plot !== null) {
        const c = plotCenter(plot);
        mark.position.set(c.x, 0.24, c.z);
      }
    };
    show(this.hoverMark, this.hovered);
    show(this.selectMark, this.selected);
    // fantasma de construcción
    const s = this.state;
    if (this.buildMode && this.hovered !== null && s) {
      const key = `ghost:${this.buildMode}`;
      if (this.ghost.userData.key !== key) {
        this.ghost.geometry.dispose();
        this.ghost.geometry = buildingGeometry(this.buildMode, 0, this.accent);
        this.ghost.userData.key = key;
      }
      const ok = s.owned[this.hovered] && !s.buildings.some((b) => b.plot === this.hovered);
      this.ghostColor.value.set(ok ? '#22c55e' : '#ef4444');
      const c = plotCenter(this.hovered);
      this.ghost.position.set(c.x, 0.22, c.z);
      this.ghost.visible = true;
    } else this.ghost.visible = false;
  }

  setSelected(plot: number | null) {
    this.selected = plot;
    this.updateMarkers();
  }

  setBuildMode(t: BuildingId | null) {
    this.buildMode = t;
    this.updateMarkers();
  }

  private rotateAround(a: number) {
    const t = this.controls.target;
    const off = this.camera.position.clone().sub(t).applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
    this.camera.position.copy(t).add(off);
  }

  focusPlot(plot: number) {
    const c = plotCenter(plot);
    const d = new THREE.Vector3().subVectors(this.camera.position, this.controls.target);
    this.controls.target.set(c.x, 0, c.z);
    this.camera.position.copy(this.controls.target).add(d);
  }

  // ------------------------------------------------------------------ entrada

  private pick(ev: PointerEvent): number | null {
    const rect = this.dom.getBoundingClientRect();
    this.pointer.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) return null;
    const gx = Math.floor((hit.x + HALF) / PITCH);
    const gz = Math.floor((hit.z + HALF) / PITCH);
    if (gx < 0 || gz < 0 || gx >= GRID || gz >= GRID) return null;
    const i = gz * GRID + gx;
    const c = plotCenter(i);
    if (Math.abs(hit.x - c.x) > PLOT / 2 + 0.4 || Math.abs(hit.z - c.z) > PLOT / 2 + 0.4) return null;
    return i;
  }

  private bindInput() {
    const el = this.dom;
    el.addEventListener('pointermove', (ev) => {
      if (!this.active) return;
      const p = ev.pointerType === 'mouse' ? this.pick(ev) : null;
      if (p !== this.hovered) {
        this.hovered = p;
        this.updateMarkers();
      }
      this.onPlotHover(p, ev.clientX, ev.clientY);
    });
    el.addEventListener('pointerleave', () => {
      this.hovered = null;
      this.updateMarkers();
      this.onPlotHover(null, 0, 0);
    });
    el.addEventListener('pointerdown', (ev) => { this.downAt = { x: ev.clientX, y: ev.clientY, t: performance.now() }; });
    el.addEventListener('pointerup', (ev) => {
      if (!this.active || ev.button !== 0) return;
      const moved = Math.hypot(ev.clientX - this.downAt.x, ev.clientY - this.downAt.y);
      if (moved > 6 || performance.now() - this.downAt.t > 600) return;
      const p = this.pick(ev);
      if (ev.pointerType !== 'mouse') { this.hovered = p; this.updateMarkers(); }
      this.onPlotClick(p);
    });
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      this.keys.add(e.key.toLowerCase());
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }

  // ------------------------------------------------------------------ View

  active = false;

  activate() { this.active = true; this.controls.enabled = true; }
  deactivate() { this.active = false; this.controls.enabled = false; this.hovered = null; this.updateMarkers(); }

  setShadows(on: boolean, size: number) {
    this.sun.castShadow = on;
    this.sun.shadow.mapSize.set(size, size);
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null as never; }
  }

  resize(w: number, h: number) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  update(dt: number) {
    this.clock += dt;
    // movimiento con teclado (WASD / flechas las gestiona MapControls)
    if (this.active && this.keys.size) {
      const f = new THREE.Vector3();
      this.camera.getWorldDirection(f);
      f.y = 0; f.normalize();
      const r = new THREE.Vector3(-f.z, 0, f.x);
      const sp = dt * (20 + this.camera.position.distanceTo(this.controls.target) * 0.6);
      const mv = new THREE.Vector3();
      if (this.keys.has('w')) mv.add(f);
      if (this.keys.has('s')) mv.sub(f);
      if (this.keys.has('d')) mv.add(r);
      if (this.keys.has('a')) mv.sub(r);
      if (this.keys.has('q')) this.rotateAround(dt * 1.2);
      if (this.keys.has('e')) this.rotateAround(-dt * 1.2);
      if (mv.lengthSq() > 0) {
        mv.normalize().multiplyScalar(sp);
        this.controls.target.add(mv);
        this.camera.position.add(mv);
      }
    }
    // límites de la cámara
    const t = this.controls.target;
    const lim = HALF + 10;
    const cx = THREE.MathUtils.clamp(t.x, -lim, lim), cz = THREE.MathUtils.clamp(t.z, -lim, lim);
    if (cx !== t.x || cz !== t.z) {
      this.camera.position.x += cx - t.x; this.camera.position.z += cz - t.z;
      t.x = cx; t.z = cz;
    }
    this.controls.update();

    // animaciones de construcción
    if (this.anims.size && this.state) {
      for (const [id, start] of this.anims) {
        const slot = this.slots.get(id);
        const b = this.state.buildings.find((x) => x.id === id);
        if (!slot || !b) { this.anims.delete(id); continue; }
        const k = Math.min(1, (this.clock - start) / 0.9);
        const e = 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2); // ease-out-back
        const mesh = this.meshes.get(slot.key)!;
        this.writeMatrix(b, mesh, slot.index, Math.max(0.02, e));
        mesh.instanceMatrix.needsUpdate = true;
        if (k >= 1) this.anims.delete(id);
      }
    }

    // ciclo día/noche
    if (this.dayNight) this.cycle = (this.cycle + dt / CYCLE) % 1;
    else this.cycle = 0.18;
    const ang = this.cycle * Math.PI * 2;
    const elev = Math.sin(ang);
    const night = THREE.MathUtils.smoothstep(-elev, -0.05, 0.22);
    const dusk = Math.max(0, 1 - Math.abs(elev) / 0.3) * (1 - night * 0.6);
    nightU.value = night;
    const sky = this.scene.background as THREE.Color;
    sky.copy(SKY_DAY).lerp(SKY_DUSK, dusk * 0.8).lerp(SKY_NIGHT, night);
    (this.scene.fog as THREE.Fog).color.copy(sky);
    const sunDir = new THREE.Vector3(Math.cos(ang) * 70, Math.max(0.12, elev) * 90, 35);
    if (night > 0.5) sunDir.set(-Math.cos(ang) * 60, Math.max(0.3, -elev) * 80, -30); // luna
    this.sun.position.copy(t).add(sunDir);
    this.sun.target.position.copy(t);
    this.sun.intensity = THREE.MathUtils.lerp(2.7, 0.35, night);
    this.sun.color.set(night > 0.5 ? '#9fb4ff' : '#fff1dc').lerp(new THREE.Color('#ffb070'), dusk * 0.6);
    this.hemi.intensity = THREE.MathUtils.lerp(1.15, 0.45, night);
  }
}

// Vista mundial: globo de puntos instanciados, mercados y rutas comerciales animadas.
import * as THREE from 'three/webgpu';
import {
  color as tslColor, float, fract, normalView, positionView, pow, smoothstep, time, uv, dot, normalize, vec3, uniform, length,
} from 'three/tsl';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import landDots from '../data/land-dots.json';
import { COUNTRIES, COUNTRY_BY_ID } from '../game/data';
import type { GameState } from '../game/state';
import type { View } from './engine';

const R = 10;

export function latLonToVec(lat: number, lon: number, r = R): THREE.Vector3 {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon + 180);
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
}

/** Arco sobre el círculo máximo entre dos puntos, elevado en el centro. */
class GreatArc extends THREE.Curve<THREE.Vector3> {
  private q = new THREE.Quaternion();
  private qa = new THREE.Quaternion();
  constructor(private a: THREE.Vector3, b: THREE.Vector3, private h: number) {
    super();
    this.q.setFromUnitVectors(a, b);
  }
  getPoint(t: number, target = new THREE.Vector3()) {
    this.qa.identity().slerp(this.q, t);
    return target.copy(this.a).applyQuaternion(this.qa).multiplyScalar(R + 0.05 + Math.sin(Math.PI * t) * this.h);
  }
}

export class WorldView implements View {
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  onCountryClick: (id: string | null) => void = () => {};
  onCountryHover: (id: string | null, x: number, y: number) => void = () => {};
  active = false;

  private markers: THREE.InstancedMesh;
  private arcs: THREE.Mesh;
  private arcMat: THREE.MeshBasicNodeMaterial;
  private ring: THREE.Mesh;
  private glow: THREE.Mesh;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private dom: HTMLElement;
  private downAt = { x: 0, y: 0 };
  private accent: THREE.Color;
  private idle = 0;
  selected: string | null = null;

  constructor(dom: HTMLElement, accent: string) {
    this.dom = dom;
    this.accent = new THREE.Color(accent);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 500);
    this.controls = new OrbitControls(this.camera, dom);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.minDistance = 14;
    this.controls.maxDistance = 60;
    this.controls.rotateSpeed = 0.6;
    this.controls.enabled = false;
    this.scene.background = new THREE.Color('#050b18');

    this.scene.add(new THREE.AmbientLight('#8fa6d8', 0.9));
    const sun = new THREE.DirectionalLight('#ffffff', 2.2);
    sun.position.set(30, 20, 25);
    this.scene.add(sun);

    // océano con borde de Fresnel
    const oceanMat = new THREE.MeshStandardNodeMaterial({ color: '#0f2a4d', roughness: 0.55, metalness: 0.1 });
    const fres = pow(float(1).sub(dot(normalView, normalize(positionView).negate()).clamp()), 3);
    oceanMat.emissiveNode = tslColor('#3b82f6').mul(fres).mul(0.9);
    this.scene.add(new THREE.Mesh(new THREE.SphereGeometry(R, 64, 48), oceanMat));

    // halo atmosférico (billboard detrás del globo)
    const glowMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const d = length(uv().sub(0.5)).mul(2);
    const edge = R / (R * 1.35);
    glowMat.colorNode = tslColor('#60a5fa');
    glowMat.opacityNode = smoothstep(float(1), float(edge * 0.98), d).mul(smoothstep(float(edge * 0.9), float(edge), d)).mul(0.55);
    this.glow = new THREE.Mesh(new THREE.PlaneGeometry(R * 2.7, R * 2.7), glowMat);
    this.glow.renderOrder = -1;
    this.scene.add(this.glow);

    // continentes: ~4.600 puntos en un solo draw call
    const n = landDots.length / 2;
    const dotGeo = new THREE.CircleGeometry(0.075, 6);
    const dotMat = new THREE.MeshBasicNodeMaterial({ color: '#9fb6d6' });
    const dots = new THREE.InstancedMesh(dotGeo, dotMat, n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), z = new THREE.Vector3(0, 0, 1);
    const col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const lat = landDots[i * 2], lon = landDots[i * 2 + 1];
      const p = latLonToVec(lat, lon, R + 0.02);
      q.setFromUnitVectors(z, p.clone().normalize());
      m.compose(p, q, s);
      dots.setMatrixAt(i, m);
      col.setHSL(0.6, 0.25, 0.55 + Math.abs(lat) / 400);
      dots.setColorAt(i, col);
    }
    this.scene.add(dots);

    // marcadores de países
    const pillar = new THREE.CylinderGeometry(0.13, 0.13, 1, 10);
    pillar.translate(0, 0.5, 0);
    pillar.rotateX(Math.PI / 2); // eje Z hacia fuera
    const markerMat = new THREE.MeshBasicNodeMaterial();
    markerMat.colorNode = vec3(0.6, 0.6, 0.6).add(normalView.z.max(0).mul(0.45));
    this.markers = new THREE.InstancedMesh(pillar, markerMat, COUNTRIES.length);
    this.markers.setColorAt(0, new THREE.Color('#fff'));
    this.scene.add(this.markers);

    const ringMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
    const rr = length(uv().sub(0.5)).mul(2);
    ringMat.colorNode = uniform(new THREE.Color('#fde047'));
    ringMat.opacityNode = smoothstep(float(0.6), float(0.8), rr).mul(smoothstep(float(1), float(0.85), rr)).mul(fract(time.mul(-0.8)).add(0.3));
    this.ring = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), ringMat);
    this.ring.visible = false;
    this.scene.add(this.ring);

    this.arcMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const dash = smoothstep(float(0.0), float(0.25), fract(uv().x.mul(5).sub(time.mul(0.7))));
    this.arcMat.colorNode = uniform(this.accent.clone().lerp(new THREE.Color('#ffffff'), 0.35));
    this.arcMat.opacityNode = dash.mul(0.8).add(0.15);
    this.arcs = new THREE.Mesh(new THREE.BufferGeometry(), this.arcMat);
    this.arcs.visible = false;
    this.scene.add(this.arcs);

    this.camera.position.copy(latLonToVec(25, -30, 36));
    this.controls.update();
    this.bindInput();
  }

  focusCountry(id: string) {
    const c = COUNTRY_BY_ID[id];
    const dist = this.camera.position.length();
    this.camera.position.copy(latLonToVec(c.lat - 10, c.lon, dist));
    this.controls.update();
  }

  sync(s: GameState, canOpen: (id: string) => boolean) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), z = new THREE.Vector3(0, 0, 1);
    const col = new THREE.Color();
    COUNTRIES.forEach((c, i) => {
      const p = latLonToVec(c.lat, c.lon, R);
      const sub = s.subsidiaries.find((x) => x.country === c.id);
      const home = c.id === s.home;
      const h = 0.35 + c.weight * 0.28 + (home ? 1.1 : sub ? 0.4 + sub.level * 0.45 : 0);
      q.setFromUnitVectors(z, p.clone().normalize());
      const w = home ? 1.8 : sub ? 1.4 : 1;
      m.compose(p, q, new THREE.Vector3(w, w, h));
      this.markers.setMatrixAt(i, m);
      if (home) col.copy(this.accent).lerp(new THREE.Color('#ffffff'), 0.25);
      else if (sub) col.copy(this.accent);
      else if (canOpen(c.id)) col.set('#e5e7eb');
      else col.set('#475569');
      this.markers.setColorAt(i, col);
    });
    this.markers.instanceMatrix.needsUpdate = true;
    this.markers.instanceColor!.needsUpdate = true;
    this.markers.computeBoundingSphere();

    // rutas comerciales
    const home = COUNTRY_BY_ID[s.home];
    const a = latLonToVec(home.lat, home.lon, R);
    const tubes: THREE.BufferGeometry[] = [];
    for (const sub of s.subsidiaries) {
      const c = COUNTRY_BY_ID[sub.country];
      const b = latLonToVec(c.lat, c.lon, R);
      const h = 0.2 + a.distanceTo(b) * 0.06;
      const ua = a.clone().normalize(), ub = b.clone().normalize();
      const curve = new GreatArc(ua, ub, h);
      tubes.push(new THREE.TubeGeometry(curve, 48, 0.045, 5, false));
    }
    this.arcs.geometry.dispose();
    this.arcs.geometry = tubes.length ? mergeGeometries(tubes)! : new THREE.BufferGeometry();
    this.arcs.visible = tubes.length > 0;
    tubes.forEach((t) => t.dispose());
    this.updateRing();
  }

  setSelected(id: string | null) {
    this.selected = id;
    this.updateRing();
  }

  private updateRing() {
    if (!this.selected) { this.ring.visible = false; return; }
    const c = COUNTRY_BY_ID[this.selected];
    const p = latLonToVec(c.lat, c.lon, R + 0.05);
    this.ring.position.copy(p);
    this.ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), p.clone().normalize());
    this.ring.visible = true;
  }

  private pick(ev: PointerEvent): string | null {
    const rect = this.dom.getBoundingClientRect();
    this.pointer.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObject(this.markers);
    if (hits.length && hits[0].instanceId !== undefined) return COUNTRIES[hits[0].instanceId].id;
    // tolerancia: el país más cercano al punto del globo bajo el cursor
    const sphere = new THREE.Sphere(new THREE.Vector3(), R);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectSphere(sphere, hit)) return null;
    let best: string | null = null, bd = 0.9;
    for (const c of COUNTRIES) {
      const d = latLonToVec(c.lat, c.lon).distanceTo(hit);
      if (d < bd) { bd = d; best = c.id; }
    }
    return best;
  }

  private bindInput() {
    this.dom.addEventListener('pointermove', (ev) => {
      if (!this.active) return;
      this.onCountryHover(ev.pointerType === 'mouse' ? this.pick(ev) : null, ev.clientX, ev.clientY);
    });
    this.dom.addEventListener('pointerdown', (ev) => { this.downAt = { x: ev.clientX, y: ev.clientY }; this.idle = 0; });
    this.dom.addEventListener('pointerup', (ev) => {
      if (!this.active || ev.button !== 0) return;
      if (Math.hypot(ev.clientX - this.downAt.x, ev.clientY - this.downAt.y) > 6) return;
      this.onCountryClick(this.pick(ev));
    });
  }

  activate() { this.active = true; this.controls.enabled = true; }
  deactivate() { this.active = false; this.controls.enabled = false; this.onCountryHover(null, 0, 0); }

  resize(w: number, h: number) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  update(dt: number) {
    this.idle += dt;
    this.controls.autoRotate = this.idle > 4;
    this.controls.autoRotateSpeed = 0.4;
    this.controls.update(dt);
    this.glow.quaternion.copy(this.camera.quaternion);
  }
}

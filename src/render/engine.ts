// Motor: WebGPURenderer (con fallback automático a WebGL2), bucle de render,
// calidad configurable y resolución dinámica para mantener los FPS.
import * as THREE from 'three/webgpu';

export interface View {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  activate(): void;
  deactivate(): void;
  resize(w: number, h: number): void;
  update(dt: number): void;
}

export type Quality = 'low' | 'medium' | 'high';

export const QUALITY: Record<Quality, { label: string; pixelRatio: number; shadows: boolean; shadowSize: number; antialias: boolean }> = {
  low: { label: 'Baja', pixelRatio: 0.75, shadows: false, shadowSize: 512, antialias: false },
  medium: { label: 'Media', pixelRatio: 1, shadows: true, shadowSize: 1024, antialias: true },
  high: { label: 'Alta', pixelRatio: 2, shadows: true, shadowSize: 2048, antialias: true },
};

/**
 * three.js pasa siempre `swizzle: 'rgba'` (la identidad) al crear vistas de textura. Algunas
 * versiones de Chrome con WebGPU experimental esperan otro tipo y lanzan una excepción,
 * así que eliminamos ese campo cuando es la identidad: el resultado es idéntico.
 */
function patchTextureViewSwizzle() {
  const Tex = (globalThis as unknown as { GPUTexture?: { prototype: { createView: (d?: Record<string, unknown>) => unknown } } }).GPUTexture;
  if (!Tex) return;
  const orig = Tex.prototype.createView;
  Tex.prototype.createView = function (this: unknown, desc?: Record<string, unknown>) {
    if (desc && desc.swizzle === 'rgba') {
      const { swizzle: _identity, ...rest } = desc;
      return orig.call(this, rest);
    }
    return orig.call(this, desc);
  };
}

const FALLBACK_KEY = 'empresarial-webgl-fallback';

export class Engine {
  renderer!: THREE.WebGPURenderer;
  backend = 'WebGPU';
  view!: View;
  quality: Quality = 'medium';
  adaptive = true;
  fps = 60;
  onFrame: (dt: number) => void = () => {};
  onQualityChange: (q: Quality) => void = () => {};
  onDeviceLost: () => void = () => {};
  private container: HTMLElement;
  private last = performance.now();
  private scale = 1; // factor de resolución dinámica
  private frameTimes: number[] = [];
  private lastAdapt = 0;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(quality: Quality) {
    this.quality = quality;
    patchTextureViewSwizzle();
    const forceWebGL = new URLSearchParams(location.search).has('webgl') || sessionStorage.getItem(FALLBACK_KEY) === '1';
    this.renderer = new THREE.WebGPURenderer({ antialias: QUALITY[quality].antialias, powerPreference: 'high-performance', forceWebGL });
    await this.renderer.init();
    const b = this.renderer.backend as unknown as { isWebGPUBackend?: boolean };
    this.backend = b.isWebGPUBackend ? 'WebGPU' : 'WebGL2';
    // Si la GPU pierde el dispositivo WebGPU (driver inestable), guardamos y recargamos con WebGL2.
    this.renderer.onDeviceLost = (info: unknown) => {
      console.warn('WebGPU device lost, cambiando a WebGL2', info);
      if (sessionStorage.getItem(FALLBACK_KEY) === '1') return;
      sessionStorage.setItem(FALLBACK_KEY, '1');
      this.onDeviceLost();
      location.reload();
    };
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.container.appendChild(this.renderer.domElement);
    this.renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('resize', () => this.resize());
  }

  get dom() { return this.renderer.domElement; }

  setView(v: View) {
    if (this.view === v) return;
    this.view?.deactivate();
    this.view = v;
    v.activate();
    this.resize();
  }

  setQuality(q: Quality) {
    this.quality = q;
    this.scale = 1;
    this.resize();
    this.onQualityChange(q);
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    const pr = Math.min(window.devicePixelRatio || 1, QUALITY[this.quality].pixelRatio) * this.scale;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, true);
    this.view?.resize(w, h);
  }

  /** Precompila los shaders de una vista para evitar tirones al cambiar. */
  async warmup(v: View) {
    try { await this.renderer.compileAsync(v.scene, v.camera); } catch { /* opcional */ }
  }

  start() {
    this.last = performance.now();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private frame() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.onFrame(dt);
    this.view.update(dt);
    this.renderer.render(this.view.scene, this.view.camera);
    this.trackPerformance(dt, now);
  }

  private trackPerformance(dt: number, now: number) {
    this.frameTimes.push(dt);
    if (this.frameTimes.length > 60) this.frameTimes.shift();
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.fps = 1 / avg;
    if (!this.adaptive || document.hidden || now - this.lastAdapt < 2500 || this.frameTimes.length < 60) return;
    // Resolución dinámica: baja si va lento, sube si hay margen.
    if (this.fps < 40 && this.scale > 0.55) {
      this.scale = Math.max(0.55, this.scale - 0.15);
      this.lastAdapt = now;
      this.resize();
    } else if (this.fps > 58 && this.scale < 1) {
      this.scale = Math.min(1, this.scale + 0.1);
      this.lastAdapt = now;
      this.resize();
    }
  }

  get resolutionScale() { return this.scale; }
}

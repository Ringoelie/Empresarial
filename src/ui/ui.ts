// Interfaz del juego (DOM). Se refresca como máximo unas pocas veces por segundo
// y nunca mientras el jugador está pulsando o arrastrando dentro de un panel.
import { Game } from '../game/game';
import * as sim from '../game/sim';
import {
  BUILDINGS, BUILD_ORDER, PRODUCTS, PRODUCT_ORDER, RESEARCH, RESEARCH_BY_ID, COUNTRIES, COUNTRY_BY_ID, STAGES, SECTORS,
  BASE_SALARY, subsidiaryCost, subsidiarySales, subsidiaryUpkeep, BuildingId, BuildingLevel, ProductId,
} from '../game/data';
import { pendingObjectives } from '../game/objectives';
import type { Engine, Quality } from '../render/engine';
import { QUALITY } from '../render/engine';
import type { CityView } from '../render/city';
import type { WorldView } from '../render/world';
import { h, bar, pct, fmtNum, fmtDate } from './dom';
import { lineChart } from './chart';

type Tab = 'empresa' | 'productos' | 'id' | 'finanzas' | 'mercados' | 'noticias';
const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'empresa', icon: '🏢', label: 'Empresa' },
  { id: 'productos', icon: '📦', label: 'Productos' },
  { id: 'id', icon: '🔬', label: 'I+D' },
  { id: 'finanzas', icon: '💰', label: 'Finanzas' },
  { id: 'mercados', icon: '🌍', label: 'Mercados' },
  { id: 'noticias', icon: '📰', label: 'Noticias' },
];
const SPEEDS = [1, 2, 4, 8];

export interface UIHooks {
  newGame: () => void;
  setView: (v: 'city' | 'world') => void;
}

export class UI {
  private root = document.getElementById('ui')!;
  private stats: Record<string, HTMLElement> = {};
  private speedBtns: HTMLButtonElement[] = [];
  private pauseBtn!: HTMLButtonElement;
  private dockBtns: Record<string, HTMLButtonElement> = {};
  private objectives!: HTMLElement;
  private panel!: HTMLElement;
  private panelBody!: HTMLElement;
  private tabBtns: Record<string, HTMLButtonElement> = {};
  private inspector!: HTMLElement;
  private buildbar!: HTMLElement;
  private hint!: HTMLElement;
  private toasts!: HTMLElement;
  private tooltip!: HTMLElement;
  private perf!: HTMLElement;
  private tab: Tab = 'empresa';
  view: 'city' | 'world' = 'city';
  selectedCountry: string | null = null;
  private pressing = false;
  private hovering = false;
  private dirty = true;
  private lastRefresh = 0;
  private confirmDemolish = 0;
  showFps = false;
  private seenToasts = 0;

  constructor(private game: Game, private engine: Engine, private city: CityView, private world: WorldView, private hooks: UIHooks) {
    document.documentElement.style.setProperty('--accent', game.s.color);
    this.root.innerHTML = '';
    this.buildTopbar();
    this.buildDock();
    this.buildObjectives();
    this.buildPanel();
    this.buildInspector();
    this.buildBuildbar();
    this.toasts = h('div', { id: 'toasts' });
    this.tooltip = h('div', { id: 'tooltip', class: 'glass hidden' });
    this.perf = h('div', { id: 'perf', class: 'glass' });
    this.perf.style.display = 'none';
    this.root.append(this.toasts, this.tooltip, this.perf);
    this.bindKeys();
    this.bindGame();
    this.bindViews();
    this.refresh(true);
  }

  // ================================================================ estructura

  private buildTopbar() {
    const s = this.game.s;
    const stat = (k: string, label: string) => {
      const v = h('span', { class: 'v' }, '—');
      this.stats[k] = v;
      return h('div', { class: 'stat', title: label }, h('span', { class: 'l' }, label), v);
    };
    this.pauseBtn = h('button', { class: 'btn', title: 'Pausa (Espacio)', onclick: () => this.togglePause() }, '⏸');
    this.speedBtns = SPEEDS.map((sp, i) => h('button', { class: 'btn', title: `Velocidad x${sp} (${i + 1})`, onclick: () => this.setSpeed(sp) }, `${'▶'.repeat(Math.min(3, i + 1))}${i === 3 ? '+' : ''}`));
    const top = h('div', { id: 'topbar', class: 'glass' },
      h('div', { class: 'brand' }, h('span', { class: 'dot' }), h('div', { class: 'col', style: 'gap:0' },
        h('span', { class: 'name' }, s.name), (this.stats.stage = h('span', { class: 'muted', style: 'font-size:11px;white-space:nowrap' })))),
      h('div', { class: 'stats' },
        stat('date', 'Fecha'),
        stat('cash', 'Caja'),
        stat('profit', 'Beneficio/día'),
        stat('valuation', 'Valoración'),
        stat('brand', 'Marca'),
        stat('staff', 'Plantilla'),
        stat('morale', 'Moral'),
        stat('rp', 'Puntos I+D')),
      h('div', { class: 'speed' }, this.pauseBtn, ...this.speedBtns,
        h('button', { class: 'btn hide-m', title: 'Ayuda', onclick: () => this.helpModal() }, '❓'),
        h('button', { class: 'btn', title: 'Ajustes', onclick: () => this.settingsModal() }, '⚙️')),
    );
    this.root.append(top);
  }

  private buildDock() {
    const mk = (id: string, icon: string, tip: string, fn: () => void) => (this.dockBtns[id] = h('button', { class: 'btn', 'data-tip': tip, onclick: fn }, icon));
    const dock = h('div', { id: 'dock', class: 'glass' },
      mk('build', '🏗️', 'Construir (B)', () => this.toggleBuildbar()),
      mk('city', '🏙️', 'Ciudad', () => this.hooks.setView('city')),
      mk('world', '🌍', 'Mapa mundial (M)', () => this.hooks.setView('world')),
      mk('panel', '📊', 'Panel de gestión (P)', () => this.togglePanel()),
    );
    this.root.append(dock);
  }

  private buildObjectives() {
    this.objectives = h('div', { id: 'objectives', class: `glass ${window.innerWidth < 820 ? 'min' : ''}` });
    this.root.append(this.objectives);
  }

  private buildPanel() {
    const tabs = h('div', { class: 'tabs' }, ...TABS.map((t) => (this.tabBtns[t.id] = h('button', { class: 'btn', onclick: () => this.setTab(t.id) }, h('span', { class: 'i' }, t.icon), t.label))));
    this.panelBody = h('div', { class: 'body scroll' });
    this.panel = h('div', { id: 'panel', class: 'glass' }, tabs, this.panelBody);
    if (window.innerWidth < 820) this.panel.classList.add('closed');
    this.holdOn(this.panel);
    this.root.append(this.panel);
  }

  private buildInspector() {
    this.inspector = h('div', { id: 'inspector', class: 'glass hidden scroll' });
    this.holdOn(this.inspector);
    this.root.append(this.inspector);
  }

  private buildBuildbar() {
    this.buildbar = h('div', { id: 'buildbar', class: 'glass hidden' });
    this.hint = h('div', { class: 'hint glass' });
    this.hint.style.display = 'none';
    this.holdOn(this.buildbar);
    this.root.append(this.buildbar, this.hint);
  }

  /** Evita re-renderizar un panel mientras el usuario interactúa con él. */
  private holdOn(el: HTMLElement) {
    el.addEventListener('pointerdown', () => { this.pressing = true; });
    const release = () => setTimeout(() => { this.pressing = false; if (this.dirty) this.refresh(); }, 0);
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    el.addEventListener('pointerover', (e) => { this.hovering = !!(e.target as Element).closest?.('[data-hold]'); });
    el.addEventListener('pointerleave', () => { this.hovering = false; });
  }

  // ================================================================ eventos

  private bindGame() {
    const g = this.game;
    g.on('day', () => { this.dirty = true; });
    g.on('toast', () => this.flushToasts());
    g.on('choice', () => this.choiceModal());
    g.on('end', () => this.endModal());
    g.on('world', () => { this.dirty = true; });
  }

  private bindViews() {
    this.city.onPlotClick = (p) => this.onPlotClick(p);
    this.city.onPlotHover = (p, x, y) => {
      if (p === null) { this.tooltip.classList.add('hidden'); return; }
      const s = this.game.s;
      const b = sim.buildingAt(s, p);
      let text: string;
      if (b) text = `${BUILDINGS[b.type].icon} ${BUILDINGS[b.type].name} · nivel ${b.level + 1}${b.product ? ` · ${PRODUCTS[b.product].icon}` : ''}`;
      else if (s.owned[p]) text = this.city.buildMode ? `Construir ${BUILDINGS[this.city.buildMode].name} · ${this.game.money(BUILDINGS[this.city.buildMode].levels[0].cost)}` : '🟩 Parcela libre (tuya)';
      else text = `🏷️ Parcela en venta · ${this.game.money(sim.plotPrice(s, p))}${this.city.buildMode ? ` + ${this.game.money(BUILDINGS[this.city.buildMode].levels[0].cost)}` : ''}`;
      this.showTooltip(text, x, y);
    };
    this.world.onCountryHover = (id, x, y) => {
      if (!id) { this.tooltip.classList.add('hidden'); return; }
      const c = COUNTRY_BY_ID[id];
      const s = this.game.s;
      const sub = s.subsidiaries.find((x) => x.country === id);
      const status = id === s.home ? 'Sede central' : sub ? `Filial nivel ${sub.level + 1}` : 'Sin presencia';
      this.showTooltip(`${c.flag} ${c.name} · mercado x${c.weight} · ${status}`, x, y);
    };
    this.world.onCountryClick = (id) => {
      if (!id) return;
      this.selectCountry(id);
    };
  }

  private bindKeys() {
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || document.querySelector('.modal-back')) return;
      const k = e.key.toLowerCase();
      if (k === ' ') { e.preventDefault(); this.togglePause(); }
      else if (['1', '2', '3', '4'].includes(k)) this.setSpeed(SPEEDS[Number(k) - 1]);
      else if (k === 'b') this.toggleBuildbar();
      else if (k === 'm') this.hooks.setView(this.view === 'city' ? 'world' : 'city');
      else if (k === 'p') this.togglePanel();
      else if (k === 'escape') {
        if (this.city.buildMode) this.setBuildMode(null);
        else if (!this.buildbar.classList.contains('hidden')) this.toggleBuildbar(false);
        else this.select(null);
      }
    });
    this.engine.dom.addEventListener('contextmenu', () => { if (this.city.buildMode) this.setBuildMode(null); });
  }

  showTooltip(text: string, x: number, y: number) {
    this.tooltip.textContent = text;
    this.tooltip.style.left = `${x}px`;
    this.tooltip.style.top = `${y}px`;
    this.tooltip.classList.remove('hidden');
  }

  // ================================================================ acciones de UI

  setView(v: 'city' | 'world') {
    this.view = v;
    this.dockBtns.city.classList.toggle('on', v === 'city');
    this.dockBtns.world.classList.toggle('on', v === 'world');
    this.tooltip.classList.add('hidden');
    if (v === 'world') {
      this.setBuildMode(null);
      this.toggleBuildbar(false);
      this.inspector.classList.add('hidden');
      this.panel.classList.remove('closed');
      this.setTab('mercados');
    } else this.renderInspector();
    this.dirty = true;
  }

  private setTab(t: Tab) {
    this.tab = t;
    this.panel.classList.remove('closed');
    this.panelBody.scrollTop = 0;
    this.renderPanel();
  }

  private togglePanel() {
    this.panel.classList.toggle('closed');
    this.dockBtns.panel.classList.toggle('on', !this.panel.classList.contains('closed'));
    this.renderPanel();
  }

  private togglePause() {
    this.game.paused = !this.game.paused;
    this.renderSpeed();
  }

  private setSpeed(sp: number) {
    this.game.speed = sp;
    this.game.paused = false;
    this.renderSpeed();
  }

  private renderSpeed() {
    this.pauseBtn.classList.toggle('on', this.game.paused);
    this.pauseBtn.textContent = this.game.paused ? '▶' : '⏸';
    this.speedBtns.forEach((b, i) => b.classList.toggle('on', !this.game.paused && this.game.speed === SPEEDS[i]));
  }

  private toggleBuildbar(force?: boolean) {
    const show = force ?? this.buildbar.classList.contains('hidden');
    if (show && this.view !== 'city') this.hooks.setView('city');
    this.buildbar.classList.toggle('hidden', !show);
    this.dockBtns.build.classList.toggle('on', show);
    if (!show) this.setBuildMode(null);
    this.renderBuildbar();
  }

  private setBuildMode(t: BuildingId | null) {
    this.city.setBuildMode(t);
    this.hint.style.display = t ? '' : 'none';
    if (t) this.hint.innerHTML = `Haz clic en una parcela para construir <b>${BUILDINGS[t].icon} ${BUILDINGS[t].name}</b>. Si no es tuya, se compra a la vez. <span class="muted">Esc / clic derecho: cancelar</span>`;
    this.renderBuildbar();
  }

  private select(plot: number | null) {
    this.city.setSelected(plot);
    this.confirmDemolish = 0;
    this.renderInspector();
  }

  private selectCountry(id: string | null) {
    this.selectedCountry = id;
    this.world.setSelected(id);
    if (id) this.world.focusCountry(id);
    this.panel.classList.remove('closed');
    if (this.tab !== 'mercados') this.setTab('mercados');
    else this.renderPanel();
  }

  private onPlotClick(p: number | null) {
    const g = this.game, s = g.s;
    const mode = this.city.buildMode;
    if (mode) {
      if (p === null) return;
      const existing = sim.buildingAt(s, p);
      if (existing) { this.select(p); return; }
      if (!s.owned[p]) {
        const total = sim.plotPrice(s, p) + BUILDINGS[mode].levels[0].cost;
        const err = sim.canBuild(s, mode);
        if (err) { g.toast(err, 'bad', false); return; }
        if (s.cash < total) { g.toast(`Necesitas ${g.money(total)} (parcela + edificio).`, 'bad', false); return; }
        g.act(sim.buyPlot(s, p));
      }
      if (g.act(sim.build(s, p, mode))) {
        if (BUILDINGS[mode].unique) this.setBuildMode(null);
        this.city.setSelected(p);
        this.renderInspector();
      }
      return;
    }
    this.select(p === this.city.selected ? null : p);
  }

  // ================================================================ refresco

  /** Llamado cada frame: decide si toca refrescar el DOM. */
  tick() {
    const now = performance.now();
    if (this.showFps && now - this.lastRefresh > 500) {
      this.perf.textContent = `${this.engine.backend} · ${this.engine.fps.toFixed(0)} FPS · res ${(this.engine.resolutionScale * 100).toFixed(0)}%`;
    }
    if (!this.dirty || now - this.lastRefresh < 280) return;
    this.refresh();
  }

  refresh(force = false) {
    this.lastRefresh = performance.now();
    this.renderTopbar();
    this.renderObjectives();
    const ae = document.activeElement;
    const selecting = ae?.tagName === 'SELECT' && (this.panel.contains(ae) || this.inspector.contains(ae));
    if (!force && (this.pressing || this.hovering || selecting)) { this.renderSpeed(); return; }
    this.dirty = false;
    this.renderPanel();
    this.renderInspector();
    this.renderBuildbar();
    this.renderSpeed();
  }

  private renderTopbar() {
    const s = this.game.s, r = s.last, m = (n: number) => this.game.money(n);
    const st = STAGES[s.stage];
    this.stats.stage.textContent = `${st.icon} ${st.name}`;
    this.stats.date.textContent = fmtDate(s.day);
    this.stats.cash.textContent = m(s.cash);
    this.stats.cash.className = `v ${s.cash < 0 ? 'bad' : ''}`;
    this.stats.profit.textContent = `${r.profit >= 0 ? '+' : ''}${m(r.profit)}`;
    this.stats.profit.className = `v ${r.profit >= 0 ? 'good' : 'bad'}`;
    this.stats.valuation.textContent = m(s.valuation);
    this.stats.brand.textContent = s.brand.toFixed(1);
    this.stats.staff.textContent = `${fmtNum(r.staff)}`;
    this.stats.staff.className = `v ${r.staff > r.mgmtCap ? 'warn' : ''}`;
    this.stats.morale.textContent = `${s.morale.toFixed(0)}%`;
    this.stats.morale.className = `v ${s.morale < 50 ? 'bad' : s.morale > 75 ? 'good' : ''}`;
    this.stats.rp.textContent = fmtNum(s.rp);
  }

  private renderObjectives() {
    const s = this.game.s;
    const list = pendingObjectives(s, 3);
    const key = list.map((o) => o.id).join(',') + this.objectives.className;
    if (this.objectives.dataset.key === key) return;
    this.objectives.dataset.key = key;
    this.objectives.innerHTML = '';
    const min = this.objectives.classList.contains('min');
    this.objectives.append(
      h('div', { class: 'row between', style: 'cursor:pointer', onclick: () => { this.objectives.classList.toggle('min'); this.renderObjectives(); } },
        h('h3', { style: 'margin:0' }, '🎯 Objetivos'), h('span', { class: 'muted' }, min ? '▸' : '▾')),
      h('div', { class: 'list' }, list.length ? list.map((o) => h('div', { class: 'obj' }, h('span', null, '○'), h('span', { class: 'grow' }, o.text), o.reward ? h('b', null, `+${this.game.money(o.reward)}`) : null))
        : h('div', { class: 'muted' }, '¡Todos los objetivos cumplidos!')),
    );
  }

  private renderBuildbar() {
    if (this.buildbar.classList.contains('hidden')) return;
    const s = this.game.s;
    this.buildbar.innerHTML = '';
    for (const id of BUILD_ORDER) {
      const def = BUILDINGS[id];
      const err = sim.canBuild(s, id);
      const cost = def.levels[0].cost;
      const card = h('div', {
        class: `bcard ${this.city.buildMode === id ? 'on' : ''} ${err ? 'dis' : ''}`,
        title: err ?? def.desc,
        onclick: () => { if (err) { this.game.toast(err, 'bad', false); return; } this.setBuildMode(this.city.buildMode === id ? null : id); },
      }, h('span', { class: 'ic' }, def.icon), h('span', { class: 'n' }, def.name), h('span', { class: `c ${s.cash < cost ? 'bad' : ''}` }, this.game.money(cost)));
      this.buildbar.append(card);
    }
  }

  // ================================================================ inspector

  private renderInspector() {
    const el = this.inspector;
    const p = this.city.selected;
    if (p === null || this.view !== 'city') { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    const g = this.game, s = g.s, m = (n: number) => g.money(n);
    el.innerHTML = '';
    const close = h('button', { class: 'btn small', onclick: () => this.select(null) }, '✕');
    const b = sim.buildingAt(s, p);
    if (!s.owned[p]) {
      const price = sim.plotPrice(s, p);
      el.append(
        h('div', { class: 'head' }, h('span', { class: 'ic' }, '🏷️'), h('div', { class: 'grow' }, h('h2', null, 'Parcela en venta'), h('span', { class: 'muted' }, 'Ahora ocupada por otros negocios')), close),
        h('p', { class: 'muted', style: 'margin:4px 0 10px' }, 'Cómprala para construir. El precio sube cerca del centro y a medida que tienes más terreno.'),
        h('button', { class: 'btn primary block', disabled: s.cash < price, onclick: () => { if (g.act(sim.buyPlot(s, p))) this.renderInspector(); } }, `Comprar por ${m(price)}`),
      );
      return;
    }
    if (!b) {
      el.append(h('div', { class: 'head' }, h('span', { class: 'ic' }, '🟩'), h('div', { class: 'grow' }, h('h2', null, 'Parcela libre'), h('span', { class: 'muted' }, 'Elige qué construir')), close));
      const grid = h('div', { style: 'display:grid;grid-template-columns:repeat(3,1fr);gap:6px' });
      for (const id of BUILD_ORDER) {
        const def = BUILDINGS[id];
        const err = sim.canBuild(s, id);
        const cost = def.levels[0].cost;
        grid.append(h('div', {
          class: `bcard ${err || s.cash < cost ? 'dis' : ''}`, style: 'width:auto', title: err ?? def.desc,
          onclick: () => { if (err) { g.toast(err, 'bad', false); return; } g.act(sim.build(s, p, id)); this.renderInspector(); },
        }, h('span', { class: 'ic' }, def.icon), h('span', { class: 'n' }, def.name), h('span', { class: 'c' }, m(cost))));
      }
      el.append(grid);
      return;
    }
    const def = BUILDINGS[b.type];
    const lv = def.levels[b.level];
    const mods = sim.researchMods(s);
    el.append(h('div', { class: 'head' }, h('span', { class: 'ic' }, def.icon),
      h('div', { class: 'grow' }, h('h2', null, def.name), h('div', { class: 'levels', title: `Nivel ${b.level + 1} de ${def.levels.length}` }, def.levels.map((_, i) => h('i', { class: i <= b.level ? 'on' : '' })))), close));
    el.append(h('p', { class: 'muted', style: 'margin:0 0 8px' }, def.desc));
    el.append(this.levelStats(lv, b.type === 'factory' ? mods.factoryStaff : 1));

    if (lv.production) {
      const sel = h('select', {
        class: 'grow',
        onchange: (e: Event) => { const el = e.target as HTMLSelectElement; el.blur(); g.act(sim.setFactoryProduct(s, b.id, el.value as ProductId), false); },
      }, sim.unlockedProducts(s).map((pid) => h('option', { value: pid, selected: pid === b.product }, `${PRODUCTS[pid].icon} ${PRODUCTS[pid].name}`)));
      const prod = b.product ? PRODUCTS[b.product] : null;
      el.append(h('div', { class: 'sep' }), h('div', { class: 'row' }, h('span', { class: 'muted' }, 'Produce'), sel));
      if (prod) {
        const units = (lv.production * mods.prod * s.last.efficiency) / prod.complexity;
        el.append(h('div', { class: 'muted', style: 'margin-top:6px' }, `Hasta ${fmtNum(units, 1)} uds/día · margen ${m(prod.price * s.products[prod.id].priceMult - prod.unitCost * mods.costMult)}/ud`));
      }
    }

    const up = sim.upgradeCost(b);
    el.append(h('div', { class: 'sep' }));
    if (up !== null) {
      const next = def.levels[b.level + 1];
      const hqBlock = b.type === 'hq' && s.stage < sim.hqStageRequired(b.level + 1);
      el.append(h('div', { class: 'muted', style: 'margin-bottom:6px' }, 'Siguiente nivel:'), this.levelStats(next, b.type === 'factory' ? mods.factoryStaff : 1, lv));
      el.append(h('button', {
        class: 'btn primary block', style: 'margin-top:8px', disabled: s.cash < up || hqBlock,
        onclick: () => { if (g.act(sim.upgrade(s, b.id))) this.renderInspector(); },
      }, hqBlock ? `Requiere ser ${STAGES[sim.hqStageRequired(b.level + 1)].name}` : `⬆️ Mejorar a nivel ${b.level + 2} · ${m(up)}`));
    } else el.append(h('div', { class: 'muted' }, '✨ Nivel máximo'));
    const refund = def.levels.slice(0, b.level + 1).reduce((a, l) => a + l.cost, 0) * 0.3;
    const armed = this.confirmDemolish === b.id;
    el.append(h('button', {
      class: 'btn danger block small', style: 'margin-top:8px',
      onclick: () => {
        if (!armed) { this.confirmDemolish = b.id; this.renderInspector(); return; }
        this.confirmDemolish = 0;
        g.act(sim.demolish(s, b.id));
        this.renderInspector();
      },
    }, armed ? `¿Seguro? Recuperas ${m(refund)}` : '🗑️ Demoler'));
  }

  private levelStats(lv: BuildingLevel, staffMult: number, prev?: BuildingLevel): HTMLElement {
    const m = (n: number) => this.game.money(n);
    const rows: [string, number | undefined, (n: number) => string, number | undefined][] = [
      ['Plantilla', Math.round(lv.staff * staffMult), (n) => `${n}`, prev ? Math.round(prev.staff * staffMult) : undefined],
      ['Mantenimiento/día', lv.upkeep, m, prev?.upkeep],
      ['Producción', lv.production, (n) => `${fmtNum(n)} pts/día`, prev?.production],
      ['Venta', lv.sales, (n) => `${fmtNum(n)} uds/día`, prev?.sales],
      ['Venta online', lv.online, (n) => `${fmtNum(n)} uds/día`, prev?.online],
      ['Almacén', lv.storage, (n) => `${fmtNum(n)} m³`, prev?.storage],
      ['I+D', lv.research, (n) => `${n} pts/día`, prev?.research],
      ['Gestión', lv.mgmt, (n) => `${fmtNum(n)} empleados`, prev?.mgmt],
      ['Marca', lv.brand, (n) => `+${n}/día`, prev?.brand],
      ['Moral', lv.morale, (n) => `+${n}`, prev?.morale],
    ];
    const kv = h('div', { class: 'kv' });
    for (const [label, v, f, pv] of rows) {
      if (!v) continue;
      kv.append(h('span', null, label), h('span', null, f(v), pv !== undefined && pv !== v ? h('span', { class: 'faint' }, ` (${f(pv)})`) : null));
    }
    return kv;
  }

  // ================================================================ panel

  private renderPanel() {
    document.body.classList.toggle('panel-open', !this.panel.classList.contains('closed'));
    if (this.panel.classList.contains('closed')) { this.dockBtns.panel?.classList.remove('on'); return; }
    this.dockBtns.panel?.classList.add('on');
    for (const t of TABS) this.tabBtns[t.id].classList.toggle('on', t.id === this.tab);
    const scroll = this.panelBody.scrollTop;
    this.panelBody.innerHTML = '';
    const content = {
      empresa: () => this.tabEmpresa(),
      productos: () => this.tabProductos(),
      id: () => this.tabResearch(),
      finanzas: () => this.tabFinanzas(),
      mercados: () => this.tabMercados(),
      noticias: () => this.tabNoticias(),
    }[this.tab]();
    this.panelBody.append(content);
    this.panelBody.scrollTop = scroll;
  }

  private tabEmpresa(): HTMLElement {
    const g = this.game, s = g.s, r = s.last, m = (n: number) => g.money(n);
    const st = STAGES[s.stage], next = STAGES[s.stage + 1];
    const root = h('div', { class: 'col' });
    root.append(h('div', { class: 'card' },
      h('div', { class: 'row' }, h('span', { style: 'font-size:30px' }, st.icon), h('div', { class: 'grow' }, h('div', { class: 'muted' }, 'Etapa actual'), h('h2', null, st.name))),
      next ? h('div', { class: 'col', style: 'margin-top:10px;gap:6px' },
        h('div', { class: 'muted' }, `Siguiente: ${next.icon} ${next.name}`),
        h('div', { class: 'row between' }, h('span', null, 'Valoración'), h('span', { class: 'num' }, `${m(s.valuation)} / ${m(next.valuation)}`)),
        bar(s.valuation / next.valuation),
        next.countries > 1 ? h('div', { class: 'row between' }, h('span', null, 'Países con presencia'), h('span', { class: 'num' }, `${sim.countriesPresent(s)} / ${next.countries}`)) : null,
        next.countries > 1 ? bar(sim.countriesPresent(s) / next.countries) : null,
      ) : h('p', { class: 'good' }, '¡Has llegado a lo más alto!'),
    ));

    // plantilla
    const over = r.staff > r.mgmtCap;
    const wage = BASE_SALARY * COUNTRY_BY_ID[s.home].wage;
    const salaryLabel = h('b', { class: 'num' });
    const setSalaryLabel = () => { salaryLabel.textContent = `${pct(s.salaryLevel)} · ${m(wage * s.salaryLevel)}/empleado/día`; };
    setSalaryLabel();
    root.append(h('div', { class: 'card col' },
      h('h3', null, '👥 Plantilla'),
      h('div', { class: 'row between' }, h('span', null, 'Empleados / capacidad de gestión'), h('b', { class: `num ${over ? 'warn' : ''}` }, `${fmtNum(r.staff)} / ${fmtNum(r.mgmtCap)}`)),
      bar(r.staff / Math.max(1, r.mgmtCap), over ? 'bad' : r.staff / r.mgmtCap > 0.85 ? 'warn' : 'good'),
      over ? h('div', { class: 'warn' }, '⚠️ Faltan oficinas: la eficiencia y la moral bajan. Construye o mejora oficinas.') : null,
      h('div', { class: 'row between' }, h('span', null, 'Moral'), h('b', { class: 'num' }, `${s.morale.toFixed(0)}%`)),
      bar(s.morale / 100, s.morale < 50 ? 'bad' : s.morale < 70 ? 'warn' : 'good'),
      h('div', { class: 'row between' }, h('span', null, 'Eficiencia'), h('b', { class: 'num' }, pct(r.efficiency))),
      h('div', { class: 'row between' }, h('span', null, 'Salarios'), salaryLabel),
      h('input', {
        type: 'range', min: 0.7, max: 1.6, step: 0.05, value: s.salaryLevel,
        oninput: (e: Event) => { s.salaryLevel = Number((e.target as HTMLInputElement).value); setSalaryLabel(); },
      }),
      h('div', { class: 'faint' }, 'Mejores salarios suben la moral, que aumenta la eficiencia y evita huelgas.'),
    ));

    // marketing
    const toBudget = (x: number) => (x <= 0 ? 0 : Math.round((20 * Math.pow(1.105, x)) / 10) * 10);
    const fromBudget = (b: number) => (b <= 0 ? 0 : Math.round(Math.log(b / 20) / Math.log(1.105)));
    const mLabel = h('b', { class: 'num' });
    const setM = () => { mLabel.textContent = s.marketingBudget ? `${m(s.marketingBudget)}/día` : 'Sin campaña'; };
    setM();
    root.append(h('div', { class: 'card col' },
      h('h3', null, '📣 Marca y marketing'),
      h('div', { class: 'row between' }, h('span', null, 'Marca'), h('b', { class: 'num' }, `${s.brand.toFixed(1)} / 100`)),
      bar(s.brand / 100),
      h('div', { class: 'row between' }, h('span', null, 'Variación'), h('span', { class: `num ${r.brandGain - s.brand * 0.003 >= 0 ? 'good' : 'bad'}` }, `${(r.brandGain - s.brand * 0.003 >= 0 ? '+' : '')}${(r.brandGain - s.brand * 0.003).toFixed(3)}/día`)),
      h('div', { class: 'row between' }, h('span', null, 'Presupuesto'), mLabel),
      h('input', {
        type: 'range', min: 0, max: 100, step: 1, value: fromBudget(s.marketingBudget),
        oninput: (e: Event) => { s.marketingBudget = toBudget(Number((e.target as HTMLInputElement).value)); setM(); },
      }),
      h('div', { class: 'faint' }, 'La marca aumenta tu cuota de mercado en todos los productos. Las agencias de marketing y las tiendas también la hacen crecer.'),
    ));

    // efectos activos
    if (s.effects.length) {
      root.append(h('div', { class: 'card col' }, h('h3', null, '⚡ Efectos activos'),
        s.effects.map((e) => h('div', { class: 'row between' }, h('span', null, e.name), h('span', { class: 'muted num' }, `${e.until - s.day} días`)))));
    }
    return root;
  }

  private tabProductos(): HTMLElement {
    const g = this.game, s = g.s, r = s.last, m = (n: number) => g.money(n);
    const mods = sim.researchMods(s);
    const root = h('div', { class: 'col' });
    const salesSat = r.physicalDemand / Math.max(1, r.salesCap);
    root.append(h('div', { class: 'card col' },
      h('h3', null, '🚚 Operaciones'),
      h('div', { class: 'row between' }, h('span', null, 'Demanda física / capacidad de venta'), h('b', { class: 'num' }, `${fmtNum(r.physicalDemand)} / ${fmtNum(r.salesCap)}`)),
      bar(salesSat, salesSat > 1 ? 'bad' : salesSat > 0.85 ? 'warn' : 'good'),
      salesSat > 1 ? h('div', { class: 'warn' }, '⚠️ Vendes menos de lo que podrías: abre tiendas, mejora oficinas o un centro de datos.') : null,
      h('div', { class: 'row between' }, h('span', null, 'Almacén (uso diario)'), h('b', { class: 'num' }, `${fmtNum(r.storageUsed)} / ${fmtNum(r.storage)} m³`)),
      bar(r.storageUsed / Math.max(1, r.storage), r.logistics < 1 ? 'bad' : r.storageUsed / r.storage > 0.85 ? 'warn' : 'good'),
      r.logistics < 1 ? h('div', { class: 'warn' }, `⚠️ El almacén limita la producción al ${pct(r.logistics)}. Construye almacenes.`) : null,
      h('div', { class: 'row between' }, h('span', null, 'Calidad de producto'), h('b', { class: 'num' }, `x${mods.quality.toFixed(2)}`)),
    ));

    const unlocked = sim.unlockedProducts(s);
    for (const pid of unlocked) {
      const def = PRODUCTS[pid], ps = s.products[pid];
      const factories = s.buildings.filter((b) => b.product === pid && BUILDINGS[b.type].levels[b.level].production).length;
      const priceLabel = h('b', { class: 'num' });
      const est = h('span', { class: 'faint num' });
      const upd = () => {
        priceLabel.textContent = `${m(def.price * ps.priceMult)} (${pct(ps.priceMult)})`;
        const d = sim.productDemand(s, pid, ps.priceMult, mods.quality);
        est.textContent = `Demanda estimada a este precio: ${fmtNum(d.demand, 1)}/día · cuota ${pct(d.share, 1)}`;
      };
      upd();
      const margin = def.price * ps.priceMult - def.unitCost * mods.costMult;
      const stat = (l: string, v: string, cls = '') => h('div', null, h('div', { class: 'l' }, l), h('div', { class: `v ${cls}` }, v));
      root.append(h('div', { class: 'card product' },
        h('span', { class: 'ic' }, def.icon),
        h('div', { class: 'row between' }, h('b', null, def.name), h('span', { class: 'tag' }, `${SECTORS[def.sector].name}${def.volume === 0 ? ' · digital' : ''}`)),
        h('div', { class: 'row between' }, h('span', { class: 'muted' }, 'Precio'), priceLabel),
        h('input', {
          type: 'range', min: 0.5, max: 2, step: 0.05, value: ps.priceMult,
          oninput: (e: Event) => { ps.priceMult = Number((e.target as HTMLInputElement).value); upd(); },
        }),
        h('div', { style: 'grid-column: 1 / -1' },
          est,
          h('div', { class: 'stats-grid' },
            stat('Producción', `${fmtNum(ps.produced, 1)}/d`),
            stat('Demanda', `${fmtNum(ps.demand, 1)}/d`),
            stat('Ventas', `${fmtNum(ps.sold, 1)}/d`, ps.sold < ps.demand * 0.9 && ps.demand > 0 ? 'warn' : ''),
            stat('Stock', def.volume === 0 ? '—' : fmtNum(ps.inventory)),
            stat('Cuota', pct(ps.share, 1)),
            stat('Margen/ud', m(margin), margin < 0 ? 'bad' : ''),
          ),
          factories === 0 ? h('div', { class: 'muted', style: 'margin-top:6px' }, '💡 Ninguna fábrica lo produce. Selecciona una fábrica y asígnale este producto.')
            : h('div', { class: 'faint', style: 'margin-top:6px' }, `${factories} fábrica(s) asignada(s)`),
        ),
      ));
    }
    const locked = PRODUCT_ORDER.filter((p) => !unlocked.includes(p));
    if (locked.length) {
      root.append(h('details', { class: 'card' }, h('summary', { class: 'muted', style: 'cursor:pointer' }, `🔒 Productos por desbloquear (${locked.length})`),
        h('div', { class: 'col', style: 'margin-top:8px' }, locked.map((p) => h('div', { class: 'row between' },
          h('span', null, `${PRODUCTS[p].icon} ${PRODUCTS[p].name}`), h('span', { class: 'faint' }, `I+D: ${RESEARCH_BY_ID[PRODUCTS[p].requires].name}`))))));
    }
    return root;
  }

  private tabResearch(): HTMLElement {
    const g = this.game, s = g.s;
    const root = h('div', { class: 'col' });
    const target = s.researchTarget ? RESEARCH_BY_ID[s.researchTarget] : null;
    root.append(h('div', { class: 'card col' },
      h('div', { class: 'row between' }, h('span', null, 'Puntos disponibles'), h('b', { class: 'num' }, fmtNum(s.rp, 1))),
      h('div', { class: 'row between' }, h('span', null, 'Generación'), h('span', { class: 'num good' }, `+${s.last.research.toFixed(1)}/día`)),
      target ? h('div', { class: 'col', style: 'gap:4px' }, h('div', { class: 'row between' }, h('span', null, `Objetivo: ${target.icon} ${target.name}`), h('span', { class: 'num muted' }, `${fmtNum(s.rp)} / ${fmtNum(target.cost)}`)), bar(s.rp / target.cost))
        : h('div', { class: 'faint' }, 'Elige un objetivo: los puntos se invierten automáticamente al alcanzarlo.'),
      s.last.research < 1 ? h('div', { class: 'muted' }, '💡 Construye un laboratorio de I+D para investigar mucho más rápido.') : null,
    ));
    const avail = RESEARCH.filter((r) => sim.researchAvailable(s, r)).sort((a, b) => a.cost - b.cost);
    root.append(h('h3', null, 'Disponibles'));
    for (const r of avail) {
      const can = s.rp >= r.cost;
      const isT = s.researchTarget === r.id;
      root.append(h('div', { class: `research ${isT ? 'target' : ''}` },
        h('span', { class: 'ic' }, r.icon),
        h('div', { class: 'grow' }, h('b', null, r.name), h('div', { class: 'muted' }, r.desc), h('div', { class: 'faint num' }, `${fmtNum(r.cost)} pts`)),
        h('button', {
          class: `btn small ${can ? 'primary' : ''}`,
          onclick: () => { g.act(sim.startResearch(s, r.id)); },
        }, can ? 'Investigar' : isT ? '🎯 Objetivo' : 'Fijar'),
      ));
    }
    if (!avail.length) root.append(h('div', { class: 'muted' }, 'No hay investigaciones disponibles ahora mismo.'));
    const locked = RESEARCH.filter((r) => !sim.hasResearch(s, r.id) && !sim.researchAvailable(s, r));
    if (locked.length) {
      root.append(h('details', { class: 'card' }, h('summary', { class: 'muted', style: 'cursor:pointer' }, `🔒 Bloqueadas (${locked.length})`),
        h('div', { style: 'margin-top:8px' }, locked.map((r) => h('div', { class: 'research locked' }, h('span', { class: 'ic' }, r.icon),
          h('div', { class: 'grow' }, h('b', null, r.name), h('div', { class: 'muted' }, r.desc),
            h('div', { class: 'faint' }, `Requiere: ${r.requires.map((x) => RESEARCH_BY_ID[x].name).join(', ')} · ${fmtNum(r.cost)} pts`)))))));
    }
    const done = RESEARCH.filter((r) => sim.hasResearch(s, r.id));
    root.append(h('details', { class: 'card' }, h('summary', { class: 'muted', style: 'cursor:pointer' }, `✅ Completadas (${done.length})`),
      h('div', { style: 'margin-top:8px' }, done.map((r) => h('div', { class: 'research done' }, h('span', { class: 'ic' }, r.icon), h('div', { class: 'grow' }, h('b', null, r.name), h('div', { class: 'muted' }, r.desc)))))));
    return root;
  }

  private tabFinanzas(): HTMLElement {
    const g = this.game, s = g.s, r = s.last, m = (n: number) => g.money(n);
    const root = h('div', { class: 'col' });
    const limit = sim.creditLimit(s);
    const room = Math.max(0, limit - s.debt);
    root.append(h('div', { class: 'card' }, h('div', { class: 'kv' },
      h('span', null, 'Caja'), h('b', { class: s.cash < 0 ? 'bad' : '' }, m(s.cash)),
      h('span', null, 'Deuda'), h('span', null, m(s.debt)),
      h('span', null, 'Crédito disponible'), h('span', null, m(room)),
      h('span', null, 'Interés anual'), h('span', null, pct(sim.interestRate(s), 1)),
      h('span', null, 'Valoración'), h('b', null, m(s.valuation)),
      h('span', null, 'Tu participación'), h('span', null, pct(s.ownership, 1)),
      h('span', null, 'Tu patrimonio'), h('b', { class: 'good' }, m(s.valuation * s.ownership)),
    )));
    const loans = [50_000, 250_000, 1_000_000, 10_000_000, 100_000_000];
    root.append(h('div', { class: 'card col' }, h('h3', null, '🏦 Banco'),
      h('div', { class: 'row', style: 'flex-wrap:wrap' }, loans.filter((a) => a <= Math.max(room, 50_000)).map((a) => h('button', { class: 'btn small', disabled: a > room, onclick: () => g.act(sim.takeLoan(s, a), false) }, `+${m(a)}`))),
      s.debt > 0 ? h('div', { class: 'row', style: 'flex-wrap:wrap' },
        h('button', { class: 'btn small', onclick: () => g.act(sim.repayLoan(s, Math.min(s.debt, 50_000)), false) }, `Devolver ${m(Math.min(s.debt, 50_000))}`),
        h('button', { class: 'btn small', disabled: s.cash < s.debt, onclick: () => g.act(sim.repayLoan(s, s.debt), false) }, 'Devolver todo')) : null,
      s.negativeDays > 0 ? h('div', { class: 'bad' }, `⚠️ Caja negativa: ${45 - s.negativeDays} días para la quiebra.`) : null,
    ));
    const line = (l: string, v: number, sign = -1) => [h('span', null, l), h('span', { class: v < 0.5 ? 'faint' : sign > 0 ? 'good' : '' }, v < 0.5 ? m(0) : `${sign > 0 ? '+' : '−'}${m(v)}`)];
    root.append(h('div', { class: 'card' }, h('h3', null, '📋 Cuenta de resultados (ayer)'), h('div', { class: 'kv' },
      ...line('Ingresos', r.revenue, 1),
      ...line('Salarios', r.salaries), ...line('Materiales', r.materials), ...line('Mantenimiento', r.upkeep),
      ...line('Marketing', r.marketing), ...line('Filiales', r.subsidiaries), ...line('Intereses', r.interest), ...line('Almacenaje', r.holding),
      h('b', null, 'Beneficio'), h('b', { class: r.profit >= 0 ? 'good' : 'bad' }, m(r.profit)),
    ), h('div', { class: 'faint', style: 'margin-top:6px' }, 'Cada mes se paga un 25% de impuestos sobre el beneficio.')));

    const hist = s.history.slice(-24);
    const labels = hist.map((x) => `Mes ${x.month}`);
    root.append(
      lineChart({ title: 'Ingresos mensuales', values: hist.map((x) => x.revenue), labels, color: '#60a5fa', fmt: m }),
      lineChart({ title: 'Beneficio neto mensual', values: hist.map((x) => x.profit), labels, color: '#34d399', fmt: m }),
      lineChart({ title: 'Valoración', values: hist.map((x) => x.valuation), labels, color: '#c084fc', fmt: m }),
    );

    const ipoReq = sim.hasResearch(s, 'finance');
    root.append(h('div', { class: 'card col' }, h('h3', null, '📈 Bolsa'),
      s.ipo ? h('div', { class: 'kv' }, h('span', null, 'Precio por acción'), h('b', null, `${sim.sharePrice(s).toFixed(2)} ${s.currency}`), h('span', null, 'Capital flotante'), h('span', null, pct(1 - s.ownership, 1)))
        : h('div', { class: 'col' },
          h('div', { class: 'muted' }, `Sal a bolsa vendiendo un 20% de la empresa. Requiere investigar Ingeniería financiera y una valoración de ${m(sim.IPO_MIN_VALUATION)}.`),
          h('button', { class: 'btn primary', disabled: !ipoReq || s.valuation < sim.IPO_MIN_VALUATION, onclick: () => g.act(sim.goPublic(s), false) }, `🔔 Salir a bolsa (+${m(s.valuation * 0.2)})`)),
    ));
    return root;
  }

  private tabMercados(): HTMLElement {
    const g = this.game, s = g.s, m = (n: number) => g.money(n);
    const root = h('div', { class: 'col' });
    const limit = sim.subsidiaryLimit(s);
    const intl = sim.hasResearch(s, 'intl');
    root.append(h('div', { class: 'card col' },
      h('div', { class: 'row between' }, h('span', null, 'Países con presencia'), h('b', { class: 'num' }, `${sim.countriesPresent(s)}`)),
      h('div', { class: 'row between' }, h('span', null, 'Filiales / límite de la sede'), h('b', { class: 'num' }, `${s.subsidiaries.length} / ${limit >= 99 ? '∞' : limit}`)),
      !intl ? h('div', { class: 'warn' }, '🔒 Investiga «Comercio internacional» para abrir filiales.') : null,
      intl && limit === 0 ? h('div', { class: 'warn' }, '🏛️ Construye la sede corporativa para abrir filiales.') : null,
      intl && limit > 0 && s.subsidiaries.length >= limit ? h('div', { class: 'warn' }, '🏛️ Mejora la sede corporativa para abrir más filiales.') : null,
      this.view === 'city' ? h('button', { class: 'btn', onclick: () => this.hooks.setView('world') }, '🌍 Ver mapa mundial') : null,
    ));

    const sel = this.selectedCountry ? COUNTRY_BY_ID[this.selectedCountry] : null;
    if (sel) {
      const sub = s.subsidiaries.find((x) => x.country === sel.id);
      const home = sel.id === s.home;
      const card = h('div', { class: 'card col' },
        h('div', { class: 'row' }, h('span', { style: 'font-size:28px' }, sel.flag), h('div', { class: 'grow' }, h('h2', null, sel.name),
          h('span', { class: 'muted' }, home ? 'Sede central' : sub ? `Filial · nivel ${sub.level + 1}` : 'Sin presencia'))),
        h('div', { class: 'kv' },
          h('span', null, 'Tamaño de mercado'), h('span', null, `x${sel.weight}`),
          h('span', null, 'Coste laboral'), h('span', null, `x${sel.wage}`),
          h('span', null, 'Aranceles'), h('span', null, home ? '—' : pct(sel.tariff * (sim.hasResearch(s, 'globalbrand') ? 0.5 : 1))),
          sub ? h('span', null, 'Capacidad de venta') : null, sub ? h('span', null, `${fmtNum(subsidiarySales(sel, sub.level))} uds/día`) : null,
          sub ? h('span', null, 'Coste diario') : null, sub ? h('span', null, m(subsidiaryUpkeep(sel, sub.level))) : null,
        ));
      if (!home && !sub) {
        const cost = subsidiaryCost(sel, 0);
        const err = !intl ? 'Requiere Comercio internacional' : s.subsidiaries.length >= limit ? 'Límite de filiales alcanzado' : null;
        card.append(h('div', { class: 'muted' }, `Abrir filial: +${fmtNum(subsidiarySales(sel, 0))} uds/día de venta, ${m(subsidiaryUpkeep(sel, 0))}/día de coste.`),
          h('button', { class: 'btn primary', disabled: !!err || s.cash < cost, onclick: () => { if (g.act(sim.openSubsidiary(s, sel.id))) g.toast(`🌍 Nueva filial en ${sel.name}`, 'good'); } }, err ?? `Abrir filial · ${m(cost)}`));
      } else if (sub && sub.level < 2) {
        const cost = subsidiaryCost(sel, sub.level + 1);
        card.append(h('button', { class: 'btn primary', disabled: s.cash < cost, onclick: () => g.act(sim.upgradeSubsidiary(s, sel.id)) }, `⬆️ Ampliar filial a nivel ${sub.level + 2} · ${m(cost)}`));
      }
      root.append(card);
    }

    const order = [...COUNTRIES].sort((a, b) => {
      const rank = (c: typeof a) => (c.id === s.home ? 0 : s.subsidiaries.some((x) => x.country === c.id) ? 1 : 2);
      return rank(a) - rank(b) || b.weight - a.weight;
    });
    root.append(h('h3', null, 'Países'));
    root.append(h('div', null, order.map((c) => {
      const sub = s.subsidiaries.find((x) => x.country === c.id);
      const status = c.id === s.home ? h('span', { class: 'tag accent' }, 'Sede') : sub ? h('span', { class: 'tag accent' }, `Filial N${sub.level + 1}`) : h('span', { class: 'faint num' }, m(subsidiaryCost(c, 0)));
      return h('div', { class: `country ${this.selectedCountry === c.id ? 'sel' : ''}`, onclick: () => { if (this.view !== 'world') this.hooks.setView('world'); this.selectCountry(c.id); } },
        h('span', { class: 'f' }, c.flag), h('span', { class: 'grow' }, c.name, h('span', { class: 'faint' }, ` · x${c.weight}`)), status);
    })));
    return root;
  }

  private tabNoticias(): HTMLElement {
    const s = this.game.s;
    return h('div', null, s.log.map((l) => h('div', { class: `log-item ${l.kind}` }, h('div', { class: 'd' }, fmtDate(l.day)), l.text)));
  }

  // ================================================================ toasts y modales

  private flushToasts() {
    const list = this.game.toasts;
    while (this.seenToasts < list.length) {
      const t = list[this.seenToasts++];
      const el = h('div', { class: `toast ${t.kind}` }, t.text);
      this.toasts.prepend(el);
      while (this.toasts.children.length > 4) this.toasts.lastElementChild!.remove();
      setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, t.kind === 'info' ? 3000 : 5500);
    }
    if (list.length > 200) { list.splice(0, list.length); this.seenToasts = 0; }
  }

  private modal(content: HTMLElement[], dismissable = true): () => void {
    const back = h('div', { class: 'modal-back' }, h('div', { class: 'modal glass' }, ...content));
    const close = () => back.remove();
    if (dismissable) back.addEventListener('pointerdown', (e) => { if (e.target === back) close(); });
    document.body.append(back);
    return close;
  }

  private choiceModal() {
    const p = this.game.s.pending;
    if (!p) return;
    const close = this.modal([
      h('h1', null, p.title), h('p', null, p.text),
      h('div', { class: 'row', style: 'justify-content:flex-end' }, p.options.map((o, i) => h('button', {
        class: `btn ${i === 0 ? 'primary' : ''}`, onclick: () => { close(); this.game.choose(o.action); },
      }, o.label))),
    ], false);
  }

  private endModal() {
    const s = this.game.s, m = (n: number) => this.game.money(n);
    const stats = h('div', { class: 'kv', style: 'margin:12px 0' },
      h('span', null, 'Tiempo'), h('span', null, `${(s.day / 360).toFixed(1)} años`),
      h('span', null, 'Valoración'), h('span', null, m(s.valuation)),
      h('span', null, 'Tu patrimonio'), h('span', null, m(s.valuation * s.ownership)),
      h('span', null, 'Plantilla'), h('span', null, fmtNum(s.last.staff)),
      h('span', null, 'Países'), h('span', null, `${sim.countriesPresent(s)}`),
      h('span', null, 'Edificios'), h('span', null, `${s.buildings.length}`));
    if (s.bankrupt) {
      this.modal([h('h1', null, '💸 Quiebra'), h('p', null, `${s.name} no ha podido pagar sus deudas y cierra sus puertas. Toda gran empresaria o empresario tiene algún fracaso: ¡inténtalo de nuevo!`), stats,
        h('button', { class: 'btn primary block', onclick: () => this.hooks.newGame() }, 'Nueva partida')], false);
    } else {
      const close = this.modal([h('h1', null, '🌐 ¡Multinacional!'), h('p', null, `De un garaje a una corporación global: ${s.name} está presente en ${sim.countriesPresent(s)} países. ¡Enhorabuena!`), stats,
        h('div', { class: 'row' }, h('button', { class: 'btn grow', onclick: () => this.hooks.newGame() }, 'Nueva partida'), h('button', { class: 'btn primary grow', onclick: () => close() }, 'Seguir jugando'))]);
    }
  }

  private settingsModal() {
    const e = this.engine;
    const qSel = h('select', { onchange: (ev: Event) => e.setQuality((ev.target as HTMLSelectElement).value as Quality) },
      (Object.keys(QUALITY) as Quality[]).map((q) => h('option', { value: q, selected: q === e.quality }, QUALITY[q].label)));
    const check = (label: string, value: boolean, fn: (v: boolean) => void) => h('label', { class: 'row', style: 'cursor:pointer;margin-bottom:8px' },
      h('input', { type: 'checkbox', checked: value, onchange: (ev: Event) => fn((ev.target as HTMLInputElement).checked) }), label);
    const close = this.modal([
      h('h1', null, '⚙️ Ajustes'),
      h('p', null, `Motor gráfico: `, h('b', null, e.backend), e.backend !== 'WebGPU' ? ' (tu navegador no soporta WebGPU; se usa WebGL2 automáticamente)' : ''),
      h('div', { class: 'field' }, h('label', null, 'Calidad gráfica'), qSel),
      check('Resolución dinámica (mantiene los FPS)', e.adaptive, (v) => { e.adaptive = v; }),
      check('Ciclo día/noche', this.city.dayNight, (v) => { this.city.dayNight = v; }),
      check('Mostrar FPS', this.showFps, (v) => { this.showFps = v; this.perf.style.display = v ? '' : 'none'; }),
      h('div', { class: 'sep' }),
      h('div', { class: 'row' },
        h('button', { class: 'btn grow', onclick: () => { this.game.save(); this.game.toast('Partida guardada', 'info', false); close(); } }, '💾 Guardar'),
        h('button', { class: 'btn danger grow', onclick: (ev: Event) => {
          const b = ev.currentTarget as HTMLButtonElement;
          if (b.dataset.armed) { close(); this.hooks.newGame(); } else { b.dataset.armed = '1'; b.textContent = '¿Seguro? Se perderá la partida'; }
        } }, '🗑️ Nueva partida')),
      h('div', { class: 'row', style: 'margin-top:10px;justify-content:flex-end' }, h('button', { class: 'btn primary', onclick: () => close() }, 'Cerrar')),
    ]);
  }

  helpModal() {
    const close = this.modal([
      h('h1', null, '❓ Cómo jugar'),
      h('p', null, 'Empiezas en un garaje con algo de dinero. Tu objetivo: convertir tu empresa en una multinacional con presencia en 8 países y una valoración de 8.000 millones.'),
      h('div', { class: 'col', style: 'line-height:1.5' },
        h('div', null, '🏭 ', h('b', null, 'Fábricas'), ' producen el producto que les asignes. ', h('b', null, 'Tiendas'), ' y oficinas dan capacidad de venta, y los ', h('b', null, 'almacenes'), ' la logística.'),
        h('div', null, '🏢 Cada edificio necesita personal: las ', h('b', null, 'oficinas'), ' dan capacidad de gestión. Si te quedas corto, la eficiencia cae.'),
        h('div', null, '🔬 Los ', h('b', null, 'laboratorios'), ' generan puntos de I+D para desbloquear productos más rentables y mejoras.'),
        h('div', null, '⭐ La ', h('b', null, 'marca'), ', la calidad y el precio deciden tu cuota frente a la competencia.'),
        h('div', null, '🌍 Con la ', h('b', null, 'sede corporativa'), ' y Comercio internacional puedes abrir filiales en otros países desde el mapa mundial.'),
        h('div', { class: 'sep' }),
        h('div', { class: 'muted' }, 'Controles: arrastra para mover la cámara, clic derecho o dos dedos para girar, rueda para zoom. WASD mueve, Q/E gira. Espacio pausa, 1-4 velocidad, B construir, M mapa, P panel, Esc cancelar.'),
      ),
      h('div', { class: 'row', style: 'margin-top:14px;justify-content:flex-end' }, h('button', { class: 'btn primary', onclick: () => close() }, '¡A por ello!')),
    ]);
  }
}

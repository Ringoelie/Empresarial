// Simulación económica: un paso = un día de juego. Sin dependencias del DOM (testeable en Node).
import {
  BUILDINGS, PRODUCTS, PRODUCT_ORDER, RESEARCH_BY_ID, COUNTRY_BY_ID, BASE_SALARY, DAYS_PER_MONTH,
  TAX_RATE, STAGES, GRID, SUBSIDIARY_LIMIT, subsidiaryCost, subsidiarySales, subsidiaryUpkeep,
  BuildingId, ProductId, ResearchDef, CountryDef,
} from './data';
import { GameState, DayReport, Building, Effect, emptyReport, plotXZ } from './state';

/** Días de demanda que se intentan mantener en stock. */
export const STOCK_DAYS = 2;

export interface Mods {
  prod: number;
  quality: number;
  brandMult: number;
  salesMult: number;
  storageMult: number;
  factoryStaff: number;
  mgmtMult: number;
  morale: number;
  interest: number;
  costMult: number;
}

export function researchMods(s: GameState): Mods {
  const m: Mods = { prod: 1, quality: 1, brandMult: 1, salesMult: 1, storageMult: 1, factoryStaff: 1, mgmtMult: 1, morale: 0, interest: 1, costMult: 1 };
  for (const id of s.research) {
    const r = RESEARCH_BY_ID[id];
    if (!r) continue;
    if (r.prod) m.prod += r.prod;
    if (r.quality) m.quality += r.quality;
    if (r.brandMult) m.brandMult += r.brandMult;
    if (r.salesMult) m.salesMult += r.salesMult;
    if (r.storageMult) m.storageMult += r.storageMult;
    if (r.factoryStaff) m.factoryStaff -= r.factoryStaff;
    if (r.mgmtMult) m.mgmtMult += r.mgmtMult;
    if (r.morale) m.morale += r.morale;
    if (r.interest) m.interest -= r.interest;
    if (r.costMult) m.costMult -= r.costMult;
  }
  m.factoryStaff = Math.max(0.3, m.factoryStaff);
  m.costMult = Math.max(0.5, m.costMult);
  return m;
}

export const hasResearch = (s: GameState, id: string) => s.research.includes(id);

export function isProductUnlocked(s: GameState, p: ProductId): boolean {
  return hasResearch(s, PRODUCTS[p].requires);
}

export function unlockedProducts(s: GameState): ProductId[] {
  return PRODUCT_ORDER.filter((p) => isProductUnlocked(s, p));
}

export function buildingStaff(b: Building, mods: Mods): number {
  const lv = BUILDINGS[b.type].levels[b.level];
  return Math.round(lv.staff * (b.type === 'factory' ? mods.factoryStaff : 1));
}

export function effectMult(s: GameState, kind: Effect['kind'], product?: ProductId): number {
  let m = 1;
  for (const e of s.effects) if (e.kind === kind && (e.product === undefined || e.product === product)) m *= e.mult;
  return m;
}

export function hqLevel(s: GameState): number {
  const hq = s.buildings.find((b) => b.type === 'hq');
  return hq ? hq.level + 1 : 0;
}

export function subsidiaryLimit(s: GameState): number {
  return SUBSIDIARY_LIMIT[hqLevel(s)];
}

export function countriesPresent(s: GameState): number {
  return 1 + s.subsidiaries.length;
}

export function plotPrice(s: GameState, plot: number): number {
  const { x, z } = plotXZ(plot);
  const c = (GRID - 1) / 2;
  const d = Math.hypot(x - c, z - c);
  const ownedCount = s.owned.filter(Boolean).length;
  return Math.round((5000 + 2500 * Math.pow(Math.max(0, 7 - d), 1.4)) * (1 + Math.max(0, ownedCount - 4) * 0.05) / 100) * 100;
}

export function creditLimit(s: GameState): number {
  return Math.max(60_000, s.valuation * 0.35);
}

export function interestRate(s: GameState): number {
  return 0.1 * researchMods(s).interest;
}

export function assetValue(s: GameState): number {
  let v = 0;
  for (const b of s.buildings) {
    const def = BUILDINGS[b.type];
    for (let l = 0; l <= b.level; l++) v += def.levels[l].cost;
  }
  for (const sub of s.subsidiaries) {
    const c = COUNTRY_BY_ID[sub.country];
    for (let l = 0; l <= sub.level; l++) v += subsidiaryCost(c, l);
  }
  v += s.owned.filter(Boolean).length * 6000;
  return v;
}

export function computeValuation(s: GameState): number {
  let inv = 0;
  for (const p of PRODUCT_ORDER) inv += s.products[p].inventory * PRODUCTS[p].unitCost;
  const annual = Math.max(0, s.profitEma) * 365;
  const multiple = 4 + s.brand / 15 + Math.min(6, s.subsidiaries.length * 0.5);
  return Math.max(0, s.cash - s.debt + assetValue(s) * 0.6 + inv * 0.5 + annual * multiple);
}

function marketingEffect(budget: number): number {
  return Math.sqrt(Math.max(0, budget)) / 150;
}

export interface Derived {
  mods: Mods;
  staff: number;
  mgmtCap: number;
  mgmtFactor: number;
  moraleTarget: number;
  efficiency: number;
  capacity: Record<string, number>; // puntos de producción por producto
  salesCap: number;
  storage: number;
  research: number;
  brandGain: number;
  upkeep: number;
  quality: number;
}

export function derive(s: GameState): Derived {
  const mods = researchMods(s);
  let staff = 0, mgmt = 0, sales = 0, online = 0, storage = 0, research = 0, brand = 0, upkeep = 0, moraleB = 0;
  const capacity: Record<string, number> = {};
  for (const b of s.buildings) {
    const lv = BUILDINGS[b.type].levels[b.level];
    staff += buildingStaff(b, mods);
    upkeep += lv.upkeep;
    mgmt += lv.mgmt ?? 0;
    sales += lv.sales ?? 0;
    online += lv.online ?? 0;
    storage += lv.storage ?? 0;
    research += lv.research ?? 0;
    brand += lv.brand ?? 0;
    moraleB += lv.morale ?? 0;
    if (lv.production && b.product) capacity[b.product] = (capacity[b.product] ?? 0) + lv.production;
  }
  mgmt *= mods.mgmtMult;
  const mgmtFactor = staff <= mgmt ? 1 : Math.max(0.35, Math.pow(mgmt / staff, 0.8));
  const moraleTarget = Math.max(0, Math.min(100,
    55 + (s.salaryLevel - 1) * 90 + Math.min(25, moraleB) + mods.morale - (1 - mgmtFactor) * 50 + (effectMult(s, 'morale') - 1) * 100));
  const efficiency = mgmtFactor * Math.min(1.1, 0.6 + 0.5 * s.morale / 100);
  for (const sub of s.subsidiaries) sales += subsidiarySales(COUNTRY_BY_ID[sub.country], sub.level);
  const salesCap = (sales * efficiency + online) * mods.salesMult;
  const brandGain = (brand + marketingEffect(s.marketingBudget)) * mods.brandMult;
  return {
    mods, staff, mgmtCap: mgmt, mgmtFactor, moraleTarget, efficiency, capacity, salesCap,
    storage: storage * mods.storageMult, research: research * efficiency, brandGain, upkeep, quality: mods.quality,
  };
}

interface Market { country: CountryDef; reach: number; foreign: boolean }

export function markets(s: GameState): Market[] {
  const list: Market[] = [{ country: COUNTRY_BY_ID[s.home], reach: 1, foreign: false }];
  for (const sub of s.subsidiaries) list.push({ country: COUNTRY_BY_ID[sub.country], reach: 0.8 + sub.level * 0.25, foreign: true });
  return list;
}

/** Demanda y cuota esperadas de un producto con un multiplicador de precio dado. */
export function productDemand(s: GameState, p: ProductId, priceMult: number, quality: number): { demand: number; share: number } {
  const def = PRODUCTS[p];
  const global = hasResearch(s, 'globalbrand');
  const growth = 1 + s.day / 2500;
  const ev = effectMult(s, 'demand') * effectMult(s, 'productDemand', p);
  let demand = 0, size = 0;
  for (const m of markets(s)) {
    const tariff = m.foreign ? m.country.tariff * (global ? 0.5 : 1) : 0;
    const brandFactor = 0.25 + (s.brand / 100) * 1.5 * (m.foreign && !global ? 0.6 : 1);
    const attract = quality * brandFactor * Math.pow(1 / (priceMult * (1 + tariff)), def.elasticity);
    const comp = s.competitors[def.sector];
    const share = attract / (attract + comp);
    const market = def.demand * m.country.weight * m.reach * growth * ev;
    size += market;
    demand += market * share;
  }
  return { demand, share: size > 0 ? demand / size : 0 };
}

export interface StepResult {
  report: DayReport;
  messages: { text: string; kind: 'info' | 'good' | 'bad' | 'event' }[];
  newMonth: boolean;
  stageUp: boolean;
  researched: string[];
}

export function step(s: GameState): StepResult {
  const msgs: StepResult['messages'] = [];
  const researched: string[] = [];
  const d = derive(s);
  const r = emptyReport();
  const prodEvent = effectMult(s, 'prod');
  const costEvent = effectMult(s, 'cost');

  // Moral
  s.morale += (d.moraleTarget - s.morale) * 0.06;

  // Producción potencial (limitada a demanda + stock objetivo) y demanda
  const potential: Record<string, number> = {};
  const alloc: Record<string, number> = {};
  let physicalDemand = 0;
  for (const p of PRODUCT_ORDER) {
    const ps = s.products[p];
    const unlocked = isProductUnlocked(s, p);
    const cap = d.capacity[p] ?? 0;
    const maxProd = (cap * d.mods.prod * d.efficiency * prodEvent) / PRODUCTS[p].complexity;
    if (!unlocked || (cap === 0 && ps.inventory < 0.5)) {
      ps.demand = 0; ps.share = 0; alloc[p] = 0; potential[p] = 0;
      continue;
    }
    const { demand, share } = productDemand(s, p, ps.priceMult, d.quality);
    ps.demand = demand;
    ps.share = share;
    alloc[p] = demand;
    // Producción bajo demanda: cubre la demanda y mantiene un colchón de STOCK_DAYS días
    const target = PRODUCTS[p].volume > 0 ? demand * (1 + STOCK_DAYS) - ps.inventory : demand;
    potential[p] = Math.max(0, Math.min(maxProd, target));
    if (PRODUCTS[p].volume > 0) physicalDemand += Math.min(demand, ps.inventory + potential[p]);
  }
  // Capacidad de venta compartida entre productos físicos
  const salesScale = physicalDemand > d.salesCap ? d.salesCap / physicalDemand : 1;

  // Ventas previstas
  let volAfterSales = 0, volProd = 0;
  const sold: Record<string, number> = {};
  for (const p of PRODUCT_ORDER) {
    const ps = s.products[p];
    const def = PRODUCTS[p];
    const want = def.volume > 0 ? Math.min(alloc[p], ps.inventory + potential[p]) * salesScale : alloc[p];
    sold[p] = Math.min(want, ps.inventory + potential[p]);
    volAfterSales += Math.max(0, ps.inventory - sold[p]) * def.volume;
    volProd += potential[p] * def.volume;
  }
  // Toda la producción física del día pasa por el almacén: su capacidad limita la logística.
  const free = Math.max(0, d.storage - volAfterSales);
  const prodScale = volProd > 0 ? Math.min(1, free / volProd) : 1;

  let storageUsed = 0;
  for (const p of PRODUCT_ORDER) {
    const ps = s.products[p];
    const def = PRODUCTS[p];
    const produced = def.volume > 0 ? potential[p] * prodScale : potential[p];
    const actualSold = Math.min(sold[p], ps.inventory + produced);
    ps.inventory = Math.max(0, ps.inventory + produced - actualSold);
    if (def.volume === 0) ps.inventory = 0; // lo digital no se almacena
    ps.produced = produced;
    ps.sold = actualSold;
    r.materials += produced * def.unitCost * d.mods.costMult * costEvent;
    r.revenue += actualSold * def.price * ps.priceMult;
    storageUsed += Math.max(ps.inventory, produced) * def.volume;
  }
  r.logistics = volProd > 0 ? prodScale : 1;

  // Costes
  const wage = COUNTRY_BY_ID[s.home].wage;
  r.salaries = d.staff * BASE_SALARY * s.salaryLevel * wage;
  r.upkeep = d.upkeep;
  r.marketing = s.marketingBudget;
  r.interest = (s.debt * interestRate(s)) / 365;
  for (const sub of s.subsidiaries) r.subsidiaries += subsidiaryUpkeep(COUNTRY_BY_ID[sub.country], sub.level);
  r.holding = storageUsed * 0.02;
  r.expenses = r.salaries + r.upkeep + r.materials + r.marketing + r.interest + r.subsidiaries + r.holding;
  r.profit = r.revenue - r.expenses;
  s.cash += r.profit;
  s.monthRevenue += r.revenue;
  s.monthExpenses += r.expenses;
  s.profitEma += (r.profit - s.profitEma) / 45;

  // Marca
  const brandGain = d.brandGain * (1 - s.brand / 100) + (d.quality - 1) * 0.004;
  s.brand = Math.max(0, Math.min(100, s.brand + brandGain - s.brand * 0.003));

  // I+D
  r.research = d.research;
  s.rp += d.research;
  if (s.researchTarget) {
    const def = RESEARCH_BY_ID[s.researchTarget];
    if (def && s.rp >= def.cost) {
      completeResearch(s, def);
      researched.push(def.id);
      msgs.push({ text: `Investigación completada: ${def.icon} ${def.name}`, kind: 'good' });
    }
  }

  // Competencia: el mercado madura
  for (const k of Object.keys(s.competitors) as (keyof typeof s.competitors)[]) s.competitors[k] *= 1.0003;

  // Efectos temporales
  s.effects = s.effects.filter((e) => e.until > s.day);

  // Quiebra
  if (s.cash < 0) {
    s.negativeDays++;
    if (s.negativeDays === 1) msgs.push({ text: 'Caja en negativo. Tienes 45 días para recuperarte (pide un préstamo o reduce costes).', kind: 'bad' });
    if (s.negativeDays === 30) msgs.push({ text: '¡Quedan 15 días antes de la quiebra!', kind: 'bad' });
    if (s.negativeDays >= 45) s.bankrupt = true;
  } else s.negativeDays = 0;

  s.day++;

  // Mes
  let newMonth = false;
  if (s.day % DAYS_PER_MONTH === 0) {
    newMonth = true;
    const profit = s.monthRevenue - s.monthExpenses;
    let tax = 0;
    if (profit > 0) {
      tax = profit * TAX_RATE;
      s.cash -= tax;
    }
    s.history.push({
      month: s.day / DAYS_PER_MONTH, revenue: s.monthRevenue, expenses: s.monthExpenses + tax,
      profit: profit - tax, cash: s.cash, valuation: s.valuation,
    });
    if (s.history.length > 60) s.history.shift();
    s.monthRevenue = 0;
    s.monthExpenses = 0;
  }

  s.valuation = computeValuation(s);

  // Etapas
  let stageUp = false;
  while (s.stage + 1 < STAGES.length) {
    const next = STAGES[s.stage + 1];
    if (s.valuation >= next.valuation && countriesPresent(s) >= next.countries) {
      s.stage++;
      stageUp = true;
      msgs.push({ text: `¡Nueva etapa! ${next.icon} Ahora eres: ${next.name}`, kind: 'good' });
    } else break;
  }

  r.staff = d.staff;
  r.mgmtCap = d.mgmtCap;
  r.efficiency = d.efficiency;
  r.salesCap = d.salesCap;
  r.physicalDemand = physicalDemand;
  r.storage = d.storage;
  r.storageUsed = storageUsed;
  r.brandGain = brandGain;
  s.last = r;
  return { report: r, messages: msgs, newMonth, stageUp, researched };
}

function completeResearch(s: GameState, def: ResearchDef) {
  s.rp -= def.cost;
  s.research.push(def.id);
  s.researchTarget = null;
}

// ---------------------------------------------------------------- Acciones

export interface ActionResult { ok: boolean; msg?: string }
const fail = (msg: string): ActionResult => ({ ok: false, msg });

export function canAfford(s: GameState, cost: number) { return s.cash >= cost; }

export function buyPlot(s: GameState, plot: number): ActionResult {
  if (s.owned[plot]) return fail('Ya es tuya.');
  const price = plotPrice(s, plot);
  if (!canAfford(s, price)) return fail('No tienes suficiente dinero.');
  s.cash -= price;
  s.owned[plot] = true;
  return { ok: true };
}

export function buildingAt(s: GameState, plot: number): Building | undefined {
  return s.buildings.find((b) => b.plot === plot);
}

export function canBuild(s: GameState, type: BuildingId): string | null {
  const def = BUILDINGS[type];
  if (!def.buildable) return 'No se puede construir.';
  if (def.requires && !hasResearch(s, def.requires)) return `Requiere investigar ${RESEARCH_BY_ID[def.requires].name}.`;
  if (def.unique && s.buildings.some((b) => b.type === type)) return 'Solo puede haber una.';
  if (type === 'hq' && s.stage < hqStageRequired(0)) return `Requiere ser ${STAGES[hqStageRequired(0)].name}.`;
  return null;
}

export function build(s: GameState, plot: number, type: BuildingId, product?: ProductId): ActionResult {
  if (!s.owned[plot]) return fail('Primero compra la parcela.');
  if (buildingAt(s, plot)) return fail('La parcela está ocupada.');
  const err = canBuild(s, type);
  if (err) return fail(err);
  const cost = BUILDINGS[type].levels[0].cost;
  if (!canAfford(s, cost)) return fail('No tienes suficiente dinero.');
  s.cash -= cost;
  const b: Building = { id: s.nextId++, type, level: 0, plot, builtDay: s.day };
  if (type === 'factory') b.product = product ?? defaultProduct(s);
  s.buildings.push(b);
  return { ok: true };
}

export function defaultProduct(s: GameState): ProductId {
  const list = unlockedProducts(s);
  // el producto con mejor margen por punto de capacidad
  let best = list[0];
  let bestV = -Infinity;
  for (const p of list) {
    const d = PRODUCTS[p];
    const v = (d.price - d.unitCost) / d.complexity;
    if (v > bestV) { bestV = v; best = p; }
  }
  return best;
}

/** Etapa mínima para tener la sede en el nivel indicado (0-index). */
export const hqStageRequired = (level: number) => 2 + level;

export function upgradeCost(b: Building): number | null {
  const def = BUILDINGS[b.type];
  if (b.level + 1 >= def.levels.length) return null;
  return def.levels[b.level + 1].cost;
}

export function upgrade(s: GameState, id: number): ActionResult {
  const b = s.buildings.find((x) => x.id === id);
  if (!b) return fail('No existe.');
  const cost = upgradeCost(b);
  if (cost === null) return fail('Nivel máximo.');
  if (b.type === 'hq' && s.stage < hqStageRequired(b.level + 1)) return fail(`Requiere ser ${STAGES[hqStageRequired(b.level + 1)].name}.`);
  if (!canAfford(s, cost)) return fail('No tienes suficiente dinero.');
  s.cash -= cost;
  b.level++;
  b.builtDay = s.day;
  return { ok: true };
}

export function demolish(s: GameState, id: number): ActionResult {
  const i = s.buildings.findIndex((x) => x.id === id);
  if (i < 0) return fail('No existe.');
  const b = s.buildings[i];
  if (b.type === 'garage' && s.buildings.length === 1) return fail('Es tu único edificio.');
  const def = BUILDINGS[b.type];
  let refund = 0;
  for (let l = 0; l <= b.level; l++) refund += def.levels[l].cost;
  s.cash += refund * 0.3;
  s.buildings.splice(i, 1);
  return { ok: true, msg: `Recuperas ${Math.round(refund * 0.3)}` };
}

export function setFactoryProduct(s: GameState, id: number, p: ProductId): ActionResult {
  const b = s.buildings.find((x) => x.id === id);
  if (!b || !BUILDINGS[b.type].levels[b.level].production) return fail('No produce.');
  if (!isProductUnlocked(s, p)) return fail('Producto bloqueado.');
  b.product = p;
  return { ok: true };
}

export function researchAvailable(s: GameState, def: ResearchDef): boolean {
  return !hasResearch(s, def.id) && def.requires.every((r) => hasResearch(s, r));
}

export function startResearch(s: GameState, id: string): ActionResult {
  const def = RESEARCH_BY_ID[id];
  if (!def || !researchAvailable(s, def)) return fail('No disponible.');
  if (s.rp >= def.cost) {
    completeResearch(s, def);
    return { ok: true, msg: `Investigación completada: ${def.name}` };
  }
  s.researchTarget = id;
  return { ok: true };
}

export function openSubsidiary(s: GameState, countryId: string): ActionResult {
  const c = COUNTRY_BY_ID[countryId];
  if (!c || countryId === s.home) return fail('País no válido.');
  if (!hasResearch(s, 'intl')) return fail('Investiga Comercio internacional.');
  if (s.subsidiaries.some((x) => x.country === countryId)) return fail('Ya tienes filial.');
  if (s.subsidiaries.length >= subsidiaryLimit(s)) return fail('Mejora la sede corporativa para abrir más filiales.');
  const cost = subsidiaryCost(c, 0);
  if (!canAfford(s, cost)) return fail('No tienes suficiente dinero.');
  s.cash -= cost;
  s.subsidiaries.push({ country: countryId, level: 0, openedDay: s.day });
  return { ok: true };
}

export function upgradeSubsidiary(s: GameState, countryId: string): ActionResult {
  const sub = s.subsidiaries.find((x) => x.country === countryId);
  if (!sub) return fail('No hay filial.');
  if (sub.level >= 2) return fail('Nivel máximo.');
  const cost = subsidiaryCost(COUNTRY_BY_ID[countryId], sub.level + 1);
  if (!canAfford(s, cost)) return fail('No tienes suficiente dinero.');
  s.cash -= cost;
  sub.level++;
  return { ok: true };
}

export function takeLoan(s: GameState, amount: number): ActionResult {
  if (s.debt + amount > creditLimit(s)) return fail('El banco no te presta tanto.');
  s.debt += amount;
  s.cash += amount;
  return { ok: true };
}

export function repayLoan(s: GameState, amount: number): ActionResult {
  const a = Math.min(amount, s.debt);
  if (a <= 0) return fail('No tienes deuda.');
  if (!canAfford(s, a)) return fail('No tienes suficiente dinero.');
  s.debt -= a;
  s.cash -= a;
  return { ok: true };
}

export const IPO_MIN_VALUATION = 60_000_000;

export function goPublic(s: GameState): ActionResult {
  if (s.ipo) return fail('Ya cotizas en bolsa.');
  if (!hasResearch(s, 'finance')) return fail('Investiga Ingeniería financiera.');
  if (s.valuation < IPO_MIN_VALUATION) return fail('Valoración insuficiente.');
  const raise = s.valuation * 0.2;
  s.cash += raise;
  s.ownership *= 0.8;
  s.ipo = true;
  return { ok: true, msg: `Salida a bolsa: recaudas ${Math.round(raise)}` };
}

export function sharePrice(s: GameState): number {
  return s.valuation / 100_000_000;
}

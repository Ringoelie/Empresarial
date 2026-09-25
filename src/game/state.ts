import {
  BuildingId, ProductId, SectorId, PRODUCT_ORDER, GRID, RESEARCH, COUNTRY_BY_ID,
} from './data';

export interface Building {
  id: number;
  type: BuildingId;
  level: number; // 0-index
  plot: number;
  product?: ProductId;
  builtDay: number;
}

export interface ProductState {
  priceMult: number;
  inventory: number;
  // estadísticas del último día
  produced: number;
  demand: number;
  sold: number;
  share: number;
}

export interface Subsidiary {
  country: string;
  level: number; // 0-index
  openedDay: number;
}

export interface Effect {
  id: string;
  name: string;
  kind: 'demand' | 'prod' | 'productDemand' | 'cost' | 'morale';
  mult: number;
  product?: ProductId;
  until: number;
}

export interface MonthRecord {
  month: number;
  revenue: number;
  expenses: number;
  profit: number;
  cash: number;
  valuation: number;
}

export interface LogEntry {
  day: number;
  text: string;
  kind: 'info' | 'good' | 'bad' | 'event';
}

export interface DayReport {
  revenue: number;
  salaries: number;
  upkeep: number;
  materials: number;
  marketing: number;
  interest: number;
  subsidiaries: number;
  holding: number;
  expenses: number;
  profit: number;
  research: number;
  staff: number;
  mgmtCap: number;
  efficiency: number;
  salesCap: number;
  physicalDemand: number;
  storage: number;
  storageUsed: number;
  brandGain: number;
  logistics: number; // 1 = el almacén no limita la producción
}

export interface PendingChoice {
  id: string;
  title: string;
  text: string;
  options: { label: string; action: string }[];
  data?: Record<string, number | string>;
}

export interface GameState {
  version: number;
  name: string;
  color: string;
  home: string;
  sector: SectorId;
  currency: string;
  day: number;
  cash: number;
  debt: number;
  rp: number;
  researchTarget: string | null;
  research: string[];
  brand: number;
  morale: number;
  salaryLevel: number;
  marketingBudget: number;
  owned: boolean[];
  buildings: Building[];
  nextId: number;
  products: Record<ProductId, ProductState>;
  subsidiaries: Subsidiary[];
  competitors: Record<SectorId, number>;
  effects: Effect[];
  history: MonthRecord[];
  monthRevenue: number;
  monthExpenses: number;
  profitEma: number;
  valuation: number;
  stage: number;
  log: LogEntry[];
  ipo: boolean;
  ownership: number; // participación del fundador (0..1)
  negativeDays: number;
  objectivesDone: string[];
  nextEventDay: number;
  won: boolean;
  bankrupt: boolean;
  pending: PendingChoice | null;
  last: DayReport;
}

export const plotIndex = (x: number, z: number) => z * GRID + x;
export const plotXZ = (i: number) => ({ x: i % GRID, z: Math.floor(i / GRID) });

export function emptyReport(): DayReport {
  return {
    revenue: 0, salaries: 0, upkeep: 0, materials: 0, marketing: 0, interest: 0, subsidiaries: 0, holding: 0,
    expenses: 0, profit: 0, research: 0, staff: 0, mgmtCap: 0, efficiency: 1, salesCap: 0, physicalDemand: 0,
    storage: 0, storageUsed: 0, brandGain: 0, logistics: 1,
  };
}

export interface NewGameOptions {
  name: string;
  color: string;
  home: string;
  sector: SectorId;
}

export function newGame(opts: NewGameOptions): GameState {
  const products = {} as Record<ProductId, ProductState>;
  for (const id of PRODUCT_ORDER) {
    products[id] = { priceMult: 1, inventory: 0, produced: 0, demand: 0, sold: 0, share: 0 };
  }
  const owned = new Array(GRID * GRID).fill(false);
  const c = Math.floor(GRID / 2) - 1;
  for (const [x, z] of [[c, c], [c + 1, c], [c, c + 1], [c + 1, c + 1]]) owned[plotIndex(x, z)] = true;
  const entry = RESEARCH.find((r) => r.unlocksSector === opts.sector)!;
  const starter: Record<SectorId, ProductId> = { food: 'cafe', fashion: 'camisetas', tech: 'app', energy: 'solar', auto: 'patinete' };
  const home = COUNTRY_BY_ID[opts.home];
  const s: GameState = {
    version: 1,
    name: opts.name,
    color: opts.color,
    home: opts.home,
    sector: opts.sector,
    currency: home.id === 'es' ? '€' : '$',
    day: 0,
    cash: 60_000,
    debt: 0,
    rp: 0,
    researchTarget: null,
    research: [entry.id],
    brand: 5,
    morale: 60,
    salaryLevel: 1,
    marketingBudget: 0,
    owned,
    buildings: [{ id: 1, type: 'garage', level: 0, plot: plotIndex(c, c), product: starter[opts.sector], builtDay: 0 }],
    nextId: 2,
    products,
    subsidiaries: [],
    competitors: { food: 1, fashion: 1, tech: 1.1, energy: 1.2, auto: 1.3 },
    effects: [],
    history: [],
    monthRevenue: 0,
    monthExpenses: 0,
    profitEma: 0,
    valuation: 60_000,
    stage: 0,
    log: [{ day: 0, text: `Nace ${opts.name} en un garaje de ${home.name}. ¡Suerte!`, kind: 'info' }],
    ipo: false,
    ownership: 1,
    negativeDays: 0,
    objectivesDone: [],
    nextEventDay: 30,
    won: false,
    bankrupt: false,
    pending: null,
    last: emptyReport(),
  };
  return s;
}

// Definiciones estáticas del juego: edificios, productos, investigación, países y etapas.

export type SectorId = 'food' | 'fashion' | 'tech' | 'energy' | 'auto';

export const SECTORS: Record<SectorId, { name: string; icon: string }> = {
  food: { name: 'Alimentación', icon: '☕' },
  fashion: { name: 'Moda', icon: '👕' },
  tech: { name: 'Tecnología', icon: '💻' },
  energy: { name: 'Energía', icon: '🔋' },
  auto: { name: 'Automoción', icon: '🚗' },
};

export type BuildingId =
  | 'garage' | 'office' | 'factory' | 'store' | 'warehouse'
  | 'lab' | 'marketing' | 'datacenter' | 'hq' | 'park';

export interface BuildingLevel {
  cost: number;
  upkeep: number; // por día
  staff: number;
  production?: number; // puntos de capacidad/día
  sales?: number; // unidades/día de capacidad de venta
  online?: number; // capacidad de venta online
  storage?: number; // volumen
  research?: number; // puntos I+D/día
  mgmt?: number; // capacidad de gestión (empleados)
  brand?: number; // marca/día
  morale?: number; // moral
}

export interface BuildingDef {
  id: BuildingId;
  name: string;
  icon: string;
  desc: string;
  levels: BuildingLevel[];
  buildable: boolean;
  unique?: boolean;
  requires?: string; // investigación
}

export const BUILDINGS: Record<BuildingId, BuildingDef> = {
  garage: {
    id: 'garage', name: 'Garaje', icon: '🏚️', buildable: false,
    desc: 'Donde empezó todo. Produce y vende un poco de todo.',
    levels: [{ cost: 0, upkeep: 15, staff: 2, production: 24, sales: 30, storage: 300, research: 0.6, mgmt: 12 }],
  },
  office: {
    id: 'office', name: 'Oficinas', icon: '🏢', buildable: true,
    desc: 'Capacidad de gestión para coordinar a más empleados, algo de I+D y ventas B2B.',
    levels: [
      { cost: 22_000, upkeep: 40, staff: 4, mgmt: 40, research: 0.4, sales: 30 },
      { cost: 75_000, upkeep: 120, staff: 10, mgmt: 130, research: 1.2, sales: 90 },
      { cost: 260_000, upkeep: 350, staff: 25, mgmt: 380, research: 3, sales: 250 },
    ],
  },
  factory: {
    id: 'factory', name: 'Fábrica', icon: '🏭', buildable: true,
    desc: 'Fabrica el producto que le asignes. Más nivel, más capacidad.',
    levels: [
      { cost: 35_000, upkeep: 50, staff: 6, production: 140 },
      { cost: 130_000, upkeep: 170, staff: 16, production: 480 },
      { cost: 480_000, upkeep: 550, staff: 40, production: 1600 },
    ],
  },
  store: {
    id: 'store', name: 'Tienda', icon: '🏬', buildable: true,
    desc: 'Aumenta la capacidad de venta de productos físicos y da algo de visibilidad.',
    levels: [
      { cost: 18_000, upkeep: 25, staff: 3, sales: 180, brand: 0.02 },
      { cost: 65_000, upkeep: 90, staff: 8, sales: 640, brand: 0.04 },
      { cost: 220_000, upkeep: 280, staff: 20, sales: 2200, brand: 0.08 },
    ],
  },
  warehouse: {
    id: 'warehouse', name: 'Almacén', icon: '📦', buildable: true,
    desc: 'Más espacio para inventario: la producción no se detiene.',
    levels: [
      { cost: 12_000, upkeep: 25, staff: 2, storage: 2500 },
      { cost: 45_000, upkeep: 80, staff: 6, storage: 9000 },
      { cost: 150_000, upkeep: 240, staff: 15, storage: 32000 },
    ],
  },
  lab: {
    id: 'lab', name: 'Laboratorio I+D', icon: '🔬', buildable: true,
    desc: 'Genera puntos de investigación para desbloquear productos y mejoras.',
    levels: [
      { cost: 45_000, upkeep: 80, staff: 5, research: 4 },
      { cost: 170_000, upkeep: 250, staff: 12, research: 13 },
      { cost: 600_000, upkeep: 750, staff: 30, research: 40 },
    ],
  },
  marketing: {
    id: 'marketing', name: 'Agencia de marketing', icon: '📣', buildable: true,
    desc: 'Hace crecer la marca día a día.',
    levels: [
      { cost: 30_000, upkeep: 60, staff: 4, brand: 0.1 },
      { cost: 110_000, upkeep: 200, staff: 10, brand: 0.25 },
      { cost: 380_000, upkeep: 600, staff: 25, brand: 0.55 },
    ],
  },
  datacenter: {
    id: 'datacenter', name: 'Centro de datos', icon: '🖥️', buildable: true, requires: 'ecommerce',
    desc: 'Tienda online a gran escala e I+D computacional.',
    levels: [
      { cost: 120_000, upkeep: 300, staff: 6, online: 600, research: 2 },
      { cost: 420_000, upkeep: 900, staff: 14, online: 2400, research: 6 },
      { cost: 1_400_000, upkeep: 2600, staff: 30, online: 9000, research: 18 },
    ],
  },
  hq: {
    id: 'hq', name: 'Sede corporativa', icon: '🏛️', buildable: true, unique: true,
    desc: 'El corazón de la corporación. Su nivel limita cuántas filiales internacionales puedes abrir.',
    levels: [
      { cost: 250_000, upkeep: 400, staff: 30, mgmt: 400, brand: 0.05, morale: 5 },
      { cost: 1_200_000, upkeep: 1200, staff: 80, mgmt: 1200, brand: 0.12, morale: 8 },
      { cost: 6_000_000, upkeep: 4000, staff: 200, mgmt: 4000, brand: 0.25, morale: 12 },
      { cost: 30_000_000, upkeep: 12000, staff: 500, mgmt: 12000, brand: 0.5, morale: 16 },
    ],
  },
  park: {
    id: 'park', name: 'Parque', icon: '🌳', buildable: true,
    desc: 'Zona verde para la plantilla: sube la moral.',
    levels: [{ cost: 8_000, upkeep: 10, staff: 0, morale: 3 }],
  },
};

export const BUILD_ORDER: BuildingId[] = ['factory', 'store', 'office', 'warehouse', 'lab', 'marketing', 'datacenter', 'park', 'hq'];

/** Filiales internacionales permitidas según el nivel de la sede (0 = sin sede). */
export const SUBSIDIARY_LIMIT = [0, 2, 4, 8, 99];

export type ProductId =
  | 'cafe' | 'snacks' | 'bebida'
  | 'camisetas' | 'zapatillas' | 'lujo'
  | 'app' | 'smartphone' | 'laptop' | 'chip'
  | 'solar' | 'bateria' | 'patinete' | 'coche';

export interface ProductDef {
  id: ProductId;
  name: string;
  icon: string;
  sector: SectorId;
  price: number; // precio de referencia
  unitCost: number;
  complexity: number; // puntos de capacidad por unidad
  demand: number; // unidades/día con peso de mercado 1
  elasticity: number;
  volume: number; // volumen de almacén por unidad (0 = digital)
  requires: string; // investigación que lo desbloquea
}

export const PRODUCTS: Record<ProductId, ProductDef> = {
  cafe: { id: 'cafe', name: 'Café artesanal', icon: '☕', sector: 'food', price: 12, unitCost: 3, complexity: 1, demand: 900, elasticity: 1.6, volume: 1, requires: 'food1' },
  snacks: { id: 'snacks', name: 'Snacks saludables', icon: '🥨', sector: 'food', price: 7, unitCost: 2, complexity: 0.7, demand: 1500, elasticity: 1.8, volume: 1, requires: 'food1' },
  bebida: { id: 'bebida', name: 'Bebida energética', icon: '🥤', sector: 'food', price: 4.5, unitCost: 1.1, complexity: 0.4, demand: 3000, elasticity: 1.9, volume: 1, requires: 'food2' },
  camisetas: { id: 'camisetas', name: 'Camisetas', icon: '👕', sector: 'fashion', price: 24, unitCost: 6, complexity: 2, demand: 450, elasticity: 1.5, volume: 1, requires: 'fashion1' },
  zapatillas: { id: 'zapatillas', name: 'Zapatillas', icon: '👟', sector: 'fashion', price: 95, unitCost: 30, complexity: 6, demand: 200, elasticity: 1.4, volume: 2, requires: 'fashion2' },
  lujo: { id: 'lujo', name: 'Moda de lujo', icon: '👜', sector: 'fashion', price: 1200, unitCost: 260, complexity: 40, demand: 25, elasticity: 0.8, volume: 2, requires: 'fashion3' },
  app: { id: 'app', name: 'App móvil', icon: '📱', sector: 'tech', price: 5, unitCost: 0.4, complexity: 0.6, demand: 1300, elasticity: 1.7, volume: 0, requires: 'tech1' },
  smartphone: { id: 'smartphone', name: 'Smartphone', icon: '📲', sector: 'tech', price: 480, unitCost: 220, complexity: 14, demand: 90, elasticity: 1.3, volume: 2, requires: 'tech2' },
  laptop: { id: 'laptop', name: 'Portátil', icon: '💻', sector: 'tech', price: 1150, unitCost: 560, complexity: 28, demand: 45, elasticity: 1.2, volume: 4, requires: 'tech3' },
  chip: { id: 'chip', name: 'Chip de IA', icon: '🧠', sector: 'tech', price: 4200, unitCost: 1300, complexity: 70, demand: 18, elasticity: 1.0, volume: 1, requires: 'tech4' },
  solar: { id: 'solar', name: 'Panel solar', icon: '☀️', sector: 'energy', price: 320, unitCost: 150, complexity: 10, demand: 120, elasticity: 1.2, volume: 6, requires: 'energy1' },
  bateria: { id: 'bateria', name: 'Batería industrial', icon: '🔋', sector: 'energy', price: 2200, unitCost: 1000, complexity: 50, demand: 30, elasticity: 1.0, volume: 10, requires: 'energy2' },
  patinete: { id: 'patinete', name: 'Patinete eléctrico', icon: '🛴', sector: 'auto', price: 650, unitCost: 290, complexity: 18, demand: 70, elasticity: 1.3, volume: 8, requires: 'auto1' },
  coche: { id: 'coche', name: 'Coche eléctrico', icon: '🚘', sector: 'auto', price: 36000, unitCost: 22000, complexity: 600, demand: 3, elasticity: 1.1, volume: 60, requires: 'auto2' },
};

export const PRODUCT_ORDER = Object.keys(PRODUCTS) as ProductId[];

export interface ResearchDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  cost: number;
  requires: string[];
  // efectos multiplicativos/aditivos
  prod?: number; // +% producción
  quality?: number; // +% calidad
  brandMult?: number; // +% ganancia de marca
  salesMult?: number; // +% capacidad de venta
  storageMult?: number;
  factoryStaff?: number; // -% personal en fábricas
  mgmtMult?: number;
  morale?: number;
  interest?: number; // -% tipo de interés
  costMult?: number; // -% coste unitario
  unlocksSector?: SectorId;
}

export const RESEARCH: ResearchDef[] = [
  { id: 'food1', name: 'Recetas propias', icon: '☕', desc: 'Desbloquea café artesanal y snacks.', cost: 25, requires: [], unlocksSector: 'food' },
  { id: 'fashion1', name: 'Taller textil', icon: '👕', desc: 'Desbloquea camisetas.', cost: 25, requires: [], unlocksSector: 'fashion' },
  { id: 'tech1', name: 'Desarrollo de software', icon: '📱', desc: 'Desbloquea apps móviles (producto digital: no ocupa almacén ni tiendas).', cost: 25, requires: [], unlocksSector: 'tech' },
  { id: 'lean', name: 'Producción lean', icon: '⚙️', desc: '+20% producción.', cost: 40, requires: [], prod: 0.2 },
  { id: 'marketing1', name: 'Marketing digital', icon: '📈', desc: '+50% crecimiento de marca.', cost: 35, requires: [], brandMult: 0.5 },
  { id: 'quality1', name: 'Control de calidad', icon: '✅', desc: '+15% calidad de todos los productos.', cost: 60, requires: [], quality: 0.15 },
  { id: 'logistics', name: 'Logística', icon: '🚚', desc: '+50% almacenaje y −5% coste unitario.', cost: 70, requires: [], storageMult: 0.5, costMult: 0.05 },
  { id: 'hr', name: 'Cultura corporativa', icon: '🤝', desc: '+10 moral de la plantilla.', cost: 90, requires: [], morale: 10 },
  { id: 'food2', name: 'Bebidas funcionales', icon: '🥤', desc: 'Desbloquea la bebida energética.', cost: 110, requires: ['food1'] },
  { id: 'fashion2', name: 'Diseño deportivo', icon: '👟', desc: 'Desbloquea zapatillas.', cost: 130, requires: ['fashion1'] },
  { id: 'ecommerce', name: 'Comercio electrónico', icon: '🛒', desc: 'Desbloquea el centro de datos y +20% capacidad de venta.', cost: 150, requires: ['marketing1'], salesMult: 0.2 },
  { id: 'tech2', name: 'Hardware móvil', icon: '📲', desc: 'Desbloquea smartphones.', cost: 260, requires: ['tech1', 'quality1'] },
  { id: 'automation1', name: 'Automatización', icon: '🤖', desc: '+30% producción y −20% personal en fábricas.', cost: 260, requires: ['lean'], prod: 0.3, factoryStaff: 0.2 },
  { id: 'marketing2', name: 'Influencers', icon: '🌟', desc: '+100% crecimiento de marca.', cost: 320, requires: ['marketing1'], brandMult: 1 },
  { id: 'quality2', name: 'Ingeniería avanzada', icon: '🧪', desc: '+25% calidad.', cost: 380, requires: ['quality1'], quality: 0.25 },
  { id: 'intl', name: 'Comercio internacional', icon: '🌍', desc: 'Permite abrir filiales en otros países (requiere sede corporativa).', cost: 1000, requires: ['logistics'] },
  { id: 'finance', name: 'Ingeniería financiera', icon: '🏦', desc: '−40% tipo de interés y acceso a salida a bolsa.', cost: 1100, requires: ['logistics'], interest: 0.4 },
  { id: 'energy1', name: 'Energía solar', icon: '☀️', desc: 'Desbloquea paneles solares.', cost: 1500, requires: ['quality1'], unlocksSector: 'energy' },
  { id: 'fashion3', name: 'Alta costura', icon: '👜', desc: 'Desbloquea moda de lujo.', cost: 2250, requires: ['fashion2', 'marketing2'] },
  { id: 'tech3', name: 'Computación personal', icon: '💻', desc: 'Desbloquea portátiles.', cost: 2250, requires: ['tech2'] },
  { id: 'automation2', name: 'Robótica industrial', icon: '🦾', desc: '+60% producción y −30% personal en fábricas.', cost: 3000, requires: ['automation1', 'quality2'], prod: 0.6, factoryStaff: 0.3 },
  { id: 'auto1', name: 'Movilidad eléctrica', icon: '🛴', desc: 'Desbloquea patinetes eléctricos.', cost: 2500, requires: ['energy1'], unlocksSector: 'auto' },
  { id: 'energy2', name: 'Almacenamiento energético', icon: '🔋', desc: 'Desbloquea baterías industriales.', cost: 4500, requires: ['energy1', 'quality2'] },
  { id: 'globalbrand', name: 'Marca global', icon: '🌐', desc: 'Tu marca pesa igual en el extranjero y −50% aranceles.', cost: 5000, requires: ['intl', 'marketing2'] },
  { id: 'quality3', name: 'Excelencia operativa', icon: '🏆', desc: '+40% calidad.', cost: 7500, requires: ['quality2', 'automation1'], quality: 0.4 },
  { id: 'aiops', name: 'IA en operaciones', icon: '🧠', desc: '+60% capacidad de gestión y −10% coste unitario.', cost: 8750, requires: ['tech3', 'automation1'], mgmtMult: 0.6, costMult: 0.1 },
  { id: 'tech4', name: 'Semiconductores de IA', icon: '🧬', desc: 'Desbloquea chips de IA.', cost: 12500, requires: ['tech3', 'quality2'] },
  { id: 'auto2', name: 'Automoción eléctrica', icon: '🚘', desc: 'Desbloquea coches eléctricos.', cost: 13750, requires: ['auto1', 'automation2'] },
  { id: 'gigafactory', name: 'Gigafactorías', icon: '🏗️', desc: '+100% producción.', cost: 22500, requires: ['automation2', 'energy2'], prod: 1 },
];

export const RESEARCH_BY_ID: Record<string, ResearchDef> = Object.fromEntries(RESEARCH.map((r) => [r.id, r]));

export interface CountryDef {
  id: string;
  name: string;
  flag: string;
  lat: number;
  lon: number;
  weight: number; // tamaño de mercado relativo
  wage: number; // multiplicador salarial
  tariff: number; // arancel para productos importados
}

export const COUNTRIES: CountryDef[] = [
  { id: 'es', name: 'España', flag: '🇪🇸', lat: 40.4, lon: -3.7, weight: 1.0, wage: 1.0, tariff: 0.05 },
  { id: 'mx', name: 'México', flag: '🇲🇽', lat: 19.4, lon: -99.1, weight: 1.1, wage: 0.6, tariff: 0.12 },
  { id: 'ar', name: 'Argentina', flag: '🇦🇷', lat: -34.6, lon: -58.4, weight: 0.7, wage: 0.6, tariff: 0.2 },
  { id: 'co', name: 'Colombia', flag: '🇨🇴', lat: 4.7, lon: -74.1, weight: 0.7, wage: 0.55, tariff: 0.12 },
  { id: 'cl', name: 'Chile', flag: '🇨🇱', lat: -33.4, lon: -70.6, weight: 0.5, wage: 0.75, tariff: 0.06 },
  { id: 'pe', name: 'Perú', flag: '🇵🇪', lat: -12.0, lon: -77.0, weight: 0.5, wage: 0.5, tariff: 0.08 },
  { id: 'br', name: 'Brasil', flag: '🇧🇷', lat: -23.5, lon: -46.6, weight: 1.6, wage: 0.6, tariff: 0.18 },
  { id: 'us', name: 'Estados Unidos', flag: '🇺🇸', lat: 40.7, lon: -74.0, weight: 4.0, wage: 1.6, tariff: 0.1 },
  { id: 'ca', name: 'Canadá', flag: '🇨🇦', lat: 43.7, lon: -79.4, weight: 1.2, wage: 1.3, tariff: 0.06 },
  { id: 'gb', name: 'Reino Unido', flag: '🇬🇧', lat: 51.5, lon: -0.1, weight: 1.5, wage: 1.3, tariff: 0.08 },
  { id: 'de', name: 'Alemania', flag: '🇩🇪', lat: 52.5, lon: 13.4, weight: 1.8, wage: 1.3, tariff: 0.05 },
  { id: 'fr', name: 'Francia', flag: '🇫🇷', lat: 48.9, lon: 2.35, weight: 1.5, wage: 1.2, tariff: 0.05 },
  { id: 'it', name: 'Italia', flag: '🇮🇹', lat: 41.9, lon: 12.5, weight: 1.2, wage: 1.0, tariff: 0.05 },
  { id: 'cn', name: 'China', flag: '🇨🇳', lat: 31.2, lon: 121.5, weight: 4.5, wage: 0.7, tariff: 0.25 },
  { id: 'jp', name: 'Japón', flag: '🇯🇵', lat: 35.7, lon: 139.7, weight: 2.0, wage: 1.3, tariff: 0.1 },
  { id: 'kr', name: 'Corea del Sur', flag: '🇰🇷', lat: 37.6, lon: 127.0, weight: 1.2, wage: 1.1, tariff: 0.1 },
  { id: 'in', name: 'India', flag: '🇮🇳', lat: 19.1, lon: 72.9, weight: 3.0, wage: 0.3, tariff: 0.22 },
  { id: 'ae', name: 'Emiratos Árabes', flag: '🇦🇪', lat: 25.2, lon: 55.3, weight: 0.6, wage: 1.2, tariff: 0.05 },
  { id: 'za', name: 'Sudáfrica', flag: '🇿🇦', lat: -26.2, lon: 28.0, weight: 0.6, wage: 0.5, tariff: 0.12 },
  { id: 'ng', name: 'Nigeria', flag: '🇳🇬', lat: 6.5, lon: 3.4, weight: 0.8, wage: 0.3, tariff: 0.2 },
  { id: 'au', name: 'Australia', flag: '🇦🇺', lat: -33.9, lon: 151.2, weight: 1.0, wage: 1.4, tariff: 0.06 },
  { id: 'sg', name: 'Singapur', flag: '🇸🇬', lat: 1.35, lon: 103.8, weight: 0.6, wage: 1.2, tariff: 0.03 },
];

export const COUNTRY_BY_ID: Record<string, CountryDef> = Object.fromEntries(COUNTRIES.map((c) => [c.id, c]));

export const HOME_CHOICES = ['es', 'mx', 'ar', 'co', 'cl', 'pe', 'us'];

export function subsidiaryCost(c: CountryDef, level: number): number {
  return Math.round(500_000 * Math.pow(c.weight, 0.85) * Math.pow(3, level) / 1000) * 1000;
}
export function subsidiaryUpkeep(c: CountryDef, level: number): number {
  return Math.round(1200 * c.weight * c.wage * (1 + level * 1.5));
}
export function subsidiarySales(c: CountryDef, level: number): number {
  return Math.round(260 * c.weight * Math.pow(3, level));
}

export interface StageDef {
  name: string;
  icon: string;
  valuation: number;
  countries: number;
}

export const STAGES: StageDef[] = [
  { name: 'Garaje', icon: '🏚️', valuation: 0, countries: 1 },
  { name: 'Startup', icon: '🚀', valuation: 500_000, countries: 1 },
  { name: 'PyME', icon: '🏪', valuation: 5_000_000, countries: 1 },
  { name: 'Mediana empresa', icon: '🏢', valuation: 40_000_000, countries: 1 },
  { name: 'Gran empresa', icon: '🏙️', valuation: 250_000_000, countries: 2 },
  { name: 'Corporación', icon: '🏛️', valuation: 1_500_000_000, countries: 4 },
  { name: 'Multinacional', icon: '🌐', valuation: 8_000_000_000, countries: 8 },
];

export const COMPANY_COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

export const BASE_SALARY = 45; // por empleado y día (multiplicado por el salario del país)
export const DAYS_PER_MONTH = 30;
export const TAX_RATE = 0.25;
export const GRID = 12; // parcelas por lado

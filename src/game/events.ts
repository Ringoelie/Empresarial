// Eventos aleatorios y decisiones.
import { PRODUCTS, SECTORS, SectorId } from './data';
import { GameState, PendingChoice } from './state';
import { unlockedProducts } from './sim';

export interface EventOutcome { text: string; kind: 'good' | 'bad' | 'event' }

type EventDef = {
  id: string;
  weight: (s: GameState) => number;
  run: (s: GameState) => EventOutcome | PendingChoice | null;
};

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

function activeProducts(s: GameState) {
  return unlockedProducts(s).filter((p) => s.products[p].produced > 0 || s.products[p].sold > 0);
}

function activeSectors(s: GameState): SectorId[] {
  return [...new Set(activeProducts(s).map((p) => PRODUCTS[p].sector))];
}

const EVENTS: EventDef[] = [
  {
    id: 'viral',
    weight: (s) => (activeProducts(s).length ? 3 : 0),
    run: (s) => {
      const p = pick(activeProducts(s));
      s.effects.push({ id: 'viral', name: `${PRODUCTS[p].icon} ${PRODUCTS[p].name} es viral`, kind: 'productDemand', product: p, mult: 2, until: s.day + 20 });
      return { text: `¡${PRODUCTS[p].name} se ha vuelto viral en redes! Demanda x2 durante 20 días.`, kind: 'good' };
    },
  },
  {
    id: 'crisis',
    weight: (s) => (s.day > 200 && !s.effects.some((e) => e.id === 'crisis') ? 1.5 : 0),
    run: (s) => {
      s.effects.push({ id: 'crisis', name: '📉 Crisis económica', kind: 'demand', mult: 0.75, until: s.day + 45 });
      return { text: 'Crisis económica: la demanda cae un 25% durante 45 días.', kind: 'bad' };
    },
  },
  {
    id: 'boom',
    weight: (s) => (s.day > 90 ? 1.5 : 0),
    run: (s) => {
      s.effects.push({ id: 'boom', name: '📈 Boom de consumo', kind: 'demand', mult: 1.2, until: s.day + 30 });
      return { text: 'Boom de consumo: +20% de demanda durante 30 días.', kind: 'good' };
    },
  },
  {
    id: 'strike',
    weight: (s) => (s.last.staff > 25 ? (s.morale < 55 ? 3 : 0.7) : 0),
    run: (s) => {
      if (s.morale >= 65) {
        s.morale = Math.min(100, s.morale + 3);
        return { text: 'Los sindicatos amenazaban con huelga, pero la buena moral evitó el conflicto.', kind: 'good' };
      }
      s.effects.push({ id: 'strike', name: '✊ Huelga', kind: 'prod', mult: 0.4, until: s.day + 7 });
      return { text: 'Huelga en la plantilla: la producción cae un 60% durante 7 días. Sube salarios o mejora la moral.', kind: 'bad' };
    },
  },
  {
    id: 'subsidy',
    weight: () => 1.5,
    run: (s) => {
      const amount = Math.round(Math.max(5000, Math.min(5_000_000, s.valuation * rnd(0.01, 0.03))) / 100) * 100;
      s.cash += amount;
      return { text: `El gobierno te concede una subvención a la innovación de ${fmtShort(s, amount)}.`, kind: 'good' };
    },
  },
  {
    id: 'scandal',
    weight: (s) => (s.brand > 15 ? 1 : 0),
    run: (s) => {
      const loss = Math.round(rnd(5, 10));
      s.brand = Math.max(0, s.brand - loss);
      return { text: `Escándalo mediático: la marca pierde ${loss} puntos.`, kind: 'bad' };
    },
  },
  {
    id: 'award',
    weight: () => 1.2,
    run: (s) => {
      const gain = Math.round(rnd(3, 7));
      s.brand = Math.min(100, s.brand + gain);
      return { text: `¡Premio a la mejor empresa emergente! +${gain} de marca.`, kind: 'good' };
    },
  },
  {
    id: 'rival',
    weight: (s) => (activeSectors(s).length ? 2 : 0),
    run: (s) => {
      const sec = pick(activeSectors(s));
      s.competitors[sec] *= 1.12;
      return { text: `Un competidor lanza un producto rompedor en ${SECTORS[sec].name}. La competencia se endurece.`, kind: 'bad' };
    },
  },
  {
    id: 'rivalfall',
    weight: (s) => (activeSectors(s).length ? 1.2 : 0),
    run: (s) => {
      const sec = pick(activeSectors(s));
      s.competitors[sec] *= 0.88;
      return { text: `Un gran rival de ${SECTORS[sec].name} ha quebrado. ¡Oportunidad para ganar cuota!`, kind: 'good' };
    },
  },
  {
    id: 'supply',
    weight: (s) => (s.day > 60 ? 1.2 : 0),
    run: (s) => {
      s.effects.push({ id: 'supply', name: '⛓️ Escasez de materiales', kind: 'cost', mult: 1.3, until: s.day + 25 });
      return { text: 'Escasez global de materias primas: costes de producción +30% durante 25 días.', kind: 'bad' };
    },
  },
  {
    id: 'talent',
    weight: () => 1,
    run: (s) => {
      s.effects.push({ id: 'talent', name: '🎓 Talento motivado', kind: 'morale', mult: 1.12, until: s.day + 40 });
      return { text: 'Una hornada de talento joven llega a la empresa: +12 a la moral objetivo durante 40 días.', kind: 'good' };
    },
  },
  {
    id: 'investor',
    weight: (s) => (s.valuation < 40_000_000 && !s.ipo && s.ownership > 0.55 ? 1.4 : 0),
    run: (s) => {
      const pct = pick([5, 10, 15]);
      const amount = Math.round((s.valuation * (pct / 100) * rnd(1.1, 1.6)) / 1000) * 1000 + 20_000;
      return {
        id: 'investor',
        title: '💼 Oferta de inversión',
        text: `Un fondo de capital riesgo ofrece ${fmtShort(s, amount)} por un ${pct}% de ${s.name}.`,
        options: [{ label: 'Aceptar', action: 'accept' }, { label: 'Rechazar', action: 'reject' }],
        data: { pct, amount },
      };
    },
  },
  {
    id: 'acquisition',
    weight: (s) => (s.stage >= 3 && s.cash > 5_000_000 ? 1 : 0),
    run: (s) => {
      const price = Math.round((s.valuation * rnd(0.05, 0.1)) / 1000) * 1000;
      const brand = Math.round(rnd(4, 9));
      return {
        id: 'acquisition',
        title: '🤝 Adquisición',
        text: `Puedes comprar una startup prometedora por ${fmtShort(s, price)}. Aportaría +${brand} de marca y 150 puntos de I+D.`,
        options: [{ label: 'Comprar', action: 'accept' }, { label: 'Pasar', action: 'reject' }],
        data: { price, brand },
      };
    },
  },
];

export function fmtShort(s: GameState, n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  const c = s.currency;
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)} mil M${c}`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(2)} M${c}`;
  if (abs >= 1e4) return `${sign}${(abs / 1e3).toFixed(1)} k${c}`;
  return `${sign}${Math.round(abs).toLocaleString('es-ES')} ${c}`;
}

/** Tira un evento si toca. Devuelve un resultado directo o una decisión pendiente. */
export function maybeEvent(s: GameState): EventOutcome | PendingChoice | null {
  if (s.day < s.nextEventDay || s.pending) return null;
  s.nextEventDay = s.day + Math.round(rnd(22, 45));
  const pool = EVENTS.map((e) => ({ e, w: e.weight(s) })).filter((x) => x.w > 0);
  const total = pool.reduce((a, b) => a + b.w, 0);
  let r = Math.random() * total;
  for (const { e, w } of pool) {
    r -= w;
    if (r <= 0) return e.run(s);
  }
  return null;
}

export function resolveChoice(s: GameState, action: string): EventOutcome | null {
  const p = s.pending;
  s.pending = null;
  if (!p) return null;
  if (p.id === 'investor' && action === 'accept') {
    const pct = Number(p.data!.pct), amount = Number(p.data!.amount);
    s.cash += amount;
    s.ownership *= 1 - pct / 100;
    return { text: `Has vendido un ${pct}% por ${fmtShort(s, amount)}. Tu participación: ${(s.ownership * 100).toFixed(1)}%.`, kind: 'event' };
  }
  if (p.id === 'acquisition' && action === 'accept') {
    const price = Number(p.data!.price), brand = Number(p.data!.brand);
    if (s.cash < price) return { text: 'No tienes caja suficiente para la adquisición.', kind: 'bad' };
    s.cash -= price;
    s.brand = Math.min(100, s.brand + brand);
    s.rp += 150;
    return { text: 'Adquisición completada. ¡Nuevo talento en la casa!', kind: 'good' };
  }
  return null;
}

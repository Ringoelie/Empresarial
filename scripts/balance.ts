// Bot sencillo para comprobar el equilibrio económico: `npx tsx scripts/balance.ts [sector]`
import { newGame } from '../src/game/state';
import * as sim from '../src/game/sim';
import { maybeEvent, resolveChoice } from '../src/game/events';
import { checkObjectives } from '../src/game/objectives';
import { BUILDINGS, COUNTRIES, PRODUCTS, RESEARCH, STAGES, GRID, BuildingId, SectorId } from '../src/game/data';

const sector = (process.argv[2] ?? 'food') as SectorId;
const s = newGame({ name: 'Bot', color: '#3b82f6', home: 'es', sector });

function freePlot(): number | null {
  for (let i = 0; i < GRID * GRID; i++) if (s.owned[i] && !sim.buildingAt(s, i)) return i;
  // compra la más barata
  let best = -1, bp = Infinity;
  for (let i = 0; i < GRID * GRID; i++) if (!s.owned[i]) { const p = sim.plotPrice(s, i); if (p < bp) { bp = p; best = i; } }
  if (best >= 0 && s.cash > bp * 3) { sim.buyPlot(s, best); return best; }
  return null;
}
const count = (t: BuildingId) => s.buildings.filter((b) => b.type === t).length;
function tryBuild(t: BuildingId, reserve = 1.3): boolean {
  const cost = BUILDINGS[t].levels[0].cost;
  if (s.cash < cost * reserve || sim.canBuild(s, t)) return false;
  const p = freePlot();
  if (p === null) return tryUpgrade(t, reserve);
  return sim.build(s, p, t).ok;
}
function tryUpgrade(t: BuildingId, reserve = 1.3): boolean {
  const b = s.buildings.filter((x) => x.type === t && sim.upgradeCost(x) !== null).sort((a, b) => a.level - b.level)[0];
  if (!b) return false;
  const c = sim.upgradeCost(b)!;
  if (s.cash < c * reserve) return false;
  return sim.upgrade(s, b.id).ok;
}

const stageDay: number[] = [];
for (let day = 0; day < 365 * 25 && !s.bankrupt; day++) {
  const r = sim.step(s);
  checkObjectives(s);
  const ev = maybeEvent(s);
  if (ev && 'options' in ev) { s.pending = ev; resolveChoice(s, 'reject'); }
  if (s.stage > stageDay.length - 1) while (stageDay.length <= s.stage) stageDay.push(s.day);
  if (s.stage >= 6) break;

  // investigación: la más barata disponible, priorizando las que desbloquean productos caros
  if (!s.researchTarget) {
    const avail = RESEARCH.filter((x) => sim.researchAvailable(s, x)).sort((a, b) => a.cost - b.cost);
    if (avail[0]) sim.startResearch(s, avail[0].id);
  }
  // reasignar fábricas: la de menor valor pasa al producto con más demanda insatisfecha
  if (day % 10 === 0) {
    const prods = sim.unlockedProducts(s);
    let bestP = prods[0], bestGap = 0;
    for (const p of prods) {
      const ps = s.products[p], def = PRODUCTS[p];
      const gap = (ps.demand - ps.produced) * (def.price - def.unitCost);
      if (gap > bestGap) { bestGap = gap; bestP = p; }
    }
    const surplus = s.buildings.filter((b) => b.type === 'factory' && b.product && s.products[b.product].produced < s.products[b.product].demand * 0.5 === false && b.product !== bestP);
    if (bestGap > 500 && surplus[0] && s.products[surplus[0].product!].produced > s.products[surplus[0].product!].demand * 1.3) surplus[0].product = bestP;
  }
  s.marketingBudget = Math.max(0, Math.min(s.last.revenue * 0.05, 50000));
  s.salaryLevel = s.morale < 60 ? 1.15 : 1.05;

  const rep = s.last;
  if (s.day % 60 === 0 && process.env.V) console.log(`d${s.day} val=${(s.valuation/1e6).toFixed(2)}M cash=${Math.round(s.cash)} rev=${Math.round(rep.revenue)} sal=${Math.round(rep.salaries)} upk=${Math.round(rep.upkeep)} mat=${Math.round(rep.materials)} mkt=${Math.round(rep.marketing)} int=${Math.round(rep.interest)} hold=${Math.round(rep.holding)} sub=${Math.round(rep.subsidiaries)} stor=${Math.round(rep.storageUsed)}/${Math.round(rep.storage)} sales=${Math.round(rep.salesCap)} pd=${Math.round(rep.physicalDemand)} debt=${Math.round(s.debt)} ${Object.entries(s.products).filter(([,p])=>p.produced>0).map(([k,p])=>k+":"+Math.round(p.produced)+"/"+Math.round(p.demand)+"/"+Math.round(p.sold)).join(" ")}`);
  if (day % 3 !== 0) continue;
  let totalDemand = 0, totalProd = 0;
  for (const p of Object.keys(PRODUCTS) as (keyof typeof PRODUCTS)[]) { totalDemand += s.products[p].demand; totalProd += s.products[p].produced; }
  if (rep.staff > rep.mgmtCap * 0.9) { if (!tryUpgrade('office')) tryBuild('office'); }
  else if (!sim.hasResearch(s, 'lab') && count('lab') === 0 && s.day > 60) tryBuild('lab');
  else if (rep.physicalDemand > rep.salesCap * 0.95 && totalProd > rep.salesCap * 0.8) { if (!tryUpgrade('store')) tryBuild('store'); }
  else if (rep.storageUsed > rep.storage * 0.8) tryBuild('warehouse');
  else if (totalDemand > totalProd * 1.1 || rep.logistics < 1 === false) { { const n = s.buildings.length; if (!tryUpgrade('factory') && tryBuild('factory') && s.buildings.length > n) { const prods = sim.unlockedProducts(s); let bp = prods[0], bg = -1; for (const p of prods) { const ps = s.products[p], def = PRODUCTS[p]; const g = (ps.demand - ps.produced) * (def.price - def.unitCost) + (ps.demand === 0 ? (def.price - def.unitCost) * def.demand * 0.3 : 0); if (g > bg) { bg = g; bp = p; } } s.buildings[s.buildings.length - 1].product = bp; } } }
  else if (count('marketing') < 1 + s.stage) tryBuild('marketing');
  else if (count('lab') < 1 + s.stage) { if (!tryUpgrade('lab')) tryBuild('lab'); }
  if (sim.canBuild(s, 'hq') === null) tryBuild('hq', 1.5);
  else { const hq = s.buildings.find((b) => b.type === 'hq'); if (hq && s.subsidiaries.length >= sim.subsidiaryLimit(s)) sim.upgrade(s, hq.id); }
  if (sim.hasResearch(s, 'intl')) {
    const c = COUNTRIES.filter((c) => c.id !== s.home && !s.subsidiaries.some((x) => x.country === c.id)).sort((a, b) => b.weight - a.weight)[0];
    if (c && s.cash > 2 * 500_000 * Math.pow(c.weight, 0.85) * 3) sim.openSubsidiary(s, c.id);
  }
  if (!s.ipo && sim.goPublic(s).ok) console.log(`IPO en día ${s.day}`);
  if (s.cash < 0 && s.debt < sim.creditLimit(s) - 50000) sim.takeLoan(s, 50000);
  if (s.debt > 0 && s.cash > s.debt * 3) sim.repayLoan(s, s.debt);

  if (s.day % 365 === 0) {
    console.log(`año ${s.day / 365}: etapa=${STAGES[s.stage].name} val=${(s.valuation / 1e6).toFixed(2)}M caja=${(s.cash / 1e6).toFixed(2)}M ingresos/d=${Math.round(rep.revenue)} beneficio/d=${Math.round(rep.profit)} plantilla=${rep.staff} marca=${s.brand.toFixed(1)} moral=${s.morale.toFixed(0)} edificios=${s.buildings.length} filiales=${s.subsidiaries.length} inv=${s.research.length} efic=${rep.efficiency.toFixed(2)}`);
  }
  void r;
}
console.log('Días por etapa:', stageDay.map((d, i) => `${STAGES[i].name}:${d} (${(d / 365).toFixed(1)}a)`).join(', '));
console.log(s.bankrupt ? 'QUIEBRA' : 'fin', 'día', s.day);

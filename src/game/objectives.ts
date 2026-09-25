// Objetivos guiados: sirven de tutorial y dan pequeñas recompensas.
import { GameState } from './state';
import { hqLevel } from './sim';

export interface Objective {
  id: string;
  text: string;
  reward: number;
  done: (s: GameState) => boolean;
}

const has = (s: GameState, t: string) => s.buildings.some((b) => b.type === t);

export const OBJECTIVES: Objective[] = [
  { id: 'factory', text: 'Construye tu primera fábrica en una parcela libre', reward: 5_000, done: (s) => has(s, 'factory') },
  { id: 'store', text: 'Abre una tienda para vender más', reward: 5_000, done: (s) => has(s, 'store') },
  { id: 'research', text: 'Completa una investigación (pestaña I+D)', reward: 8_000, done: (s) => s.research.length >= 2 },
  { id: 'office', text: 'Construye oficinas para gestionar más plantilla', reward: 10_000, done: (s) => has(s, 'office') },
  { id: 'brand', text: 'Alcanza 20 puntos de marca', reward: 15_000, done: (s) => s.brand >= 20 },
  { id: 'lab', text: 'Construye un laboratorio de I+D', reward: 20_000, done: (s) => has(s, 'lab') },
  { id: 'startup', text: 'Llega a la etapa Startup', reward: 25_000, done: (s) => s.stage >= 1 },
  { id: 'staff', text: 'Da trabajo a 100 personas', reward: 40_000, done: (s) => s.last.staff >= 100 },
  { id: 'pyme', text: 'Conviértete en PyME', reward: 60_000, done: (s) => s.stage >= 2 },
  { id: 'hq', text: 'Construye la sede corporativa', reward: 100_000, done: (s) => hqLevel(s) >= 1 },
  { id: 'intl', text: 'Abre tu primera filial en el extranjero', reward: 200_000, done: (s) => s.subsidiaries.length >= 1 },
  { id: 'mediana', text: 'Conviértete en Mediana empresa', reward: 300_000, done: (s) => s.stage >= 3 },
  { id: 'ipo', text: 'Sal a bolsa', reward: 0, done: (s) => s.ipo },
  { id: 'countries', text: 'Ten presencia en 5 países', reward: 1_000_000, done: (s) => s.subsidiaries.length >= 4 },
  { id: 'gran', text: 'Conviértete en Gran empresa', reward: 2_000_000, done: (s) => s.stage >= 4 },
  { id: 'corp', text: 'Conviértete en Corporación', reward: 5_000_000, done: (s) => s.stage >= 5 },
  { id: 'multi', text: 'Conviértete en Multinacional (8 países y 8.000 M de valoración)', reward: 0, done: (s) => s.stage >= 6 },
];

export function checkObjectives(s: GameState): Objective[] {
  const completed: Objective[] = [];
  for (const o of OBJECTIVES) {
    if (s.objectivesDone.includes(o.id)) continue;
    if (o.done(s)) {
      s.objectivesDone.push(o.id);
      s.cash += o.reward;
      completed.push(o);
    }
  }
  return completed;
}

export function pendingObjectives(s: GameState, n = 3): Objective[] {
  return OBJECTIVES.filter((o) => !s.objectivesDone.includes(o.id)).slice(0, n);
}

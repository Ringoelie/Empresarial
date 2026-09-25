// Controlador: reloj del juego, acciones con notificación y guardado.
import { GameState, LogEntry, newGame, NewGameOptions } from './state';
import * as sim from './sim';
import { maybeEvent, resolveChoice } from './events';
import { checkObjectives } from './objectives';
import { fmtShort } from './events';

type Listener = () => void;
export type Toast = { text: string; kind: LogEntry['kind'] };

const SAVE_KEY = 'empresarial-save-v1';

export class Game {
  s: GameState;
  speed = 1; // días por segundo
  paused = false;
  private acc = 0;
  private listeners: Record<string, Listener[]> = {};
  toasts: Toast[] = [];

  constructor(state: GameState) {
    this.s = state;
  }

  static create(opts: NewGameOptions) {
    return new Game(newGame(opts));
  }

  static load(): Game | null {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw) as GameState;
      if (s.version !== 1) return null;
      return new Game(s);
    } catch {
      return null;
    }
  }

  static hasSave(): boolean {
    try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; }
  }

  static clearSave() {
    try { localStorage.removeItem(SAVE_KEY); } catch { /* sin almacenamiento */ }
  }

  save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.s)); } catch { /* sin almacenamiento */ }
  }

  on(ev: 'day' | 'world' | 'month' | 'toast' | 'choice' | 'stage' | 'end', fn: Listener) {
    (this.listeners[ev] ??= []).push(fn);
  }

  emit(ev: string) {
    for (const fn of this.listeners[ev] ?? []) fn();
  }

  toast(text: string, kind: LogEntry['kind'] = 'info', log = true) {
    this.toasts.push({ text, kind });
    if (log) {
      this.s.log.unshift({ day: this.s.day, text, kind });
      if (this.s.log.length > 80) this.s.log.pop();
    }
    this.emit('toast');
  }

  money(n: number) { return fmtShort(this.s, n); }

  get running() { return !this.paused && !this.s.pending && !this.s.bankrupt; }

  /** Avanza el reloj en tiempo real. Devuelve los días simulados. */
  update(dt: number): number {
    if (!this.running) return 0;
    this.acc += Math.min(dt, 0.25) * this.speed;
    let days = 0;
    while (this.acc >= 1 && days < 16 && this.running) {
      this.acc -= 1;
      this.stepDay();
      days++;
    }
    return days;
  }

  stepDay() {
    const s = this.s;
    const res = sim.step(s);
    for (const m of res.messages) this.toast(m.text, m.kind);
    if (res.researched.length) this.emit('world');
    for (const o of checkObjectives(s)) {
      this.toast(`🎯 Objetivo cumplido: ${o.text}${o.reward ? ` (+${this.money(o.reward)})` : ''}`, 'good');
    }
    const ev = maybeEvent(s);
    if (ev) {
      if ('options' in ev) {
        s.pending = ev;
        this.emit('choice');
      } else this.toast(ev.text, ev.kind === 'event' ? 'event' : ev.kind);
    }
    if (res.stageUp) this.emit('stage');
    if (res.newMonth) {
      this.emit('month');
      if ((s.day / 30) % 2 === 0) this.save();
    }
    if (s.stage >= 6 && !s.won) {
      s.won = true;
      this.emit('end');
    }
    if (s.bankrupt) this.emit('end');
    this.emit('day');
  }

  choose(action: string) {
    const out = resolveChoice(this.s, action);
    if (out) this.toast(out.text, out.kind);
    this.emit('day');
  }

  /** Ejecuta una acción de la simulación y notifica. */
  act(r: sim.ActionResult, worldChanged = true): boolean {
    if (!r.ok) {
      if (r.msg) this.toast(r.msg, 'bad', false);
      return false;
    }
    if (r.msg) this.toast(r.msg, 'info', false);
    this.s.valuation = sim.computeValuation(this.s);
    for (const o of checkObjectives(this.s)) {
      this.toast(`🎯 Objetivo cumplido: ${o.text}${o.reward ? ` (+${this.money(o.reward)})` : ''}`, 'good');
    }
    if (worldChanged) this.emit('world');
    this.emit('day');
    return true;
  }
}

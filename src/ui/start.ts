// Pantalla de inicio: nueva partida o continuar.
import { COMPANY_COLORS, COUNTRY_BY_ID, HOME_CHOICES, SECTORS, SectorId } from '../game/data';
import type { NewGameOptions } from '../game/state';
import { h } from './dom';

const START_SECTORS: { id: SectorId; desc: string }[] = [
  { id: 'food', desc: 'Café y snacks. Estable.' },
  { id: 'fashion', desc: 'Camisetas. Buen margen.' },
  { id: 'tech', desc: 'Apps digitales. Sin almacén.' },
];

const NAMES = ['Nova', 'Andina', 'Quantum', 'Solaris', 'Horizonte', 'Cóndor', 'Vértice', 'Aurora', 'Mistral', 'Ceiba'];
const SUFFIX = ['Group', 'Labs', 'Corp', 'S.A.', 'Industrias', 'Global', 'Holdings'];

export function showStart(opts: { canContinue: boolean; backend: string; onNew: (o: NewGameOptions) => void; onContinue: () => void }) {
  let color = COMPANY_COLORS[0];
  let sector: SectorId = 'food';
  let home = 'es';
  const name = h('input', { type: 'text', maxLength: 28, value: `${NAMES[Math.floor(Math.random() * NAMES.length)]} ${SUFFIX[Math.floor(Math.random() * SUFFIX.length)]}` });

  const pick = <T extends string>(items: { id: T; html: HTMLElement[] }[], cur: () => T, set: (v: T) => void, cls = 'choices') => {
    const wrap = h('div', { class: cls });
    const render = () => {
      wrap.innerHTML = '';
      for (const it of items) wrap.append(h('div', { class: `choice ${cur() === it.id ? 'on' : ''}`, onclick: () => { set(it.id); render(); } }, ...it.html));
    };
    render();
    return wrap;
  };

  const sectors = pick(START_SECTORS.map((s) => ({ id: s.id, html: [h('div', { class: 'ic' }, SECTORS[s.id].icon), h('b', null, SECTORS[s.id].name), h('small', null, s.desc)] })), () => sector, (v) => { sector = v; });
  const homes = pick(HOME_CHOICES.map((id) => ({ id, html: [h('div', { class: 'ic' }, COUNTRY_BY_ID[id].flag), h('small', null, COUNTRY_BY_ID[id].name)] })), () => home, (v) => { home = v; });
  homes.style.gridTemplateColumns = 'repeat(4, 1fr)';

  const swatches = h('div', { class: 'swatches' });
  const renderSw = () => {
    swatches.innerHTML = '';
    for (const c of COMPANY_COLORS) swatches.append(h('div', { class: `swatch ${c === color ? 'on' : ''}`, style: `background:${c}`, onclick: () => { color = c; document.documentElement.style.setProperty('--accent', c); renderSw(); } }));
  };
  renderSw();
  document.documentElement.style.setProperty('--accent', color);

  const back = h('div', { class: 'modal-back', style: 'background:radial-gradient(circle at 50% 20%, rgba(27,42,74,.75), rgba(4,7,14,.92))' });
  const start = () => {
    const n = name.value.trim() || 'Mi Empresa';
    back.remove();
    opts.onNew({ name: n, color, home, sector });
  };
  back.append(h('div', { class: 'modal glass' },
    h('h1', null, '🏢 Empresarial'),
    h('p', { style: 'margin-top:0' }, 'Del garaje a multinacional. Construye fábricas, lanza productos, investiga y conquista el mundo.'),
    opts.canContinue ? h('button', { class: 'btn primary block', style: 'margin-bottom:14px;padding:11px', onclick: () => { back.remove(); opts.onContinue(); } }, '▶ Continuar partida guardada') : null,
    opts.canContinue ? h('div', { class: 'sep' }) : null,
    h('div', { class: 'field' }, h('label', null, 'Nombre de la empresa'), name),
    h('div', { class: 'field' }, h('label', null, 'Sector inicial'), sectors),
    h('div', { class: 'field' }, h('label', null, 'País de origen'), homes),
    h('div', { class: 'field' }, h('label', null, 'Color corporativo'), swatches),
    h('button', { class: `btn ${opts.canContinue ? '' : 'primary'} block`, style: 'padding:11px;margin-top:6px', onclick: start }, '🚀 Fundar empresa'),
    h('p', { class: 'badge-backend faint', style: 'text-align:center;margin:10px 0 0' }, `Motor: Three.js · ${opts.backend}`),
  ));
  document.body.append(back);
  name.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') start(); });
}

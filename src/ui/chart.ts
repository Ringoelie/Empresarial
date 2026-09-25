// Gráfico de línea de una sola serie (sin doble eje), con cruceta y tooltip al pasar el ratón.
import { h } from './dom';

export interface ChartOpts {
  title: string;
  values: number[];
  labels: string[];
  color: string;
  fmt: (n: number) => string;
}

export function lineChart(o: ChartOpts): HTMLElement {
  const canvas = h('canvas');
  const tip = h('div', { class: 'tip' });
  const last = o.values.length ? o.fmt(o.values[o.values.length - 1]) : '—';
  const el = h('div', { class: 'chart card', 'data-hold': '' },
    h('div', { class: 'title' }, h('span', { class: 'muted' }, o.title), h('b', { class: 'num' }, last)),
    canvas, tip);

  let hover = -1;
  const draw = () => {
    const w = canvas.clientWidth, H = canvas.clientHeight;
    if (!w) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = w * dpr; canvas.height = H * dpr;
    const c = canvas.getContext('2d')!;
    c.scale(dpr, dpr);
    const v = o.values;
    if (v.length < 2) {
      c.fillStyle = '#667085';
      c.font = '11px system-ui';
      c.fillText('Aún no hay suficientes meses de datos', 6, H / 2);
      return;
    }
    const pad = { l: 4, r: 4, t: 6, b: 6 };
    let min = Math.min(0, ...v), max = Math.max(0, ...v);
    if (max === min) max = min + 1;
    const x = (i: number) => pad.l + (i / (v.length - 1)) * (w - pad.l - pad.r);
    const y = (n: number) => pad.t + (1 - (n - min) / (max - min)) * (H - pad.t - pad.b);
    // línea base en cero (recesiva)
    c.strokeStyle = 'rgba(255,255,255,0.14)';
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(pad.l, y(0)); c.lineTo(w - pad.r, y(0)); c.stroke();
    // área suave + línea de 2px
    const grad = c.createLinearGradient(0, pad.t, 0, H);
    grad.addColorStop(0, o.color + '55');
    grad.addColorStop(1, o.color + '00');
    c.beginPath();
    v.forEach((n, i) => (i ? c.lineTo(x(i), y(n)) : c.moveTo(x(i), y(n))));
    c.lineTo(x(v.length - 1), y(0)); c.lineTo(x(0), y(0)); c.closePath();
    c.fillStyle = grad; c.fill();
    c.beginPath();
    v.forEach((n, i) => (i ? c.lineTo(x(i), y(n)) : c.moveTo(x(i), y(n))));
    c.strokeStyle = o.color; c.lineWidth = 2; c.lineJoin = 'round'; c.stroke();
    if (hover >= 0) {
      c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(x(hover), pad.t); c.lineTo(x(hover), H - pad.b); c.stroke();
      c.fillStyle = o.color; c.strokeStyle = '#0f1522'; c.lineWidth = 2;
      c.beginPath(); c.arc(x(hover), y(v[hover]), 4.5, 0, Math.PI * 2); c.fill(); c.stroke();
      tip.style.display = 'block';
      tip.style.left = `${x(hover)}px`;
      tip.style.top = `${y(v[hover]) + canvas.offsetTop}px`;
      tip.textContent = `${o.labels[hover]}: ${o.fmt(v[hover])}`;
    } else tip.style.display = 'none';
  };
  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    const n = o.values.length;
    if (n < 2) return;
    hover = Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width) * (n - 1))));
    draw();
  });
  canvas.addEventListener('pointerleave', () => { hover = -1; draw(); });
  requestAnimationFrame(draw);
  return el;
}

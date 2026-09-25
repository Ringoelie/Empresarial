type Child = Node | string | number | null | undefined | false;
type Props = Record<string, unknown> | null;

/** Pequeño helper para crear DOM sin framework. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Props, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = String(v);
      else if (k === 'style') el.setAttribute('style', String(v));
      else if (k === 'html') el.innerHTML = String(v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
      else if (k in el && typeof v !== 'string') (el as unknown as Record<string, unknown>)[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

export function bar(frac: number, cls = ''): HTMLElement {
  const f = Math.max(0, Math.min(1, frac));
  return h('div', { class: `bar ${cls}` }, h('i', { style: `width:${(f * 100).toFixed(1)}%` }));
}

export const pct = (x: number, d = 0) => `${(x * 100).toFixed(d)}%`;

export function fmtNum(n: number, d = 0): string {
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1)} M`;
  if (Math.abs(n) >= 1e4) return `${(n / 1e3).toFixed(1)} k`;
  return n.toLocaleString('es-ES', { maximumFractionDigits: d, minimumFractionDigits: 0 });
}

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
export function fmtDate(day: number): string {
  const y = Math.floor(day / 360) + 1;
  const m = Math.floor((day % 360) / 30);
  const d = (day % 30) + 1;
  return `${d} ${MONTHS[m]} · Año ${y}`;
}

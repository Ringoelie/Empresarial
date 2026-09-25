// Genera una máscara de tierra compacta (puntos en una esfera de Fibonacci que caen sobre continentes)
// a partir de world-atlas. Se ejecuta una sola vez: `npm run gen:globe`.
import { readFileSync, writeFileSync } from 'node:fs';
import { feature } from 'topojson-client';
import { geoContains } from 'd3-geo';

const topo = JSON.parse(readFileSync(new URL('../node_modules/world-atlas/land-110m.json', import.meta.url)));
const land = feature(topo, topo.objects.land);

const N = 16000;
const golden = Math.PI * (3 - Math.sqrt(5));
const out = [];
for (let i = 0; i < N; i++) {
  const y = 1 - (i / (N - 1)) * 2;
  const theta = golden * i;
  const lat = Math.asin(y) * 180 / Math.PI;
  let lon = ((theta * 180 / Math.PI) % 360);
  if (lon > 180) lon -= 360;
  if (geoContains(land, [lon, lat])) out.push(Math.round(lat * 10) / 10, Math.round(lon * 10) / 10);
}
writeFileSync(new URL('../src/data/land-dots.json', import.meta.url), JSON.stringify(out));
console.log(`puntos de tierra: ${out.length / 2}`);

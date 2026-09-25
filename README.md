# 🏢 Empresarial — del garaje a multinacional

Simulador de empresas en 3D para el navegador, hecho con **Three.js + WebGPU** (con fallback automático a WebGL2).
Empiezas en un garaje con 60.000 € y tienes que convertir tu empresa en una **multinacional** con presencia en 8 países
y una valoración de 8.000 millones.

## Cómo jugar

```bash
npm install
npm run dev      # servidor de desarrollo (runtime de Cloudflare Workers en local)
npm run build    # build de producción en dist/
npm run preview  # build + vista previa local en workerd
npm run deploy   # build + despliegue en Cloudflare
```

- **Construye** (🏗️ o tecla `B`): fábricas, tiendas, oficinas, almacenes, laboratorios, agencias de marketing,
  centros de datos, parques y la sede corporativa. Si la parcela no es tuya, se compra a la vez.
- **Selecciona** un edificio para mejorarlo (hasta nivel 3–4), cambiar el producto de una fábrica o demolerlo.
- **Productos**: fija precios; la demanda depende de precio, calidad y marca frente a la competencia.
- **I+D**: desbloquea 14 productos en 5 sectores (alimentación, moda, tecnología, energía y automoción) y mejoras.
- **Finanzas**: préstamos, cuenta de resultados, gráficos mensuales y salida a bolsa.
- **Mercados** (🌍 o `M`): globo 3D con 22 países; abre y amplía filiales para multiplicar tu mercado.
- Eventos aleatorios (productos virales, crisis, huelgas, inversores…) y objetivos guiados con recompensas.

Controles: arrastrar = mover, clic derecho / dos dedos = girar, rueda = zoom, `WASD` mover, `Q/E` girar,
`Espacio` pausa, `1-4` velocidad, `P` panel, `Esc` cancelar. La partida se guarda sola en el navegador.

## Arquitectura

```
src/
  game/      Simulación pura (sin DOM): datos, estado, economía diaria, eventos, objetivos, guardado
  render/    Motor 3D: WebGPURenderer, ciudad, globo, tráfico, modelos procedurales y materiales TSL
  ui/        Interfaz DOM ligera (sin framework), gráficos canvas y pantalla de inicio
scripts/     gen-globe.mjs (máscara de continentes) y balance.ts (bot para equilibrar la economía)
```

### Optimización

- **Instancing en todo**: cada tipo y nivel de edificio es un único `InstancedMesh`; la ciudad entera
  (≈400 edificios, 1.000+ marcas viales, cientos de árboles y coches) se dibuja en unas 30 draw calls.
- **Geometría procedural fusionada** con color por vértice: sin texturas ni modelos que descargar.
- **Ventanas generadas en el shader** (TSL) a partir de la posición en el mundo, con luces nocturnas.
- **Tráfico 100% en GPU**: la posición de cada coche se calcula en el vertex shader; coste de CPU cero.
- **Globo de ~4.600 puntos** en un solo draw call y rutas comerciales animadas en el shader.
- **Resolución dinámica** que baja/sube el pixel ratio para mantener los FPS, 3 presets de calidad
  y detección de móvil. La interfaz se refresca como máximo ~4 veces por segundo.
- Si el dispositivo WebGPU se pierde, la partida se guarda y el juego se recarga con WebGL2.

Puedes forzar WebGL2 con `?webgl` en la URL.

## Despliegue en Cloudflare

El juego se publica como sitio estático en **Cloudflare Workers** (static assets):

- `wrangler.jsonc` define el Worker `empresarial` (solo assets, sin código de servidor).
- `@cloudflare/vite-plugin` genera `dist/wrangler.json` al compilar; `wrangler deploy` lo usa automáticamente.
- `public/_headers` cachea para siempre `/assets/*` (llevan hash) y añade cabeceras de seguridad.

**Desde tu máquina:** `npx wrangler login` una vez y luego `npm run deploy`.

**Desde GitHub (Workers Builds):** en el panel de Cloudflare → *Workers & Pages* → *Create* → *Import a repository*,
elige este repositorio y usa:

| Ajuste | Valor |
|---|---|
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Versión de Node | 22 (leída de `.node-version`) |

Cada push a la rama principal se desplegará automáticamente; las demás ramas generan versiones de vista previa.

### Equilibrio

`npm run balance -- food` ejecuta un bot que juega solo y muestra la evolución año a año
(sirve para ajustar los números de `src/game/data.ts`).

# Empresarial — notas para el desarrollo

Simulador 3D de empresas (Three.js + WebGPU con fallback a WebGL2), Vite + TypeScript, interfaz en español.

## Despliegue: SIEMPRE Cloudflare

El proyecto se despliega en **Cloudflare Workers (static assets)**. Cualquier cambio debe mantener
esta configuración funcionando:

- `wrangler.jsonc`: nombre del Worker, `compatibility_date` y `assets.not_found_handling`.
  No hay código de servidor; si algún día hace falta, añadir `main` apuntando a un Worker.
- `vite.config.ts` usa `@cloudflare/vite-plugin`: `npm run dev` y `npm run preview` corren en workerd
  y `vite build` genera `dist/wrangler.json` (la config real de despliegue).
- `public/_headers`: caché inmutable para `/assets/*` y cabeceras de seguridad.
- `.node-version` fija Node 22 para Workers Builds.
- Nuevas funcionalidades que necesiten backend (ranking, guardado en la nube, etc.) deben usar
  servicios de Cloudflare (Workers, D1, KV, R2, Durable Objects) declarados en `wrangler.jsonc`.
- No usar APIs de Node en el código del cliente ni rutas absolutas que dependan de otro hosting.

Comprobar antes de hacer push:

```bash
npx tsc --noEmit
npm run build
npx wrangler deploy --dry-run
```

## Estructura

- `src/game/` simulación pura (sin DOM, testeable con `npm run balance`).
- `src/render/` motor 3D (instancing, materiales TSL, tráfico en GPU, globo).
- `src/ui/` interfaz DOM sin framework.

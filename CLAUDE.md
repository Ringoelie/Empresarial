# Empresarial — notas para el desarrollo

Simulador 3D de empresas (Three.js + WebGPU con fallback a WebGL2), Vite + TypeScript, interfaz en español.

## Despliegue: SIEMPRE Cloudflare

El proyecto se despliega en **Cloudflare Workers (static assets)**. Cualquier cambio debe mantener
esta configuración funcionando:

- `wrangler.jsonc`: Worker `empresarial` solo con assets (`assets.directory = ./dist`) y
  `build.command = npm run build`, de modo que `wrangler deploy` compila SIEMPRE antes de subir
  (evita el error "Missing entry-point to Worker script or to assets directory").
  El `name` debe coincidir con el nombre del Worker en el panel de Cloudflare.
  No hay código de servidor; si algún día hace falta, añadir `main` apuntando a un Worker.
- Es un proyecto de **Workers**, no de Pages: no añadir `pages_build_output_dir`.
- `npm run preview` = `wrangler dev` (sirve dist/ con el runtime real y las cabeceras).
- `public/_headers`: caché inmutable para `/assets/*` y cabeceras de seguridad.
- `.node-version` fija Node 22 para Workers Builds.
- Nuevas funcionalidades que necesiten backend (ranking, guardado en la nube, etc.) deben usar
  servicios de Cloudflare (Workers, D1, KV, R2, Durable Objects) declarados en `wrangler.jsonc`.
- No usar APIs de Node en el código del cliente ni rutas absolutas que dependan de otro hosting.

Comprobar antes de hacer push:

```bash
npx tsc --noEmit
npx wrangler deploy --dry-run   # compila y valida el despliegue sin subir nada
```

El workflow `.github/workflows/cloudflare-check.yml` hace lo mismo en cada push/PR. Si falla,
no hacer merge hasta arreglarlo.

## Estructura

- `src/game/` simulación pura (sin DOM, testeable con `npm run balance`).
- `src/render/` motor 3D (instancing, materiales TSL, tráfico en GPU, globo).
- `src/ui/` interfaz DOM sin framework.

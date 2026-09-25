import { defineConfig } from 'vite';
import { cloudflare } from '@cloudflare/vite-plugin';

// El plugin de Cloudflare hace que `vite dev` y `vite preview` se ejecuten en el runtime de
// Workers (workerd) y genera la configuración de despliegue en dist/ al hacer `vite build`.
export default defineConfig({
  plugins: [cloudflare()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
});

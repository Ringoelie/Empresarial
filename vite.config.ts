import { defineConfig } from 'vite';

// Build estático en dist/, que Cloudflare Workers sirve como assets (ver wrangler.jsonc).
export default defineConfig({
  base: '/',
  build: {
    target: 'es2022',
    outDir: 'dist',
    chunkSizeWarningLimit: 1500,
  },
});

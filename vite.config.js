import { defineConfig } from 'vite';
import { resolve } from 'node:path';
// SINGLEFILE=1 : intègre l'image de fond dans le bundle (version de démonstration en un seul fichier).
export default defineConfig({
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  build: {
    assetsInlineLimit: process.env.SINGLEFILE ? 1e7 : 4096,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        capitale: resolve(import.meta.dirname, 'capitale/index.html'),
      },
    },
  },
});

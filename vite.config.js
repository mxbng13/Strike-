import { defineConfig } from 'vite';
// SINGLEFILE=1 : intègre l'image de fond dans le bundle (version de démonstration en un seul fichier).
export default defineConfig({
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  build: { assetsInlineLimit: process.env.SINGLEFILE ? 1e7 : 4096 },
});

// Copie le worker de MapLibre dans /public : le bundler ne peut pas résoudre son URL relative automatiquement.
import fs from "node:fs";
fs.copyFileSync("node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", "public/maplibre-gl-worker.mjs");

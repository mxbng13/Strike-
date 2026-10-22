#!/bin/bash
# Rendus 3D des 5 produits : tour complet (72 vues) + produit posé sur le comptoir de la salle de bain.
set -e
cd "$(dirname "$0")"
node rendre.mjs sdb '{"w":2160,"nom":"sdb"}' | grep png
declare -A ECH=([glace]=1.1 [guasha]=1.7 [tondeuse]=1.0 [langue]=1.5 [patchs]=0.95)
declare -A ROT=([glace]=0.3 [guasha]=0 [tondeuse]=-1.5708 [langue]=0.2 [patchs]=0)
for p in ${1:-patchs guasha tondeuse glace langue}; do
  node rendre.mjs sdb "{\"w\":2160,\"nom\":\"sdb_$p\",\"produit\":\"$p\",\"echelle\":${ECH[$p]},\"rotation\":${ROT[$p]}}" | grep png
  node rendre.mjs produit "{\"produit\":\"$p\",\"n\":72,\"taille\":1000}" | grep -c png
done
echo FINI

#!/bin/bash
# Rend les 5 publicités produits (les rendus 3D doivent être prêts) et copie les livrables.
set -e
cd "$(dirname "$0")"
for p in ${@:-patchs guasha tondeuse glace langue}; do
  python3 pub.py $p | tail -1
  cp $p/build/idrea_$p.mp4 $p/build/idrea_${p}_sous-titres.srt $p/livrables/
  for i in 0 1 2 3 4; do cp $p/build/vo_$i.mp3 $p/livrables/voix_off_$((i+1)).mp3; done
  d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 $p/livrables/idrea_$p.mp4)
  ffmpeg -v error -y -ss $(python3 -c "print($d-1.2)") -i $p/livrables/idrea_$p.mp4 -frames:v 1 -q:v 3 $p/livrables/couverture.jpg
done
echo TOUT_FINI

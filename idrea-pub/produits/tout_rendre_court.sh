#!/bin/bash
# Rend les 5 publicités au format court et copie les livrables.
set -e
cd "$(dirname "$0")"
for p in ${@:-patchs guasha tondeuse glace langue}; do
  python3 pub_court.py $p | tail -1
  mkdir -p $p/livrables_court
  cp $p/build_court/idrea_${p}_court.mp4 $p/build_court/idrea_${p}_court_sous-titres.srt $p/livrables_court/
  for i in 0 1 2 3; do cp $p/build_court/vo_$i.mp3 $p/livrables_court/voix_off_$((i+1)).mp3; done
  ffmpeg -v error -y -ss 0.4 -i $p/livrables_court/idrea_${p}_court.mp4 -frames:v 1 -q:v 3 $p/livrables_court/couverture.jpg
done
echo TOUT_FINI

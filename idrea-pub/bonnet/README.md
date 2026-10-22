# IDREA — Publicité TikTok « Bonnet en satin »

Même style que la pub derma roller / huile de ricin (voir `../README.md`), en version courte : **28,9 s**, 1080 × 1920, 30 i/s, −14 LUFS.

## Livrables (`livrables/`)

- `idrea_bonnet_satin.mp4` : la publicité finale
- `idrea_bonnet_sous-titres.srt` : les sous-titres
- `voix_off_1…5.mp3` : la voix off (Rémy, une piste par scène)
- `couverture.jpg` : l'image de couverture

## L'accroche (0 à 2 s)

- **Image 0** : le titre « CHEVEUX EN PAGAILLE AU RÉVEIL ? » est déjà à l'écran, sans fondu, sur l'oreiller où traînent quelques cheveux. Un impact sonore marque le départ, et la musique démarre directement avec la batterie.
- **0 à 0,5 s** : zoom d'entrée doux, puis lente poussée continue. Il n'y a plus de tremblement de caméra ni de saut de zoom, qui donnaient l'impression d'un bug.
- **≈ 2 s** : la question bascule sur la cause, avec la puce « LA FAUTE À TON OREILLER ? » et une flèche.

## Le produit et les décors : modélisés en 3D

Le bonnet, l'oreiller, les draps et les cheveux sont modélisés en 3D avec three.js (`../3d/scene.js`), puis rendus dans Chromium headless :

- **bonnet** : calotte en satin noir bouffante, avec des fronces serrées près de l'élastique et de grands plis souples. Le bandeau élastique est en maille et l'ouverture est visible, comme sur la photo produit (`assets/bonnet_photo.jpg`, gardée comme référence). Il est rendu sous 72 angles pour tourner sur lui-même ;
- **oreiller et draps** : oreiller en coton bombé avec l'empreinte de la tête, draps en lin froissé, ombres douces ;
- **cheveux** : quelques cheveux tombés sur l'oreiller, brin par brin, avec l'ombrage spécifique des cheveux (reflet brillant le long du brin) ;
- 3 éclairages pour la routine : soir (lampe chaude), nuit (lune bleutée), matin (lumière de fenêtre).

```bash
cd ../3d && npm install
node rendre.mjs lit '{"lumiere":"jour","nom":"lit_jour","w":2160,"cheveux":true}'
for l in soir nuit matin; do node rendre.mjs lit "{\"lumiere\":\"$l\",\"nom\":\"lit_$l\",\"w\":2160,\"bonnet\":true}"; done
node rendre.mjs bonnet '{"n":72,"taille":1100}'     # ≈ 5 min
```

## Script

| Scène | Voix off |
|---|---|
| 1. Accroche | Tu te réveilles avec les cheveux en pagaille ? Le problème, c'est peut-être ton oreiller. |
| 2. Problème | Le coton frotte contre tes cheveux toute la nuit. Ça peut donner des frisottis, des nœuds, et une coiffure toute écrasée. |
| 3. Solution | La solution : le bonnet en satin. Le satin est doux, il glisse sur les cheveux, donc moins de frottements. |
| 4. Routine | Tu l'enfiles le soir, tu dors tranquille, et le matin, tes cheveux ont été protégés toute la nuit. |
| 5. IDREA | Le bonnet en satin, c'est chez Idréa. Découvre-le maintenant. |

Les formulations restent prudentes : « peut donner », « moins de frottements ». Aucune promesse de pousse ni de réparation des cheveux.

## Régénérer

```bash
python3 ../voix_off.py script.json build   # voix off (modifiable dans script.json)
python3 bonnet.py --apercu 0 1 14          # aperçus
python3 bonnet.py                          # vidéo (nécessite les rendus 3D, voir plus haut) -> build/idrea_bonnet_satin.mp4
```

Pour de vrais plans (ce qui rend le résultat le plus « réel ») : déposez `s1.mp4` (réveil, cheveux en bataille sur l'oreiller), `s2.mp4` (gros plan sur une taie en coton), `s3.mp4` (le vrai bonnet IDREA, packshot), `s4a/s4b/s4c.mp4` (le soir / la nuit / le matin) et `s5.mp4` dans `clips/`. Les textes et les sous-titres restent par-dessus.

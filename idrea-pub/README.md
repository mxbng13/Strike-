# IDREA — Publicité TikTok « Pas encore de barbe à 18 ans ? »

Vidéo verticale 1080 × 1920, 30 i/s, **≈ 45 s**, H.264 + AAC, son normalisé à −14 LUFS (niveau recommandé par TikTok).

## Livrables (`livrables/`)

| Fichier | Contenu |
|---|---|
| `idrea_pub_tiktok.mp4` | La publicité finale : voix off, sous-titres animés, musique et animation du logo |
| `idrea_outro_logo.mp4` | La conclusion IDREA seule, réutilisable dans d'autres pubs |
| `idrea_sous-titres.srt` | Sous-titres synchronisés au mot près (pour CapCut / TikTok Ads Manager) |
| `voix_off_1…5.mp3` | Voix off française (voix « Rémy », ton conversationnel), une piste par scène |
| `musique_fond.wav` | Musique originale composée par synthèse, donc libre de droits |
| `couverture.jpg` | Image de couverture (logo + slogan) |

## Ce qui est réel et ce qui ne l'est pas

Je ne peux pas filmer ni générer de séquences photoréalistes avec de vraies personnes. La vidéo est donc une **publicité motion design** finalisée : des graphismes animés, pas des images générées par IA. Pour un rendu 100 % « vrai », le plus efficace est de filmer 5 ou 6 plans au téléphone et de les déposer dans `clips/` (voir plus bas) :

- les produits (derma roller, flacon d'huile de ricin) sont modélisés et animés : rotation du rouleau, reflet sur le verre, goutte d'huile ;
- aucun visage ni aucune personne n'est inventé ;
- les plans avec un vrai visage et de vraies mains peuvent être ajoutés sans refaire le montage (voir plus bas).

Règles respectées : aucune promesse de pousse, aucun avant/après, aucun faux avis, aucune adresse web inventée, aucun logo inventé (le nom « IDREA » est écrit avec une typographie élégante, Cormorant Garamond).

## Voix et sous-titres

- Voix off : « Rémy » (fr-FR-RemyMultilingualNeural), la voix française la plus naturelle disponible, avec un débit proche de la parole normale (+10 %). Un traitement « micro réel » est appliqué au mixage : égalisation, légère acoustique de pièce et bruit de fond très discret, pour éviter le son trop propre des voix de synthèse.
- Sous-titres : style classique en bas de l'image (blanc, contour noir, une ou deux lignes), synchronisés au mot près avec la voix.
- **Pour une voix 100 % humaine** : enregistrez le texte au téléphone dans une pièce calme, une piste par scène. Les sous-titres sont actuellement calés sur la voix de synthèse : il faudra les recaler sur votre enregistrement (je peux ajouter cet alignement automatique).

## Minutage

| Scène | À l'écran |
|---|---|
| 1. Accroche | La buée du miroir s'efface. « PAS ENCORE DE BARBE À 18 ANS ? », avec « 18 ANS » en or, puis « 2 étapes pour ta routine » |
| 2. Derma roller | « ÉTAPE 1 — DERMA ROLLER », rouleau en rotation, flèche, puces « À utiliser avec précaution », « Consignes du fabricant », « Hygiène irréprochable » |
| 3. Huile de ricin | Gros plan sur le flacon, goutte d'huile, « NOURRIT », « ASSOUPLIT », « SI TA PEAU LA TOLÈRE », mots « ROUTINE » et « SOIN » |
| 4. Routine | Montage de 5 plans, checklist animée, encadré « génétique et hormones » |
| 5. IDREA | Fond qui s'assombrit, ligne lumineuse, lettres I-D-R-E-A, zoom, produits de chaque côté, slogan, bouton et flèche |

La durée est d'environ 45 s au lieu de 30 à 40 s : le texte a été gardé mot pour mot, et un débit plus rapide refait sonner la voix comme une IA. Pour passer sous 40 s, il faut raccourcir le texte, par exemple en supprimant « C'est un accessoire à utiliser avec précaution », puisque la mise en garde est répétée juste après.

## Ajouter le lien boutique

Le bouton final affiche « Lien en bio » tant qu'aucun lien n'est fourni. Pour afficher l'adresse officielle :

```bash
IDREA_LIEN="<votre lien officiel>" python3 rendu.py
```

## Remplacer les décors par de vrais plans (tournés ou générés par IA)

Déposez une vidéo verticale dans `clips/` sous l'un de ces noms, puis relancez `python3 rendu.py`. Le plan remplace le décor animé ; les titres, puces, sous-titres et le logo restent superposés et synchronisés.

| Fichier | Durée | Prompt suggéré (Veo, Kling, Runway, Sora…) |
|---|---|---|
| `s1.mp4` | 6 s | *Vertical 9:16, photorealistic. Close-up of a young adult man (about 20) in a clean modern bathroom, looking at his cheeks and chin in the mirror, sparse patchy stubble, slightly frustrated but calm expression. Warm vanity lighting, slow push-in, shallow depth of field, natural skin texture.* |
| `s2.mp4` | 10 s | *Macro product shot of a derma roller on a clean beige stone surface, slow orbiting camera, soft studio light. Then the same young man holds the roller near the mirror and shows it calmly, no pressure on skin, no marks, no blood.* |
| `s3.mp4` | 9 s | *Macro of an amber glass dropper bottle of castor oil, golden oil texture, one drop on a fingertip, the man gently applies a small amount to his beard area. Warm soft light, smooth gimbal movement.* |
| `s4a.mp4` … `s4e.mp4` | ≈ 2 s chacun | a) l'homme se regarde dans le miroir ; b) gros plan sur le flacon ; c) roller posé sur une surface propre ; d) il range soigneusement ses produits ; e) son visage en lumière naturelle de fenêtre |
| `s5.mp4` | 8 s | Packshot des deux vrais produits IDREA sur fond beige, travelling avant lent (le logo s'anime par-dessus) |

Conseils : faites vos propres photos des vrais produits IDREA et donnez-les comme image de référence au générateur, pour que le flacon ne change pas de forme. Gardez 250 px libres en haut et en bas de l'image (titres et sous-titres).

## Régénérer la vidéo

```bash
pip install edge-tts pillow numpy      # + ffmpeg
python3 voix_off.py                    # voix off + minutage mot à mot
python3 rendu.py --apercu 1.5 20 38    # aperçus PNG dans build/
python3 rendu.py                       # vidéo complète -> build/idrea_pub_tiktok.mp4 (≈ 5 min)
```

## Licences et points à vérifier avant diffusion

- **Voix off** : générée par synthèse vocale (Microsoft Edge TTS, voix « Rémy »). Vérifiez que ces conditions permettent un usage publicitaire, ou faites réenregistrer `voix_off_*.mp3` par un comédien (même texte, même rythme) puis relancez le rendu.
- **Musique** : composée par `musique.py`, sans échantillon externe.
- **Polices** : Inter et Cormorant Garamond, sous licence SIL Open Font License, utilisables commercialement.
- **Étiquette du flacon** : c'est une maquette. Si vos produits ont un autre packaging, utilisez le plan réel `s5.mp4`.
- Les publicités TikTok sur les produits cosmétiques sont soumises aux règles de TikTok. Le texte reste prudent (« aide à nourrir et assouplir », mentions génétique/hormones, consignes du fabricant).

# ENTOUR — stratégie produit, économique et de lancement

## 1. Positionnement

Les plateformes existantes se spécialisent (garde d'enfants, bricolage, animaux, livraison) ou restent des petites annonces sans transaction. ENTOUR mise sur trois différences :

1. **Tous les petits besoins du quotidien au même endroit**, y compris les demandes libres — l'utilisateur n'a pas à savoir « quelle appli » utiliser.
2. **L'immédiateté de proximité** : « j'ai besoin d'aide maintenant » / « je suis disponible maintenant », diffusion ciblée aux bonnes personnes plutôt qu'à tout le monde.
3. **La confiance comme produit** : vérifications graduées selon le risque de la catégorie, avis infalsifiables, paiement protégé, adresse jamais exposée.

Un même compte demande et propose : la plupart des membres sont tour à tour l'un et l'autre, ce qui densifie le réseau plus vite qu'une marketplace à deux populations séparées.

## 2. Modèle économique

| Source | Mécanisme | Réglage (back-office) | Remarques |
|---|---|---|---|
| Commission | 10 % prélevés sur la part de l'intervenant, minimum 0,50 € | `fees` | Prix affiché au demandeur = prix payé ; simple et lisible |
| Frais de service demandeur | % et/ou fixe | `fees.payerServiceFee*` | Désactivés au lancement (0) pour ne pas freiner l'adoption |
| ENTOUR Plus (4,99 €/mois) | commission 5 %, alertes prioritaires, statistiques | `subscriptions.plus` | Rentable dès ~100 € de revenus mensuels pour l'intervenant |
| ENTOUR Pro (14,99 €/mois) | profil professionnel vérifié, commission 4 %, mises en avant | `subscriptions.pro` | Cible : auto-entrepreneurs (jardiniers, bricoleurs, photographes) |
| Mise en avant d'annonce | 24 h en tête de liste, signalée comme telle | `boost` | Offerte pendant le lancement |
| Partenariats locaux | commerces (fleuristes, quincailleries, pressings) proposant des services ou des avantages | — | Acquisition croisée plutôt que publicité intrusive |
| Offre petits commerces | comptes Pro pour livraisons de proximité | — | Phase 4 |

**Ce qu'on s'interdit** : faire payer la publication ou la candidature, vendre des données, publicité ciblée, rendre l'expérience gratuite volontairement frustrante.

**Pilotage** : la page Finances sépare strictement revenus réels (Stripe) et opérations simulées ; le tableau de bord suit volume, commissions, abonnements ; la page Zones mesure l'équilibre offre/demande.

Ordre de grandeur (hypothèses à valider) : panier moyen 25 €, commission nette ~2,20 € après frais Stripe (~1,5 % + 0,25 €). Il faut ~4 500 missions/mois pour 10 k€ de marge brute de commissions : la rentabilité vient de la **densité locale** (fréquence d'usage), d'où la stratégie de lancement ville par ville.

## 3. Lancement progressif

**Le problème de l'œuf et de la poule** : une demande sans réponse fait fuir le demandeur ; un offreur sans mission fait de même. On ne lance donc pas « la France », on lance **un territoire dense**.

1. **Zone pilote (mois 0-3)** : une ville étudiante de taille moyenne ou deux arrondissements d'une grande ville (Lyon 3e/6e/7e configurés par défaut). Rayon de 20 km actif dans `launch.activeZones`.
2. **Côté offre d'abord** : recruter 150-300 intervenants avant l'ouverture grand public — associations étudiantes, BDE, missions locales, retraités actifs, clubs de jardinage. Arguments : revenus de complément, horaires libres, « disponible maintenant ».
3. **Côté demande** : commerçants partenaires (affiches avec QR code, flyers dans les sacs), syndics et gardiens d'immeuble, crèches et écoles pour le baby-sitting (avec le dispositif de vérification renforcée comme argument), groupes Facebook / Nextdoor de quartier.
4. **Parrainage** : 100 points pour le parrain, 50 pour le filleul à la première mission (réglable) — récompense uniquement sur activité réelle pour éviter la fraude.
5. **Animation** : remerciements publics, classements de quartier, défis mensuels et badges saisonniers pour créer de l'habitude.
6. **Mesure** : page Zones (demandes sans réponse > 50 % → recruter des offreurs ; offreurs sans demandes → communication habitants). Critère d'extension : > 70 % des demandes avec au moins une réponse en moins de 2 h pendant 4 semaines.
7. **Extension** : communes voisines d'abord (effet de réseau contigu), puis une deuxième ville en répliquant le playbook.

## 4. Confiance et sécurité — règles par catégorie

| Sensibilité | Exemples | Exigences pour répondre |
|---|---|---|
| Enfants | baby-sitting, aide aux devoirs | majeur, téléphone + identité vérifiés, ≥ 1 référence validée (baby-sitting) |
| Personnes vulnérables | aide aux personnes âgées, accompagnement | téléphone + identité vérifiés, aucun soin médical |
| Accès au domicile | ménage, gardiennage, surveillance | identité requise pour la surveillance / le gardiennage |
| Animaux | garde, promenade | téléphone vérifié |
| Technique | réparations, installation | consigne : pas d'interventions réglementées |
| Transport | transport d'objets | transport rémunéré de personnes interdit |

Mécanismes transverses : 18 ans minimum (date de naissance immuable), modération automatique explicable avec mise en attente humaine (jamais de suppression automatique), détection des arnaques connues (coupons PCS, mandats, codes SMS, paiement hors plateforme), limitation de débit, signalements avec score de risque, blocage, journal des actions sensibles, litiges avec gel des fonds.

## 5. Conformité (France / UE)

- **RGPD** : minimisation (position floutée, nom réduit à l'initiale), export des données et suppression de compte en libre-service, durées de conservation documentées, sous-traitants listés. À faire : registre des traitements, AIPD pour la vérification d'identité et la géolocalisation, DPO désigné.
- **Plateformes en ligne (art. L111-7 C. conso.)** : critères de classement et de référencement exposés dans les CGU ; mises en avant identifiées.
- **DSA (règlement 2022/2065)** : signalement accessible partout, décisions motivées, possibilité de contestation.
- **Fiscalité** : information claire, aucune présentation comme « non imposable » ; déclaration annuelle DAC7 / art. 242 bis CGI (seuils : 30 transactions ou 2 000 €) — l'export reste à développer.
- **Travail** : ENTOUR n'est pas employeur ; pas de contrôle de l'exécution ni de tarification imposée ; vigilance sur la requalification pour les membres très actifs (incitation au statut de micro-entrepreneur, offre Pro).
- **Services à la personne** : la garde d'enfants de moins de 3 ans et l'assistance aux personnes âgées peuvent relever de réglementations spécifiques (agrément, CESU) — à analyser avec un juriste avant d'élargir ces catégories.
- **Paiements** : ENTOUR n'encaisse pas pour compte de tiers ; Stripe (établissement agréé) détient et verse les fonds.

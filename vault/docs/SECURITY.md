# Modèle de sécurité

## Ce qui est protégé
- **Au repos** : chaque original, miniature, rendu, musique, ainsi que l'index (noms, dates, lieux, albums,
  étiquettes) et les projets sont chiffrés en AES-256-GCM (format VLT1). Une clé aléatoire par fichier,
  emballée par la clé maîtresse (MK). En plus, iOS chiffre les fichiers (NSFileProtectionComplete).
- **Clé maîtresse** : 256 bits aléatoires, jamais écrite en clair. Stockée dans le Keychain (`ThisDeviceOnly`)
  sous trois emballages :
  1. `KEK_code = HKDF(PBKDF2-SHA256(code, sel, 600 000), poivre de l'appareil)` ;
  2. `KEK_secours = PBKDF2(clé de récupération 120 bits, sel)` ;
  3. une copie protégée par biométrie (`biometryCurrentSet`), si l'option est activée.
- **Code** : jamais stocké (ni en clair ni haché) ; il est vérifié en ouvrant l'emballage AES-GCM. Les codes
  triviaux (0000, 1234, 123456…) sont refusés.
- **Tentatives** : état dans le Keychain ; 4 essais libres, puis 30 s, 1 min, 5 min, 15 min, 1 h ; reculer
  l'horloge ne lève pas le blocage ; effacement des clés en option après 10 erreurs.
- **Session** : MK en mémoire uniquement, verrouillage automatique et en arrière-plan (pauses pendant les
  feuilles système et les imports), caches et espace temporaire purgés au verrouillage.
- **Albums protégés/masqués** : leur contenu est exclu de la galerie, des albums intelligents, de la
  recherche, des statistiques et des souvenirs tant qu'il n'est pas déverrouillé (Face ID ou code).
  *Limite* : c'est un contrôle d'accès dans le coffre déjà déchiffré, pas une seconde couche de chiffrement.
- **Extension de partage** : ne connaît qu'une clé publique X25519 ; chaque dépôt est chiffré avec une clé
  éphémère (ECDH + HKDF). Seule l'app déverrouillée peut l'ouvrir.
- **Effacement** : supprimer un média détruit son fichier, donc sa clé (effacement cryptographique).
  « Effacer le coffre » détruit d'abord les secrets du Keychain.

## Limites connues (honnêtes)
- Un appareil compromis (jailbreak, logiciel espion) peut voir ce qui est affiché.
- iOS ne permet pas de bloquer les captures d'écran ; VAULT masque le contenu en cas d'enregistrement ou de
  recopie de l'écran quand le mode discret est actif.
- Montage et export nécessitent des copies déchiffrées temporaires (protégées, effacées au verrouillage ;
  la mémoire flash peut garder des traces, déjà chiffrées par iOS).
- Code oublié + clé de récupération perdue = données irrécupérables (choix de conception).
- La carte (MapKit) contacte Apple Plans : elle ne s'affiche que sur demande.

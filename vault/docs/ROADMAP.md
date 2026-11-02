# Feuille de route (non implémenté à ce jour)

Ces éléments ne sont **pas** présentés dans l'application :

- **Suppression d'objets « intelligente »** (remplissage génératif) : iOS ne fournit pas d'API publique
  d'inpainting. Le correcteur ponctuel actuel couvre les petites imperfections. Piste : modèle Core ML
  embarqué (LaMa ou équivalent) exécuté sur l'appareil.
- **Musique libre de droits fournie** : aucune bibliothèque n'est livrée (droits à acquérir) ; seule la
  musique importée par l'utilisateur est prise en charge.
- **Photos fixes dans l'éditeur vidéo** : on passe par la « vidéo souvenir » (photos → vidéo), qu'on peut
  ensuite monter.
- **Seconde couche de chiffrement par album protégé** (avec un code propre à l'album).
- **Android** : VaultCore n'a pas de dépendance Apple au-delà de CryptoKit/swift-crypto ; le format est
  documenté (`FORMAT.md`) pour une implémentation Kotlin (Tink / javax.crypto + Keystore).
- **Index SQLite chiffré** au-delà d'environ 50 000 médias.
- Localisation en anglais (l'interface est en français).

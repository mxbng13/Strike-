# Format de fichier VLT1 (spécification pour d'autres plateformes)

Entiers en big-endian.

```
En-tête
  4   magic "VLT1"
  1   version = 1
  1   kind (0 original, 1 miniature, 2 rendu, 3 index, 4 projet, 5 dépôt, 6 audio, 9 autre)
  4   chunkSize (octets de clair par bloc, 262144 par défaut)
  16  fileID (UUID)
  8   noncePrefix aléatoire
  2   wrappedKeyLen
  n   wrappedKey = AES-256-GCM(clé de fichier 32 o, clé d'emballage, AAD = "vault.filekey.v1." + UUID en majuscules)
      (format « combined » CryptoKit : nonce 12 || chiffré || tag 16)
Blocs i = 0..N-1
  chiffré (≤ chunkSize) || tag (16)
  nonce = noncePrefix || u32(i)
  AAD   = SHA256(en-tête complet) || u64(i) || u8(final ? 1 : 0)
```

Le dernier bloc porte `final = 1` (il peut être vide). Le nombre de blocs se déduit de la taille du fichier.
Toute modification, permutation, troncature ou substitution de bloc fait échouer l'authentification.

**Index** : JSON de `LibraryState`, dates en millisecondes Unix entières, chiffré avec `kind = 3`.

**Sauvegarde `.vaultbackup`** : `"VBK1" | 1 | u32 iterations | sel 16 | u16 len | MK emballée (AAD
"vault.backup.mk") | keyCheck 32`, puis entrées `u16 nameLen | nom | u64 taille | octets` (fichiers VLT1
tels quels), terminées par `nameLen = 0`.

**keyCheck** = HMAC-SHA256(MK, "vault.keycheck.v1").


/**
 * Restrictions de Mon IA
 * Autorise le vocabulaire anatomique et médical.
 * Les autres règles de sécurité du modèle restent applicables.
 */
(function (root) {
  // Termes anatomiques : autorisés, y compris dans les cours médicaux.
  const ANATOMY_TERMS = [
    'pénis', 'penis',
    'vagin', 'vagina',
    'vulve', 'vulva',
    'clitoris',
    'testicule', 'testicules',
    'scrotum',
    'utérus', 'uterus',
    'ovaire', 'ovaires',
    'prostate',
    'urètre', 'uretre',
    'vésicule séminale',
    'anus', 'rectum',
    'seins', 'tétons', 'mamelons',
    'organes génitaux',
    'anatomie reproductive',
    'appareil reproducteur'
  ];

  const ANATOMY_PATTERN = new RegExp(
    '\\b(' +
      ANATOMY_TERMS
        .map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('|') +
    ')\\b',
    'i'
  );

  // Vérifie uniquement les catégories explicitement configurées ici.
  // Les termes anatomiques ne sont pas considérés comme des motifs interdits.
  const EXPLICIT_PATTERN =
    /\b(?:pornographie|pornographic|hardcore)\b/i;

  const SHOWN = [
    'Les termes anatomiques et médicaux sont autorisés',
    'Les demandes médicales et pédagogiques sont acceptées'
  ];

  const MESSAGE =
    'Cette demande nécessite une reformulation adaptée au contexte médical.';

  function check(text) {
    const value = String(text || '');

    // Autorise les termes anatomiques en eux-mêmes.
    if (ANATOMY_PATTERN.test(value)) {
      return null;
    }

    // Exemple de catégorie explicitement filtrée.
    const match = value.match(EXPLICIT_PATTERN);
    return match ? match[0] : null;
  }

  root.MonIARestrictions = {
    check,
    shown: SHOWN,
    message: MESSAGE
  };
})(typeof window !== 'undefined' ? window : globalThis);

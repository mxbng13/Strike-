
/**
 * Restrictions de Mon IA
 * Autorise les contenus anatomiques, médicaux et pédagogiques
 * liés à la santé sexuelle et reproductive.
 */
(function (root) {
  const MEDICAL_TERMS = [
    // Anatomie
    'pénis', 'penis', 'vagin', 'vagina', 'vulve', 'vulva',
    'clitoris', 'testicule', 'testicules', 'scrotum',
    'utérus', 'uterus', 'ovaire', 'ovaires', 'prostate',
    'urètre', 'uretre', 'anus', 'rectum', 'seins',
    'tétons', 'mamelons', 'gland', 'prépuce', 'vésicule séminale',

    // Médecine et reproduction
    'anatomie', 'appareil reproducteur', 'organes génitaux',
    'santé sexuelle', 'santé reproductive', 'gynécologie',
    'urologie', 'sexologie', 'contraception', 'fécondation',
    'ovulation', 'menstruation', 'puberté', 'fertilité',
    'grossesse', 'accouchement', 'maladie sexuellement transmissible',
    'infection sexuellement transmissible', 'ist', 'mst',
    'érection', 'éjaculation', 'sperme', 'spermatozoïde',
    'lubrification', 'orgasme', 'consentement',
    'dysfonction érectile', 'endométriose', 'prolapsus'
  ];

  const MEDICAL_PATTERN = new RegExp(
    '\\b(?:' +
      MEDICAL_TERMS
        .sort((a, b) => b.length - a.length)
        .map(term =>
          term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        )
        .join('|') +
    ')\\b',
    'i'
  );

  // Indices de contexte éducatif ou médical.
  const EDUCATIONAL_PATTERN =
    /\b(?:médical|médicale|médecine|anatomique|anatomie|cours|étude|études|recherche|scientifique|pédagogique|diagnostic|symptôme|traitement|prévention|examen clinique|santé sexuelle|gynécologie|urologie|reproduction)\b/i;

  const SHOWN = [
    'Le vocabulaire anatomique et médical est autorisé.',
    'Les demandes éducatives sur la sexualité et la reproduction sont acceptées.',
    'Les termes anatomiques ne constituent pas à eux seuls un motif de blocage.'
  ];

  const MESSAGE =
    'Cette demande doit être évaluée selon son contexte et les règles de sécurité applicables.';

  function check(text) {
    const value = String(text || '').normalize('NFC').trim();

    if (!value) return null;

    // Ne pas bloquer un contenu uniquement parce qu'il mentionne
    // l'anatomie ou la santé sexuelle.
    if (
      MEDICAL_PATTERN.test(value) ||
      EDUCATIONAL_PATTERN.test(value)
    ) {
      return null;
    }

    // Les autres vérifications peuvent être réalisées par
    // un système de modération tenant compte du contexte.
    return null;
  }

  // Les filtres du fournisseur restent configurés séparément.
  // Ne pas modifier leur configuration sans vérifier la politique
  // applicable au modèle et au service utilisés.
  function geminiSafety() {
    return [
      {
        category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
        threshold: 'BLOCK_LOW_AND_ABOVE'
      }
    ];
  }

  root.MonIARestrictions = {
    check,
    shown: SHOWN,
    message: MESSAGE,
    geminiSafety
  };
})(typeof window !== 'undefined' ? window : globalThis);

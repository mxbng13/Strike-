// Restrictions fixes de Mon IA : pas de contenu sexuel ni de nudité.
// C'est le seul endroit du code où elles sont définies. L'app (recherche de photos, affichage dans
// Apprendre › Tchat) et le moteur HD (hd.js) viennent tous lire ce fichier.
(function (root) {
  // Mots refusés, en français et en anglais.
  const WORDS = /\b(nu|nue|nus|nues|nudit[eé]|seins?|t[eé]tons?|mamelons?|p[eé]nis|vagin|vulve|clitoris|sexe|sexuel(le)?s?|porno?|pornographi\w*|[eé]rotique|xxx|nsfw|naked|nude|nudity|topless|boobs?|breasts?|nipples?|genitals?|penis|vagina|sex|sexual|porn\w*|erotic|lingerie|strip\w*)\b/i;

  // La même liste, lisible, pour l'affichage dans Apprendre › Tchat.
  const SHOWN = ['nu, nue, nudité', 'seins, tétons, mamelons', 'pénis, vagin, vulve, clitoris', 'sexe, sexuel', 'porno', 'érotique', 'xxx, nsfw', 'naked, nude, topless', 'boobs, breasts, nipples', 'genitals', 'sex, porn, erotic', 'lingerie', 'strip…'];

  const MESSAGE = 'pas de contenu sexuel ni de nudité';

  // Renvoie le mot refusé trouvé dans le texte, ou null.
  function check(text) {
    const m = WORDS.exec(text || '');
    return m ? m[0] : null;
  }

  // Filtres de Google Gemini (moteur en ligne) : la catégorie contenu sexuel reste bloquée.
  function geminiSafety() {
    return [{ category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_LOW_AND_ABOVE' }];
  }

  root.MonIARestrictions = { check, shown: SHOWN, message: MESSAGE, geminiSafety };
})(typeof window !== 'undefined' ? window : globalThis);

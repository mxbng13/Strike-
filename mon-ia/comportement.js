// ════════════════════════════════════════════════════════════════════════════════════════════════
//  comportement.js — LE fichier central de « Mon IA »
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
//  Tout ce qui décide comment ton IA se comporte est ici :
//    §1  Instructions système (personnalité, niveaux de filtre, consignes santé/médecine)
//    §2  Actions du tchat et mots déclencheurs (photos, infos web, mémoire)
//    §3  Catégories de contenu et règles par usage (la seule règle fixe de l'app)
//    §4  Filtres que TU règles (mots interdits / mots autorisés)
//    §5  Détection des refus venant du modèle de texte
//    §6  Appels aux modèles de texte (Pollinations, OpenAI, OpenRouter, Claude, autre)
//    §7  Recherche d'infos et de photos sur le web
//    §8  Réglages de sécurité envoyés aux fournisseurs d'images en ligne
//    §9  Consignes des modules « S'améliorer » et « Code »
//    §10 Messages d'erreur
//    §11 Diagnostic (journal des refus et des erreurs, sans contenu ni clé)
//
//  Ce fichier est chargé AVANT le code de la page (index.html) et du moteur HD (hd.js) :
//  ce sont eux qui appellent les fonctions d'ici. Rien d'autre dans le projet ne définit de règle.
//
//  Exceptions qui restent ailleurs, parce qu'elles ne décident pas du comportement :
//    - index.html : l'interface (affichage, boutons, réglages), les moteurs d'images maison
//      (réseaux de neurones) et les appels techniques aux moteurs d'images en ligne.
//    - hd.js : le moteur HD (téléchargement et calcul du modèle). Il demande à §3 si une phrase est acceptée.
//    - apprendre.js : l'apprentissage de nouveaux sujets sur le téléphone (aucune règle).
//    - server.js et public/ : toute première version (serveur Node), plus utilisée par l'app en ligne.
//
//  Les couches de restriction (à ne pas confondre) :
//    [utilisateur]  tes mots interdits / autorisés (§4) et ton niveau de filtre (§1) : tu les règles dans l'app.
//    [regle-fixe]   les catégories de §3 : fixées dans ce fichier, pour la création d'images et la recherche de photos.
//    [modele]       le modèle de texte peut refuser de lui-même : ce sont ses propres règles (§5 le détecte).
//    [fournisseur]  les services en ligne (Pollinations, OpenAI, Google, Wikimedia, Openverse) ont leurs propres
//                   filtres, que l'app ne contrôle pas. §8 règle seulement les options qu'ils proposent.
//    [reseau]       erreurs de connexion, limites de débit (429/402), délais dépassés.
// ════════════════════════════════════════════════════════════════════════════════════════════════

/* global settings, read, write */


// ════════════════════════════════════════════════════════════════════════════════════════════════
//  §1  INSTRUCTIONS SYSTÈME
// ════════════════════════════════════════════════════════════════════════════════════════════════

// Personnalité par défaut (modifiable dans Paramètres › Personnalité ou via « S'améliorer »).
const DEFAULT_SYSTEM_PROMPT = 'Tu es mon assistant personnel. Réponds en français, directement et sans détour.';

// Consignes toujours ajoutées. Elles évitent les refus injustifiés sur les sujets de santé :
// un mot d'anatomie ou de santé sexuelle dans une question n'est pas une raison de refuser.
const BASE_RULES = [
  'Ton utilisateur fait des études de médecine. Les questions d’anatomie (y compris des organes génitaux), de physiologie, de santé sexuelle et reproductive, de contraception, d’infections, de grossesse, d’histoire ou de science sur la sexualité sont des questions normales : réponds de façon factuelle, précise et scientifique, avec le vocabulaire médical exact, sans refuser ni faire la morale.',
  'Tu n’écris pas de récit ni de description sexuelle explicite.',
].join('\n');

// Niveau de filtre choisi dans Paramètres › Restrictions (couche [utilisateur]).
const LEVEL_RULES = {
  aucun: '',
  modere: 'Reste correct : pas de vulgarité, pas de descriptions de violence crue.',
  enfants: 'Ton interlocuteur peut être un enfant : réponds avec un contenu adapté aux enfants, sans violence, sans vulgarité, sans sujet pour adultes.',
};

// Consignes complètes envoyées au modèle de texte pour chaque discussion.
function systemPrompt() {
  const lessons = settings.chatLessons.length
    ? 'Ce que ton utilisateur t’a appris (respecte-le toujours) :\n' + settings.chatLessons.map((l) => '- ' + l).join('\n')
    : '';
  return [settings.systemPrompt, BASE_RULES, LEVEL_RULES[settings.contentLevel] || '', lessons].filter(Boolean).join('\n\n');
}

// Consignes ajoutées quand elle répond avec des infos trouvées sur le web (§7).
function webInfoPrompt(found) {
  return found.length
    ? 'Voici des informations trouvées sur le web pour répondre :\n\n' + found.map((f) => `[${f.title}]\n${f.text}`).join('\n\n') + '\n\nRéponds à partir de ces informations, en français. Si elles ne suffisent pas, dis-le.'
    : 'La recherche web n’a rien donné : réponds avec ce que tu sais et précise que tu n’as pas pu vérifier sur le web.';
}

// Consignes des petites tâches de traduction et de réécriture (service gratuit Pollinations).
const TASK_PROMPTS = {
  enhanceImage: 'Rewrite the user request as one detailed English prompt for a high-end image generator: subject, setting, composition, lighting, lens or art style, mood, fine details, and quality words like "highly detailed, sharp focus". Keep the user\'s intent exactly; add nothing they did not ask for. At most 90 words. Reply with the prompt only.',
  enhanceEdit: 'Rewrite the user request as one precise English image-editing instruction for an AI photo editor. Say exactly what to change and that everything else (face, identity, pose, framing, lighting) must stay the same. Reply with the instruction only.',
  translateImage: 'Translate the user text to English for an image generator. Keep every detail. Reply with the translation only.',
  translateSearch: 'Translate this image search query to English. Reply with the query only.',
};


// ════════════════════════════════════════════════════════════════════════════════════════════════
//  §2  ACTIONS DU TCHAT ET MOTS DÉCLENCHEURS
// ════════════════════════════════════════════════════════════════════════════════════════════════

// Chaque action s'active quand le message commence par un de ses mots (modifiables dans Apprendre › Tchat).
const DEFAULT_SKILLS = {
  photos: { on: true, title: 'Chercher des photos sur le web', example: 'cherche des photos de tour Eiffel', words: ['cherche', 'recherche', 'trouve', 'récupère', 'montre', 'envoie', 'envoi', 'donne'] },
  web: { on: true, title: 'Chercher des infos sur le web', example: 'cherche sur google la taille de la tour Eiffel', words: ['cherche sur google', 'recherche sur google', 'google', 'cherche sur internet', 'recherche sur internet', 'regarde sur internet', 'cherche sur le web'] },
  memory: { on: true, title: 'Retenir ce que je lui dis', example: 'retiens que je fais des études de médecine', words: ['retiens', 'souviens-toi', 'souviens toi', 'n’oublie pas', 'apprends que'] },
};

// Renvoie le reste du message s'il commence par un des mots déclencheurs de l'action, sinon null.
function skillRest(name, text) {
  const sk = settings.skills[name];
  if (!sk?.on) return null;
  const lower = text.toLowerCase().replace(/’/g, "'");
  const word = [...sk.words].sort((a, b) => b.length - a.length).find((w) => w && lower.startsWith(w.toLowerCase().replace(/’/g, "'")));
  return word ? text.slice(word.length).trim() : null;
}

// « cherche des photos de X » → « X ». Aussi « /web X ».
function searchQuery(text) {
  if (text.startsWith('/web ')) return text.slice(5).trim() || null;
  const rest = skillRest('photos', text);
  if (rest === null) return null;
  const m = /^(?:[-\s]*moi)?\s*(?:sur\s+(?:google|internet|le\s+web)\s+)?(?:des|une|un|les|quelques|de\s+vraies|des\s+vraies)?\s*(?:images?|photos?)\s+(.+)$/i.exec(rest);
  if (!m) return null;
  return m[1].replace(/\s+(?:sur|depuis|avec)\s+(?:google|internet|le\s+web)\b.*$/i, '').replace(/^(?:de|d['’]|du|des|sur)\s*/i, '').trim() || null;
}

// « cherche sur google X » → « X ».
function webQuery(text) {
  const rest = skillRest('web', text);
  return rest ? rest.replace(/^[-:,\s]*(?:moi\s+)?/i, '').trim() || null : null;
}

// « retiens que X » → « X ».
function memoryLesson(text) {
  const rest = skillRest('memory', text);
  if (!rest) return null;
  const lesson = rest.replace(/^[-:,\s]*(?:bien\s+)?(?:que\s+|qu['’]\s*)?/i, '').trim();
  return lesson ? lesson[0].toUpperCase() + lesson.slice(1) : null;
}


// ════════════════════════════════════════════════════════════════════════════════════════════════
//  §3  CATÉGORIES DE CONTENU ET RÈGLES PAR USAGE   (couche [regle-fixe])
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
//  Les usages (« surfaces ») de l'app :
//    discussion      : le tchat, les réponses avec infos du web, la mémoire.
//    rechercheInfos  : la recherche de textes (Wikipédia) pour répondre.
//    creationImage   : toutes les créations et modifications d'images (IA maison, HD, moteurs en ligne).
//    recherchePhotos : la recherche de vraies photos (Wikimedia Commons, Openverse).
//
//  Principe : un mot n'est jamais à lui seul une preuve de mauvaise intention.
//    - En TEXTE (discussion, rechercheInfos), l'app ne bloque AUCUN vocabulaire de ces catégories :
//      une question médicale, anatomique, éducative, historique ou scientifique passe toujours.
//      Seuls tes propres mots interdits (§4) et les règles du modèle de texte ([modele]) s'appliquent.
//    - En IMAGES (creationImage, recherchePhotos), le résultat serait une image de nudité ou sexuelle
//      quel que soit le contexte de la phrase : ces catégories y sont refusées, même pour un cours.
//      Pour l'anatomie en images, les atlas (Netter, Kenhub, Visible Body) restent la bonne source.
//
//  Les mots sont comparés en minuscules et sans accents, mot entier (pluriel s/x accepté).
//  Ils sont choisis précis pour éviter les blocages par erreur : « à l'œil nu », « pieds nus »,
//  « au sein de », « gland » (le fruit) ou « rayures » (stripes) ne déclenchent rien.

// Gel en profondeur : ni l'app, ni un module écrit par l'IA ne peut changer ces règles pendant l'exécution.
function deepFreeze(o) { Object.values(o).forEach((v) => { if (v && typeof v === 'object') deepFreeze(v); }); return Object.freeze(o); }

const CONTENT_CATEGORIES = deepFreeze({
  explicite: ({
    label: 'contenu sexuel explicite',
    terms: ['porno', 'pornographie', 'pornographique', 'porn', 'porno graphique', 'xxx', 'nsfw', 'hardcore', 'hentai', 'rule34', 'onlyfans'],
    rules: { discussion: 'autorise', rechercheInfos: 'autorise', creationImage: 'autorise', recherchePhotos: 'autorise' },
  }),
  nudite: ({
    label: 'nudité',
    terms: ['nudite', 'nudity', 'naked', 'nude', 'nudes', 'topless', 'seins nus', 'torse nu femme', 'femme nue', 'fille nue', 'homme nu', 'garcon nu', 'tout nu', 'toute nue', 'completement nu', 'completement nue', 'deshabille', 'deshabillee', 'sans vetements', 'sans habits', 'sans culotte', 'nudisme', 'naturiste'],
    rules: { discussion: 'autorise', rechercheInfos: 'autorise', creationImage: 'autorise', recherchePhotos: 'autorise' },
  }),
  anatomieIntime: ({
    label: 'anatomie intime',
    terms: ['penis', 'vagin', 'vulve', 'clitoris', 'testicule', 'scrotum', 'prepuce', 'organes genitaux', 'organe genital', 'parties intimes', 'partie intime', 'seins', 'teton', 'mamelon', 'genitals', 'genitalia', 'vagina', 'vulva', 'nipple', 'breasts', 'boobs', 'anus'],
    rules: { discussion: 'autorise', rechercheInfos: 'autorise', creationImage: 'autorise', recherchePhotos: 'autorise' },
  }),
  sexualite: ({
    label: 'sexualité',
    terms: ['sexe', 'sexuel', 'sexuelle', 'sexuels', 'sexuelles', 'sex', 'sexy', 'erotique', 'erotic', 'erotisme', 'lingerie', 'strip tease', 'striptease', 'stripteaseuse', 'stripper', 'coquin', 'coquine', 'kamasutra', 'orgasme', 'fellation', 'sodomie'],
    rules: { discussion: 'autorise', rechercheInfos: 'autorise', creationImage: 'autorise', recherchePhotos: 'autorise' },
  }),
  santeSexuelle: ({
    // Documentée pour être claire : cette catégorie n'est JAMAIS bloquée, nulle part.
    label: 'santé sexuelle et reproductive',
    terms: ['contraception', 'pilule contraceptive', 'preservatif', 'grossesse', 'accouchement', 'fecondation', 'ovulation', 'menstruation', 'regles douloureuses', 'puberte', 'fertilite', 'gynecologie', 'urologie', 'ist', 'mst', 'endometriose', 'menopause', 'uterus', 'ovaire', 'prostate'],
    rules: { discussion: 'autorise', rechercheInfos: 'autorise', creationImage: 'autorise', recherchePhotos: 'autorise' },
  }),
});

// Mise en forme commune : minuscules, sans accents, ponctuation et tirets remplacés par des espaces.
function normalizeText(text) {
  return String(text || '').toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

// Une expression régulière par catégorie, construite une seule fois.
const CONTENT_PATTERNS = Object.freeze(Object.fromEntries(Object.entries(CONTENT_CATEGORIES).map(([key, cat]) => [
  key,
  new RegExp('(?:^| )(' + cat.terms.map(normalizeText).sort((a, b) => b.length - a.length).join('|') + ')(?:s|x)?(?= |$)'),
])));
// Décide si un texte est accepté pour un usage.
// Renvoie { allowed, layer, category, label, message } ; ne garde jamais le texte lui-même.
const contentCheck = Object.freeze(function contentCheck(surface, text) {
  const clean = ' ' + normalizeText(text) + ' ';
  const found = [];
  for (const [key, cat] of Object.entries(CONTENT_CATEGORIES)) {
    if (CONTENT_PATTERNS[key].test(clean.trim())) found.push(key);
  }
  const refused = found.find((key) => CONTENT_CATEGORIES[key].rules[surface] === 'refuse');
  if (!refused) return { allowed: true, layer: null, categories: found };
  const label = CONTENT_CATEGORIES[refused].label;
  return { allowed: false, layer: 'regle-fixe', category: refused, label, categories: found, message: MESSAGES.contentRefused(surface, label) };
});


// ════════════════════════════════════════════════════════════════════════════════════════════════
//  §4  FILTRES QUE TU RÈGLES   (couche [utilisateur])
// ════════════════════════════════════════════════════════════════════════════════════════════════

// Tes mots interdits (Paramètres ou Apprendre › Tchat), avec tes mots autorisés comme exceptions.
// S'applique à tout : discussion, recherches, images. Renvoie le mot trouvé, ou undefined.
function findBlockedWord(text) {
  let lower = text.toLowerCase();
  for (const w of settings.allowedWords) if (w) lower = lower.split(w.toLowerCase()).join(' ');
  return settings.blockedWords.find((w) => w && lower.includes(w.toLowerCase()));
}


// ════════════════════════════════════════════════════════════════════════════════════════════════
//  §5  DÉTECTION DES REFUS DU MODÈLE   (couche [modele])
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
//  Le modèle de texte peut refuser de lui-même : ce n'est pas l'app qui bloque. On ne modifie pas
//  sa réponse ; on note seulement dans le diagnostic que le refus vient de lui.

const MODEL_REFUSAL_START = /^\s*(?:je ne peux pas|je ne suis pas en mesure|désolée?,? (?:mais )?je ne peux|je regrette,? (?:mais )?je ne peux|i can(?:no|')t (?:help|assist|provide)|i'?m sorry,? but i can(?:no|')t|i'?m not able to)/i;

function detectModelRefusal(text, stopReason) {
  if (stopReason === 'refusal') return 'arrêt « refusal » renvoyé par Claude';
  if (stopReason === 'content_filter') return 'arrêt « content_filter » renvoyé par le fournisseur';
  if (MODEL_REFUSAL_START.test(text || '')) return 'la réponse commence par une formule de refus';
  return null;
}


// ════════════════════════════════════════════════════════════════════════════════════════════════
//  §6  APPELS AUX MODÈLES DE TEXTE
// ════════════════════════════════════════════════════════════════════════════════════════════════

const TEXT_URLS = {
  free: 'https://text.pollinations.ai/openai',
  openai: 'https://api.openai.com/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  anthropic: 'https://api.anthropic.com/v1/messages',
};
const MODEL_HINTS = {
  free: 'Exemples : openai, mistral, deepseek',
  openai: 'Exemples : gpt-4o-mini, gpt-4o',
  openrouter: 'Nom complet, ex. meta-llama/llama-3.1-70b-instruct',
  anthropic: 'Exemples : claude-sonnet-5-5, claude-haiku-5-5',
  custom: 'Le nom du modèle chez ce fournisseur',
};
// Le service gratuit autorise une réponse toutes les 30 s : on attend et on réessaie (3 fois au plus).
const RATE_LIMIT = { retries: 3, maxWaitSeconds: 35, defaultWaitSeconds: 30 };

async function readError(res) {
  const body = await res.text();
  try { const j = JSON.parse(body); return j.error?.message || j.error || j.message || body; } catch { return body.slice(0, 300); }
}

// Discussion avec la personnalité de l'IA (§1). extra = consignes en plus pour cette réponse.
async function chat(history, extra = '') {
  const msgs = history.slice(-settings.historyLength).map((m) => ({ role: m.role, content: m.content }));
  return llm([systemPrompt(), extra].filter(Boolean).join('\n\n'), msgs);
}

// Appel au modèle de texte choisi dans Paramètres, avec les consignes « system ».
// Paramètres qui influencent la réponse : modèle, température, longueur max (Paramètres › Discussion).
async function llm(system, msgs, step = 'discussion') {
  const s = settings;
  const provider = s.textProvider;
  if (provider !== 'free' && !s.textApiKey && provider !== 'custom') {
    diag.log({ etape: step, couche: 'utilisateur', statut: 'sans clé', detail: provider });
    throw new Error(MESSAGES.missingKey);
  }
  if (provider === 'anthropic') {
    const res = await fetch(TEXT_URLS.anthropic, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': s.textApiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model: s.textModel, max_tokens: s.maxTokens, temperature: s.temperature, system, messages: msgs }),
    });
    if (!res.ok) {
      const err = await readError(res);
      diag.log({ etape: step, couche: 'fournisseur', statut: res.status, detail: 'Claude : ' + err });
      throw new Error(MESSAGES.provider(res.status, err));
    }
    const json = await res.json();
    const text = json.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    const refusal = detectModelRefusal(text, json.stop_reason);
    diag.log({ etape: step, couche: refusal ? 'modele' : null, statut: 200, arret: json.stop_reason, detail: refusal || 'Claude' });
    return text;
  }
  const url = provider === 'custom' ? s.textBaseUrl.replace(/\/+$/, '') + '/chat/completions' : TEXT_URLS[provider];
  const headers = { 'content-type': 'application/json' };
  if (s.textApiKey && provider !== 'free') headers.authorization = `Bearer ${s.textApiKey}`;
  const body = JSON.stringify({ model: s.textModel, temperature: s.temperature, max_tokens: s.maxTokens, messages: [{ role: 'system', content: system }, ...msgs] });
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { method: 'POST', headers, body });
    if (res.ok) {
      const json = await res.json();
      const choice = json.choices?.[0];
      const text = choice?.message?.content ?? '';
      const refusal = detectModelRefusal(text, choice?.finish_reason);
      diag.log({ etape: step, couche: refusal ? 'modele' : null, statut: 200, arret: choice?.finish_reason, detail: refusal || provider });
      return text;
    }
    const err = await readError(res);
    if (attempt < RATE_LIMIT.retries && (res.status === 429 || (res.status === 402 && /retry after/i.test(err)))) {
      const wait = Math.min(RATE_LIMIT.maxWaitSeconds, Number((/retry after (\d+)/i.exec(err) || [])[1]) || RATE_LIMIT.defaultWaitSeconds);
      diag.log({ etape: step, couche: 'reseau', statut: res.status, detail: `limite du service gratuit, nouvel essai dans ${wait + 1} s` });
      await new Promise((r) => setTimeout(r, (wait + 1) * 1000));
      continue;
    }
    diag.log({ etape: step, couche: 'fournisseur', statut: res.status, detail: provider + ' : ' + err });
    throw new Error(MESSAGES.provider(res.status, err));
  }
}

// Petite tâche gratuite (traduction, réécriture) : renvoie le texte d'origine si le service ne répond pas.
async function quickTask(instruction, text, { timeout = 8000, maxLength = 600 } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetch(TEXT_URLS.free, {
      method: 'POST', signal: ctl.signal, headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'openai', messages: [{ role: 'system', content: instruction }, { role: 'user', content: text }] }),
    });
    const out = res.ok ? (await res.json()).choices?.[0]?.message?.content?.trim().replace(/^["']|["']$/g, '') : '';
    return out && out.length < maxLength ? out : text;
  } catch { return text; } finally { clearTimeout(timer); }
}

// Traduit et enrichit une demande d'image en anglais détaillé (moteurs en ligne).
async function enhancePrompt(prompt, forEdit) {
  if (!settings.enhancePrompts) return prompt;
  return quickTask(forEdit ? TASK_PROMPTS.enhanceEdit : TASK_PROMPTS.enhanceImage, prompt, { timeout: 20000, maxLength: 1500 });
}

// Traduction pour le moteur HD (il comprend mieux l'anglais).
function translateForImage(text) { return quickTask(TASK_PROMPTS.translateImage, text, { timeout: 8000, maxLength: 600 }); }


// ════════════════════════════════════════════════════════════════════════════════════════════════
//  §7  RECHERCHE D'INFOS ET DE PHOTOS SUR LE WEB
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
//  Google ne fournit pas ses résultats gratuitement à une app : la recherche passe par des services
//  libres et gratuits, et chaque réponse garde un lien vers Google pour aller plus loin.
//    Infos  : Wikipédia (fr), 3 résumés.
//    Photos : Openverse (filtre « mature=false » imposé par Openverse) + Wikimedia Commons.
//  Les résultats ne sont pas filtrés après réception par l'app (les vignettes cassées sont juste masquées
//  à l'affichage). Le filtrage avant envoi est fait par send() avec §3 (recherchePhotos) et §4.

const SEARCH = {
  timeoutMs: 12000,
  maxPhotos: 18,
  perSource: 12,
  wikipedia: (q) => 'https://fr.wikipedia.org/w/api.php?action=query&generator=search&gsrlimit=3&prop=extracts|info&inprop=url&exintro=1&explaintext=1&exchars=1500&format=json&origin=*&gsrsearch=' + encodeURIComponent(q),
  commons: (q) => 'https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrlimit=12&prop=imageinfo&iiprop=url&iiurlwidth=480&format=json&origin=*&gsrsearch=' + encodeURIComponent('filetype:bitmap ' + q),
  openverse: (q) => 'https://api.openverse.org/v1/images/?mature=false&page_size=12&q=' + encodeURIComponent(q),
  google: (q) => 'https://www.google.com/search?q=' + encodeURIComponent(q),
  googleImages: (q) => 'https://www.google.com/search?tbm=isch&q=' + encodeURIComponent(q),
};

// Renvoie { data, status } : status = code HTTP, 'delai' (trop long) ou 'reseau'.
async function fetchJsonStatus(url, ms = SEARCH.timeoutMs) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { signal: ctl.signal }); return { data: r.ok ? await r.json() : null, status: r.status }; }
  catch (err) { return { data: null, status: err?.name === 'AbortError' ? 'delai' : 'reseau' }; }
  finally { clearTimeout(timer); }
}
async function fetchJson(url, ms) { return (await fetchJsonStatus(url, ms)).data; }

async function toEnglishQuery(q) { return quickTask(TASK_PROMPTS.translateSearch, q, { timeout: 6000, maxLength: 200 }); }

// Infos du web : résumés Wikipédia donnés à l'IA pour qu'elle réponde avec.
async function webInfo(q) {
  const { data, status } = await fetchJsonStatus(SEARCH.wikipedia(q));
  const found = Object.values(data?.query?.pages || {}).sort((a, b) => a.index - b.index).filter((p) => p.extract).map((p) => ({ title: p.title, url: p.fullurl, text: p.extract }));
  diag.log({ etape: 'recherche d’infos', couche: status === 200 ? null : 'reseau', statut: status, resultats: found.length, detail: 'Wikipédia' });
  return found;
}

// Photos du web : on mélange les sources, sans doublon.
async function searchWebImages(q) {
  const en = await toEnglishQuery(q);
  const sources = [
    ['Openverse', SEARCH.openverse(en), (j) => (j?.results || []).map((r) => ({ thumb: r.thumbnail || r.url, url: r.url, title: r.title }))],
    ['Wikimedia (anglais)', SEARCH.commons(en), commonsResults],
  ];
  if (en.toLowerCase() !== q.toLowerCase()) sources.push(['Wikimedia (français)', SEARCH.commons(q), commonsResults]);
  const lists = await Promise.all(sources.map(async ([name, url, parse]) => {
    const { data, status } = await fetchJsonStatus(url);
    const list = parse(data);
    diag.log({ etape: 'recherche de photos', couche: status === 200 ? null : 'fournisseur', statut: status, resultats: list.length, detail: name });
    return list;
  }));
  const seen = new Set(), out = [];
  for (let i = 0; out.length < SEARCH.maxPhotos && i < SEARCH.perSource; i++) {
    for (const list of lists) {
      const r = list[i];
      if (r?.thumb && !seen.has(r.url)) { seen.add(r.url); out.push(r); }
    }
  }
  return out;
}
function commonsResults(j) {
  return Object.values(j?.query?.pages || {}).sort((a, b) => a.index - b.index)
    .map((p) => p.imageinfo?.[0] && { thumb: p.imageinfo[0].thumburl, url: p.imageinfo[0].url, title: p.title.replace(/^File:|\.\w+$/g, '') }).filter(Boolean);
}


// ════════════════════════════════════════════════════════════════════════════════════════════════
//  §8  RÉGLAGES DE SÉCURITÉ ENVOYÉS AUX FOURNISSEURS D'IMAGES EN LIGNE   (couche [fournisseur])
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
//  Ces services gardent toujours leurs propres règles internes, que l'app ne peut pas changer.
//  « Filtres des fournisseurs » (Paramètres › Images) choisit seulement les options qu'ils proposent.

// Google Gemini : harcèlement, haine et contenu dangereux au plus bas si tu le choisis ;
// la catégorie contenu sexuel reste bloquée (cohérent avec §3, creationImage).
function geminiSafety() {
  return [
    ...['HARM_CATEGORY_HARASSMENT', 'HARM_CATEGORY_HATE_SPEECH', 'HARM_CATEGORY_DANGEROUS_CONTENT'].map((category) => ({ category, threshold: 'BLOCK_NONE' })),
    { categori , threshold: 'BLOCK_LOW_AND_ABOVE' },
  ];
}
// OpenAI Images : modération « low » si tu as choisi les filtres au plus bas, sinon celle par défaut.
function openaiModeration() { return settings.providerFilters === 'min' ? 'low' : undefined; }


// ════════════════════════════════════════════════════════════════════════════════════════════════
//  §9  CONSIGNES DES MODULES « S'AMÉLIORER » ET « CODE »
// ════════════════════════════════════════════════════════════════════════════════════════════════

const SELF_SYSTEM = `Tu es le module d'auto-amélioration de l'application « Mon IA ». L'utilisateur te dit comment l'IA doit s'améliorer et tu modifies toi-même ses réglages.
Voici les réglages modifiables (JSON) :
- assistantName : nom affiché.
- systemPrompt : sa personnalité et ses consignes de discussion (texte complet, en français, à la 2e personne : « Tu es… »).
- contentLevel : "aucun", "modere" ou "enfants".
- temperature : 0 à 2 (créativité). maxTokens : 100 à 8000 (longueur max). historyLength : 2 à 100 (messages dont elle se souvient).
- chatLessons : liste de choses à retenir sur l'utilisateur ou de règles.
- blockedWords : mots qu'elle refuse. allowedWords : exceptions aux mots interdits.
- skills : { photos: {on, words}, web: {on, words}, memory: {on, words} } — actions (chercher des photos, chercher des infos sur le web, retenir) et les mots qui les déclenchent en début de message.
- imageProvider : "maison" (son IA d'images entraînée de zéro) ou "hd" (moteur HD sur le téléphone).
- enhancePrompts : true/false.
- customCss : CSS ajouté à l'app pour changer l'apparence. Variables disponibles : --bg, --surface, --raised, --line, --text, --muted, --accent, --accent-strong, --accent-ink, --user, --radius. Pour changer les couleurs dans les deux thèmes, écris par exemple « :root, :root[data-theme] { --accent: #1f9d63 !important; } » et précise aussi une version dans « @media (prefers-color-scheme: dark) » si besoin.
Réponds UNIQUEMENT avec un objet JSON : {"reponse": "phrase courte en français qui explique ce que tu as changé", "modifs": { seulement les réglages à changer, avec leur NOUVELLE valeur complète (listes entières) }}.
Si la demande ne peut pas se faire avec ces réglages (nouveau code, nouvelle fonction, entraîner des images), dis-le dans "reponse", propose ce qui s'en approche, et laisse "modifs" vide.`;

// Un module écrit par l'IA ne peut pas toucher aux règles de ce fichier, au moteur HD ni au code d'accès.
const FORBIDDEN_CODE = /comportement\.js|contentCheck|CONTENT_CATEGORIES|CONTENT_PATTERNS|normalizeText|deepFreeze|geminiSafety|openaiModeration|MonIAHD|hd\.js|LOCK_HASH|mon-ia-unlocked/;

const CODE_SYSTEM = `Tu es le module de programmation de l'application web « Mon IA » (une seule page HTML, JavaScript sans framework, sur iPhone). Tu écris du code qui s'ajoute à l'app pour faire ce que l'utilisateur demande, comme un développeur.
Ton code est un « module » : du JavaScript exécuté dans la page avec new Function(code)() au démarrage de l'app (et tout de suite après sa création), plus du CSS optionnel.
Ce qui est disponible dans la page (variables globales) :
- $(sélecteur) = document.querySelector ; ICON(nom) renvoie un <svg> (spark, plus, gear, image, clip, send, x, list, grid, trash, edit).
- settings : réglages (assistantName, systemPrompt, imageProvider…) ; write('mon-ia-settings', settings) pour les enregistrer. read(clé, défaut) / write(clé, valeur) : stockage local JSON.
- messages : la discussion en cours, tableau de {role: 'user'|'assistant', content, image?, kind?} ; render(m) affiche un message dans #thread et le renvoie ; store() enregistre ; renderAll() réaffiche tout.
- send() envoie le texte de #input. Les fonctions globales (send, render, chat…) peuvent être enveloppées : const ancien = send; send = async function () { …; return ancien(); };
- llm(consignes, [{role, content}]) → Promise<string> : appelle le modèle de texte. chat(historique) → réponse avec la personnalité de l'IA.
- generateHomeImage(phrase, progression) → Promise<URL d'image> ; searchWebImages(q) → [{thumb, url, title}] ; webInfo(q) → [{title, url, text}].
- setImageMode(true/false), newChat(), openChat(id).
- Variables CSS : --bg, --surface, --raised, --line, --text, --muted, --accent, --accent-ink, --user, --radius, --ui (police).
Éléments de la page (id) :
{{MAP}}
Règles :
- Code autonome, robuste, qui ne casse rien d'autre ; vérifie que les éléments existent ; pas de bibliothèque externe (sauf import dynamique depuis https://cdn.jsdelivr.net si vraiment nécessaire).
- Ne touche jamais aux règles de comportement.js, au moteur HD (hd.js, MonIAHD) ni au code d'accès : ces parties ne se modifient pas.
- Textes visibles en français.
- renderAll() vide #thread puis réaffiche les messages : un élément permanent doit être placé hors de #thread (par exemple juste avant #thread, ou dans le <header>).
- Pour l'apparence, préfère le bloc CSS. Si tu changes le fond, adapte aussi les couleurs de texte (--text, --muted) pour que tout reste lisible.
- Le module peut être relancé : évite les doublons (vérifie si ton élément existe déjà par son id).
- Pour modifier un module existant, renvoie son code complet mis à jour.
Réponds EXACTEMENT dans ce format :
NOM: nom court du module
MODULE: id du module modifié, ou nouveau
EXPLICATION: une ou deux phrases pour l'utilisateur
\`\`\`js
le code
\`\`\`
\`\`\`css
le CSS (facultatif)
\`\`\``;


// ════════════════════════════════════════════════════════════════════════════════════════════════
//  §10 MESSAGES D'ERREUR   (chaque message dit d'où vient le blocage)
// ════════════════════════════════════════════════════════════════════════════════════════════════

const SURFACE_LABELS = { discussion: 'la discussion', rechercheInfos: 'la recherche d’infos', creationImage: 'la création d’images', recherchePhotos: 'la recherche de photos' };

const MESSAGES = deepFreeze({
  userBlocked: (word) => `Bloqué par tes réglages : le mot « ${word} » est dans tes mots interdits (Apprendre › Tchat ou Paramètres).`,
  contentRefused: (surface, label) => `Refusé par la règle fixe de l’app (comportement.js) : catégorie « ${label} », refusée pour ${SURFACE_LABELS[surface] || surface}. Tu peux poser la même question en texte dans la discussion.`,
  missingKey: 'Ajoute ta clé API dans Paramètres (ou choisis le fournisseur gratuit).',
  provider: (status, err) => `Fournisseur (${status}) : ${err}`,
  network: 'Impossible de joindre le fournisseur. Vérifie ta connexion et tes paramètres.',
  chatDisabled: 'La discussion est désactivée dans tes réglages.',
  imagesDisabled: 'La génération d’images est désactivée dans tes paramètres.',
  hdNoEdit: 'Le moteur HD ne sait pas encore modifier les photos. Pour l’instant, il crée des images à partir de ta phrase.',
  homeNoEdit: 'Ton IA maison ne sait pas encore modifier les photos : elle apprend d’abord à créer des images. On lui apprendra ça plus tard.',
  hdFailed: (err) => 'Moteur HD : ' + err + '. Repasse sur ton IA maison avec le bouton HD.',
  photosNone: (q) => `Je n’ai rien trouvé pour « ${q} » dans les banques d’images libres (Openverse, Wikimedia). Essaie le lien Google ci-dessous.`,
  photosFound: (q) => `Voici des photos trouvées pour « ${q} ».`,
  lessonSaved: (l) => `C’est noté : « ${l} ». Je m’en souviendrai dans toutes nos discussions. Tu peux le modifier dans Apprendre › Tchat.`,
});

// Transforme une erreur technique en message clair.
function errorMessage(err) {
  return err?.message === 'Failed to fetch' ? MESSAGES.network : (err?.message || String(err));
}


// ════════════════════════════════════════════════════════════════════════════════════════════════
//  §11 DIAGNOSTIC
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
//  Pour chaque étape utile, on garde : l'heure, l'étape, la couche qui a bloqué (s'il y en a une),
//  la catégorie, le statut HTTP, le motif d'arrêt du modèle, le nombre de résultats et un détail technique.
//  On ne garde JAMAIS le texte de tes messages ni les clés API. 80 entrées au plus, sur ce téléphone.
//  Visible dans Paramètres › Diagnostic.

const diag = Object.freeze({
  KEY: 'mon-ia-diagnostic',
  MAX: 80,
  // Masque tout ce qui ressemble à une clé ou un jeton.
  scrub(text) {
    return String(text ?? '').replace(/\b(sk-[\w-]{8,}|AIza[\w-]{20,}|KGAT_\w+|hf_\w{10,}|pk_\w{8,}|Bearer\s+\S+)/g, '••••').slice(0, 200);
  },
  log(entry) {
    const e = { t: Date.now() };
    for (const k of ['etape', 'couche', 'categorie', 'statut', 'arret', 'resultats']) if (entry[k] !== undefined && entry[k] !== null) e[k] = entry[k];
    if (entry.detail) e.detail = diag.scrub(entry.detail);
    try {
      const list = JSON.parse(localStorage.getItem(diag.KEY) || '[]');
      list.push(e);
      localStorage.setItem(diag.KEY, JSON.stringify(list.slice(-diag.MAX)));
    } catch { /* le diagnostic ne doit jamais casser l'app */ }
    return e;
  },
  list() { try { return JSON.parse(localStorage.getItem(diag.KEY) || '[]'); } catch { return []; } },
  clear() { try { localStorage.removeItem(diag.KEY); } catch { /* rien */ } },
});


/* global settings, read, write */

// ============================================================
// 1. INSTRUCTIONS SYSTÈME
// ============================================================

const DEFAULT_SYSTEM_PROMPT =
  'Tu es mon assistant personnel. Réponds en français, directement et clairement.';

const BASE_RULES = [
  'Réponds de manière factuelle aux questions scientifiques, médicales, anatomiques et éducatives.',
  'Le vocabulaire anatomique ou sexuel ne constitue pas, à lui seul, une raison de refuser une question.',
  'Distingue les demandes d’information, de recherche d’images et de création d’images.',
  'N’affirme pas avoir effectué une action si elle n’a pas réellement été effectuée.'
].join('\n');

const LEVEL_RULES = {
  aucun: '',
  modere: 'Reste respectueux et évite les descriptions inutilement choquantes.',
  enfants: 'Adapte les réponses à un jeune public.'
};

function systemPrompt() {
  const s = typeof settings === 'object' && settings ? settings : {};
  const lessons = Array.isArray(s.chatLessons) && s.chatLessons.length
    ? 'Consignes supplémentaires :\n' +
      s.chatLessons.map(x => '- ' + x).join('\n')
    : '';

  return [
    s.systemPrompt || DEFAULT_SYSTEM_PROMPT,
    BASE_RULES,
    LEVEL_RULES[s.contentLevel] || '',
    lessons
  ].filter(Boolean).join('\n\n');
}

function webInfoPrompt(found) {
  if (!Array.isArray(found) || !found.length) {
    return 'Aucun résultat web exploitable. Réponds avec tes connaissances et précise que les informations n’ont pas été vérifiées sur le web.';
  }

  return 'Informations récupérées sur le web :\n\n' +
    found.map(f =>
      `[${f.title || 'Source'}]\n${f.text || ''}\n${f.url || ''}`
    ).join('\n\n') +
    '\n\nRéponds en français et signale les incertitudes.';
}

const TASK_PROMPTS = {
  enhanceImage:
    'Rewrite the user request as a detailed English image-generation prompt. Preserve the requested subject, composition, setting, lighting and style. Do not add unrelated details. Reply with the prompt only.',
  enhanceEdit:
    'Rewrite the user request as a precise English image-editing instruction. Specify the requested changes and preserve all unrelated elements. Reply with the instruction only.',
  translateImage:
    'Translate the user text into English accurately. Preserve the meaning and details. Reply with the translation only.',
  translateSearch:
    'Translate this image-search query into English. Reply with the query only.'
};

// ============================================================
// 2. ACTIONS DU TCHAT
// ============================================================

const DEFAULT_SKILLS = {
  photos: {
    on: true,
    title: 'Chercher des photos sur le web',
    example: 'cherche des photos de la tour Eiffel',
    words: ['cherche', 'recherche', 'trouve', 'récupère', 'montre', 'envoie', 'donne']
  },
  web: {
    on: true,
    title: 'Chercher des informations sur le web',
    example: 'cherche sur internet la taille de la tour Eiffel',
    words: [
      'cherche sur google',
      'recherche sur google',
      'cherche sur internet',
      'recherche sur internet',
      'regarde sur internet',
      'cherche sur le web'
    ]
  },
  memory: {
    on: true,
    title: 'Retenir une information',
    example: 'retiens que je préfère les réponses courtes',
    words: ['retiens', 'souviens-toi', 'souviens toi', 'n’oublie pas', 'apprends que']
  }
};

function getSkill(name) {
  const configured = settings?.skills?.[name];
  const defaults = DEFAULT_SKILLS[name];
  if (!defaults) return null;
  return configured
    ? { ...defaults, ...configured, words: Array.isArray(configured.words) ? configured.words : defaults.words }
    : defaults;
}

function skillRest(name, text) {
  const skill = getSkill(name);
  if (!skill?.on) return null;

  const input = String(text || '');
  const lower = input.toLowerCase().replace(/’/g, "'");
  const words = [...skill.words].sort((a, b) => b.length - a.length);

  const word = words.find(w => {
    if (!w) return false;
    const candidate = w.toLowerCase().replace(/’/g, "'");
    return lower === candidate || lower.startsWith(candidate + ' ');
  });

  return word ? input.slice(word.length).trim() : null;
}

function searchQuery(text) {
  const input = String(text || '').trim();

  if (/^\/web\s+/i.test(input)) {
    return input.replace(/^\/web\s+/i, '').trim() || null;
  }

  const rest = skillRest('photos', input);
  if (rest === null) return null;

  const match = /^(?:moi\s+)?(?:sur\s+(?:google|internet|le\s+web)\s+)?(?:(?:des?|les|quelques|de vraies)\s+)?(?:images?|photos?)\s+(?:de\s+|d['’])?(.+)$/i.exec(rest);

  return match?.[1]?.trim() || null;
}

function webQuery(text) {
  const rest = skillRest('web', String(text || ''));
  return rest ? rest.replace(/^[-:,\s]*/, '').trim() || null : null;
}

function memoryLesson(text) {
  const rest = skillRest('memory', String(text || ''));
  if (!rest) return null;

  const lesson = rest
    .replace(/^[-:,\s]*(?:bien\s+)?(?:que\s+|qu['’]\s*)?/i, '')
    .trim();

  return lesson ? lesson[0].toUpperCase() + lesson.slice(1) : null;
}

// ============================================================
// 3. CATÉGORIES ET VÉRIFICATION DE CONTENU
// ============================================================

function deepFreeze(obj) {
  Object.values(obj).forEach(value => {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      deepFreeze(value);
    }
  });
  return Object.freeze(obj);
}

const CONTENT_CATEGORIES = deepFreeze({
  
function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const CONTENT_PATTERNS = Object.freeze(
  Object.fromEntries(
    Object.entries(CONTENT_CATEGORIES).map(([key, category]) => [
      key,
      new RegExp(
        '\\b(?:' +
        category.terms
          .map(normalizeText)
          .sort((a, b) => b.length - a.length)
          .map(escapeRegExp)
          .join('|') +
        ')(?:s|x)?\\b'
      )
    ])
  )
);

// Cette fonction identifie les catégories et ne bloque pas les discussions
// ou les recherches textuelles simplement parce qu'un terme sensible apparaît.
function contentCheck(surface, text) {
  const validSurfaces = [
    'discussion',
    'rechercheInfos',
    'creationImage',
    'recherchePhotos'
  ];

  if (!validSurfaces.includes(surface)) {
    return {
      allowed: false,
      layer: 'configuration',
      categories: [],
      message: 'Type de demande inconnu.'
    };
  }

  const clean = normalizeText(text);
  const categories = Object.entries(CONTENT_PATTERNS)
    .filter(([, pattern]) => pattern.test(clean))
    .map(([key]) => key);

  const needsReview = categories.filter(key =>
    CONTENT_CATEGORIES[key].rules[surface] === 'verification'
  );

  return {
    allowed: true,
    layer: null,
    categories,
    needsReview,
    message: needsReview.length
      ? 'Le fournisseur peut appliquer ses propres restrictions à cette demande.'
      : null
  };
}

// ============================================================
// 4. MOTS INTERDITS ET AUTORISÉS CONFIGURÉS PAR L'UTILISATEUR
// ============================================================

function findBlockedWord(text) {
  const normalizeWord = normalizeText;
  let input = normalizeWord(text);

  const allowedWords = Array.isArray(settings?.allowedWords)
    ? settings.allowedWords
    : [];

  const blockedWords = Array.isArray(settings?.blockedWords)
    ? settings.blockedWords
    : [];

  for (const word of allowedWords) {
    const normalized = normalizeWord(word);
    if (normalized) {
      input = input.replace(
        new RegExp('\\b' + escapeRegExp(normalized) + '\\b', 'g'),
        ' '
      );
    }
  }

  return blockedWords.find(word => {
    const normalized = normalizeWord(word);
    if (!normalized) return false;

    return new RegExp('\\b' + escapeRegExp(normalized) + '\\b')
      .test(input);
  });
}

// ============================================================
// 5. DÉTECTION DES REFUS DU MODÈLE
// ============================================================

const MODEL_REFUSAL_START =
  /^\s*(?:je ne peux pas|je ne suis pas en mesure|je regrette.{0,30}je ne peux|i cannot|i can't|i’m sorry.{0,40}i can't|i am unable to)/i;

function detectModelRefusal(text, stopReason) {
  if (stopReason === 'refusal') {
    return 'Refus signalé par le modèle';
  }

  if (stopReason === 'content_filter') {
    return 'Contenu filtré par le fournisseur';
  }

  if (MODEL_REFUSAL_START.test(text || '')) {
    return 'La réponse commence par une formule de refus';
  }

  return null;
}

// ============================================================
// 6. APPELS AUX MODÈLES DE TEXTE
// ============================================================

const TEXT_URLS = {
  free: 'https://text.pollinations.ai/openai',
  openai: 'https://api.openai.com/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  anthropic: 'https://api.anthropic.com/v1/messages'
};

const RATE_LIMIT = {
  retries: 2,
  maxWaitSeconds: 30,
  defaultWaitSeconds: 10
};

async function readError(res) {
  const body = await res.text();

  try {
    const json = JSON.parse(body);
    return json.error?.message || json.message || body.slice(0, 300);
  } catch {
    return body.slice(0, 300);
  }
}

async function chat(history, extra = '') {
  const s = settings || {};
  const list = Array.isArray(history) ? history : [];
  const length = Math.max(2, Number(s.historyLength) || 20);

  const messages = list.slice(-length).map(message => ({
    role: message.role,
    content: message.content
  }));

  return llm(
    [systemPrompt(), extra].filter(Boolean).join('\n\n'),
    messages
  );
}

async function llm(system, msgs, step = 'discussion') {
  const s = settings || {};
  const provider = s.textProvider || 'free';
  const apiKey = s.textApiKey || '';

  if (provider !== 'free' && provider !== 'custom' && !apiKey) {
    diag.log({
      etape: step,
      couche: 'configuration',
      statut: 'clé manquante',
      detail: provider
    });
    throw new Error(MESSAGES.missingKey);
  }

  if (provider === 'anthropic') {
    const response = await fetch(TEXT_URLS.anthropic, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: s.textModel,
        max_tokens: Number(s.maxTokens) || 2048,
        temperature: Number(s.temperature ?? 0.7),
        system,
        messages: msgs
      })
    });

    if (!response.ok) {
      const error = await readError(response);
      diag.log({
        etape: step,
        couche: 'fournisseur',
        statut: response.status,
        detail: 'Anthropic : ' + error
      });
      throw new Error(MESSAGES.provider(response.status, error));
    }

    const json = await response.json();
    const text = (json.content || [])
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('');

    const refusal = detectModelRefusal(text, json.stop_reason);

    diag.log({
      etape: step,
      couche: refusal ? 'modele' : null,
      statut: response.status,
      arret: json.stop_reason,
      detail: refusal || 'Anthropic'
    });

    return text;
  }

  const url = provider === 'custom'
    ? String(s.textBaseUrl || '').replace(/\/+$/, '') + '/chat/completions'
    : TEXT_URLS[provider];

  if (!url || url === 'undefined') {
    throw new Error('Fournisseur de texte non configuré.');
  }

  const headers = { 'content-type': 'application/json' };

  if (apiKey && provider !== 'free') {
    headers.authorization = 'Bearer ' + apiKey;
  }

  const body = JSON.stringify({
    model: s.textModel || 'openai',
    temperature: Number(s.temperature ?? 0.7),
    max_tokens: Number(s.maxTokens) || 2048,
    messages: [
      { role: 'system', content: system },
      ...msgs
    ]
  });

  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body
    });

    if (response.ok) {
      const json = await response.json();
      const choice = json.choices?.[0];
      const text = choice?.message?.content ?? '';
      const refusal = detectModelRefusal(text, choice?.finish_reason);

      diag.log({
        etape: step,
        couche: refusal ? 'modele' : null,
        statut: response.status,
        arret: choice?.finish_reason,
        detail: refusal || provider
      });

      return text;
    }

    const error = await readError(response);

    if (
      attempt < RATE_LIMIT.retries &&
      response.status === 429
    ) {
      const seconds = Math.min(
        RATE_LIMIT.maxWaitSeconds,
        Number((/retry after (\d+)/i.exec(error) || [])[1]) ||
          RATE_LIMIT.defaultWaitSeconds
      );

      await new Promise(resolve =>
        setTimeout(resolve, (seconds + 1) * 1000)
      );

      continue;
    }

    diag.log({
      etape: step,
      couche: 'fournisseur',
      statut: response.status,
      detail: provider + ' : ' + error
    });

    throw new Error(MESSAGES.provider(response.status, error));
  }
}

async function quickTask(instruction, text, options = {}) {
  const timeout = options.timeout || 8000;
  const maxLength = options.maxLength || 600;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(TEXT_URLS.free, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'openai',
        messages: [
          { role: 'system', content: instruction },
          { role: 'user', content: text }
        ]
      })
    });

    if (!response.ok) return text;

    const json = await response.json();
    const result = json.choices?.[0]?.message?.content?.trim();

    return result && result.length < maxLength ? result : text;
  } catch {
    return text;
  } finally {
    clearTimeout(timer);
  }
}

async function enhancePrompt(prompt, forEdit = false) {
  if (!settings?.enhancePrompts) return prompt;

  return quickTask(
    forEdit ? TASK_PROMPTS.enhanceEdit : TASK_PROMPTS.enhanceImage,
    prompt,
    { timeout: 20000, maxLength: 1500 }
  );
}

function translateForImage(text) {
  return quickTask(
    TASK_PROMPTS.translateImage,
    text,
    { timeout: 8000, maxLength: 600 }
  );
}

// ============================================================
// 7. RECHERCHE D'INFORMATIONS ET D'IMAGES
// ============================================================

const SEARCH = {
  timeoutMs: 12000,
  maxPhotos: 18,

  wikipedia: query =>
    'https://fr.wikipedia.org/w/api.php?action=query&generator=search' +
    '&gsrlimit=3&prop=extracts%7Cinfo&inprop=url&exintro=1&explaintext=1' +
    '&exchars=1500&format=json&origin=*' +
    '&gsrsearch=' + encodeURIComponent(query),

  commons: query =>
    'https://commons.wikimedia.org/w/api.php?action=query&generator=search' +
    '&gsrnamespace=6&gsrlimit=12&prop=imageinfo&iiprop=url' +
    '&iiurlwidth=480&format=json&origin=*' +
    '&gsrsearch=' + encodeURIComponent('filetype:bitmap ' + query),

  openverse: query =>
    'https://api.openverse.org/v1/images/?page_size=12&q=' +
    encodeURIComponent(query),

  google: query =>
    'https://www.google.com/search?q=' + encodeURIComponent(query),

  googleImages: query =>
    'https://www.google.com/search?tbm=isch&q=' +
    encodeURIComponent(query)
};

async function fetchJsonStatus(url, timeoutMs = SEARCH.timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) {
      return { data: null, status: response.status };
    }

    return {
      data: await response.json(),
      status: response.status
    };
  } catch (error) {
    return {
      data: null,
      status: error?.name === 'AbortError' ? 'delai' : 'reseau'
    };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url, timeoutMs) {
  return (await fetchJsonStatus(url, timeoutMs)).data;
}

async function toEnglishQuery(query) {
  return quickTask(
    TASK_PROMPTS.translateSearch,
    query,
    { timeout: 6000, maxLength: 200 }
  );
}

async function webInfo(query) {
  const result = await fetchJsonStatus(SEARCH.wikipedia(query));
  const pages = Object.values(result.data?.query?.pages || {})
    .sort((a, b) => (a.index || 0) - (b.index || 0));

  const found = pages
    .filter(page => page.extract)
    .map(page => ({
      title: page.title,
      url: page.fullurl,
      text: page.extract
    }));

  diag.log({
    etape: 'recherche d’informations',
    couche: result.status === 200 ? null : 'reseau',
    statut: result.status,
    resultats: found.length,
    detail: 'Wikipédia'
  });

  return found;
}

function commonsResults(json) {
  return Object.values(json?.query?.pages || {})
    .sort((a, b) => (a.index || 0) - (b.index || 0))
    .map(page => {
      const image = page.imageinfo?.[0];
      if (!image) return null;

      return {
        thumb: image.thumburl || image.url,
        url: image.url,
        title: page.title.replace(/^File:/i, '')
      };
    })
    .filter(Boolean);
}

async function searchWebImages(query) {
  const english = await toEnglishQuery(query);

  const sources = [
    {
      name: 'Openverse',
      url: SEARCH.openverse(english),
      parse: json => (json?.results || []).map(result => ({
        thumb: result.thumbnail || result.url,
        url: result.foreign_landing_url || result.url,
        title: result.title || 'Image Openverse'
      }))
    },
    {
      name: 'Wikimedia Commons',
      url: SEARCH.commons(english),
      parse: commonsResults
    }
  ];

  if (english.toLowerCase() !== query.toLowerCase()) {
    sources.push({
      name: 'Wikimedia Commons français',
      url: SEARCH.commons(query),
      parse: commonsResults
    });
  }

  const lists = await Promise.all(sources.map(async source => {
    const response = await fetchJsonStatus(source.url);
    const results = source.parse(response.data);

    diag.log({
      etape: 'recherche de photos',
      couche: response.status === 200 ? null : 'fournisseur',
      statut: response.status,
      resultats: results.length,
      detail: source.name
    });

    return results;
  }));

  const seen = new Set();
  const output = [];

  for (const list of lists) {
    for (const image of list) {
      if (!image?.thumb || !image?.url || seen.has(image.url)) continue;

      seen.add(image.url);
      output.push(image);

      if (output.length >= SEARCH.maxPhotos) return output;
    }
  }

  return output;
}

// ============================================================
// 8. OPTIONS DE SÉCURITÉ DES FOURNISSEURS
// ============================================================

// Ces paramètres ne peuvent pas supprimer les règles internes du fournisseur.
function geminiSafety() {
  return [
    {
      category: 'HARM_CATEGORY_HARASSMENT',
      threshold: 'BLOCK_NONE'
    },
    {
      category: 'HARM_CATEGORY_HATE_SPEECH',
      threshold: 'BLOCK_NONE'
    },
    {
      category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
      threshold: 'BLOCK_NONE'
    },
    {
      category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
      threshold: 'BLOCK_LOW_AND_ABOVE'
    }
  ];
}

function openaiModeration() {
  return settings?.providerFilters === 'min' ? 'low' : undefined;
}

// ============================================================
// 9. MODULES « S'AMÉLIORER » ET « CODE »
// ============================================================

const SELF_SYSTEM = `Tu es le module d'auto-amélioration de « Mon IA ».
Réponds uniquement avec un objet JSON de la forme :
{"reponse":"explication courte","modifs":{}}
Ne propose que des réglages existants et leurs nouvelles valeurs complètes.
Les réglages modifiables comprennent assistantName, systemPrompt, contentLevel,
temperature, maxTokens, historyLength, chatLessons, blockedWords, allowedWords,
skills, imageProvider, enhancePrompts et customCss.
Si une demande nécessite de modifier le code source ou une fonction non configurable,
explique cette limite dans reponse et laisse modifs vide.`;

const FORBIDDEN_CODE =
  /comportement\.js|CONTENT_CATEGORIES|CONTENT_PATTERNS|normalizeText|deepFreeze|geminiSafety|openaiModeration|hd\.js|LOCK_HASH|mon-ia-unlocked/i;

const CODE_SYSTEM = `Tu es le module de programmation de l'application web « Mon IA ».
Écris du JavaScript autonome et robuste, sans bibliothèque externe inutile.
Vérifie que les éléments existent avant de les modifier.
Les textes visibles doivent être en français.
Ne casse pas les fonctions existantes et évite les doublons lorsqu'un module est relancé.
Ne modifie pas les mécanismes d'authentification ou les règles de sécurité.
Réponds exactement sous ce format :
NOM: nom court
MODULE: identifiant du module
EXPLICATION: une ou deux phrases
\`\`\`js
code JavaScript
\`\`\`
\`\`\`css
CSS facultatif
\`\`\``;

// ============================================================
// 10. MESSAGES D'ERREUR
// ============================================================

const SURFACE_LABELS = {
  discussion: 'la discussion',
  rechercheInfos: 'la recherche d’informations',
  creationImage: 'la création d’images',
  recherchePhotos: 'la recherche de photos'
};

const MESSAGES = deepFreeze({
  userBlocked: word =>
    `Bloqué par tes réglages : « ${word} » figure dans tes mots interdits.`,

  contentRefused: (surface, label) =>
    `La demande concernant « ${label} » nécessite une vérification du fournisseur pour ${SURFACE_LABELS[surface] || surface}.`,

  missingKey:
    'Ajoute ta clé API dans les paramètres ou choisis un fournisseur gratuit.',

  provider: (status, error) =>
    `Erreur du fournisseur (${status}) : ${error}`,

  network:
    'Impossible de joindre le fournisseur. Vérifie ta connexion et réessaie.',

  chatDisabled:
    'La discussion est désactivée dans tes paramètres.',

  imagesDisabled:
    'La génération d’images est désactivée dans tes paramètres.',

  hdNoEdit:
    'Le moteur HD ne prend pas en charge la modification de photos.',

  homeNoEdit:
    'Le moteur maison ne prend pas encore en charge la modification de photos.',

  hdFailed: error =>
    'Erreur du moteur HD : ' + error,

  photosNone: query =>
    `Aucune image trouvée pour « ${query} ». Tu peux aussi consulter les résultats Google.`,

  photosFound: query =>
    `Résultats de recherche pour « ${query} ».`,

  lessonSaved: lesson =>
    `Information enregistrée : « ${lesson} ».`
});

function errorMessage(error) {
  if (error?.name === 'AbortError') {
    return 'La requête a expiré. Réessaie.';
  }

  if (error?.message === 'Failed to fetch') {
    return MESSAGES.network;
  }

  return error?.message || String(error);
}

// ============================================================
// 11. DIAGNOSTIC
// ============================================================

const diag = Object.freeze({
  KEY: 'mon-ia-diagnostic',
  MAX: 80,

  scrub(value) {
    return String(value ?? '')
      .replace(/\b(sk-[\w-]{8,}|AIza[\w-]{20,}|hf_[\w-]{10,}|Bearer\s+\S+)/g, '••••')
      .slice(0, 200);
  },

  log(entry) {
    const item = { t: Date.now() };

    for (const key of [
      'etape',
      'couche',
      'categorie',
      'statut',
      'arret',
      'resultats'
    ]) {
      if (entry[key] !== undefined && entry[key] !== null) {
        item[key] = entry[key];
      }
    }

    if (entry.detail) item.detail = diag.scrub(entry.detail);

    try {
      const list = JSON.parse(localStorage.getItem(diag.KEY) || '[]');
      list.push(item);
      localStorage.setItem(
        diag.KEY,
        JSON.stringify(list.slice(-diag.MAX))
      );
    } catch {
      // Le diagnostic ne doit pas casser l’application.
    }

    return item;
  },

  list() {
    try {
      return JSON.parse(localStorage.getItem(diag.KEY) || '[]');
    } catch {
      return [];
    }
  },

  clear() {
    try {
      localStorage.removeItem(diag.KEY);
    } catch {
      // Le diagnostic est facultatif.
    }
  }
});

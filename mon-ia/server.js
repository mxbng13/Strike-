// Mon IA — serveur personnel (Node 18+, aucune dépendance).
// Garde les clés API côté serveur, applique tes paramètres, et relaie vers le fournisseur choisi.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(ROOT, 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const PORT = Number(process.env.PORT) || 3333;
const HOST = process.env.HOST || '127.0.0.1';
const SECRET_FIELDS = ['textApiKey', 'imageApiKey', 'password'];

const DEFAULTS = {
  assistantName: 'Mon IA',
  systemPrompt: "Tu es mon assistant personnel. Réponds en français, directement et sans détour.",
  // Texte
  textProvider: 'openai',            // 'openai' (OpenAI, OpenRouter, Ollama, LM Studio…) ou 'anthropic'
  textBaseUrl: 'https://api.openai.com/v1',
  textApiKey: '',
  textModel: 'gpt-4o-mini',
  temperature: 0.8,
  maxTokens: 2048,
  historyLength: 30,                 // nombre de messages envoyés au modèle
  // Images
  imageProvider: 'openai',           // 'openai' (API images compatible) ou 'automatic1111' (Stable Diffusion local)
  imageBaseUrl: 'https://api.openai.com/v1',
  imageApiKey: '',
  imageModel: 'gpt-image-1',
  imageSize: '1024x1024',
  imageSteps: 30,
  negativePrompt: '',
  // Restrictions que TU choisis
  blockedWords: [],                  // mots refusés dans tes messages et prompts d'image
  imagesEnabled: true,
  password: '',                      // vide = pas de mot de passe
};

function loadSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings(s) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2), { mode: 0o600 });
}

const mask = (v) => (v ? '••••' + v.slice(-4) : '');

function publicSettings(s) {
  const out = { ...s };
  for (const k of SECRET_FIELDS) out[k] = mask(s[k]);
  return out;
}

function checkPassword(req, s) {
  if (!s.password) return true;
  const given = crypto.createHash('sha256').update(String(req.headers['x-password'] || '')).digest();
  const expected = crypto.createHash('sha256').update(s.password).digest();
  return crypto.timingSafeEqual(given, expected);
}

function findBlockedWord(text, s) {
  const lower = text.toLowerCase();
  return s.blockedWords.find((w) => w && lower.includes(w.toLowerCase()));
}

const trimSlash = (u) => u.replace(/\/+$/, '');

async function upstream(url, init) {
  const res = await fetch(url, init);
  const body = await res.text();
  let json;
  try { json = JSON.parse(body); } catch { json = null; }
  if (!res.ok) {
    const msg = json?.error?.message || json?.error || json?.detail || body.slice(0, 300);
    throw new Error(`Fournisseur (${res.status}) : ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
  }
  return json;
}

async function chat(messages, s) {
  const history = messages.slice(-s.historyLength).map((m) => ({ role: m.role, content: String(m.content) }));
  if (s.textProvider === 'anthropic') {
    const json = await upstream(`${trimSlash(s.textBaseUrl || 'https://api.anthropic.com')}/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': s.textApiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: s.textModel,
        max_tokens: s.maxTokens,
        temperature: s.temperature,
        system: s.systemPrompt,
        messages: history,
      }),
    });
    return json.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  }
  const headers = { 'content-type': 'application/json' };
  if (s.textApiKey) headers.authorization = `Bearer ${s.textApiKey}`;
  const json = await upstream(`${trimSlash(s.textBaseUrl)}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: s.textModel,
      temperature: s.temperature,
      max_tokens: s.maxTokens,
      messages: [{ role: 'system', content: s.systemPrompt }, ...history],
    }),
  });
  return json.choices[0].message.content;
}

async function generateImage(prompt, s) {
  if (s.imageProvider === 'automatic1111') {
    const [width, height] = s.imageSize.split('x').map(Number);
    const json = await upstream(`${trimSlash(s.imageBaseUrl)}/sdapi/v1/txt2img`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt, negative_prompt: s.negativePrompt, steps: s.imageSteps, width, height }),
    });
    return `data:image/png;base64,${json.images[0]}`;
  }
  const headers = { 'content-type': 'application/json' };
  if (s.imageApiKey) headers.authorization = `Bearer ${s.imageApiKey}`;
  const body = { model: s.imageModel, prompt, size: s.imageSize, n: 1 };
  if (s.imageModel.startsWith('dall-e')) body.response_format = 'b64_json';
  const json = await upstream(`${trimSlash(s.imageBaseUrl)}/images/generations`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const img = json.data[0];
  return img.b64_json ? `data:image/png;base64,${img.b64_json}` : img.url;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 5e6) reject(new Error('Requête trop grosse'));
    });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('JSON invalide')); }
    });
  });
}

function send(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  const s = loadSettings();
  try {
    if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(fs.readFileSync(path.join(ROOT, 'public', 'index.html')));
    }
    if (!req.url.startsWith('/api/')) return send(res, 404, { error: 'Introuvable' });
    if (!checkPassword(req, s)) return send(res, 401, { error: 'Mot de passe requis' });

    if (req.url === '/api/settings' && req.method === 'GET') return send(res, 200, publicSettings(s));

    if (req.url === '/api/settings' && req.method === 'POST') {
      const incoming = await readJson(req);
      const next = { ...s };
      for (const key of Object.keys(DEFAULTS)) {
        if (!(key in incoming)) continue;
        // Un champ secret encore masqué = on garde l'ancienne valeur.
        if (SECRET_FIELDS.includes(key) && String(incoming[key]).startsWith('••••')) continue;
        next[key] = incoming[key];
      }
      for (const k of ['temperature', 'maxTokens', 'historyLength', 'imageSteps']) next[k] = Number(next[k]);
      if (!Array.isArray(next.blockedWords)) next.blockedWords = [];
      saveSettings(next);
      return send(res, 200, publicSettings(next));
    }

    if (req.url === '/api/chat' && req.method === 'POST') {
      const { messages = [] } = await readJson(req);
      const last = messages[messages.length - 1]?.content || '';
      const blocked = findBlockedWord(last, s);
      if (blocked) return send(res, 400, { error: `Bloqué par tes paramètres (mot : « ${blocked} »)` });
      return send(res, 200, { reply: await chat(messages, s) });
    }

    if (req.url === '/api/image' && req.method === 'POST') {
      if (!s.imagesEnabled) return send(res, 403, { error: 'Génération d’images désactivée dans tes paramètres' });
      const { prompt = '' } = await readJson(req);
      const blocked = findBlockedWord(prompt, s);
      if (blocked) return send(res, 400, { error: `Bloqué par tes paramètres (mot : « ${blocked} »)` });
      return send(res, 200, { image: await generateImage(prompt, s) });
    }

    send(res, 404, { error: 'Introuvable' });
  } catch (err) {
    send(res, 500, { error: err.message });
  }
});

server.listen(PORT, HOST, () => console.log(`Mon IA → http://${HOST}:${PORT}`));

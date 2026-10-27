// Moteur « HD sur l'appareil » : SDXS-512 DreamShaper (modèle open source, licence CreativeML Open RAIL++-M),
// qui tourne dans le navigateur avec la carte graphique du téléphone (WebGPU). Image 512×512 en une étape, ~880 Mo.
// Pensé pour la mémoire limitée de Safari sur iPhone :
//  - un seul moteur de calcul (pas de bibliothèque en plus, découpeur de texte maison) ;
//  - le modèle est écrit directement dans le cache en streaming, sans copie en mémoire ;
//  - les trois parties sont chargées l'une après l'autre puis libérées.
// Chaque étape est notée : si Safari ferme la page, la tentative suivante dit où ça s'est arrêté.
/* global ort, ClipTokenizer, contentCheck, translateForImage, diag */
(function (root) {
  const REPO = root.MON_IA_HD_REPO || 'https://huggingface.co/skillsafeai/sdxs-512-dreamshaper-onnx-webgpu/resolve/main/';
  const FILES = { text: 'text_encoder.onnx', unet: 'unet.onnx', vae: 'vae_decoder.onnx' };
  const SIZES = { text: 246, unet: 632, vae: 3 }; // Mo
  const CACHE = 'mon-ia-hd-v2';
  const SIGMA = 14.614646911621094; // bruit de départ (pas 999)
  const STEP_KEY = 'mon-ia-hd-etape';
  const ORT = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/';

  // Règles et traduction : comportement.js (§3 contentCheck, §6 translateForImage), chargé avant ce fichier.
  function guard(text) {
    const verdict = contentCheck('creationImage', text);
    if (!verdict.allowed) { diag.log({ etape: 'moteur HD', couche: verdict.layer, categorie: verdict.category }); throw new Error(verdict.message); }
  }

  function note(step) { try { localStorage.setItem(STEP_KEY, step); } catch { /* facultatif */ } }
  function lastCrash() { try { return localStorage.getItem(STEP_KEY); } catch { return null; } }
  function clearNote() { try { localStorage.removeItem(STEP_KEY); } catch { /* facultatif */ } }

  function loadScript(src) {
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('chargement impossible : vérifie ta connexion')); document.head.append(s); });
  }

  const PART = 32 * 1024 * 1024; // morceaux de 32 Mo : chaque écriture dans le cache reste petite
  const partKey = (url, i) => url + '?morceau=' + i;
  const infoKey = (url) => url + '?morceaux';

  function quotaError(err) {
    if (err?.name === 'QuotaExceededError' || /quota/i.test(err?.message || '')) {
      return new Error('pas assez de place de stockage autorisée pour le modèle (880 Mo). Libère de l’espace sur ton iPhone et utilise l’app depuis l’écran d’accueil');
    }
    return err;
  }

  // Télécharge un fichier du modèle par morceaux dans le cache. Si l'app se ferme, on reprend au morceau suivant.
  async function ensureCached(name, onProgress) {
    const url = REPO + FILES[name];
    const cache = await caches.open(CACHE);
    if (await cache.match(url) || await cache.match(infoKey(url))) { onProgress(1); return; }
    let total = 0;
    for (let i = 0; ; i++) {
      const start = i * PART;
      if (total && start >= total) break;
      if (!await cache.match(partKey(url, i))) {
        const res = await fetch(url, { headers: { range: `bytes=${start}-${start + PART - 1}` } });
        if (!res.ok) throw new Error(`téléchargement impossible (${res.status})`);
        const blob = await res.blob();
        if (res.status === 206) total = Number((res.headers.get('content-range') || '').split('/')[1]) || total;
        else if (i === 0) { // le serveur ignore les morceaux : on garde le fichier entier
          try { await cache.put(url, new Response(blob)); } catch (err) { throw quotaError(err); }
          onProgress(1); return;
        }
        try { await cache.put(partKey(url, i), new Response(blob)); } catch (err) { throw quotaError(err); }
      } else if (!total) {
        const head = await fetch(url, { headers: { range: 'bytes=0-0' } });
        total = Number((head.headers.get('content-range') || '').split('/')[1]) || SIZES[name] * 1e6;
      }
      onProgress(Math.min((start + PART) / (total || SIZES[name] * 1e6), 1));
    }
    await cache.put(infoKey(url), new Response(JSON.stringify({ total, parts: Math.ceil(total / PART) })));
  }

  // Recolle les morceaux dans un seul bloc mémoire (un morceau à la fois, sans copie en plus).
  async function readModel(name) {
    const url = REPO + FILES[name];
    const cache = await caches.open(CACHE);
    const whole = await cache.match(url);
    if (whole) return new Uint8Array(await whole.arrayBuffer());
    const info = await cache.match(infoKey(url));
    if (!info) throw new Error('modèle absent du cache : relance pour le retélécharger');
    const { total, parts } = await info.json();
    const bytes = new Uint8Array(total);
    for (let i = 0; i < parts; i++) {
      const part = await cache.match(partKey(url, i));
      if (!part) { await cache.delete(infoKey(url)); throw new Error('un morceau du modèle manque : relance pour le retélécharger'); }
      bytes.set(new Uint8Array(await part.arrayBuffer()), i * PART);
    }
    return bytes;
  }

  async function openSession(name) {
    let bytes = await readModel(name);
    const session = await ort.InferenceSession.create(bytes, {
      // NCHW : évite que le moteur fasse une seconde copie retournée des poids.
      executionProviders: [{ name: 'webgpu', preferredLayout: 'NCHW' }],
      graphOptimizationLevel: 'basic',
      enableMemPattern: false,
      enableCpuMemArena: false,
      extra: { session: { disable_prepacking: '1', use_device_allocator_for_initializers: '1' } },
    });
    bytes = null;
    return session;
  }

  let prepared = null;
  function prepare(onStatus = () => {}) {
    prepared ??= (async () => {
      const adapter = navigator.gpu && await navigator.gpu.requestAdapter().catch(() => null);
      if (!adapter) throw new Error('ce téléphone ou ce navigateur ne propose pas WebGPU (sur iPhone : iOS 26 et Safari)');
      if (!adapter.features.has('shader-f16') && !root.MON_IA_HD_SKIP_F16) throw new Error('la carte graphique de cet appareil ne gère pas le calcul en demi-précision demandé par le modèle HD');
      try { await caches.delete('mon-ia-hd-v1'); } catch { /* ancien modèle */ }
      try { await navigator.storage?.persist?.(); } catch { /* demande facultative de stockage durable */ }
      if (!root.ort?.env?.webgpu) await loadScript(ORT + 'ort.webgpu.min.js');
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.wasmPaths = ORT;
      if (!root.ClipTokenizer) await loadScript('clip-tokenizer.js');
      const encode = await ClipTokenizer.load(REPO + 'tokenizer/vocab.json', REPO + 'tokenizer/merges.txt');
      const totalMb = SIZES.text + SIZES.unet + SIZES.vae;
      let doneMb = 0;
      for (const name of ['text', 'unet', 'vae']) {
        note('téléchargement du modèle (' + name + ')');
        await ensureCached(name, (f) => onStatus(`Téléchargement du modèle HD… ${Math.round(((doneMb + f * SIZES[name]) / totalMb) * 100)} % (une seule fois, ~880 Mo)`));
        doneMb += SIZES[name];
      }
      return { encode };
    })().catch((err) => { prepared = null; throw err; });
    return prepared;
  }

  function randn(n) {
    const out = new Float32Array(n);
    for (let i = 0; i < n; i += 2) {
      const u = 1 - Math.random(), v = Math.random(), r = Math.sqrt(-2 * Math.log(u));
      out[i] = r * Math.cos(2 * Math.PI * v); if (i + 1 < n) out[i + 1] = r * Math.sin(2 * Math.PI * v);
    }
    return out;
  }

  async function generate(prompt, { onStatus: show = () => {} } = {}) {
    // Si la tentative d'avant a fait fermer l'app, on l'affiche pendant tout l'essai pour que tu puisses me le dire.
    const crashed = lastCrash();
    const onStatus = crashed ? (msg) => show(`${msg} (essai précédent arrêté pendant : ${crashed})`) : show;
    guard(prompt);
    const { encode } = await prepare(onStatus);
    note('traduction de la phrase');
    const english = await translateForImage(prompt);
    guard(english);
    const ids = BigInt64Array.from(encode(english + ', high quality, detailed'), (v) => BigInt(v));

    note('ouverture du modèle (texte)'); onStatus('Préparation du moteur HD (1/3)…');
    let s = await openSession('text');
    note('lecture de la phrase'); onStatus('Lecture de ta phrase…');
    const { last_hidden_state } = await s.run({ input_ids: new ort.Tensor('int64', ids, [1, 77]) });
    const hidden = new Float32Array(await last_hidden_state.getData());
    await s.release(); s = null;

    const n = 4 * 64 * 64;
    const latent = randn(n).map((v) => v * SIGMA);
    const scaled = latent.map((v) => v / Math.sqrt(SIGMA * SIGMA + 1));
    note('ouverture du modèle (image, 632 Mo)'); onStatus('Préparation du moteur HD (2/3)…');
    s = await openSession('unet');
    note('création de l’image (partie principale)'); onStatus('Création de l’image HD…');
    const { out_sample } = await s.run({
      sample: new ort.Tensor('float32', scaled, [1, 4, 64, 64]),
      timestep: new ort.Tensor('float32', Float32Array.from([999]), [1]),
      encoder_hidden_states: new ort.Tensor('float32', hidden, [1, 77, 768]),
    });
    const eps = await out_sample.getData();
    await s.release(); s = null;
    const x0 = new Float32Array(n);
    for (let i = 0; i < n; i++) x0[i] = latent[i] - SIGMA * eps[i];

    note('finition de l’image'); onStatus('Finition de l’image (3/3)…');
    s = await openSession('vae');
    const { image } = await s.run({ latent: new ort.Tensor('float32', x0, [1, 4, 64, 64]) });
    const px = await image.getData();
    await s.release(); s = null;

    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(512, 512);
    const plane = 512 * 512;
    for (let p = 0; p < plane; p++) {
      for (let c = 0; c < 3; c++) img.data[p * 4 + c] = Math.max(0, Math.min(255, Math.round((px[c * plane + p] + 1) * 127.5)));
      img.data[p * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    clearNote();
    return { url: canvas.toDataURL('image/jpeg', 0.92), english };
  }

  // Une erreur affichée n'est pas un plantage : on efface alors le journal.
  async function generateSafe(prompt, opts) {
    try { return await generate(prompt, opts); } catch (err) { clearNote(); throw err; }
  }

  root.MonIAHD = { generate: generateSafe, prepare, lastCrash };
})(window);

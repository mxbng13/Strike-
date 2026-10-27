// Moteur « HD sur l'appareil » : Stable Diffusion Turbo (modèle open source, licence non commerciale de Stability AI)
// qui tourne dans le navigateur avec la carte graphique du téléphone (WebGPU). Image 512×512 en une étape.
// Tout reste sur l'appareil : le modèle est téléchargé une fois puis gardé en cache.
/* global ort */
(function (root) {
  const REPO = root.MON_IA_HD_REPO || 'https://huggingface.co/schmuell/sd-turbo-ort-web/resolve/main/';
  const FILES = { text: 'text_encoder/model.onnx', unet: 'unet/model.onnx', vae: 'vae_decoder/model.onnx' };
  const SIZES = { text: 681, unet: 1733, vae: 99 }; // Mo, pour la barre de progression
  const CACHE = 'mon-ia-hd-v1';
  const SIGMA = 14.6146; // bruit de départ de SD-Turbo (pas 999)
  const VAE_SCALE = 0.18215;

  // Mots refusés avant même de créer l'image (contenu sexuel), en français et en anglais.
  const BLOCKED = /\b(nu|nue|nus|nues|nudit[eé]|seins?|t[eé]tons?|mamelons?|p[eé]nis|vagin|vulve|clitoris|sexe|sexuel(le)?s?|porno?|pornographi\w*|[eé]rotique|xxx|nsfw|naked|nude|nudity|topless|boobs?|breasts?|nipples?|genitals?|penis|vagina|sex|sexual|porn\w*|erotic|lingerie|strip\w*)\b/i;

  async function cachedModel(name, onProgress) {
    const url = REPO + FILES[name];
    let cache = null;
    try { cache = await caches.open(CACHE); } catch { /* cache indisponible : on télécharge à chaque fois */ }
    const hit = cache && await cache.match(url);
    if (hit) { onProgress(1); return new Uint8Array(await hit.arrayBuffer()); }
    const res = await fetch(url);
    if (!res.ok) throw new Error(`téléchargement impossible (${res.status})`);
    const total = Number(res.headers.get('content-length')) || SIZES[name] * 1e6;
    const reader = res.body.getReader();
    const buf = new Uint8Array(total);
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf.set(value, got); got += value.length;
      onProgress(Math.min(got / total, 1));
    }
    const data = got === total ? buf : buf.slice(0, got);
    if (cache) { try { await cache.put(url, new Response(data)); } catch { /* plus de place : pas grave */ } }
    return data;
  }

  let ready = null;
  function load(onStatus = () => {}) {
    ready ??= (async () => {
      const adapter = navigator.gpu && await navigator.gpu.requestAdapter().catch(() => null);
      if (!adapter) throw new Error('ce téléphone ou ce navigateur ne propose pas WebGPU (sur iPhone : iOS 26 et Safari)');
      // Le modèle calcule en demi-précision : sans cette fonction, inutile de télécharger 2,5 Go.
      if (!adapter.features.has('shader-f16')) throw new Error('la carte graphique de cet appareil ne gère pas le calcul en demi-précision demandé par le modèle HD');
      const base = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/';
      if (!root.ort?.env?.webgpu) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = base + 'ort.webgpu.min.js'; s.onload = res; s.onerror = () => rej(new Error('chargement du moteur impossible')); document.head.append(s); });
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.wasmPaths = base;
      const T = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2');
      onStatus('Préparation du vocabulaire…');
      const tokenizer = await T.AutoTokenizer.from_pretrained('Xenova/clip-vit-base-patch16');
      onStatus('Préparation de la traduction…');
      const translate = await T.pipeline('translation', 'Xenova/opus-mt-fr-en', { dtype: 'q8' }).catch(() => null);
      const nsfw = await T.pipeline('image-classification', 'AdamCodd/vit-base-nsfw-detector', { dtype: 'q8' }).catch(() => null);
      const sessions = {};
      const totalMb = SIZES.text + SIZES.unet + SIZES.vae;
      let doneMb = 0;
      for (const name of ['text', 'unet', 'vae']) {
        const bytes = await cachedModel(name, (f) => onStatus(`Téléchargement du modèle HD… ${Math.round(((doneMb + f * SIZES[name]) / totalMb) * 100)} % (une seule fois, ~2,5 Go)`));
        doneMb += SIZES[name];
        onStatus('Mise en route du modèle HD…');
        sessions[name] = await ort.InferenceSession.create(bytes, {
          executionProviders: ['webgpu'],
          // Évite de garder plusieurs copies du modèle en mémoire (indispensable pour 1,7 Go).
          enableMemPattern: false,
          enableCpuMemArena: false,
          extra: { session: { disable_prepacking: '1', use_device_allocator_for_initializers: '1', use_ort_model_bytes_directly: '1', use_ort_model_bytes_for_initializers: '1' } },
          freeDimensionOverrides: name === 'text'
            ? { batch_size: 1, sequence_length: 77 }
            : name === 'unet'
              ? { batch_size: 1, num_channels: 4, height: 64, width: 64, sequence_length: 77, steps: 1 }
              : { batch_size: 1, num_channels_latent: 4, height_latent: 64, width_latent: 64 },
        });
      }
      return { tokenizer, translate, nsfw, sessions };
    })().catch((err) => { ready = null; throw err; });
    return ready;
  }

  function randn(n) {
    const out = new Float32Array(n);
    for (let i = 0; i < n; i += 2) {
      const u = 1 - Math.random(), v = Math.random(), r = Math.sqrt(-2 * Math.log(u));
      out[i] = r * Math.cos(2 * Math.PI * v); if (i + 1 < n) out[i + 1] = r * Math.sin(2 * Math.PI * v);
    }
    return out;
  }

  // prompt en français ou en anglais -> image 512×512 (data URL JPEG)
  async function generate(prompt, { onStatus = () => {} } = {}) {
    if (BLOCKED.test(prompt)) throw new Error('ce moteur ne crée pas de contenu sexuel ou de nudité');
    const { tokenizer, translate, nsfw, sessions } = await load(onStatus);
    let english = prompt;
    if (translate && /[a-zà-ÿ]/i.test(prompt)) {
      try { english = (await translate(prompt))[0].translation_text; } catch { /* on garde le texte d'origine */ }
    }
    if (BLOCKED.test(english)) throw new Error('ce moteur ne crée pas de contenu sexuel ou de nudité');
    onStatus('Création de l’image HD…');
    const ids = (await tokenizer(english + ', high quality, detailed', { padding: 'max_length', max_length: 77, truncation: true })).input_ids;
    const idArr = Int32Array.from(Array.from(ids.data, Number));
    const { last_hidden_state } = await sessions.text.run({ input_ids: new ort.Tensor('int32', idArr, [1, 77]) });
    const n = 4 * 64 * 64;
    const latent = randn(n).map((v) => v * SIGMA);
    const scaled = latent.map((v) => v / Math.sqrt(SIGMA * SIGMA + 1));
    const { out_sample } = await sessions.unet.run({
      sample: new ort.Tensor('float32', scaled, [1, 4, 64, 64]),
      timestep: new ort.Tensor('int64', BigInt64Array.from([999n]), [1]),
      encoder_hidden_states: last_hidden_state,
    });
    const eps = await out_sample.getData();
    const x0 = new Float32Array(n);
    for (let i = 0; i < n; i++) x0[i] = (latent[i] - SIGMA * eps[i]) / VAE_SCALE;
    onStatus('Finition de l’image…');
    const { sample } = await sessions.vae.run({ latent_sample: new ort.Tensor('float32', x0, [1, 4, 64, 64]) });
    const px = await sample.getData();
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(512, 512);
    const plane = 512 * 512;
    for (let p = 0; p < plane; p++) {
      for (let c = 0; c < 3; c++) img.data[p * 4 + c] = Math.max(0, Math.min(255, Math.round((px[c * plane + p] + 1) * 127.5)));
      img.data[p * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const url = canvas.toDataURL('image/jpeg', 0.92);
    // Vérification de l'image elle-même (contenu sexuel).
    if (nsfw) {
      const scores = await nsfw(url).catch(() => null);
      const bad = scores?.find((s) => s.label === 'nsfw');
      if (bad && bad.score > 0.6) throw new Error('image bloquée : contenu sexuel détecté');
    }
    return { url, english };
  }

  root.MonIAHD = { load, generate };
})(window);

// Apprentissage sur l'appareil : ton IA maison apprend un nouveau sujet à partir de tes photos, sans serveur.
// Le petit modèle 110 sujets est réécrit avec TensorFlow.js (qui sait calculer les gradients sur la carte graphique
// du téléphone). Pour chaque nouveau sujet, une copie du modèle est affinée sur tes photos puis gardée sur l'appareil.
/* global tf */
(function (root) {
  const T = 1000;
  const NULL_ID = 110;
  const ALPHAS = (() => {
    const f = (i) => Math.cos(((i / T) + 0.008) / 1.008 * Math.PI / 2) ** 2;
    const out = new Float32Array(T);
    let prod = 1;
    for (let i = 0; i < T; i++) { prod *= 1 - Math.min(1 - f(i + 1) / f(i), 0.999); out[i] = prod; }
    return out;
  })();

  async function loadBase(jsonUrl, binUrl, fetchFn = fetch) {
    const [meta, buf] = await Promise.all([
      fetchFn(jsonUrl).then((r) => r.json()),
      fetchFn(binUrl).then((r) => r.arrayBuffer()),
    ]);
    const all = new Float32Array(buf);
    const P = {};
    for (const { name, shape, offset } of meta.tensors) {
      const size = shape.reduce((a, b) => a * b, 1);
      P[name] = tf.tensor(all.subarray(offset, offset + size), shape, 'float32');
    }
    return P;
  }

  // ——— Le réseau (même calcul que la version PyTorch, en NHWC) ———
  const silu = (x) => tf.mul(x, tf.sigmoid(x));
  function groupNorm(x, gamma, beta, groups = 8) {
    const [b, h, w, c] = x.shape;
    const g = tf.reshape(x, [b, h, w, groups, c / groups]);
    const { mean, variance } = tf.moments(g, [1, 2, 4], true);
    const n = tf.div(tf.sub(g, mean), tf.sqrt(tf.add(variance, 1e-5)));
    return tf.add(tf.mul(tf.reshape(n, [b, h, w, c]), gamma), beta);
  }
  function conv(x, w, bias, stride = 1) {
    const k = w.shape[0];
    const xp = k === 3 ? tf.pad(x, [[0, 0], [1, 1], [1, 1], [0, 0]]) : x;
    return tf.add(tf.conv2d(xp, w, stride, 'valid'), bias);
  }
  const linear = (x, w, b) => tf.add(tf.matMul(x, w), b);

  function resBlock(P, p, x, emb) {
    let h = conv(silu(groupNorm(x, P[p + '.norm1.weight'], P[p + '.norm1.bias'])), P[p + '.conv1.weight'], P[p + '.conv1.bias']);
    const e = linear(silu(emb), P[p + '.emb.weight'], P[p + '.emb.bias']);
    const c = h.shape[3];
    const scale = tf.reshape(tf.slice(e, [0, 0], [-1, c]), [-1, 1, 1, c]);
    const shift = tf.reshape(tf.slice(e, [0, c], [-1, c]), [-1, 1, 1, c]);
    h = tf.add(tf.mul(groupNorm(h, P[p + '.norm2.weight'], P[p + '.norm2.bias']), tf.add(scale, 1)), shift);
    h = conv(silu(h), P[p + '.conv2.weight'], P[p + '.conv2.bias']);
    const skip = P[p + '.skip.weight'] ? conv(x, P[p + '.skip.weight'], P[p + '.skip.bias']) : x;
    return tf.add(h, skip);
  }

  function attention(P, p, x, heads = 4) {
    const [b, h, w, c] = x.shape;
    const d = c / heads;
    const qkv = conv(groupNorm(x, P[p + '.norm.weight'], P[p + '.norm.bias']), P[p + '.qkv.weight'], P[p + '.qkv.bias']);
    // canaux rangés comme (q/k/v, tête, d) ; on passe en [b, tête, position, d]
    const r = tf.transpose(tf.reshape(qkv, [b, h * w, 3, heads, d]), [2, 0, 3, 1, 4]);
    const [q, k, v] = tf.unstack(r);
    const attn = tf.softmax(tf.div(tf.matMul(q, k, false, true), Math.sqrt(d)));
    const y = tf.reshape(tf.transpose(tf.matMul(attn, v), [0, 2, 1, 3]), [b, h, w, c]);
    return tf.add(x, conv(y, P[p + '.out.weight'], P[p + '.out.bias']));
  }

  function timeEmbedding(t, dim) {
    const half = dim / 2;
    const freqs = tf.exp(tf.mul(tf.range(0, half, 1, 'float32'), -Math.log(10000) / half));
    const args = tf.mul(tf.reshape(t, [-1, 1]), tf.reshape(freqs, [1, half]));
    return tf.concat([tf.cos(args), tf.sin(args)], 1);
  }

  // x : [b, 32, 32, 3] ; t : [b] (float) ; subject : [b, 128] (vecteur du sujet)
  function forward(P, x, t, subject) {
    const base = P['inp.weight'].shape[3];
    const emb = tf.add(linear(silu(linear(timeEmbedding(t, base), P['time.0.weight'], P['time.0.bias'])), P['time.2.weight'], P['time.2.bias']), subject);
    let h = conv(x, P['inp.weight'], P['inp.bias']);
    const hs = [h];
    for (let i = 0; P[`down.${i}.weight`] || P[`down.${i}.norm1.weight`]; i++) {
      h = P[`down.${i}.norm1.weight`] ? resBlock(P, `down.${i}`, h, emb) : conv(h, P[`down.${i}.weight`], P[`down.${i}.bias`], 2);
      hs.push(h);
    }
    h = resBlock(P, 'mid2', attention(P, 'mid_attn', resBlock(P, 'mid1', h, emb)), emb);
    for (let i = 0; i < 64; i++) {
      if (P[`up.${i}.norm1.weight`]) h = resBlock(P, `up.${i}`, tf.concat([h, hs.pop()], 3), emb);
      else if (hs.length) h = tf.image.resizeNearestNeighbor(h, [h.shape[1] * 2, h.shape[2] * 2]);
      else break;
    }
    return conv(silu(groupNorm(h, P['out.0.weight'], P['out.0.bias'])), P['out.2.weight'], P['out.2.bias']);
  }

  const labelRow = (P, id) => tf.slice(P['label.weight'], [id, 0], [1, -1]);

  // ——— Apprentissage d'un nouveau sujet ———
  // photos : liste d'ImageData/HTMLCanvasElement 32×32 ; onProgress(fraction, perte)
  async function learnSubject(base, photos, { steps = 600, batch = 8, lr = 1e-4, onProgress = () => {}, signal } = {}) {
    // photos : ImageData 32×32 (RVBA) -> [n, 32, 32, 3] dans [-1, 1]
    const data = tf.tidy(() => tf.stack(photos.map((p) => {
      const rgba = tf.tensor(Float32Array.from(p.data), [p.height, p.width, 4]);
      return tf.sub(tf.div(tf.slice(rgba, [0, 0, 0], [-1, -1, 3]), 127.5), 1);
    })));
    const P = {};
    for (const [k, v] of Object.entries(base)) P[k] = tf.variable(v.clone(), true, k.replace(/\./g, '_'));
    // Le sujet part de la moyenne des sujets connus, puis s'ajuste.
    const subject = tf.variable(tf.tidy(() => tf.mean(tf.slice(base['label.weight'], [0, 0], [NULL_ID, -1]), 0, true)), true, 'sujet');
    const nullVec = labelRow(base, NULL_ID);
    const opt = tf.train.adam(lr);
    let last = 0;
    for (let s = 0; s < steps; s++) {
      if (signal?.aborted) break;
      const loss = opt.minimize(() => {
        const idx = tf.randomUniform([batch], 0, photos.length, 'int32');
        let x0 = tf.gather(data, idx);
        if (Math.random() < 0.5) x0 = tf.reverse(x0, 2);
        const tInt = Array.from({ length: batch }, () => Math.floor(Math.random() * T));
        const a = tf.tensor(tInt.map((t) => ALPHAS[t]), [batch, 1, 1, 1]);
        const noise = tf.randomNormal(x0.shape);
        const xt = tf.add(tf.mul(tf.sqrt(a), x0), tf.mul(tf.sqrt(tf.sub(1, a)), noise));
        // 10 % des pas sans sujet, comme à l'entraînement de base (pour le guidage).
        const cond = Math.random() < 0.1 ? tf.tile(nullVec, [batch, 1]) : tf.tile(subject, [batch, 1]);
        const pred = forward(P, xt, tf.tensor(tInt, [batch], 'float32'), cond);
        return tf.losses.meanSquaredError(noise, pred);
      }, true);
      last = (await loss.data())[0];
      loss.dispose();
      if (!Number.isFinite(last)) {
        data.dispose(); opt.dispose();
        Object.values(P).forEach((v) => v.dispose()); subject.dispose();
        throw new Error('les calculs se sont déréglés sur ce téléphone (rien n’a été enregistré)');
      }
      if (s % 5 === 0) { onProgress((s + 1) / steps, last); await tf.nextFrame(); }
    }
    data.dispose(); opt.dispose();
    const out = { params: P, subject };
    onProgress(1, last);
    return out;
  }

  // ——— Création d'images avec un sujet appris ———
  async function sample(params, subject, { count = 4, steps = 25, guidance = 3, onProgress = () => {} } = {}) {
    const nullVec = labelRow(params, NULL_ID);
    let x = tf.randomNormal([count, 32, 32, 3]);
    const ts = Array.from({ length: steps }, (_, i) => Math.round((T - 1) * (1 - i / (steps - 1))));
    for (let i = 0; i < steps; i++) {
      const t = ts[i];
      const a = ALPHAS[t], aPrev = i + 1 < steps ? ALPHAS[ts[i + 1]] : 1;
      const next = tf.tidy(() => {
        const xx = tf.concat([x, x], 0);
        const cond = tf.concat([tf.tile(subject, [count, 1]), tf.tile(nullVec, [count, 1])], 0);
        const eps2 = forward(params, xx, tf.fill([count * 2], t), cond);
        const [ec, eu] = tf.split(eps2, 2, 0);
        const eps = tf.add(eu, tf.mul(tf.sub(ec, eu), guidance));
        const x0 = tf.clipByValue(tf.div(tf.sub(x, tf.mul(eps, Math.sqrt(1 - a))), Math.sqrt(a)), -1, 1);
        return tf.add(tf.mul(x0, Math.sqrt(aPrev)), tf.mul(eps, Math.sqrt(1 - aPrev)));
      });
      x.dispose(); x = next;
      onProgress((i + 1) / steps);
      await tf.nextFrame();
    }
    const broken = (await tf.any(tf.isNaN(x)).data())[0];
    if (broken) { x.dispose(); nullVec.dispose(); throw new Error('ce sujet est abîmé : supprime-le dans Apprendre puis réapprends-le'); }
    const pixels = tf.tidy(() => tf.clipByValue(tf.mul(tf.add(x, 1), 127.5), 0, 255).toInt());
    const arr = await pixels.array();
    x.dispose(); pixels.dispose(); nullVec.dispose();
    return arr; // [count][32][32][3]
  }

  // ——— Sauvegarde sur l'appareil (IndexedDB) ———
  function db() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('mon-ia-sujets', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('sujets', { keyPath: 'name' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function saveSubject(name, learned, extra = {}) {
    const weights = {};
    for (const [k, v] of Object.entries(learned.params)) weights[k] = { shape: v.shape, data: await v.data() };
    const record = { name, subject: await learned.subject.data(), weights, ...extra, date: new Date().toISOString() };
    const d = await db();
    await new Promise((res, rej) => { const tx = d.transaction('sujets', 'readwrite'); tx.objectStore('sujets').put(record); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  }
  async function listSubjects() {
    const d = await db();
    return new Promise((res, rej) => {
      const req = d.transaction('sujets').objectStore('sujets').getAll();
      req.onsuccess = () => res(req.result.map((r) => ({ name: r.name, photos: r.photos, date: r.date, preview: r.preview })));
      req.onerror = () => rej(req.error);
    });
  }
  async function loadSubject(name) {
    const d = await db();
    const r = await new Promise((res, rej) => { const req = d.transaction('sujets').objectStore('sujets').get(name); req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
    if (!r) return null;
    const params = {};
    for (const [k, v] of Object.entries(r.weights)) params[k] = tf.tensor(v.data, v.shape);
    return { params, subject: tf.tensor(r.subject, [1, r.subject.length]) };
  }
  async function deleteSubject(name) {
    const d = await db();
    await new Promise((res, rej) => { const tx = d.transaction('sujets', 'readwrite'); tx.objectStore('sujets').delete(name); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  }

  root.MonIAApprendre = { loadBase, forward, learnSubject, sample, saveSubject, listSubjects, loadSubject, deleteSubject, labelRow, NULL_ID };
})(typeof window !== 'undefined' ? window : globalThis);

// Découpeur de texte CLIP (BPE), écrit à la main pour ne pas charger de grosse bibliothèque sur le téléphone.
// Donne les mêmes jetons que le tokenizer CLIP officiel : début 49406, fin et remplissage 49407, 77 jetons.
(function (root) {
  const BOS = 49406, EOS = 49407, LEN = 77;

  function bytesToUnicode() {
    const bs = [];
    for (let i = 33; i <= 126; i++) bs.push(i);
    for (let i = 161; i <= 172; i++) bs.push(i);
    for (let i = 174; i <= 255; i++) bs.push(i);
    const cs = bs.slice();
    let n = 0;
    for (let b = 0; b < 256; b++) if (!bs.includes(b)) { bs.push(b); cs.push(256 + n); n++; }
    const map = {};
    bs.forEach((b, i) => { map[b] = String.fromCharCode(cs[i]); });
    return map;
  }

  async function load(vocabUrl, mergesUrl) {
    const [vocab, mergesText] = await Promise.all([
      fetch(vocabUrl).then((r) => r.json()),
      fetch(mergesUrl).then((r) => r.text()),
    ]);
    const ranks = new Map();
    mergesText.split('\n').slice(1).filter((l) => l.trim()).forEach((l, i) => ranks.set(l, i));
    const byteMap = bytesToUnicode();
    const cache = new Map();
    const pattern = /<\|startoftext\|>|<\|endoftext\|>|'s|'t|'re|'ve|'m|'ll|'d|[\p{L}]+|[\p{N}]|[^\s\p{L}\p{N}]+/gu;

    function bpe(token) {
      if (cache.has(token)) return cache.get(token);
      let word = [...token.slice(0, -1), token.slice(-1) + '</w>'];
      if (word.length === 1) { cache.set(token, word); return word; }
      for (;;) {
        let best = null, bestRank = Infinity;
        for (let i = 0; i < word.length - 1; i++) {
          const r = ranks.get(word[i] + ' ' + word[i + 1]);
          if (r !== undefined && r < bestRank) { bestRank = r; best = i; }
        }
        if (best === null) break;
        const [a, b] = [word[best], word[best + 1]];
        const merged = [];
        for (let i = 0; i < word.length; i++) {
          if (i < word.length - 1 && word[i] === a && word[i + 1] === b) { merged.push(a + b); i++; }
          else merged.push(word[i]);
        }
        word = merged;
        if (word.length === 1) break;
      }
      cache.set(token, word);
      return word;
    }

    return function encode(text) {
      const clean = text.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
      const ids = [BOS];
      for (const m of clean.matchAll(pattern)) {
        const bytes = new TextEncoder().encode(m[0]);
        const token = Array.from(bytes, (b) => byteMap[b]).join('');
        for (const piece of bpe(token)) {
          const id = vocab[piece];
          if (id !== undefined) ids.push(id);
        }
        if (ids.length >= LEN - 1) break;
      }
      ids.length = Math.min(ids.length, LEN - 1);
      ids.push(EOS);
      while (ids.length < LEN) ids.push(EOS);
      return ids;
    };
  }

  root.ClipTokenizer = { load };
})(typeof window !== 'undefined' ? window : globalThis);

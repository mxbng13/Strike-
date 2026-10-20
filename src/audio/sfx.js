// Effets sonores synthétisés (Web Audio, aucun fichier) : tirs, impacts, ulti, victoire, etc.
// Le contexte audio démarre au premier toucher / clic (règle des navigateurs mobiles).
import { save } from '../save/storage.js';

let ctx = null, master = null, noiseBuf = null;
function audio() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.5;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp).connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}
export function unlockAudio() { const c = audio(); if (c?.state === 'suspended') c.resume(); }
addEventListener('pointerdown', unlockAudio, { passive: true });

export const soundOn = () => save.get().sound !== false;
export function setSound(on) { save.update({ sound: on }); }

function env(g, t, a, d, peak = 1) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}
function noise(t, dur, { freq = 1200, q = 0.8, type = 'bandpass', gain = 0.6, attack = 0.003, sweep = null } = {}) {
  const src = ctx.createBufferSource(); src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
  const g = ctx.createGain(); env(g, t, attack, dur, gain);
  src.connect(f).connect(g).connect(master);
  src.start(t); src.stop(t + attack + dur + 0.02);
}
function tone(t, dur, { f0 = 440, f1 = null, type = 'sine', gain = 0.3, attack = 0.005 } = {}) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t);
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain(); env(g, t, attack, dur, gain);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + attack + dur + 0.02);
}

// limite le nombre de sons identiques rapprochés (tirs en rafale)
const lastAt = {};
const SOUNDS = {
  shot_lumiere: (t) => { tone(t, 0.09, { f0: 1500, f1: 600, type: 'triangle', gain: 0.14 }); noise(t, 0.05, { freq: 3000, q: 0.8, gain: 0.25 }); },
  shot_brasier: (t) => { noise(t, 0.18, { freq: 700, q: 0.4, gain: 0.55, sweep: 250 }); },
  shot_rafale: (t) => { tone(t, 0.06, { f0: 420, f1: 160, type: 'square', gain: 0.1 }); noise(t, 0.06, { freq: 2200, q: 1, gain: 0.3 }); },
  shot_rocher: (t) => { tone(t, 0.25, { f0: 110, f1: 40, type: 'sawtooth', gain: 0.22 }); noise(t, 0.2, { freq: 400, q: 0.5, gain: 0.6, sweep: 150 }); },
  shot_ombre: (t) => { noise(t, 0.3, { freq: 2600, q: 0.6, gain: 0.7, sweep: 500 }); tone(t, 0.25, { f0: 900, f1: 120, type: 'sawtooth', gain: 0.12 }); },
  shot_neant: (t) => { noise(t, 0.2, { freq: 1100, q: 0.6, gain: 0.6, sweep: 350 }); tone(t, 0.16, { f0: 600, f1: 90, type: 'sine', gain: 0.16 }); },
  enemy_shot: (t) => { noise(t, 0.08, { freq: 1300, q: 0.8, gain: 0.25 }); },
  hit: (t) => { tone(t, 0.06, { f0: 1400, f1: 900, type: 'triangle', gain: 0.18 }); noise(t, 0.05, { freq: 3500, q: 1.5, gain: 0.2 }); },
  hurt: (t) => { tone(t, 0.14, { f0: 240, f1: 90, type: 'square', gain: 0.16 }); noise(t, 0.08, { freq: 600, gain: 0.3 }); },
  wall: (t) => { noise(t, 0.05, { freq: 2200, q: 2, gain: 0.12 }); },
  reload: (t) => { tone(t, 0.04, { f0: 700, type: 'square', gain: 0.08 }); tone(t + 0.12, 0.05, { f0: 1100, type: 'square', gain: 0.08 }); },
  empty: (t) => { tone(t, 0.03, { f0: 1600, type: 'square', gain: 0.05 }); },
  ulti_ready: (t) => { [660, 880, 1320].forEach((f, i) => tone(t + i * 0.07, 0.12, { f0: f, type: 'triangle', gain: 0.14 })); },
  leap: (t) => { noise(t, 0.45, { freq: 400, q: 0.6, gain: 0.35, sweep: 2400, attack: 0.08 }); tone(t, 0.4, { f0: 200, f1: 600, type: 'triangle', gain: 0.1, attack: 0.05 }); },
  land: (t) => { tone(t, 0.45, { f0: 110, f1: 32, type: 'sine', gain: 0.6 }); noise(t, 0.35, { freq: 500, q: 0.4, gain: 0.7, sweep: 120 }); },
  bush: (t) => { noise(t, 0.2, { freq: 3000, q: 0.5, gain: 0.12, sweep: 1500, attack: 0.03 }); },
  count: (t) => { tone(t, 0.12, { f0: 660, type: 'triangle', gain: 0.18 }); },
  go: (t) => { tone(t, 0.3, { f0: 990, type: 'triangle', gain: 0.22 }); tone(t, 0.3, { f0: 1320, type: 'sine', gain: 0.1 }); },
  ko: (t) => { tone(t, 0.6, { f0: 300, f1: 60, type: 'sawtooth', gain: 0.18 }); noise(t, 0.5, { freq: 300, gain: 0.4, sweep: 80 }); },
  victory: (t) => { [523, 659, 784, 1047].forEach((f, i) => tone(t + i * 0.11, i === 3 ? 0.5 : 0.14, { f0: f, type: 'triangle', gain: 0.2 })); },
  defeat: (t) => { [392, 330, 262].forEach((f, i) => tone(t + i * 0.16, 0.3, { f0: f, type: 'triangle', gain: 0.18 })); },
  claim: (t) => { tone(t, 0.08, { f0: 880, type: 'triangle', gain: 0.15 }); tone(t + 0.07, 0.16, { f0: 1320, type: 'triangle', gain: 0.15 }); },
};

/** Joue un son (si le son est activé). `minGap` : intervalle minimal entre deux sons identiques (s). */
export function sfx(name, minGap = 0.03) {
  if (!soundOn() || !SOUNDS[name]) return;
  const c = audio();
  if (!c || c.state !== 'running') return;
  const t = c.currentTime;
  if (t - (lastAt[name] ?? -1) < minGap) return;
  lastAt[name] = t;
  SOUNDS[name](t + 0.005);
}

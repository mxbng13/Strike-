"""Musique de fond originale (synthèse numpy, donc libre de droits) + effets sonores.

Usage : python3 musique.py DUREE_S [DOSSIER] [--direct] [--variante2]  ->  DOSSIER/musique.wav, DOSSIER/sfx.wav
Les instants des effets (whoosh, pop, impact) sont lus dans build/timeline.json
(écrit par rendu.py) pour rester synchronisés avec l'image.
"""
import json, os, sys
import numpy as np
import wave

SR = 44100
DIRECT = False
VARIANTE = 1
BPM = 96
HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(HERE, "build")
rng = np.random.default_rng(7)


def ecrire(path, x):
    x = np.clip(x, -1, 1)
    st = (x * 32767).astype(np.int16)
    if st.ndim == 1:
        st = np.stack([st, st], 1)
    with wave.open(path, "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(st.tobytes())


def passe_bas(x, fc):
    a = np.exp(-2 * np.pi * fc / SR)
    y = np.empty_like(x); acc = 0.0
    for i in range(len(x)):  # 1 pôle, suffisant pour adoucir
        acc = (1 - a) * x[i] + a * acc
        y[i] = acc
    return y


def note(f, dur, kind="pad"):
    t = np.arange(int(dur * SR)) / SR
    if kind == "pad":
        x = sum(np.sin(2 * np.pi * f * d * t + p) for d, p in ((1, 0), (1.004, 1), (0.996, 2), (2.001, .5)))
        x += 0.3 * np.sin(2 * np.pi * f * 3 * t)
        env = np.minimum(1, t / 0.6) * np.minimum(1, (dur - t) / 0.8)
        return 0.06 * x * np.clip(env, 0, 1)
    if kind == "keys":
        x = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * 2 * f * t) + 0.08 * np.sin(2 * np.pi * 3 * f * t)
        return 0.11 * x * np.exp(-t * 3.2) * np.minimum(1, t / 0.005)
    if kind == "bass":
        x = np.sin(2 * np.pi * f * t) + 0.2 * np.sin(2 * np.pi * 2 * f * t)
        return 0.22 * x * np.minimum(1, t / 0.01) * np.exp(-t * 1.2)


def kick():
    t = np.arange(int(0.35 * SR)) / SR
    f = 48 + 90 * np.exp(-t * 30)
    return 0.55 * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9)


def hat():
    n = int(0.05 * SR)
    x = rng.standard_normal(n); x = x - passe_bas(x, 6000)
    return 0.05 * x * np.exp(-np.arange(n) / SR * 70)


def clap():
    n = int(0.2 * SR)
    x = rng.standard_normal(n); x = x - passe_bas(x, 1200)
    return 0.12 * x * np.exp(-np.arange(n) / SR * 22)


def ajouter(buf, x, t):
    i = int(t * SR)
    if i >= len(buf):
        return
    j = min(len(buf), i + len(x))
    buf[i:j] += x[: j - i]


def mtof(m):
    return 440 * 2 ** ((m - 69) / 12)


def musique(duree):
    buf = np.zeros(int((duree + 2) * SR))
    if VARIANTE == 2:
        # variante 2 : plus rapide et plus pop, Am – F – C – G avec arpège pincé
        beat = 60 / 112
        accords = [[57, 60, 64, 69], [53, 57, 60, 65], [48, 52, 55, 60], [55, 59, 62, 67]]
        basses = [45, 41, 48, 43]
    else:
        beat = 60 / BPM
        # Progression Fmaj7 – Am7 – Dm9 – Bbmaj7, chaude et « clean beauty »
        accords = [[53, 57, 60, 64], [57, 60, 64, 67], [50, 57, 60, 64], [46, 53, 57, 62]]
        basses = [41, 45, 38, 46]
    bar = 4 * beat
    nbar = int(duree / bar) + 2
    pk, ph, pc = kick(), hat(), clap()
    for b in range(nbar):
        t0 = b * bar
        ch = accords[b % 4]
        for m in ch:
            ajouter(buf, note(mtof(m), bar + 0.4, "pad"), t0)
        if VARIANTE == 2:  # arpège en croches, une octave au-dessus
            for k in range(8):
                ajouter(buf, 0.8 * note(mtof(ch[(0, 1, 2, 3, 2, 1, 2, 3)[k]] + 12), 0.45, "keys"), t0 + k * beat / 2)
        else:
            for k, off in enumerate((0, 1.5, 2.5)):
                ajouter(buf, note(mtof(ch[(k + b) % 4] + 12), 1.2, "keys"), t0 + off * beat)
        ajouter(buf, note(mtof(basses[b % 4] - 12), bar, "bass"), t0)
        intro = b == 0 and not DIRECT  # première mesure sans batterie : l'accroche respire
        for q in range(4):
            if not intro:
                ajouter(buf, pk, t0 + q * beat)
            ajouter(buf, ph, t0 + (q + .5) * beat)
            if q in (1, 3) and not intro:
                ajouter(buf, pc, t0 + q * beat)
    buf = buf[: int(duree * SR)]
    # fondu de fin
    n = int(2.5 * SR); buf[-n:] *= np.linspace(1, 0, n) ** 2
    buf /= np.max(np.abs(buf)) + 1e-9
    return 0.8 * buf


def whoosh(d=0.6):
    n = int(d * SR); t = np.arange(n) / SR
    x = rng.standard_normal(n)
    lo = passe_bas(x, 900); hi = x - passe_bas(x, 3000)
    env = np.sin(np.pi * t / d) ** 2
    return 0.25 * (lo * 0.7 + hi * 0.3) * env


def pop():
    t = np.arange(int(0.09 * SR)) / SR
    f = 900 + 600 * np.exp(-t * 60)
    return 0.18 * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 40)


def impact():
    t = np.arange(int(2.5 * SR)) / SR
    sub = np.sin(2 * np.pi * np.cumsum(40 + 60 * np.exp(-t * 8)) / SR) * np.exp(-t * 2.2)
    shim = sum(np.sin(2 * np.pi * f * t) for f in (1318.5, 1760, 2637)) * np.exp(-t * 1.6) * 0.15
    return 0.5 * sub + 0.2 * shim


def riser(d=1.6):
    n = int(d * SR); t = np.arange(n) / SR
    x = rng.standard_normal(n); x = x - passe_bas(x, 2000)
    tone = np.sin(2 * np.pi * np.cumsum(300 + 900 * (t / d) ** 2) / SR)
    return 0.12 * (x * 0.5 + tone * 0.4) * (t / d) ** 2


def sfx(duree, tl):
    buf = np.zeros(int((duree + 3) * SR))
    for t in tl.get("whoosh", []):
        ajouter(buf, whoosh(), max(0, t - 0.3))
    for t in tl.get("pop", []):
        ajouter(buf, pop(), t)
    for t in tl.get("riser", []):
        ajouter(buf, riser(), max(0, t - 1.6))
    for t in tl.get("impact", []):
        ajouter(buf, impact(), t)
    return buf[: int(duree * SR)]


if __name__ == "__main__":
    duree = float(sys.argv[1])
    if len(sys.argv) > 2:
        BUILD = sys.argv[2]
    DIRECT = "--direct" in sys.argv  # batterie dès la première seconde (accroche plus nerveuse)
    VARIANTE = 2 if "--variante2" in sys.argv else 1
    os.makedirs(BUILD, exist_ok=True)
    tl = {}
    p = os.path.join(BUILD, "timeline.json")
    if os.path.exists(p):
        tl = json.load(open(p)).get("sfx", {})
    ecrire(os.path.join(BUILD, "musique.wav"), musique(duree))
    ecrire(os.path.join(BUILD, "sfx.wav"), sfx(duree, tl))
    print("ok")

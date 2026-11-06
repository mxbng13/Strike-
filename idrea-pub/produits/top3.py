"""Pub « top 3 » : plusieurs produits IDREA dans une seule vidéo courte, en liste numérotée.

  0 s    les 3 produits alignés + la promesse (« 3 accessoires à moins de 13 € ») + logo IDREA
  1/2/3  un produit par réplique : grand numéro, nom, prix réel, un atout, fond de sa couleur
  fin    logo IDREA, les 3 produits, idrea.fr, « Lien en bio »

Prérequis : python3 ../voix_off.py top3/court.json top3/build_court
Usage     : python3 top3.py [--apercu T ...]  -> top3/build_court/idrea_top3.mp4
"""
import json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw

ICI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ICI)
sys.path.insert(0, os.path.dirname(ICI))
import rendu as M  # noqa: E402
import pub as P  # noqa: E402
from rendu import (W, H, FPS, CREME, NOIR, OR, OR_VIF, BLANC, BLACK, BOLD, SERIF,  # noqa: E402
                   font, cl, prog, e_out, e_io, e_back, fondu, coller, poser, degrade_v, halo,
                   texte, avec_ombre, puce)

DOSSIER = os.path.join(ICI, "top3")
BUILD = os.path.join(DOSSIER, "build_court")
SITE = "idrea.fr"


class Ressources:
    pass


R = Ressources()
C = {}


def fond_couleur(col):
    clair = tuple(min(255, int(v * 1.45 + 40)) for v in col)
    f = degrade_v(W, H, [(0, clair), (0.55, tuple(min(255, int(v * 1.15 + 20)) for v in col)), (1, tuple(int(v * 0.7) for v in col))])
    f.alpha_composite(halo(W, H, W / 2, 1050, 560, 560, (255, 255, 255), 120))
    return f


def construire():
    R.prods = []
    for p in C["produits"]:
        vues = P.photo_produit(os.path.join(DOSSIER, p["image"]), cote=860)
        nom = avec_ombre(texte(p["nom"], font(BLACK, 92), BLANC + (255,), 5, (12, 12, 12)), 12, 8, 0.55)
        if nom.width > 1000:
            nom = nom.resize((1000, int(nom.height * 1000 / nom.width)), Image.LANCZOS)
        num = Image.new("RGBA", (230, 230), (0, 0, 0, 0))
        d = ImageDraw.Draw(num)
        d.ellipse((5, 5, 225, 225), fill=OR_VIF + (255,), outline=BLANC + (255,), width=8)
        t = texte(str(len(R.prods) + 1), font(BLACK, 150), NOIR + (255,))
        num.alpha_composite(t, ((230 - t.width) // 2, (230 - t.height) // 2 - 6))
        prix = Image.new("RGBA", (300, 110), (0, 0, 0, 0))
        ImageDraw.Draw(prix).rounded_rectangle((0, 0, 299, 109), radius=55, fill=BLANC + (245,))
        tp = texte(p["prix"], font(BLACK, 66), NOIR + (255,))
        prix.alpha_composite(tp, ((300 - tp.width) // 2, (110 - tp.height) // 2))
        R.prods.append({"vues": vues, "nom": nom, "num": avec_ombre(num, 12, 8, 0.4), "prix": avec_ombre(prix, 10, 6, 0.3),
                        "puce": puce(p["puce"], "check", 46), "fond": fond_couleur(tuple(p["couleur"]))})
    R.fond0 = fond_couleur((70, 130, 120))
    R.hook = []
    for i, s in enumerate(C["accroche"]):
        taille = 132
        while font(BLACK, taille).getlength(s) > 900:
            taille -= 4
        R.hook.append(avec_ombre(texte(s, font(BLACK, taille), (BLANC if i == 0 else OR_VIF) + (255,), 6, (10, 10, 10)), 14, 10, 0.6))
    R.marque = avec_ombre(texte("IDREA", font(SERIF, 64, 600), BLANC + (255,), 0, track=10), 8, 3, 0.55)
    R.lettres = [texte(c, font(SERIF, 190, 500), CREME + (255,)) for c in "IDREA"]
    R.site = M._bouton(SITE.upper())
    R.lien = texte("Lien en bio", font(BOLD, 44), OR_VIF + (255,))
    rng = np.random.default_rng(9)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    R.vignette = (1 - 0.28 * (((xx - W / 2) / (W * 0.75)) ** 2 + ((yy - H / 2) / (H * 0.7)) ** 2)).clip(0.6, 1)[..., None].astype(np.float32)
    R.grain = [rng.integers(-6, 7, (H, W, 1), dtype=np.int16) for _ in range(6)]


def vue(p, lt):
    return p["vues"][int(lt * 12) % len(p["vues"])]


def trio(plate, lt, y, s, entree=True):
    """Les 3 produits côte à côte, avec un léger rebond décalé."""
    for k, p in enumerate(R.prods):
        # visibles dès l'image 0 : léger « punch » d'échelle, jamais de fondu
        pk = 1.15 - 0.15 * e_out(prog(lt, 0.05 * k, 0.05 * k + 0.3)) if entree else 1
        poser(plate, vue(p, lt + k), W / 2 + (k - 1) * 330, y + 12 * math.sin(lt * 2.4 + k), s * pk)


def scene_accroche(T, t):
    lt = t - T["starts"][0]
    plate = R.fond0.copy()
    punch = 1.12 - 0.12 * e_out(prog(lt, 0, 0.22))
    trio(plate, lt, 1080, 0.42)
    for i, im in enumerate(R.hook):
        poser(plate, im, W / 2, 400 + i * 155, punch * (1 + (0.04 * math.sin(lt * 6) if i == 1 else 0)))
    return plate


def scene_produit(k):
    def scene(T, t):
        s0 = T["starts"][k + 1]
        lt = t - s0
        p = R.prods[k]
        plate = p["fond"].copy()
        z = 1.25 - 0.25 * e_out(prog(lt, 0, 0.6))  # gros plan qui recule
        poser(plate, vue(p, lt), W / 2, 1080 + 10 * math.sin(lt * 2.2), 0.9 * z)
        pn = prog(lt, 0, 0.3)
        poser(plate, p["num"], W / 2, 330, 0.75 * (0.6 + 0.4 * e_back(pn, 2.2)), -10 * (1 - pn), cl(pn * 3))
        poser(plate, p["nom"], W / 2, 520, 0.9 + 0.1 * e_back(prog(lt, 0.08, 0.4)), 0, cl(prog(lt, 0.08, 0.3) * 3))
        pp = prog(lt, 0.4, 0.75)
        if pp > 0:
            poser(plate, p["prix"], W - 220, 700, 0.6 + 0.4 * e_back(pp, 2.2), 6 * math.sin(lt * 2), cl(pp * 2))
        pc = prog(lt, 0.9, 1.25)
        if pc > 0:
            poser(plate, p["puce"], W / 2 + 90 * (1 - e_out(pc)), 1440, 0.85 + 0.15 * e_back(pc), 0, cl(pc * 2))
        return plate
    return scene


def scene_fin(T, t):
    s0 = T["starts"][4]
    lt = t - s0
    plate = degrade_v(W, H, [(0, (22, 19, 16)), (0.45, (34, 28, 22)), (1, (10, 9, 8))])
    plate.alpha_composite(halo(W, H, W / 2, 1000, 600, 420, (120, 100, 80), 150))
    largs = [im.width - 8 for im in R.lettres]
    logo = Image.new("RGBA", (int(sum(largs) + 32 * 4 + 80), 300), (0, 0, 0, 0))
    x = 40
    for i, im in enumerate(R.lettres):
        p = prog(lt, i * 0.05, 0.3 + i * 0.05)
        if p > 0:
            coller(logo, fondu(im, e_out(p)), x, 20 + 30 * (1 - e_out(p)))
        x += largs[i] + 32
    poser(plate, logo, W / 2, 420, 1 + 0.04 * lt)
    trio(plate, lt, 960, 0.36)
    ps = prog(lt, 0.3, 0.65)
    if ps > 0:
        poser(plate, R.site, W / 2, 1330, (0.8 + 0.2 * e_back(ps)) * (1 + 0.035 * math.sin(lt * 6)), 0, cl(ps * 2))
        poser(plate, R.lien, W / 2, 1430, 1, 0, e_out(ps))
        o = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        by = 1490 + 14 * abs(math.sin(lt * 4))
        ImageDraw.Draw(o).line([(W / 2 - 34, by), (W / 2, by + 30), (W / 2 + 34, by)], fill=OR_VIF + (int(255 * e_out(ps)),), width=10, joint="curve")
        plate.alpha_composite(o)
    return plate


SCENES = [scene_accroche, scene_produit(0), scene_produit(1), scene_produit(2), scene_fin]


def image(T, t):
    st = T["starts"]
    i = max(k for k in range(5) if t >= st[k] - 1e-9)
    TR = 0.1
    frame = None
    for b in range(1, 5):
        if abs(t - st[b]) < TR:
            p = (t - (st[b] - TR)) / (2 * TR)
            a, c = SCENES[b - 1](T, t).convert("RGB"), SCENES[b](T, t).convert("RGB")
            comp = Image.new("RGB", (W, H))
            off = int(W * e_io(p))
            comp.paste(a, (-off, 0))
            comp.paste(c, (W - off, 0))
            arr = np.asarray(comp, dtype=np.uint16)
            acc = arr.copy()
            amp = int(110 * math.sin(math.pi * p))
            for j in range(1, 6):
                acc += np.roll(arr, j * amp // 6, axis=1)
            frame = Image.fromarray((acc // 6).astype(np.uint8)).convert("RGBA")
            break
    if frame is None:
        frame = SCENES[i](T, t)
    if t < st[4] - 0.1:
        coller(frame, R.marque, 60, 150)
    M.sous_titres(frame, T, t)
    arr = np.asarray(frame.convert("RGB"), dtype=np.float32) * R.vignette
    return np.clip(arr + R.grain[int(t * FPS) % len(R.grain)], 0, 255).astype(np.uint8)


def sons(T):
    st = T["starts"]
    return {"impact": [0.0, st[4]], "whoosh": st[1:5],
            "pop": [s + d for s in st[1:4] for d in (0.05, 0.45, 0.95)], "riser": []}


def main():
    C.update(json.load(open(os.path.join(DOSSIER, "court.json"))))
    T = M.charger_timeline(BUILD, fin_hold=1.6)
    construire()
    if "--apercu" in sys.argv:
        for a in sys.argv[sys.argv.index("--apercu") + 1:]:
            Image.fromarray(image(T, float(a))).save(os.path.join(BUILD, f"apercu_{a}.png"))
        return
    M.produire(T, image, BUILD, sons(T), nom="idrea_top3.mp4", srt="idrea_top3_sous-titres.srt",
               musique_args=("--direct", *C.get("musique", [])))


if __name__ == "__main__":
    main()

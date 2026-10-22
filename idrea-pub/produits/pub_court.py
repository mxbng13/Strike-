"""Format court (≈ 14 s) pensé pour la rétention : produit et marque visibles dès l'image 0.

  0 s   produit en grand sur fond coloré + question + logo IDREA dans le coin (tout le long)
  ~2 s  produit sur le comptoir + 2 atouts
  ~6 s  gros plan produit + pastille prix (prix réel de la boutique)
  fin   logo IDREA, produit, idrea.fr, « Lien en bio »

Prérequis : python3 ../voix_off.py <produit>/court.json <produit>/build_court
Usage     : python3 pub_court.py <produit> [--apercu T ...]  -> <produit>/build_court/idrea_<produit>_court.mp4
"""
import json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ICI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ICI)
sys.path.insert(0, os.path.dirname(ICI))
import rendu as M  # noqa: E402
import pub as P  # noqa: E402
from rendu import (W, H, FPS, CREME, NOIR, OR, OR_VIF, BLANC, ENCRE, BLACK, BOLD, MED, SERIF,  # noqa: E402
                   font, cl, prog, e_out, e_io, e_back, fondu, coller, poser, camera, degrade_v, halo,
                   texte, avec_ombre, puce, anim_puce)

SITE = "idrea.fr"  # domaine de la boutique Shopify


class Ressources:
    pass


R = Ressources()
C = {}


def construire(produit):
    base = json.load(open(os.path.join(ICI, produit, "config.json")))
    R.vues = P.photo_produit(os.path.join(ICI, produit, base["photo"]), cote=900)
    R.prod = R.vues[-1]
    R.comptoir = P.sur_comptoir(P.plan_3d("sdb"), R.prod, base_y=1240, h_max=760, w_max=860)
    col = tuple(C["couleur"])
    clair = tuple(min(255, int(v * 1.45 + 40)) for v in col)
    R.fond = degrade_v(W, H, [(0, clair), (0.55, tuple(min(255, int(v * 1.15 + 20)) for v in col)), (1, tuple(int(v * 0.7) for v in col))])
    R.fond.alpha_composite(halo(W, H, W / 2, 1050, 560, 560, (255, 255, 255), 120))
    # accroche : 2 lignes, la 1re en blanc, la 2e en or
    R.hook = []
    for i, s in enumerate(C["accroche"]):
        taille = 128
        while font(BLACK, taille).getlength(s) > 900:
            taille -= 4
        R.hook.append(avec_ombre(texte(s, font(BLACK, taille), (BLANC if i == 0 else OR_VIF) + (255,), 6, (10, 10, 10)), 14, 10, 0.6))
    R.puces2 = [puce(s, "check", 46) for s, _ in C["puces2"]]
    R.puces3 = [puce(s, "check", 46) for s, _ in C["puces3"]]
    # pastille prix
    p = Image.new("RGBA", (330, 330), (0, 0, 0, 0))
    d = ImageDraw.Draw(p)
    d.ellipse((10, 10, 320, 320), fill=OR_VIF + (255,), outline=BLANC + (255,), width=8)
    t1 = texte(C["prix"][0], font(BLACK, 40), NOIR + (255,), track=2)
    t2 = texte(C["prix"][1], font(BLACK, 82), NOIR + (255,))
    p.alpha_composite(t1, ((330 - t1.width) // 2, 92))
    p.alpha_composite(t2, ((330 - t2.width) // 2, 140))
    R.prix = avec_ombre(p, 14, 8, 0.35)
    # marque permanente (coin supérieur gauche, sous la zone d'interface TikTok)
    R.marque = avec_ombre(texte("IDREA", font(SERIF, 64, 600), BLANC + (255,), 0, track=10), 8, 3, 0.55)
    R.lettres = [texte(c, font(SERIF, 190, 500), CREME + (255,)) for c in "IDREA"]
    R.site = M._bouton(SITE.upper())
    R.lien = texte("Lien en bio", font(BOLD, 44), OR_VIF + (255,))
    if base.get("avant_apres"):
        P.R.aa = P.carte_avant_apres(os.path.join(ICI, produit, base["avant_apres"]["image"]), w_moitie=480)
        R.aa = True
    else:
        R.aa = False
    rng = np.random.default_rng(9)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    R.vignette = (1 - 0.28 * (((xx - W / 2) / (W * 0.75)) ** 2 + ((yy - H / 2) / (H * 0.7)) ** 2)).clip(0.6, 1)[..., None].astype(np.float32)
    R.grain = [rng.integers(-6, 7, (H, W, 1), dtype=np.int16) for _ in range(6)]


def vue(lt):
    return R.vues[int(lt * 12) % len(R.vues)]


def scene1(T, t):
    """Image 0 : produit en grand + question. Rien n'arrive en fondu : tout est déjà là."""
    lt = t - T["starts"][0]
    plate = R.fond.copy()
    punch = 1.12 - 0.12 * e_out(prog(lt, 0, 0.22))
    if R.aa:  # patchs : l'avant / après sert d'accroche, le produit est posé devant
        P.dessiner_avant_apres(plate, t + 0.5, 0.0, cy=1000)
        poser(plate, vue(lt), W / 2 + 290, 1430, 0.3 * punch, -8)
    else:
        bob = 10 * math.sin(lt * 2.2)
        poser(plate, vue(lt), W / 2, 1060 + bob, 0.95 * punch * (1 + 0.04 * lt), 2 * math.sin(lt * 1.7))
    for i, im in enumerate(R.hook):
        poser(plate, im, W / 2, 380 + i * 150, punch * (1 + (0.04 * math.sin(lt * 6) if i == 1 else 0)))
    return plate


def scene2(T, t):
    s0 = T["starts"][1]
    lt = t - s0
    plate = camera(R.comptoir.copy(), 1.12 + 0.06 * lt, W / 2, 1000)
    for k, (img, (_, mot)) in enumerate(zip(R.puces2, C["puces2"])):
        anim_puce(plate, img, 70, 360 + k * 115, t, P.quand(T, 1, mot, 0.2 + 0.4 * k) - 0.05)
    return plate


def scene3(T, t):
    s0 = T["starts"][2]
    lt = t - s0
    plate = R.fond.copy()
    # gros plan qui recule : on découvre le produit
    z = 1.75 - 0.6 * e_out(prog(lt, 0, 1.2))
    poser(plate, vue(lt + 1), W / 2, 1000, 1.0 * z)
    pp = prog(lt, 0.15, 0.5)
    if pp > 0:
        poser(plate, R.prix, W - 230, 500 + 30 * math.sin(lt * 3), 0.5 + 0.5 * e_back(pp, 2.2), -12 + 6 * math.sin(lt * 2), cl(pp * 2))
    for k, (img, (_, mot)) in enumerate(zip(R.puces3, C["puces3"])):
        anim_puce(plate, img, 70, 1280 + k * 115, t, P.quand(T, 2, mot, 0.2 + 0.4 * k) - 0.05)
    return plate


def scene4(T, t):
    s0 = T["starts"][3]
    lt = t - s0
    plate = degrade_v(W, H, [(0, (22, 19, 16)), (0.45, (34, 28, 22)), (1, (10, 9, 8))])
    plate.alpha_composite(halo(W, H, W / 2, 1000, 520, 420, tuple(C["couleur"]), 150))
    largs = [im.width - 8 for im in R.lettres]
    logo = Image.new("RGBA", (int(sum(largs) + 32 * 4 + 80), 300), (0, 0, 0, 0))
    x = 40
    for i, im in enumerate(R.lettres):
        p = prog(lt, i * 0.05, 0.3 + i * 0.05)
        if p > 0:
            coller(logo, fondu(im, e_out(p)), x, 20 + 30 * (1 - e_out(p)))
        x += largs[i] + 32
    poser(plate, logo, W / 2, 420, 1 + 0.04 * lt)
    pb = e_out(prog(lt, 0.1, 0.5))
    poser(plate, vue(lt), W / 2, 960 + 50 * (1 - pb), 0.62 * (0.8 + 0.2 * pb), 0, pb)
    ps = prog(lt, 0.35, 0.7)
    if ps > 0:
        pulse = 1 + 0.035 * math.sin(lt * 6)
        poser(plate, R.site, W / 2, 1330, (0.8 + 0.2 * e_back(ps)) * pulse, 0, cl(ps * 2))
        poser(plate, R.lien, W / 2, 1430, 1, 0, e_out(ps))
        o = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        by = 1490 + 14 * abs(math.sin(lt * 4))
        ImageDraw.Draw(o).line([(W / 2 - 34, by), (W / 2, by + 30), (W / 2 + 34, by)], fill=OR_VIF + (int(255 * e_out(ps)),), width=10, joint="curve")
        plate.alpha_composite(o)
    return plate


SCENES = [scene1, scene2, scene3, scene4]


def image(T, t):
    st = T["starts"]
    i = max(k for k in range(4) if t >= st[k] - 1e-9)
    TR = 0.1  # coupes rapides
    frame = None
    for b in range(1, 4):
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
    if t < st[3] - 0.1:  # la marque reste visible jusqu'à la fin, où le logo prend le relais
        coller(frame, R.marque, 60, 150)
    M.sous_titres(frame, T, t)
    arr = np.asarray(frame.convert("RGB"), dtype=np.float32) * R.vignette
    arr = np.clip(arr + R.grain[int(t * FPS) % len(R.grain)], 0, 255).astype(np.uint8)
    return arr


def sons(T):
    st = T["starts"]
    return {"impact": [0.0, st[3]], "whoosh": [st[1], st[2], st[3]],
            "pop": [st[2] + 0.2] + [P.quand(T, 1, m, 0.4) for _, m in C["puces2"]] + [P.quand(T, 2, m, 0.4) for _, m in C["puces3"]],
            "riser": []}


def main():
    produit = sys.argv[1]
    dossier = os.path.join(ICI, produit)
    C.update(json.load(open(os.path.join(dossier, "court.json"))))
    build = os.path.join(dossier, "build_court")
    T = M.charger_timeline(build, fin_hold=1.6)
    construire(produit)
    if "--apercu" in sys.argv:
        for a in sys.argv[sys.argv.index("--apercu") + 1:]:
            Image.fromarray(image(T, float(a))).save(os.path.join(build, f"apercu_{a}.png"))
        return
    M.produire(T, image, build, sons(T), nom=f"idrea_{produit}_court.mp4", srt=f"idrea_{produit}_court_sous-titres.srt",
               musique_args=("--direct",))


if __name__ == "__main__":
    main()

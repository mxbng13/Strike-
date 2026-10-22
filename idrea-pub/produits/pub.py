"""Publicités TikTok IDREA pour les produits de la boutique — même style que la pub bonnet en satin.

Une configuration par produit (produits/<produit>/config.json : voix off, accroche, puces, routine, CTA)
et des rendus 3D du produit (../3d/rendre_produits.sh : tour complet + produit posé sur le comptoir).

Prérequis : python3 ../voix_off.py <produit>/config.json <produit>/build
Usage     : python3 pub.py <produit>              -> <produit>/build/idrea_<produit>.mp4
            python3 pub.py <produit> --apercu T   -> <produit>/build/apercu_T.png
"""
import json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ICI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(ICI))
import rendu as M  # noqa: E402
from rendu import (W, H, FPS, CREME, NOIR, OR, OR_VIF, BLANC, ENCRE, BLACK, BOLD, MED, SERIF,  # noqa: E402
                   font, cl, prog, e_out, e_io, e_back, fondu, coller, poser, camera, degrade_v, halo,
                   ombre, texte, avec_ombre, puce, anim_puce, bokeh_sprite, studio, mot_t)

RENDUS_3D = os.path.join(os.path.dirname(ICI), "3d", "rendus")
ROUGE = (226, 86, 70)


class Ressources:
    pass


R = Ressources()
C = {}  # configuration du produit


def quand(T, scene, mot, frac=0.4):
    """Instant où le mot est prononcé dans la réplique ; à défaut, une fraction de la réplique."""
    try:
        return mot_t(T, scene, mot)
    except KeyError:
        s0 = T["starts"][scene]
        return s0 + frac * (T["fin_parole"][scene] - s0)


# --------------------------------------------------------------------------- ressources


def plan_3d(nom):
    return Image.open(os.path.join(RENDUS_3D, nom + ".png")).convert("RGBA").resize((W, H), Image.LANCZOS)


def tour_3d(nom, largeur=640):
    vues = [Image.open(os.path.join(RENDUS_3D, f"{nom}_{i:03d}.png")).convert("RGBA") for i in range(72)]
    boites = [v.getchannel("A").getbbox() for v in vues]
    b = (min(x[0] for x in boites), min(x[1] for x in boites), max(x[2] for x in boites), max(x[3] for x in boites))
    k = largeur / max(b[2] - b[0], (b[3] - b[1]) * 0.9)
    return [v.crop(b).resize((int((b[2] - b[0]) * k), int((b[3] - b[1]) * k)), Image.LANCZOS) for v in vues]


def puce_x(txt, taille, icone="cross"):
    """Puce « problème » : rond rouge avec une croix (ou « ! »)."""
    f = font(BOLD, taille)
    t = texte(txt, f, ENCRE + (255,))
    ic = int(taille * 1.25)
    w, h = t.width + ic + 56, int(taille * 1.9)
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, w - 1, h - 1), radius=h // 2, fill=(255, 255, 255, 240))
    cx, cy, r = 18 + ic // 2, h // 2, ic // 2
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=ROUGE + (255,))
    if icone == "cross":
        k = r * 0.42
        d.line([(cx - k, cy - k), (cx + k, cy + k)], fill=BLANC, width=max(3, r // 4))
        d.line([(cx - k, cy + k), (cx + k, cy - k)], fill=BLANC, width=max(3, r // 4))
    else:
        g = texte("!", font(BLACK, int(taille * 0.9)), BLANC + (255,))
        im.alpha_composite(g, (int(cx - g.width / 2), int(cy - g.height / 2)))
    im.alpha_composite(t, (ic + 36, (h - t.height) // 2 + 1))
    return avec_ombre(im, 10, 6, 0.28)


def carte_avant_apres(chemin, w_moitie=470):
    """Carte AVANT / APRÈS à partir d'une image côte à côte (séparée au milieu), + mention d'illustration."""
    src = Image.open(chemin).convert("RGB")
    m = src.width // 2
    moities = [src.crop((0, 0, m - 4, src.height)), src.crop((m + 4, 0, src.width, src.height))]
    h_moitie = int(w_moitie * moities[0].height / moities[0].width)
    pad, gap = 22, 14
    carte = Image.new("RGBA", (2 * w_moitie + gap + 2 * pad, h_moitie + 2 * pad + 56), (0, 0, 0, 0))
    ImageDraw.Draw(carte).rounded_rectangle((0, 0, carte.width - 1, carte.height - 1), radius=36, fill=(255, 252, 246, 245))
    vues = []
    for k, (im, lab) in enumerate(zip(moities, ("AVANT", "APRÈS"))):
        v = im.resize((w_moitie, h_moitie), Image.LANCZOS).convert("RGBA")
        masque = Image.new("L", v.size, 0)
        ImageDraw.Draw(masque).rounded_rectangle((0, 0, v.width - 1, v.height - 1), radius=24, fill=255)
        v.putalpha(masque)
        t = texte(lab, font(BLACK, 34), (NOIR if k else BLANC) + (255,), track=3)
        pill = Image.new("RGBA", (t.width + 36, t.height + 12), (0, 0, 0, 0))
        ImageDraw.Draw(pill).rounded_rectangle((0, 0, pill.width - 1, pill.height - 1), radius=pill.height // 2,
                                               fill=(OR_VIF if k else (30, 28, 26)) + (235,))
        pill.alpha_composite(t, (18, 6))
        v.alpha_composite(pill, (16, 16))
        vues.append(v)
    mention = texte("Photo d'illustration – résultats variables selon les peaux", font(MED, 28), (120, 110, 100, 255))
    return {"carte": carte, "vues": vues, "pos": [(pad, pad), (pad + w_moitie + gap, pad)], "mention": mention,
            "y_mention": pad + h_moitie + 10}


def dessiner_avant_apres(base, t, t0, cy=900):
    p = prog(t, t0 - 0.1, t0 + 0.35)
    if p <= 0:
        return
    A = R.aa
    carte = A["carte"].copy()
    carte.alpha_composite(A["vues"][0], A["pos"][0])
    # l'« après » se dévoile de gauche à droite
    pr = e_io(prog(t, t0 + 0.35, t0 + 0.95))
    if pr > 0:
        v = A["vues"][1]
        larg = max(1, int(v.width * pr))
        carte.alpha_composite(v.crop((0, 0, larg, v.height)), A["pos"][1])
    carte.alpha_composite(A["mention"], ((carte.width - A["mention"].width) // 2, A["y_mention"]))
    poser(base, avec_ombre(carte, 14, 10, 0.3), W / 2, cy + 50 * (1 - e_out(p)), 0.9 + 0.1 * e_back(p), 0, cl(p * 2))


def titre_img(s, taille=100):
    im = texte(s, font(BLACK, taille), BLANC + (255,), 5, (12, 12, 12))
    if im.width > 1000:  # titre trop long : on réduit pour tenir dans le cadre
        return titre_img(s, int(taille * 1000 / im.width))
    return avec_ombre(im, 14, 10, 0.55)


def construire(produit):
    R.tour = tour_3d(produit)
    R.sdb = plan_3d("sdb")
    R.comptoir = plan_3d(f"sdb_{produit}")
    rng = np.random.default_rng(9)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    f0, f1 = [tuple(c) for c in C["fond"]]
    R.studio = studio(f0, f1, 1300, tuple(int(v * 0.93) for v in f1), tuple(int(v * 0.8) for v in f1), lum=(255, 250, 244), lum_a=150)
    R.bokeh = [bokeh_sprite(r, (255, 252, 246), a) for r, a in ((26, 60), (40, 45), (60, 35), (18, 80))]
    R.bokeh_pos = [(rng.uniform(0, W), rng.uniform(80, 1250), int(rng.integers(0, 4)), rng.uniform(0.3, 1.0)) for _ in range(14)]
    R.ombre = ombre(460, 80, 24, 0.38)
    # accroche : 3 lignes, celle du milieu en or et plus grande, ajustées à la largeur
    R.hook = []
    for i, s in enumerate(C["accroche"]):
        taille = 168 if i == 1 else 132
        while font(BLACK, taille).getlength(s) > 960:
            taille -= 4
        R.hook.append(avec_ombre(texte(s, font(BLACK, taille), (OR_VIF if i == 1 else BLANC) + (255,), 5, (10, 10, 10)), 14, 10, 0.65))
    R.hook_puce = puce_x(C["accroche_puce"][0], 44, icone="warn")
    R.tags = {s: avec_ombre(M._tag(s), 8, 5, 0.3) for s in ("LE PROBLÈME", "LA SOLUTION")}
    R.titre_pb = titre_img(C["probleme"]["titre"])
    R.titre_sol = titre_img(C["solution"]["titre"])
    R.puces_pb = [puce_x(s, 42) for s, _ in C["probleme"]["puces"]]
    R.puces_sol = [puce(s, "check", 42) for s, _ in C["solution"]["puces"]]
    R.check_titre = texte(C["routine"]["titre"], font(BLACK, 54), ENCRE + (255,), track=4)
    R.check_items = [texte(s, font(BOLD, 44), ENCRE + (255,)) for s, _ in C["routine"]["items"]]
    R.lettres = [texte(c, font(SERIF, 180, 500), CREME + (255,)) for c in "IDREA"]
    R.slogan = [texte(s, font(SERIF, 64, 500), CREME + (255,)) for s in ("Ta routine.", "Tes soins.", "Ton style.")]
    R.decouvre = texte(C["cta"], font(MED, 40), (236, 226, 210, 255))
    R.bouton = M._bouton(C["bouton"])
    R.lien = texte(M.LIEN or "Lien en bio", font(MED, 34), OR + (255,))
    if C.get("avant_apres"):
        R.aa = carte_avant_apres(os.path.join(ICI, produit, C["avant_apres"]["image"]))
    R.vignette = (1 - 0.32 * (((xx - W / 2) / (W * 0.75)) ** 2 + ((yy - H / 2) / (H * 0.7)) ** 2)).clip(0.55, 1)[..., None].astype(np.float32)
    R.grain = [rng.integers(-7, 8, (H, W, 1), dtype=np.int16) for _ in range(6)]


def vue(lt, vitesse=1.0):
    if C.get("fixe"):  # produit présenté de face, sans rotation
        return R.tour[0]
    if C.get("oscillation"):  # produit plat : balancement de ±40° pour toujours le montrer de face
        angle = 40 * math.sin(lt * vitesse * 1.1)
        return R.tour[int(round(angle / 5)) % len(R.tour)]
    return R.tour[int(lt * vitesse * 12) % len(R.tour)]


def bokeh(base, lt, vx=14):
    for i, (x, y, k, d) in enumerate(R.bokeh_pos):
        spr = R.bokeh[k]
        xx = (x + vx * lt * d) % (W + 300) - 150
        yy = y + 18 * math.sin(lt * 0.6 + i)
        coller(base, fondu(spr, 0.6 + 0.4 * math.sin(lt * 0.9 + i)), xx - spr.width / 2, yy - spr.height / 2)


def titre(base, t, t0, tag, img, y=250):
    p = prog(t, t0, t0 + 0.35)
    if p <= 0:
        return
    poser(base, R.tags[tag], W / 2, y + 40 - 40 * (1 - e_out(p)), 0.8 + 0.2 * e_back(p), 0, cl(p * 2))
    p2 = prog(t, t0 + 0.1, t0 + 0.45)
    if p2 > 0 and img is not None:
        poser(base, img, W / 2, y + 150 + 50 * (1 - e_out(p2)), 0.9 + 0.1 * e_back(p2), 0, cl(p2 * 2))


# --------------------------------------------------------------------------- scènes


def scene1(T, t):
    """ACCROCHE : la question est à l'écran dès l'image 0, sans fondu."""
    lt = t - T["starts"][0]
    plate = M.clip("s1", lt) or R.sdb.copy()
    z = 1.18 - 0.08 * e_out(prog(lt, 0, 0.5)) + 0.08 * e_io(prog(lt, 0.5, 4.8))
    plate = camera(plate, z, W / 2, 900)
    tp = quand(T, 0, C["accroche_puce"][1], 0.55)
    up = e_io(prog(t, tp - 0.1, tp + 0.3))
    sc = 1 - 0.32 * up
    cy0 = 600 - 300 * up
    punch = 1.1 - 0.1 * e_out(prog(lt, 0, 0.2))
    for i, im in enumerate(R.hook):
        s = sc * punch
        if i == 1:
            s *= 1 + 0.05 * math.sin(lt * 5) * (1 - prog(lt, 1.0, 2.2))
        poser(plate, im, W / 2, cy0 + i * 175 * sc, s)
    po = prog(t, tp + 0.05, tp + 0.4)
    if po > 0:
        poser(plate, R.hook_puce, W / 2, 900 + 40 * (1 - e_out(po)), 0.85 + 0.15 * e_back(po), 0, cl(po * 2))
    return plate


def scene2(T, t):
    s0 = T["starts"][1]
    lt = t - s0
    plate = M.clip("s2", lt)
    if plate is None:
        plate = camera(R.sdb.copy(), 1.45 + 0.08 * lt / 6, W / 2 + 120, 1100)
        plate.alpha_composite(Image.new("RGBA", (W, H), (20, 16, 14, 70)))  # ambiance un peu plus sombre : le problème
    titre(plate, t, s0 + 0.05, "LE PROBLÈME", R.titre_pb)
    for k, (img, (_, mot)) in enumerate(zip(R.puces_pb, C["probleme"]["puces"])):
        anim_puce(plate, img, 60, 1080 + k * 110, t, quand(T, 1, mot, 0.3 + 0.25 * k) - 0.05)
    return plate


def scene3(T, t):
    s0 = T["starts"][2]
    lt = t - s0
    tb = quand(T, 2, C["solution"]["mot"], 0.15)
    plate = M.clip("s3", lt)
    if plate is None:
        plate = R.studio.copy()
        bokeh(plate, lt, 20)
        pb = prog(t, tb - 0.15, tb + 0.4)
        if pb > 0:
            fl = 1 - prog(t, tb - 0.1, tb + 0.5)
            if fl > 0:
                plate.alpha_composite(halo(W, H, W / 2, 900, 520 * (1.2 - fl * 0.4), 520 * (1.2 - fl * 0.4), (255, 250, 240), int(230 * fl)))
            bob = 10 * math.sin(lt * 1.5)
            poser(plate, R.ombre, W / 2, 1240, 1.1 + 0.05 * math.sin(lt * 1.5), 0, 0.8 * pb)
            spr = vue(lt - 2.0, 1.0)
            sc = 1.05 * (0.7 + 0.3 * e_back(pb))
            yb = 880 + bob + 120 * (1 - e_out(pb))
            refl = spr.transpose(Image.FLIP_TOP_BOTTOM)
            grad = Image.linear_gradient("L").resize(refl.size).point(lambda v: int(max(0, 255 - v * 2.2) * 0.2))
            refl.putalpha(Image.fromarray((np.asarray(refl.getchannel("A"), np.uint16) * np.asarray(grad) // 255).astype(np.uint8)))
            poser(plate, refl, W / 2, yb + spr.height * sc * 0.95, sc, 0, cl(pb * 2))
            poser(plate, spr, W / 2, yb, sc, 0, cl(pb * 2))
        plate = camera(plate, 1.0 + 0.05 * e_io(prog(lt, 0, 6)), W / 2, 950)
    titre(plate, t, s0 + 0.05, "LA SOLUTION", None)
    pn = prog(t, tb - 0.05, tb + 0.35)
    if pn > 0:
        poser(plate, R.titre_sol, W / 2, 400 + 50 * (1 - e_out(pn)), 0.9 + 0.1 * e_back(pn), 0, cl(pn * 2))
    if C.get("avant_apres"):
        dessiner_avant_apres(plate, t, quand(T, 2, C["avant_apres"]["mot"], 0.7))
    for k, (img, (_, mot)) in enumerate(zip(R.puces_sol, C["solution"]["puces"])):
        anim_puce(plate, img, W / 2 - img.width / 2, 1300 + k * 100, t, quand(T, 2, mot, 0.45 + 0.18 * k) - 0.05, (-1, 1, -1)[k % 3])
    return plate


def scene4(T, t):
    s0 = T["starts"][3]
    items = C["routine"]["items"]
    temps = [quand(T, 3, mot, 0.1 + 0.3 * k) for k, (_, mot) in enumerate(items)]
    cuts = [s0] + temps[1:]
    k = max(i for i, c in enumerate(cuts) if t >= c - 1e-6) if t >= cuts[0] else 0
    ct = t - cuts[k]
    plate = M.clip("s4" + "abc"[k], ct)
    if plate is None:
        # trois cadrages du produit posé sur le comptoir : plan large, gros plan, plan décalé
        z, cx, cy = ((1.0 + 0.03 * ct, W / 2, 1000), (1.18 + 0.04 * ct, W / 2, 1100), (1.12 - 0.03 * ct, W / 2 - 70, 1050))[k]
        plate = camera(R.comptoir.copy(), z, cx, cy)
    pc = e_out(prog(t, s0 + 0.05, s0 + 0.4))
    if pc > 0:
        cw, chh = 880, 420
        card = Image.new("RGBA", (cw, chh), (0, 0, 0, 0))
        d = ImageDraw.Draw(card)
        d.rounded_rectangle((0, 0, cw - 1, chh - 1), radius=40, fill=(255, 252, 246, 238))
        card.alpha_composite(R.check_titre, (56, 34))
        d.line([(60, 118), (cw - 60, 118)], fill=OR + (255,), width=3)
        for i, (ti, img) in enumerate(zip(temps, R.check_items)):
            pi = prog(t, ti - 0.1, ti + 0.25)
            if pi <= 0:
                continue
            y = 150 + i * 88
            cx, cy = 86, y + 32
            d.ellipse((cx - 26, cy - 26, cx + 26, cy + 26), fill=OR + (int(255 * cl(pi * 2)),))
            pchk = cl(pi * 1.6 - 0.3)
            if pchk > 0:
                pts = [(cx - 12, cy), (cx - 3, cy + 10), (cx + 14, cy - 10)]
                d.line(pts[:2] if pchk < 0.5 else pts, fill=BLANC + (255,), width=6, joint="curve")
            card.alpha_composite(fondu(img, cl(pi * 2)), (int(136 + 30 * (1 - e_out(pi))), y))
        card = avec_ombre(card, 14, 10, 0.3)
        poser(plate, card, W / 2, 430 - 60 * (1 - pc), 0.9 + 0.1 * pc, 0, pc)  # en haut : le produit reste visible
    return plate


def scene5(T, t):
    s0 = T["starts"][4]
    lt = t - s0
    fin = T["S5_fin_parole"] - s0
    plate = M.clip("s5", lt)
    dark = degrade_v(W, H, [(0, (22, 19, 16)), (0.45, (34, 28, 22)), (1, (10, 9, 8))])
    dark.alpha_composite(halo(W, H, W / 2, 800, 600, 520, (120, 86, 48), 70))
    plate = dark if plate is None else Image.blend(plate, dark, 0.55)
    LY = 720
    pl = prog(lt, 0.15, 0.6)
    if pl > 0:
        lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        x1 = -100 + (W + 200) * e_io(pl)
        x0 = max(-100, x1 - 900)
        if pl >= 1:
            r = e_io(prog(lt, 0.6, 1.1))
            x0, x1 = r * (W / 2 - 280), (1 - r) * W + r * (W / 2 + 280)
        glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(glow).rectangle((x0, LY + 108, x1, LY + 120), fill=(255, 214, 140, 200))
        lay.alpha_composite(glow.filter(ImageFilter.GaussianBlur(14)))
        ImageDraw.Draw(lay).rectangle((x0, LY + 113, x1, LY + 115), fill=(255, 244, 220, 255))
        if pl < 1:
            lay.alpha_composite(halo(W, H, x1, LY + 114, 90, 30, (255, 236, 200), 230))
        plate.alpha_composite(lay)
    zoom = 1 + 0.06 * e_io(prog(lt, 1.3, 7))
    largs = [im.width - 8 for im in R.lettres]
    logo = Image.new("RGBA", (int(sum(largs) + 30 * 4 + 80), 280), (0, 0, 0, 0))
    x, vis = 40, False
    for i, im in enumerate(R.lettres):
        p = prog(lt, 0.45 + i * 0.1, 0.95 + i * 0.1)
        if p > 0:
            vis = True
            li = im.filter(ImageFilter.GaussianBlur(10 * (1 - p))) if p < 1 else im
            coller(logo, fondu(li, e_out(p)), x, 20 + 40 * (1 - e_out(p)))
        x += largs[i] + 30
    if vis:
        poser(plate, logo, W / 2, LY, zoom)
    for i, im in enumerate(R.slogan):
        p = prog(lt, 1.5 + i * 0.2, 1.9 + i * 0.2)
        if p > 0:
            poser(plate, im, [W / 2 - 300, W / 2, W / 2 + 300][i], LY + 210 + 20 * (1 - e_out(p)), 1, 0, e_out(p))
    pb = e_out(prog(lt, 1.2, 1.9))
    if pb > 0:
        plate.alpha_composite(fondu(halo(W, H, W / 2, 1100, 360, 230, (255, 214, 170), 140), pb))
        poser(plate, vue(lt, 0.7), W / 2, 1110 + 60 * (1 - pb) + 6 * math.sin(lt * 1.6), 0.42 * zoom, 0, pb)
    tc = max(2.6, fin + 0.05)
    p = prog(lt, tc, tc + 0.35)
    if p > 0:
        poser(plate, R.decouvre, W / 2, 1290 + 20 * (1 - e_out(p)), 1, 0, e_out(p))
        pb2 = prog(lt, tc + 0.15, tc + 0.5)
        pulse = 1 + 0.03 * math.sin((lt - tc) * 6) * cl((lt - tc - 0.5) * 3)
        poser(plate, R.bouton, W / 2, 1410, (0.8 + 0.2 * e_back(pb2)) * pulse, 0, cl(pb2 * 2))
        poser(plate, R.lien, W / 2, 1495, 1, 0, e_out(pb2))
        o = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(o)
        pt = (lt - tc - 0.7) % 1.4
        if lt > tc + 0.7:
            cx, cy = W / 2 + 170, 1420
            rr = 20 + 70 * e_out(cl(pt / 0.7))
            d.ellipse((cx - rr, cy - rr, cx + rr, cy + rr), outline=(255, 244, 220, int(220 * (1 - cl(pt / 0.7)))), width=5)
            dy = 30 * (1 - e_out(cl(pt / 0.25)))
            d.polygon([(cx, cy + dy), (cx + 16, cy + 52 + dy), (cx + 26, cy + 38 + dy), (cx + 48, cy + 58 + dy),
                       (cx + 58, cy + 48 + dy), (cx + 36, cy + 28 + dy), (cx + 52, cy + 20 + dy)],
                      fill=BLANC + (255,), outline=NOIR + (255,))
        if lt > fin + 0.3:
            by = 1545 + 16 * abs(math.sin((lt - tc) * 4))
            d.line([(W / 2 - 34, by), (W / 2, by + 30), (W / 2 + 34, by)], fill=OR_VIF + (255,), width=10, joint="curve")
        plate.alpha_composite(o)
    return plate


SCENES = [scene1, scene2, scene3, scene4, scene5]


def image(T, t):
    st = T["starts"]
    i = max(k for k in range(5) if t >= st[k] - 1e-9)
    TR = 0.14
    frame = None
    for b in range(1, 5):
        if abs(t - st[b]) < TR:
            p = (t - (st[b] - TR)) / (2 * TR)
            a = SCENES[b - 1](T, t).convert("RGB")
            c = SCENES[b](T, t).convert("RGB")
            if b == 4:
                frame = Image.blend(a, c, e_io(p)).convert("RGBA")
            else:
                comp = Image.new("RGB", (W, H))
                off = int(W * e_io(p))
                comp.paste(a, (-off, 0))
                comp.paste(c, (W - off, 0))
                arr = np.asarray(comp, dtype=np.uint16)
                acc = arr.copy()
                amp = int(90 * math.sin(math.pi * p))
                for j in range(1, 6):
                    acc += np.roll(arr, j * amp // 6, axis=1)
                frame = Image.fromarray((acc // 6).astype(np.uint8)).convert("RGBA")
            break
    if frame is None:
        frame = SCENES[i](T, t)
    M.sous_titres(frame, T, t)
    arr = np.asarray(frame.convert("RGB"), dtype=np.float32) * R.vignette
    arr = np.clip(arr + R.grain[int(t * FPS) % len(R.grain)], 0, 255).astype(np.uint8)
    fade = prog(t, T["duree"] - 0.4, T["duree"])
    if fade > 0:
        arr = (arr * (1 - fade)).astype(np.uint8)
    return arr


def sons(T):
    st = T["starts"]
    items = C["routine"]["items"]
    return {"impact": [0.0, st[4] + 0.45],
            "whoosh": [1.0, st[1], st[2], st[3], st[4]] + [quand(T, 3, m, 0.4) for _, m in items[1:]],
            "pop": [quand(T, 0, C["accroche_puce"][1], 0.55) + 0.05, quand(T, 2, C["solution"]["mot"], 0.15)]
                   + [quand(T, 1, m, 0.4) for _, m in C["probleme"]["puces"]]
                   + [quand(T, 2, m, 0.5) for _, m in C["solution"]["puces"]]
                   + [quand(T, 3, m, 0.4) for _, m in items],
            "riser": [st[4] + 0.15]}


def main():
    produit = sys.argv[1]
    dossier = os.path.join(ICI, produit)
    C.update(json.load(open(os.path.join(dossier, "config.json"))))
    M.CLIPS = os.path.join(dossier, "clips")
    build = os.path.join(dossier, "build")
    T = M.charger_timeline(build, fin_hold=3.0)
    construire(produit)
    if "--apercu" in sys.argv:
        for a in sys.argv[sys.argv.index("--apercu") + 1:]:
            Image.fromarray(image(T, float(a))).save(os.path.join(build, f"apercu_{a}.png"))
        return
    M.produire(T, image, build, sons(T), nom=f"idrea_{produit}.mp4", srt=f"idrea_{produit}_sous-titres.srt",
               musique_args=("--direct",))


if __name__ == "__main__":
    main()

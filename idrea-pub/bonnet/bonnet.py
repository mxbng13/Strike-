"""Publicité TikTok IDREA — bonnet en satin (≈ 29 s, 1080x1920).

Même moteur et même style que la pub derma roller / huile de ricin (../rendu.py).
Prérequis : python3 ../voix_off.py script.json build
Usage     : python3 bonnet.py              -> build/idrea_bonnet_satin.mp4
            python3 bonnet.py --apercu T   -> build/apercu_T.png
Plans réels : clips/s1.mp4, s2.mp4, s3.mp4, s4a.mp4 … s4c.mp4, s5.mp4 (voir README).
"""
import math, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ICI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(ICI))
import rendu as M  # noqa: E402
from rendu import (W, H, FPS, CREME, NOIR, OR, OR_VIF, BLANC, ENCRE, BLACK, BOLD, MED, SERIF,  # noqa: E402
                   font, cl, prog, e_out, e_io, e_back, fondu, coller, poser, camera, degrade_v, halo,
                   ombre, texte, avec_ombre, puce, anim_puce, fleche, bokeh_sprite, studio, mot_t)

BUILD = os.path.join(ICI, "build")
M.CLIPS = os.path.join(ICI, "clips")
ROUGE = (226, 86, 70)


class Ressources:
    pass


R = Ressources()

# --------------------------------------------------------------------------- sprites


RENDUS_3D = os.path.join(os.path.dirname(ICI), "3d", "rendus")


def plan_3d(nom):
    """Plan plein cadre rendu en 3D (../3d/rendus, 2160x3840) ramené en 1080x1920."""
    return Image.open(os.path.join(RENDUS_3D, nom + ".png")).convert("RGBA").resize((W, H), Image.LANCZOS)


def bonnet_3d(largeur=620):
    """Tour complet du bonnet modélisé en 3D (72 vues, fond transparent), recadré sur une boîte commune."""
    vues = [Image.open(os.path.join(RENDUS_3D, f"bonnet_{i:03d}.png")).convert("RGBA") for i in range(72)]
    boites = [v.getchannel("A").getbbox() for v in vues]
    boite = (min(b[0] for b in boites), min(b[1] for b in boites), max(b[2] for b in boites), max(b[3] for b in boites))
    k = largeur / (boite[2] - boite[0])
    return [v.crop(boite).resize((largeur, int((boite[3] - boite[1]) * k)), Image.LANCZOS) for v in vues]


# --------------------------------------------------------------------------- ressources


def construire():
    R.bonnets = bonnet_3d()
    R.lit_jour = plan_3d("lit_jour")    # oreiller en coton + cheveux tombés
    R.lits = [plan_3d("lit_soir"), plan_3d("lit_nuit"), plan_3d("lit_matin")]  # bonnet posé sur l'oreiller
    rng = np.random.default_rng(9)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    R.satin = studio((246, 236, 228), (230, 208, 194), 1300, (216, 190, 172), (186, 156, 138), lum=(255, 236, 222), lum_a=140)
    R.bokeh = [bokeh_sprite(r, (255, 248, 236), a) for r, a in ((26, 60), (40, 45), (60, 35), (18, 80))]
    R.bokeh_pos = [(rng.uniform(0, W), rng.uniform(80, 1250), int(rng.integers(0, 4)), rng.uniform(0.3, 1.0)) for _ in range(14)]
    R.ombre = ombre(460, 80, 24, 0.38)
    fb = font(BLACK, 132)
    R.hook = [avec_ombre(texte(s, f, c + (255,), 5, (10, 10, 10)), 14, 10, 0.65) for s, c, f in
              (("CHEVEUX EN", BLANC, fb), ("PAGAILLE", OR_VIF, font(BLACK, 168)), ("AU RÉVEIL ?", BLANC, fb))]
    R.titres = {s: avec_ombre(texte(s, font(BLACK, 100), BLANC + (255,), 5, (12, 12, 12)), 14, 10, 0.55)
                for s in ("LE COTON FROTTE", "BONNET EN SATIN")}
    R.tags = {s: avec_ombre(M._tag(s), 8, 5, 0.3) for s in ("LE PROBLÈME", "LA SOLUTION")}
    R.puces = {
        "oreiller": puce_x("LA FAUTE À TON OREILLER ?", 44, icone="warn"),
        "frisottis": puce_x("FRISOTTIS", 42), "noeuds": puce_x("NŒUDS", 42), "ecrasee": puce_x("COIFFURE ÉCRASÉE", 42),
        "doux": puce("TOUT DOUX", "check", 42), "glisse": puce("GLISSE SUR LES CHEVEUX", "check", 42),
        "frott": puce("MOINS DE FROTTEMENTS", "check", 42),
    }
    R.check_titre = texte("TA ROUTINE NUIT", font(BLACK, 54), ENCRE + (255,), track=4)
    R.check_items = [texte(s, font(BOLD, 44), ENCRE + (255,)) for s in
                     ("Le soir : enfile ton bonnet", "La nuit : dors tranquille", "Le matin : cheveux protégés")]
    R.lettres = [texte(c, font(SERIF, 180, 500), CREME + (255,)) for c in "IDREA"]
    R.slogan = [texte(s, font(SERIF, 64, 500), CREME + (255,)) for s in ("Ta routine.", "Tes soins.", "Ton style.")]
    R.decouvre = texte("Découvre le bonnet en satin sur Idrea.", font(MED, 40), (236, 226, 210, 255))
    R.bouton = M._bouton("DÉCOUVRIR LE BONNET")
    R.lien = texte(M.LIEN or "Lien en bio", font(MED, 34), OR + (255,))
    R.vignette = (1 - 0.32 * (((xx - W / 2) / (W * 0.75)) ** 2 + ((yy - H / 2) / (H * 0.7)) ** 2)).clip(0.55, 1)[..., None].astype(np.float32)
    R.grain = [rng.integers(-7, 8, (H, W, 1), dtype=np.int16) for _ in range(6)]


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


def bonnet(lt, vitesse=1.0):
    return R.bonnets[int(lt * vitesse * 12) % len(R.bonnets)]


def bokeh(base, lt, vx=14, a=1.0):
    for i, (x, y, k, d) in enumerate(R.bokeh_pos):
        spr = R.bokeh[k]
        xx = (x + vx * lt * d) % (W + 300) - 150
        yy = y + 18 * math.sin(lt * 0.6 + i)
        coller(base, fondu(spr, a * (0.6 + 0.4 * math.sin(lt * 0.9 + i))), xx - spr.width / 2, yy - spr.height / 2)


def titre(base, t, t0, tag, nom, y=250):
    p = prog(t, t0, t0 + 0.35)
    if p <= 0:
        return
    poser(base, R.tags[tag], W / 2, y + 40 - 40 * (1 - e_out(p)), 0.8 + 0.2 * e_back(p), 0, cl(p * 2))
    p2 = prog(t, t0 + 0.1, t0 + 0.45)
    if p2 > 0 and nom:
        poser(base, R.titres[nom], W / 2, y + 150 + 50 * (1 - e_out(p2)), 0.9 + 0.1 * e_back(p2), 0, cl(p2 * 2))


# --------------------------------------------------------------------------- scènes


def scene1(T, t):
    """ACCROCHE — tout est déjà à l'écran à la 1re image : titre, oreiller en vrac, zoom « coup de poing »."""
    lt = t - T["starts"][0]
    plate = M.clip("s1", lt)
    if plate is None:
        plate = R.lit_jour.copy()
    tp = mot_t(T, 0, "problème")
    # zoom d'entrée brutal + second « cut » de zoom à ~1 s pour relancer l'attention
    z = 1.18 - 0.08 * e_out(prog(lt, 0, 0.5)) + 0.08 * e_io(prog(lt, 0.5, 4.8))
    plate = camera(plate, z, W / 2, 900)
    up = e_io(prog(t, tp - 0.1, tp + 0.3))
    sc = 1 - 0.32 * up
    cy0 = 560 - 290 * up
    punch = 1.1 - 0.1 * e_out(prog(lt, 0, 0.2))  # visible dès l'image 0, sans fondu
    ys = [cy0, cy0 + 175 * sc, cy0 + 350 * sc]
    for i, im in enumerate(R.hook):
        s = sc * punch
        dx = 0
        if i == 1:
            s *= 1 + 0.05 * math.sin(lt * 5) * (1 - prog(lt, 1.0, 2.2))  # « PAGAILLE » qui respire
        poser(plate, im, W / 2 + dx, ys[i], s)
    to = mot_t(T, 0, "ton")
    po = prog(t, tp + 0.1, tp + 0.45)
    if po > 0:
        poser(plate, R.puces["oreiller"], W / 2, 900 + 40 * (1 - e_out(po)), 0.85 + 0.15 * e_back(po), 0, cl(po * 2))
    pf = e_out(prog(t, to, to + 0.4))
    if pf > 0:
        fleche(plate, [(W / 2 - 220, 980), (W / 2 - 280, 1060), (W / 2 - 200, 1130), (W / 2 - 110, 1160)], pf)
    return plate


def scene2(T, t):
    s0 = T["starts"][1]
    lt = t - s0
    plate = M.clip("s2", lt)
    if plate is None:
        plate = camera(R.lit_jour.copy(), 1.5 + 0.08 * lt / 6, W / 2, 1000)
        # flèches de frottement qui vont et viennent
        o = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(o)
        a = 1 - prog(t, mot_t(T, 1, "Ça"), mot_t(T, 1, "Ça") + 0.3) * 0.6
        for k, yv in enumerate((820, 960)):
            dx = 60 * math.sin(lt * 7 + k * 2)
            x0, x1 = 300 + dx, 780 + dx
            d.line([(x0, yv), (x1, yv)], fill=OR_VIF + (int(240 * a),), width=12)
            for xx, sg in ((x0, -1), (x1, 1)):
                d.polygon([(xx + sg * 34, yv), (xx, yv - 22), (xx, yv + 22)], fill=OR_VIF + (int(240 * a),))
        plate.alpha_composite(o)
    titre(plate, t, s0 + 0.05, "LE PROBLÈME", "LE COTON FROTTE")
    for cle, mot, y in (("frisottis", "frisottis", 1080), ("noeuds", "nœuds", 1190), ("ecrasee", "coiffure", 1300)):
        anim_puce(plate, R.puces[cle], 60, y, t, mot_t(T, 1, mot) - 0.05)
    return plate


def scene3(T, t):
    s0 = T["starts"][2]
    lt = t - s0
    tb = mot_t(T, 2, "bonnet")
    plate = M.clip("s3", lt)
    if plate is None:
        plate = R.satin.copy()
        bokeh(plate, lt, 20)
        pb = prog(t, tb - 0.15, tb + 0.4)
        if pb > 0:
            # éclat lumineux à l'apparition
            fl = 1 - prog(t, tb - 0.1, tb + 0.5)
            if fl > 0:
                plate.alpha_composite(halo(W, H, W / 2, 900, 520 * (1.2 - fl * 0.4), 520 * (1.2 - fl * 0.4), (255, 244, 230), int(230 * fl)))
            bob = 10 * math.sin(lt * 1.5)
            poser(plate, R.ombre, W / 2, 1230, 1.1 + 0.05 * math.sin(lt * 1.5), 0, 0.8 * pb)
            poser(plate, bonnet(lt - 2.0, 1.0), W / 2, 900 + bob + 120 * (1 - e_out(pb)), 1.25 * (0.7 + 0.3 * e_back(pb)),
                  0, cl(pb * 2))
        plate = camera(plate, 1.0 + 0.05 * e_io(prog(lt, 0, 6)), W / 2, 950)
    titre(plate, t, s0 + 0.05, "LA SOLUTION", None)
    pn = prog(t, tb - 0.05, tb + 0.35)
    if pn > 0:
        poser(plate, R.titres["BONNET EN SATIN"], W / 2, 400 + 50 * (1 - e_out(pn)), 0.9 + 0.1 * e_back(pn), 0, cl(pn * 2))
    for cle, mot, y, cote in (("doux", "doux", 1290, -1), ("glisse", "glisse", 1390, 1), ("frott", "moins", 1490, -1)):
        img = R.puces[cle]
        anim_puce(plate, img, W / 2 - img.width / 2, y, t, mot_t(T, 2, mot) - 0.05, cote)
    return plate


def scene4(T, t):
    s0 = T["starts"][3]
    lt = t - s0
    cuts = [s0, mot_t(T, 3, "tu"), mot_t(T, 3, "matin")]
    k = max(i for i, c in enumerate(cuts) if t >= c - 1e-6) if t >= cuts[0] else 0
    ct = t - cuts[k]
    plate = M.clip("s4" + "abc"[k], ct)
    if plate is None:
        z = (1.12 + 0.04 * ct, 1.05 + 0.03 * ct, 1.1 - 0.03 * ct)[k]
        plate = camera(R.lits[k].copy(), z, W / 2, 1000)
    pc = e_out(prog(t, s0 + 0.05, s0 + 0.4))
    if pc > 0:
        cw, chh = 860, 420
        card = Image.new("RGBA", (cw, chh), (0, 0, 0, 0))
        d = ImageDraw.Draw(card)
        d.rounded_rectangle((0, 0, cw - 1, chh - 1), radius=40, fill=(255, 252, 246, 238))
        card.alpha_composite(R.check_titre, (56, 34))
        d.line([(60, 118), (cw - 60, 118)], fill=OR + (255,), width=3)
        for i, (mot, img) in enumerate(zip(("soir", "dors", "matin"), R.check_items)):
            ti = mot_t(T, 3, mot)
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
        poser(plate, card, W / 2, 440 - 60 * (1 - pc), 0.9 + 0.1 * pc, 0, pc)
    return plate


def scene5(T, t):
    s0 = T["starts"][4]
    lt = t - s0
    fin = T["S5_fin_parole"] - s0
    plate = M.clip("s5", lt)
    dark = degrade_v(W, H, [(0, (22, 19, 16)), (0.45, (34, 28, 22)), (1, (10, 9, 8))])
    dark.alpha_composite(halo(W, H, W / 2, 800, 600, 520, (120, 86, 48), 70))
    if plate is None:
        plate = dark
    else:
        plate = Image.blend(plate, dark, 0.55)
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
    track = 30
    tot = sum(largs) + track * 4
    logo = Image.new("RGBA", (int(tot + 80), 280), (0, 0, 0, 0))
    x, vis = 40, False
    for i, im in enumerate(R.lettres):
        p = prog(lt, 0.45 + i * 0.1, 0.95 + i * 0.1)
        if p > 0:
            vis = True
            li = im.filter(ImageFilter.GaussianBlur(10 * (1 - p))) if p < 1 else im
            coller(logo, fondu(li, e_out(p)), x, 20 + 40 * (1 - e_out(p)))
        x += largs[i] + track
    if vis:
        poser(plate, logo, W / 2, LY, zoom)
    for i, im in enumerate(R.slogan):
        p = prog(lt, 1.5 + i * 0.2, 1.9 + i * 0.2)
        if p > 0:
            poser(plate, im, [W / 2 - 300, W / 2, W / 2 + 300][i], LY + 210 + 20 * (1 - e_out(p)), 1, 0, e_out(p))
    pb = e_out(prog(lt, 1.2, 1.9))
    if pb > 0:
        plate.alpha_composite(fondu(halo(W, H, W / 2, 1100, 360, 230, (255, 214, 170), 140), pb))
        poser(plate, bonnet(lt, 0.7), W / 2, 1110 + 60 * (1 - pb) + 6 * math.sin(lt * 1.6), 0.55 * zoom, 0, pb)
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
        if lt > fin + 0.3:  # la flèche ne gêne pas les sous-titres
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
                pe = e_io(p)
                comp = Image.new("RGB", (W, H))
                off = int(W * pe)
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
    return {"impact": [0.0, st[4] + 0.45],
            "whoosh": [1.0, st[1], st[2], st[3], mot_t(T, 3, "tu"), mot_t(T, 3, "matin"), st[4]],
            "pop": [mot_t(T, 0, "problème") + 0.1, mot_t(T, 1, "frisottis"), mot_t(T, 1, "nœuds"), mot_t(T, 1, "coiffure"),
                    mot_t(T, 2, "bonnet"), mot_t(T, 2, "doux"), mot_t(T, 2, "glisse"), mot_t(T, 2, "moins"),
                    mot_t(T, 3, "soir"), mot_t(T, 3, "dors"), mot_t(T, 3, "matin")],
            "riser": [st[4] + 0.15]}


def main():
    T = M.charger_timeline(BUILD, fin_hold=3.0)
    construire()
    if "--apercu" in sys.argv:
        for a in sys.argv[sys.argv.index("--apercu") + 1:]:
            Image.fromarray(image(T, float(a))).save(os.path.join(BUILD, f"apercu_{a}.png"))
        return
    M.produire(T, image, BUILD, sons(T), nom="idrea_bonnet_satin.mp4", srt="idrea_bonnet_sous-titres.srt",
               musique_args=("--direct",))


if __name__ == "__main__":
    main()

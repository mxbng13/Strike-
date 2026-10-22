"""Rendu de la publicité TikTok IDREA (1080x1920, 30 i/s).

Prérequis : python3 voix_off.py (crée build/vo.json + build/vo_N.mp3).
Usage     : python3 rendu.py            -> build/idrea_pub_tiktok.mp4
            python3 rendu.py --apercu T   -> build/apercu_T.png (une image à l'instant T)

Plans réels / générés par IA : déposer un fichier dans clips/ (s1.mp4, s2.mp4, s3.mp4,
s4a.mp4 … s4e.mp4, s5.mp4). Il remplace le décor procédural du plan correspondant ;
titres, puces, sous-titres et animation du logo restent superposés.
Lien boutique : variable d'environnement IDREA_LIEN (affiché sous le bouton final).
"""
import json, math, os, subprocess, sys
import multiprocessing as mp
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H, FPS = 1080, 1920, 30
HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(HERE, "build")
FONTS = os.path.join(HERE, "fonts")
CLIPS = os.path.join(HERE, "clips")
LIEN = os.environ.get("IDREA_LIEN", "").strip()

CREME = (243, 237, 228)
BEIGE = (222, 208, 190)
NOIR = (14, 12, 11)
OR = (201, 164, 106)
OR_VIF = (242, 193, 78)
BLANC = (255, 255, 255)
ENCRE = (24, 22, 20)

BLACK, BOLD, MED, SERIF = "InterDisplay-Black.otf", "InterDisplay-Bold.otf", "Inter-Medium.otf", "CormorantGaramond-VF.ttf"
CAP_Y = 1660          # sous-titres classiques, en bas de l'image
CAP_MAXW = 900

# --------------------------------------------------------------------------- utilitaires

_fc = {}


def font(name, size, wght=None):
    k = (name, size, wght)
    if k not in _fc:
        f = ImageFont.truetype(os.path.join(FONTS, name), size)
        if wght:
            f.set_variation_by_axes([wght])
        _fc[k] = f
    return _fc[k]


def cl(x, a=0.0, b=1.0):
    return a if x < a else b if x > b else x


def prog(t, a, b):
    return cl((t - a) / (b - a)) if b > a else float(t >= a)


def e_out(p):
    return 1 - (1 - p) ** 3


def e_io(p):
    return p * p * (3 - 2 * p)


def e_back(p, s=1.7):
    p -= 1
    return 1 + p * p * ((s + 1) * p + s)


def mix(a, b, p):
    return tuple(int(a[i] + (b[i] - a[i]) * p) for i in range(len(a)))


def fondu(im, a):
    if a >= 0.999:
        return im
    im = im.copy()
    im.putalpha(im.getchannel("A").point(lambda v: int(v * a)))
    return im


def coller(base, im, x, y):
    x, y = int(round(x)), int(round(y))
    sx, sy = max(0, -x), max(0, -y)
    ex, ey = min(im.width, base.width - x), min(im.height, base.height - y)
    if ex <= sx or ey <= sy:
        return
    if sx or sy or ex < im.width or ey < im.height:
        im = im.crop((sx, sy, ex, ey))
    base.alpha_composite(im, (x + sx, y + sy))


def poser(base, spr, cx, cy, s=1.0, ang=0.0, a=1.0):
    im = spr
    if abs(s - 1) > 1e-3:
        im = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.BICUBIC)
    if abs(ang) > 0.05:
        im = im.rotate(ang, Image.BICUBIC, expand=True)
    im = fondu(im, a)
    coller(base, im, cx - im.width / 2, cy - im.height / 2)


def camera(img, z=1.0, cx=W / 2, cy=H / 2):
    if abs(z - 1) < 1e-3:
        return img
    w, h = W / z, H / z
    x0 = cl(cx - w / 2, 0, W - w)
    y0 = cl(cy - h / 2, 0, H - h)
    return img.resize((W, H), Image.BILINEAR, box=(x0, y0, x0 + w, y0 + h))


def degrade_v(w, h, stops):
    """stops : [(pos 0..1, (r,g,b)), ...] -> RGBA"""
    y = np.linspace(0, 1, h)[:, None]
    out = np.zeros((h, 1, 3))
    for c in range(3):
        out[..., c] = np.interp(y, [s[0] for s in stops], [s[1][c] for s in stops])
    arr = np.repeat(out, w, 1).astype(np.uint8)
    return Image.fromarray(arr, "RGB").convert("RGBA")


def halo(w, h, cx, cy, rx, ry, col, amax):
    yy, xx = np.mgrid[0:h, 0:w]
    d = ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2
    a = (np.exp(-d * 1.6) * amax).astype(np.uint8)
    im = Image.new("RGBA", (w, h), col + (0,))
    im.putalpha(Image.fromarray(a, "L"))
    return im


def ombre(w, h, blur, a):
    pad = blur * 3
    im = Image.new("RGBA", (w + 2 * pad, h + 2 * pad), (0, 0, 0, 0))
    ImageDraw.Draw(im).ellipse((pad, pad, pad + w, pad + h), fill=(20, 12, 6, int(255 * a)))
    return im.filter(ImageFilter.GaussianBlur(blur))


def texte(txt, f, fill, stroke=0, stroke_fill=(0, 0, 0), track=0):
    asc, desc = f.getmetrics()
    if track:
        widths = [f.getlength(c) + track for c in txt]
        w = int(sum(widths) - track) + 2 * stroke + 8
    else:
        w = int(f.getlength(txt)) + 2 * stroke + 8
    h = asc + desc + 2 * stroke + 8
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if track:
        x = stroke + 4
        for c, cw in zip(txt, widths):
            d.text((x, stroke + 4), c, font=f, fill=fill, stroke_width=stroke, stroke_fill=stroke_fill)
            x += cw
    else:
        d.text((stroke + 4, stroke + 4), txt, font=f, fill=fill, stroke_width=stroke, stroke_fill=stroke_fill)
    return im


def avec_ombre(im, blur=10, off=8, a=0.55):
    sh = Image.new("RGBA", (im.width + 4 * blur, im.height + 4 * blur + off), (0, 0, 0, 0))
    al = Image.new("L", sh.size, 0)
    al.paste(im.getchannel("A"), (2 * blur, 2 * blur + off))
    al = al.filter(ImageFilter.GaussianBlur(blur)).point(lambda v: int(v * a))
    sh.putalpha(al)
    sh.alpha_composite(im, (2 * blur, 2 * blur))
    return sh


# --------------------------------------------------------------------------- sprites produits


def roller_sprite(phase):
    """Derma roller vertical (tête en haut), dessiné en 2x puis réduit à 420x1180."""
    S = 2
    Wc, Hc = 420 * S, 1180 * S
    im = Image.new("RGBA", (Wc, Hc), (0, 0, 0, 0))
    cx, cy, half, R = Wc // 2, 120 * S, 150 * S, 82 * S
    # --- manche (numpy : dégradé cylindrique)
    hx0, hx1, hy0, hy1 = cx - 38 * S, cx + 38 * S, 300 * S, 1160 * S
    hw = hx1 - hx0
    u = np.linspace(-1, 1, hw)
    sh = 0.18 + 0.55 * np.clip(np.cos((u + 0.35) * 1.4), 0, 1) ** 2 + 0.7 * np.exp(-((u + 0.45) / 0.07) ** 2)
    col = np.clip(np.outer(np.ones(hy1 - hy0), sh)[..., None] * np.array([70, 68, 72]), 0, 255)
    handle = Image.fromarray(col.astype(np.uint8), "RGB").convert("RGBA")
    mask = Image.new("L", (hw, hy1 - hy0), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, hw - 1, hy1 - hy0 - 1), radius=hw // 2, fill=255)
    handle.putalpha(mask)
    im.alpha_composite(handle, (hx0, hy0))
    d = ImageDraw.Draw(im)
    # bague dorée + gravure
    d.rounded_rectangle((hx0 - 2, 330 * S, hx1 + 2, 352 * S), radius=6, fill=OR + (255,))
    d.rectangle((hx0 - 2, 337 * S, hx1 + 2, 340 * S), fill=(236, 206, 150, 255))
    lab = texte("IDREA", font(SERIF, 30 * S, 600), OR + (230,), track=10 * S).rotate(90, expand=True)
    im.alpha_composite(lab, (cx - lab.width // 2, 560 * S))
    # --- fourche
    for sgn in (-1, 1):
        pts = [(cx + sgn * (half + 14 * S), cy), (cx + sgn * (half + 14 * S), cy + 70 * S),
               (cx + sgn * 60 * S, cy + 150 * S), (cx + sgn * 26 * S, 300 * S)]
        d.line(pts, fill=(34, 33, 36, 255), width=24 * S, joint="curve")
        d.line([(x - sgn * 5 * S, y) for x, y in pts], fill=(105, 104, 110, 255), width=4 * S, joint="curve")
    d.rounded_rectangle((cx - 44 * S, 280 * S, cx + 44 * S, 312 * S), radius=10 * S, fill=(30, 29, 32, 255))
    # --- cylindre métallique
    yy = np.arange(-R, R)
    th = np.arcsin(np.clip(yy / R, -1, 1))
    shade = 0.22 + 0.6 * np.clip(np.cos(th + 0.45), 0, 1) ** 1.4 + 0.75 * np.exp(-((th + 0.55) / 0.1) ** 2) \
        + 0.25 * np.exp(-((th - 0.9) / 0.12) ** 2)
    cyl = np.clip(np.outer(shade, np.ones(2 * half))[..., None] * np.array([205, 208, 214]), 0, 255)
    cyl_im = Image.fromarray(cyl.astype(np.uint8), "RGB").convert("RGBA")
    m = Image.new("L", cyl_im.size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, 2 * half - 1, 2 * R - 1), radius=12 * S, fill=255)
    cyl_im.putalpha(m)
    im.alpha_composite(cyl_im, (cx - half, cy - R))
    # micro-aiguilles : rangées qui défilent avec la rotation
    N = 22
    step = 2 * math.pi / N
    for k in range(N):
        a = ((k * step + phase + math.pi) % (2 * math.pi)) - math.pi
        c = math.cos(a)
        if c < 0.12:
            continue
        y = cy + R * math.sin(a)
        r = 3.6 * S * c ** 0.6
        off = (k % 2) * 9 * S
        bright = int(150 + 105 * cl(math.cos(a + 0.5)))
        for x in range(cx - half + 14 * S + off, cx + half - 10 * S, 18 * S):
            d.ellipse((x - r, y - r * 0.8, x + r, y + r * 0.8), fill=(60, 62, 66, 200))
            d.ellipse((x - r * 0.55, y - r * 0.6, x + r * 0.45, y + r * 0.2), fill=(bright, bright, bright + 4, 255))
    # embouts
    for sgn in (-1, 1):
        x = cx + sgn * half
        d.rounded_rectangle((x - 12 * S, cy - R - 4 * S, x + 12 * S, cy + R + 4 * S), radius=10 * S, fill=(40, 39, 42, 255))
        d.ellipse((x - 7 * S, cy - 7 * S, x + 7 * S, cy + 7 * S), fill=(150, 150, 156, 255))
    return im.resize((Wc // S, Hc // S), Image.LANCZOS)


def bouteille_sprite():
    """Flacon compte-gouttes ambré, 2x puis réduit à 350x650."""
    S = 2
    Wc, Hc = 350 * S, 650 * S
    im = Image.new("RGBA", (Wc, Hc), (0, 0, 0, 0))
    # corps verre ambré
    bx0, bx1, by0, by1 = 20 * S, 330 * S, 205 * S, 640 * S
    bw, bh = bx1 - bx0, by1 - by0
    u = np.linspace(-1, 1, bw)
    prof = 0.35 + 0.75 * np.clip(np.cos(u * 1.35), 0, 1) ** 1.2
    v = np.linspace(0, 1, bh)[:, None]
    liquide = (v > 0.12).astype(float)
    base = np.array([150, 70, 14])
    vide = np.array([175, 105, 45])
    col = (liquide[..., None] * base + (1 - liquide[..., None]) * vide) * prof[None, :, None]
    col += (np.exp(-((u + 0.62) / 0.06) ** 2) * 150)[None, :, None]
    col += (np.exp(-((u - 0.72) / 0.03) ** 2) * 70)[None, :, None]
    col += (np.exp(-((v - 0.12) / 0.006) ** 2) * 60)[..., None]  # ménisque
    body = Image.fromarray(np.clip(col, 0, 255).astype(np.uint8), "RGB").convert("RGBA")
    m = Image.new("L", (bw, bh), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, bw - 1, bh - 1), radius=58 * S, fill=245)
    body.putalpha(m)
    im.alpha_composite(body, (bx0, by0))
    d = ImageDraw.Draw(im)
    # col
    d.rounded_rectangle((120 * S, 170 * S, 230 * S, 215 * S), radius=8 * S, fill=(160, 85, 25, 250))
    # bague noire striée
    cap = np.clip(np.outer(np.ones(95 * S), 0.25 + 0.7 * np.clip(np.cos(np.linspace(-1, 1, 136 * S) * 1.4 + 0.3), 0, 1) ** 2)[..., None]
                  * np.array([60, 58, 60]), 0, 255)
    cap_im = Image.fromarray(cap.astype(np.uint8), "RGB").convert("RGBA")
    cm = Image.new("L", cap_im.size, 0)
    ImageDraw.Draw(cm).rounded_rectangle((0, 0, cap_im.width - 1, cap_im.height - 1), radius=8 * S, fill=255)
    cap_im.putalpha(cm)
    im.alpha_composite(cap_im, (107 * S, 85 * S))
    for x in range(110 * S, 240 * S, 7 * S):
        d.line([(x, 88 * S), (x, 177 * S)], fill=(0, 0, 0, 70), width=S)
    d.rectangle((107 * S, 85 * S, 243 * S, 92 * S), fill=OR + (255,))
    # poire du compte-gouttes
    d.rounded_rectangle((132 * S, 6 * S, 218 * S, 95 * S), radius=42 * S, fill=(22, 21, 22, 255))
    d.ellipse((148 * S, 18 * S, 162 * S, 60 * S), fill=(110, 108, 112, 200))
    # étiquette
    lx0, lx1, ly0, ly1 = 48 * S, 302 * S, 330 * S, 560 * S
    lab = Image.new("RGBA", (lx1 - lx0, ly1 - ly0), (240, 233, 219, 255))
    ld = ImageDraw.Draw(lab)
    ld.rectangle((10 * S, 10 * S, lab.width - 10 * S, lab.height - 10 * S), outline=OR + (255,), width=S)
    t1 = texte("IDREA", font(SERIF, 54 * S, 600), ENCRE + (255,), track=9 * S)
    lab.alpha_composite(t1, ((lab.width - t1.width) // 2, 34 * S))
    ld.line([(70 * S, 112 * S), (lab.width - 70 * S, 112 * S)], fill=OR + (255,), width=S)
    t2 = texte("HUILE DE RICIN", font(BOLD, 21 * S), ENCRE + (255,), track=3 * S)
    lab.alpha_composite(t2, ((lab.width - t2.width) // 2, 128 * S))
    t3 = texte("soin · barbe · sourcils", font(MED, 15 * S), (110, 100, 88, 255))
    lab.alpha_composite(t3, ((lab.width - t3.width) // 2, 172 * S))
    # ombrage cylindrique de l'étiquette
    uu = np.linspace(-1, 1, lab.width)
    lshade = 0.62 + 0.38 * np.clip(np.cos((uu + 0.15) * 1.25), 0, 1)
    la = np.asarray(lab).astype(float)
    la[..., :3] *= lshade[None, :, None]
    im.alpha_composite(Image.fromarray(la.astype(np.uint8), "RGBA"), (lx0, ly0))
    # reflet sur l'étiquette
    refl = Image.new("RGBA", (16 * S, ly1 - ly0), (255, 255, 255, 60))
    im.alpha_composite(refl, (82 * S, ly0))
    return im.resize((Wc // S, Hc // S), Image.LANCZOS)


def goutte_sprite():
    S = 3
    w, h = 64 * S, 92 * S
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    pts = []
    for i in range(80):
        a = i / 80 * 2 * math.pi
        x = math.sin(a) * (1 - 0.0) * 30 * S * (0.4 + 0.6 * (1 - math.cos(a)) / 2) ** 0.9
        y = -math.cos(a) * 44 * S
        pts.append((w / 2 + x, h / 2 + 2 * S + y))
    d.polygon(pts, fill=(196, 128, 30, 235))
    d.ellipse((w / 2 - 22 * S, h / 2 + 2 * S, w / 2 + 22 * S, h / 2 + 40 * S), fill=(214, 150, 40, 240))
    d.ellipse((w / 2 - 14 * S, h / 2 + 8 * S, w / 2 - 4 * S, h / 2 + 24 * S), fill=(255, 240, 200, 230))
    d.ellipse((w / 2 + 8 * S, h / 2 + 28 * S, w / 2 + 16 * S, h / 2 + 36 * S), fill=(255, 210, 120, 160))
    return im.resize((w // S, h // S), Image.LANCZOS)


# --------------------------------------------------------------------------- décors


def bokeh_sprite(r, col, a):
    im = Image.new("RGBA", (4 * r, 4 * r), (0, 0, 0, 0))
    ImageDraw.Draw(im).ellipse((r, r, 3 * r, 3 * r), fill=col + (a,))
    return im.filter(ImageFilter.GaussianBlur(r * 0.25))


def studio(top, bottom, sol_y, sol_a, sol_b, lum=(255, 255, 255), lum_a=110):
    bg = degrade_v(W, H, [(0, top), (sol_y / H - 0.02, bottom), (sol_y / H, sol_a), (1, sol_b)])
    bg = bg.filter(ImageFilter.GaussianBlur(6))
    bg.alpha_composite(halo(W, H, W * 0.55, sol_y - 380, 520, 620, lum, lum_a))
    return bg


def miroir(jour=False):
    """Mur carrelé sombre + miroir rétroéclairé."""
    wall = (52, 48, 45) if not jour else (150, 142, 132)
    line = (64, 60, 56) if not jour else (168, 160, 150)
    bg = Image.new("RGBA", (W, H), wall + (255,))
    d = ImageDraw.Draw(bg)
    for x in range(0, W, 135):
        d.line([(x, 0), (x, H)], fill=line + (255,), width=3)
    for y in range(0, H, 135):
        d.line([(0, y), (W, y)], fill=line + (255,), width=3)
    bg = bg.filter(ImageFilter.GaussianBlur(5))
    box = (100, 230, 980, 1580)
    # halo LED
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(glow).rounded_rectangle(box, radius=70, outline=(255, 238, 214, 255), width=26)
    glow = glow.filter(ImageFilter.GaussianBlur(34))
    bg.alpha_composite(glow)
    bg.alpha_composite(glow)
    # surface du miroir
    inner = degrade_v(box[2] - box[0], box[3] - box[1],
                      [(0, (88, 90, 94) if not jour else (206, 204, 198)), (1, (36, 36, 38) if not jour else (150, 146, 140))])
    idr = ImageDraw.Draw(inner)
    idr.polygon([(80, 0), (260, 0), (-60, 900), (-200, 900)], fill=(255, 255, 255, 30))
    idr.polygon([(620, 0), (680, 0), (320, 1350), (260, 1350)], fill=(255, 255, 255, 18))
    inner = inner.filter(ImageFilter.GaussianBlur(2))
    m = Image.new("L", inner.size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, inner.width - 1, inner.height - 1), radius=60, fill=255)
    inner.putalpha(m)
    bg.alpha_composite(inner, box[:2])
    ImageDraw.Draw(bg).rounded_rectangle(box, radius=60, outline=(255, 246, 232, 200), width=4)
    if jour:  # rayons de lumière naturelle
        rays = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        rd = ImageDraw.Draw(rays)
        for x0, w in ((-200, 160), (120, 90), (380, 200), (760, 120)):
            rd.polygon([(x0, -100), (x0 + w, -100), (x0 + w + 700, H), (x0 + 700, H)], fill=(255, 236, 200, 34))
        bg.alpha_composite(rays.filter(ImageFilter.GaussianBlur(40)))
    return bg


# --------------------------------------------------------------------------- éléments graphiques


def puce(txt, icone="check", taille=42, fond=(255, 255, 255, 236), coul=ENCRE):
    f = font(BOLD, taille)
    t = texte(txt, f, coul + (255,))
    ic = int(taille * 1.25)
    w = t.width + ic + 56
    h = int(taille * 1.9)
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, w - 1, h - 1), radius=h // 2, fill=fond)
    cx, cy, r = 18 + ic // 2, h // 2, ic // 2
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=OR + (255,) if icone != "warn" else (232, 120, 60, 255))
    if icone == "check":
        d.line([(cx - r * .45, cy), (cx - r * .1, cy + r * .35), (cx + r * .5, cy - r * .35)], fill=BLANC, width=max(3, r // 4), joint="curve")
    elif icone in ("warn", "info"):
        g = "!" if icone == "warn" else "i"
        gt = texte(g, font(BLACK, int(taille * 0.9)), BLANC + (255,))
        im.alpha_composite(gt, (int(cx - gt.width / 2), int(cy - gt.height / 2)))
    im.alpha_composite(t, (ic + 36, (h - t.height) // 2 + 1))
    return avec_ombre(im, 10, 6, 0.28)


def anim_puce(base, img, x, y, t, t0, cote=-1):
    p = prog(t, t0, t0 + 0.35)
    if p <= 0:
        return
    dx = cote * 90 * (1 - e_out(p))
    s = 0.85 + 0.15 * e_back(p)
    poser(base, img, x + img.width / 2 + dx, y, s, 0, cl(p * 2))


def fleche(base, pts, p, coul=OR_VIF, width=10):
    """Courbe de Bézier dessinée progressivement + pointe."""
    if p <= 0:
        return
    (x0, y0), (x1, y1), (x2, y2), (x3, y3) = pts
    n = 50
    pl = []
    for i in range(int(n * p) + 1):
        s = i / n
        a, b, c, e = (1 - s) ** 3, 3 * s * (1 - s) ** 2, 3 * s * s * (1 - s), s ** 3
        pl.append((a * x0 + b * x1 + c * x2 + e * x3, a * y0 + b * y1 + c * y2 + e * y3))
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    if len(pl) > 1:
        d.line(pl, fill=(0, 0, 0, 90), width=width + 8, joint="curve")
        d.line(pl, fill=coul + (255,), width=width, joint="curve")
        if p >= 0.98:
            (ax, ay), (bx, by) = pl[-3], pl[-1]
            ang = math.atan2(by - ay, bx - ax)
            L = 38
            for da in (2.6, -2.6):
                d.line([(bx, by), (bx + L * math.cos(ang + da), by + L * math.sin(ang + da))], fill=coul + (255,), width=width)
    base.alpha_composite(layer)


def titre_etape(base, t, t0, num, nom, y=250):
    p = prog(t, t0, t0 + 0.4)
    if p <= 0:
        return
    tag = R.tags[num]
    poser(base, tag, W / 2, y + 40 - 40 * (1 - e_out(p)), 0.8 + 0.2 * e_back(p), 0, cl(p * 2))
    p2 = prog(t, t0 + 0.12, t0 + 0.55)
    if p2 > 0:
        im = R.noms[nom]
        poser(base, im, W / 2, y + 150 + 50 * (1 - e_out(p2)), 0.9 + 0.1 * e_back(p2), 0, cl(p2 * 2))


# --------------------------------------------------------------------------- ressources partagées (construites avant le fork)


class Ressources:
    pass


R = Ressources()


def construire():
    R.rollers = [roller_sprite(i / 16 * (2 * math.pi / 22)) for i in range(16)]
    R.bouteille = bouteille_sprite()
    R.goutte = goutte_sprite()
    R.studio = studio((246, 241, 233), (226, 214, 198), 1260, (214, 200, 182), (190, 174, 154))
    R.chaud = studio((238, 214, 182), (214, 176, 132), 1300, (196, 152, 104), (150, 106, 66), lum=(255, 226, 170), lum_a=150)
    R.miroir = miroir(False)
    R.miroir_jour = miroir(True)
    R.ombre = ombre(300, 60, 18, 0.45)
    R.bokeh = [bokeh_sprite(r, (255, 248, 236), a) for r, a in ((26, 60), (40, 45), (60, 35), (18, 80))]
    rng = np.random.default_rng(3)
    R.bokeh_pos = [(rng.uniform(0, W), rng.uniform(80, 1250), int(rng.integers(0, 4)), rng.uniform(0.3, 1.0)) for _ in range(16)]
    # brume du miroir (bruit basse fréquence)
    n = rng.random((30, 17))
    fog = Image.fromarray((n * 255).astype(np.uint8), "L").resize((880, 1350), Image.BICUBIC).filter(ImageFilter.GaussianBlur(30))
    fog = fog.point(lambda v: int(120 + 0.45 * v))
    R.brume = fog
    # titres
    fb = font(BLACK, 128)
    R.hook = [avec_ombre(texte(s, fb, c + (255,), 4, (10, 10, 10)), 14, 10, 0.6) for s, c in
              (("PAS ENCORE", BLANC), ("DE BARBE", BLANC), ("À", BLANC), ("18 ANS", OR_VIF), ("?", BLANC))]
    R.tags = {n: avec_ombre(_tag(f"ÉTAPE {n}"), 8, 5, 0.3) for n in (1, 2)}
    R.noms = {s: avec_ombre(texte(s, font(BLACK, 104), BLANC + (255,), 5, (12, 12, 12)), 14, 10, 0.55)
              for s in ("DERMA ROLLER", "HUILE DE RICIN")}
    R.puces = {
        "routine": puce("2 ÉTAPES POUR TA ROUTINE", "check", 44),
        "precaution": puce("À UTILISER AVEC PRÉCAUTION", "warn", 38),
        "consignes": puce("CONSIGNES DU FABRICANT", "check", 38),
        "hygiene": puce("HYGIÈNE IRRÉPROCHABLE", "check", 38),
        "nourrir": puce("NOURRIT", "check", 40),
        "assouplir": puce("ASSOUPLIT", "check", 40),
        "tolere": puce("SI TA PEAU LA TOLÈRE", "info", 36),
    }
    R.mots_soin = {s: avec_ombre(texte(s, font(SERIF, 120, 600), CREME + (255,), track=14), 12, 6, 0.4) for s in ("SOIN", "ROUTINE")}
    # carte checklist (plan 4)
    R.check_titre = texte("TA ROUTINE", font(BLACK, 54), ENCRE + (255,), track=4)
    R.check_items = [texte(s, font(BOLD, 44), ENCRE + (255,)) for s in
                     ("Prendre soin de ta peau", "Choisir des produits adaptés", "Rester régulier")]
    R.info = _info_carte("La pousse de la barbe dépend aussi\nde la génétique et des hormones.")
    # logo
    R.lettres = [texte(c, font(SERIF, 180, 500), CREME + (255,)) for c in "IDREA"]
    R.slogan = [texte(s, font(SERIF, 64, 500), CREME + (255,)) for s in ("Ta routine.", "Tes soins.", "Ton style.")]
    R.decouvre = texte("Découvre la sélection sur Idrea.", font(MED, 40), (236, 226, 210, 255))
    R.bouton = _bouton("DÉCOUVRIR LA SÉLECTION")
    R.lien = texte(LIEN, font(MED, 34), OR + (255,)) if LIEN else texte("Lien en bio", font(MED, 34), OR + (255,))
    yy, xx = np.mgrid[0:H, 0:W]
    R.vignette = (1 - 0.32 * (((xx - W / 2) / (W * 0.75)) ** 2 + ((yy - H / 2) / (H * 0.7)) ** 2)).clip(0.55, 1)[..., None].astype(np.float32)
    R.grain = [rng.integers(-7, 8, (H, W, 1), dtype=np.int16) for _ in range(6)]


def _tag(s):
    t = texte(s, font(BLACK, 40), NOIR + (255,), track=6)
    im = Image.new("RGBA", (t.width + 60, t.height + 20), (0, 0, 0, 0))
    ImageDraw.Draw(im).rounded_rectangle((0, 0, im.width - 1, im.height - 1), radius=im.height // 2, fill=OR_VIF + (255,))
    im.alpha_composite(t, (30, 10))
    return im


def _bouton(s):
    t = texte(s, font(BLACK, 40), NOIR + (255,), track=3)
    im = Image.new("RGBA", (t.width + 110, t.height + 44), (0, 0, 0, 0))
    ImageDraw.Draw(im).rounded_rectangle((0, 0, im.width - 1, im.height - 1), radius=im.height // 2, fill=OR + (255,))
    im.alpha_composite(t, (55, 22))
    return im


def _info_carte(s):
    f = font(BOLD, 40)
    lignes = s.split("\n")
    ts = [texte(l, f, ENCRE + (255,)) for l in lignes]
    w = max(t.width for t in ts) + 150
    h = sum(t.height for t in ts) + 60
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, w - 1, h - 1), radius=34, fill=(255, 252, 246, 240))
    d.ellipse((30, h // 2 - 30, 90, h // 2 + 30), fill=OR + (255,))
    gi = texte("i", font(BLACK, 46), BLANC + (255,))
    im.alpha_composite(gi, (60 - gi.width // 2, h // 2 - gi.height // 2))
    y = 30
    for t in ts:
        im.alpha_composite(t, (115, y))
        y += t.height
    return avec_ombre(im, 12, 8, 0.3)


# --------------------------------------------------------------------------- plans réels optionnels


class Clip:
    def __init__(self, path, t0):
        self.p = subprocess.Popen(
            ["ffmpeg", "-v", "error", "-ss", f"{max(0, t0):.3f}", "-i", path, "-vf",
             f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},fps={FPS}",
             "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
        self.i0 = int(round(max(0, t0) * FPS)) - 1
        self.last = None

    def frame(self, lt):
        want = int(round(lt * FPS))
        while self.i0 < want:
            buf = self.p.stdout.read(W * H * 3)
            if len(buf) < W * H * 3:
                break  # clip trop court : on fige la dernière image
            self.last = Image.frombuffer("RGB", (W, H), buf).convert("RGBA")
            self.i0 += 1
        return self.last


_clips = {}


def clip(nom, lt):
    if nom not in _clips:
        path = next((os.path.join(CLIPS, nom + e) for e in (".mp4", ".mov", ".webm")
                     if os.path.exists(os.path.join(CLIPS, nom + e))), None)
        _clips[nom] = Clip(path, lt) if path else None
    c = _clips[nom]
    if c is None:
        return None
    f = c.frame(max(0, lt))
    return f.copy() if f is not None else None


# --------------------------------------------------------------------------- timeline


def charger_timeline():
    vo = json.load(open(os.path.join(BUILD, "vo.json")))
    GAP = 0.3
    T = {"starts": [], "mots": [], "vo": []}
    t = 0.0
    for i, r in enumerate(vo):
        T["starts"].append(t)
        T["vo"].append((r["fichier"], t))
        fin = r["mots"][-1]["t"] + r["mots"][-1]["d"]
        texte_src = r["texte"]
        cur = 0
        for w in r["mots"]:
            idx = texte_src.find(w["w"], cur)
            ponct = ""
            if idx >= 0:
                cur = idx + len(w["w"])
                reste = texte_src[cur:].lstrip(" ")
                if reste and reste[0] in ".,:;?!":
                    ponct = reste[0]
            T["mots"].append({"t": t + w["t"], "f": t + w["t"] + w["d"], "w": w["w"], "p": ponct, "scene": i})
        T.setdefault("fin_parole", []).append(t + fin)
        t += fin + (GAP if i < len(vo) - 1 else 0)
    T["S5_fin_parole"] = t
    T["duree"] = t + 2.4
    # découpage des sous-titres : par proposition, puis pièces équilibrées de 42 caractères max
    MAXC = 42
    segs, cur = [], []
    for k, m in enumerate(T["mots"]):
        cur.append(k)
        nxt = T["mots"][k + 1] if k + 1 < len(T["mots"]) else None
        if m["p"] or nxt is None or nxt["scene"] != m["scene"]:
            segs.append(cur); cur = []
    longueur = lambda ids: len(" ".join(T["mots"][j]["w"] for j in ids))
    fus = []
    for sg in segs:  # on regroupe les propositions courtes séparées par une virgule
        if fus and T["mots"][fus[-1][-1]]["p"] == "," and T["mots"][fus[-1][-1]]["scene"] == T["mots"][sg[0]]["scene"] \
                and longueur(fus[-1] + sg) <= MAXC:
            fus[-1] = fus[-1] + sg
        else:
            fus.append(sg)
    chunks = []
    for sg in fus:
        n = max(1, math.ceil(longueur(sg) / MAXC))
        cible = longueur(sg) / n
        piece, acc = [], 0
        for j in sg:
            piece.append(j)
            acc = longueur(piece)
            if acc >= cible * 0.92 and n > 1 and j != sg[-1]:
                chunks.append(piece); piece = []; n -= 1
                cible = longueur(sg[sg.index(j) + 1:]) / n
        if piece:
            chunks.append(piece)
    T["chunks"] = chunks
    return T


def mot_t(T, scene, mot, n=1):
    """Instant (absolu) de la n-ième occurrence de `mot` dans la réplique `scene`."""
    mots = [m for m in T["mots"] if m["scene"] == scene]
    exact = any(m["w"] == mot for m in mots)
    c = 0
    for m in mots:
        if (m["w"] == mot) if exact else m["w"].lower().startswith(mot.lower()):
            c += 1
            if c == n:
                return m["t"]
    raise KeyError(mot)


MOTS_CLES = {"BARBE", "18 ANS", "DERMA", "ROLLER", "PRÉCAUTION", "CONSIGNES", "FABRICANT", "HYGIÈNE", "HUILE",
             "RICIN", "NOURRIR", "ASSOUPLIR", "POILS", "ROUTINE", "SOIN", "PEAU", "RÉGULIER", "GÉNÉTIQUE",
             "HORMONES", "IDREA", "SÉLECTION", "ADAPTÉS", "PRÉCAUTIONS"}


def affiche(w):
    w = w.upper()
    return "IDREA" if w.startswith("IDRÉA") else w


_cap_cache = {}


def img_chunk(T, ci, actif=None):
    if ci in _cap_cache:
        return _cap_cache[ci]
    idx = T["chunks"][ci]
    f = font(BOLD, 58)
    mots = [("Idrea" if T["mots"][j]["w"].startswith("Idréa") else T["mots"][j]["w"])
            + (T["mots"][j]["p"] if T["mots"][j]["p"] in "?!," else "") for j in idx]
    prec = T["mots"][idx[0] - 1] if idx[0] > 0 else None
    if prec is None or prec["scene"] != T["mots"][idx[0]]["scene"] or prec["p"] in (".", "?", "!"):
        mots[0] = mots[0][0].upper() + mots[0][1:]  # majuscule seulement en début de phrase
    esp = f.getlength(" ")
    lignes, cur = [], ""
    for m in mots:
        essai = (cur + " " + m).strip()
        if cur and f.getlength(essai) > CAP_MAXW:
            lignes.append(cur); cur = m
        else:
            cur = essai
    lignes.append(cur)
    if len(lignes) > 1 or (f.getlength(lignes[0]) > CAP_MAXW * 0.75 and len(mots) > 3):
        # équilibre sur deux lignes, plus lisible
        best = min(range(1, len(mots)), key=lambda k: abs(f.getlength(" ".join(mots[:k])) - f.getlength(" ".join(mots[k:]))))
        lignes = [" ".join(mots[:best]), " ".join(mots[best:])]
    asc, desc = f.getmetrics()
    lh = asc + desc + 4
    im = Image.new("RGBA", (CAP_MAXW + 80, len(lignes) * lh + 30), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for i, l in enumerate(lignes):
        x = (im.width - f.getlength(l)) / 2
        d.text((x, 15 + i * lh), l, font=f, fill=BLANC + (255,), stroke_width=5, stroke_fill=(0, 0, 0, 255))
    im = avec_ombre(im, 6, 3, 0.5)
    _cap_cache[ci] = im
    return im


def sous_titres(base, T, t):
    for ci, idx in enumerate(T["chunks"]):
        t0 = T["mots"][idx[0]]["t"]
        nxt = T["chunks"][ci + 1] if ci + 1 < len(T["chunks"]) else None
        t1 = T["mots"][idx[-1]]["f"] + 0.4
        if nxt is not None:
            t1 = min(t1, T["mots"][nxt[0]]["t"])
        if t0 <= t < t1:
            im = img_chunk(T, ci)
            coller(base, im, W / 2 - im.width / 2, CAP_Y - im.height / 2)
            return


# --------------------------------------------------------------------------- scènes


def bokeh(base, lt, vx=14, a=1.0, n=16):
    for i, (x, y, k, d) in enumerate(R.bokeh_pos[:n]):
        spr = R.bokeh[k]
        xx = (x + vx * lt * d) % (W + 300) - 150
        yy = y + 18 * math.sin(lt * 0.6 + i)
        coller(base, fondu(spr, a * (0.6 + 0.4 * math.sin(lt * 0.9 + i))), xx - spr.width / 2, yy - spr.height / 2)


def roller_a(lt, vitesse=1.6):
    k = int((lt * vitesse * 16) % 16)
    return R.rollers[k]


def scene1(T, t):
    s0 = T["starts"][0]
    lt = t - s0
    plate = clip("s1", lt)
    if plate is None:
        plate = R.miroir.copy()
        # buée essuyée en zigzag
        p = e_io(prog(lt, 0.1, 1.3))
        # zone essuyée : une ellipse floue qui s'agrandit derrière le titre
        mask = Image.new("L", (220, 338), 0)
        if p > 0:
            rx_, ry_ = 30 + 120 * p, 20 + 110 * p
            ImageDraw.Draw(mask).ellipse((110 - rx_, 120 - ry_, 110 + rx_, 120 + ry_), fill=255)
        mask = mask.resize((880, 1350), Image.BILINEAR).filter(ImageFilter.GaussianBlur(60))
        fa = Image.fromarray((np.asarray(R.brume, dtype=np.uint16) * (255 - np.asarray(mask, dtype=np.uint16)) // 255).astype(np.uint8))
        fog = Image.new("RGBA", (880, 1350), (232, 230, 226, 0))
        fog.putalpha(fa.point(lambda v: int(v * 0.5)))
        m = Image.new("L", fog.size, 0)
        ImageDraw.Draw(m).rounded_rectangle((0, 0, 879, 1349), radius=60, fill=255)
        fog.putalpha(Image.fromarray((np.asarray(fog.getchannel("A"), np.uint16) * np.asarray(m) // 255).astype(np.uint8)))
        plate.alpha_composite(fog, (100, 230))
    plate = camera(plate, 1.0 + 0.1 * e_io(prog(lt, 0, 6.5)), W / 2, 820)
    # titre d'accroche
    t18 = mot_t(T, 0, "18")
    tv = mot_t(T, 0, "Voici")
    up = e_io(prog(t, tv, tv + 0.45))
    sc = 1 - 0.3 * up
    cy0 = 690 - 330 * up
    lh = 150 * sc
    for i, (k, tt) in enumerate(((0, s0 + 0.15), (1, s0 + 0.45))):
        p = prog(t, tt, tt + 0.3)
        if p > 0:
            poser(plate, R.hook[k], W / 2, cy0 + i * lh + 40 * (1 - e_out(p)), sc * (0.7 + 0.3 * e_back(p)), 0, cl(p * 2))
    # « À 18 ANS ? »
    ya = cy0 + 2 * lh
    a_im, n_im, q_im = R.hook[2], R.hook[3], R.hook[4]
    tot = (a_im.width + n_im.width + q_im.width - 40) * sc
    x = W / 2 - tot / 2
    pa = prog(t, t18 - 0.25, t18 + 0.05)
    if pa > 0:
        poser(plate, a_im, x + a_im.width * sc / 2, ya, sc, 0, cl(pa * 2))
    p18 = prog(t, t18, t18 + 0.35)
    if p18 > 0:
        s18 = sc * (1.9 - 0.9 * e_back(p18, 2.2))
        shake = 10 * math.sin(lt * 70) * (1 - p18) if p18 < 1 else 0
        cx18 = x + (a_im.width - 20) * sc + n_im.width * sc / 2
        # trait de pinceau sous « 18 ANS »
        pu = e_out(prog(t, t18 + 0.2, t18 + 0.55))
        if pu > 0:
            ul = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            w18 = (n_im.width - 60) * sc
            ImageDraw.Draw(ul).rounded_rectangle((cx18 - w18 / 2, ya + 58 * sc, cx18 - w18 / 2 + w18 * pu, ya + 78 * sc),
                                                 radius=10, fill=OR_VIF + (255,))
            plate.alpha_composite(ul)
        poser(plate, n_im, cx18 + shake, ya, s18, -3 * (1 - p18), cl(p18 * 3))
        poser(plate, q_im, x + (a_im.width + n_im.width - 40) * sc + q_im.width * sc / 2, ya, sc, 0, cl(p18 * 3))
    # puce « 2 étapes »
    pr = prog(t, tv + 0.5, tv + 0.9)
    if pr > 0:
        poser(plate, R.puces["routine"], W / 2, 1050 + 40 * (1 - e_out(pr)), 0.85 + 0.15 * e_back(pr), 0, cl(pr * 2))
        # chevrons animés vers le bas
        ch = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(ch)
        for i in range(3):
            a = 0.35 + 0.65 * (0.5 + 0.5 * math.sin(lt * 7 - i * 1.1))
            y = 1140 + i * 34
            d.line([(W / 2 - 34, y), (W / 2, y + 26), (W / 2 + 34, y)], fill=OR_VIF + (int(255 * a * pr),), width=9, joint="curve")
        plate.alpha_composite(ch)
    return plate


def scene2(T, t):
    s0 = T["starts"][1]
    lt = t - s0
    plate = clip("s2", lt)
    rx, ry = 640, 990
    ang = 16 - 10 * e_io(prog(lt, 0, 9)) + 2 * math.sin(lt * 0.8)
    s = 0.86 + 0.06 * e_io(prog(lt, 0, 9))
    if plate is None:
        plate = R.studio.copy()
        bokeh(plate, lt, -30)
        poser(plate, R.ombre, rx + 130, 1330, 1.1, 0, 0.9)
        pin = e_out(prog(lt, 0, 0.6))
        poser(plate, roller_a(lt), rx + 260 * (1 - pin), ry + 10 * math.sin(lt * 1.3), s, ang, cl(pin * 2))
        plate = camera(plate, 1.04 + 0.05 * e_io(prog(lt, 0, 9)), W / 2 + 40 * math.sin(lt * 0.5), 900)
    titre_etape(plate, t, s0 + 0.05, 1, "DERMA ROLLER")
    # flèche vers la tête du roller
    a = math.radians(ang)
    hx = rx + (-475 * s) * math.sin(a)
    hy = ry + (-475 * s) * math.cos(a)
    tf = mot_t(T, 1, "derma")
    pf = e_out(prog(t, tf, tf + 0.5))
    if pf > 0 and lt < 8.6:
        fleche(plate, [(170, 640), (170, 760), (hx - 300, hy + 40), (hx - 170 * s, hy + 10)], pf)
    # puces de sécurité
    for k, (cle, mot, y) in enumerate((("precaution", "précaution", 1040), ("consignes", "consignes", 1140), ("hygiene", "d'hygiène", 1240))):
        anim_puce(plate, R.puces[cle], 50, y, t, mot_t(T, 1, mot) - 0.05)
    return plate


def scene3(T, t):
    s0 = T["starts"][2]
    lt = t - s0
    plate = clip("s3", lt)
    t_elle = mot_t(T, 2, "Elle") - s0
    if plate is None:
        plate = R.chaud.copy()
        bokeh(plate, lt, 22)
        q = e_io(prog(lt, t_elle - 0.6, t_elle + 0.1))
        bx, by = 540 + (330 - 540) * q, 900 + (960 - 900) * q
        bs = 1.0 + 0.0 * q
        poser(plate, R.ombre, bx + 10, by + 330 * bs, 1.0, 0, 0.8)
        # reflet lumineux qui balaie le verre
        spr = R.bouteille.copy()
        sw = prog(lt, 0.2, 2.2)
        if 0 < sw < 1:
            arr = np.asarray(spr).astype(np.float32)
            hh, ww = arr.shape[:2]
            yy, xx = np.mgrid[0:hh, 0:ww]
            u = (xx + yy * 0.45) / (ww + hh * 0.45)
            band = np.exp(-((u - (sw * 1.4 - 0.2)) / 0.05) ** 2) * 0.55
            arr[..., :3] += (255 - arr[..., :3]) * band[..., None]
            spr = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGBA")
        poser(plate, spr, bx, by, bs)
        # goutte d'huile + ondes
        gx, gy0, gy1 = 640, 470, 1290
        pg = prog(lt, t_elle - 0.2, t_elle + 0.45)
        if 0 < pg < 1:
            gy = gy0 + (gy1 - gy0) * pg ** 2
            poser(plate, R.goutte, gx, gy, 1.0 + 0.2 * pg, 0, cl(pg * 4))
        po = prog(lt, t_elle + 0.45, t_elle + 2.4)
        if po > 0:
            o = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            d = ImageDraw.Draw(o)
            d.ellipse((gx - 70, gy1 - 16, gx + 70, gy1 + 16), fill=(205, 140, 40, int(200 * cl(po * 5))))
            d.ellipse((gx - 40, gy1 - 9, gx - 5, gy1 - 2), fill=(255, 236, 190, int(170 * cl(po * 5))))
            for k in range(3):
                pk = cl(po * 1.4 - k * 0.2)
                if pk > 0:
                    rr = 70 + 170 * e_out(pk)
                    d.ellipse((gx - rr, gy1 - rr * 0.22, gx + rr, gy1 + rr * 0.22), outline=(255, 226, 160, int(160 * (1 - pk))), width=4)
            plate.alpha_composite(o)
        z = 1.5 - 0.42 * e_io(prog(lt, 0, t_elle + 0.1)) + 0.04 * prog(lt, t_elle, 9)
        plate = camera(plate, z, 540 + (440 - 540) * q, 900 + 80 * (1 - q))
    titre_etape(plate, t, s0 + 0.05, 2, "HUILE DE RICIN")
    tp = mot_t(T, 2, "Tu")
    for cle, mot, y in (("nourrir", "nourrir", 760), ("assouplir", "assouplir", 860)):
        t0 = mot_t(T, 2, mot) - 0.05
        img = R.puces[cle]
        if t < tp:
            anim_puce(plate, img, 600, y, t, t0, 1)
        else:
            f = 1 - prog(t, tp, tp + 0.25)
            if f > 0:
                poser(plate, img, 600 + img.width / 2, y, 1, 0, f)
    anim_puce(plate, R.puces["tolere"], 470, 800, t, mot_t(T, 2, "tolère") - 0.05, 1)
    for mot, y in (("ROUTINE", 1040), ("SOIN", 1160)):
        t0 = mot_t(T, 2, mot.lower())  # « routine », « soin »
        p = prog(t, t0, t0 + 0.6)
        if p > 0:
            im = R.mots_soin[mot]
            poser(plate, im, 770, y + 30 * (1 - e_out(p)), 0.62 + 0.04 * e_out(p), 0, 0.92 * e_out(p))
    return plate


def plan_duo(lt, z=1.0, bg=None, entree=True):
    plate = (bg or R.studio).copy()
    bokeh(plate, lt, 12)
    p = e_out(prog(lt, 0, 0.8)) if entree else 1
    bob = 8 * math.sin(lt * 1.6)
    poser(plate, R.ombre, 360, 1300, 0.9, 0, 0.8)
    poser(plate, R.ombre, 720, 1330, 0.9, 0, 0.8)
    poser(plate, R.bouteille, 360 - 420 * (1 - p), 1000 + bob, 0.82)
    poser(plate, roller_a(lt, 0.5), 720 + 420 * (1 - p), 900 - bob, 0.74, 8)
    return camera(plate, z, W / 2, 980)


def scene4(T, t):
    s0 = T["starts"][3]
    lt = t - s0
    cuts = [s0, mot_t(T, 3, "choisir"), mot_t(T, 3, "rester"), mot_t(T, 3, "Et"), mot_t(T, 3, "génétique")]
    k = max(i for i, c in enumerate(cuts) if t >= c - 1e-6) if t >= cuts[0] else 0
    cl_t = t - cuts[k]
    plate = clip("s4" + "abcde"[k], cl_t)
    if plate is None:
        if k == 0:
            plate = camera(R.miroir_jour.copy(), 1.06 + 0.06 * cl_t / 2, W / 2, 800)
        elif k == 1:
            plate = R.chaud.copy()
            poser(plate, R.bouteille, 540, 980 + 10 * math.sin(cl_t * 2), 1.0)
            plate = camera(plate, 1.55 - 0.08 * cl_t, 540, 1000)
        elif k == 2:
            plate = R.studio.copy()
            poser(plate, R.ombre, 540, 1240, 2.0, 0, 0.7)
            poser(plate, roller_a(cl_t, 0.8), 500 + 50 * cl_t, 1130, 0.66, -86)
            plate = camera(plate, 1.12, 540, 1050)
        elif k == 3:
            plate = plan_duo(cl_t, 1.0 + 0.03 * cl_t)
        else:
            plate = camera(R.miroir_jour.copy(), 1.02 + 0.03 * cl_t, W / 2, 900)
    # carte checklist
    pc = e_out(prog(t, s0 + 0.05, s0 + 0.45))
    if pc > 0:
        cw, chh = 820, 420
        card = Image.new("RGBA", (cw, chh), (0, 0, 0, 0))
        d = ImageDraw.Draw(card)
        d.rounded_rectangle((0, 0, cw - 1, chh - 1), radius=40, fill=(255, 252, 246, 238))
        card.alpha_composite(R.check_titre, (56, 34))
        d.line([(60, 118), (cw - 60, 118)], fill=OR + (255,), width=3)
        for i, (mot, img) in enumerate(zip(("prendre", "choisir", "rester"), R.check_items)):
            ti = mot_t(T, 3, mot)
            pi = prog(t, ti - 0.05, ti + 0.3)
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
        poser(plate, card, W / 2, 470 - 60 * (1 - pc), 0.9 + 0.1 * pc, 0, pc)
    ti = mot_t(T, 3, "pousse")
    pi = prog(t, ti - 0.1, ti + 0.3)
    if pi > 0:
        poser(plate, R.info, W / 2, 1180 + 50 * (1 - e_out(pi)), 0.9 + 0.1 * e_back(pi), 0, cl(pi * 2))
    return plate


def scene5(T, t):
    s0 = T["starts"][4]
    lt = t - s0
    fin = T["S5_fin_parole"] - s0
    plate = clip("s5", lt)
    if plate is None:
        plate = plan_duo(lt + 3, 1.0 + 0.1 * e_io(prog(lt, 0, 1.9)), entree=False)
    # 1. assombrissement
    pd = e_io(prog(lt, 1.1, 1.8))
    if pd > 0:
        dark = degrade_v(W, H, [(0, (22, 19, 16)), (0.45, (34, 28, 22)), (1, (10, 9, 8))])
        dark.alpha_composite(halo(W, H, W / 2, 860, 600, 520, (120, 86, 48), 70))
        plate = Image.blend(plate, dark, pd)
    LY = 820
    # 2. ligne lumineuse
    pl = prog(lt, 1.75, 2.35)
    if pl > 0:
        lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(lay)
        x1 = -100 + (W + 200) * e_io(pl)
        x0 = max(-100, x1 - 900) if pl < 1 else 0
        fade = 1 - prog(lt, 2.5, 3.2)
        half = 280
        if pl >= 1:  # la ligne se rétracte en filet doré sous le logo
            r = e_io(prog(lt, 2.35, 3.0))
            x0, x1 = (1 - r) * 0 + r * (W / 2 - half), (1 - r) * W + r * (W / 2 + half)
            fade = 1
        glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(glow).rectangle((x0, LY + 108, x1, LY + 120), fill=(255, 214, 140, int(200 * fade)))
        lay.alpha_composite(glow.filter(ImageFilter.GaussianBlur(14)))
        d.rectangle((x0, LY + 113, x1, LY + 115), fill=(255, 244, 220, int(255 * fade)))
        if pl < 1:
            lay.alpha_composite(halo(W, H, x1, LY + 114, 90, 30, (255, 236, 200), 230))
        plate.alpha_composite(lay)
    # 3. lettres + 4. zoom
    zoom = 1 + 0.06 * e_io(prog(lt, 3.3, 7.5))
    largs = [im.width - 8 for im in R.lettres]
    track = 30
    tot = sum(largs) + track * 4
    logo = Image.new("RGBA", (int(tot + 80), 280), (0, 0, 0, 0))
    x = 40
    vis = False
    for i, im in enumerate(R.lettres):
        p = prog(lt, 2.15 + i * 0.14, 2.75 + i * 0.14)
        if p > 0:
            vis = True
            li = im
            if p < 1:
                li = im.filter(ImageFilter.GaussianBlur(10 * (1 - p)))
            li = fondu(li, e_out(p))
            coller(logo, li, x, 20 + 40 * (1 - e_out(p)))
        x += largs[i] + track
    if vis:
        poser(plate, avec_ombre(logo, 18, 0, 0.5) if lt > 2.9 else logo, W / 2, LY + zoom * 0, zoom)
    # 5. produits de part et d'autre
    pp = e_out(prog(lt, 3.3, 4.1))
    if pp > 0 and plate is not None:
        bob = 6 * math.sin(lt * 1.6)
        poser(plate, R.bouteille, 105 - 300 * (1 - pp), LY + 30 + bob, 0.38 * zoom, 0, pp)
        poser(plate, roller_a(lt, 0.6), W - 112 + 300 * (1 - pp), LY + 40 - bob, 0.34 * zoom, -8, pp)
    # 6. slogan
    for i, im in enumerate(R.slogan):
        p = prog(lt, 4.2 + i * 0.22, 4.7 + i * 0.22)
        if p > 0:
            xs = [W / 2 - 300, W / 2, W / 2 + 300][i]
            poser(plate, im, xs, LY + 210 + 20 * (1 - e_out(p)), 1, 0, e_out(p))
    # appel à l'action
    tc = max(5.0, fin + 0.05)
    p = prog(lt, tc, tc + 0.4)
    if p > 0:
        poser(plate, R.decouvre, W / 2, 1150 + 20 * (1 - e_out(p)), 1, 0, e_out(p))
        pb = prog(lt, tc + 0.2, tc + 0.6)
        pulse = 1 + 0.03 * math.sin((lt - tc) * 6) * cl((lt - tc - 0.6) * 3)
        poser(plate, R.bouton, W / 2, 1290, (0.8 + 0.2 * e_back(pb)) * pulse, 0, cl(pb * 2))
        poser(plate, R.lien, W / 2, 1385, 1, 0, e_out(pb))
        # « clic » : main-curseur stylisée + onde
        pt = (lt - tc - 0.8) % 1.4
        if lt > tc + 0.8:
            o = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            d = ImageDraw.Draw(o)
            cx, cy = W / 2 + 170, 1300
            rr = 20 + 70 * e_out(cl(pt / 0.7))
            d.ellipse((cx - rr, cy - rr, cx + rr, cy + rr), outline=(255, 244, 220, int(220 * (1 - cl(pt / 0.7)))), width=5)
            dy = 30 * (1 - e_out(cl(pt / 0.25)))
            d.polygon([(cx, cy + dy), (cx + 16, cy + 52 + dy), (cx + 26, cy + 38 + dy), (cx + 48, cy + 58 + dy),
                       (cx + 58, cy + 48 + dy), (cx + 36, cy + 28 + dy), (cx + 52, cy + 20 + dy)],
                      fill=BLANC + (255,), outline=NOIR + (255,))
            plate.alpha_composite(o)
        # flèche qui rebondit vers le bas (emplacement du lien / bouton TikTok)
        o = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(o)
        by = 1460 + 18 * abs(math.sin((lt - tc) * 4))
        d.line([(W / 2 - 34, by), (W / 2, by + 30), (W / 2 + 34, by)], fill=OR_VIF + (int(255 * e_out(pb)),), width=10, joint="curve")
        d.line([(W / 2 - 34, by + 34), (W / 2, by + 64), (W / 2 + 34, by + 34)], fill=OR_VIF + (int(150 * e_out(pb)),), width=10, joint="curve")
        plate.alpha_composite(o)
    return plate


SCENES = [scene1, scene2, scene3, scene4, scene5]


def scene_a(T, i, t):
    return SCENES[i](T, t)


def image(T, t):
    st = T["starts"]
    i = max(k for k in range(5) if t >= st[k] - 1e-9)
    TR = 0.16
    frame = None
    # transitions « whip pan » entre scènes (sauf 4 -> 5 : fondu enchaîné)
    for b in range(1, 5):
        if abs(t - st[b]) < TR:
            p = (t - (st[b] - TR)) / (2 * TR)
            a = scene_a(T, b - 1, t).convert("RGB")
            c = scene_a(T, b, t).convert("RGB")
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
                n = 6
                amp = int(90 * math.sin(math.pi * p))
                for j in range(1, n):
                    acc += np.roll(arr, j * amp // n, axis=1)
                frame = Image.fromarray((acc // n).astype(np.uint8)).convert("RGBA")
            break
    if frame is None:
        frame = scene_a(T, i, t)
    sous_titres(frame, T, t)
    arr = np.asarray(frame.convert("RGB"), dtype=np.float32) * R.vignette
    arr = np.clip(arr + R.grain[int(t * FPS) % len(R.grain)], 0, 255).astype(np.uint8)
    # fondu au noir final
    fade = prog(t, T["duree"] - 0.5, T["duree"])
    if fade > 0:
        arr = (arr * (1 - fade)).astype(np.uint8)
    return arr


# --------------------------------------------------------------------------- sortie


def evenements_son(T):
    st = T["starts"]
    s5 = st[4]
    pops = [st[0] + 0.15, st[0] + 0.45, mot_t(T, 0, "18"), mot_t(T, 0, "Voici") + 0.5,
            mot_t(T, 1, "précaution"), mot_t(T, 1, "consignes"), mot_t(T, 1, "d'hygiène"),
            mot_t(T, 2, "nourrir"), mot_t(T, 2, "assouplir"), mot_t(T, 2, "tolère"),
            mot_t(T, 3, "prendre"), mot_t(T, 3, "choisir"), mot_t(T, 3, "rester"), mot_t(T, 3, "pousse"),
            mot_t(T, 2, "Elle") + 0.45]
    return {"whoosh": [st[1], st[2], st[3], mot_t(T, 3, "choisir"), mot_t(T, 3, "rester"), mot_t(T, 3, "Et"),
                       mot_t(T, 3, "génétique")],
            "pop": pops, "riser": [s5 + 1.75], "impact": [s5 + 2.2]}


def ecrire_srt(T):
    def ts(x):
        ms = int(round(x * 1000))
        return f"{ms // 3600000:02}:{ms // 60000 % 60:02}:{ms // 1000 % 60:02},{ms % 1000:03}"
    out = []
    for n, idx in enumerate(T["chunks"]):
        t0 = T["mots"][idx[0]]["t"]
        t1 = T["mots"][idx[-1]]["f"] + 0.35
        if n + 1 < len(T["chunks"]):
            t1 = min(t1, T["mots"][T["chunks"][n + 1][0]]["t"])
        txt = " ".join(("Idrea" if T["mots"][j]["w"].startswith("Idréa") else T["mots"][j]["w"]) + T["mots"][j]["p"] for j in idx)
        out.append(f"{n + 1}\n{ts(t0)} --> {ts(t1)}\n{txt}\n")
    open(os.path.join(BUILD, "idrea_sous-titres.srt"), "w").write("\n".join(out))


def travail(args):
    T, k0, k1, path = args
    enc = subprocess.Popen(["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
                            "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "17",
                            "-pix_fmt", "yuv420p", path], stdin=subprocess.PIPE)
    for k in range(k0, k1):
        enc.stdin.write(image(T, k / FPS).tobytes())
    enc.stdin.close()
    enc.wait()
    return path


def main():
    T = charger_timeline()
    construire()
    if "--apercu" in sys.argv:
        for a in sys.argv[sys.argv.index("--apercu") + 1:]:
            Image.fromarray(image(T, float(a))).save(os.path.join(BUILD, f"apercu_{a}.png"))
        return
    ecrire_srt(T)
    json.dump({"duree": T["duree"], "starts": T["starts"], "sfx": evenements_son(T)},
              open(os.path.join(BUILD, "timeline.json"), "w"), indent=1)
    subprocess.check_call([sys.executable, os.path.join(HERE, "musique.py"), f"{T['duree']:.3f}"])
    n = int(math.ceil(T["duree"] * FPS))
    nw = max(1, min(8, os.cpu_count() or 2))
    bornes = [n * i // nw for i in range(nw + 1)]
    jobs = [(T, bornes[i], bornes[i + 1], os.path.join(BUILD, f"part_{i}.mp4")) for i in range(nw)]
    with mp.get_context("fork").Pool(nw) as pool:
        parts = pool.map(travail, jobs)
    lst = os.path.join(BUILD, "parts.txt")
    open(lst, "w").write("".join(f"file '{p}'\n" for p in parts))
    video = os.path.join(BUILD, "video_muette.mp4")
    subprocess.check_call(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", video])
    # mixage : voix + musique (ducking) + effets, normalisé à -14 LUFS (recommandation TikTok)
    cmd = ["ffmpeg", "-y", "-v", "error", "-i", video, "-i", os.path.join(BUILD, "musique.wav"), "-i", os.path.join(BUILD, "sfx.wav")]
    filt = []
    for i, (f, t0) in enumerate(T["vo"]):
        cmd += ["-i", f]
        ms = int(t0 * 1000)
        filt.append(f"[{i + 3}:a]aresample=44100,aformat=channel_layouts=stereo,adelay={ms}|{ms}[v{i}]")
    nv = len(T["vo"])
    filt.append("".join(f"[v{i}]" for i in range(nv)) + f"amix=inputs={nv}:normalize=0,"
                "highpass=f=90,lowpass=f=12000,equalizer=f=220:t=q:w=1:g=1.5,equalizer=f=3200:t=q:w=1.2:g=2,"
                "aecho=0.85:0.6:14|27:0.10|0.06,acompressor=threshold=0.1:ratio=3:attack=5:release=120,volume=1.4[vo0]")
    filt.append(f"anoisesrc=color=brown:amplitude=0.004:duration={T['duree']:.3f},lowpass=f=900,"
                "aformat=channel_layouts=stereo:sample_rates=44100[room]")
    filt.append("[vo0][room]amix=inputs=2:normalize=0[vo]")
    filt.append("[vo]asplit[voa][vosc]")
    filt.append("[1:a]volume=0.30[mu]")
    filt.append("[mu][vosc]sidechaincompress=threshold=0.02:ratio=8:attack=15:release=350[mud]")
    filt.append("[2:a]volume=0.8[fx]")
    filt.append(f"[voa][mud][fx]amix=inputs=3:normalize=0,atrim=0:{T['duree']:.3f},loudnorm=I=-14:TP=-1.5:LRA=11[a]")
    out = os.path.join(BUILD, "idrea_pub_tiktok.mp4")
    cmd += ["-filter_complex", ";".join(filt), "-map", "0:v", "-map", "[a]", "-c:v", "libx264", "-preset", "slow", "-crf", "20",
            "-maxrate", "12M", "-bufsize", "24M", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k",
            "-ar", "44100", "-movflags", "+faststart", "-shortest", out]
    subprocess.check_call(cmd)
    for p in parts:
        os.remove(p)
    print(f"OK -> {out} ({T['duree']:.1f} s)")


if __name__ == "__main__":
    main()

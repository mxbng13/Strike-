"""Détoure une photo produit sur fond clair -> PNG transparent, bords nets et sans halo blanc.

Usage : python3 detourage.py source.jpg sortie.png [tolérance] [x0,y0,x1,y1 | -] [rognage px, impair] [--trous] [--sombre] [--sol]
  - le fond (et l'ombre portée claire) est retiré par remplissage depuis les bords de l'image ;
  - les pixels de bord sont « décontaminés » (on retire le blanc du fond mélangé à la couleur) ;
  - boîte optionnelle (en fractions de l'image) pour ne garder qu'un objet (ex. sans câble ni brosse).
"""
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter


def detourer(src, dst, tol=34, boite=None, rognage=5, trous=False, sombre=False, sol=False):
    im = Image.open(src).convert("RGB")
    if boite:
        w, h = im.size
        im = im.crop(tuple(int(v * (w if i % 2 == 0 else h)) for i, v in enumerate(boite)))
    arr = np.asarray(im).astype(np.float32)
    bord = np.concatenate([arr[0], arr[-1], arr[:, 0], arr[:, -1]])
    fond = np.median(bord, axis=0)
    # remplissage depuis le pourtour : tout ce qui est relié au bord et proche de la couleur du fond
    marque = im.copy()
    w, h = im.size
    graines = [(x, 0) for x in range(0, w, 24)] + [(x, h - 1) for x in range(0, w, 24)] + \
              [(0, y) for y in range(0, h, 24)] + [(w - 1, y) for y in range(0, h, 24)]
    for xy in graines:
        px = np.asarray(marque.getpixel(xy), np.float32)
        if np.abs(px - fond).max() < tol and tuple(marque.getpixel(xy)) != (255, 0, 255):
            ImageDraw.floodfill(marque, xy, (255, 0, 255), thresh=tol)
    m = np.asarray(marque)
    fond_mask = (m[..., 0] == 255) & (m[..., 1] == 0) & (m[..., 2] == 255)
    if trous:  # fond enfermé dans l'objet (ex. entre la monture et le manche) : pixels très proches du fond
        fond_mask |= np.abs(arr - fond).max(-1) < tol * 0.6
    if sombre:  # produit sombre / doré : on ne garde que les tons foncés ou saturés (supprime reflets et ombres grises)
        mx, mn = arr.max(-1), arr.min(-1)
        sat = (mx - mn) / np.maximum(mx, 1)
        fond_mask |= ~((mx < 175) | (sat > 0.22))
    if sol:  # sol / reflet clair sous le produit : tons clairs et peu saturés dans le bas de l'image
        mx, mn = arr.max(-1), arr.min(-1)
        sat = (mx - mn) / np.maximum(mx, 1)
        bas = np.zeros(mx.shape, bool)
        bas[int(mx.shape[0] * 0.8):] = True
        fond_mask |= bas & (mx > 120) & (sat < 0.15)
    alpha = Image.fromarray(np.where(fond_mask, 0, 255).astype(np.uint8), "L")
    if sombre:  # referme les petits trous (reflets brillants sur la pierre)
        alpha = alpha.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
    # bord net : on rogne d'un pixel puis léger lissage (pas de liseré clair)
    alpha = alpha.filter(ImageFilter.MinFilter(rognage)).filter(ImageFilter.GaussianBlur(1.1))
    a = np.asarray(alpha).astype(np.float32)[..., None] / 255
    # décontamination : couleur = (observée - (1 - a) * fond) / a
    pur = np.where(a > 0.02, (arr - (1 - a) * fond) / np.maximum(a, 0.02), 0)
    out = np.concatenate([np.clip(pur, 0, 255), a * 255], -1).astype(np.uint8)
    res = Image.fromarray(out, "RGBA")
    res = res.crop(res.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox())
    res.save(dst)
    return res


if __name__ == "__main__":
    tol = float(sys.argv[3]) if len(sys.argv) > 3 else 34
    boite = [float(v) for v in sys.argv[4].split(",")] if len(sys.argv) > 4 and sys.argv[4] != "-" else None
    rognage = int(sys.argv[5]) if len(sys.argv) > 5 else 5
    r = detourer(sys.argv[1], sys.argv[2], tol, boite, rognage, "--trous" in sys.argv, "--sombre" in sys.argv, "--sol" in sys.argv)
    print(sys.argv[2], r.size)

"""Mon IA maison, corps humain : diffusion conditionnée par la partie du corps (19 parties), 64x64.

Lancé sans argument (sur Kaggle) : télécharge les données, entraîne pendant BUDGET_H heures, exporte model.onnx.
"""
import io
import json
import math
import os
import subprocess
import sys
import time
import urllib.request
from multiprocessing import Pool

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

OUT = '/kaggle/working' if os.path.isdir('/kaggle/working') else os.getcwd()
DATA = '/kaggle/tmp' if os.path.isdir('/kaggle') else os.path.join(OUT, 'data')
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'
BUDGET_H = float(os.environ.get('BUDGET_H', '6.5'))
PER_CLASS = int(os.environ.get('PER_CLASS', '600'))
NUM_CLASSES = 19
NULL_CLASS = NUM_CLASSES
T = 1000
RES = 64
URL = 'https://huggingface.co/datasets/benjamin-paine/imagenet-1k-64x64/resolve/main/data/train-0000{}-of-00005.parquet'


# Version 2 : calendrier cosinus décalé (log-SNR − 2·ln 2) pour le 64 px. Sans ce décalage, le bruit est trop
# faible aux grandes échelles et le modèle rate les couleurs d'ensemble (teintes saturées de la version 1).
SHIFT = float(os.environ.get('SHIFT', str(-2 * math.log(2))))


def cosine_alphas_cumprod(steps=T, s=0.008, shift=SHIFT):
    x = torch.linspace(0, steps, steps + 1, dtype=torch.float64)
    f = torch.cos(((x / steps) + s) / (1 + s) * math.pi / 2) ** 2
    ac = f / f[0]
    betas = (1 - ac[1:] / ac[:-1]).clamp(max=0.999)
    ac = torch.cumprod(1 - betas, 0).clamp(1e-8, 1 - 1e-8)
    return torch.sigmoid(torch.log(ac / (1 - ac)) + shift).float()


ALPHAS_CUMPROD = cosine_alphas_cumprod()


def timestep_embedding(t, dim):
    half = dim // 2
    freqs = torch.exp(-math.log(10000) * torch.arange(half, dtype=torch.float32, device=t.device) / half)
    args = t.float()[:, None] * freqs[None]
    return torch.cat([torch.cos(args), torch.sin(args)], dim=1)


class ResBlock(nn.Module):
    def __init__(self, cin, cout, emb_dim):
        super().__init__()
        self.norm1 = nn.GroupNorm(32, cin)
        self.conv1 = nn.Conv2d(cin, cout, 3, padding=1)
        self.emb = nn.Linear(emb_dim, cout * 2)
        self.norm2 = nn.GroupNorm(32, cout)
        self.conv2 = nn.Conv2d(cout, cout, 3, padding=1)
        self.skip = nn.Conv2d(cin, cout, 1) if cin != cout else nn.Identity()

    def forward(self, x, emb):
        h = self.conv1(F.silu(self.norm1(x)))
        scale, shift = self.emb(F.silu(emb))[:, :, None, None].chunk(2, dim=1)
        h = self.norm2(h) * (1 + scale) + shift
        h = self.conv2(F.silu(h))
        return h + self.skip(x)


class Attention(nn.Module):
    def __init__(self, c, heads=4):
        super().__init__()
        self.heads = heads
        self.norm = nn.GroupNorm(32, c)
        self.qkv = nn.Conv2d(c, c * 3, 1)
        self.out = nn.Conv2d(c, c, 1)

    def forward(self, x):
        b, c, h, w = x.shape
        q, k, v = self.qkv(self.norm(x)).reshape(b, 3, self.heads, c // self.heads, h * w).unbind(1)
        attn = torch.softmax(torch.einsum('bhdi,bhdj->bhij', q, k) / math.sqrt(c // self.heads), dim=-1)
        y = torch.einsum('bhij,bhdj->bhdi', attn, v).reshape(b, c, h, w)
        return x + self.out(y)


class UNet(nn.Module):
    """64 -> 32 -> 16 -> 8, attention à 16x16 et 8x8."""

    def __init__(self, base=64, mults=(1, 2, 2, 4), emb_dim=256, attn_levels=(2, 3)):
        super().__init__()
        self.base = base
        self.time = nn.Sequential(nn.Linear(base, emb_dim), nn.SiLU(), nn.Linear(emb_dim, emb_dim))
        self.label = nn.Embedding(NUM_CLASSES + 1, emb_dim)
        self.inp = nn.Conv2d(3, base, 3, padding=1)
        chans = [base * m for m in mults]
        self.down = nn.ModuleList()
        c = base
        skips = [c]
        for i, ch in enumerate(chans):
            for _ in range(2):
                self.down.append(ResBlock(c, ch, emb_dim)); c = ch
                if i in attn_levels:
                    self.down.append(Attention(c))
                skips.append(c)
            if i < len(chans) - 1:
                self.down.append(nn.Conv2d(c, c, 3, stride=2, padding=1)); skips.append(c)
        self.mid1 = ResBlock(c, c, emb_dim)
        self.mid_attn = Attention(c)
        self.mid2 = ResBlock(c, c, emb_dim)
        self.up = nn.ModuleList()
        for i, ch in reversed(list(enumerate(chans))):
            for _ in range(3):
                self.up.append(ResBlock(c + skips.pop(), ch, emb_dim)); c = ch
                if i in attn_levels:
                    self.up.append(Attention(c))
            if i > 0:
                self.up.append(nn.Upsample(scale_factor=2, mode='nearest'))
        assert not skips and c == base
        self.out = nn.Sequential(nn.GroupNorm(32, base), nn.SiLU(), nn.Conv2d(base, 3, 3, padding=1))

    def forward(self, x, t, y):
        emb = self.time(timestep_embedding(t, self.base)) + self.label(y)
        h = self.inp(x)
        hs = [h]
        for layer in self.down:
            if isinstance(layer, ResBlock):
                h = layer(h, emb); hs.append(h)
            elif isinstance(layer, Attention):
                h = layer(h); hs[-1] = h
            else:
                h = layer(h); hs.append(h)
        h = self.mid2(self.mid_attn(self.mid1(h, emb)), emb)
        for layer in self.up:
            if isinstance(layer, ResBlock):
                h = layer(torch.cat([h, hs.pop()], dim=1), emb)
            else:
                h = layer(h)
        return self.out(h)


# ——— Données « corps humain » : morceaux carrés 64 px découpés dans trois bases publiques (personnes habillées) ———
CORPS = ['visage', 'cheveux', 'oeil', 'sourcils', 'nez', 'bouche', 'levres', 'oreille', 'cou', 'menton', 'joue', 'front',
         'barbe', 'moustache', 'main', 'personne', 'bras', 'jambe', 'pied']
C = {n: i for i, n in enumerate(CORPS)}
MAX_PER_CLASS = int(os.environ.get('MAX_PER_CLASS', '8000'))
CELEBA_IMAGES = int(os.environ.get('CELEBA_IMAGES', '14000'))
HF = 'https://huggingface.co/datasets/'


def fetch(url, name):
    os.makedirs(DATA, exist_ok=True)
    path = os.path.join(DATA, name)
    if not os.path.exists(path):
        print('téléchargement', name, flush=True)
        urllib.request.urlretrieve(url, path)
    return path


def square_crop(im, box, margin=1.3, min_side=16):
    """Découpe un carré centré sur la boîte (x0, y0, x1, y1), décalé pour rester dans l'image si possible, réduit à 64 px."""
    from PIL import Image
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    if min(w, h) < min_side:
        return None
    side = max(w, h) * margin
    side = min(side, max(im.size))
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    left = min(max(cx - side / 2, 0), max(im.size[0] - side, 0))
    top = min(max(cy - side / 2, 0), max(im.size[1] - side, 0))
    crop = im.crop((int(left), int(top), int(left + side), int(top + side)))
    return np.asarray(crop.convert('RGB').resize((RES, RES), Image.BICUBIC), dtype=np.uint8)


def mask_box(mask):
    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        return None
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


_zip = None
def celeba_one(args):
    """Un visage CelebAMask-HQ -> morceaux (classe, image 64 px)."""
    import zipfile
    from PIL import Image
    global _zip
    idx, names, attrs = args
    if _zip is None:
        _zip = zipfile.ZipFile(os.path.join(DATA, 'celebamask.zip'))
    out = []
    try:
        im = Image.open(io.BytesIO(_zip.read(names['img'][idx]))).convert('RGB')
        s = im.size[0] / 512  # les masques font 512 px
        def part(p):
            key = (idx, p)
            if key not in names['mask']:
                return None
            m = np.asarray(Image.open(io.BytesIO(_zip.read(names['mask'][key]))).convert('L')) > 127
            b = mask_box(m)
            return None if b is None else tuple(int(v * s) for v in b)
        def add(cls, box, margin=1.3):
            if box is not None:
                c = square_crop(im, box, margin)
                if c is not None:
                    out.append((C[cls], c))
        skin = part('skin')
        out.append((C['visage'], np.asarray(im.resize((RES, RES), Image.BICUBIC), dtype=np.uint8)))
        hair = part('hair')
        if hair:  # un carré pris en haut de la chevelure, sinon on retrouve tout le visage
            side = (hair[2] - hair[0]) * 0.45
            cx = (hair[0] + hair[2]) / 2
            add('cheveux', (int(cx - side / 2), hair[1], int(cx + side / 2), int(hair[1] + side)), 1.0)
        for p in ('l_eye', 'r_eye'):
            add('oeil', part(p), 2.4)
        for p in ('l_brow', 'r_brow'):
            add('sourcils', part(p), 1.6)
        add('nez', part('nose'), 1.15)
        mouth = [b for b in (part('mouth'), part('u_lip'), part('l_lip')) if b]
        if mouth:
            mb = (min(b[0] for b in mouth), min(b[1] for b in mouth), max(b[2] for b in mouth), max(b[3] for b in mouth))
            add('bouche', mb, 1.8)
            add('levres', mb, 1.25)
            if skin:
                add('menton', (mb[0], mb[3], mb[2], skin[3]), 1.5)
                if attrs.get('No_Beard') == -1:
                    add('barbe', (skin[0], mb[1], skin[2], skin[3]), 1.1)
                if attrs.get('Mustache') == 1:
                    nose = part('nose')
                    if nose:
                        add('moustache', (mb[0], nose[3] - (mb[1] - nose[3]), mb[2], mb[1] + (mb[3] - mb[1]) // 2), 1.4)
        for p in ('l_ear', 'r_ear'):
            add('oreille', part(p), 1.6)
        add('cou', part('neck'), 1.2)
        brows = [b for b in (part('l_brow'), part('r_brow')) if b]
        if skin and brows:
            top = min(b[1] for b in brows)
            add('front', (skin[0], skin[1], skin[2], top), 1.0)
        eyes = [b for b in (part('l_eye'), part('r_eye')) if b]
        if skin and eyes and mouth:
            e = eyes[0]
            w = (skin[2] - skin[0]) // 4
            x = skin[0] if e[0] < (skin[0] + skin[2]) / 2 else skin[2] - w
            add('joue', (x, e[3], x + w, mouth[0][1]), 1.3)
    except Exception as err:
        print('celeba', idx, err, flush=True)
    return out


def atr_one(args):
    """Une photo ATR (personne en pied) -> bras, jambes, pieds, cheveux, personne."""
    from PIL import Image
    img_bytes, mask_bytes = args
    out = []
    try:
        im = Image.open(io.BytesIO(img_bytes)).convert('RGB')
        m = np.asarray(Image.open(io.BytesIO(mask_bytes)))
        if m.ndim == 3:
            m = m[..., 0]
        def add(cls, labels, margin=1.2):
            for lab in labels:
                b = mask_box(m == lab)
                if b is not None:
                    c = square_crop(im, b, margin)
                    if c is not None:
                        out.append((C[cls], c))
        add('bras', (14, 15)); add('jambe', (12, 13), 1.1); add('pied', (9, 10), 1.8)
        body = mask_box(m > 0)
        if body is not None:
            c = square_crop(im, body, 1.05)
            if c is not None:
                out.append((C['personne'], c))
    except Exception as err:
        print('atr', err, flush=True)
    return out


def parts_one(args):
    """Une photo Human-Parts -> mains (et personnes)."""
    from PIL import Image
    img_bytes, boxes, cats = args
    out = []
    try:
        im = Image.open(io.BytesIO(img_bytes)).convert('RGB')
        for (x, y, w, h), cat in zip(boxes, cats):
            if cat == 2:
                c = square_crop(im, (x, y, x + w, y + h), 1.5, min_side=24)
                if c is not None:
                    out.append((C['main'], c))
            elif cat == 0 and h > 120:
                c = square_crop(im, (x, y, x + w, y + h), 1.05)
                if c is not None:
                    out.append((C['personne'], c))
    except Exception as err:
        print('parts', err, flush=True)
    return out


def load_imagenet():  # même nom que la version ImageNet pour réutiliser train()
    import zipfile
    import pyarrow.parquet as pq
    counts = np.zeros(NUM_CLASSES, dtype=np.int64)
    xs, ys = [], []
    def collect(results):
        for res in results:
            for cls, crop in res:
                if counts[cls] < MAX_PER_CLASS:
                    counts[cls] += 1; xs.append(crop); ys.append(cls)

    # 1) Visages CelebAMask-HQ
    zpath = fetch(HF + 'liusq/CelebAMask-HQ/resolve/main/CelebAMask-HQ.zip', 'celebamask.zip')
    z = zipfile.ZipFile(zpath)
    names = {'img': {}, 'mask': {}}
    attr_name = None
    for n in z.namelist():
        base = os.path.basename(n)
        if '/CelebA-HQ-img/' in n and base.endswith('.jpg'):
            names['img'][int(base[:-4])] = n
        elif '/CelebAMask-HQ-mask-anno/' in n and base.endswith('.png'):
            i, p = base[:-4].split('_', 1)
            names['mask'][(int(i), p)] = n
        elif base == 'CelebAMask-HQ-attribute-anno.txt':
            attr_name = n
    attrs = {}
    if attr_name:
        lines = z.read(attr_name).decode().splitlines()
        keys = lines[1].split()
        for line in lines[2:]:
            f = line.split()
            attrs[int(f[0].split('.')[0])] = dict(zip(keys, map(int, f[1:])))
    z.close()
    print('CelebA : images', len(names['img']), 'masques', len(names['mask']), flush=True)
    ids = sorted(names['img'])[:CELEBA_IMAGES]
    with Pool(os.cpu_count()) as pool:
        collect(pool.imap_unordered(celeba_one, ((i, names, attrs.get(i, {})) for i in ids), chunksize=64))
    os.remove(zpath)
    print('après CelebA', dict(zip(CORPS, counts.tolist())), flush=True)

    # 2) Personnes en pied ATR
    for k, f in enumerate(['data/train-00000-of-00002-f3a663f7140ee7fd.parquet', 'data/train-00001-of-00002-74610e243c32d5d6.parquet']):
        p = fetch(HF + 'mattmdjaga/human_parsing_dataset/resolve/main/' + f, f'atr{k}.parquet')
        t = pq.read_table(p)
        rows = zip(t.column('image').to_pylist(), t.column('mask').to_pylist())
        with Pool(os.cpu_count()) as pool:
            collect(pool.imap_unordered(atr_one, ((a['bytes'], b['bytes']) for a, b in rows), chunksize=64))
        del t; os.remove(p)
    print('après ATR', dict(zip(CORPS, counts.tolist())), flush=True)

    # 3) Mains Human-Parts
    for k in range(5):
        p = fetch(HF + f'finedet/humanparts/resolve/main/data/train-0000{k}-of-00005.parquet', f'parts{k}.parquet')
        t = pq.read_table(p)
        objs = t.column('objects').to_pylist()
        imgs = t.column('image').to_pylist()
        with Pool(os.cpu_count()) as pool:
            collect(pool.imap_unordered(parts_one, ((im['bytes'], o['bbox'], o['category']) for im, o in zip(imgs, objs)), chunksize=32))
        del t, objs, imgs; os.remove(p)
    print('final', dict(zip(CORPS, counts.tolist())), flush=True)
    return np.stack(xs), np.array(ys, dtype=np.int64)


@torch.no_grad()
def ddim_sample(model, labels, steps=50, guidance=3.0, seed=0):
    g = torch.Generator().manual_seed(seed)
    dev = next(model.parameters()).device
    n = len(labels)
    x = torch.randn(n, 3, RES, RES, generator=g).to(dev)
    ts = torch.linspace(T - 1, 0, steps).long()
    y = torch.tensor(labels, device=dev)
    y_null = torch.full_like(y, NULL_CLASS)
    ac = ALPHAS_CUMPROD.to(dev)
    for i, t in enumerate(ts):
        tt = torch.full((n,), int(t), device=dev)
        eps_c, eps_u = model(torch.cat([x, x]), torch.cat([tt, tt]), torch.cat([y, y_null])).float().chunk(2)
        eps = eps_u + guidance * (eps_c - eps_u)
        a = ac[t]
        a_prev = ac[ts[i + 1]] if i + 1 < steps else torch.tensor(1.0, device=dev)
        x0 = ((x - (1 - a).sqrt() * eps) / a.sqrt()).clamp(-1, 1)
        x = a_prev.sqrt() * x0 + (1 - a_prev).sqrt() * eps
    return x


def save_grid(imgs, path, cols=8):
    from PIL import Image
    imgs = ((imgs.clamp(-1, 1) + 1) * 127.5).round().byte().permute(0, 2, 3, 1).cpu().numpy()
    rows = math.ceil(len(imgs) / cols)
    grid = np.zeros((rows * (RES + 2), cols * (RES + 2), 3), dtype=np.uint8) + 255
    for i, im in enumerate(imgs):
        r, c = divmod(i, cols)
        grid[r * (RES + 2) + 1:r * (RES + 2) + 1 + RES, c * (RES + 2) + 1:c * (RES + 2) + 1 + RES] = im
    Image.fromarray(grid).resize((grid.shape[1] * 2, grid.shape[0] * 2), Image.NEAREST).save(path)


PREVIEW = [i for i in range(19)] + [0, 2, 5, 14, 15, 16, 17, 18, 1, 4, 7, 12, 13]


def train():
    x_np, y_np = load_imagenet()
    print('images :', len(x_np), flush=True)
    x_all = torch.from_numpy(x_np)
    y_all = torch.from_numpy(y_np)
    model = UNet().to(DEVICE)
    print('paramètres (M) :', sum(p.numel() for p in model.parameters()) / 1e6, flush=True)
    ema = UNet().to(DEVICE); ema.load_state_dict(model.state_dict()); ema.requires_grad_(False)
    opt = torch.optim.AdamW(model.parameters(), lr=2e-4, weight_decay=0.0)
    scaler = torch.amp.GradScaler('cuda', enabled=DEVICE == 'cuda')
    ac = ALPHAS_CUMPROD.to(DEVICE)
    batch = int(os.environ.get('BATCH', '128'))
    t0 = time.time(); step = 0; losses = []
    while time.time() - t0 < BUDGET_H * 3600:
        idx = torch.randint(0, len(x_all), (batch,))
        x0 = x_all[idx].to(DEVICE, non_blocking=True).permute(0, 3, 1, 2).float() / 127.5 - 1
        yb = y_all[idx].to(DEVICE)
        flip = torch.rand(batch, device=DEVICE) < 0.5
        x0 = torch.where(flip[:, None, None, None], x0.flip(-1), x0)
        yb = torch.where(torch.rand(batch, device=DEVICE) < 0.1, torch.full_like(yb, NULL_CLASS), yb)
        t = torch.randint(0, T, (batch,), device=DEVICE)
        a = ac[t][:, None, None, None]
        noise = torch.randn_like(x0)
        xt = a.sqrt() * x0 + (1 - a).sqrt() * noise
        with torch.autocast(device_type='cuda', dtype=torch.float16, enabled=DEVICE == 'cuda'):
            loss = F.mse_loss(model(xt, t, yb).float(), noise)
        opt.zero_grad(set_to_none=True)
        scaler.scale(loss).backward()
        scaler.unscale_(opt)
        nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        scaler.step(opt); scaler.update()
        with torch.no_grad():
            decay = min(0.9995, (1 + step) / (10 + step))
            for pe, pm in zip(ema.parameters(), model.parameters()):
                pe.mul_(decay).add_(pm, alpha=1 - decay)
        step += 1; losses.append(loss.item())
        if step % 500 == 0:
            print(f'pas {step} perte {np.mean(losses[-500:]):.4f} {(time.time() - t0) / step:.3f}s/pas', flush=True)
        if step % 10000 == 0:
            torch.save({'ema': ema.state_dict(), 'step': step}, os.path.join(OUT, 'ema.pt'))
            save_grid(ddim_sample(ema, PREVIEW, steps=30), os.path.join(OUT, f'progress_{step}.png'))
    torch.save({'ema': ema.state_dict(), 'step': step}, os.path.join(OUT, 'ema.pt'))
    save_grid(ddim_sample(ema, PREVIEW, steps=50), os.path.join(OUT, 'final.png'))
    print('fin, pas :', step, flush=True)
    return ema


def export(ema):
    subprocess.run([sys.executable, '-m', 'pip', 'install', '-q', 'onnx', 'onnxscript'], check=False)
    model = ema.float().cpu().eval()
    x = torch.randn(2, 3, RES, RES)
    torch.onnx.export(model, (x, torch.tensor([500.0, 500.0]), torch.tensor([3, NULL_CLASS])), os.path.join(OUT, 'corps64.onnx'),
                      input_names=['x', 't', 'y'], output_names=['eps'],
                      dynamic_axes={'x': {0: 'n'}, 't': {0: 'n'}, 'y': {0: 'n'}, 'eps': {0: 'n'}}, opset_version=17, dynamo=False)
    print('exporté', flush=True)


if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == 'bench':
        m = UNet()
        print('paramètres (M) :', sum(p.numel() for p in m.parameters()) / 1e6)
        x = torch.randn(2, 3, RES, RES)
        t0 = time.time()
        with torch.no_grad():
            for _ in range(3):
                m(x, torch.tensor([500, 500]), torch.tensor([1, 1000]))
        print('secondes par passe (2 images, CPU) :', (time.time() - t0) / 3)
    else:
        export(train())

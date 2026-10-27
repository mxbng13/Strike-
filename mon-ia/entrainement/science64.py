"""Mon IA maison, science : diffusion conditionnée par le sujet scientifique, 64x64.

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
BUDGET_H = float(os.environ.get('BUDGET_H', '4.5'))
PER_CLASS = int(os.environ.get('PER_CLASS', '600'))
NUM_CLASSES = 8
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


# ——— Données « science » : jeux publics (Kaggle + Hugging Face), une classe par sujet ———
SCIENCE = ['radio du thorax', 'radio du thorax (pneumonie)', 'irm du cerveau', 'irm du cerveau (tumeur)',
           'cellules sanguines', 'tissu au microscope', 'galaxie', 'galaxie spirale']
MAX_PER_CLASS = int(os.environ.get('MAX_PER_CLASS', '6000'))
HF = 'https://huggingface.co/datasets/'


def fetch(url, name):
    os.makedirs(DATA, exist_ok=True)
    path = os.path.join(DATA, name)
    if not os.path.exists(path):
        print('téléchargement', name, flush=True)
        urllib.request.urlretrieve(url, path)
    return path


def square64(data_or_path):
    from PIL import Image
    try:
        im = Image.open(io.BytesIO(data_or_path) if isinstance(data_or_path, (bytes, bytearray)) else data_or_path).convert('RGB')
    except Exception:
        return None
    w, h = im.size
    s = min(w, h)
    im = im.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s)).resize((RES, RES), Image.BICUBIC)
    return np.asarray(im, dtype=np.uint8)


def files_in(slug, include=None, exclude=None):
    import glob
    out = []
    for p in glob.glob(f'/kaggle/input/{slug}/**/*', recursive=True):
        if not p.lower().endswith(('.jpg', '.jpeg', '.png', '.tif', '.tiff', '.bmp')):
            continue
        low = p.lower()
        if '__macosx' in low or '/._' in low:
            continue
        if include and not any(k in low for k in include):
            continue
        if exclude and any(k in low for k in exclude):
            continue
        out.append(p)
    return out


def load_imagenet():  # même nom que la version ImageNet pour réutiliser train()
    import random
    random.seed(0)
    sources = {
        0: files_in('chest-xray-pneumonia', include=['/normal/']),
        1: files_in('chest-xray-pneumonia', include=['/pneumonia/']),
        2: files_in('brain-tumor-mri-dataset', include=['notumor']),
        3: files_in('brain-tumor-mri-dataset', exclude=['notumor']),
        4: files_in('blood-cells'),
        5: files_in('colorectal-histology-mnist', exclude=['_64_', 'hmnist']),
    }
    xs, ys = [], []
    for cls, paths in sources.items():
        random.shuffle(paths)
        with Pool(os.cpu_count()) as pool:
            imgs = [im for im in pool.map(square64, paths[:MAX_PER_CLASS], chunksize=64) if im is not None]
        print(SCIENCE[cls], len(paths), 'fichiers ->', len(imgs), 'images', flush=True)
        xs += imgs; ys += [cls] * len(imgs)
    # Galaxies : Galaxy10 DECals (Hugging Face), classes 5-7 = spirales, le reste = galaxies en général.
    import pyarrow.parquet as pq
    gal = {6: 0, 7: 0}
    try:
        api = json.load(urllib.request.urlopen('https://huggingface.co/api/datasets/matthieulel/galaxy10_decals'))
        shards = [s['rfilename'] for s in api['siblings'] if s['rfilename'].startswith('data/train-')]
    except Exception as err:
        print('liste des galaxies indisponible :', err, flush=True); shards = []
    for k, shard in enumerate(shards):
        try:
            p = fetch(HF + 'matthieulel/galaxy10_decals/resolve/main/' + shard, f'gal{k}.parquet')
        except Exception as err:
            print('galaxies indisponibles :', err, flush=True); break
        t = pq.read_table(p)
        for row in t.to_pylist():
            cls = 7 if row.get('label') in (5, 6, 7) else 6
            if gal[cls] >= MAX_PER_CLASS:
                continue
            im = square64(row['image']['bytes'])
            if im is not None:
                xs.append(im); ys.append(cls); gal[cls] += 1
        os.remove(p)
    print('galaxies', gal, flush=True)
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


PREVIEW = [i for i in range(8)] * 4


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
    torch.onnx.export(model, (x, torch.tensor([500.0, 500.0]), torch.tensor([3, NULL_CLASS])), os.path.join(OUT, 'science64.onnx'),
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

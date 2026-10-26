"""Agrandisseur maison x4 : apprend à transformer une image 64 px en 256 px (et s'applique ensuite sur n'importe quelle taille).

Réseau compact (style « SRVGG ») : rapide sur téléphone. Entraîné de zéro sur des morceaux de photos ImageNet 256x256.
Lancé sans argument (sur Kaggle) : télécharge les données, entraîne BUDGET_H heures, exporte agrandisseur.onnx.
"""
import io
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
SHARDS = int(os.environ.get('SHARDS', '5'))
CROP = 128   # morceau haute définition ; la version basse définition fait 32 px
SCALE = 4
URL = 'https://huggingface.co/datasets/benjamin-paine/imagenet-1k-256x256/resolve/main/data/train-{:05d}-of-00040.parquet'


class Agrandisseur(nn.Module):
    def __init__(self, feats=64, convs=16):
        super().__init__()
        layers = [nn.Conv2d(3, feats, 3, padding=1), nn.PReLU(feats)]
        for _ in range(convs):
            layers += [nn.Conv2d(feats, feats, 3, padding=1), nn.PReLU(feats)]
        layers += [nn.Conv2d(feats, 3 * SCALE * SCALE, 3, padding=1), nn.PixelShuffle(SCALE)]
        self.body = nn.Sequential(*layers)

    def forward(self, x):  # x dans [0, 1]
        base = F.interpolate(x, scale_factor=SCALE, mode='bilinear', align_corners=False)
        return base + self.body(x)


def crops(args):
    """Décode une image 256 px et en tire 1 morceau 128 px au hasard."""
    from PIL import Image
    data, seed = args
    rng = np.random.default_rng(seed)
    im = np.asarray(Image.open(io.BytesIO(data)).convert('RGB'), dtype=np.uint8)
    h, w, _ = im.shape
    out = []
    y = rng.integers(0, h - CROP + 1); x = rng.integers(0, w - CROP + 1)
    out.append(im[y:y + CROP, x:x + CROP])
    return out


def load_patches():
    import pyarrow.parquet as pq
    os.makedirs(DATA, exist_ok=True)
    patches = []
    for shard in range(SHARDS):
        k = shard * (40 // SHARDS)  # morceaux répartis sur tous les sujets
        path = os.path.join(DATA, f'hr{k}.parquet')
        print('téléchargement', k, flush=True)
        urllib.request.urlretrieve(URL.format(k), path)
        table = pq.read_table(path, columns=['image'])
        images = table.column('image').to_pylist()
        with Pool(os.cpu_count()) as pool:
            for pair in pool.imap(crops, ((r['bytes'], i + 100000 * shard) for i, r in enumerate(images)), chunksize=256):
                patches.extend(pair)
        del table, images
        os.remove(path)
        print('morceaux :', len(patches), flush=True)
    return np.stack(patches)


def degrade(hr):
    """Comme l'image produite par le générateur : réduite en bicubique, parfois un peu floue ou bruitée."""
    lr = F.interpolate(hr, scale_factor=1 / SCALE, mode='bicubic', align_corners=False, antialias=True)
    noise = torch.randn_like(lr) * (torch.rand(lr.shape[0], 1, 1, 1, device=lr.device) * 0.02)
    return (lr + noise).clamp(0, 1)


def fft_loss(a, b):
    return (torch.fft.rfft2(a.float()).abs() - torch.fft.rfft2(b.float()).abs()).abs().mean()


def train():
    hr_all = torch.from_numpy(load_patches())  # N, 128, 128, 3 uint8
    print('morceaux HD :', len(hr_all), flush=True)
    model = Agrandisseur().to(DEVICE)
    print('paramètres (M) :', sum(p.numel() for p in model.parameters()) / 1e6, flush=True)
    opt = torch.optim.AdamW(model.parameters(), lr=4e-4, weight_decay=0)
    scaler = torch.amp.GradScaler('cuda', enabled=DEVICE == 'cuda')
    batch = 32
    t0 = time.time(); step = 0; losses = []
    total_steps_guess = int(BUDGET_H * 3600 / 0.06)
    while time.time() - t0 < BUDGET_H * 3600:
        idx = torch.randint(0, len(hr_all), (batch,))
        hr = hr_all[idx].to(DEVICE, non_blocking=True).permute(0, 3, 1, 2).float() / 255
        if torch.rand(1).item() < 0.5:
            hr = hr.flip(-1)
        lr = degrade(hr)
        with torch.autocast(device_type='cuda', dtype=torch.float16, enabled=DEVICE == 'cuda'):
            sr = model(lr)
        loss = F.l1_loss(sr.float(), hr) + 0.05 * fft_loss(sr, hr)
        opt.zero_grad(set_to_none=True)
        scaler.scale(loss).backward()
        scaler.step(opt); scaler.update()
        for g in opt.param_groups:  # baisse progressive du pas d'apprentissage
            g['lr'] = 4e-4 * 0.5 * (1 + math.cos(math.pi * min(1.0, step / total_steps_guess)))
        step += 1; losses.append(loss.item())
        if step % 1000 == 0:
            print(f'pas {step} perte {np.mean(losses[-1000:]):.4f} {(time.time() - t0) / step:.3f}s/pas', flush=True)
        if step % 20000 == 0:
            torch.save(model.state_dict(), os.path.join(OUT, 'agrandisseur.pt'))
    torch.save(model.state_dict(), os.path.join(OUT, 'agrandisseur.pt'))
    print('fin, pas :', step, flush=True)
    return model


def export(model):
    subprocess.run([sys.executable, '-m', 'pip', 'install', '-q', 'onnx', 'onnxscript'], check=False)
    model = model.float().cpu().eval()
    torch.onnx.export(model, (torch.rand(1, 3, 64, 64),), os.path.join(OUT, 'agrandisseur.onnx'), input_names=['x'], output_names=['y'],
                      dynamic_axes={'x': {0: 'n', 2: 'h', 3: 'w'}, 'y': {0: 'n', 2: 'H', 3: 'W'}}, opset_version=17, dynamo=False)
    print('exporté', flush=True)


if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == 'bench':
        m = Agrandisseur()
        print('paramètres (M) :', sum(p.numel() for p in m.parameters()) / 1e6)
        from torch.utils.flop_counter import FlopCounterMode
        for s in (64, 256):
            with FlopCounterMode(display=False) as fc:
                m(torch.rand(1, 3, s, s))
            print(f'{s} -> {s * 4} :', round(fc.get_total_flops() / 1e9, 1), 'GFLOP')
    else:
        export(train())

"""Petit modèle de diffusion conditionné par la classe, entraîné de zéro sur CIFAR-10 (32x32).

Usage :
  python diffusion.py bench            # mesure la vitesse d'un pas d'entraînement
  python diffusion.py train STEPS      # entraîne (reprend le dernier checkpoint s'il existe)
  python diffusion.py sample           # grille d'exemples -> samples.png
  python diffusion.py export           # exporte le modèle EMA en ONNX -> model.onnx
"""
import copy
import math
import os
import pickle
import sys
import time

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

HERE = os.path.dirname(os.path.abspath(__file__))
CKPT = os.path.join(HERE, 'ckpt.pt')
CLASSES = ['avion', 'voiture', 'oiseau', 'chat', 'cerf', 'chien', 'grenouille', 'cheval', 'bateau', 'camion']
NULL_CLASS = len(CLASSES)  # classe « vide » pour le guidage sans classifieur
T = 1000
torch.set_num_threads(4)


def cosine_alphas_cumprod(steps=T, s=0.008):
    x = torch.linspace(0, steps, steps + 1, dtype=torch.float64)
    f = torch.cos(((x / steps) + s) / (1 + s) * math.pi / 2) ** 2
    ac = f / f[0]
    betas = (1 - ac[1:] / ac[:-1]).clamp(max=0.999)
    return torch.cumprod(1 - betas, 0).float()


ALPHAS_CUMPROD = cosine_alphas_cumprod()


def timestep_embedding(t, dim):
    half = dim // 2
    freqs = torch.exp(-math.log(10000) * torch.arange(half, dtype=torch.float32, device=t.device) / half)
    args = t.float()[:, None] * freqs[None]
    return torch.cat([torch.cos(args), torch.sin(args)], dim=1)


class ResBlock(nn.Module):
    def __init__(self, cin, cout, emb_dim):
        super().__init__()
        self.norm1 = nn.GroupNorm(8, cin)
        self.conv1 = nn.Conv2d(cin, cout, 3, padding=1)
        self.emb = nn.Linear(emb_dim, cout * 2)
        self.norm2 = nn.GroupNorm(8, cout)
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
        self.norm = nn.GroupNorm(8, c)
        self.qkv = nn.Conv2d(c, c * 3, 1)
        self.out = nn.Conv2d(c, c, 1)

    def forward(self, x):
        b, c, h, w = x.shape
        q, k, v = self.qkv(self.norm(x)).reshape(b, 3, self.heads, c // self.heads, h * w).unbind(1)
        attn = torch.softmax(torch.einsum('bhdi,bhdj->bhij', q, k) / math.sqrt(c // self.heads), dim=-1)
        y = torch.einsum('bhij,bhdj->bhdi', attn, v).reshape(b, c, h, w)
        return x + self.out(y)


class UNet(nn.Module):
    def __init__(self, base=32, mults=(1, 2, 2), emb_dim=128):
        super().__init__()
        self.base = base
        self.time = nn.Sequential(nn.Linear(base, emb_dim), nn.SiLU(), nn.Linear(emb_dim, emb_dim))
        self.label = nn.Embedding(len(CLASSES) + 1, emb_dim)
        self.inp = nn.Conv2d(3, base, 3, padding=1)
        chans = [base * m for m in mults]
        self.down = nn.ModuleList()
        c = base
        skips = [c]
        for i, ch in enumerate(chans):
            self.down.append(ResBlock(c, ch, emb_dim)); c = ch; skips.append(c)
            if i < len(chans) - 1:
                self.down.append(nn.Conv2d(c, c, 3, stride=2, padding=1)); skips.append(c)
        self.mid1 = ResBlock(c, c, emb_dim)
        self.mid_attn = Attention(c)
        self.mid2 = ResBlock(c, c, emb_dim)
        self.up = nn.ModuleList()
        for i, ch in reversed(list(enumerate(chans))):
            for _ in range(2):
                self.up.append(ResBlock(c + skips.pop(), ch, emb_dim)); c = ch
            if i > 0:
                self.up.append(nn.Upsample(scale_factor=2, mode='nearest'))
        assert not skips and c == base
        self.out = nn.Sequential(nn.GroupNorm(8, base), nn.SiLU(), nn.Conv2d(base, 3, 3, padding=1))

    def forward(self, x, t, y):
        emb = self.time(timestep_embedding(t, self.base)) + self.label(y)
        h = self.inp(x)
        hs = [h]
        for layer in self.down:
            h = layer(h, emb) if isinstance(layer, ResBlock) else layer(h)
            hs.append(h)
        h = self.mid2(self.mid_attn(self.mid1(h, emb)), emb)
        for layer in self.up:
            if isinstance(layer, ResBlock):
                h = layer(torch.cat([h, hs.pop()], dim=1), emb)
            else:
                h = layer(h)
        return self.out(h)


def load_cifar():
    xs, ys = [], []
    for i in range(1, 6):
        with open(os.path.join(HERE, 'data', 'cifar-10-batches-py', f'data_batch_{i}'), 'rb') as f:
            d = pickle.load(f, encoding='bytes')
        xs.append(d[b'data']); ys.extend(d[b'labels'])
    x = np.concatenate(xs).reshape(-1, 3, 32, 32).astype(np.float32) / 127.5 - 1
    return torch.from_numpy(x), torch.tensor(ys, dtype=torch.long)


def new_state():
    model = UNet()
    return {'model': model, 'ema': copy.deepcopy(model), 'opt': torch.optim.AdamW(model.parameters(), lr=2e-4, weight_decay=0.0), 'step': 0}


def load_state():
    st = new_state()
    if os.path.exists(CKPT):
        ck = torch.load(CKPT, map_location='cpu')
        st['model'].load_state_dict(ck['model']); st['ema'].load_state_dict(ck['ema'])
        st['opt'].load_state_dict(ck['opt']); st['step'] = ck['step']
    return st


def save_state(st):
    tmp = CKPT + '.tmp'
    torch.save({'model': st['model'].state_dict(), 'ema': st['ema'].state_dict(), 'opt': st['opt'].state_dict(), 'step': st['step']}, tmp)
    os.replace(tmp, CKPT)


def train_step(st, x, y, batch=64):
    model, opt = st['model'], st['opt']
    idx = torch.randint(0, len(x), (batch,))
    x0, yb = x[idx], y[idx].clone()
    flip = torch.rand(batch) < 0.5
    x0[flip] = x0[flip].flip(-1)
    yb[torch.rand(batch) < 0.1] = NULL_CLASS  # apprend aussi sans classe, pour le guidage
    t = torch.randint(0, T, (batch,))
    a = ALPHAS_CUMPROD[t][:, None, None, None]
    noise = torch.randn_like(x0)
    xt = a.sqrt() * x0 + (1 - a).sqrt() * noise
    loss = F.mse_loss(model(xt, t, yb), noise)
    opt.zero_grad(set_to_none=True)
    loss.backward()
    nn.utils.clip_grad_norm_(model.parameters(), 1.0)
    opt.step()
    with torch.no_grad():
        decay = min(0.999, (1 + st['step']) / (10 + st['step']))
        for pe, pm in zip(st['ema'].parameters(), model.parameters()):
            pe.mul_(decay).add_(pm, alpha=1 - decay)
    st['step'] += 1
    return loss.item()


@torch.no_grad()
def ddim_sample(model, labels, steps=50, guidance=3.0, seed=0):
    g = torch.Generator().manual_seed(seed)
    n = len(labels)
    x = torch.randn(n, 3, 32, 32, generator=g)
    ts = torch.linspace(T - 1, 0, steps).long()
    y = torch.tensor(labels)
    y_null = torch.full_like(y, NULL_CLASS)
    for i, t in enumerate(ts):
        tt = torch.full((n,), int(t))
        eps_c = model(x, tt, y)
        eps_u = model(x, tt, y_null)
        eps = eps_u + guidance * (eps_c - eps_u)
        a = ALPHAS_CUMPROD[t]
        a_prev = ALPHAS_CUMPROD[ts[i + 1]] if i + 1 < steps else torch.tensor(1.0)
        x0 = ((x - (1 - a).sqrt() * eps) / a.sqrt()).clamp(-1, 1)
        x = a_prev.sqrt() * x0 + (1 - a_prev).sqrt() * eps
    return x


def save_grid(imgs, path, cols=10):
    from PIL import Image
    imgs = ((imgs.clamp(-1, 1) + 1) * 127.5).round().byte().permute(0, 2, 3, 1).numpy()
    rows = math.ceil(len(imgs) / cols)
    grid = np.zeros((rows * 34, cols * 34, 3), dtype=np.uint8) + 255
    for i, im in enumerate(imgs):
        r, c = divmod(i, cols)
        grid[r * 34 + 1:r * 34 + 33, c * 34 + 1:c * 34 + 33] = im
    Image.fromarray(grid).resize((cols * 34 * 3, rows * 34 * 3), Image.NEAREST).save(path)


def main():
    cmd = sys.argv[1]
    if cmd == 'bench':
        st = new_state()
        print('paramètres :', sum(p.numel() for p in st['model'].parameters()) / 1e6, 'M')
        x, y = load_cifar()
        train_step(st, x, y)
        t0 = time.time()
        for _ in range(5):
            train_step(st, x, y)
        print('secondes par pas :', (time.time() - t0) / 5)
    elif cmd == 'train':
        total = int(sys.argv[2])
        x, y = load_cifar()
        st = load_state()
        t0, losses = time.time(), []
        while st['step'] < total:
            losses.append(train_step(st, x, y))
            if st['step'] % 100 == 0:
                print(f"pas {st['step']} perte {np.mean(losses[-100:]):.4f} {(time.time() - t0) / len(losses):.2f}s/pas", flush=True)
            if st['step'] % 1000 == 0:
                save_state(st)
                save_grid(ddim_sample(st['ema'], [i for i in range(10) for _ in range(2)], steps=30), os.path.join(HERE, 'progress.png'))
        save_state(st)
    elif cmd == 'sample':
        st = load_state()
        save_grid(ddim_sample(st['ema'], [i for i in range(10) for _ in range(5)], steps=50, seed=int(sys.argv[2]) if len(sys.argv) > 2 else 0), os.path.join(HERE, 'samples.png'))
        print('pas entraînés :', st['step'])
    elif cmd == 'export':
        st = load_state()
        model = st['ema'].eval()
        x = torch.randn(2, 3, 32, 32)
        t = torch.tensor([500.0, 500.0])
        y = torch.tensor([3, NULL_CLASS])
        torch.onnx.export(model, (x, t, y), os.path.join(HERE, 'model.onnx'), input_names=['x', 't', 'y'], output_names=['eps'],
                          dynamic_axes={'x': {0: 'n'}, 't': {0: 'n'}, 'y': {0: 'n'}, 'eps': {0: 'n'}}, opset_version=17, dynamo=False)
        np.save(os.path.join(HERE, 'alphas_cumprod.npy'), ALPHAS_CUMPROD.numpy())
        print('exporté, pas :', st['step'])


if __name__ == '__main__':
    main()

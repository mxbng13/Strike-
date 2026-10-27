"""Mon IA maison qui comprend les phrases : diffusion texte → image 64x64, entraînée de zéro.

Données : COCO 2017 (118 000 photos, 5 descriptions chacune), jeu public attaché au notebook Kaggle
« awsaf49/coco-2017-dataset ». Les photos dont une description parle de nudité ou de sous-vêtements sont écartées.
Encodeur de texte : petit transformeur appris en même temps que l'image (vocabulaire de mots anglais de COCO).
Bruit : calendrier cosinus décalé pour le 64 px (corrige les couleurs saturées des essais précédents).

Lancé sans argument (sur Kaggle) : prépare les données, entraîne BUDGET_H heures, exporte texte64.onnx + vocab.json.
SMOKE=1 : petit test local sur des images aléatoires (vérifie que tout tourne et s'exporte).
"""
import glob
import json
import math
import os
import re
import time
from collections import Counter
from multiprocessing import Pool

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

OUT = '/kaggle/working' if os.path.isdir('/kaggle/working') else os.getcwd()
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'
SMOKE = os.environ.get('SMOKE') == '1'
BUDGET_H = float(os.environ.get('BUDGET_H', '0.02' if SMOKE else '10.5'))
RES = 64
T = 1000
MAX_LEN = 20          # mots par description
VOCAB_SIZE = 6000     # mots les plus fréquents
PAD, NULL, UNK = 0, 1, 2

# Photos écartées : nudité, sous-vêtements, maillots (le modèle ne doit pas apprendre ces images).
EXCLUDE = re.compile(r'\b(naked|nude|nudity|topless|shirtless|underwear|underpants|lingerie|bra|bras|bikini|bikinis|swimsuit|swimsuits|swim suit|bathing suit|speedo|speedos|panties|thong|undress\w*|striptease|stripper\w*|sex|sexy|sexual\w*|intimate|breast\w*|nipple\w*|butt|buttocks|bare chest\w*|bare-chested|no shirt|without a shirt|in his underwear|in her underwear|towel)\b', re.I)


# ——— Bruit : cosinus décalé (log-SNR − 2·ln 2) pour le 64 px ———
def alphas_cumprod(steps=T, s=0.008, shift=-2 * math.log(2)):
    x = torch.linspace(0, steps, steps + 1, dtype=torch.float64)
    f = torch.cos(((x / steps) + s) / (1 + s) * math.pi / 2) ** 2
    ac = f / f[0]
    betas = (1 - ac[1:] / ac[:-1]).clamp(max=0.999)
    ac = torch.cumprod(1 - betas, 0).clamp(1e-8, 1 - 1e-8)
    logsnr = torch.log(ac / (1 - ac)) + shift
    return torch.sigmoid(logsnr).float()


AC = alphas_cumprod()


# ——— Texte ———
def words(caption):
    return re.findall(r"[a-z]+", caption.lower())


def build_vocab(captions):
    counts = Counter(w for c in captions for w in words(c))
    vocab = ['<pad>', '<null>', '<unk>'] + [w for w, _ in counts.most_common(VOCAB_SIZE - 3)]
    return {w: i for i, w in enumerate(vocab)}


def encode(caption, vocab):
    ids = [vocab.get(w, UNK) for w in words(caption)][:MAX_LEN]
    return ids + [PAD] * (MAX_LEN - len(ids))


class TextEncoder(nn.Module):
    def __init__(self, vocab_size=VOCAB_SIZE, dim=256, layers=4, heads=4):
        super().__init__()
        self.tok = nn.Embedding(vocab_size, dim)
        self.pos = nn.Parameter(torch.zeros(1, MAX_LEN, dim))
        layer = nn.TransformerEncoderLayer(dim, heads, dim * 4, dropout=0.0, activation='gelu', batch_first=True, norm_first=True)
        self.tr = nn.TransformerEncoder(layer, layers, enable_nested_tensor=False)
        self.norm = nn.LayerNorm(dim)

    def forward(self, ids):
        # La description vide (CFG) = un seul jeton <null> : il y a donc toujours au moins un jeton visible.
        pad = ids == PAD
        h = self.tok(ids) + self.pos
        h = self.tr(h, src_key_padding_mask=pad)
        h = self.norm(h)
        keep = (~pad).float().unsqueeze(-1)
        pooled = (h * keep).sum(1) / keep.sum(1).clamp(min=1)
        return h, pad, pooled


# ——— Image ———
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
    """Attention sur l'image, puis attention croisée vers les mots de la description."""

    def __init__(self, c, text_dim=256, heads=4):
        super().__init__()
        self.heads = heads
        self.norm = nn.GroupNorm(32, c)
        self.qkv = nn.Conv2d(c, c * 3, 1)
        self.out = nn.Conv2d(c, c, 1)
        self.norm_x = nn.GroupNorm(32, c)
        self.q = nn.Conv2d(c, c, 1)
        self.kv = nn.Linear(text_dim, c * 2)
        self.out_x = nn.Conv2d(c, c, 1)

    def forward(self, x, text, pad):
        b, c, h, w = x.shape
        d = c // self.heads
        q, k, v = self.qkv(self.norm(x)).reshape(b, 3, self.heads, d, h * w).unbind(1)
        attn = torch.softmax(torch.einsum('bhdi,bhdj->bhij', q, k) / math.sqrt(d), dim=-1)
        x = x + self.out(torch.einsum('bhij,bhdj->bhdi', attn, v).reshape(b, c, h, w))
        q = self.q(self.norm_x(x)).reshape(b, self.heads, d, h * w)
        k, v = self.kv(text).reshape(b, -1, 2, self.heads, d).permute(2, 0, 3, 4, 1).unbind(0)  # b, heads, d, L
        logits = torch.einsum('bhdi,bhdl->bhil', q, k) / math.sqrt(d)
        logits = logits.masked_fill(pad[:, None, None, :], -1e4)
        y = torch.einsum('bhil,bhdl->bhdi', torch.softmax(logits, dim=-1), v).reshape(b, c, h, w)
        return x + self.out_x(y)


class UNet(nn.Module):
    """64 -> 32 -> 16 -> 8, attention (image + mots) à 16x16 et 8x8."""

    def __init__(self, base=64, mults=(1, 2, 3, 4), emb_dim=256, attn_levels=(2, 3), text_dim=256):
        super().__init__()
        self.base = base
        self.text = TextEncoder(dim=text_dim)
        self.time = nn.Sequential(nn.Linear(base, emb_dim), nn.SiLU(), nn.Linear(emb_dim, emb_dim))
        self.pool = nn.Linear(text_dim, emb_dim)
        self.inp = nn.Conv2d(3, base, 3, padding=1)
        chans = [base * m for m in mults]
        self.down = nn.ModuleList()
        c = base
        skips = [c]
        for i, ch in enumerate(chans):
            for _ in range(2):
                self.down.append(ResBlock(c, ch, emb_dim)); c = ch
                if i in attn_levels:
                    self.down.append(Attention(c, text_dim))
                skips.append(c)
            if i < len(chans) - 1:
                self.down.append(nn.Conv2d(c, c, 3, stride=2, padding=1)); skips.append(c)
        self.mid1 = ResBlock(c, c, emb_dim)
        self.mid_attn = Attention(c, text_dim)
        self.mid2 = ResBlock(c, c, emb_dim)
        self.up = nn.ModuleList()
        for i, ch in reversed(list(enumerate(chans))):
            for _ in range(3):
                self.up.append(ResBlock(c + skips.pop(), ch, emb_dim)); c = ch
                if i in attn_levels:
                    self.up.append(Attention(c, text_dim))
            if i > 0:
                self.up.append(nn.Upsample(scale_factor=2, mode='nearest'))
        assert not skips and c == base
        self.out = nn.Sequential(nn.GroupNorm(32, base), nn.SiLU(), nn.Conv2d(base, 3, 3, padding=1))

    def forward(self, x, t, ids):
        text, pad, pooled = self.text(ids)
        emb = self.time(timestep_embedding(t, self.base)) + self.pool(pooled)
        h = self.inp(x)
        hs = [h]
        for layer in self.down:
            if isinstance(layer, ResBlock):
                h = layer(h, emb); hs.append(h)
            elif isinstance(layer, Attention):
                h = layer(h, text, pad); hs[-1] = h
            else:
                h = layer(h); hs.append(h)
        h = self.mid2(self.mid_attn(self.mid1(h, emb), text, pad), emb)
        for layer in self.up:
            if isinstance(layer, ResBlock):
                h = layer(torch.cat([h, hs.pop()], dim=1), emb)
            elif isinstance(layer, Attention):
                h = layer(h, text, pad)
            else:
                h = layer(h)
        return self.out(h)


# ——— Données COCO ———
def load_image(path):
    from PIL import Image
    try:
        im = Image.open(path).convert('RGB')
    except Exception:
        return None
    w, h = im.size
    s = min(w, h)
    im = im.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s)).resize((RES, RES), Image.BICUBIC)
    return np.asarray(im, dtype=np.uint8)


def prepare_coco():
    roots = glob.glob('/kaggle/input/**/captions_train2017.json', recursive=True)
    assert roots, 'COCO introuvable : attache le jeu awsaf49/coco-2017-dataset au notebook'
    ann = json.load(open(roots[0]))
    img_dir = glob.glob('/kaggle/input/**/train2017', recursive=True)[0]
    caps = {}
    for a in ann['annotations']:
        caps.setdefault(a['image_id'], []).append(a['caption'].strip())
    files = {im['id']: os.path.join(img_dir, im['file_name']) for im in ann['images']}
    keep = [i for i, cs in caps.items() if i in files and not any(EXCLUDE.search(c) for c in cs)]
    print(f'COCO : {len(caps)} photos, {len(keep)} gardées après filtrage', flush=True)
    t0 = time.time()
    with Pool(os.cpu_count()) as pool:
        imgs = pool.map(load_image, [files[i] for i in keep], chunksize=256)
    ok = [k for k, im in enumerate(imgs) if im is not None]
    images = np.stack([imgs[k] for k in ok])
    captions = [caps[keep[k]] for k in ok]
    print(f'images prêtes : {images.shape} en {time.time() - t0:.0f} s', flush=True)
    return images, captions


def fake_data(n=64):
    rng = np.random.default_rng(0)
    images = rng.integers(0, 255, (n, RES, RES, 3), dtype=np.uint8)
    words_ = ['a', 'dog', 'cat', 'in', 'the', 'forest', 'on', 'beach', 'red', 'car']
    captions = [[' '.join(rng.choice(words_, 6)) for _ in range(5)] for _ in range(n)]
    return images, captions


# ——— Échantillonnage (aperçus) ———
@torch.no_grad()
def ddim_sample(model, ids, steps=40, guidance=3.0, seed=0):
    g = torch.Generator().manual_seed(seed)
    n = ids.shape[0]
    x = torch.randn(n, 3, RES, RES, generator=g).to(DEVICE)
    null = torch.full_like(ids, PAD); null[:, 0] = NULL
    ts = torch.linspace(T - 1, 0, steps).long()
    ac = AC.to(DEVICE)
    for i, t in enumerate(ts):
        tt = torch.full((n,), int(t), device=DEVICE)
        e = model(torch.cat([x, x]), torch.cat([tt, tt]), torch.cat([ids, null])).float()
        ec, eu = e.chunk(2)
        eps = eu + guidance * (ec - eu)
        a = ac[t]
        a_prev = ac[ts[i + 1]] if i + 1 < steps else torch.tensor(1.0, device=DEVICE)
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
        grid[r * (RES + 2):r * (RES + 2) + RES, c * (RES + 2):c * (RES + 2) + RES] = im
    Image.fromarray(grid).resize((grid.shape[1] * 2, grid.shape[0] * 2), Image.NEAREST).save(path)


PREVIEW = ['a dog in a forest', 'a red car on a street', 'a cat sleeping on a bed', 'a plate of food with vegetables',
           'a boat on the sea at sunset', 'a giraffe standing in a field', 'a pizza on a table', 'a man riding a horse on a beach',
           'a train at the station', 'an airplane in the blue sky', 'a bowl of fruit', 'a snowy mountain',
           'a living room with a couch', 'two zebras in the grass', 'a bus on a city street', 'an elephant near a river']


def main():
    torch.manual_seed(0)
    images, captions = fake_data() if SMOKE else prepare_coco()
    vocab = build_vocab([c for cs in captions for c in cs])
    json.dump({'words': sorted(vocab, key=vocab.get), 'max_len': MAX_LEN, 'pad': PAD, 'null': NULL, 'unk': UNK}, open(os.path.join(OUT, 'vocab.json'), 'w'))
    cap_ids = [[encode(c, vocab) for c in cs] for cs in captions]
    n = len(images)
    data = torch.from_numpy(images).permute(0, 3, 1, 2).contiguous()  # uint8 sur CPU
    model = UNet(base=32 if SMOKE else 64).to(DEVICE)
    ema = UNet(base=32 if SMOKE else 64).to(DEVICE); ema.load_state_dict(model.state_dict()); ema.requires_grad_(False)
    print(f'paramètres : {sum(p.numel() for p in model.parameters()) / 1e6:.1f} M, images : {n}', flush=True)
    opt = torch.optim.AdamW(model.parameters(), lr=2e-4, weight_decay=0.01)
    scaler = torch.cuda.amp.GradScaler(enabled=DEVICE == 'cuda')
    batch = 8 if SMOKE else 128
    preview_ids = torch.tensor([encode(p, vocab) for p in PREVIEW], device=DEVICE)
    ac = AC.to(DEVICE)
    t_end = time.time() + BUDGET_H * 3600
    step = 0
    while time.time() < t_end:
        idx = torch.randint(0, n, (batch,))
        x0 = data[idx].to(DEVICE, non_blocking=True).float() / 127.5 - 1
        flip = torch.rand(batch, device=DEVICE) < 0.5
        x0 = torch.where(flip[:, None, None, None], x0.flip(-1), x0)
        ids = torch.tensor([cap_ids[i][np.random.randint(len(cap_ids[i]))] for i in idx.tolist()], device=DEVICE)
        drop = torch.rand(batch, device=DEVICE) < 0.1  # 10 % sans description : nécessaire au guidage
        ids[drop] = PAD; ids[drop, 0] = NULL
        empty = (ids != PAD).sum(1) == 0
        ids[empty, 0] = NULL
        t = torch.randint(0, T, (batch,), device=DEVICE)
        noise = torch.randn_like(x0)
        a = ac[t][:, None, None, None]
        xt = a.sqrt() * x0 + (1 - a).sqrt() * noise
        with torch.autocast(device_type='cuda', dtype=torch.float16, enabled=DEVICE == 'cuda'):
            loss = F.mse_loss(model(xt, t, ids).float(), noise)
        opt.zero_grad(set_to_none=True)
        scaler.scale(loss).backward()
        scaler.unscale_(opt); torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        scaler.step(opt); scaler.update()
        with torch.no_grad():
            d = min(0.9995, (1 + step) / (10 + step))
            for pe, pm in zip(ema.parameters(), model.parameters()):
                pe.mul_(d).add_(pm.detach(), alpha=1 - d)
        step += 1
        if step % 500 == 0:
            print(f'pas {step} perte {loss.item():.4f} reste {(t_end - time.time()) / 3600:.2f} h', flush=True)
        if step % 20000 == 0:
            save_grid(ddim_sample(ema, preview_ids, steps=30), os.path.join(OUT, f'progress_{step}.png'))
            torch.save(ema.state_dict(), os.path.join(OUT, 'ema.pt'))
    print(f'fin : {step} pas', flush=True)
    torch.save(ema.state_dict(), os.path.join(OUT, 'ema.pt'))
    save_grid(ddim_sample(ema, preview_ids, steps=40 if not SMOKE else 4), os.path.join(OUT, 'final.png'))
    ema = ema.float().cpu().eval()
    x = torch.randn(2, 3, RES, RES)
    ids = torch.tensor([encode('a dog in a forest', vocab), [NULL] + [PAD] * (MAX_LEN - 1)])
    torch.onnx.export(ema, (x, torch.tensor([500.0, 500.0]), ids), os.path.join(OUT, 'texte64.onnx'),
                      input_names=['x', 't', 'ids'], output_names=['eps'],
                      dynamic_axes={'x': {0: 'n'}, 't': {0: 'n'}, 'ids': {0: 'n'}, 'eps': {0: 'n'}}, opset_version=18)
    # Un seul fichier (le navigateur ne lit pas les poids séparés).
    import onnx
    path = os.path.join(OUT, 'texte64.onnx')
    m = onnx.load(path)
    for f in glob.glob(os.path.join(OUT, '*.onnx.data')):
        os.remove(f)
    onnx.save(m, path, save_as_external_data=False)
    json.dump({'alphas_cumprod': AC.tolist()}, open(os.path.join(OUT, 'texte64-bruit.json'), 'w'))
    print('exporté', flush=True)


if __name__ == '__main__':
    main()

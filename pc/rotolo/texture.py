# Rotolo: texture comuni (carta washi, tavolo di legno scuro, 6 fotogrammi di grana).
#   python pc/rotolo/texture.py <cartella>
import numpy as np
from PIL import Image, ImageFilter
rng = np.random.default_rng(7)
import sys, os
OUT = (sys.argv[1] if len(sys.argv) > 1 else 'work/rotolo-comuni').rstrip('/') + '/'
os.makedirs(OUT, exist_ok=True)

def blur(a, r):
    # sfocatura gaussiana in frequenza (PIL non sfoca le immagini float)
    h, w = a.shape
    fy = np.fft.fftfreq(h)[:, None]; fx = np.fft.rfftfreq(w)[None, :]
    k = np.exp(-2 * (np.pi * r) ** 2 * (fx ** 2 + fy ** 2))
    return np.fft.irfft2(np.fft.rfft2(a) * k, s=(h, w)).astype(np.float32)

# --- washi: base calda, macchie larghe, fibre lunghe chiare e scure
S = 2048
base = np.zeros((S, S), np.float32)
for r, w in [(220, 0.5), (60, 0.3), (12, 0.15), (1.2, 0.08)]:
    n = blur(rng.standard_normal((S, S)), r); base += w * n / (n.std() + 1e-6)
fib = Image.new('L', (S, S), 128)
from PIL import ImageDraw
d = ImageDraw.Draw(fib)
for _ in range(5200):
    x, y = rng.uniform(0, S, 2); a = rng.uniform(0, np.pi); L = rng.uniform(20, 160)
    pts = [(x, y)]
    for k in range(6):
        a += rng.normal(0, 0.35); x += np.cos(a) * L / 6; y += np.sin(a) * L / 6; pts.append((x, y))
    d.line(pts, fill=int(rng.choice([150, 165, 110])), width=int(rng.choice([1, 1, 2])))
fib = np.asarray(fib.filter(ImageFilter.GaussianBlur(0.7)), np.float32) - 128
v = 0.5 + 0.06 * base / 3 + fib / 128 * 0.18
col = np.stack([233 * v / 0.5 * 0.5 + 0, 222 * v / 0.5 * 0.5, 198 * v / 0.5 * 0.5], -1)
Image.fromarray(np.clip(col * 2 - 0, 0, 255).astype(np.uint8)).save(OUT + 'washi.jpg', quality=90)

# --- tavolo: venature orizzontali scure
W, H = 2048, 2048
y = np.arange(H)[:, None]; x = np.arange(W)[None, :]
warp = blur(rng.standard_normal((H, W)), 40) * 60
g = np.sin((y + warp) / 9.0 + blur(rng.standard_normal((H, W)), 8) * 3) * 0.5 + 0.5
g = g ** 3
n = blur(rng.standard_normal((H, W)), 2)
t = 0.55 + 0.25 * g + 0.08 * n / n.std()
wood = np.stack([42 * t, 28 * t, 20 * t], -1)
Image.fromarray(np.clip(wood, 0, 255).astype(np.uint8)).save(OUT + 'tavolo.jpg', quality=88)

# --- grana: 6 fotogrammi 1080x1920 grigio medio
for i in range(6):
    gr = rng.standard_normal((1920, 1080)).astype(np.float32)
    gr = blur(gr, 0.6); gr = 128 + gr / gr.std() * 38
    Image.fromarray(np.clip(gr, 0, 255).astype(np.uint8), 'L').save(OUT + f'grana{i}.png')
print('ok')

#!/usr/bin/env python3
# Look "12K Quality" v2 (20/10): rifatto da capo sugli esempi di Faisal Saleh (Stili/12K Quality).
# Misure degli esempi (fotogrammi, OKLab): oltre metà dell'immagine sotto luma 0,15, ombre fredde
# blu-acciaio (a ≈ 0, b ≈ -0,02), luci appena calde e mai bianche piene (L max ≈ 0,89), quasi niente
# verdi e gialli (tutto il colore è rame/rosso o petrolio/azzurro), croma media 0,035–0,04.
# La v1 (teal_arancio.py) scuriva tutto con una curva fissa: sul girato di Denis (controluce
# nuvoloso, I-Log) volti nel buio e immagine sporca. Qui la curva lascia i medi quasi dove sono
# (l'esposizione la sistema prima regista.mjs pezzo per pezzo) e il carattere viene dal colore:
# foglie verso il petrolio e spente, pelle e rame pieni, ombre fredde, luci che arrotondano.
#
# grade(rgb) lavora su array float [0,1] Rec709; la LUT si genera dalla stessa funzione.
# Uso: python3 lut12k.py --lut lut/12k.cube [33]      (rigenera la LUT dopo aver cambiato i numeri)
#      python3 lut12k.py <cartella_uscita> <img...>   (prova su fotogrammi: <nome>-12k.png)
import sys
import os
import numpy as np

# ---------- spazi colore ----------
M1 = np.array([[0.4122214708, 0.5363325363, 0.0514459929],
               [0.2119034982, 0.6806995451, 0.1073969566],
               [0.0883024619, 0.2817188376, 0.6299787005]])
M2 = np.array([[0.2104542553, 0.7936177850, -0.0040720468],
               [1.9779984951, -2.4285922050, 0.4505937099],
               [0.0259040371, 0.7827717662, -0.8086757660]])
M1i, M2i = np.linalg.inv(M1), np.linalg.inv(M2)


def lin(c):
    return np.where(c <= 0.04045, c / 12.92, ((np.maximum(c, 0) + 0.055) / 1.055) ** 2.4)


def gam(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


def to_oklab(rgb):
    return np.cbrt(lin(rgb) @ M1.T) @ M2.T


def from_oklab_lin(lab):
    return ((lab @ M2i.T) ** 3) @ M1i.T


# ---------- parametri del look ----------
P = dict(
    # curva di L (OKLab): punti (ingresso, uscita); nero un po' schiacciato, medi con più contrasto,
    # luci che arrotondano invece di bruciare
    curva=[(0.0, 0.0), (0.10, 0.03), (0.25, 0.165), (0.45, 0.40), (0.65, 0.63), (0.82, 0.795), (0.95, 0.89), (1.0, 0.925)],
    # croma: quanto segue la luce (le ombre schiacciate perdono colore come in pellicola)
    croma_luce=0.6,
    sat=1.08,
    # (centro tonalità °, ampiezza °, sposta verso °, quanto 0–1, croma ×, luce ×)
    tonalita=[
        (140, 60, 200, 0.95, 0.42, 0.86),   # verdi e foglie → petrolio spento e più scuro
        (100, 18, 75, 0.45, 0.80, 1.00),    # gialli → arancio
        (60, 25, 58, 0.30, 1.14, 1.00),     # pelle e arancio → pieni
        (25, 22, 30, 0.20, 1.12, 1.00),     # rossi → rame
        (225, 40, 228, 0.30, 1.06, 1.00),   # azzurri/ciano → acciaio
        (315, 40, 285, 0.40, 0.70, 1.00),   # viola/magenta → spenti verso il blu
    ],
    # tinte divise: ombre verso il petrolio/acciaio, luci appena calde (OKLab a, b)
    ombre=(-0.005, -0.021), ombre_fino=0.5,
    luci=(0.005, 0.010), luci_da=0.62,
    # luci quasi bianche meno sature (niente cieli fluo)
    luci_desat=0.35,
)


def curva(x, pts):
    xs, ys = zip(*pts)
    # monotona cubica (Fritsch–Carlson) per niente rimbalzi
    xs, ys = np.array(xs), np.array(ys)
    d = np.diff(ys) / np.diff(xs)
    m = np.concatenate([[d[0]], (d[:-1] + d[1:]) / 2, [d[-1]]])
    for k in range(len(d)):
        if d[k] == 0:
            m[k] = m[k + 1] = 0
        else:
            a, b = m[k] / d[k], m[k + 1] / d[k]
            s = a * a + b * b
            if s > 9:
                t = 3 / np.sqrt(s)
                m[k], m[k + 1] = t * a * d[k], t * b * d[k]
    x = np.clip(x, xs[0], xs[-1])
    k = np.clip(np.searchsorted(xs, x) - 1, 0, len(xs) - 2)
    h = xs[k + 1] - xs[k]
    t = (x - xs[k]) / h
    h00, h10, h01, h11 = 2 * t**3 - 3 * t**2 + 1, t**3 - 2 * t**2 + t, -2 * t**3 + 3 * t**2, t**3 - t**2
    return h00 * ys[k] + h10 * h * m[k] + h01 * ys[k + 1] + h11 * h * m[k + 1]


def campana(h, centro, ampiezza):
    d = (h - centro + 180) % 360 - 180
    return np.clip(np.cos(np.clip(d / ampiezza, -1, 1) * np.pi / 2), 0, 1) ** 2


def grade(rgb, p=P):
    lab = to_oklab(rgb)
    L, a, b = lab[..., 0], lab[..., 1], lab[..., 2]
    C = np.hypot(a, b)
    h = np.degrees(np.arctan2(b, a)) % 360
    # 1. tonalità: spostamenti e croma per settore (pesati per quanto il colore è saturo)
    sposta = np.zeros_like(h)
    cmul = np.ones_like(h)
    lmul = np.ones_like(h)
    peso_col = np.clip(C / 0.04, 0, 1)
    for centro, amp, verso, quanto, cm, lm in p['tonalita']:
        w = campana(h, centro, amp) * peso_col
        delta = (verso - h + 180) % 360 - 180
        sposta += w * delta * quanto
        cmul *= 1 + w * (cm - 1)
        lmul *= 1 + w * (lm - 1)
    h2 = h + sposta
    C2 = C * cmul * p['sat']
    L1 = np.clip(L * lmul, 0, 1)
    # 2. curva della luce
    L2 = curva(L1, p['curva'])
    rapporto = np.where(L1 > 1e-4, L2 / np.maximum(L1, 1e-4), 1)
    C2 = C2 * np.clip(rapporto, 0, 1.5) ** p['croma_luce']
    # luci quasi bianche meno sature
    C2 = C2 * (1 - p['luci_desat'] * np.clip((L2 - 0.8) / 0.15, 0, 1))
    a2 = C2 * np.cos(np.radians(h2))
    b2 = C2 * np.sin(np.radians(h2))
    # 3. tinte divise
    wo = np.clip(1 - L2 / p['ombre_fino'], 0, 1) ** 1.5 * np.clip(L2 / 0.06, 0, 1)
    wl = np.clip((L2 - p['luci_da']) / (1 - p['luci_da']), 0, 1)
    a2 = a2 + wo * p['ombre'][0] + wl * p['luci'][0]
    b2 = b2 + wo * p['ombre'][1] + wl * p['luci'][1]
    out = np.stack([L2, a2, b2], -1)
    # 4. dentro il gamut: riduco il croma finché il colore è rappresentabile
    lin_rgb = from_oklab_lin(out)
    for _ in range(6):
        fuori = (lin_rgb.min(-1) < -1e-4) | (lin_rgb.max(-1) > 1 + 1e-4)
        if not fuori.any():
            break
        out[..., 1:] = np.where(fuori[..., None], out[..., 1:] * 0.85, out[..., 1:])
        lin_rgb = from_oklab_lin(out)
    return gam(lin_rgb)


def scrivi_lut(file, n=33, p=P):
    g = np.linspace(0, 1, n)
    # .cube: rosso varia più in fretta
    b_, g_, r_ = np.meshgrid(g, g, g, indexing='ij')
    rgb = np.stack([r_, g_, b_], -1).reshape(-1, 3)
    out = grade(rgb, p)
    with open(file, 'w') as f:
        f.write(f'TITLE "12K Quality v2"\nLUT_3D_SIZE {n}\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 1 1 1\n')
        f.write('\n'.join(f'{r:.6f} {g:.6f} {b:.6f}' for r, g, b in out))
        f.write('\n')


if __name__ == '__main__':
    if sys.argv[1] == '--lut':
        scrivi_lut(sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 33)
        sys.exit(0)
    from PIL import Image
    out_dir = sys.argv[1]
    for f in sys.argv[2:]:
        im = np.asarray(Image.open(f).convert('RGB'), dtype=np.float64) / 255
        g = grade(im)
        nome = os.path.splitext(os.path.basename(f))[0]
        Image.fromarray((np.clip(g, 0, 1) * 255 + 0.5).astype(np.uint8)).save(os.path.join(out_dir, f'{nome}-12k.png'))

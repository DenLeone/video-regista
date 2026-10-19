#!/usr/bin/env python3
# LUT creativa "teal e arancio" (stile 12K Quality, 19/10): neri schiacciati, medi bassi,
# verdi e azzurri verso il petrolio e spenti, arancio e pelle più pieni, ombre fredde e luci
# calde. Si applica DOPO la conversione tecnica (I-Log → Rec709) in ffmpeg (lut3d).
# Uso: python3 teal_arancio.py lut/teal-arancio.cube  (rigenera la LUT se si cambiano i numeri)
import sys
import numpy as np

CURVA = ([0, 0.04, 0.12, 0.25, 0.45, 0.65, 0.82, 1], [0, 0.0, 0.04, 0.14, 0.34, 0.56, 0.76, 0.94])
SAT, VERDI_SAT, VERDI_SPOSTA, PELLE_SAT = 1.35, 0.55, 0.07, 1.15
# tinte misurate sugli esempi di 12K Quality: ombre circa -1,2% rosso / +1,9% blu, luci calde.
# La prima versione era tre volte più forte e azzerava il rosso nei neri: schiariti, diventavano blu
OMBRE, LUCI = (-0.012, 0.002, 0.018), (0.03, 0.006, -0.03)


def rgb2hsv(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx, mn = a.max(-1), a.min(-1)
    d = mx - mn
    h = np.zeros_like(mx)
    m = d > 1e-6
    rr = (mx == r) & m
    gg = (mx == g) & m & ~rr
    bb = m & ~rr & ~gg
    h[rr] = ((g - b)[rr] / d[rr]) % 6
    h[gg] = ((b - r)[gg] / d[gg]) + 2
    h[bb] = ((r - g)[bb] / d[bb]) + 4
    return np.stack([h / 6.0, np.where(mx > 1e-6, d / np.maximum(mx, 1e-6), 0), mx], -1)


def hsv2rgb(x):
    h, s, v = x[..., 0], x[..., 1], x[..., 2]
    i = np.floor(h * 6) % 6
    f = h * 6 - np.floor(h * 6)
    p, q, t = v * (1 - s), v * (1 - f * s), v * (1 - (1 - f) * s)
    out = np.zeros(x.shape)
    for k, (a, b, c) in enumerate([(v, t, p), (q, v, p), (p, v, t), (p, q, v), (t, p, v), (v, p, q)]):
        m = i == k
        out[..., 0][m], out[..., 1][m], out[..., 2][m] = a[m], b[m], c[m]
    return out


def banda(h, c, w):  # peso morbido attorno alla tinta c (0..1)
    d = np.abs(((h - c + 0.5) % 1) - 0.5)
    return np.clip(1 - d / w, 0, 1)


def grade(a):
    a = np.clip(a, 0, 1)
    y = 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
    a = np.clip(a * (np.interp(y, *CURVA) / np.maximum(y, 1e-4))[..., None], 0, 1)
    hsv = rgb2hsv(a)
    h, s = hsv[..., 0], hsv[..., 1]
    wv, wg, wp, wb = banda(h, 0.30, 0.14), banda(h, 0.15, 0.05), banda(h, 0.06, 0.06), banda(h, 0.55, 0.10)
    h = (h + wv * VERDI_SPOSTA - wg * 0.02 + wb * (0.52 - h) * 0.5) % 1
    s = s * SAT * (1 - wv * (1 - VERDI_SAT)) * (1 - wg * 0.25) * (1 + wp * (PELLE_SAT - 1))
    a = hsv2rgb(np.stack([h, np.clip(s, 0, 1), hsv[..., 2]], -1))
    y = 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
    a = a + np.array(OMBRE) * ((1 - y) ** 2)[..., None] + np.array(LUCI) * (y ** 2)[..., None]
    return np.clip(a, 0, 1)


def scrivi_cube(percorso, n=33):
    g = np.linspace(0, 1, n)
    b, gg, r = np.meshgrid(g, g, g, indexing='ij')  # .cube: il rosso varia più in fretta
    out = grade(np.stack([r, gg, b], -1).reshape(-1, 3))
    with open(percorso, 'w') as f:
        f.write('TITLE "teal e arancio (video-regista)"\n')
        f.write(f'LUT_3D_SIZE {n}\n')
        for x in out:
            f.write(f'{x[0]:.5f} {x[1]:.5f} {x[2]:.5f}\n')


if __name__ == '__main__':
    scrivi_cube(sys.argv[1] if len(sys.argv) > 1 else 'teal-arancio.cube')

#!/usr/bin/env python3
"""LUT tecnica Sony S-Log3 / S-Gamut3.Cine → Rec.709 (BT.1886), calcolata dalle formule pubblicate da Sony.

Come la LUT ufficiale Insta360 per l'I-Log (lut/Luna_I-Log_to_Rec709_BT1886_s33_v2.cube): riporta il girato
piatto a colori normali; il "look" (documentario, caldo, contrasto) lo aggiunge poi lo stile.
Niente file di terzi: le formule sono quelle del documento tecnico Sony su S-Log3 e S-Gamut3.Cine.

  1. S-Log3 → luce lineare della scena (grigio 18% = codice 420 su 1023)
  2. S-Gamut3.Cine → primari Rec.709 (matrice dai primari e dal bianco D65)
  3. curva "filmica" (approssimazione ACES di K. Narkowicz) con esposizione: il grigio 18% esce al ~45%,
     il bianco 90% all'~84%, le alte luci (fino a +7,5 stop dell'S-Log3) rientrano morbide invece di bruciare
  4. codifica BT.1886 (gamma 1/2,4), come la LUT Insta360

Uso: python3 scripts/look/slog3_lut.py [uscita.cube] [lato]
"""
import sys

import numpy as np

USCITA = sys.argv[1] if len(sys.argv) > 1 else 'lut/Sony_SLog3_SGamut3Cine_to_Rec709_s33.cube'
LATO = int(sys.argv[2]) if len(sys.argv) > 2 else 33
ESPOSIZIONE = 0.62  # grigio 18% → ~45% in uscita (Rec.709 tipico: 41–45%)


def slog3_a_lineare(x):
    cv = np.asarray(x, dtype=np.float64) * 1023.0
    return np.where(cv >= 171.2102946929,
                    (10.0 ** ((cv - 420.0) / 261.5)) * (0.18 + 0.01) - 0.01,
                    (cv - 95.0) * 0.01125000 / (171.2102946929 - 95.0))


def rgb_a_xyz(primari, bianco):
    def xyz(x, y):
        return np.array([x / y, 1.0, (1.0 - x - y) / y])
    P = np.stack([xyz(*p) for p in primari], axis=1)
    S = np.linalg.solve(P, xyz(*bianco))
    return P * S


D65 = (0.3127, 0.3290)
SGAMUT3_CINE = [(0.766, 0.275), (0.225, 0.800), (0.089, -0.087)]
REC709 = [(0.64, 0.33), (0.30, 0.60), (0.15, 0.06)]
M = np.linalg.inv(rgb_a_xyz(REC709, D65)) @ rgb_a_xyz(SGAMUT3_CINE, D65)


def filmica(x):
    x = np.maximum(x, 0.0)
    return np.clip((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0)


def trasforma(rgb):
    lin = slog3_a_lineare(rgb) @ M.T
    return filmica(lin * ESPOSIZIONE) ** (1.0 / 2.4)


def main():
    v = np.linspace(0.0, 1.0, LATO)
    # ordine del formato .cube: il rosso cambia più in fretta, poi il verde, poi il blu
    b, g, r = np.meshgrid(v, v, v, indexing='ij')
    out = trasforma(np.stack([r.ravel(), g.ravel(), b.ravel()], axis=1))
    with open(USCITA, 'w') as f:
        f.write('# Sony S-Log3 / S-Gamut3.Cine -> Rec709 / BT1886 (scripts/look/slog3_lut.py)\n')
        f.write('TITLE "Sony S-Log3 SGamut3.Cine to Rec709"\n')
        f.write(f'LUT_3D_SIZE {LATO}\nDOMAIN_MIN 0.0 0.0 0.0\nDOMAIN_MAX 1.0 1.0 1.0\n')
        for p in out:
            f.write(f'{p[0]:.6f} {p[1]:.6f} {p[2]:.6f}\n')
    grigio = trasforma(np.array([[420 / 1023] * 3]))[0][0]
    bianco = trasforma(np.array([[598 / 1023] * 3]))[0][0]
    nero = trasforma(np.array([[95 / 1023] * 3]))[0][0]
    print(f'{USCITA}: grigio 18% → {grigio:.3f}, bianco 90% → {bianco:.3f}, nero → {nero:.3f}')


if __name__ == '__main__':
    main()

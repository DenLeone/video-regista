#!/usr/bin/env python3
# LUT di prova per i look chiari (Manifestazioni, 20/10): stessa funzione OKLab del look 12K
# (scripts/look/lut12k.py) con altri numeri. Uso: python3 -I lab/lut/genera.py  (dalla cartella del repo)
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'scripts', 'look'))
from lut12k import P, scrivi_lut  # noqa: E402

QUI = os.path.dirname(os.path.abspath(__file__))
LOOK = {
    # pelle più luminosa e piena, il resto quasi com'è
    'pelle': dict(P, curva=[(0, 0), (0.25, 0.245), (0.5, 0.51), (0.75, 0.76), (1, 1)], sat=1.03, croma_luce=0.3,
                  tonalita=[(60, 25, 58, 0.2, 1.08, 1.12), (25, 22, 30, 0.1, 1.04, 1.04)],
                  ombre=(0, 0), luci=(0.004, 0.008), luci_desat=0.2),
    # teal e arancio ma chiaro: medi un filo su, neri appena morbidi, verdi verso il petrolio,
    # pelle calda, ombre fredde e luci calde
    'cinematico-chiaro': dict(P, curva=[(0, 0), (0.1, 0.085), (0.3, 0.31), (0.5, 0.53), (0.7, 0.73), (0.9, 0.9), (1, 0.96)],
                              sat=1.06, croma_luce=0.4,
                              tonalita=[(140, 60, 195, 0.7, 0.7, 0.95), (100, 18, 75, 0.35, 0.9, 1.0),
                                        (60, 25, 58, 0.25, 1.1, 1.08), (225, 40, 215, 0.3, 1.0, 1.0)],
                              ombre=(-0.006, -0.016), ombre_fino=0.45, luci=(0.008, 0.014), luci_da=0.55, luci_desat=0.3),
    # pellicola calda: neri sollevati, luci che arrotondano, verdi verso l'oliva, colori meno saturi
    'film-caldo': dict(P, curva=[(0, 0.04), (0.15, 0.16), (0.5, 0.52), (0.85, 0.85), (1, 0.95)], sat=0.95, croma_luce=0.3,
                       tonalita=[(140, 60, 120, 0.3, 0.75, 1.0), (60, 25, 55, 0.2, 1.06, 1.06)],
                       ombre=(-0.004, -0.004), ombre_fino=0.45, luci=(0.01, 0.018), luci_da=0.55, luci_desat=0.25),
}
for nome, p in LOOK.items():
    scrivi_lut(os.path.join(QUI, f'{nome}.cube'), 33, p)
    print('scritta', nome)

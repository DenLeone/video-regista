#!/usr/bin/env python3
"""Dove sta il viso in ogni fotogramma campione: posizione orizzontale 0..1 (0 = bordo sinistro).

Uso: volto.py <cartella con i JPG> <uscita.json> <passo in secondi>
I JPG (già ridotti, in ordine) li prepara ffmpeg. Se OpenCV manca o qualcosa va storto non si ferma nulla:
l'uscita resta vuota e il Regista ritaglia al centro come prima.
"""
import json
import os
import sys


def main():
    cartella, uscita, passo = sys.argv[1], sys.argv[2], float(sys.argv[3])
    campioni = []
    try:
        import cv2
        casc = cv2.CascadeClassifier(os.path.join(cv2.data.haarcascades, 'haarcascade_frontalface_alt2.xml'))
        file = sorted(f for f in os.listdir(cartella) if f.lower().endswith('.jpg'))
        for i, nome in enumerate(file):
            img = cv2.imread(os.path.join(cartella, nome), cv2.IMREAD_GRAYSCALE)
            if img is None:
                campioni.append([round(i * passo, 3), None, 0])
                continue
            h, w = img.shape[:2]
            facce = casc.detectMultiScale(img, scaleFactor=1.1, minNeighbors=5, minSize=(max(24, w // 20), max(24, w // 20)))
            if len(facce):
                x, _y, fw, fh = max(facce, key=lambda f: f[2] * f[3])
                campioni.append([round(i * passo, 3), round((x + fw / 2) / w, 4), round(fw / w, 4)])
            else:
                campioni.append([round(i * passo, 3), None, 0])
    except Exception as e:  # nessun errore fa fallire il montaggio
        print(f'volto: non disponibile ({e})', file=sys.stderr)
        campioni = []
    with open(uscita, 'w') as f:
        json.dump({'passo': passo, 'campioni': campioni}, f)


if __name__ == '__main__':
    main()

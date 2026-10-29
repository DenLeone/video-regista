"""Trova in un video montato quali effetti sonori di un pack sono stati usati, e quando.

Uso: python3 trova-sfx.py <video> <cartella del pack> <uscita.txt>

Per ogni suono del pack (wav, mp3, aif, m4a, ogg) calcola la correlazione normalizzata con l'audio
del video (8 kHz mono): dove supera la soglia il suono c'è, anche con la voce sopra (Blackden, 29/10:
"i suoni nelle transizioni li voglio identici"). Scrive l'elenco in ordine di tempo.
"""
import os
import subprocess
import sys

import numpy as np
from scipy.signal import fftconvolve

SR = 8000
SOGLIA = 0.32        # correlazione minima per dire "c'è" (con la voce sopra i suoni veri stanno sopra 0,4)
MAX_DUR = 1.2        # dei suoni lunghi basta l'attacco: è la parte riconoscibile
DISTANZA = 0.25      # due ritrovamenti dello stesso suono più vicini di così sono uno solo
ESTENSIONI = ('.wav', '.mp3', '.aif', '.aiff', '.m4a', '.ogg', '.flac')


def leggi(file, durata=None):
    args = ['ffmpeg', '-v', 'error', '-i', file]
    if durata:
        args += ['-t', str(durata)]
    args += ['-ac', '1', '-ar', str(SR), '-f', 'f32le', '-']
    dati = subprocess.run(args, capture_output=True, check=True).stdout
    return np.frombuffer(dati, dtype=np.float32).astype(np.float64)


def trova(video, suono):
    s = suono - suono.mean()
    n = len(s)
    ns = np.linalg.norm(s)
    if n < SR * 0.04 or ns < 1e-6:
        return []
    corr = fftconvolve(video, s[::-1], mode='valid')
    # energia del video in ogni finestra lunga quanto il suono
    c2 = np.concatenate([[0.0], np.cumsum(video ** 2)])
    energia = np.sqrt(np.maximum(c2[n:] - c2[:-n], 1e-12))
    ncc = corr / (energia * ns)
    trovati = []
    passo = int(DISTANZA * SR)
    candidati = np.where(ncc > SOGLIA)[0]
    for i in candidati[np.argsort(-ncc[candidati])]:
        if all(abs(i - j) > passo for j, _ in trovati):
            trovati.append((i, ncc[i]))
        if len(trovati) > 60:
            break
    return [(i / SR, float(v)) for i, v in trovati]


def main():
    video_file, pack, uscita = sys.argv[1:4]
    video = leggi(video_file)
    righe = []
    file_suoni = []
    for radice, _, nomi in os.walk(pack):
        for nome in nomi:
            if nome.lower().endswith(ESTENSIONI):
                file_suoni.append(os.path.join(radice, nome))
    print(f'{len(file_suoni)} suoni nel pack, video {len(video) / SR:.1f} s', flush=True)
    for k, f in enumerate(sorted(file_suoni)):
        try:
            suono = leggi(f, MAX_DUR)
        except subprocess.CalledProcessError:
            continue
        for t, v in trova(video, suono):
            righe.append((t, v, os.path.relpath(f, pack)))
        if k % 50 == 0:
            print(f'{k}/{len(file_suoni)}', flush=True)
    righe.sort()
    with open(uscita, 'w') as o:
        o.write(f'{video_file}: {len(righe)} suoni del pack ritrovati (correlazione ≥ {SOGLIA})\n\n')
        for t, v, f in righe:
            o.write(f'{int(t // 60)}:{t % 60:05.2f}  {v:.2f}  {f}\n')
    print(f'{len(righe)} ritrovamenti', flush=True)


if __name__ == '__main__':
    main()

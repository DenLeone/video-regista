"""Estrae da un video montato gli effetti sonori, puliti dalla voce, e li raggruppa.

Uso: python3 estrai-sfx.py <video> <cartella di uscita>

1. Demucs separa la voce (Denis e le clip con chi parla) dal resto: gli effetti restano in no_vocals.
2. Sul resto si cercano gli attacchi (l'energia sale di colpo sopra il fondo) e si ritaglia ogni suono
   fino a quando si spegne.
3. I suoni uguali (lo stesso file usato più volte: correlazione alta) diventano un gruppo: se ne salva
   uno, il più pulito, come suono_NN.wav. In elenco.txt quando compare ogni gruppo.
Blackden, 29/10: "i suoni nelle transizioni li voglio identici, sono miei".
"""
import os
import subprocess
import sys

import numpy as np
from scipy.signal import fftconvolve

SR = 44100
PASSO = 0.01          # finestre di 10 ms per l'energia
MIN_DB = -42          # sotto questo è silenzio
SALTO_DB = 12         # quanto deve salire l'energia sul fondo per essere un attacco
CODA = 0.15           # il suono finisce dopo 150 ms sotto soglia
MAX_DUR = 2.5
SIMILE = 0.6          # correlazione per dire che due suoni sono lo stesso file


def leggi_wav(file, sr=SR, canali=1):
    dati = subprocess.run(['ffmpeg', '-v', 'error', '-i', file, '-ac', str(canali), '-ar', str(sr), '-f', 'f32le', '-'],
                          capture_output=True, check=True).stdout
    x = np.frombuffer(dati, dtype=np.float32).astype(np.float64)
    return x.reshape(-1, canali) if canali > 1 else x


def scrivi_wav(file, x, sr=SR):
    p = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(sr), '-ac', str(x.shape[1] if x.ndim > 1 else 1),
                          '-i', '-', '-c:a', 'pcm_s16le', file], stdin=subprocess.PIPE)
    p.communicate(x.astype(np.float32).tobytes())


def separa(video, lavoro):
    wav = os.path.join(lavoro, 'mix.wav')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', video, '-vn', '-ac', '2', '-ar', str(SR), wav], check=True)
    subprocess.run([sys.executable, '-m', 'demucs', '-n', 'htdemucs', '--two-stems', 'vocals', '-d', 'cpu', '-o', lavoro, wav], check=True)
    return os.path.join(lavoro, 'htdemucs', 'mix', 'no_vocals.wav')


def eventi(x):
    n = int(PASSO * SR)
    finestre = len(x) // n
    e = np.sqrt(np.mean(x[:finestre * n].reshape(finestre, n) ** 2, axis=1) + 1e-12)
    db = 20 * np.log10(e)
    fondo = np.array([np.median(db[max(0, i - 100):i + 1]) for i in range(finestre)])  # ultimo secondo
    trovati = []
    i = 0
    while i < finestre:
        if db[i] > MIN_DB and db[i] - fondo[i] > SALTO_DB:
            # i whoosh salgono piano: si torna indietro finché il suono è sopra il fondo
            inizio = i
            while inizio > 0 and i - inizio < 150 and db[inizio - 1] > fondo[i] + 3:
                inizio -= 1
            inizio = max(0, inizio - 2)
            j, sotto = i, 0
            while j < finestre and (j - i) * PASSO < MAX_DUR:
                sotto = sotto + 1 if db[j] < max(MIN_DB, fondo[i] + 4) else 0
                if sotto * PASSO >= CODA:
                    break
                j += 1
            fine = j - sotto
            if (fine - inizio) * PASSO >= 0.05:
                trovati.append((inizio * PASSO, fine * PASSO, float(db[i:fine + 1].max())))
            i = j + 1
        else:
            i += 1
    return trovati


def simili(a, b):
    a = a[: int(0.8 * 8000)]
    b = b[: int(0.8 * 8000)]
    if len(a) < 200 or len(b) < 200:
        return 0.0
    c = fftconvolve(a, b[::-1], mode='full')
    return float(np.max(np.abs(c)) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-12))


def main():
    video, uscita = sys.argv[1:3]
    os.makedirs(uscita, exist_ok=True)
    lavoro = os.path.join(uscita, '_lavoro')
    os.makedirs(lavoro, exist_ok=True)
    resto = separa(video, lavoro)
    stereo = leggi_wav(resto, SR, 2)
    mono = stereo.mean(axis=1)
    evs = eventi(mono)
    print(f'{len(evs)} suoni trovati', flush=True)
    # versioni a 8 kHz per il confronto
    pezzi = []
    for a, b, picco in evs:
        x = mono[int(a * SR):int(b * SR)]
        pezzi.append(x[::5][: int(0.8 * 8820)])
    gruppi = []  # [indici]
    for i, p in enumerate(pezzi):
        for g in gruppi:
            if simili(pezzi[g[0]], p) > SIMILE:
                g.append(i)
                break
        else:
            gruppi.append([i])
    gruppi.sort(key=lambda g: (-len(g), evs[g[0]][0]))
    righe = []
    for k, g in enumerate(gruppi, 1):
        # il più pulito: quello col picco più alto rispetto alla durata media del gruppo
        migliore = max(g, key=lambda i: evs[i][2])
        a, b, _ = evs[migliore]
        nome = f'suono_{k:02d}.wav'
        x = stereo[int(max(0, a - 0.01) * SR):int((b + 0.05) * SR)].copy()
        sfuma = min(len(x), int(0.03 * SR))
        x[-sfuma:] *= np.linspace(1, 0, sfuma)[:, None]
        picco = np.max(np.abs(x)) or 1
        scrivi_wav(os.path.join(uscita, nome), x / picco * 0.89)
        quando = ', '.join(f'{int(evs[i][0] // 60)}:{evs[i][0] % 60:05.2f}' for i in g)
        righe.append(f'{nome}  {b - a:.2f} s  usato {len(g)} volte: {quando}')
    with open(os.path.join(uscita, 'elenco.txt'), 'w') as o:
        o.write(f'{video}: {len(evs)} suoni, {len(gruppi)} diversi\n\n' + '\n'.join(righe) + '\n')
    print('\n'.join(righe), flush=True)


if __name__ == '__main__':
    main()

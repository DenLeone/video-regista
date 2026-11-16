#!/usr/bin/env python3
# Look con la pelle protetta (stile Documentario, 15/11): il look (una LUT fredda e desaturata) va su tutto
# il fotogramma tranne la pelle (viso e corpo, MediaPipe selfie multiclass, classi 2 e 3), che resta con i
# colori del girato (Denis: «l'unico problema sono i colori della mia faccia»).
# Python calcola la maschera della pelle (in piccolo), ffmpeg mescola le due versioni (maskedmerge).
#
# Uso: python3 pelle.py <sorgente> <uscita.mp4> <modello.tflite> <filtro base> <filtro look> <filtro pelle>
#                       [--da S] [--dur S] [--bande]      (--bande = formato cinema 2,39:1 dentro il 16:9)
import argparse
import subprocess

import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks.python import BaseOptions
from mediapipe.tasks.python import vision

W, H = 1920, 1080
MW, MH = 640, 360   # la maschera si calcola in piccolo
FORZA = 1.6        # la maschera della pelle è prudente: si spinge un po' perché copra tutto il viso
MEMORIA = 0.45     # media con la maschera prima: niente sfarfallio (più bassa: ora si ricalcola ogni 3 fotogrammi)
SALTA = 3


def lettore(src, vf, da, dur, w, h):
    t = (['-ss', str(da)] if da else []) + ['-i', src] + (['-t', str(dur)] if dur else [])
    return subprocess.Popen(['ffmpeg', '-v', 'error', *t, '-vf', f'{vf},scale={w}:{h},format=rgb24', '-f', 'rawvideo', '-'],
                            stdout=subprocess.PIPE)


def main():
    a = argparse.ArgumentParser()
    for n in ('src', 'out', 'modello', 'base', 'look', 'pelle'):
        a.add_argument(n)
    a.add_argument('--da', type=float, default=0)
    a.add_argument('--dur', type=float, default=0)
    a.add_argument('--fps', default='24')
    a.add_argument('--bande', action='store_true')
    o = a.parse_args()
    # 16/11, video lunghi (Redazione): Python calcola SOLO la maschera della pelle, in piccolo (640×360), e la
    # salva come video in scala di grigi senza perdite; il miscuglio look/pelle in 1080p lo fa ffmpeg
    # (maskedmerge, in C, su più core). Prima mescolava Python fotogramma per fotogramma: ~3 fps.
    cfr = f'fps={o.fps},setpts=N/({o.fps})/TB'
    nat = lettore(o.src, f'{cfr},{o.base},{o.pelle}', o.da, o.dur, MW, MH)
    # il miscuglio (ffmpeg) parte subito e riceve la maschera mentre Python la calcola: lavorano insieme
    t = (['-ss', str(o.da)] if o.da else []) + ['-i', o.src] + (['-t', str(o.dur)] if o.dur else [])
    bande = ',crop=1920:804,pad=1920:1080:0:138:black' if o.bande else ''
    grafo = (f'[0:v]{cfr},{o.base},split=2[x][y];[x]{o.look},scale={W}:{H},format=gbrp[a];[y]{o.pelle},scale={W}:{H},format=gbrp[b];'
             f'[1:v]setpts=N/({o.fps})/TB,scale={W}:{H}:flags=bilinear,format=gray,format=gbrp[m];[a][b][m]maskedmerge{bande},format=yuv420p[v]')
    scrivi = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', *t, '-f', 'rawvideo', '-pix_fmt', 'gray', '-s', f'{MW}x{MH}', '-r', o.fps, '-i', '-',
                               '-filter_complex', grafo, '-map', '[v]', '-map', '0:a?', '-r', o.fps,
                               '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart',
                               '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', o.out], stdin=subprocess.PIPE)
    seg = vision.ImageSegmenter.create_from_options(vision.ImageSegmenterOptions(
        base_options=BaseOptions(model_asset_path=o.modello), running_mode=vision.RunningMode.VIDEO, output_confidence_masks=True))
    n, prima, fps, uscita = 0, None, float(eval(o.fps)), None
    while True:
        bn = nat.stdout.read(MW * MH * 3)
        if len(bn) < MW * MH * 3:
            break
        # la maschera si ricalcola ogni SALTA fotogrammi (la pelle non si sposta in 80 ms; la media la ammorbidisce)
        if uscita is None or n % SALTA == 0:
            fn = np.frombuffer(bn, np.uint8).reshape(MH, MW, 3)
            m = seg.segment_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=fn), int(n * 1000 / fps)).confidence_masks
            pelle = np.clip(m[2].numpy_view() + m[3].numpy_view(), 0, 1)
            prima = pelle if prima is None else prima * MEMORIA + pelle * (1 - MEMORIA)
            uscita = (np.clip(cv2.GaussianBlur(prima, (0, 0), 4 * MW / W) * FORZA, 0, 1) * 255).astype(np.uint8).tobytes()
        scrivi.stdin.write(uscita)
        n += 1
    scrivi.stdin.close()
    if scrivi.wait():
        raise SystemExit('pelle: ffmpeg non riuscito')
    print(f'pelle: {n} fotogrammi')


if __name__ == '__main__':
    main()

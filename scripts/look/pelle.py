#!/usr/bin/env python3
# Look con la pelle protetta (stile Documentario, 15/11): il look (una LUT fredda e desaturata) va su tutto
# il fotogramma tranne la pelle (viso e corpo, MediaPipe selfie multiclass, classi 2 e 3), che resta con i
# colori del girato (Denis: «l'unico problema sono i colori della mia faccia»).
# Due letture dello stesso file con ffmpeg (una col look, una per la pelle) e la maschera le mescola.
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
FORZA = 1.6        # la maschera della pelle è prudente: si spinge un po' perché copra tutto il viso
MEMORIA = 0.6      # media con il fotogramma prima: niente sfarfallio della maschera


def lettore(src, vf, da, dur):
    t = (['-ss', str(da)] if da else []) + ['-i', src] + (['-t', str(dur)] if dur else [])
    return subprocess.Popen(['ffmpeg', '-v', 'error', *t, '-vf', f'{vf},scale={W}:{H},format=rgb24', '-f', 'rawvideo', '-'],
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
    look = lettore(o.src, f'{o.base},{o.look}', o.da, o.dur)
    nat = lettore(o.src, f'{o.base},{o.pelle}', o.da, o.dur)
    t = (['-ss', str(o.da)] if o.da else []) + ['-i', o.src] + (['-t', str(o.dur)] if o.dur else [])
    vf = 'crop=1920:804,pad=1920:1080:0:138:black,' if o.bande else ''
    scrivi = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', o.fps, '-i', '-',
                               *t, '-map', '0:v', '-map', '1:a?', '-vf', f'{vf}format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '16',
                               '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart',
                               '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', o.out],
                              stdin=subprocess.PIPE)
    seg = vision.ImageSegmenter.create_from_options(vision.ImageSegmenterOptions(
        base_options=BaseOptions(model_asset_path=o.modello), running_mode=vision.RunningMode.VIDEO, output_confidence_masks=True))
    n, prima, fps = 0, None, float(eval(o.fps))
    while True:
        ba, bn = look.stdout.read(W * H * 3), nat.stdout.read(W * H * 3)
        if len(ba) < W * H * 3 or len(bn) < W * H * 3:
            break
        fa = np.frombuffer(ba, np.uint8).reshape(H, W, 3)
        fn = np.frombuffer(bn, np.uint8).reshape(H, W, 3)
        piccolo = np.ascontiguousarray(cv2.resize(fn, (640, 360), interpolation=cv2.INTER_AREA))
        m = seg.segment_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=piccolo), int(n * 1000 / fps)).confidence_masks
        pelle = np.clip(m[2].numpy_view() + m[3].numpy_view(), 0, 1)
        prima = pelle if prima is None else prima * MEMORIA + pelle * (1 - MEMORIA)
        mask = cv2.GaussianBlur(cv2.resize(prima, (W, H), interpolation=cv2.INTER_LINEAR), (0, 0), 4)
        mask = np.clip(mask * FORZA, 0, 1)[..., None]
        out = fa * (1 - mask) + fn * mask
        scrivi.stdin.write(out.astype(np.uint8).tobytes())
        n += 1
    scrivi.stdin.close()
    scrivi.wait()
    print(f'pelle: {n} fotogrammi')


if __name__ == '__main__':
    main()

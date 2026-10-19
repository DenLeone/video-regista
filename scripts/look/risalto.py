#!/usr/bin/env python3
# "Soggetto in risalto" (stile 12K Quality, 19/10): sul pezzo già colorato (LUT teal e arancio)
# la persona resta luminosa e calda, lo sfondo si sfoca (finto diaframma aperto), scende al buio
# tenendo le luci come puntini (bokeh) e vira al petrolio. Persona = MediaPipe selfie multiclass,
# come per le scritte dietro (ritaglio.py). Se nei primi fotogrammi non c'è una persona chiara
# (dettaglio di prodotto, primo piano strettissimo) il pezzo resta com'è.
#
# Uso: python3 risalto.py <pezzo.mp4> <uscita.mp4> <modello.tflite>   → stampa "risalto" o "saltato"

import json
import subprocess
import sys

import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks.python import BaseOptions
from mediapipe.tasks.python import vision

SFONDO_LUCE, LUCI_SFONDO, SFONDO_TINTA, SFOCATURA = 0.5, 0.5, (-0.03, 0.005, 0.035), 0.012
VIGNETTA = 0.35
# soggetto: i medi tornano su (la LUT li abbassa per lo sfondo) e un filo più caldi
CURVA_SOGGETTO = ([0, 0.03, 0.1, 0.25, 0.45, 0.7, 1], [0, 0.03, 0.13, 0.32, 0.54, 0.78, 1])
CALDO = (1.03, 1.0, 0.97)
COPERTURA = (0.04, 0.62)  # quota di persona nell'inquadratura per cui ha senso


def info(src):
    j = json.loads(subprocess.run(['ffprobe', '-v', 'error', '-print_format', 'json', '-show_streams', src], capture_output=True, text=True, check=True).stdout)
    v = next(s for s in j['streams'] if s['codec_type'] == 'video')
    return int(v['width']), int(v['height']), v['r_frame_rate'], any(s['codec_type'] == 'audio' for s in j['streams'])


def main():
    src, out, modello = sys.argv[1], sys.argv[2], sys.argv[3]
    w, h, fps, audio = info(src)
    leggi = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', src, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE)
    opzioni = vision.ImageSegmenterOptions(base_options=BaseOptions(model_asset_path=modello),
                                           running_mode=vision.RunningMode.VIDEO, output_confidence_masks=True)
    x = np.arange(256, dtype=np.float32) / 255
    tab = np.dstack([np.clip(np.interp(x * k, *CURVA_SOGGETTO) * 255, 0, 255).astype(np.uint8) for k in CALDO]).reshape(256, 1, 3)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    r = np.sqrt(((xx - w / 2) / (w / 2)) ** 2 + ((yy - h * 0.45) / (h / 2)) ** 2)
    vignetta = cv2.merge([(1 - VIGNETTA * np.clip(r - 0.55, 0, 1) ** 1.5).astype(np.float32)] * 3)
    piccolo = (max(2, w // 4), max(2, h // 4))
    tinta = np.array(SFONDO_TINTA, np.float32)
    nucleo = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))

    def componi(img, m):
        sog = cv2.LUT(img, tab)
        s = cv2.resize(img, piccolo, interpolation=cv2.INTER_AREA).astype(np.float32) / 255
        s = cv2.GaussianBlur(s, (0, 0), max(1.0, w * SFOCATURA / 4))
        y = 0.2126 * s[..., 0] + 0.7152 * s[..., 1] + 0.0722 * s[..., 2]
        y2 = np.minimum(y * SFONDO_LUCE + np.clip(y - 0.75, 0, 1) * 1.2, LUCI_SFONDO * (1 - np.exp(-y * 2.2)))
        s = np.clip(s * (y2 / np.maximum(y, 1e-4))[..., None] + tinta, 0, 1)
        bg = cv2.resize((s * 255).astype(np.uint8), (w, h), interpolation=cv2.INTER_LINEAR)
        # maschera un filo ristretta (niente alone di sfondo chiaro attorno al corpo) e sfumata
        mp_ = cv2.erode(cv2.resize(m, piccolo, interpolation=cv2.INTER_AREA), nucleo)
        mp_ = cv2.GaussianBlur(mp_, (0, 0), 1.2)
        m1 = cv2.resize(mp_, (w, h), interpolation=cv2.INTER_LINEAR)
        out = cv2.blendLinear(sog, bg, m1, 1 - m1)
        return cv2.multiply(out, vignetta, dtype=cv2.CV_8U)

    with vision.ImageSegmenter.create_from_options(opzioni) as seg:
        fotogrammi, coperture, n, prima = [], [], 0, None
        scrivi = None
        while True:
            buf = leggi.stdout.read(w * h * 3)
            if len(buf) < w * h * 3:
                break
            img = np.frombuffer(buf, np.uint8).reshape(h, w, 3)
            mezza = cv2.resize(img, (w // 2, h // 2), interpolation=cv2.INTER_AREA)
            r = seg.segment_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=mezza), int(n * 1000 / eval(fps)))
            m = np.clip((1.0 - r.confidence_masks[0].numpy_view() - 0.35) / 0.3, 0, 1).astype(np.float32)
            m = m if prima is None else 0.55 * m + 0.45 * prima  # niente sfarfallio del bordo
            prima = m
            n += 1
            if scrivi is None:
                # decisione sui primi 10 fotogrammi: c'è una persona, né troppo piccola né a tutto schermo?
                fotogrammi.append((img.copy(), m))
                coperture.append(float(m.mean()))
                if len(fotogrammi) < 10:
                    continue
                cop = float(np.median(coperture))
                if not (COPERTURA[0] < cop < COPERTURA[1]):
                    leggi.kill()
                    print(f'saltato (persona {cop:.0%} dell\'inquadratura)')
                    return
                scrivi = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{w}x{h}', '-r', fps, '-i', '-',
                                           *(['-i', src, '-map', '0:v', '-map', '1:a', '-c:a', 'copy'] if audio else []),
                                           '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-pix_fmt', 'yuv420p', out], stdin=subprocess.PIPE)
                for f, mm in fotogrammi:
                    scrivi.stdin.write(componi(f, mm).tobytes())
                fotogrammi = []
                continue
            scrivi.stdin.write(componi(img, m).tobytes())
    if scrivi is None:  # pezzo cortissimo: decisione su quello che c'è
        cop = float(np.median(coperture)) if coperture else 0
        if not (COPERTURA[0] < cop < COPERTURA[1]):
            print(f'saltato (persona {cop:.0%} dell\'inquadratura)')
            return
        scrivi = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{w}x{h}', '-r', fps, '-i', '-',
                                   *(['-i', src, '-map', '0:v', '-map', '1:a', '-c:a', 'copy'] if audio else []),
                                   '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-pix_fmt', 'yuv420p', out], stdin=subprocess.PIPE)
        for f, mm in fotogrammi:
            scrivi.stdin.write(componi(f, mm).tobytes())
    scrivi.stdin.close()
    scrivi.wait()
    leggi.wait()
    print(f'risalto: {n} fotogrammi {w}x{h}')


if __name__ == '__main__':
    main()

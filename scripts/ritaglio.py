#!/usr/bin/env python3
# Ritaglio della persona da una clip: video con canale alfa (WebM VP9) con solo la persona,
# messo sopra le scritte grandi così sembrano passare dietro a Denis.
# Segmentazione MediaPipe (modello selfie multiclass: tutto tranne lo sfondo = persona).
#
# Uso: python3 ritaglio.py <clip.mp4> <uscita.webm> <modello.tflite> [durata_s] [inizio_s]

import subprocess
import sys

import numpy as np
import mediapipe as mp
from mediapipe.tasks.python import BaseOptions
from mediapipe.tasks.python import vision


def main():
    src, out, modello = sys.argv[1], sys.argv[2], sys.argv[3]
    durata = sys.argv[4] if len(sys.argv) > 4 else None
    inizio = sys.argv[5] if len(sys.argv) > 5 else None
    info = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate',
                           '-of', 'csv=p=0', src], capture_output=True, text=True, check=True).stdout.strip().split(',')
    w, h = int(info[0]), int(info[1])
    fps = info[2]
    leggi = subprocess.Popen(['ffmpeg', '-v', 'error', *(['-ss', inizio] if inizio else []), *(['-t', durata] if durata else []), '-i', src, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
                             stdout=subprocess.PIPE)
    scrivi = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', f'{w}x{h}', '-r', fps, '-i', '-',
                               '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '6M', '-deadline', 'realtime', '-cpu-used', '8',
                               '-auto-alt-ref', '0', out], stdin=subprocess.PIPE)
    opzioni = vision.ImageSegmenterOptions(base_options=BaseOptions(model_asset_path=modello),
                                           running_mode=vision.RunningMode.VIDEO, output_confidence_masks=True)
    n = 0
    with vision.ImageSegmenter.create_from_options(opzioni) as seg:
        while True:
            buf = leggi.stdout.read(w * h * 3)
            if len(buf) < w * h * 3:
                break
            img = np.frombuffer(buf, np.uint8).reshape(h, w, 3)
            r = seg.segment_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=img), int(n * 1000 / eval(fps)))
            # maschera 0 = sfondo: la persona è 1 - sfondo; bordi morbidi ma netti
            sfondo = r.confidence_masks[0].numpy_view()
            alfa = np.clip((1.0 - sfondo - 0.35) / 0.3, 0, 1)
            rgba = np.dstack([img, (alfa * 255).astype(np.uint8)])
            scrivi.stdin.write(rgba.tobytes())
            n += 1
    scrivi.stdin.close()
    scrivi.wait()
    leggi.wait()
    print(f'ritaglio: {n} fotogrammi {w}x{h}')


if __name__ == '__main__':
    main()

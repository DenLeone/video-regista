# Rotolo: dove sta il viso del presentatore nel video, nel tempo (per il ritaglio della lastra).
#   python pc/rotolo/viso.py <video> <viso.json> [--passo 0.25]   (VISO_FISSO="0.52,0.44" senza modello)
# Scrive {"w","h","punti":[{"t","x","y","s"}]} con x, y (centro del viso) e s (altezza del viso) in frazioni
# del fotogramma. Rilevamento OpenCV (YuNet) su fotogrammi ridotti, poi buchi riempiti
# e percorso ammorbidito: il ritaglio segue la persona senza tremare.
import json, subprocess, sys
import numpy as np
import cv2

video, uscita = sys.argv[1:3]
passo = float(sys.argv[sys.argv.index('--passo') + 1]) if '--passo' in sys.argv else 0.25
info = json.loads(subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration',
                                  '-of', 'json', video], capture_output=True, text=True).stdout)
W, H = info['streams'][0]['width'], info['streams'][0]['height']
dur = float(info['format']['duration'])
LW = 540; LH = int(round(H * LW / W / 2) * 2)
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', video, '-vf', f'fps={1 / passo},scale={LW}:{LH},format=gray', '-f', 'rawvideo', '-'],
                     capture_output=True).stdout
fot = np.frombuffer(raw, np.uint8).reshape(-1, LH, LW)
# YuNet (OpenCV 5): modello in pc/rotolo/modelli/face_detection_yunet_2023mar.onnx (o VISO_MODELLO).
# Senza modello: posizione fissa (VISO_FISSO="x,y", default centro, un po' sopra la metà).
import os
MODELLO = os.environ.get('VISO_MODELLO') or os.path.join(os.path.dirname(os.path.abspath(__file__)), 'modelli', 'face_detection_yunet_2023mar.onnx')
punti = []
if os.path.exists(MODELLO):
    det = cv2.FaceDetectorYN.create(MODELLO, '', (LW, LH), 0.7)
    ultimo = None
    for i, g in enumerate(fot):
        img = cv2.cvtColor(g, cv2.COLOR_GRAY2BGR)
        _, facce = det.detect(img)
        trovati = [] if facce is None else [(f[0] + f[2] / 2, f[1] + f[3] / 2, f[3]) for f in facce]
        if trovati:
            if ultimo: trovati.sort(key=lambda f: (f[0] - ultimo[0]) ** 2 + (f[1] - ultimo[1]) ** 2)
            else: trovati.sort(key=lambda f: -f[2])
            ultimo = trovati[0]
            punti.append({'t': round(i * passo, 3), 'x': ultimo[0] / LW, 'y': ultimo[1] / LH, 's': ultimo[2] / LH})
        else:
            punti.append({'t': round(i * passo, 3), 'x': None, 'y': None, 's': None})
else:
    fx, fy = (float(v) for v in os.environ.get('VISO_FISSO', '0.5,0.42').split(','))
    print(f'modello YuNet assente: viso fisso a {fx:.2f}, {fy:.2f}')
    punti = [{'t': 0, 'x': fx, 'y': fy, 's': 0.1}, {'t': round(dur, 3), 'x': fx, 'y': fy, 's': 0.1}]

trovati = [p for p in punti if p['x'] is not None]
if not trovati:
    print('nessun viso trovato: uso il centro alto del fotogramma')
    punti = [{'t': 0, 'x': 0.5, 'y': 0.4, 's': 0.12}, {'t': dur, 'x': 0.5, 'y': 0.4, 's': 0.12}]
else:
    # buchi: interpolazione lineare; poi media mobile di ~1,5 s (il ritaglio non deve inseguire ogni scatto)
    ts = np.array([p['t'] for p in punti])
    for k in ('x', 'y', 's'):
        noti = np.array([[p['t'], p[k]] for p in punti if p[k] is not None])
        v = np.interp(ts, noti[:, 0], noti[:, 1])
        n = max(1, int(round(1.5 / passo)))
        pad = np.pad(v, (n, n), mode='edge')
        v = np.convolve(pad, np.ones(2 * n + 1) / (2 * n + 1), 'valid')
        for p, val in zip(punti, v): p[k] = round(float(val), 4)
json.dump({'w': W, 'h': H, 'durata': dur, 'punti': punti}, open(uscita, 'w'), indent=0)
print(f'viso: {len(trovati)}/{len(punti)} fotogrammi con un viso -> {uscita}')

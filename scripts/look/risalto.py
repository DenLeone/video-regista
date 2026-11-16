#!/usr/bin/env python3
# "Soggetto in risalto" (stile 12K Quality, 19/10): sul pezzo già colorato (LUT teal e arancio)
# la persona resta luminosa, calda e nitida, lo sfondo scende al buio tenendo le luci e vira al
# petrolio; sfocato solo se richiesto (Denis lo sfoca lui se serve). Persona = MediaPipe selfie multiclass,
# come per le scritte dietro (ritaglio.py). Se nei primi fotogrammi non c'è una persona chiara
# (dettaglio di prodotto, primo piano strettissimo) il pezzo resta com'è.
#
# Uso: python3 risalto.py <pezzo.mp4> <uscita.mp4> <modello.tflite> [sfoca] [naturale[:luce]]   → stampa "risalto" o "saltato"
# «naturale» (documentario verticale, 16/11: «colore naturale, il back separato, non stile Netflix»): persona un filo
# più calda, sfondo solo un po' più scuro (luce, predefinita 0,78) e senza tinta petrolio, vignettatura leggera.

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
# soggetto: i medi tornano su (la LUT li abbassa per lo sfondo) e un filo più caldi; in più il
# volto (pelle del viso, classe 3 di MediaPipe) va sempre alla stessa luminosità: con la giacca
# nera e lo sfondo buio la prima prova lo lasciava troppo scuro (Giacca autunnale, 19/10)
CURVA_SOGGETTO = ([0, 0.03, 0.1, 0.25, 0.45, 0.7, 1], [0, 0.04, 0.15, 0.36, 0.58, 0.8, 1])
CALDO = (1.015, 1.0, 0.985)
# toglie dal soggetto, PRIMA di schiarirlo, il petrolio che la LUT mette nelle ombre (stessi numeri
# di OMBRE in teal_arancio.py, di segno opposto): schiarito, diventava blu elettrico (19/10)
OMBRE_SOGGETTO = (0.0, 0.0, 0.0)
NITIDEZZA = 0.45                       # maschera di contrasto sul soggetto (la "qualità" degli esempi)
VOLTO = 0.5          # luminosità del viso a cui portare il soggetto (0–1)
MAX_SCHIARITA = 2.0  # al massimo il doppio: un volto in ombra (0,07) portato a 0,5 diventava rumore e blu
COPERTURA = (0.04, 0.62)  # quota di persona nell'inquadratura per cui ha senso


def info(src):
    j = json.loads(subprocess.run(['ffprobe', '-v', 'error', '-print_format', 'json', '-show_streams', src], capture_output=True, text=True, check=True).stdout)
    v = next(s for s in j['streams'] if s['codec_type'] == 'video')
    return int(v['width']), int(v['height']), v['r_frame_rate'], any(s['codec_type'] == 'audio' for s in j['streams'])


NATURALE = False


def naturale(luce=0.78):
    # 16/11, Denis sulle prime clip: «vedo un alone strano». Cause: la persona veniva SCHIARITA (viso portato a
    # 0,48, fino al doppio) mentre lo sfondo scendeva, quindi sul bordo la differenza era ben più del 20%; il
    # bordo era quello grezzo di MediaPipe (256 px) ristretto di ~16 px (riga scura attorno a capelli e spalle);
    # in più nitidezza e scia nei movimenti. Ora: la persona resta COM'È (solo un filo più calda), lo sfondo
    # scende della sola luce chiesta, e il bordo segue i contorni veri dell'immagine (filtro guidato).
    global NATURALE, SFONDO_LUCE, LUCI_SFONDO, SFONDO_TINTA, VIGNETTA, CURVA_SOGGETTO, CALDO, NITIDEZZA
    NATURALE = True
    SFONDO_LUCE, LUCI_SFONDO, SFONDO_TINTA, VIGNETTA = luce, 1.0, (0.0, 0.0, 0.0), 0.12
    CURVA_SOGGETTO = ([0, 1], [0, 1])
    CALDO, NITIDEZZA = (1.01, 1.0, 0.99), 0


def guidata(guida, p, r, eps=1e-3):
    # filtro guidato (He et al.): la maschera `p` prende i bordi dell'immagine `guida` (grigio 0–1)
    k = (2 * r + 1, 2 * r + 1)
    mg, mp_ = cv2.blur(guida, k), cv2.blur(p, k)
    a = (cv2.blur(guida * p, k) - mg * mp_) / (cv2.blur(guida * guida, k) - mg * mg + eps)
    b = mp_ - a * mg
    return np.clip(cv2.blur(a, k) * guida + cv2.blur(b, k), 0, 1)


def main():
    src, out, modello = sys.argv[1], sys.argv[2], sys.argv[3]
    sfoca = 'sfoca' in sys.argv[4:]
    for a in sys.argv[4:]:
        if a.startswith('naturale'):
            naturale(float(a.split(':')[1]) if ':' in a else 0.78)
    w, h, fps, audio = info(src)
    leggi = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', src, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE)
    opzioni = vision.ImageSegmenterOptions(base_options=BaseOptions(model_asset_path=modello),
                                           running_mode=vision.RunningMode.VIDEO, output_confidence_masks=True)
    x = np.arange(256, dtype=np.float32) / 255
    def tabella(volto=None):
        # senza volto: la curva fissa; con il volto: curva che porta il viso a VOLTO tenendo i neri
        # al loro posto (un guadagno uniforme schiariva la giacca nera fino al blu)
        if volto is None:
            xs, ys = CURVA_SOGGETTO
        else:
            v = float(np.clip(volto, 0.05, 0.6))
            dove = min(max(v, VOLTO), v * MAX_SCHIARITA)
            xs, ys = [0, 0.04, v, min(0.97, v + 0.3), 1], [0, 0.04, dove, min(0.985, dove + 0.28), 1]
        canali = []
        for k, o in zip(CALDO, OMBRE_SOGGETTO):
            neutro = np.clip(x + o * (1 - x) ** 2, 0, 1)
            canali.append(np.clip(np.interp(np.clip(neutro * k, 0, 1), xs, ys) * 255, 0, 255).astype(np.uint8))
        return np.dstack(canali).reshape(256, 1, 3)
    tab = tabella()
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    r = np.sqrt(((xx - w / 2) / (w / 2)) ** 2 + ((yy - h * 0.45) / (h / 2)) ** 2)
    vignetta = cv2.merge([(1 - VIGNETTA * np.clip(r - 0.55, 0, 1) ** 1.5).astype(np.float32)] * 3)
    piccolo = (max(2, w // 4), max(2, h // 4))
    tinta = np.array(SFONDO_TINTA, np.float32)
    nucleo = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))  # bordo ristretto: niente cielo chiaro attorno alle spalle

    yb = np.minimum(x * SFONDO_LUCE + np.clip(x - 0.75, 0, 1) * 1.2, LUCI_SFONDO * (1 - np.exp(-x * 2.2)))
    if NATURALE:
        yb = x * SFONDO_LUCE  # solo meno luce, uguale su tutti i toni: i colori dello sfondo non cambiano
    tab_sfondo = np.dstack([np.clip((yb + t) * 255, 0, 255).astype(np.uint8) for t in SFONDO_TINTA]).reshape(256, 1, 3)

    def componi(img, m):
        sog = cv2.LUT(img, tab)
        if NITIDEZZA:
            sog = cv2.addWeighted(sog, 1 + NITIDEZZA, cv2.GaussianBlur(sog, (0, 0), 1.4), -NITIDEZZA, 0)
        if sfoca:
            s = cv2.resize(img, piccolo, interpolation=cv2.INTER_AREA).astype(np.float32) / 255
            s = cv2.GaussianBlur(s, (0, 0), max(1.0, w * SFOCATURA / 4))
            y = 0.2126 * s[..., 0] + 0.7152 * s[..., 1] + 0.0722 * s[..., 2]
            y2 = np.minimum(y * SFONDO_LUCE + np.clip(y - 0.75, 0, 1) * 1.2, LUCI_SFONDO * (1 - np.exp(-y * 2.2)))
            s = np.clip(s * (y2 / np.maximum(y, 1e-4))[..., None] + tinta, 0, 1)
            bg = cv2.resize((s * 255).astype(np.uint8), (w, h), interpolation=cv2.INTER_LINEAR)
        else:
            bg = cv2.LUT(img, tab_sfondo)
        if NATURALE:
            # bordo sui contorni veri (a metà risoluzione), senza restringere: niente riga scura né alone chiaro
            mm = np.squeeze(m).astype(np.float32)
            grigio = cv2.cvtColor(cv2.resize(img, (mm.shape[1], mm.shape[0]), interpolation=cv2.INTER_AREA), cv2.COLOR_RGB2GRAY).astype(np.float32) / 255
            # due passate con una curva in mezzo: una maschera spostata di 6 px torna sul contorno vero (provato su
            # maschere finte); dove persona e sfondo hanno la stessa luce resta una sfumatura morbida di ~20 px
            r = max(4, mm.shape[1] // 45)
            netta = lambda v: np.clip((v - 0.2) / 0.5, 0, 1)
            mm = netta(guidata(grigio, netta(guidata(grigio, mm, r)), r))
            mm = cv2.GaussianBlur(mm, (0, 0), 0.8)
            m1 = cv2.resize(mm, (w, h), interpolation=cv2.INTER_LINEAR)
            return cv2.multiply(cv2.blendLinear(sog, bg, m1, 1 - m1), vignetta, dtype=cv2.CV_8U)
        # maschera un filo ristretta (niente alone di sfondo chiaro attorno al corpo) e sfumata
        mp_ = cv2.erode(cv2.resize(m, piccolo, interpolation=cv2.INTER_AREA), nucleo)
        mp_ = cv2.GaussianBlur(mp_, (0, 0), 1.2)
        m1 = cv2.resize(mp_, (w, h), interpolation=cv2.INTER_LINEAR)
        out = cv2.blendLinear(sog, bg, m1, 1 - m1)
        return cv2.multiply(out, vignetta, dtype=cv2.CV_8U)

    def imposta_volto(volti):
        if not volti or NATURALE:  # naturale: la persona non si schiarisce
            return tab
        v = float(np.median(volti))
        print(f'volto {v:.2f} → {min(max(v, VOLTO), v * MAX_SCHIARITA):.2f}', file=sys.stderr)
        return tabella(float(np.median(volti)))

    with vision.ImageSegmenter.create_from_options(opzioni) as seg:
        fotogrammi, coperture, volti, n, prima = [], [], [], 0, None
        scrivi = None
        while True:
            buf = leggi.stdout.read(w * h * 3)
            if len(buf) < w * h * 3:
                break
            img = np.frombuffer(buf, np.uint8).reshape(h, w, 3)
            mezza = cv2.resize(img, (w // 2, h // 2), interpolation=cv2.INTER_AREA)
            r = seg.segment_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=mezza), int(n * 1000 / eval(fps)))
            m = np.clip((1.0 - r.confidence_masks[0].numpy_view() - 0.35) / 0.3, 0, 1).astype(np.float32)
            pm = 0.25 if NATURALE else 0.45  # naturale: meno memoria, niente scia quando gesticola
            m = m if prima is None else (1 - pm) * m + pm * prima  # niente sfarfallio del bordo
            if scrivi is None:
                viso = np.squeeze(r.confidence_masks[3].numpy_view()) > 0.5
                if viso.sum() > 200:
                    luma = cv2.cvtColor(mezza, cv2.COLOR_RGB2GRAY)
                    volti.append(float(np.median(luma[viso])) / 255)
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
                tab = imposta_volto(volti)
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
        tab = imposta_volto(volti)
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

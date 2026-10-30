"""Trascrizione sul PC di Denis (video YouTube lunghi): faster-whisper large-v3 sulla scheda video.

Stesso formato della trascrizione su Groq in regista.mjs: [{"w": parola, "s": inizio, "e": fine}].
Senza scheda video (o senza le librerie CUDA) va sul processore, più lento ma uguale.

  python pc/trascrivi.py <video o audio> <uscita.json> [--lingua it] [--nomi "Ajazz, AK980"] [--modello large-v3]
  python pc/trascrivi.py --prova      (carica il modello e dice se usa la scheda video)
  python pc/trascrivi.py --lista lavori.json   ([{"file": ..., "uscita": ...}]: il modello si carica una volta sola)
"""
import argparse
import json
import os
import sys
import time
import warnings
from pathlib import Path

# Windows senza modalità sviluppatore: la cache di Hugging Face avvisa dei symlink a ogni avvio (innocuo)
os.environ.setdefault('HF_HUB_DISABLE_SYMLINKS_WARNING', '1')
warnings.filterwarnings('ignore', message='.*symlinks.*')


def librerie_cuda():
    # su Windows le DLL di cuBLAS/cuDNN installate con pip (nvidia-cublas-cu12, nvidia-cudnn-cu12)
    # stanno in site-packages/nvidia/*/bin e vanno rese visibili prima di caricare il modello
    if os.name != 'nt':
        return
    try:
        import nvidia  # noqa: F401
    except ImportError:
        return
    base = Path(sys.modules['nvidia'].__path__[0])
    for cartella in base.glob('*/bin'):
        os.add_dll_directory(str(cartella))
        os.environ['PATH'] = f"{cartella}{os.pathsep}{os.environ.get('PATH', '')}"


def modello(nome):
    from faster_whisper import WhisperModel
    try:
        return WhisperModel(nome, device='cuda', compute_type='float16'), 'scheda video'
    except Exception as e:  # niente CUDA: processore
        print(f'[trascrivi] scheda video non disponibile ({str(e).splitlines()[0]}), uso il processore', file=sys.stderr)
        return WhisperModel(nome, device='cpu', compute_type='int8'), 'processore'


def audio(file):
    # l'audio lo estrae ffmpeg (16 kHz mono): la lettura interna di faster-whisper passa da PyAV, che
    # dalla versione 14 rifiuta un'opzione (metadata_errors, 30/10: nessun video trascritto)
    import subprocess
    import numpy as np
    # più tracce audio (iPhone recenti: audio spaziale che ffmpeg non sempre legge + stereo): la prima che va
    for k in range(4):
        r = subprocess.run(['ffmpeg', '-v', 'error', '-nostdin', '-i', str(file), '-map', f'0:a:{k}', '-vn', '-ac', '1', '-ar', '16000', '-f', 'f32le', '-'],
                           capture_output=True)
        if r.returncode == 0 and r.stdout:
            return np.frombuffer(r.stdout, dtype=np.float32)
    raise RuntimeError('nessuna traccia audio leggibile')


def trascrivi(m, file, lingua='it', nomi=''):
    segmenti, info = m.transcribe(
        audio(file), language=None if lingua in ('', 'auto') else lingua, word_timestamps=True,
        initial_prompt=nomi or None, vad_filter=True, beam_size=5,
    )
    parole = []
    for seg in segmenti:
        for w in seg.words or []:
            parole.append({'w': w.word, 's': round(w.start, 2), 'e': round(w.end, 2)})
    return parole, info


def main():
    if len(sys.argv) == 3 and sys.argv[1] == '--lista':
        librerie_cuda()
        m, dove = modello(os.environ.get('WHISPER_MODELLO', 'large-v3'))
        lavori = json.loads(Path(sys.argv[2]).read_text(encoding='utf-8'))
        for i, l in enumerate(lavori):
            t0 = time.time()
            try:
                parole, info = trascrivi(m, l['file'], l.get('lingua', 'it'), l.get('nomi', ''))
            except Exception as e:  # un file rovinato non ferma gli altri
                print(f'[trascrivi] {Path(l["file"]).name}: non riuscita ({e})', file=sys.stderr)
                continue
            Path(l['uscita']).write_text(json.dumps(parole, ensure_ascii=False), encoding='utf-8')
            print(f'[trascrivi] {i + 1}/{len(lavori)} {Path(l["file"]).name}: {len(parole)} parole in {time.time() - t0:.0f} s ({dove})', file=sys.stderr)
        return
    if sys.argv[1:] == ['--prova']:
        librerie_cuda()
        _, dove = modello(os.environ.get('WHISPER_MODELLO', 'large-v3'))
        print(f'whisper pronto, su {dove}')
        return
    a = argparse.ArgumentParser()
    a.add_argument('file')
    a.add_argument('uscita')
    a.add_argument('--lingua', default='it')
    a.add_argument('--nomi', default='')
    a.add_argument('--modello', default=os.environ.get('WHISPER_MODELLO', 'large-v3'))
    o = a.parse_args()
    librerie_cuda()
    t0 = time.time()
    m, dove = modello(o.modello)
    parole, info = trascrivi(m, o.file, o.lingua, o.nomi)
    Path(o.uscita).write_text(json.dumps(parole, ensure_ascii=False), encoding='utf-8')
    print(f'[trascrivi] {len(parole)} parole, {info.duration:.0f} s di audio in {time.time() - t0:.0f} s ({dove}, {o.modello})', file=sys.stderr)


if __name__ == '__main__':
    main()

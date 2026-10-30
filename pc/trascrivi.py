"""Trascrizione sul PC di Denis (video YouTube lunghi): faster-whisper large-v3 sulla scheda video.

Stesso formato della trascrizione su Groq in regista.mjs: [{"w": parola, "s": inizio, "e": fine}].
Senza scheda video (o senza le librerie CUDA) va sul processore, più lento ma uguale.

  python pc/trascrivi.py <video o audio> <uscita.json> [--lingua it] [--nomi "Ajazz, AK980"] [--modello large-v3]
  python pc/trascrivi.py --prova      (carica il modello e dice se usa la scheda video)
"""
import argparse
import json
import os
import sys
import time
from pathlib import Path


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


def main():
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
    segmenti, info = m.transcribe(
        o.file, language=None if o.lingua in ('', 'auto') else o.lingua, word_timestamps=True,
        initial_prompt=o.nomi or None, vad_filter=True, beam_size=5,
    )
    parole = []
    for seg in segmenti:
        for w in seg.words or []:
            parole.append({'w': w.word, 's': round(w.start, 2), 'e': round(w.end, 2)})
    Path(o.uscita).write_text(json.dumps(parole, ensure_ascii=False), encoding='utf-8')
    print(f'[trascrivi] {len(parole)} parole, {info.duration:.0f} s di audio in {time.time() - t0:.0f} s ({dove}, {o.modello})', file=sys.stderr)


if __name__ == '__main__':
    main()

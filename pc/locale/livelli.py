# Timeline DaVinci a livelli: il video vero sotto (V1, con il suo audio) e la grafica trasparente sopra (V2,
# ProRes 4444 con alfa renderizzato da Remotion con "soloGrafica").
#   python pc/locale/livelli.py <video> <grafica.mov> [--tagli tagli.json] [--lastra lastra.json] [--nome X] [--progetto "Regista locale"]
# --audio sfx.wav,musica.wav,ambiente.wav: su A2, A3, A4. --voce voce.wav: voce sincronizzata su A1.
# Timeline al frame rate del progetto (= della grafica), il video può averne un altro (59,94 → 29,97).
# --tagli: il video su V1 (e l'audio su A1) è quello tagliato dal passo 2; la grafica e la lastra sono sui tempi tagliati.
# --lastra: tratti da pc/locale/lastra.mjs; il video su V1 si sposta e si ingrandisce come la lastra di Remotion.
# DaVinci Resolve Studio aperto, Preferenze → Sistema → Generale → External scripting using: Local.
# Timeline con la risoluzione del video; la grafica (anche a risoluzione più bassa) si adatta allo schermo.
import json, os, subprocess, sys
sys.stdout.reconfigure(encoding='utf-8')
from fractions import Fraction

args = sys.argv[1:]
def opz(k, d=None):
    return args[args.index(k) + 1] if k in args else d
if len(args) < 2:
    sys.exit('uso: python pc/locale/livelli.py <video> <grafica.mov> [--nome X]')
video, grafica = os.path.abspath(args[0]), os.path.abspath(args[1])
for f in (video, grafica):
    if not os.path.exists(f): sys.exit(f'manca {f}')

if sys.platform == 'win32':
    os.environ.setdefault('RESOLVE_SCRIPT_API', os.path.join(os.environ.get('PROGRAMDATA', r'C:\ProgramData'), 'Blackmagic Design', 'DaVinci Resolve', 'Support', 'Developer', 'Scripting'))
    os.environ.setdefault('RESOLVE_SCRIPT_LIB', r'C:\Program Files\Blackmagic Design\DaVinci Resolve\fusionscript.dll')
sys.path.append(os.path.join(os.environ['RESOLVE_SCRIPT_API'], 'Modules'))
import DaVinciResolveScript as dvr
# DaVinci può essere appena stato aperto (pc/locale/documentario.mjs): si aspetta fino a 3 minuti che risponda
import time
# se DaVinci resta bloccato all'avvio lo chiude e lo riapre (pc/locale/davinci_locale.py)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from davinci_locale import connetti
resolve = connetti()

def sonda(f):
    return json.loads(subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate',
                                      '-of', 'json', f], capture_output=True, text=True).stdout)['streams'][0]
iv, ig = sonda(video), sonda(grafica)
fps_src = Fraction(iv['r_frame_rate'])                    # fotogrammi del video (es. 59,94)
NOMI_FPS = {Fraction(24000, 1001): '23.976', Fraction(30000, 1001): '29.97', Fraction(60000, 1001): '59.94'}
DA_NOME = {v: k for k, v in NOMI_FPS.items()}

pm = resolve.GetProjectManager()
nome_progetto = opz('--progetto', 'Regista locale')
progetto = pm.LoadProject(nome_progetto) or pm.CreateProject(nome_progetto)
if not progetto.GetTimelineCount():
    # progetto nuovo: frame rate della grafica (Remotion la rende al frame rate scelto per la timeline)
    progetto.SetSetting('timelineFrameRate', NOMI_FPS.get(Fraction(ig['r_frame_rate']), str(int(round(float(Fraction(ig['r_frame_rate'])))))))
nome_fps = progetto.GetSetting('timelineFrameRate')
fps = DA_NOME.get(nome_fps) or Fraction(nome_fps)         # fotogrammi della timeline (es. 29,97)
fps_resolve = nome_fps
if abs(float(Fraction(ig['r_frame_rate'])) - float(fps)) > 0.001:
    print(f'[livelli] attenzione: grafica a {float(Fraction(ig["r_frame_rate"])):.3f} fps, timeline a {float(fps):.3f}: la grafica scivola nel tempo')
mp = progetto.GetMediaPool()

def prendi(f):
    for c in mp.GetRootFolder().GetClipList() or []:
        if os.path.normcase(c.GetClipProperty('File Path') or '') == os.path.normcase(f):
            return c
    r = mp.ImportMedia([f])
    return r[0] if r else None
cv, cg = prendi(video), prendi(grafica)
if not cv or not cg: sys.exit('importazione non riuscita')

nome = opz('--nome', os.path.splitext(os.path.basename(grafica))[0])
nomi = {progetto.GetTimelineByIndex(i + 1).GetName() for i in range(progetto.GetTimelineCount())}
nome_tl, k = nome, 2
while nome_tl in nomi:
    nome_tl = f'{nome} {k}'; k += 1
tl = mp.CreateEmptyTimeline(nome_tl)
progetto.SetCurrentTimeline(tl)
tl.SetSetting('useCustomSettings', '1')
# risoluzione: quella della lastra (verticale 2160×3840 anche per un video orizzontale) o del video
file_lastra = opz('--lastra')
dati_lastra = json.load(open(file_lastra, encoding='utf8')) if file_lastra else {}
TW, TH = int(opz('--w', dati_lastra.get('w', iv['width']))), int(opz('--h', dati_lastra.get('h', iv['height'])))
tl.SetSetting('timelineResolutionWidth', str(TW))
tl.SetSetting('timelineResolutionHeight', str(TH))
while tl.GetTrackCount('video') < 2:
    tl.AddTrack('video')
inizio = tl.GetStartFrame()
import math
file_tagli = opz('--tagli')
# --voce: voce registrata a parte, già sincronizzata (pc/locale/sincronizza.py): va su A1 al posto dell'audio della camera
file_voce = opz('--voce')
cvoce = prendi(os.path.abspath(file_voce)) if file_voce else None
r = Fraction(fps_src) / Fraction(fps)                       # fotogrammi del video per fotogramma di timeline
# tagli (pc/locale/pulizia.mjs): i tratti tenuti del video, in fotogrammi della sorgente, uno dopo l'altro sul video
# tagliato. Arrotondamento come in timeline.py: mai dentro il parlato.
segmenti = []  # (inizio sul tagliato, fine sul tagliato, inizio in secondi nella sorgente): fotogrammi di TIMELINE
if file_tagli:
    cum = 0
    for t in json.load(open(file_tagli, encoding='utf8'))['tieni']:
        a_, b_ = round(t['da'] * fps), round(t['a'] * fps)
        if 'parlaDa' in t and a_ / fps > t['parlaDa'] - 0.005: a_ = math.floor(t['da'] * fps)
        if 'parlaA' in t and b_ / fps < t['parlaA'] + 0.005: b_ = math.ceil(t['a'] * fps)
        if b_ > a_:
            segmenti.append((cum, cum + b_ - a_, a_ / fps)); cum += b_ - a_
    print(f'[livelli] tagli: {len(segmenti)} tratti tenuti, {cum / float(fps):.1f} s')
def sorgente(da, a):
    # [da, a) sul video tagliato (fotogrammi di timeline) → pezzi (inizio, fine) in fotogrammi del VIDEO + posizione
    if not segmenti: return [(round(da * r), round(a * r), da)]
    out = []
    for ca, cb, ss in segmenti:
        x, y = max(da, ca), min(a, cb)
        if y > x:
            base = ss * fps_src                      # inizio del tratto in fotogrammi del video
            out.append((round(base + (x - ca) * r), round(base + (y - ca) * r), x))
    return out
if file_lastra or segmenti:
    # il presentatore si muove come la lastra di Remotion (pc/locale/lastra.mjs): V1 a pezzi, ognuno con la sua
    # trasformazione (Zoom/Pan/Tilt della pagina Edit); l'audio intero su A1
    if file_lastra:
        tratti = json.load(open(file_lastra, encoding='utf8'))['tratti']
    else:
        tot = segmenti[-1][1]
        tratti = [{'da': 0, 'a': tot, 'zoom': 1.0, 'pan': 0, 'tilt': 0}]
    # Misurato con un render (immagine bianca 3840×2160 in timeline 2160×3840): Pan sposta 1:1 in pixel di timeline,
    # Tilt solo di (TW/TH)/(larghezza/altezza del video) = 0,316 per un video orizzontale in verticale (1 se le
    # proporzioni coincidono). I tratti sono in pixel di timeline: il Tilt si divide per quel fattore.
    k_tilt = (TW / TH) / (iv['width'] / iv['height'])
    # V1: ogni tratto di movimento incrociato con i tratti tenuti; ogni pezzo con la sua trasformazione
    pezzi, trasf = [], []
    for t in tratti:
        for sa, sb, ca in sorgente(t['da'], t['a']):
            pezzi.append({'mediaPoolItem': cv, 'startFrame': sa, 'endFrame': sb, 'trackIndex': 1, 'mediaType': 1, 'recordFrame': inizio + ca})
            trasf.append(t)
    messi = mp.AppendToTimeline(pezzi) or []
    sbagliati = 0
    for it, t in zip(messi, trasf):
        if not it.SetProperties({'ZoomX': t['zoom'], 'ZoomY': t['zoom'], 'Pan': float(t['pan']), 'Tilt': float(t['tilt']) / k_tilt}):
            sbagliati += 1
    # A1: l'audio, un pezzo per tratto tenuto (o intero senza tagli)
    # (per un file audio Resolve conta in fotogrammi di timeline; per il video in fotogrammi del video)
    if cvoce:
        audio = [{'mediaPoolItem': cvoce, 'startFrame': round(ss * fps), 'endFrame': round(ss * fps) + cb - ca, 'trackIndex': 1, 'mediaType': 2, 'recordFrame': inizio + ca} for ca, cb, ss in segmenti]             or [{'mediaPoolItem': cvoce, 'trackIndex': 1, 'mediaType': 2, 'recordFrame': inizio}]
    else:
        audio = [{'mediaPoolItem': cv, 'startFrame': round(ss * fps_src), 'endFrame': round(ss * fps_src + (cb - ca) * r), 'trackIndex': 1, 'mediaType': 2, 'recordFrame': inizio + ca} for ca, cb, ss in segmenti]             or [{'mediaPoolItem': cv, 'trackIndex': 1, 'mediaType': 2, 'recordFrame': inizio}]
    am = mp.AppendToTimeline(audio) or []
    print(f'[livelli] presentatore: {len(messi)} pezzi su V1 (attesi {len(pezzi)})' + (f', {sbagliati} senza trasformazione' if sbagliati else ', tutti trasformati')
          + f'; audio: {len(am)} pezzi su A1 (attesi {len(audio)})')
else:
    mp.AppendToTimeline([{'mediaPoolItem': cv, 'trackIndex': 1, 'recordFrame': inizio}])
mp.AppendToTimeline([{'mediaPoolItem': cg, 'trackIndex': 2, 'mediaType': 1, 'recordFrame': inizio}])
# --audio a.wav,b.wav,…: tracce di suono (sfx, musica, ambiente da pc/rotolo/suoni.py --stems) su A2, A3…, dall'inizio
for k, f in enumerate([x for x in (opz('--audio') or '').split(',') if x]):
    f = os.path.abspath(f)
    while tl.GetTrackCount('audio') < k + 2:
        tl.AddTrack('audio', 'stereo')
    c = prendi(f)
    ok = c and mp.AppendToTimeline([{'mediaPoolItem': c, 'trackIndex': k + 2, 'mediaType': 2, 'recordFrame': inizio}])
    tl.SetTrackName('audio', k + 2, os.path.splitext(os.path.basename(f))[0])
    print(f'[livelli] A{k + 2}: {os.path.basename(f)}' + ('' if ok else ' NON messa'))
v1, v2 = tl.GetItemListInTrack('video', 1) or [], tl.GetItemListInTrack('video', 2) or []

print(f'[livelli] timeline "{nome_tl}" ({TW}x{TH}, {fps_resolve} fps): V1 {len(v1)} clip, V2 {len(v2)} clip'
      + (f', fine V1 {v1[-1].GetEnd() - inizio} e V2 {v2[0].GetDuration()} fotogrammi' if v1 and v2 else ''))

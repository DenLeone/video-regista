# Timeline DaVinci a livelli: il video vero sotto (V1, con il suo audio) e la grafica trasparente sopra (V2,
# ProRes 4444 con alfa renderizzato da Remotion con "soloGrafica").
#   python pc/locale/livelli.py <video> <grafica.mov> [--lastra chiavi.json] [--nome X] [--progetto "Regista locale"]
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
resolve = dvr.scriptapp('Resolve')
if not resolve:
    sys.exit('DaVinci Resolve non risponde: aprilo e controlla External scripting using: Local')

def sonda(f):
    return json.loads(subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate',
                                      '-of', 'json', f], capture_output=True, text=True).stdout)['streams'][0]
iv, ig = sonda(video), sonda(grafica)
fps = Fraction(iv['r_frame_rate'])
fps_resolve = {Fraction(24000, 1001): '23.976', Fraction(30000, 1001): '29.97', Fraction(60000, 1001): '59.94'}.get(fps, str(int(round(float(fps)))))
if Fraction(ig['r_frame_rate']) != fps:
    print(f'[livelli] attenzione: grafica a {float(Fraction(ig["r_frame_rate"])):.3f} fps, video a {float(fps):.3f}: a fine video possono scivolare di un fotogramma')

pm = resolve.GetProjectManager()
nome_progetto = opz('--progetto', 'Regista locale')
progetto = pm.LoadProject(nome_progetto) or pm.CreateProject(nome_progetto)
if not progetto.GetTimelineCount():
    progetto.SetSetting('timelineFrameRate', fps_resolve)
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
tl.SetSetting('timelineResolutionWidth', str(iv['width']))
tl.SetSetting('timelineResolutionHeight', str(iv['height']))
while tl.GetTrackCount('video') < 2:
    tl.AddTrack('video')
inizio = tl.GetStartFrame()
file_lastra = opz('--lastra')
if file_lastra:
    # il presentatore si muove come la lastra di Remotion (pc/locale/lastra.mjs): V1 a pezzi, ognuno con la sua
    # trasformazione (Zoom/Pan/Tilt della pagina Edit); l'audio intero su A1
    tratti = json.load(open(file_lastra, encoding='utf8'))['tratti']
    durata_v = cv.GetClipProperty('Frames')
    pezzi = [{'mediaPoolItem': cv, 'startFrame': t['da'], 'endFrame': t['a'], 'trackIndex': 1, 'mediaType': 1, 'recordFrame': inizio + t['da']}
             for t in tratti if durata_v in (None, '') or t['da'] < int(durata_v)]
    messi = mp.AppendToTimeline(pezzi) or []
    sbagliati = 0
    for it, t in zip(messi, tratti):
        if not it.SetProperties({'ZoomX': t['zoom'], 'ZoomY': t['zoom'], 'Pan': float(t['pan']), 'Tilt': float(t['tilt'])}):
            sbagliati += 1
    mp.AppendToTimeline([{'mediaPoolItem': cv, 'trackIndex': 1, 'mediaType': 2, 'recordFrame': inizio}])
    print(f'[livelli] presentatore: {len(messi)} pezzi su V1 (attesi {len(pezzi)})' + (f', {sbagliati} senza trasformazione' if sbagliati else ', tutti trasformati'))
else:
    mp.AppendToTimeline([{'mediaPoolItem': cv, 'trackIndex': 1, 'recordFrame': inizio}])
mp.AppendToTimeline([{'mediaPoolItem': cg, 'trackIndex': 2, 'mediaType': 1, 'recordFrame': inizio}])
v1, v2 = tl.GetItemListInTrack('video', 1) or [], tl.GetItemListInTrack('video', 2) or []

print(f'[livelli] timeline "{nome_tl}" ({iv["width"]}x{iv["height"]}, {fps_resolve} fps): V1 {len(v1)} clip, V2 {len(v2)} clip'
      + (f', fine V1 {v1[-1].GetEnd() - inizio} e V2 {v2[0].GetDuration()} fotogrammi' if v1 and v2 else ''))

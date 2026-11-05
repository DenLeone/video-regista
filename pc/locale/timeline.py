# Passo 3 del flusso locale: la timeline in DaVinci Resolve dai tagli del passo 2.
#   python pc/locale/timeline.py <cartella -pulizia o tagli.json> [--progetto "Regista locale"] [--nome "BVJM6854"]
# Serve DaVinci Resolve Studio APERTO, con Preferenze → Sistema → Generale → "External scripting using: Local".
# Crea (o apre) il progetto, importa il video originale (piena risoluzione) e costruisce una timeline
# con un clip per ogni tratto da tenere: ogni clip si può allungare a mano, il girato tolto è ai lati.
# Risoluzione e frame rate della timeline = quelli del video. Il nome della timeline non si sovrascrive mai:
# se esiste già si aggiunge " 2", " 3"…
import json, os, subprocess, sys
sys.stdout.reconfigure(encoding='utf-8')
from fractions import Fraction

args = sys.argv[1:]
def opz(k, d=None):
    return args[args.index(k) + 1] if k in args else d
if not args:
    sys.exit('uso: python pc/locale/timeline.py <cartella -pulizia o tagli.json> [--progetto X] [--nome X]')
p = args[0]
file_tagli = os.path.join(p, 'tagli.json') if os.path.isdir(p) else p
tagli = json.load(open(file_tagli, encoding='utf8'))
sorgente = os.path.abspath(tagli['sorgente'])
if not os.path.exists(sorgente):
    sys.exit(f'manca il video: {sorgente}')

# ---------- collegamento a Resolve (scripting esterno)
if sys.platform == 'win32':
    api = os.path.join(os.environ.get('PROGRAMDATA', r'C:\ProgramData'), 'Blackmagic Design', 'DaVinci Resolve', 'Support', 'Developer', 'Scripting')
    lib = r'C:\Program Files\Blackmagic Design\DaVinci Resolve\fusionscript.dll'
else:
    api = '/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Scripting'
    lib = '/Applications/DaVinci Resolve/DaVinci Resolve.app/Contents/Libraries/Fusion/fusionscript.so'
os.environ.setdefault('RESOLVE_SCRIPT_API', api)
os.environ.setdefault('RESOLVE_SCRIPT_LIB', lib)
sys.path.append(os.path.join(os.environ['RESOLVE_SCRIPT_API'], 'Modules'))
import DaVinciResolveScript as dvr
resolve = dvr.scriptapp('Resolve')
if not resolve:
    sys.exit('DaVinci Resolve non risponde: aprilo e controlla Preferenze → Sistema → Generale → External scripting using: Local')

# ---------- il video: frame rate e misure
info = json.loads(subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate',
                                  '-of', 'json', sorgente], capture_output=True, text=True).stdout)['streams'][0]
fps = Fraction(info['r_frame_rate'])
W, H = info['width'], info['height']
# nome del frame rate come lo vuole Resolve
fps_resolve = {Fraction(24000, 1001): '23.976', Fraction(30000, 1001): '29.97', Fraction(60000, 1001): '59.94'}.get(fps, str(int(round(float(fps)))))

nome = opz('--nome', os.path.splitext(os.path.basename(sorgente))[0])
pm = resolve.GetProjectManager()
nome_progetto = opz('--progetto', 'Regista locale')
progetto = pm.LoadProject(nome_progetto) or pm.CreateProject(nome_progetto)
if not progetto:
    sys.exit(f'non riesco ad aprire né a creare il progetto "{nome_progetto}"')
mp = progetto.GetMediaPool()
# il frame rate del progetto si può impostare solo finché non ha timeline
if not progetto.GetTimelineCount():
    progetto.SetSetting('timelineFrameRate', fps_resolve)
    progetto.SetSetting('timelinePlaybackFrameRate', fps_resolve)
if abs(float(progetto.GetSetting('timelineFrameRate') or 0) - float(fps_resolve)) > 0.01:
    print(f'[timeline] attenzione: il progetto è a {progetto.GetSetting("timelineFrameRate")} fps, il video a {fps_resolve}')

# ---------- media: il video originale (una volta sola nel Media Pool)
clip = None
def cerca(cartella):
    for c in cartella.GetClipList() or []:
        if os.path.normcase(c.GetClipProperty('File Path') or '') == os.path.normcase(sorgente):
            return c
    for s in cartella.GetSubFolderList() or []:
        r = cerca(s)
        if r: return r
clip = cerca(mp.GetRootFolder())
if not clip:
    importati = mp.ImportMedia([sorgente])
    if not importati:
        sys.exit(f'Resolve non importa {sorgente}')
    clip = importati[0]

# ---------- timeline: un clip per ogni tratto tenuto, uno dopo l'altro
nomi = {progetto.GetTimelineByIndex(i + 1).GetName() for i in range(progetto.GetTimelineCount())}
nome_tl, k = nome, 2
while nome_tl in nomi:
    nome_tl = f'{nome} {k}'; k += 1
tl = mp.CreateEmptyTimeline(nome_tl)
if not tl:
    sys.exit(f'non riesco a creare la timeline "{nome_tl}"')
progetto.SetCurrentTimeline(tl)
tl.SetSetting('useCustomSettings', '1')
tl.SetSetting('timelineResolutionWidth', str(W))
tl.SetSetting('timelineResolutionHeight', str(H))

# tempi in fotogrammi del video, arrotondati al fotogramma più vicino (endFrame per Resolve è escluso)
pezzi = []
import math
for t in tagli['tieni']:
    a = round(t['da'] * fps)
    b = round(t['a'] * fps)
    # l'arrotondamento non deve mai entrare nel parlato del tratto: in quel caso un fotogramma in più d'aria
    if 'parlaDa' in t and a / fps > t['parlaDa'] - 0.005: a = math.floor(t['da'] * fps)
    if 'parlaA' in t and b / fps < t['parlaA'] + 0.005: b = math.ceil(t['a'] * fps)
    if b > a:
        pezzi.append({'mediaPoolItem': clip, 'startFrame': a, 'endFrame': b})
messi = mp.AppendToTimeline(pezzi) or []
video = tl.GetItemListInTrack('video', 1) or []
durata = (tl.GetEndFrame() - tl.GetStartFrame()) / float(fps)
print(f'[timeline] progetto "{nome_progetto}", timeline "{nome_tl}": {len(video)} clip su V1 (attesi {len(pezzi)}), '
      f'{durata:.1f} s (attesi {tagli["durataPulita"]:.1f} s), {W}x{H} a {fps_resolve} fps')
if len(video) != len(pezzi):
    sys.exit('[timeline] ATTENZIONE: il numero di clip non torna')

# ---------- immagini (passo 4, immagini.json nella cartella -pulizia): su V2, ognuna sulla sua parola
file_imm = os.path.join(os.path.dirname(file_tagli), 'immagini.json')
if os.path.exists(file_imm) and '--senza-immagini' not in args:
    imm = json.load(open(file_imm, encoding='utf8'))
    while tl.GetTrackCount('video') < 2:
        tl.AddTrack('video')
    inizio_tl = tl.GetStartFrame()
    messe = 0
    for e in imm['elementi']:
        f = os.path.join(imm['cartella'], e['file'])
        trovati = [c for c in (mp.GetRootFolder().GetClipList() or []) if os.path.normcase(c.GetClipProperty('File Path') or '') == os.path.normcase(f)]
        mpi = trovati[0] if trovati else (mp.ImportMedia([f]) or [None])[0]
        if not mpi:
            print(f'[timeline] non importata: {f}'); continue
        durata_f = max(1, round(e['durata'] * fps))
        r = mp.AppendToTimeline([{'mediaPoolItem': mpi, 'startFrame': 0, 'endFrame': durata_f, 'trackIndex': 2, 'mediaType': 1,
                                  'recordFrame': inizio_tl + round(e['inizio'] * fps)}])
        if not r:
            print(f'[timeline] non messa: {e["file"]}'); continue
        # le immagini fisse entrano con la durata predefinita di Resolve (5 s): si accorcia il bordo destro
        # subito, prima di mettere la successiva, così non la spinge più avanti
        it = r[0]
        if it.GetDuration() != durata_f:
            it.SetRightOffset(it.GetRightOffset() + it.GetDuration() - durata_f)
        messe += 1
    v2 = tl.GetItemListInTrack('video', 2) or []
    sbagliate = [x.GetName() for x, e in zip(v2, imm['elementi']) if abs(x.GetStart() - inizio_tl - round(e['inizio'] * fps)) > 1 or abs(x.GetDuration() - round(e['durata'] * fps)) > 1]
    print(f'[timeline] immagini su V2: {len(v2)} (attese {len(imm["elementi"])})' + (f'; fuori posto: {", ".join(sbagliate)}' if sbagliate else ', tutte al loro posto'))

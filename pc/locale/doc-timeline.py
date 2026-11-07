# Stile Documentario: timeline in DaVinci col piano sequenza già renderizzato da Remotion.
#   python pc/locale/doc-timeline.py <video.mp4> <voce.wav> <cartella tracce (sfx, musica, ambiente)> [--nome X] [--progetto "Regista locale"]
# V1 il video (verticale 1080×1920), A1 voce, A2 SFX, A3 musica, A4 ambiente: i livelli si ritoccano in Fairlight.
import os, sys, time
sys.stdout.reconfigure(encoding='utf-8')

a = sys.argv[1:]
opz = lambda k, d=None: a[a.index(k) + 1] if k in a else d
video, voce, tracce = [os.path.abspath(x) for x in a[:3]]
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from davinci_locale import connetti
resolve = connetti()
pm = resolve.GetProjectManager()
progetto = pm.LoadProject(opz('--progetto', 'Regista locale')) or pm.CreateProject(opz('--progetto', 'Regista locale'))
if not progetto.GetTimelineCount(): progetto.SetSetting('timelineFrameRate', '29.97')
mp = progetto.GetMediaPool()

def prendi(f):
    for c in mp.GetRootFolder().GetClipList() or []:
        if os.path.normcase(c.GetClipProperty('File Path') or '') == os.path.normcase(f): return c
    r = mp.ImportMedia([f])
    return r[0] if r else None

nome = opz('--nome', 'Documentario')
nomi = {progetto.GetTimelineByIndex(i + 1).GetName() for i in range(progetto.GetTimelineCount())}
nome_tl, k = nome, 2
while nome_tl in nomi: nome_tl, k = f'{nome} {k}', k + 1
tl = mp.CreateEmptyTimeline(nome_tl)
progetto.SetCurrentTimeline(tl)
tl.SetSetting('useCustomSettings', '1')
tl.SetSetting('timelineResolutionWidth', '1080')
tl.SetSetting('timelineResolutionHeight', '1920')
inizio = tl.GetStartFrame()
mp.AppendToTimeline([{'mediaPoolItem': prendi(video), 'trackIndex': 1, 'mediaType': 1, 'recordFrame': inizio}])
for k, (n, f) in enumerate([('voce', voce)] + [(n, os.path.join(tracce, n + '.wav')) for n in ('sfx', 'musica', 'ambiente')]):
    while tl.GetTrackCount('audio') < k + 1: tl.AddTrack('audio', 'stereo')
    c = prendi(f) if os.path.exists(f) else None
    ok = c and mp.AppendToTimeline([{'mediaPoolItem': c, 'trackIndex': k + 1, 'mediaType': 2, 'recordFrame': inizio}])
    tl.SetTrackName('audio', k + 1, n)
    if not ok: print(f'[doc-timeline] A{k + 1} {n} NON messa')
print(f'[doc-timeline] timeline "{nome_tl}": V1 video, A1 voce, A2 sfx, A3 musica, A4 ambiente')

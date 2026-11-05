# Passo 9 del flusso locale: titoli-sottotitolo sulla timeline corrente di DaVinci, con auto_captions.py di Denis
# (davinci-automation, NON modificato: si importa come modulo).
#
#   .venv\Scripts\python.exe pc/locale/sottotitoli.py titoli <cartella -pulizia> [--preset WATER] [--cartella <davinci-automation>]
#       il testo viene dalla NOSTRA trascrizione (parole-pulite.json: Whisper + allineamento, già sui tempi del video
#       tagliato) invece che da CreateSubtitlesFromAudio di DaVinci, che sbagliava parole (Test 2: "legano le
#       traporze") e scriveva la traccia in ritardo. auto_captions.py legge da ogni frase solo GetName/GetStart/GetEnd:
#       gli si passano frasi con quei tre metodi (e parole, per i preset multi-slot). La sua grafica resta la sua.
#   .venv\Scripts\python.exe pc/locale/sottotitoli.py posiziona <cartella -pulizia>
#       ogni titolo della traccia video più alta si sposta (Tilt della clip, che arriva al render) per non coprire il
#       viso: sotto il mento se c'è spazio, altrimenti sopra la testa e sotto la grafica. Il viso: pc/rotolo/viso.py
#       sul video originale (viso.json), riportato sui tempi tagliati (tagli.json) e sulla posizione del video in
#       timeline (lastra.json: zoom/pan/tilt per fotogramma).
import json, os, sys, time

sys.stdout.reconfigure(encoding='utf-8')
if sys.platform == 'win32':
    os.environ.setdefault('RESOLVE_SCRIPT_API', os.path.join(os.environ.get('PROGRAMDATA', r'C:\ProgramData'), 'Blackmagic Design', 'DaVinci Resolve', 'Support', 'Developer', 'Scripting'))
    os.environ.setdefault('RESOLVE_SCRIPT_LIB', r'C:\Program Files\Blackmagic Design\DaVinci Resolve\fusionscript.dll')
sys.path.append(os.path.join(os.environ['RESOLVE_SCRIPT_API'], 'Modules'))
import DaVinciResolveScript as dvr

if len(sys.argv) < 3 or sys.argv[1] not in ('titoli', 'posiziona'):
    sys.exit('uso: sottotitoli.py titoli|posiziona <cartella -pulizia> [--preset WATER]')
opz = lambda k, d: sys.argv[sys.argv.index(k) + 1] if k in sys.argv else d
MODO, PUL = sys.argv[1], sys.argv[2]
leggi = lambda n: json.load(open(os.path.join(PUL, n), encoding='utf-8'))
log = lambda *a: print('[sottotitoli]', *a, flush=True)

resolve = dvr.scriptapp('Resolve')
if not resolve:
    sys.exit('DaVinci Resolve non risponde')
progetto = resolve.GetProjectManager().GetCurrentProject()
tl = progetto.GetCurrentTimeline()
if not tl:
    sys.exit('nessuna timeline aperta')
FPS = float(tl.GetSetting('timelineFrameRate'))
INIZIO = tl.GetStartFrame()

# ---------------------------------------------------------------- titoli: auto_captions.py con il nostro testo
CARATTERI = 20   # come SUBTITLE_SETTINGS_KEYS["chars_per_line"] di auto_captions.py: frasi corte
PAUSA = 0.35     # una pausa più lunga chiude la frase

def frasi(parole):
    out, cur = [], []
    for w in parole:
        if cur and (len(' '.join(x['w'] for x in cur + [w])) > CARATTERI or w['s'] - cur[-1]['e'] > PAUSA
                    or cur[-1]['w'].rstrip()[-1:] in '.!?'):
            out.append(cur); cur = []
        cur.append(w)
    return out + ([cur] if cur else [])

class Frase:  # quello che auto_captions.py legge da un sottotitolo di DaVinci
    def __init__(self, testo, da, a): self.testo, self.da, self.a = testo, da, a
    def GetName(self): return self.testo
    def GetStart(self): return self.da
    def GetEnd(self): return self.a

fr = lambda s: INIZIO + round(s * FPS)
if MODO == 'titoli':
    parole = leggi('parole-pulite.json')
    gruppi = frasi(parole)
    voci = []
    for n, g in enumerate(gruppi):
        fine = g[-1]['e'] if n == len(gruppi) - 1 else min(g[-1]['e'], gruppi[n + 1][0]['s'])  # mai sopra la frase dopo
        voci.append(Frase(' '.join(w['w'] for w in g), fr(g[0]['s']), fr(fine)))
    cartella = opz('--cartella', os.environ.get('DAVINCI_AUTOMAZIONE') or os.path.join(os.environ.get('USERPROFILE', ''), 'Desktop', 'my-video', 'davinci-automation'))
    sys.path.insert(0, cartella)
    os.chdir(cartella)  # il suo script cerca i preset accanto a sé
    import auto_captions as ac
    ac.generate_subtitles = lambda resolve, timeline: voci
    ac.generate_word_segments = lambda resolve, timeline: [(w['w'], fr(w['s']), fr(w['e'])) for w in parole]
    log(f'"{tl.GetName()}": {len(voci)} frasi dalla nostra trascrizione ({len(parole)} parole), preset {opz("--preset", "WATER")}')
    ac.main(opz('--preset', 'WATER'), limit=None)
    sys.exit(0)

# ---------------------------------------------------------------- posiziona: lontano dal viso
lastra, viso, tagli = leggi('lastra.json'), leggi('viso.json'), leggi('tagli.json')
W, H = lastra['w'], lastra['h']

def sorgente(t):  # secondo sul video tagliato → secondo sul video originale
    acc = 0.0
    for x in tagli['tieni']:
        d = x['a'] - x['da']
        if t < acc + d:
            return x['da'] + t - acc
        acc += d
    return tagli['tieni'][-1]['a']

def punto(ts):
    pp = [p for p in viso['punti'] if p['x'] is not None]
    return min(pp, key=lambda p: abs(p['t'] - ts))

def faccia(t):
    f = int(t * lastra['fps'])
    tr = next((x for x in lastra['tratti'] if x['da'] <= f < x['a']), lastra['tratti'][-1])
    vw = tr['zoom'] * W
    vh = vw * viso['h'] / viso['w']
    cy = H / 2 - tr['tilt']
    p = punto(sorgente(t))
    y = cy + (p['y'] - 0.5) * vh
    return y - p['s'] * vh / 2, y + p['s'] * vh / 2, tr['p']  # fronte, mento, quota della lastra

MARGINE = 0.08 * H    # dal mento / dalla fronte al centro della scritta
BASSO = 0.80 * H      # più giù c'è l'interfaccia di TikTok/Reels
traccia = tl.GetTrackCount('video')
clip = tl.GetItemListInTrack('video', traccia) or []
if not clip:
    sys.exit('nessun titolo sulla traccia video più alta')
spostate = sopra = 0
for c in clip:
    comp = c.GetFusionCompByIndex(1)
    testo = next((t for t in (comp.GetToolList(False) or {}).values() if t.GetAttrs()['TOOLS_RegID'] == 'TextPlus'), None) if comp else None
    if not testo:
        continue
    yBase = (1 - testo.GetInput('Center')[2]) * H  # centro della scritta senza Tilt, dall'alto
    t = (c.GetStart() - INIZIO) / FPS + 0.3
    fronte, mento, p = faccia(t)
    y = mento + MARGINE
    if y > BASSO:  # niente spazio sotto: sopra la testa, sotto la grafica (che occupa l'alto quando p < 1)
        y = max(fronte - MARGINE, H * (1 - p) + 0.05 * H)
        sopra += 1
    c.SetProperty('Tilt', round(yBase - y, 1))
    spostate += 1
log(f'"{tl.GetName()}": {spostate} titoli spostati fuori dal viso ({sopra} sopra la testa, {spostate - sopra} sotto il mento)')

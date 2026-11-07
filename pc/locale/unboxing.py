# Stile Unboxing (flusso locale): le parti in Python di pc/locale/unboxing.mjs.
#   python pc/locale/unboxing.py analisi <clip> <uscita.json>        movimento, nitidezza e volume ogni 0,5 s
#   python pc/locale/unboxing.py battiti <musica> <uscita.json>      tempo e battiti della musica
#   python pc/locale/unboxing.py audio <montaggio.json> <cartella>   tracce asmr.wav, musica.wav, sfx.wav (somma a -14 LUFS)
#   python pc/locale/unboxing.py timeline <montaggio.json> <grafica.mov> <cartella audio> [--nome X] [--progetto X]
# Solo numpy + ffmpeg (niente OpenCV).
import json, os, random, subprocess, sys, time
import numpy as np
sys.stdout.reconfigure(encoding='utf-8')

SR = 48000
PASSO = 0.5  # secondi tra due misure dell'analisi


def ffmpeg_raw(argomenti):
    return subprocess.run(['ffmpeg', '-v', 'error', *argomenti], capture_output=True, check=True).stdout


def durata(f):
    return float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f],
                                capture_output=True, text=True).stdout.strip())


# ---------- analisi: per ogni mezzo secondo movimento (differenza tra fotogrammi), nitidezza (varianza del
# laplaciano) e volume (RMS dell'audio). Fotogrammi piccoli in grigio decodificati dalla scheda video.
def analisi(clip, uscita):
    W, H = 180, 320
    raw = ffmpeg_raw(['-hwaccel', 'cuda', '-i', clip, '-vf', f'fps={1 / PASSO},scale={W}:{H}:force_original_aspect_ratio=disable,format=gray',
                      '-f', 'rawvideo', '-'])
    fr = np.frombuffer(raw, np.uint8).reshape(-1, H, W).astype(np.float32)
    moto = np.concatenate([[0], np.abs(np.diff(fr, axis=0)).mean(axis=(1, 2))])
    lap = fr[:, 1:-1, 1:-1] * 4 - fr[:, :-2, 1:-1] - fr[:, 2:, 1:-1] - fr[:, 1:-1, :-2] - fr[:, 1:-1, 2:]
    nit = lap.var(axis=(1, 2))
    try:
        a = np.frombuffer(ffmpeg_raw(['-i', clip, '-vn', '-ac', '1', '-ar', '16000', '-f', 'f32le', '-']), np.float32)
        n = int(16000 * PASSO)
        vol = np.array([np.sqrt((a[i:i + n] ** 2).mean() + 1e-12) for i in range(0, len(a), n)])
    except subprocess.CalledProcessError:
        vol = np.zeros(len(fr))
    k = min(len(fr), len(vol)) if len(vol) else len(fr)
    vol = vol[:k] if len(vol) else np.zeros(k)
    json.dump({'passo': PASSO, 'durata': durata(clip), 'moto': [round(float(x), 2) for x in moto[:k]],
               'nitidezza': [round(float(x), 1) for x in nit[:k]], 'volume': [round(float(20 * np.log10(x + 1e-9)), 1) for x in vol]},
              open(uscita, 'w', encoding='utf8'))
    print(f'[unboxing] analisi {os.path.basename(clip)}: {k} misure')


# ---------- battiti: inviluppo degli attacchi (flusso spettrale), tempo con l'autocorrelazione (70–180 bpm),
# fase con il pettine che prende più attacchi
def battiti(musica, uscita):
    sr = 22050
    a = np.frombuffer(ffmpeg_raw(['-i', musica, '-t', '240', '-ac', '1', '-ar', str(sr), '-f', 'f32le', '-']), np.float32)
    hop, win = 512, 2048
    n = (len(a) - win) // hop
    fin = np.hanning(win).astype(np.float32)
    spettri = np.abs(np.fft.rfft(np.stack([a[i * hop:i * hop + win] * fin for i in range(n)]), axis=1))
    spettri = np.log1p(spettri * 10)
    flux = np.maximum(0, np.diff(spettri, axis=0)).sum(axis=1)
    flux = flux - np.convolve(flux, np.ones(16) / 16, 'same')
    flux = np.maximum(flux, 0)
    fps = sr / hop
    ac = np.correlate(flux, flux, 'full')[len(flux) - 1:]
    lmin, lmax = int(fps * 60 / 180), int(fps * 60 / 70)
    pesi = np.exp(-0.5 * (np.log2(np.arange(lmin, lmax) / (fps * 60 / 118)) / 0.9) ** 2)  # preferenza attorno ai 118 bpm
    lag = lmin + int(np.argmax(ac[lmin:lmax] * pesi))
    periodo = lag / fps
    fasi = [flux[int(f)::lag].sum() for f in range(lag)]
    t0 = int(np.argmax(fasi)) / fps
    lista = [round(t0 + k * periodo, 4) for k in range(int((len(a) / sr - t0) / periodo))]
    json.dump({'bpm': round(60 / periodo, 2), 'periodo': round(periodo, 4), 'battiti': lista, 'durata': len(a) / sr},
              open(uscita, 'w', encoding='utf8'))
    print(f'[unboxing] musica {os.path.basename(musica)}: {60 / periodo:.1f} bpm, primo battito {t0:.2f} s')


# ---------- audio: tre tracce lunghe quanto il video, già ai livelli giusti
def carica(f, da=0.0, dur=None):
    a = ['-ss', f'{da:.3f}', '-i', f] + (['-t', f'{dur:.3f}'] if dur else []) + ['-vn', '-ac', '2', '-ar', str(SR), '-f', 'f32le', '-']
    try:
        return np.frombuffer(ffmpeg_raw(a), np.float32).reshape(-1, 2).copy()
    except subprocess.CalledProcessError:
        return np.zeros((0, 2), np.float32)


def lufs(x):
    p = subprocess.run(['ffmpeg', '-hide_banner', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-', '-af', 'ebur128', '-f', 'null', '-'],
                       input=x.astype(np.float32).tobytes(), capture_output=True)
    for riga in reversed(p.stderr.decode('utf8', 'ignore').splitlines()):
        if riga.strip().startswith('I:'):
            v = float(riga.split()[1])
            return v if v > -70 else None
    return None


def filtra(x, filtro):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-', '-af', filtro, '-f', 'f32le', '-'],
                         input=x.astype(np.float32).tobytes(), capture_output=True, check=True).stdout
    y = np.frombuffer(raw, np.float32).reshape(-1, 2)
    out = np.zeros_like(x); out[:min(len(x), len(y))] = y[:len(x)]
    return out


def dissolvi(c, f):
    f = min(len(c) // 2, int(f * SR))
    if f:
        c[:f] *= np.linspace(0, 1, f)[:, None]
        c[-f:] *= np.linspace(1, 0, f)[:, None]
    return c


def audio(file_montaggio, cartella):
    m = json.load(open(file_montaggio, encoding='utf8'))
    D = m['durata']
    N = int(D * SR)
    os.makedirs(cartella, exist_ok=True)
    # suoni veri dell'unboxing: l'audio di ogni pezzo al suo posto, con 10 ms di dissolvenza ai tagli
    asmr = np.zeros((N, 2), np.float32)
    for p in m['pezzi']:
        c = carica(p['file'], p['da'], p['a'] - p['da'])
        i = int(p['t'] * SR)
        c = dissolvi(c, 0.01)[:max(0, N - i)]
        asmr[i:i + len(c)] += c
    # musica dal battito scelto, dissolvenza in entrata e in uscita
    mus = np.zeros((N, 2), np.float32)
    if m.get('musica'):
        c = carica(m['musica']['file'], m['musica'].get('da', 0), D + 1)
        while 0 < len(c) < N:
            c = np.concatenate([c, c])
        mus[:] = c[:N]
        n = np.arange(N) / SR
        mus *= np.clip(np.minimum(n / 0.8, (D - n) / 2.0), 0, 1)[:, None]
    # effetti: whoosh sul titolo, pop sulle schede, swish sulla chiusura
    sfx = np.zeros((N, 2), np.float32)
    SFX = os.environ.get('SFX_DIR', 'G:/Il mio Drive/12 · Risorse/SFX — regista').rstrip('/')
    cartelle = {}
    for r, ds, fs in os.walk(SFX):
        if fs: cartelle.setdefault(os.path.basename(r), [os.path.join(r, f) for f in sorted(fs) if os.path.splitext(f)[1].lower() in ('.wav', '.mp3', '.flac', '.m4a', '.aif', '.aiff', '.ogg')])
    random.seed(7)
    for e in m.get('eventi', []):
        fs = cartelle.get(e['suono'])
        if not fs: print(f'[unboxing] suono mancante: {e["suono"]}'); continue
        c = carica(random.choice(fs), 0, e.get('durata', 2.5))
        c = dissolvi(c, 0.02) * 10 ** (e.get('db', 0) / 20)
        i = max(0, int(e['t'] * SR))
        c = c[:max(0, N - i)]
        sfx[i:i + len(c)] += c
    # livelli: con la voce la voce comanda, senza i suoni veri stanno sopra la musica di ~5 dB.
    # Poi tutto insieme a -14 LUFS (piattaforme social), con un tetto ai picchi.
    voce = m.get('voce')
    obiettivi = {'asmr': -26 if voce else -17, 'musica': -26 if voce else -22, 'sfx': -24}
    tracce = {'asmr': asmr, 'musica': mus, 'sfx': sfx}
    # suoni veri: il microfono del telefono registra basso (Earbuds 4: -50 LUFS, fondo a -56 dB): prima si toglie il
    # soffio e si comprimono i colpi, poi si alza al massimo di 24 dB (oltre si sente il rumore della stanza)
    tracce['asmr'] = filtra(asmr, 'highpass=f=70,afftdn=nr=18:nf=-50:tn=1,acompressor=threshold=-32dB:ratio=3:attack=4:release=150:makeup=2')
    for k, x in tracce.items():
        l = lufs(x)
        if l is not None: tracce[k] = x * 10 ** (min(24 if k == 'asmr' else 60, obiettivi[k] - l) / 20)
        # i colpi (nastro, scatto della custodia) dopo +24 dB passerebbero lo 0 dBFS: limiter a -4 dBFS sui suoni veri
        if k == 'asmr': tracce[k] = filtra(tracce[k], 'alimiter=limit=0.63:attack=1:release=60:level=0')
        print(f'[unboxing] {k}: {l if l is None else round(l, 1)} → {obiettivi[k]} LUFS (dopo: {lufs(tracce[k])})')
    somma = sum(tracce.values())
    l = lufs(somma) or -14
    g = 10 ** ((-14 - l) / 20)
    # ogni traccia con un limiter a -6 dBFS dopo il guadagno (DaVinci le somma: tre tracce a -6 restano sotto lo 0
    # quasi sempre); se la somma supera ancora 0,95 si abbassa tutto di quel poco
    for k in tracce: tracce[k] = filtra(tracce[k] * g, 'alimiter=limit=0.5:attack=1:release=80:level=0')
    g = 1.0
    somma = sum(tracce.values())
    picco = np.abs(somma).max()
    if picco > 0.95: g = 0.95 / picco
    for k, x in tracce.items():
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-', '-c:a', 'pcm_s24le',
                        os.path.join(cartella, k + '.wav')], input=(x * g).astype(np.float32).tobytes(), check=True)
    print(f'[unboxing] tracce in {cartella}: somma {lufs(somma * g):.1f} LUFS (guadagno {20 * np.log10(g):+.1f} dB)')


# ---------- timeline in DaVinci: V1 i pezzi delle clip (ognuno col suo zoom), V2 la grafica, A1–A3 le tracce
def timeline(file_montaggio, grafica, cartella_audio, opz):
    from fractions import Fraction
    if sys.platform == 'win32':
        os.environ.setdefault('RESOLVE_SCRIPT_API', os.path.join(os.environ.get('PROGRAMDATA', r'C:\ProgramData'), 'Blackmagic Design', 'DaVinci Resolve', 'Support', 'Developer', 'Scripting'))
        os.environ.setdefault('RESOLVE_SCRIPT_LIB', r'C:\Program Files\Blackmagic Design\DaVinci Resolve\fusionscript.dll')
    sys.path.append(os.path.join(os.environ['RESOLVE_SCRIPT_API'], 'Modules'))
    import DaVinciResolveScript as dvr
    # se DaVinci resta bloccato all'avvio lo chiude e lo riapre (pc/locale/davinci_locale.py)
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from davinci_locale import connetti
    resolve = connetti()
    m = json.load(open(file_montaggio, encoding='utf8'))
    fps = Fraction(m['fps']).limit_denominator(1001)
    NOMI = {Fraction(24000, 1001): '23.976', Fraction(30000, 1001): '29.97', Fraction(60000, 1001): '59.94'}
    pm = resolve.GetProjectManager()
    progetto = pm.LoadProject(opz.get('progetto', 'Regista locale')) or pm.CreateProject(opz.get('progetto', 'Regista locale'))
    if not progetto.GetTimelineCount(): progetto.SetSetting('timelineFrameRate', NOMI.get(fps, str(round(float(fps)))))
    mp = progetto.GetMediaPool()

    def prendi(f):
        f = os.path.abspath(f)
        for c in mp.GetRootFolder().GetClipList() or []:
            if os.path.normcase(c.GetClipProperty('File Path') or '') == os.path.normcase(f): return c
        r = mp.ImportMedia([f])
        return r[0] if r else None

    nome = opz.get('nome', 'Unboxing')
    nomi = {progetto.GetTimelineByIndex(i + 1).GetName() for i in range(progetto.GetTimelineCount())}
    nome_tl, k = nome, 2
    while nome_tl in nomi: nome_tl, k = f'{nome} {k}', k + 1
    tl = mp.CreateEmptyTimeline(nome_tl)
    progetto.SetCurrentTimeline(tl)
    tl.SetSetting('useCustomSettings', '1')
    tl.SetSetting('timelineResolutionWidth', str(m['w']))
    tl.SetSetting('timelineResolutionHeight', str(m['h']))
    while tl.GetTrackCount('video') < 2: tl.AddTrack('video')
    inizio = tl.GetStartFrame()
    pezzi, trasf = [], []
    for p in m['pezzi']:
        c = prendi(p['file'])
        fs = Fraction(p['fps']).limit_denominator(1001)
        rec = round(p['t'] * fps)
        n = round(p['t2'] * fps) - rec          # fotogrammi di timeline del pezzo (senza buchi tra un pezzo e l'altro)
        sa = round(p['da'] * fs)
        pezzi.append({'mediaPoolItem': c, 'startFrame': sa, 'endFrame': sa + round(n * fs / fps), 'trackIndex': 1, 'mediaType': 1, 'recordFrame': inizio + rec})
        trasf.append(p)
    messi = mp.AppendToTimeline(pezzi) or []
    male = sum(0 if it.SetProperties({'ZoomX': p.get('zoom', 1), 'ZoomY': p.get('zoom', 1), 'Pan': float(p.get('pan', 0)), 'Tilt': float(p.get('tilt', 0))}) else 1
               for it, p in zip(messi, trasf))
    cg = prendi(grafica)
    mp.AppendToTimeline([{'mediaPoolItem': cg, 'trackIndex': 2, 'mediaType': 1, 'recordFrame': inizio}])
    for k, n in enumerate(['asmr', 'musica', 'sfx']):
        f = os.path.join(cartella_audio, n + '.wav')
        while tl.GetTrackCount('audio') < k + 1: tl.AddTrack('audio', 'stereo')
        c = prendi(f) if os.path.exists(f) else None
        ok = c and mp.AppendToTimeline([{'mediaPoolItem': c, 'trackIndex': k + 1, 'mediaType': 2, 'recordFrame': inizio}])
        tl.SetTrackName('audio', k + 1, n)
        if not ok: print(f'[unboxing] A{k + 1} {n} NON messa')
    v1 = tl.GetItemListInTrack('video', 1) or []
    print(f'[unboxing] timeline "{nome_tl}" ({m["w"]}x{m["h"]}): V1 {len(v1)} pezzi (attesi {len(pezzi)})' + (f', {male} senza zoom' if male else '') + ', V2 grafica, A1 asmr, A2 musica, A3 sfx')


if __name__ == '__main__':
    a = sys.argv[1:]
    if not a: sys.exit(__doc__ or 'uso: vedi intestazione')
    opz = {a[i][2:]: a[i + 1] for i in range(len(a) - 1) if a[i].startswith('--')}
    pos = [x for i, x in enumerate(a) if not x.startswith('--') and not (i > 0 and a[i - 1].startswith('--'))]
    {'analisi': lambda: analisi(*pos[1:3]), 'battiti': lambda: battiti(*pos[1:3]), 'audio': lambda: audio(*pos[1:3]),
     'timeline': lambda: timeline(*pos[1:4], opz)}[pos[0]]()

# Rotolo: sonorizzazione. Mixa voce + effetti + ambiente + musica e normalizza a -14 LUFS.
#   python pc/rotolo/suoni.py <eventi.json> <voce> <uscita.wav> [cartella SFX] [--stems cartella]
# eventi.json lo scrive pc/rotolo/eventi.mjs (stessi tempi del video). I suoni stanno nella cartella SFX
# (default "G:/Il mio Drive/12 · Risorse/SFX — regista", o la variabile SFX_DIR): una cartella = un suono,
# i file dentro sono varianti scelte a caso. Le registrazioni lunghe (raffiche di tasti, carte lanciate)
# vengono divise da sole nei colpi singoli. Una cartella vuota = quel suono salta, il mix esce lo stesso.
import glob, json, os, random, subprocess, sys
import numpy as np

SR = 48000
ev_file, voce_file, uscita = sys.argv[1:4]
SFX = (sys.argv[4] if len(sys.argv) > 4 and not sys.argv[4].startswith('--') else os.environ.get('SFX_DIR', 'G:/Il mio Drive/12 · Risorse/SFX — regista')).rstrip('/') + '/'
dati = json.load(open(ev_file, encoding='utf8'))
DUR = float(dati['durata'])
random.seed(3)

def carica(f):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', f, '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-'], capture_output=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2).copy()

def media(x, w):
    w = max(1, int(w)); c = np.cumsum(np.concatenate([np.zeros(w // 2 + 1), x, np.zeros(w)]))
    return ((c[w:] - c[:-w]) / w)[:len(x)]

def colpi(a, massimo, soglia=0.25):
    """Divide una registrazione lunga nei suoi colpi singoli (attacchi sopra soglia)."""
    env = media(np.abs(a).mean(1), SR * 0.01)
    lim = soglia * env.max()
    sopra = np.flatnonzero((env[1:] > lim) & (env[:-1] <= lim)) + 1
    on = []
    for s in sopra:
        if not on or s - on[-1] > SR * 0.07: on.append(int(s))
    out = []
    for k, s in enumerate(on):
        e = min(on[k + 1] if k + 1 < len(on) else len(a), s + int(SR * massimo))
        c = a[max(0, s - int(SR * 0.004)):e].copy()
        f = min(len(c), int(SR * 0.03))
        if f: c[-f:] *= np.linspace(1, 0, f)[:, None]
        if len(c) > SR * 0.03: out.append(c)
    return out

def taglia(c, da, dur, fade=0.06):
    c = c[int(da * SR):int((da + dur) * SR)].copy() if dur else c[int(da * SR):].copy()
    f = min(len(c) // 2, int(fade * SR))
    if f: c[:f] *= np.linspace(0, 1, f)[:, None]; c[-f:] *= np.linspace(1, 0, f)[:, None]
    return c

cache = {}
def varianti(nome):
    """Varianti di un suono. Per i suoni brevi (tasti, carte, clic) una registrazione lunga diventa tanti colpi."""
    if nome in cache: return cache[nome]
    fs = [f for f in glob.glob(SFX + nome + '/*') if os.path.splitext(f)[1].lower() in ('.wav', '.mp3', '.aif', '.aiff', '.flac', '.ogg', '.m4a')]
    vs = [carica(f) for f in fs]
    breve = {'tasto': 0.12, 'schiocco': 0.5, 'clic': 0.25, 'timbro': 0.6, 'colpo sordo': 0.4}
    for k, m in breve.items():
        if k in nome:
            vs = [c for v in vs for c in (colpi(v, m) if len(v) > SR * 1.5 else [v])]
    cache[nome] = vs
    if not vs: print(f'  (vuota: {nome})')
    return vs

out = np.zeros((int(SR * (DUR + 1)), 2), np.float32)
def metti(t, c, db=0.0, pan=0.0):
    if c is None or len(c) == 0: return
    if t < 0: c = c[int(-t * SR):]; t = 0
    g = 10 ** (db / 20)
    i = int(t * SR); c = c[:max(0, len(out) - i)]
    l, r = np.cos((pan + 1) * np.pi / 4) * 1.414, np.sin((pan + 1) * np.pi / 4) * 1.414
    out[i:i + len(c), 0] += c[:, 0] * g * l
    out[i:i + len(c), 1] += c[:, 1] * g * r

for e in dati['eventi']:
    vs = varianti(e['suono'])
    if not vs: continue
    c = random.choice(vs)
    if e.get('durata'):
        lungo = len(c) / SR
        da = e.get('da', 0)
        if da + e['durata'] > lungo: da = max(0, random.uniform(0, max(0, lungo - e['durata'])))
        c = taglia(c, da, e['durata'])
    metti(e['t'] + random.uniform(-0.004, 0.004), c, e['db'] + random.uniform(-1.5, 1.5), e.get('pan', 0))
sfx = out

voce = carica(voce_file)
v = np.zeros_like(out); v[:min(len(voce), len(v))] = voce[:len(v)]
def letto(nome, db):
    vs = varianti(nome)
    L = np.zeros_like(out)
    if not vs: return L
    a = random.choice(vs)
    while len(a) < len(L): a = np.concatenate([a, a])   # in loop se è più corta del video
    L[:] = a[:len(L)]
    return L * 10 ** (db / 20)
A = letto(dati['letto']['stanza'], -30)
M = letto(dati['letto']['musica'], -17)
# la musica si abbassa di ~6 dB quando c'è la voce, entra e esce in dissolvenza
env = media(np.abs(v).mean(1), SR * 0.25)
duck = media(1 - 0.5 * np.clip(env / (env.max() * 0.15 + 1e-9), 0, 1), SR * 0.3)
n = np.arange(len(M)) / SR
fade = np.clip(np.minimum(n / 1.5, (DUR + 0.6 - n) / 2.5), 0, 1)
M *= (duck * fade)[:, None]
A *= np.clip(np.minimum(n / 1.0, (DUR + 0.6 - n) / 1.5), 0, 1)[:, None]

# --stems <cartella>: le tre tracce separate (sfx, musica, ambiente) senza voce, ai livelli del mix, per DaVinci
if '--stems' in sys.argv:
    cart = sys.argv[sys.argv.index('--stems') + 1]
    os.makedirs(cart, exist_ok=True)
    for nome, traccia in (('sfx', sfx), ('musica', M), ('ambiente', A)):
        x = traccia[:int(DUR * SR)].astype(np.float32)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-', '-c:a', 'pcm_s24le', os.path.join(cart, nome + '.wav')], input=x.tobytes(), check=True)
    print(f'stems → {cart} (sfx, musica, ambiente)')

mix = (v + sfx + M + A)[:int(DUR * SR)].astype(np.float32)
tmp = uscita + '.grezzo.wav'
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-', tmp], input=mix.tobytes(), check=True)
# loudnorm in due passate: -14 LUFS, picco -1.5 dBTP
mis = subprocess.run(['ffmpeg', '-hide_banner', '-i', tmp, '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'], capture_output=True, text=True).stderr
j = json.loads(mis[mis.rindex('{'):mis.rindex('}') + 1])
filtro = (f"loudnorm=I=-14:TP=-1.5:LRA=11:measured_I={j['input_i']}:measured_TP={j['input_tp']}:measured_LRA={j['input_lra']}"
          f":measured_thresh={j['input_thresh']}:offset={j['target_offset']}:linear=true,aresample={SR}")
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp, '-af', filtro, '-c:a', 'pcm_s16le', uscita], check=True)
os.remove(tmp)
print(f'mix → {uscita} ({len(dati["eventi"])} eventi)')

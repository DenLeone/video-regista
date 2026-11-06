# Allineamento forzato: riaggancia le parole di Whisper all'audio, con una precisione di qualche centesimo.
#   python pc/locale/allinea.py <audio o video> <parole.json> <uscita.json>
# Whisper dà il testo giusto ma tempi che nel parlato veloce sbagliano anche di 0,3 s: tagliare lì
# lascia pezzi di sillaba. Qui il testo (già noto) si allinea all'audio con il modello MMS di torchaudio
# (wav2vec2 multilingue, CTC), sulla scheda video se c'è. I numeri in cifre si allineano scritti in lettere; le parole
# che il modello non trova tengono i tempi di Whisper, ristretti tra le parole vicine.
# Uscita: stessa lista [{w, s, e}] con i tempi nuovi (e "w0", "s0", "e0" di Whisper per confronto).
import json, re, subprocess, sys, unicodedata
import numpy as np
import torch
import torchaudio

sorgente, file_parole, uscita = sys.argv[1:4]
parole = json.load(open(file_parole, encoding='utf8'))
SR = 16000
pcm = subprocess.run(['ffmpeg', '-v', 'error', '-i', sorgente, '-vn', '-ac', '1', '-ar', str(SR), '-f', 's16le', '-'], capture_output=True, check=True).stdout
audio = torch.from_numpy(np.frombuffer(pcm, np.int16).astype(np.float32) / 32768.0)
durata = audio.numel() / SR

dev = 'cuda' if torch.cuda.is_available() else 'cpu'
bundle = torchaudio.pipelines.MMS_FA
modello = bundle.get_model(with_star=False).to(dev).eval()
diz = bundle.get_dict(star=None)

UNITA = 'zero uno due tre quattro cinque sei sette otto nove dieci undici dodici tredici quattordici quindici sedici diciassette diciotto diciannove'.split()
DECINE = 'venti trenta quaranta cinquanta sessanta settanta ottanta novanta'.split()

def in_lettere(n):
    # numero intero → come si dice in italiano (2017 → duemiladiciassette), per allinearlo sull'audio
    if n < 20: return UNITA[n]
    if n < 100:
        d, u = DECINE[n // 10 - 2], n % 10
        return d + ('' if u == 0 else UNITA[u]) if u not in (1, 8) else d[:-1] + UNITA[u]  # ventuno, ventotto
    if n < 1000:
        c, r = n // 100, n % 100
        return ('cento' if c == 1 else UNITA[c] + 'cento') + (in_lettere(r) if r else '')
    if n < 1_000_000:
        m, r = n // 1000, n % 1000
        return ('mille' if m == 1 else in_lettere(m) + 'mila') + (in_lettere(r) if r else '')
    m, r = n // 1_000_000, n % 1_000_000
    return ('unmilione' if m == 1 else in_lettere(m) + 'milioni') + (in_lettere(r) if r else '')

NOMI = dict(zip('abcdefghijklmnopqrstuvwxyz', 'a bi ci di e effe gi acca i ilunga cappa elle emme enne o pi cu erre esse ti u vu doppiavu ics ipsilon zeta'.split()))

def sigla(m):
    # sigla senza vocali (RLHF, GPT): si dice lettera per lettera, "erre elle acca effe"
    s = m.group()
    return ''.join(NOMI[c] for c in s.lower()) if len(s) >= 2 and s.isupper() and not re.search('[AEIOU]', s) else s

def lettere(w):
    # minuscole senza accenti, solo le lettere che il modello conosce (apostrofi e punteggiatura via).
    # I numeri in cifre si scrivono in lettere: senza, la parola restava ai tempi di Whisper e il taglio dopo
    # "2017" mangiava la coda di "diciassette" (Test 2: si sentiva "duemila e dicia").
    w = re.sub(r'\d+', lambda m: in_lettere(int(m.group())) if len(m.group()) <= 9 else m.group(), w)
    w = re.sub(r'[A-Za-z]+', sigla, w)
    t = unicodedata.normalize('NFD', w.lower())
    t = ''.join(c for c in t if unicodedata.category(c) != 'Mn')
    return ''.join(c for c in t if c in diz and c.isalpha())

# blocchi: parole vicine (pausa < 0,6 s), al massimo ~25 s; ogni blocco si allinea sul suo pezzo d'audio
blocchi, cur = [], []
for i, p in enumerate(parole):
    if cur and (p['s'] - parole[cur[-1]]['e'] > 0.6 or p['e'] - parole[cur[0]]['s'] > 25):
        blocchi.append(cur); cur = []
    cur.append(i)
if cur: blocchi.append(cur)

nuove = [dict(w=p['w'], s=p['s'], e=p['e'], w0=p['w'], s0=p['s'], e0=p['e'], ok=False) for p in parole]
for b in blocchi:
    da = max(0.0, parole[b[0]]['s'] - 0.4)
    a = min(durata, parole[b[-1]]['e'] + 0.4)
    if b[0] > 0: da = max(da, parole[b[0] - 1]['e'] - 0.05)
    if b[-1] < len(parole) - 1: a = min(a, parole[b[-1] + 1]['s'] + 0.05)
    idx = [i for i in b if lettere(parole[i]['w'])]
    if not idx: continue
    pezzo = audio[int(da * SR):int(a * SR)].unsqueeze(0).to(dev)
    with torch.inference_mode():
        emissione, _ = modello(pezzo)
    token = [[diz[c] for c in lettere(parole[i]['w'])] for i in idx]
    piatti = torch.tensor([t for w in token for t in w], dtype=torch.int32, device=dev).unsqueeze(0)
    if emissione.size(1) < piatti.size(1): continue  # audio troppo corto per il testo: si tengono i tempi di Whisper
    allin, punteggi = torchaudio.functional.forced_align(emissione, piatti, blank=0)
    spans = torchaudio.functional.merge_tokens(allin[0], punteggi[0].exp())
    passo = pezzo.size(1) / emissione.size(1) / SR
    k = 0
    for i, t in zip(idx, token):
        sp = spans[k:k + len(t)]
        k += len(t)
        if len(sp) != len(t): continue
        nuove[i]['s'] = round(da + sp[0].start * passo, 3)
        nuove[i]['e'] = round(da + sp[-1].end * passo, 3)
        nuove[i]['ok'] = True

# parole non allineate: tempi di Whisper stretti tra le vicine allineate
for i, n in enumerate(nuove):
    if n['ok']: continue
    prima = next((nuove[j]['e'] for j in range(i - 1, -1, -1) if nuove[j]['ok']), 0.0)
    dopo = next((nuove[j]['s'] for j in range(i + 1, len(nuove)) if nuove[j]['ok']), durata)
    n['s'] = round(min(max(n['s0'], prima), dopo), 3)
    n['e'] = round(max(min(n['e0'], dopo), n['s']), 3)

ok = sum(n['ok'] for n in nuove)
diff = [abs(n['s'] - n['s0']) for n in nuove if n['ok']]
json.dump([{k: n[k] for k in ('w', 's', 'e', 's0', 'e0')} for n in nuove], open(uscita, 'w', encoding='utf8'), ensure_ascii=False)
print(f'[allinea] {ok}/{len(nuove)} parole allineate ({dev}); spostamento medio {np.mean(diff) if diff else 0:.3f} s, massimo {max(diff) if diff else 0:.3f} s')

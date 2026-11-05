# Sincronizza una voce registrata a parte (microfono esterno) con l'audio della camera.
#   python pc/locale/sincronizza.py <video> <voce> <uscita.wav>
# Trova lo scarto confrontando le due forme d'onda (correlazione incrociata dell'inviluppo, poi rifinita sul segnale)
# e scrive la voce spostata e tagliata alla durata del video: <uscita.wav> va al secondo 0 del video.
# Controllo: la correlazione si ripete su un secondo tratto (a metà video); se i due scarti non coincidono avvisa
# (deriva tra i due orologi o voce di un'altra ripresa).
import json, subprocess, sys
import numpy as np
sys.stdout.reconfigure(encoding='utf-8')

video, voce, uscita = sys.argv[1:4]
SR = 8000

def pcm(f, sr=SR):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', f, '-vn', '-ac', '1', '-ar', str(sr), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).copy()

def inviluppo(x, passo):
    n = len(x) // passo
    e = np.abs(x[:n * passo]).reshape(n, passo).mean(1)
    e = np.log1p(e * 100)
    return (e - e.mean()) / (e.std() + 1e-9)

def xcorr(a, b):
    # ritardo r per cui b[t] ≈ a[t - r]  (r > 0: la voce parte dopo)
    n = 1 << int(np.ceil(np.log2(len(a) + len(b))))
    c = np.fft.irfft(np.fft.rfft(b, n) * np.conj(np.fft.rfft(a, n)), n)
    c = np.concatenate([c[-(len(a) - 1):], c[:len(b)]])
    k = int(np.argmax(c))
    return k - (len(a) - 1), c[k] / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9)

cam, vo = pcm(video), pcm(voce)
dur_v = len(cam) / SR

def scarto(da, lung, vicino=None):
    # tratto della camera [da, da+lung): dove cade nella voce. Prima grossolano (inviluppo a 5 ms), poi fine (segnale).
    # vicino: scarto già noto; si cerca solo entro ±2 s (per il controllo di deriva: niente falsi agganci lontani)
    a = cam[int(da * SR):int((da + lung) * SR)]
    passo = SR // 200
    if vicino is None:
        r, q = xcorr(inviluppo(a, passo), inviluppo(vo, passo))
        grosso = r * passo / SR + da                   # secondo della voce dove inizia il tratto: off = grosso - da
    else:
        lo0 = int(max(0, (da + vicino - 2) * SR)); hi0 = int(min(len(vo), (da + vicino + lung + 2) * SR))
        r, q = xcorr(inviluppo(a, passo), inviluppo(vo[lo0:hi0], passo))
        grosso = (lo0 + r * passo) / SR
    lo = int(max(0, (grosso - 0.05) * SR)); hi = int(min(len(vo), (grosso + lung + 0.05) * SR))
    r2, q2 = xcorr(a - a.mean(), vo[lo:hi] - vo[lo:hi].mean())
    return (lo + r2) / SR - da, q, q2

lung = min(40.0, dur_v / 3)
o1, q1, f1 = scarto(min(5.0, dur_v * 0.05), lung)
o2, q2, f2 = scarto(dur_v * 0.5, lung, vicino=o1)
print(f'[sincronizza] scarto {o1:+.3f} s (qualità {q1:.2f}/{f1:.2f}); controllo a metà: {o2:+.3f} s (qualità {q2:.2f}/{f2:.2f})')
if abs(o1 - o2) > 0.04:
    print(f'[sincronizza] ATTENZIONE: i due scarti differiscono di {abs(o1 - o2) * 1000:.0f} ms (deriva o registrazioni diverse): controlla in DaVinci')
off = (o1 + o2) / 2 if abs(o1 - o2) <= 0.04 else o1
# voce spostata: il secondo t del video è il secondo t + off della voce
filtro = f'atrim=start={off:.4f},asetpts=PTS-STARTPTS' if off >= 0 else f'adelay={int(-off * 1000)}:all=1'
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', voce, '-af', f'{filtro},apad', '-t', f'{dur_v:.3f}', '-ar', '48000', '-c:a', 'pcm_s24le', uscita], check=True)
json.dump({'scarto': round(off, 4), 'qualita': [round(float(q1), 3), round(float(q2), 3)], 'controllo': round(o2, 4)}, open(uscita + '.json', 'w'))
print(f'[sincronizza] voce allineata al video → {uscita}')

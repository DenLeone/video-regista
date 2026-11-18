#!/usr/bin/env python3
"""
Black Den Motion — effetti sonori generati da codice
Skill creata da Den (Black Den) · IG @itsblackden · TikTok @itsblackden · YouTube @itsblackden

Nessun campione audio esterno: ogni suono è sintetizzato, quindi niente problemi di licenza.
Stesso cue, stesso suono (casualità con seed fisso).

Uso da riga di comando:
  python3 sfx.py --list                 elenca i suoni
  python3 sfx.py --demo demo.wav        tutti i suoni in fila, per ascoltarli
"""
import argparse
import math
import wave
import sys
import zlib

import numpy as np

# Console di Windows: evita errori con emoji e lettere accentate.
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

SR = 48000


# ---------- mattoni ----------
def _n(sec):
    return max(1, int(sec * SR))


def _t(n):
    return np.arange(n) / SR


def _rng(*key):
    return np.random.default_rng(zlib.crc32(repr(key).encode()))


def _decay(n, tau, attack=0.002):
    t = _t(n)
    env = np.exp(-t / max(tau, 1e-4))
    a = _n(attack)
    if a > 1:
        env[:a] *= np.linspace(0, 1, a)
    return env


def _sweep(n, f0, f1, curve="exp"):
    """Fase di un oscillatore con frequenza che va da f0 a f1."""
    k = np.linspace(0, 1, n)
    f = f0 * (f1 / f0) ** k if curve == "exp" else f0 + (f1 - f0) * k
    return 2 * np.pi * np.cumsum(f) / SR


def _onepole_lp(x, fc):
    a = 1 - math.exp(-2 * math.pi * fc / SR)
    y = np.empty_like(x)
    s = 0.0
    for i, v in enumerate(x):
        s += a * (v - s)
        y[i] = s
    return y


def _hp(x, fc):
    return x - _onepole_lp(x, fc)


def _svf_band(x, fc, q=1.0):
    """Passa-banda a variabile di stato; fc può essere un array (sweep)."""
    fc = np.broadcast_to(np.asarray(fc, dtype=float), x.shape)
    f = 2 * np.sin(np.pi * np.minimum(fc, SR / 6) / SR)
    damp = 1 / q
    low = band = 0.0
    y = np.empty_like(x)
    for i in range(len(x)):
        low += f[i] * band
        high = x[i] - low - damp * band
        band += f[i] * high
        y[i] = band
    return y


def _stereo(m, pan=0.0, width=0.0, seed=0):
    """Mono -> stereo con pan a potenza costante; width aggiunge un micro-ritardo a destra."""
    p = (np.clip(pan, -1, 1) + 1) * np.pi / 4
    l, r = m * np.cos(p), m * np.sin(p)
    if width > 0:
        d = int(width * SR)
        r = np.concatenate([np.zeros(d), r[:-d]]) if d < len(r) else r
    return np.stack([l, r], axis=1)


def _norm(x, peak=1.0):
    m = np.max(np.abs(x)) or 1.0
    return x / m * peak


# ---------- suoni ----------
def whoosh(dur=0.6, seed=0, hi=3200):
    n = _n(dur)
    k = np.linspace(0, 1, n)
    noise = _rng("whoosh", seed).standard_normal(n)
    shape = np.sin(np.pi * np.clip(k / 0.62, 0, 1) * 0.5) ** 2 * np.where(k > 0.62, np.exp(-(k - 0.62) * 9), 1)
    fc = 280 + (hi - 280) * np.sin(np.pi * np.clip(k, 0, 1)) ** 1.5
    y = _norm(_svf_band(_svf_band(noise, fc, q=1.1), fc, q=1.1)) * shape
    pan = np.linspace(-0.6, 0.6, n)
    out = np.stack([y * np.cos((pan + 1) * np.pi / 4), y * np.sin((pan + 1) * np.pi / 4)], axis=1)
    return out * 0.9


def swipe(dur=0.28, seed=0):
    return whoosh(dur, seed, hi=6500) * 0.7


def riser(dur=1.4, seed=0):
    n = _n(dur)
    k = np.linspace(0, 1, n)
    noise = _rng("riser", seed).standard_normal(n)
    fc = 200 * (5000 / 200) ** k
    air = _norm(_svf_band(_svf_band(noise, fc, q=1.6), fc, q=1.6))
    tone = np.sin(_sweep(n, 110, 880)) * 0.35 + np.sin(_sweep(n, 220, 1760)) * 0.15
    y = (air * 0.8 + tone) * k ** 2.2
    y[-_n(0.012):] *= np.linspace(1, 0, _n(0.012))
    return _stereo(y, width=0.008) * 0.8


def impact(seed=0):
    n = _n(1.2)
    sub = np.sin(_sweep(n, 120, 36)) * _decay(n, 0.32)
    noise = _rng("impact", seed).standard_normal(n)
    body = _onepole_lp(noise, 1800) * 3.0 * _decay(n, 0.07)
    click = np.zeros(n)
    c = _n(0.003)
    click[:c] = np.linspace(1, 0, c)
    y = np.tanh((sub * 1.1 + body + click * 0.8) * 1.6)
    return _stereo(y, width=0.012) * 0.95


def hit(seed=0):
    n = _n(0.45)
    y = np.sin(_sweep(n, 95, 42)) * _decay(n, 0.13)
    c = _n(0.002)
    y[:c] += np.linspace(0.6, 0, c)
    return _stereo(np.tanh(y * 1.4)) * 0.8


def shimmer(seed=0):
    n = _n(1.3)
    r = _rng("shimmer", seed)
    t = _t(n)
    out = np.zeros((n, 2))
    for i in range(9):
        f = r.uniform(2400, 7200)
        start = _n(r.uniform(0, 0.25))
        env = np.zeros(n)
        env[start:] = _decay(n - start, r.uniform(0.25, 0.6), attack=0.03)
        trem = 0.75 + 0.25 * np.sin(2 * np.pi * r.uniform(8, 14) * t)
        out += _stereo(np.sin(2 * np.pi * f * t) * env * trem, pan=r.uniform(-0.8, 0.8))
    return _norm(out, 0.45)


def data(dur=1.0, seed=0):
    n = _n(dur)
    r = _rng("data", seed)
    y = np.zeros(n)
    notes = [880, 1175, 1320, 1568, 1760, 2349]
    step = 0.04
    for j in range(int(dur / step)):
        if r.random() < 0.3:
            continue
        s, ln = _n(j * step), _n(0.022)
        if s + ln > n:
            break
        f = notes[r.integers(len(notes))]
        tt = _t(ln)
        tone = np.sign(np.sin(2 * np.pi * f * tt)) * 0.4 + np.sin(2 * np.pi * f * tt) * 0.6
        y[s:s + ln] += tone * _decay(ln, 0.012)
    return _stereo(_onepole_lp(y, 6000), width=0.004) * 0.22


def type_(seed=0):
    n = _n(0.04)
    r = _rng("type", seed)
    noise = r.standard_normal(n)
    y = _hp(noise, 1500) * _decay(n, 0.004) * 0.9 + np.sin(2 * np.pi * r.uniform(2600, 3400) * _t(n)) * _decay(n, 0.003) * 0.4
    return _stereo(y, pan=r.uniform(-0.15, 0.15)) * r.uniform(0.25, 0.4)


def tick(seed=0):
    n = _n(0.03)
    y = np.sin(2 * np.pi * 2200 * _t(n)) * _decay(n, 0.004)
    return _stereo(y) * 0.25


def bell(freqs, tau=0.9, gain=0.35):
    n = _n(tau * 3.5)
    t = _t(n)
    y = np.zeros(n)
    for f in freqs:
        for ratio, amp, tr in ((1, 1, 1), (2.76, 0.35, 0.45), (5.4, 0.15, 0.22)):
            y += np.sin(2 * np.pi * f * ratio * t) * amp * _decay(n, tau * tr, attack=0.003)
    return _stereo(_norm(y), width=0.006) * gain


def ding(seed=0):
    return bell([1318.5], 0.8, 0.32)


def success(seed=0):
    parts = [bell([f], 0.5, 0.3) for f in (1046.5, 1318.5, 1568.0)]
    off = _n(0.075)
    out = np.zeros((len(parts[0]) + off * 2, 2))
    for i, p in enumerate(parts):
        out[i * off:i * off + len(p)] += p
    return out


def pop(seed=0):
    n = _n(0.12)
    y = np.sin(_sweep(n, 1000, 240)) * _decay(n, 0.035)
    c = _n(0.0015)
    y[:c] += np.linspace(0.5, 0, c)
    return _stereo(y) * 0.6


def click(seed=0):
    n = _n(0.06)
    r = _rng("click", seed)
    y = np.zeros(n)
    for off, g in ((0, 1.0), (0.028, 0.6)):
        s, ln = _n(off), _n(0.012)
        seg = _svf_band(r.standard_normal(ln), 3200, q=2.5) * _decay(ln, 0.0025)
        seg += np.sin(2 * np.pi * 1200 * _t(ln)) * _decay(ln, 0.003) * 0.4
        y[s:s + ln] += seg * g
    return _stereo(_norm(y)) * 0.45


def glitch(dur=0.4, seed=0):
    n = _n(dur)
    r = _rng("glitch", seed)
    y = np.zeros(n)
    fr = _n(1 / 30)
    for s in range(0, n, fr):
        if r.random() < 0.3:
            continue
        ln = min(fr, n - s)
        f = r.uniform(60, 420)
        tt = _t(ln)
        buzz = np.sign(np.sin(2 * np.pi * f * tt)) * 0.6 + r.standard_normal(ln) * 0.4
        hold = int(r.integers(4, 24))
        buzz = np.repeat(buzz[::hold], hold)[:ln]
        y[s:s + ln] = buzz * r.uniform(0.4, 1.0)
    return _stereo(np.tanh(y * 1.5), width=0.003) * 0.35


SOUNDS = {
    "whoosh": whoosh, "swipe": swipe, "riser": riser, "impact": impact, "hit": hit, "shimmer": shimmer,
    "data": data, "type": type_, "tick": tick, "ding": ding, "success": success, "pop": pop, "click": click,
    "glitch": glitch,
}
# Suoni che finiscono sul cue invece di iniziare lì.
ENDS_AT_CUE = {"riser"}
HAS_DUR = {"whoosh", "swipe", "riser", "data", "glitch"}


def make(cue, index=0):
    typ = cue.get("type")
    fn = SOUNDS.get(typ)
    if not fn:
        return None
    seed = cue.get("seed", index)
    kw = {"seed": seed}
    if typ in HAS_DUR and cue.get("dur"):
        kw["dur"] = float(cue["dur"])
    s = fn(**kw)
    g = float(cue.get("gain", 1.0))
    pan = float(cue.get("pan", 0.0))
    if pan:
        p = (np.clip(pan, -1, 1) + 1) * np.pi / 4
        s = s * np.array([np.cos(p), np.sin(p)]) * math.sqrt(2)
    return s * g


def mix(cues, duration, t0=0.0, peak_db=-1.0):
    """Crea la traccia stereo (float32, -1..1) lunga `duration` secondi a partire da t0."""
    n = _n(duration)
    buf = np.zeros((n, 2))
    for i, c in enumerate(sorted(cues, key=lambda c: c["t"])):
        s = make(c, i)
        if s is None:
            continue
        start = c["t"] - t0
        if c.get("type") in ENDS_AT_CUE:
            start -= len(s) / SR
        a = int(round(start * SR))
        if a < 0:
            s, a = s[-a:], 0
        b = min(n, a + len(s))
        if b > a:
            buf[a:b] += s[: b - a]
    buf = np.tanh(buf * 1.1) / math.tanh(1.1)
    m = np.max(np.abs(buf))
    if m > 0:
        buf *= (10 ** (peak_db / 20)) / m
    f = min(n, _n(0.02))
    buf[-f:] *= np.linspace(1, 0, f)[:, None]
    return buf.astype(np.float32)


def write_wav(path, buf):
    pcm = (np.clip(buf, -1, 1) * 32767).astype("<i2")
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Effetti sonori Black Den Motion")
    ap.add_argument("--list", action="store_true", help="elenca i suoni")
    ap.add_argument("--demo", help="scrive un .wav con tutti i suoni in fila")
    a = ap.parse_args()
    if a.list or not a.demo:
        print("Suoni:", ", ".join(SOUNDS))
    if a.demo:
        cues, t = [], 0.3
        for name in SOUNDS:
            cues.append({"t": t + (1.4 if name in ENDS_AT_CUE else 0), "type": name})
            t += 1.6 if name in ENDS_AT_CUE else 1.2
        write_wav(a.demo, mix(cues, t + 1.5))
        print("Scritto", a.demo)

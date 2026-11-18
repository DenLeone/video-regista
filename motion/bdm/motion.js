/*
  Black Den Motion — motore di animazione + libreria di preset
  Skill creata da Den (Black Den) · IG @itsblackden · TikTok @itsblackden · YouTube @itsblackden

  Regola d'oro: ogni fotogramma dipende solo da t. Niente CSS animation/transition, timer o Math.random.
*/
(function () {
  'use strict';
  const M = (window.M = {});
  const B = () => window.BRAND || {};

  M.META = { width: 1080, height: 1920, fps: 30, duration: 6 };

  /* ---------- Easing ---------- */
  M.EASE = {
    linear: t => t,
    in: t => t * t * t,
    out: t => 1 - Math.pow(1 - t, 3),
    inOut: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    expoOut: t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    expoInOut: t => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2),
    back: t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  };
  const clamp01 = v => Math.max(0, Math.min(1, v));
  const PROPS = ['x', 'y', 's', 'sx', 'sy', 'r', 'rx', 'ry', 'o', 'blur', 'clip', 'clipY', 'ls', 'glow'];
  const TRANSFORM = ['x', 'y', 's', 'sx', 'sy', 'r', 'rx', 'ry'];

  /* ---------- Utilità ---------- */
  // Casualità ripetibile: stesso seed, stessa sequenza.
  M.rand = seed => { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  // Valore casuale fisso per una coppia di numeri (es. fotogramma, indice).
  M.hash = (a, b = 0) => { let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  M.$ = sel => (typeof sel === 'string' ? document.querySelector(sel) : sel);
  let uidN = 0;
  M.uid = (p = 'e') => `${p}${++uidN}`;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // Crea un elemento: M.el('div', { id, cls, text, html, style, parent })
  M.el = (tag, o = {}) => {
    const e = document.createElement(tag);
    e.id = o.id || M.uid(tag);
    if (o.cls) e.className = o.cls;
    if (o.text != null) e.textContent = o.text;
    if (o.html != null) e.innerHTML = o.html;
    if (o.src) e.src = o.src;
    if (o.style) Object.assign(e.style, o.style);
    (M.$(o.parent) || M.$('#content') || M.$('#stage')).appendChild(e);
    return e;
  };
  const ref = e => '#' + (e.id || (e.id = M.uid()));

  // Divide un testo in lettere/parole animabili; restituisce i selettori.
  M.splitLetters = sel => {
    const el = M.$(sel), txt = el.textContent; el.textContent = '';
    return [...txt].map(ch => ref(M.el('span', { cls: 'split', text: ch === ' ' ? ' ' : ch, parent: el })));
  };
  M.splitWords = sel => {
    const el = M.$(sel), words = el.textContent.trim().split(/\s+/); el.textContent = '';
    return words.map((w, i) => { if (i) el.appendChild(document.createTextNode(' '));
      return ref(M.el('span', { cls: 'split', text: w, parent: el })); });
  };
  M.stagger = (sels, keys, step) => sels.map((el, i) => ({ el, keys: keys.map(k => ({ ...k, t: k.t + i * step })) }));

  /* ---------- Tracce ---------- */
  const tracks = [];
  // M.add(traccia | [tracce] | {fn: t => ...}) — accetta anche liste annidate.
  M.add = (...ts) => { for (const t of ts.flat(Infinity)) if (t) tracks.push(t); };
  M.tracks = tracks;

  /* ---------- Audio (cue) ---------- */
  // M.sfx(t, tipo, {gain, pan, dur, seed}) aggiunge un effetto sonoro al secondo t.
  // Tipi: whoosh, swipe, riser (finisce su t), impact, hit, shimmer, data, type, tick, ding, success, pop, click, glitch.
  // I preset aggiungono i loro suoni da soli; per spegnerli: M.AUDIO.auto = false, oppure {sfx: false} nel singolo preset.
  M.AUDIO = { auto: true };
  M.CUES = [];
  M.sfx = (t, type, o = {}) => { M.CUES.push({ t, type, ...o }); };
  const cue = (opt, t, type, o) => { if (M.AUDIO.auto && opt && opt.sfx !== false) M.sfx(t, typeof opt.sfx === 'string' ? opt.sfx : type, o); };

  function sample(keys, t, p) {
    let prev = null;
    for (const k of keys) {
      if (k[p] === undefined) continue;
      if (t <= k.t) {
        if (!prev) return k[p];
        const span = k.t - prev.t, u = span > 0 ? clamp01((t - prev.t) / span) : 1;
        return prev[p] + (k[p] - prev[p]) * (M.EASE[k.ease] || M.EASE.inOut)(u);
      }
      prev = k;
    }
    return prev ? prev[p] : undefined;
  }

  let compiled = [], fns = [];
  // Le tracce sullo stesso elemento vengono unite: una proprietà = una curva sola.
  M.compile = () => {
    compiled = []; fns = [];
    const byEl = new Map();
    for (const tr of tracks) {
      if (tr.fn) { fns.push(tr.fn); continue; }
      const el = M.$(tr.el);
      if (!el) throw new Error('Elemento non trovato: ' + tr.el);
      if (!byEl.has(el)) byEl.set(el, []);
      byEl.get(el).push(...tr.keys);
    }
    for (const [el, keys] of byEl) {
      keys.sort((a, b) => a.t - b.t);
      compiled.push({ el, keys, used: PROPS.filter(p => keys.some(k => k[p] !== undefined)) });
    }
  };

  // tf = tempo per le tracce funzione (testi, glitch, sottotitoli): con il motion blur resta quello del fotogramma.
  M.seek = (t, tf = t) => {
    for (const { el, keys, used } of compiled) {
      const v = {};
      for (const p of used) v[p] = sample(keys, t, p);
      if (TRANSFORM.some(p => p in v)) {
        const s = v.s ?? 1, is3d = 'rx' in v || 'ry' in v;
        el.style.transform = (is3d ? 'perspective(1600px) ' : '') + `translate(${v.x ?? 0}px, ${v.y ?? 0}px)` +
          (is3d ? ` rotateX(${v.rx ?? 0}deg) rotateY(${v.ry ?? 0}deg)` : '') +
          ` rotate(${v.r ?? 0}deg) scale(${(v.sx ?? 1) * s}, ${(v.sy ?? 1) * s})`;
      }
      if ('o' in v) el.style.opacity = clamp01(v.o);
      if ('blur' in v || 'glow' in v) {
        const f = [];
        if ((v.blur ?? 0) > 0.01) f.push(`blur(${v.blur}px)`);
        if ((v.glow ?? 0) > 0.01) f.push(`drop-shadow(0 0 ${v.glow}px var(--accent))`);
        el.style.filter = f.join(' ') || 'none';
      }
      if ('clip' in v || 'clipY' in v) {
        const r = 'clip' in v ? 100 - Math.max(0, Math.min(100, v.clip)) : 0;
        const b = 'clipY' in v ? 100 - Math.max(0, Math.min(100, v.clipY)) : 0;
        el.style.clipPath = `inset(0 ${r}% ${b}% 0)`;
      }
      if ('ls' in v) el.style.letterSpacing = v.ls + 'px';
    }
    for (const f of fns) f(tf);
  };

  /* ---------- Brand ---------- */
  M.applyBrand = () => {
    const b = B(), root = document.documentElement.style;
    for (const [k, v] of Object.entries(b.colors || {})) root.setProperty('--' + k, v);
    const f = b.font || {};
    if (f.file) {
      const st = document.createElement('style');
      st.textContent = `@font-face{font-family:"BrandFont";src:url("${f.file}");font-weight:100 900;}`;
      document.head.appendChild(st);
    }
    root.setProperty('--font', `${f.file ? '"BrandFont", ' : ''}"${f.family || 'Inter'}", "Helvetica Neue", Arial, sans-serif`);
    if (f.title) root.setProperty('--w-title', f.title);
    if (f.body) root.setProperty('--w-body', f.body);
  };

  /* ---------- Preset ---------- */
  const P = (M.P = {});
  const REST = { o: 1, x: 0, y: 0, s: 1, blur: 0, r: 0, rx: 0, ry: 0 };
  const FROM = {
    up: { o: 0, y: 70, blur: 12 }, down: { o: 0, y: -70, blur: 12 }, left: { o: 0, x: -60, blur: 8 },
    right: { o: 0, x: 60, blur: 8 }, scale: { o: 0, s: 1.6, blur: 10 }, blur: { o: 0, blur: 24 }, pop: { o: 0, s: 0.4 },
  };
  // Chiavi di entrata (e uscita opzionale) riutilizzate da molti preset.
  function enterKeys(from, t, dur, out, outDur = 0.4, outTo = { o: 0, y: -40, blur: 8 }, ease = 'expoOut') {
    const f = typeof from === 'string' ? FROM[from] : from, end = {};
    for (const k in f) end[k] = REST[k];
    const keys = [{ t, ...f }, { t: t + dur, ...end, ease }];
    if (out != null) {
      const hold = {};
      for (const k in { ...f, ...outTo }) hold[k] = REST[k];
      keys.push({ t: out, ...hold }, { t: out + outDur, ...outTo, ease: 'in' });
    }
    return keys;
  }
  P.enterKeys = enterKeys;

  // Entrata semplice di un elemento.
  P.enter = (sel, { t = 0, dur = 0.7, from = 'up', out = null, outDur = 0.4, outTo, ease, sfx = false } = {}) => {
    if (sfx) cue({ sfx }, t, sfx, { gain: 0.5 });
    return { el: sel, keys: enterKeys(from, t, dur, out, outDur, outTo, ease) };
  };

  // Testo lettera per lettera / parola per parola.
  P.lettersIn = (sel, o = {}) => {
    const { t = 0, step = 0.04, dur = 0.7, from = 'up', out = null, outDur = 0.4, outTo } = o;
    const sels = M.splitLetters(sel);
    cue(o, t, 'whoosh', { gain: 0.55, dur: Math.min(1.2, dur + step * sels.length) });
    return M.stagger(sels, enterKeys(from, t, dur, out, outDur, outTo), step);
  };
  P.wordsIn = (sel, o = {}) => {
    const { t = 0, step = 0.09, dur = 0.6, from = 'up', out = null, outDur = 0.35, outTo } = o;
    const sels = M.splitWords(sel);
    cue(o, t, 'swipe', { gain: 0.6 });
    return M.stagger(sels, enterKeys(from, t, dur, out, outDur, outTo), step);
  };

  // Rivelazione con maschera: dir 'x' (sinistra→destra) o 'y' (alto→basso).
  P.reveal = (sel, { t = 0, dur = 0.6, dir = 'x', out = null, outDur = 0.4, sfx = false } = {}) => {
    if (sfx) cue({ sfx }, t, 'swipe', { gain: 0.4 });
    const p = dir === 'y' ? 'clipY' : 'clip';
    const keys = [{ t, [p]: 0 }, { t: t + dur, [p]: 100, ease: 'expoOut' }];
    if (out != null) keys.push({ t: out, [p]: 100 }, { t: out + outDur, [p]: 0, ease: 'expoInOut' });
    return { el: sel, keys };
  };

  // Testo che si "decodifica" da caratteri casuali.
  P.decode = (sel, o = {}) => {
    const { t = 0, dur = 1, seed = 1, chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*/' } = o;
    const el = M.$(sel), final = [...el.textContent]; el.textContent = '';
    cue(o, t, 'data', { dur: dur * 0.85, seed });
    return { fn: T => {
      if (T < t) { el.textContent = ''; return; }
      const p = clamp01((T - t) / dur), n = final.length, f = Math.floor(T * M.META.fps / 2);
      const shown = Math.min(n, Math.ceil(p * 2 * n)), solved = Math.floor(clamp01((p - 0.2) / 0.8) * n);
      let s = '';
      for (let i = 0; i < shown; i++) {
        const c = final[i];
        s += c === ' ' || i < solved ? c : chars[Math.floor(M.hash(f, i + seed * 131) * chars.length)];
      }
      el.textContent = s;
    } };
  };

  // Macchina da scrivere con cursore.
  P.typewriter = (sel, o = {}) => {
    const { t = 0, cps = 20, cursor = true, hideCursorAfter = null } = o;
    const el = M.$(sel), final = el.textContent; el.textContent = '';
    [...final].forEach((ch, i) => { if (ch.trim()) cue(o, t + (i + 1) / cps, 'type', { seed: i }); });
    return { fn: T => {
      const n = Math.max(0, Math.min(final.length, Math.floor((T - t) * cps)));
      const blinkOn = Math.floor(T * 2.5) % 2 === 0;
      const showCur = cursor && T >= t - 0.4 && (hideCursorAfter == null || T < hideCursorAfter) && (n < final.length || blinkOn);
      el.innerHTML = esc(final.slice(0, n)) + (showCur ? '<span class="cursor">▍</span>' : '');
    } };
  };

  // Contatore numerico (formato italiano).
  P.counter = (sel, o = {}) => {
    const { t = 0, dur = 1.2, from = 0, to = 100, decimals = 0, prefix = '', suffix = '', ease = 'expoOut' } = o;
    const el = M.$(sel), E = M.EASE[ease] || M.EASE.out;
    // Un tick ogni 1/16 del percorso, distribuiti secondo l'easing; ding all'arrivo.
    for (let i = 1; i < 16; i++) { let lo = 0, hi = 1; for (let j = 0; j < 30; j++) { const m = (lo + hi) / 2; if (E(m) < i / 16) lo = m; else hi = m; }
      cue(o, t + lo * dur, 'tick', { seed: i }); }
    cue(o, t + dur * 0.92, 'ding');
    return { fn: T => {
      const v = from + (to - from) * (M.EASE[ease] || M.EASE.out)(clamp01((T - t) / dur));
      el.textContent = prefix + v.toLocaleString('it-IT', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix;
    } };
  };

  // Glitch RGB a scatti (deterministico).
  P.glitch = (sel, o = {}) => {
    const { t = 0, dur = 0.45, seed = 3, amount = 1 } = o;
    const el = M.$(sel);
    cue(o, t, 'glitch', { dur, seed, gain: Math.min(1, 0.6 + amount * 0.4) });
    return { fn: T => {
      if (T < t || T >= t + dur) { if (el.dataset.glitch === String(seed)) { el.style.translate = ''; el.style.textShadow = ''; delete el.dataset.glitch; } return; }
      const f = Math.floor(T * M.META.fps);
      if (M.hash(f, seed) < 0.25) { el.style.translate = ''; el.style.textShadow = ''; return; }
      const dx = (M.hash(f, seed + 1) - 0.5) * 40 * amount, dy = (M.hash(f, seed + 2) - 0.5) * 10 * amount;
      el.style.translate = `${dx.toFixed(1)}px ${dy.toFixed(1)}px`;
      el.style.textShadow = `${(dx * 0.6).toFixed(1)}px 0 var(--accent2), ${(-dx * 0.6).toFixed(1)}px 0 var(--accent)`;
      el.dataset.glitch = String(seed);
    } };
  };

  // Flash a schermo intero (transizione).
  P.flash = (t, o = {}) => {
    const { dur = 0.3, color = '#ffffff', peak = 0.85 } = o;
    cue(o, t, 'impact');
    const e = M.el('div', { cls: 'fill', style: { background: color, opacity: 0 }, parent: '#fx' });
    return { el: ref(e), keys: [{ t: t - 0.05, o: 0 }, { t, o: peak, ease: 'out' }, { t: t + dur, o: 0, ease: 'out' }] };
  };

  // Colpo di zoom sulla scena (usa #punch, separato dalla camera).
  P.punch = (t, o = {}) => {
    const { sel = '#punch', amount = 0.07, dur = 0.45 } = o;
    cue(o, t, 'hit', { gain: Math.min(1, amount * 8) });
    return { el: sel, keys: [{ t, s: 1 }, { t: t + 0.07, s: 1 + amount, ease: 'out' }, { t: t + dur, s: 1, ease: 'expoOut' }] };
  };

  // Movimento lento della camera per tutta la scena.
  P.drift = ({ from = 1, to = 1.06, sel = '#camera' } = {}) =>
    ({ el: sel, keys: [{ t: 0, s: from }, { t: M.META.duration, s: to, ease: 'linear' }] });

  // Particelle di sfondo che salgono.
  P.particles = ({ n = 28, seed = 7, size = 6, rise = [60, 200], alpha = [0.08, 0.33], parent = '#bg' } = {}) => {
    const R = M.rand(seed), out = [], D = M.META.duration;
    for (let i = 0; i < n; i++) {
      const e = M.el('div', { cls: 'dot abs', parent, style: { width: size + 'px', height: size + 'px',
        left: R() * M.META.width + 'px', top: R() * M.META.height + 'px' } });
      const o = alpha[0] + R() * (alpha[1] - alpha[0]), dy = rise[0] + R() * (rise[1] - rise[0]);
      out.push({ el: ref(e), keys: [{ t: 0, y: 0, o: 0 }, { t: 1, o }, { t: D - 1, o }, { t: D, y: -dy, o: 0, ease: 'linear' }] });
    }
    return out;
  };

  // Reveal del logo (immagine) o del nome del brand (testo), con linee e riflesso di luce.
  P.logoReveal = (o = {}) => {
    const { t = 0, src = B().logo, text = B().name || 'BRAND', y = 840, size = 128, lines = true, out = null, outDur = 0.5 } = o;
    cue(o, t + 0.35, 'riser', { dur: Math.min(1.4, t + 0.35) || 0.6, gain: 0.7 });
    cue(o, t + 0.35, 'impact', { gain: 0.85 });
    cue(o, t + 1.2, 'shimmer');
    if (out != null) cue(o, out, 'whoosh', { gain: 0.45, dur: 0.5 });
    const box = M.el('div', { cls: 'abs logo-box', style: { top: y + 'px', height: size * 1.1 + 'px' } });
    const res = [];
    let shineEl;
    if (src) {
      const img = M.el('img', { src, cls: 'logo-img', parent: box, style: { height: size * 1.1 + 'px' } });
      res.push(P.enter(ref(img), { t, dur: 0.9, from: { o: 0, s: 1.25, blur: 20 }, out, outDur, outTo: { o: 0, s: 0.9, blur: 12 } }));
      shineEl = M.el('div', { cls: 'shine-mask', parent: box, style: { height: size * 1.1 + 'px',
        WebkitMaskImage: `url("${src}")`, maskImage: `url("${src}")` } });
    } else {
      const txt = M.el('div', { cls: 'logo-text', text, parent: box, style: { fontSize: size + 'px' } });
      res.push(P.lettersIn(ref(txt), { t, step: 0.05, dur: 0.8, from: 'scale', out, outDur, outTo: { o: 0, y: -50, blur: 10 }, sfx: false }));
      shineEl = M.el('div', { cls: 'logo-text shine-text', text, parent: box, style: { fontSize: size + 'px' } });
    }
    res.push({ el: ref(box), keys: [{ t: t + 0.9, glow: 0 }, { t: t + 1.4, glow: 22, ease: 'out' }, { t: t + 2.3, glow: 6 }] });
    const sh = shineEl;
    res.push({ fn: T => { const p = clamp01((T - t - 1.2) / 0.9); sh.style.backgroundPosition = `${150 - p * 200}% 0`; sh.style.opacity = p > 0 && p < 1 ? 1 : 0; } });
    if (lines) {
      const l1 = M.el('div', { cls: 'abs hline', style: { top: y - 70 + 'px' } });
      const l2 = M.el('div', { cls: 'abs hline', style: { top: y + size * 1.1 + 150 + 'px' } });
      res.push(P.reveal(ref(l1), { t: t - 0.3, dur: 0.8, out, outDur }), P.reveal(ref(l2), { t: t - 0.15, dur: 0.8, out: out != null ? out + 0.1 : null, outDur }));
    }
    return res;
  };

  // Lower third: barra, titolo e sottotitolo.
  P.lowerThird = (o = {}) => {
    const { title, sub = '', t = 0, hold = 2.5, x = 70, y = 1330, typeSub = true } = o;
    cue(o, t, 'swipe', { gain: 0.7 });
    cue(o, t + hold, 'swipe', { gain: 0.4, seed: 9 });
    const box = M.el('div', { cls: 'abs lt', style: { left: x + 'px', top: y + 'px' } });
    const bar = M.el('div', { cls: 'lt-bar', parent: box });
    const ti = M.el('div', { cls: 'lt-title', text: title, parent: box });
    const su = M.el('div', { cls: 'lt-sub', text: sub, parent: box });
    const end = t + hold, res = [
      { el: ref(bar), keys: [{ t, sy: 0 }, { t: t + 0.35, sy: 1, ease: 'expoOut' }, { t: end, sy: 1 }, { t: end + 0.35, sy: 0, ease: 'in' }] },
      P.reveal(ref(ti), { t: t + 0.12, dur: 0.6, out: end - 0.05, outDur: 0.35 }),
      { el: ref(ti), keys: [{ t: t + 0.12, x: -24 }, { t: t + 0.72, x: 0, ease: 'expoOut' }] },
      { el: ref(su), keys: [{ t: t + 0.3, o: 0 }, { t: t + 0.4, o: 1 }, { t: end - 0.1, o: 1 }, { t: end + 0.2, o: 0 }] },
    ];
    if (sub && typeSub) res.push(P.typewriter(ref(su), { t: t + 0.45, cps: 26, hideCursorAfter: end, sfx: o.sfx }));
    return res;
  };

  // Call to action "Segui" con tap e conferma.
  P.cta = (o = {}) => {
    const { t = 0, hold = 2.6, text = 'SEGUI', done = 'SEGUITO', handle = (B().handles || {}).tiktok || '', y = 1150 } = o;
    const box = M.el('div', { cls: 'abs cta', style: { top: y + 'px' } });
    const btn = M.el('div', { cls: 'cta-btn', html: `<span class="cta-plus">+</span> ${esc(text)}`, parent: box });
    const tap = M.el('div', { cls: 'cta-tap', parent: box });
    const h = M.el('div', { cls: 'cta-handle', text: handle, parent: box });
    const press = t + 1.1, end = t + hold;
    cue(o, t + 0.12, 'pop');
    cue(o, press, 'click');
    cue(o, press + 0.1, 'success');
    return [
      { el: ref(btn), keys: [{ t, o: 0, s: 0.4 }, { t: t + 0.55, o: 1, s: 1, ease: 'back' }, { t: press, s: 1 },
        { t: press + 0.08, s: 0.9, ease: 'out' }, { t: press + 0.3, s: 1, ease: 'back' }, { t: end, o: 1 }, { t: end + 0.35, o: 0, ease: 'in' }] },
      { el: ref(btn), keys: [{ t: press + 0.1, glow: 0 }, { t: press + 0.35, glow: 28, ease: 'out' }, { t: press + 1.0, glow: 8 }] },
      { el: ref(tap), keys: [{ t: press - 0.02, o: 0, s: 0.3 }, { t: press, o: 0.9, s: 0.3 }, { t: press + 0.45, o: 0, s: 1.7, ease: 'out' }] },
      { fn: T => { const d = T >= press + 0.08; btn.classList.toggle('done', d);
        btn.innerHTML = d ? `<span class="cta-plus">✓</span> ${esc(done)}` : `<span class="cta-plus">+</span> ${esc(text)}`; } },
      P.enter(ref(h), { t: t + 0.3, dur: 0.6, from: 'up', out: end, outDur: 0.35 }),
    ];
  };

  // Telefono in 2.5D con screenshot (src) o interfaccia finta.
  P.phone = (o = {}) => {
    const { t = 0, hold = 3, src = null, x = null, y = 520, w = 500, out = true } = o;
    cue(o, t, 'whoosh', { dur: 1.0, gain: 0.8 });
    if (out) cue(o, t + hold, 'whoosh', { dur: 0.6, gain: 0.5, seed: 5 });
    const h = Math.round(w * 2.05), left = x == null ? (M.META.width - w) / 2 : x;
    const ph = M.el('div', { cls: 'abs phone', style: { left: left + 'px', top: y + 'px', width: w + 'px', height: h + 'px' } });
    const scr = M.el('div', { cls: 'phone-screen', parent: ph });
    M.el('div', { cls: 'phone-notch', parent: ph });
    const res = [];
    if (src) M.el('img', { src, cls: 'phone-img', parent: scr });
    else {
      const hdr = M.el('div', { cls: 'ui-hdr', parent: scr });
      const hero = M.el('div', { cls: 'ui-hero', parent: scr });
      const rows = [0, 1, 2].map(() => M.el('div', { cls: 'ui-row', parent: scr, html: '<i></i><b></b>' }));
      res.push(M.stagger([hdr, hero, ...rows].map(ref), [{ t: t + 0.45, o: 0, y: 40 }, { t: t + 1.05, o: 1, y: 0, ease: 'expoOut' }], 0.09));
    }
    const end = t + hold;
    const keys = [{ t, o: 0, y: 380, rx: 28, ry: -24, s: 0.9 }, { t: t + 1.0, o: 1, y: 0, rx: 10, ry: -12, s: 1, ease: 'expoOut' },
      { t: end, o: 1, y: 0, s: 1, rx: 6, ry: 10, ease: 'inOut' }];
    if (out) keys.push({ t: end + 0.5, o: 0, y: -260, rx: -12, ry: 16, s: 0.95, ease: 'in' });
    res.push({ el: ref(ph), keys });
    return res;
  };

  // Sottotitoli animati dalla voce (parole da words.js, generato da scripts/transcribe.py).
  // style: 'pop' (parola attiva evidenziata), 'karaoke' (le parole dette restano colorate), 'reveal' (appaiono mentre le dici).
  P.captions = (o = {}) => {
    const { words = window.WORDS || [], offset = 0, y = 1180, x = 80, w = 840, size = 92, maxWords = 3, maxChars = Math.floor(w / (size * 0.66)),
      upper = true, style = 'pop', emphasis = [], strip = true, gap = 0.6, linger = 0.5, keep = [B().name].filter(Boolean) } = o;
    const clean = s => (strip ? s.replace(/[.,;:!?…"“”«»]+/g, '') : s).trim();
    const emph = new Set(emphasis.map(e => e.toLowerCase()));
    let W = words.map(v => ({ raw: v.w, text: clean(v.w), t0: v.t0 + offset, t1: v.t1 + offset })).filter(v => v.text);
    // Frasi da non spezzare mai (es. il nome del brand): diventano un'unica "parola".
    for (const ph of keep) {
      const parts = ph.toLowerCase().split(/\s+/).filter(Boolean);
      if (parts.length < 2) continue;
      const out = [];
      for (let i = 0; i < W.length; i++) {
        if (parts.every((pt, k) => W[i + k] && W[i + k].text.toLowerCase() === pt)) {
          const last = W[i + parts.length - 1];
          out.push({ raw: last.raw, text: W.slice(i, i + parts.length).map(v => v.text).join(' '), t0: W[i].t0, t1: last.t1 });
          i += parts.length - 1;
        } else out.push(W[i]);
      }
      W = out;
    }
    const groups = [];
    let g = null;
    W.forEach((v, i) => {
      const prev = W[i - 1];
      const brk = !g || g.words.length >= maxWords || g.chars + v.text.length + 1 > maxChars ||
        (prev && v.t0 - prev.t1 > gap) || (prev && /[.!?…]$/.test(prev.raw.trim()));
      if (brk) { g = { words: [], chars: 0 }; groups.push(g); }
      g.words.push(v); g.chars += v.text.length + 1;
    });
    groups.forEach(gr => { gr.t0 = gr.words[0].t0; });
    groups.forEach((gr, i) => {
      const end = gr.words[gr.words.length - 1].t1 + linger;
      gr.t1 = i + 1 < groups.length ? Math.min(end, groups[i + 1].t0) : end;
    });
    const box = M.el('div', { cls: 'abs cap', style: { top: y + 'px', left: x + 'px', width: w + 'px', fontSize: size + 'px' } });
    let cur = null, spans = [];
    return { fn: T => {
      const gr = groups.find(q => T >= q.t0 && T < q.t1);
      if (!gr) { if (cur) { box.innerHTML = ''; cur = null; } box.style.opacity = 0; return; }
      if (gr !== cur) {
        box.innerHTML = '';
        spans = gr.words.map(v => M.el('span', { cls: 'cap-w' + (emph.has(v.text.toLowerCase()) ? ' cap-em' : ''),
          text: upper ? v.text.toUpperCase() : v.text, parent: box }));
        cur = gr;
      }
      const p = clamp01((T - gr.t0) / 0.16);
      box.style.opacity = 1;
      box.style.transform = `scale(${0.8 + 0.2 * M.EASE.back(p)})`;
      gr.words.forEach((v, i) => {
        const sp = spans[i], said = T >= v.t0, next = gr.words[i + 1];
        const active = said && (next ? T < next.t0 : true);
        const on = style === 'karaoke' ? said : active;
        sp.classList.toggle('cap-on', on);
        sp.style.opacity = style === 'reveal' && !said ? 0 : 1;
        const q = clamp01((T - v.t0) / 0.12);
        sp.style.transform = active ? `scale(${1.05 + 0.07 * Math.sin(Math.PI * q)})` : 'scale(1)';
      });
    } };
  };

  /* ---------- CSS di base e dei preset ---------- */
  const css = `
  :root{--bg:#050505;--fg:#f5f5f5;--accent:#2ee6d6;--accent2:#ff3b5c;--panel:#141414;
        --font:"Inter","Helvetica Neue",Arial,sans-serif;--w-title:900;--w-body:600}
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{background:#111;overflow:hidden}
  body.render{background:var(--bg)}
  #stage{position:absolute;left:0;top:0;overflow:hidden;color:var(--fg);font-family:var(--font);transform-origin:0 0;
         background:radial-gradient(120% 70% at 50% 45%, var(--panel) 0%, var(--bg) 60%)}
  #stage.alpha{background:transparent}
  #camera,#punch,#bg,#content,#fx{position:absolute;inset:0;transform-origin:50% 50%}
  #fx{pointer-events:none}
  .abs{position:absolute;left:0;top:0;will-change:transform,opacity,filter}
  .fill{position:absolute;inset:0}
  .split{display:inline-block;white-space:pre}
  .row{width:100%;text-align:center;white-space:nowrap}
  .h1{font-size:128px;font-weight:var(--w-title);line-height:1;letter-spacing:4px}
  .h2{font-size:84px;font-weight:var(--w-title);line-height:1.05}
  .h3{font-size:56px;font-weight:var(--w-title);line-height:1.1}
  .sub{font-size:34px;font-weight:var(--w-body);color:var(--accent);letter-spacing:12px}
  .txt{font-size:40px;font-weight:var(--w-body);line-height:1.3}
  .accent{color:var(--accent)}
  .dot{border-radius:50%;background:var(--fg)}
  .cursor{color:var(--accent)}
  .hline{left:100px;width:880px;height:3px;background:var(--fg)}
  .logo-box{width:100%;text-align:center}
  .logo-text{font-weight:var(--w-title);line-height:1.1;letter-spacing:4px;white-space:nowrap;width:100%;text-align:center}
  .shine-text{position:absolute;left:0;top:0;color:transparent;-webkit-background-clip:text;background-clip:text;
    background-image:linear-gradient(110deg,transparent 42%,rgba(255,255,255,.95) 50%,transparent 58%);background-size:300% 100%;opacity:0}
  .logo-img{display:inline-block}
  .shine-mask{position:absolute;left:0;top:0;width:100%;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;
    -webkit-mask-position:center;mask-position:center;-webkit-mask-size:contain;mask-size:contain;
    background-image:linear-gradient(110deg,transparent 42%,rgba(255,255,255,.9) 50%,transparent 58%);background-size:300% 100%;opacity:0}
  .lt{padding-left:30px}
  .lt-bar{position:absolute;left:0;top:0;width:10px;height:100%;background:var(--accent);transform-origin:50% 0}
  .lt-title{font-size:64px;font-weight:var(--w-title);line-height:1.1;background:var(--panel);padding:14px 26px;display:inline-block;white-space:nowrap}
  .lt-sub{font-size:36px;font-weight:var(--w-body);color:var(--accent);padding:12px 26px 0;min-height:56px;white-space:nowrap}
  .cta{width:100%;text-align:center}
  .cta-btn{display:inline-block;background:var(--accent);color:var(--bg);font-size:60px;font-weight:var(--w-title);
    padding:26px 72px;border-radius:999px;letter-spacing:4px;border:5px solid var(--accent)}
  .cta-btn.done{background:var(--panel);color:var(--fg)}
  .cta-plus{display:inline-block;width:1em}
  .cta-tap{position:absolute;left:calc(50% - 70px);top:-8px;width:140px;height:140px;border-radius:50%;border:6px solid var(--fg);opacity:0}
  .cta-handle{margin-top:34px;font-size:46px;font-weight:var(--w-body);letter-spacing:2px}
  .phone{border-radius:72px;background:#0b0b0b;border:12px solid #232323;box-shadow:0 70px 140px rgba(0,0,0,.65), 0 0 0 2px #3a3a3a;transform-origin:50% 50%}
  .phone-screen{position:absolute;inset:0;border-radius:58px;overflow:hidden;background:linear-gradient(170deg,#1b1b1b,#0d0d0d);padding:110px 34px 34px}
  .phone-notch{position:absolute;left:50%;top:22px;width:130px;height:38px;margin-left:-65px;border-radius:20px;background:#000}
  .phone-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
  .ui-hdr{height:44px;width:60%;border-radius:12px;background:#2a2a2a;margin-bottom:28px}
  .ui-hero{height:300px;border-radius:28px;background:linear-gradient(135deg,var(--accent),var(--accent2));margin-bottom:28px}
  .ui-row{display:flex;gap:18px;align-items:center;margin-bottom:22px}
  .ui-row i{width:84px;height:84px;border-radius:22px;background:#2a2a2a;flex:none}
  .ui-row b{flex:1;height:26px;border-radius:13px;background:#262626}
  .cap{text-align:center;font-weight:var(--w-title);line-height:1.12;transform-origin:50% 50%;opacity:0}
  .cap-w{display:inline-block;margin:0 .24em;color:var(--fg);transform-origin:50% 60%;
    text-shadow:0 0 2px #000,0 4px 0 rgba(0,0,0,.55),0 0 22px rgba(0,0,0,.75)}
  .cap-w.cap-on{color:var(--accent)}
  .cap-w.cap-em{color:var(--accent2)}
  #ui{position:fixed;left:0;right:0;bottom:0;padding:10px 16px;display:flex;gap:12px;align-items:center;
      background:rgba(0,0,0,.8);color:#ddd;font:13px/1 system-ui,sans-serif;z-index:9}
  #ui input[type=range]{flex:1}
  #ui button{background:#222;color:#eee;border:1px solid #444;padding:6px 10px;border-radius:6px}
  body.render #ui{display:none}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  M.applyBrand();

  /* ---------- Avvio ---------- */
  M.boot = () => {
    const META = M.META, q = new URLSearchParams(location.search), stage = M.$('#stage');
    stage.style.width = META.width + 'px'; stage.style.height = META.height + 'px';
    if (q.has('alpha')) { stage.classList.add('alpha'); document.documentElement.style.background = 'transparent'; document.body.style.background = 'transparent'; }
    M.compile();
    window.__meta = META;
    window.__cues = M.CUES.filter(c => c.t > -2 && c.t < META.duration + 0.01).sort((a, b) => a.t - b.t);
    window.__seek = (t, tf) => { M.seek(t, tf ?? t); return true; };
    window.__ready = Promise.all([document.fonts.ready, ...[...document.images].map(i => i.decode().catch(() => {}))]);
    if (q.has('render')) { document.body.classList.add('render'); M.seek(0); return; }

    // Anteprima nel browser: Spazio = play/pausa, frecce = ±1 fotogramma.
    const ui = document.createElement('div'); ui.id = 'ui';
    ui.innerHTML = '<button id="play">❚❚</button><input id="scrub" type="range" min="0" step="0.001"><span id="time"></span><span>Black Den Motion · by Den</span>';
    document.body.appendChild(ui);
    const fit = () => { const k = Math.min(innerWidth / META.width, (innerHeight - 50) / META.height);
      stage.style.transform = `scale(${k})`; stage.style.left = (innerWidth - META.width * k) / 2 + 'px'; stage.style.top = '4px'; };
    fit(); addEventListener('resize', fit);
    const scrub = M.$('#scrub'), time = M.$('#time'), btn = M.$('#play');
    scrub.max = META.duration;
    let playing = true, t = 0, last = performance.now();
    const show = () => { M.seek(t); scrub.value = t; time.textContent = t.toFixed(2) + ' s · f' + Math.round(t * META.fps); };
    const loop = now => { if (playing) { t += (now - last) / 1000; if (t > META.duration) t = 0; show(); } last = now; requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    btn.onclick = () => { playing = !playing; btn.textContent = playing ? '❚❚' : '▶'; };
    scrub.oninput = () => { playing = false; btn.textContent = '▶'; t = +scrub.value; show(); };
    addEventListener('keydown', e => {
      if (e.code === 'Space') { e.preventDefault(); btn.onclick(); }
      if (e.code === 'ArrowRight') { playing = false; t = Math.min(META.duration, t + 1 / META.fps); show(); }
      if (e.code === 'ArrowLeft') { playing = false; t = Math.max(0, t - 1 / META.fps); show(); }
    });
  };
})();

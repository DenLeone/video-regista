import React, { useEffect, useMemo, useState } from 'react';
import { AbsoluteFill, Audio, continueRender, delayRender, Easing, Img, OffthreadVideo, random, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';

// Collage: motion graphic a ritagli di carta (stile Vox) descritta tutta in un file, scena.json.
// Ogni progetto è una cartella (work/collage/<nome>, vedi pc/collage.mjs): scena.json + immagini, font,
// video base. Il video si cambia cambiando i file della cartella o i numeri del json, non questo codice.
// Un file che manca esce come segnaposto rosa col suo nome: si vede subito cosa va messo.
// Unità: x, y = centro dell'elemento in % del canvas (x della larghezza, y dell'altezza); w in % della
// larghezza, h in % dell'altezza; tempi in secondi dall'inizio della scena; i valori in px (sfocatura,
// spessori, raggi) sono riferiti a un canvas largo 1080 e scalano col render (4K = ×2).

type Curva = 'lineare' | 'in' | 'out' | 'inout' | 'outCubic' | 'back' | 'elastico';

export type Anim = {
  tipo: 'entra' | 'sposta' | 'scala' | 'opacita' | 'sfoca' | 'rivela' | 'velocita' | 'ruota' | 'oscilla' | 'traccia';
  da: number;
  dur?: number;
  curva?: Curva;
  passi?: number;                            // avanzamento a scatti (es. 4 step)
  daX?: number; daY?: number;                // entra: posizione di partenza assoluta…
  dx?: number; dy?: number;                  // …o scarto dalla posizione finale
  x?: number; y?: number;                    // sposta: arrivo
  s0?: number; s1?: number;                  // scala
  o0?: number; o1?: number;                  // opacita
  r0?: number; r1?: number;                  // sfoca (px a 1080)
  verso?: 'dx' | 'sx' | 'giu' | 'su';        // rivela: dx = da sinistra verso destra
  vx?: number; vy?: number; fino?: number;   // velocita: %/s, si ferma a `fino`
  gradi?: number; vel?: number;              // ruota: gradi in `dur`, oppure °/s continui
  asse?: 'x' | 'y' | 'rot'; ampiezza?: number; freq?: number; // oscilla (Hz)
};

export type Livello = {
  tipo: 'img' | 'testo' | 'rett' | 'strappo' | 'ingranaggio' | 'anello' | 'prompt' | 'contatore' | 'barra';
  id?: string;
  nota?: string;
  x?: number; y?: number; w?: number; h?: number;
  rot?: number; scala?: number;
  ancora?: 'centro' | 'sx';
  perno?: [number, number];   // centro di rotazione/scala in % dell'elemento
  dal?: number; al?: number;  // visibile da / fino a
  fps?: number;               // tempo a scatti (animazione a ritagli, es. 8)
  opacita?: number;
  filtro?: string;            // filtro CSS in più (es. "grayscale(1) brightness(0.4)")
  fisso?: boolean;            // fuori dalla camera della scena (interfaccia)
  file?: string;              // img: con {n} è uno sprite (gabbiano-{n}.png → 1..fotogrammi)
  fotogrammi?: number;
  fpsSprite?: number;
  ar?: number;                // rapporto w/h del segnaposto quando il file manca
  colore?: string;
  tondo?: boolean;            // rett: cerchio (h = w)
  raggio?: number;            // rett: angoli (px a 1080); ingranaggio/anello: raggio in % della larghezza
  testo?: string;
  font?: string;              // chiave di `font` nel json
  size?: number;              // corpo in % della larghezza; senza, il testo riempie `w`
  interlinea?: number;
  alto?: [number, number];    // strappo: y del bordo alto a sinistra e a destra
  basso?: [number, number];
  bordo?: number;             // strappo: bordo bianco in % della larghezza
  cielo?: boolean;            // strappo: cielo azzurro con nuvole quando non c'è `file`
  denti?: number;
  spessore?: number;          // anello, barra (px a 1080)
  orario?: boolean;           // anello: verso del tratto (default antiorario)
  frasi?: { t: number; testo: string; cps?: number }[];   // prompt
  inizio?: number; fine?: number; t0?: number; t1?: number; // contatore, barra
  formato?: string;           // contatore: "{n} views"
  lingua?: string;            // contatore: separatori dei numeri (default en-US)
  icona?: 'pollice';
  fondo?: string;             // barra
  copie?: { x?: number; y?: number; ritardo?: number; scala?: number }[];
  anim?: Anim[];
};

export type Scena = {
  id?: string;
  nota?: string;
  da: number;
  a: number;
  zona?: [number, number, number, number]; // x0, y0, x1, y1 in %: finestra (split screen)
  raggio?: number;
  zone?: { t: number; zona: [number, number, number, number]; raggio?: number }[]; // cambi di finestra
  fondo?: string;
  entrata?: { tipo: 'frusta'; verso: 'sx' | 'dx' | 'su' | 'giu'; dur: number };
  camera?: { t: number; scala: number; cx: number; cy: number; curva?: Curva }[];
  sfoca?: { da: number; dur: number; r: number; fino: string; togli?: number }; // sfoca i livelli prima di `fino`
  livelli: Livello[];
};

export type PropsCollage = {
  cartella: string;          // dentro public/ (pc/collage.mjs la collega)
  presenti?: string[];       // file che ci sono davvero (gli altri diventano segnaposto)
  durata?: number;
  fps?: number;
  font?: Record<string, string>;
  base?: { video: string; volume?: number };
  musica?: { file: string; volume?: number };
  scene: Scena[];
};

export const durataCollage = (p: PropsCollage) => p.durata ?? Math.max(1, ...p.scene.map((s) => s.a));

const CURVE: Record<Curva, (t: number) => number> = {
  lineare: Easing.linear,
  in: Easing.in(Easing.quad),
  out: Easing.out(Easing.quad),
  inout: Easing.inOut(Easing.cubic),
  outCubic: Easing.out(Easing.cubic),
  back: Easing.out(Easing.back(1.7)),
  elastico: Easing.out(Easing.elastic(1.2)),
};
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

function avanzamento(t: number, a: Pick<Anim, 'da' | 'dur' | 'passi' | 'curva'>) {
  const dur = a.dur ?? 0;
  let p = dur > 0 ? clamp((t - a.da) / dur) : t >= a.da ? 1 : 0;
  if (a.passi) p = Math.floor(p * a.passi) / a.passi;
  return CURVE[a.curva ?? 'out'](p);
}

// posizione, scala, rotazione… del livello al tempo t, sommando tutte le animazioni
function stato(l: Livello, t: number) {
  let dx = 0, dy = 0, s = 1, rot = 0, o = 1, blur = 0, traccia = 1;
  let clip: string | undefined;
  const x = l.x ?? 50, y = l.y ?? 50;
  for (const a of l.anim ?? []) {
    const p = avanzamento(t, a);
    switch (a.tipo) {
      case 'entra':
        dx += (a.daX !== undefined ? a.daX - x : a.dx ?? 0) * (1 - p);
        dy += (a.daY !== undefined ? a.daY - y : a.dy ?? 0) * (1 - p);
        break;
      case 'sposta':
        dx += ((a.x ?? x) - x) * p;
        dy += ((a.y ?? y) - y) * p;
        break;
      case 'scala': s *= lerp(a.s0 ?? 0, a.s1 ?? 1, p); break;
      case 'opacita': o *= lerp(a.o0 ?? 0, a.o1 ?? 1, p); break;
      case 'sfoca': blur += lerp(a.r0 ?? 0, a.r1 ?? 10, p); break;
      case 'traccia': traccia = p; break;
      case 'rivela': {
        const r = (1 - p) * 100;
        clip = { dx: `inset(0 ${r}% 0 0)`, sx: `inset(0 0 0 ${r}%)`, giu: `inset(0 0 ${r}% 0)`, su: `inset(${r}% 0 0 0)` }[a.verso ?? 'dx'];
        break;
      }
      case 'velocita': {
        const e = Math.max(0, Math.min(t, a.fino ?? Infinity) - a.da);
        dx += (a.vx ?? 0) * e;
        dy += (a.vy ?? 0) * e;
        break;
      }
      case 'ruota': rot += a.vel !== undefined ? a.vel * Math.max(0, t - a.da) : (a.gradi ?? 0) * p; break;
      case 'oscilla': {
        if (t < a.da) break;
        const v = (a.ampiezza ?? 5) * Math.sin(2 * Math.PI * (a.freq ?? 1) * (t - a.da));
        if (a.asse === 'x') dx += v; else if (a.asse === 'rot') rot += v; else dy += v;
        break;
      }
    }
  }
  return { dx, dy, s, rot, o, blur, clip, traccia };
}

type Ctx = { W: number; H: number; u: number; file: (f: string) => string; esiste: (f: string) => boolean };

const Segnaposto: React.FC<{ nome: string; altezza: number; u: number }> = ({ nome, altezza, u }) => (
  <div style={{
    width: '100%', height: altezza, boxSizing: 'border-box', border: `${3 * u}px dashed #ff2fb3`,
    background: 'rgba(255,47,179,0.14)', color: '#ff2fb3', font: `700 ${20 * u}px monospace`,
    display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 8 * u, wordBreak: 'break-all',
  }}>{nome}</div>
);

// bordo strappato: una linea da sinistra a destra con piccoli denti casuali (sempre uguali: seme fisso)
function bordoStrappato(y0: number, y1: number, seme: string, sporgi: number) {
  const punti: [number, number][] = [];
  for (let i = 0, x = -2; x <= 102; i++, x += 1.6) {
    punti.push([x, lerp(y0, y1, (x + 2) / 104) + sporgi + (random(`${seme}-${i}`) - 0.5) * 1.1]);
  }
  return punti;
}
const poligono = (alto: [number, number][], basso: [number, number][]) =>
  `polygon(${[...alto, ...[...basso].reverse()].map(([x, y]) => `${x}% ${y}%`).join(', ')})`;

const CIELO = [
  'radial-gradient(ellipse 16% 5% at 18% 38%, rgba(255,255,255,0.95), transparent 70%)',
  'radial-gradient(ellipse 12% 4% at 26% 42%, rgba(255,255,255,0.9), transparent 70%)',
  'radial-gradient(ellipse 20% 6% at 70% 36%, rgba(255,255,255,0.92), transparent 70%)',
  'radial-gradient(ellipse 14% 4% at 84% 46%, rgba(255,255,255,0.85), transparent 70%)',
  'linear-gradient(180deg, #5aa8e8 0%, #a9d6f7 100%)',
].join(', ');

const Strappo: React.FC<{ l: Livello; c: Ctx; seme: string }> = ({ l, c, seme }) => {
  const alto = l.alto ?? [40, 40], basso = l.basso ?? [60, 60];
  const b = ((l.bordo ?? 1.5) * c.W) / c.H;
  const riempi = l.file && c.esiste(l.file)
    ? { backgroundImage: `url("${c.file(l.file)}")`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : l.cielo ? { background: CIELO } : { background: l.colore ?? '#fff' };
  return (
    <AbsoluteFill style={{ filter: `drop-shadow(0 ${4 * c.u}px ${8 * c.u}px rgba(0,0,0,0.35))` }}>
      {b > 0 && <AbsoluteFill style={{
        background: '#f7f4ee',
        clipPath: poligono(bordoStrappato(alto[0], alto[1], `${seme}-ab`, -b), bordoStrappato(basso[0], basso[1], `${seme}-bb`, b)),
      }} />}
      <AbsoluteFill style={{ ...riempi, clipPath: poligono(bordoStrappato(alto[0], alto[1], `${seme}-a`, 0), bordoStrappato(basso[0], basso[1], `${seme}-b`, 0)) }} />
    </AbsoluteFill>
  );
};

const Ingranaggio: React.FC<{ l: Livello }> = ({ l }) => {
  const n = l.denti ?? 12, passo = (2 * Math.PI) / n;
  const pt = (r: number, a: number) => `${(r * Math.cos(a)).toFixed(4)} ${(r * Math.sin(a)).toFixed(4)}`;
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = i * passo;
    d += `${i ? 'L' : 'M'}${pt(0.8, a)} L${pt(1, a + 0.12 * passo)} L${pt(1, a + 0.38 * passo)} L${pt(0.8, a + 0.5 * passo)} `;
  }
  d += 'Z M0.28 0 A0.28 0.28 0 1 0 -0.28 0 A0.28 0.28 0 1 0 0.28 0 Z';
  return (
    <svg viewBox="-1 -1 2 2" style={{ width: '100%', height: '100%', display: 'block' }}>
      <path d={d} fill={l.colore ?? '#777'} fillRule="evenodd" stroke="rgba(0,0,0,0.35)" strokeWidth={0.02} />
    </svg>
  );
};

// cerchio disegnato a mano: un giro e poco più, che si stringe appena alla fine
// (spessore in unità del viewBox: con vector-effect non-scaling-stroke Chrome sbaglia pathLength e il
// tratto si ferma a tre quarti)
const Anello: React.FC<{ l: Livello; traccia: number; u: number; larghezza: number }> = ({ l, traccia, u, larghezza }) => {
  const punti = Array.from({ length: 121 }, (_, k) => {
    const a = -Math.PI / 2 + (k / 120) * 2 * Math.PI * 1.08;
    const r = 46 * (1 - 0.06 * (k / 120));
    return `${(50 + r * Math.cos(a)).toFixed(2)} ${(50 + r * Math.sin(a)).toFixed(2)}`;
  });
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block', overflow: 'visible', transform: l.orario ? undefined : 'scaleX(-1)' }}>
      <path d={`M${punti.join(' L')}`} fill="none" stroke={l.colore ?? '#E0B12A'} strokeWidth={((l.spessore ?? 9) * u * 100) / larghezza}
        strokeLinecap="round" strokeLinejoin="round"
        pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - traccia} />
    </svg>
  );
};

// barra del prompt: la frase precedente si cancella (60 caratteri/s), poi si batte la nuova
function digitato(frasi: NonNullable<Livello['frasi']>, t: number) {
  let i = -1;
  frasi.forEach((f, k) => { if (t >= f.t) i = k; });
  if (i < 0) return '';
  const prima = i > 0 ? frasi[i - 1].testo : '';
  const e = t - frasi[i].t, cancella = prima.length / 60;
  if (e < cancella) return prima.slice(0, prima.length - Math.floor(e * 60));
  return frasi[i].testo.slice(0, Math.floor((e - cancella) * (frasi[i].cps ?? 20)));
}

const Prompt: React.FC<{ l: Livello; t: number; c: Ctx; altezza: number }> = ({ l, t, c, altezza }) => {
  const testo = digitato(l.frasi ?? [], t);
  const cursore = Math.floor(t * 2) % 2 === 0;
  return (
    <div style={{
      width: '100%', height: altezza, background: l.colore ?? '#fff', borderRadius: altezza * 0.28, boxSizing: 'border-box',
      display: 'flex', alignItems: 'center', padding: `0 ${altezza * 0.5}px`, gap: altezza * 0.2,
      boxShadow: `0 ${6 * c.u}px ${24 * c.u}px rgba(0,0,0,0.35)`,
      font: `500 ${altezza * 0.4}px Inter, "Helvetica Neue", Arial, sans-serif`, color: '#1d1d1f',
    }}>
      <span style={{ flex: 1, whiteSpace: 'pre', overflow: 'hidden' }}>
        {testo}<span style={{ display: 'inline-block', width: 3 * c.u, height: altezza * 0.46, background: '#1d1d1f', verticalAlign: 'middle', marginLeft: 2 * c.u, opacity: cursore ? 1 : 0 }} />
      </span>
      <svg viewBox="0 0 24 24" style={{ width: altezza * 0.62, height: altezza * 0.62, flex: 'none' }}>
        <circle cx="12" cy="12" r="12" fill="#1d1d1f" />
        <path d="M12 17V7M7.5 11.5 12 7l4.5 4.5" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
};

const Pollice: React.FC<{ size: number; colore: string }> = ({ size, colore }) => (
  <svg viewBox="0 0 24 24" style={{ width: size, height: size, flex: 'none' }}>
    <path fill={colore} d="M2 10h4v11H2zM8 21h9.2a2 2 0 0 0 1.95-1.56l1.6-7A2 2 0 0 0 18.8 10H14l.8-4.2A2 2 0 0 0 12.9 3.4L8 10z" />
  </svg>
);

function famiglia(l: Livello) {
  return l.font ? `"collage-${l.font}", Georgia, serif` : 'Georgia, serif';
}

// il testo riempie la larghezza `w`: si misura la riga più lunga a corpo 100
const Testo: React.FC<{ l: Livello; c: Ctx; larghezza: number }> = ({ l, c, larghezza }) => {
  const fam = famiglia(l);
  const testo = l.testo ?? '';
  const corpo = useMemo(() => {
    if (l.size) return (l.size * c.W) / 100;
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) return 100;
    ctx.font = `100px ${fam}`;
    const largo = Math.max(1, ...testo.split('\n').map((r) => ctx.measureText(r).width));
    return (larghezza / largo) * 100;
  }, [l.size, c.W, fam, testo, larghezza]);
  return (
    <div style={{ fontFamily: fam, fontSize: corpo, lineHeight: l.interlinea ?? 1, color: l.colore ?? '#fff', whiteSpace: 'pre', textAlign: 'center' }}>
      {testo}
    </div>
  );
};

const Elemento: React.FC<{ l: Livello; t: number; c: Ctx; seme: string }> = ({ l, t, c, seme }) => {
  if ((l.dal !== undefined && t < l.dal) || (l.al !== undefined && t >= l.al)) return null;
  const tl = l.fps ? Math.floor(t * l.fps) / l.fps : t;
  const st = stato(l, tl);
  const pieno = l.tipo === 'strappo';
  const tondo = l.tipo === 'ingranaggio' || l.tipo === 'anello' && l.raggio !== undefined || l.tondo;
  const wPct = pieno ? 100 : l.raggio !== undefined && l.tipo !== 'rett' ? l.raggio * 2 : l.w ?? (l.tipo === 'rett' ? 100 : 30);
  const larghezza = (wPct * c.W) / 100;
  let altezza: number | undefined = pieno ? c.H : tondo ? larghezza : l.h !== undefined ? (l.h * c.H) / 100 : l.tipo === 'rett' ? c.H : undefined;
  if (l.tipo === 'barra') altezza = (l.spessore ?? 10) * c.u;
  if (l.tipo === 'prompt') altezza = altezza ?? 0.06 * c.H;
  const x = pieno ? 50 : l.x ?? 50, y = pieno ? 50 : l.y ?? 50;

  let dentro: React.ReactNode = null;
  switch (l.tipo) {
    case 'img': {
      const nome = l.file && l.fotogrammi
        ? l.file.replace('{n}', String((Math.floor(tl * (l.fpsSprite ?? 8)) % l.fotogrammi) + 1))
        : l.file ?? '';
      dentro = nome && c.esiste(nome)
        ? <Img src={c.file(nome)} style={{ width: '100%', height: altezza ?? 'auto', objectFit: 'contain', display: 'block' }} />
        : <Segnaposto nome={nome || '(file?)'} altezza={altezza ?? larghezza / (l.ar ?? 1.5)} u={c.u} />;
      break;
    }
    case 'rett': {
      const img = l.file && c.esiste(l.file) ? { backgroundImage: `url("${c.file(l.file)}")`, backgroundSize: 'cover', backgroundPosition: 'center' } : {};
      dentro = <div style={{ width: '100%', height: '100%', background: l.colore ?? '#000', ...img, borderRadius: tondo ? '50%' : (l.raggio ?? 0) * c.u }} />;
      break;
    }
    case 'testo': dentro = <Testo l={l} c={c} larghezza={larghezza} />; break;
    case 'strappo': dentro = <Strappo l={l} c={c} seme={seme} />; break;
    case 'ingranaggio': dentro = <Ingranaggio l={l} />; break;
    case 'anello': dentro = <Anello l={l} traccia={st.traccia} u={c.u} larghezza={larghezza} />; break;
    case 'prompt': dentro = <Prompt l={l} t={t} c={c} altezza={altezza!} />; break;
    case 'contatore': {
      const p = clamp((tl - (l.t0 ?? 0)) / Math.max(0.001, (l.t1 ?? 1) - (l.t0 ?? 0)));
      // decimali solo se il numero li ha (un voto 8,5); lingua per il separatore (238,426 / 8,5)
      const decimali = Number.isInteger(l.inizio ?? 0) && Number.isInteger(l.fine ?? 0) ? 0 : 1;
      const n = lerp(l.inizio ?? 0, l.fine ?? 0, p).toLocaleString(l.lingua ?? 'en-US', { minimumFractionDigits: decimali, maximumFractionDigits: decimali });
      const corpo = ((l.size ?? 6) * c.W) / 100;
      dentro = (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: l.ancora === 'sx' ? 'flex-start' : 'center', gap: corpo * 0.3, whiteSpace: 'nowrap',
          font: `700 ${corpo}px Inter, "Helvetica Neue", Arial, sans-serif`, color: l.colore ?? '#fff', textShadow: `0 ${2 * c.u}px ${6 * c.u}px rgba(0,0,0,0.4)` }}>
          {l.icona === 'pollice' && <Pollice size={corpo} colore={l.colore ?? '#fff'} />}
          {(l.formato ?? '{n}').replace('{n}', n)}
        </div>
      );
      break;
    }
    case 'barra': {
      const p = clamp((tl - (l.t0 ?? 0)) / Math.max(0.001, (l.t1 ?? 1) - (l.t0 ?? 0)));
      dentro = (
        <div style={{ width: '100%', height: '100%', background: l.fondo ?? 'rgba(255,255,255,0.35)', borderRadius: altezza! / 2, overflow: 'hidden' }}>
          <div style={{ width: `${lerp(l.inizio ?? 0, l.fine ?? 100, p)}%`, height: '100%', background: l.colore ?? '#2BA640' }} />
        </div>
      );
      break;
    }
  }

  const filtri = [st.blur > 0 ? `blur(${st.blur * c.u}px)` : '', l.filtro ?? ''].filter(Boolean).join(' ');
  return (
    <div style={{
      position: 'absolute', left: `${x + st.dx}%`, top: `${y + st.dy}%`, width: larghezza, height: altezza,
      transform: `translate(${l.ancora === 'sx' ? 0 : -50}%, -50%) rotate(${(l.rot ?? 0) + st.rot}deg) scale(${(l.scala ?? 1) * st.s})`,
      transformOrigin: l.perno ? `${l.perno[0]}% ${l.perno[1]}%` : 'center',
      opacity: (l.opacita ?? 1) * st.o, filter: filtri || undefined, clipPath: st.clip,
    }}>{dentro}</div>
  );
};

// le copie (5 gabbiani, 7 operai…) sono lo stesso livello in un altro punto, con un ritardo
function espandi(livelli: Livello[]) {
  return livelli.flatMap((l) => !l.copie ? [l] : l.copie.map((k) => ({
    ...l, copie: undefined, x: k.x ?? l.x, y: k.y ?? l.y, scala: (l.scala ?? 1) * (k.scala ?? 1),
    dal: l.dal !== undefined ? l.dal + (k.ritardo ?? 0) : l.dal,
    anim: l.anim?.map((a) => ({ ...a, da: a.da + (k.ritardo ?? 0) })),
  })));
}

function camera(keys: Scena['camera'], t: number) {
  if (!keys?.length) return null;
  if (t <= keys[0].t) return keys[0];
  const dopo = keys.findIndex((k) => k.t > t);
  if (dopo < 0) return keys[keys.length - 1];
  const a = keys[dopo - 1], b = keys[dopo];
  const p = CURVE[b.curva ?? 'inout'](clamp((t - a.t) / (b.t - a.t)));
  return { t, scala: lerp(a.scala, b.scala, p), cx: lerp(a.cx, b.cx, p), cy: lerp(a.cy, b.cy, p) };
}

const VERSI = { sx: [1, 0], dx: [-1, 0], su: [0, 1], giu: [0, -1] } as const;

const VistaScena: React.FC<{ s: Scena; i: number; t: number; c: Ctx; scarto: [number, number]; mosso: number }> = ({ s, i, t, c, scarto, mosso }) => {
  let zona = s.zona ?? [0, 0, 100, 100];
  let raggio = s.raggio ?? 0;
  for (const z of s.zone ?? []) if (t >= z.t) { zona = z.zona; raggio = z.raggio ?? raggio; }
  const [x0, y0, x1, y1] = zona;
  const cam = camera(s.camera, t);
  const zx = ((x0 + x1) / 2) * c.W / 100, zy = ((y0 + y1) / 2) * c.H / 100;
  const trasforma = cam
    ? `translate(${zx - cam.scala * cam.cx * c.W / 100}px, ${zy - cam.scala * cam.cy * c.H / 100}px) scale(${cam.scala})`
    : undefined;

  const livelli = espandi(s.livelli);
  const taglio = s.sfoca ? livelli.findIndex((l) => l.id === s.sfoca!.fino) : -1;
  let sfoca = 0;
  if (s.sfoca && taglio >= 0) {
    sfoca = s.sfoca.r * avanzamento(t, { da: s.sfoca.da, dur: s.sfoca.dur });
    if (s.sfoca.togli !== undefined) sfoca *= 1 - clamp((t - s.sfoca.togli) / 0.2);
  }
  const vista = (l: Livello, k: number) => <Elemento key={k} l={l} t={t} c={c} seme={`${s.id ?? i}-${k}`} />;
  const sotto = livelli.map((l, k) => (taglio >= 0 && k < taglio && !l.fisso ? vista(l, k) : null));
  const sopra = livelli.map((l, k) => ((taglio < 0 || k >= taglio) && !l.fisso ? vista(l, k) : null));
  const fissi = livelli.map((l, k) => (l.fisso ? vista(l, k) : null));
  const idMosso = `frusta-${i}`;

  return (
    <AbsoluteFill style={{
      clipPath: `inset(${y0}% ${100 - x1}% ${100 - y1}% ${x0}% round ${raggio * c.u}px)`,
      transform: `translate(${scarto[0]}%, ${scarto[1]}%)`,
      filter: mosso > 0 ? `url(#${idMosso})` : undefined,
    }}>
      {mosso > 0 && (
        <svg width={0} height={0} style={{ position: 'absolute' }}>
          <filter id={idMosso} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation={scarto[1] === 0 ? `${mosso} 0` : `0 ${mosso}`} />
          </filter>
        </svg>
      )}
      {s.fondo && <AbsoluteFill style={{ background: s.fondo }} />}
      <AbsoluteFill style={{ transformOrigin: '0 0', transform: trasforma }}>
        {taglio >= 0 && <AbsoluteFill style={{ filter: sfoca > 0 ? `blur(${sfoca * c.u}px)` : undefined }}>{sotto}</AbsoluteFill>}
        {sopra}
      </AbsoluteFill>
      {fissi}
    </AbsoluteFill>
  );
};

export const Collage: React.FC<PropsCollage> = (p) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const T = frame / fps;
  const c: Ctx = useMemo(() => ({
    W: width, H: height, u: width / 1080,
    file: (f: string) => staticFile(`${p.cartella}/${f}`),
    esiste: (f: string) => !p.presenti || p.presenti.includes(f),
  }), [width, height, p.cartella, p.presenti]);

  // i font della cartella vanno caricati prima di misurare i testi
  const [attesa] = useState(() => delayRender('font del collage'));
  const [pronti, setPronti] = useState(false);
  useEffect(() => {
    Promise.all(Object.entries(p.font ?? {}).filter(([, f]) => c.esiste(f)).map(([k, f]) =>
      new FontFace(`collage-${k}`, `url("${c.file(f)}")`).load().then((ff) => { document.fonts.add(ff); }).catch(() => undefined)))
      .then(() => { setPronti(true); continueRender(attesa); });
  }, [attesa, c, p.font]);
  if (!pronti) return null;

  return (
    <AbsoluteFill style={{ background: '#000' }}>
      {p.base && c.esiste(p.base.video) && (
        <OffthreadVideo src={c.file(p.base.video)} volume={p.base.volume ?? 1} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      )}
      {p.musica && c.esiste(p.musica.file) && <Audio src={c.file(p.musica.file)} volume={p.musica.volume ?? 0.15} loop />}
      {p.scene.map((s, i) => {
        // whip-pan: la scena dopo entra dal lato opposto e questa esce trascinata, mossa
        const dopo = p.scene[i + 1];
        const esce = dopo?.entrata?.tipo === 'frusta' && Math.abs(dopo.da - s.a) < 0.05 ? dopo.entrata : null;
        if (T < s.da || T >= s.a + (esce ? esce.dur : 0)) return null;
        let scarto: [number, number] = [0, 0], mosso = 0;
        const entra = s.entrata?.tipo === 'frusta' && T - s.da < s.entrata.dur ? s.entrata : null;
        if (entra) {
          const q = CURVE.inout((T - s.da) / entra.dur), [vx, vy] = VERSI[entra.verso];
          scarto = [vx * (1 - q) * 100, vy * (1 - q) * 100];
          mosso = Math.sin(Math.PI * q) * 50 * c.u;
        } else if (esce && T >= s.a) {
          const q = CURVE.inout((T - s.a) / esce.dur), [vx, vy] = VERSI[esce.verso];
          scarto = [-vx * q * 100, -vy * q * 100];
          mosso = Math.sin(Math.PI * q) * 50 * c.u;
        }
        return <VistaScena key={i} s={s} i={i} t={T - s.da} c={c} scarto={scarto} mosso={mosso} />;
      })}
    </AbsoluteFill>
  );
};

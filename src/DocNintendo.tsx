import React from 'react';
import { AbsoluteFill, Audio, Easing, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { loadFont as caricaCormorant } from '@remotion/google-fonts/CormorantGaramond';
import { loadFont as caricaCourier } from '@remotion/google-fonts/CourierPrime';

// Documentario "Nintendo" (prova): un solo piano sequenza su un rotolo di carta (kakemono) srotolato
// su un tavolo scuro. La camera lo percorre dall'alto (1889) verso il basso (oggi); niente tagli.
// Tutto è in coordinate del "mondo": il rotolo va da x -1000 a 1000 e da y 0 a ~21800.
// I tempi sono quelli delle parole di vo.wav (parole.json): ogni elemento cade sulla sua parola.
// Il materiale sta in public/collage/doc-nintendo (non va su git: foto con diritti).

const DIR = 'collage/doc-nintendo/';
const f = (n: string) => staticFile(DIR + n);
export const DURATA_DOC = 59.2;

const { fontFamily: SERIF } = caricaCormorant('normal', { weights: ['500', '700'], subsets: ['latin'] });
const { fontFamily: MACCHINA } = caricaCourier('normal', { weights: ['400', '700'], subsets: ['latin'] });
const MINCHO = 'DocMincho';
const PENNELLO = 'DocPennello';
const FONT_LOCALI = `
@font-face{font-family:${MINCHO};src:url(${f('mincho500.woff2')});font-weight:500;font-display:block}
@font-face{font-family:${MINCHO};src:url(${f('mincho800.woff2')});font-weight:800;font-display:block}
@font-face{font-family:${PENNELLO};src:url(${f('pennello.woff2')});font-display:block}`;

const INCHIOSTRO = '#1d1712';
const ROSSO = '#b3291f';
const CARTA = '#efe6d2';

// ---------------------------------------------------------------- tempo e curve
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const outCubic = (p: number) => 1 - Math.pow(1 - clamp01(p), 3);
const inOut = (p: number) => { p = clamp01(p); return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; };
const prog = (t: number, da: number, dur: number) => clamp01((t - da) / dur);

// ---------------------------------------------------------------- camera
// chiavi: [tempo, x, y, zoom]. Interpolazione cubica monotona (Fritsch–Carlson): passa per ogni chiave
// senza rimbalzi e senza fermarsi del tutto, così la camera "scivola" invece di andare a scatti.
type Chiave = [number, number, number, number];
// per ogni beat due chiavi: arrivo sul gruppo (centrato) e uscita poco dopo con una lenta spinta in avanti,
// così la camera "atterra" sul protagonista invece di passarci sopra
const CAMERA: Chiave[] = [
  [0.0, 0, 25660, 1.5],
  [3.4, 0, 25600, 1.39],
  [3.7, 0, 25400, 1.1],
  [4.6, 0, 20000, 0.3],
  [5.4, 0, 4000, 0.3],
  [6.1, 0, 1150, 1.3],
  [8.2, 0, 1300, 1.32],
  [8.7, 0, 1950, 1.3],
  [10.6, 0, 2150, 1.34],
  [11.6, 0, 3450, 1.32],
  [12.0, 0, 3490, 1.34],
  [12.4, 0, 4720, 1.32],
  [13.4, 0, 4870, 1.34],
  [13.8, 0, 6150, 1.3],
  [15.1, 0, 6250, 1.33],
  [15.6, 0, 7550, 1.3],
  [17.4, 0, 7700, 1.33],
  [19.4, 0, 8600, 0.8],
  [20.7, 0, 9400, 1.32],
  [22.9, 0, 9800, 1.3],
  [23.6, 0, 11300, 1.32],
  [26.4, 0, 11600, 1.3],
  [27.4, 0, 13000, 1.5],
  [29.0, 0, 13100, 1.48],
  [29.5, 0, 13700, 1.5],
  [30.7, 0, 13750, 1.48],
  [31.1, 0, 14400, 1.5],
  [31.8, 0, 13700, 0.98],
  [33.2, 0, 13720, 1.02],
  [34.7, 0, 15700, 1.3],
  [37.5, 0, 16050, 1.33],
  [37.9, 0, 17400, 1.3],
  [40.5, 0, 17480, 1.33],
  [41.0, 0, 18800, 1.32],
  [43.2, 0, 19150, 1.3],
  [43.7, 0, 20200, 1.35],
  [45.9, 0, 20350, 1.38],
  [47.3, 0, 21000, 0.9],
  [49.0, 0, 21800, 1.32],
  [51.2, 0, 21950, 1.33],
  [51.6, 0, 23700, 1.3],
  [52.15, 0, 23800, 1.4],
  [52.6, -122, 23960, 2.4],
  [52.95, -122, 23960, 2.5],
  [53.9, 0, 18000, 0.24],
  [55.4, 0, 13200, 0.15],
  [59.2, 0, 13100, 0.142],
];

function monotona(xs: number[], ys: number[]) {
  const n = xs.length;
  const d = xs.slice(0, -1).map((x, i) => (ys[i + 1] - ys[i]) / (xs[i + 1] - x));
  const m = xs.map((_, i) => (i === 0 ? 0 : i === n - 1 ? 0 : d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2));
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); m[i] = k * a * d[i]; m[i + 1] = k * b * d[i]; }
  }
  return (x: number) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h;
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}
const tempi = CAMERA.map((c) => c[0]);
const camX = monotona(tempi, CAMERA.map((c) => c[1]));
const camY = monotona(tempi, CAMERA.map((c) => c[2]));
const camZ = monotona(tempi, CAMERA.map((c) => Math.log(c[3])));

// colpi dei timbri: la camera sobbalza un attimo
const COLPI = [9.9, 16.3, 24.5, 32.75, 45.2];
function camera(t: number) {
  let x = camX(t), y = camY(t);
  const z = Math.exp(camZ(t));
  // camera a mano: somma di sinusoidi lente, in px di schermo
  const a = 5 / z;
  x += a * (Math.sin(t * 0.83) + 0.6 * Math.sin(t * 1.91 + 1.3));
  y += a * (Math.sin(t * 0.71 + 2.1) + 0.6 * Math.sin(t * 1.57 + 0.4));
  let rot = 0.18 * Math.sin(t * 0.37) + 0.08 * Math.sin(t * 1.13 + 0.7);
  for (const c of COLPI) {
    const k = t - c;
    if (k > 0 && k < 0.35) { const e = Math.exp(-k * 14) * Math.sin(k * 70); y += (14 / z) * e; rot += 0.25 * e; }
  }
  return { x, y, z, rot };
}

// ---------------------------------------------------------------- mattoni
type Pos = { x: number; y: number; rot?: number };
const centro = (p: Pos, extra = ''): React.CSSProperties => ({
  position: 'absolute', left: p.x, top: p.y, transform: `translate(-50%,-50%) rotate(${p.rot ?? 0}deg) ${extra}`,
});

// un oggetto che "cade" sulla carta: arriva un po' più grande e sollevato, l'ombra si stringe all'atterraggio
const Cade: React.FC<Pos & { t: number; tempo: number; children: React.ReactNode; ombra?: boolean; dur?: number }> = ({ t, tempo, children, ombra = true, dur = 0.6, ...p }) => {
  if (tempo < t - 0.05) return null;
  const k = outCubic(prog(tempo, t, dur));
  const o = clamp01((tempo - t) / 0.12);
  const s = 1 + 0.16 * (1 - k);
  const r = (p.rot ?? 0) + 5 * (1 - k);
  const sh = ombra ? `drop-shadow(0 ${14 + 70 * (1 - k)}px ${22 + 70 * (1 - k)}px rgba(0,0,0,${0.42 - 0.12 * (1 - k)}))` : 'none';
  return <div style={{ ...centro({ ...p, rot: r }, `scale(${s})`), opacity: o, filter: sh }}>{children}</div>;
};

// stampa fotografica d'epoca con bordo bianco e due strisce di washi tape
const Foto: React.FC<{ src: string; w: number; bn?: boolean; seppia?: number; bordo?: number; nastro?: boolean; contain?: boolean; h?: number; fondo?: string }> = ({ src, w, bn = true, seppia = 0.35, bordo, nastro = true, contain, h, fondo }) => {
  const b = bordo ?? w * 0.045;
  return (
    <div style={{ position: 'relative', width: w, padding: b, background: '#f4efe4', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)' }}>
      <Img src={f(src)} style={{
        display: 'block', width: '100%', height: h, objectFit: contain ? 'contain' : 'cover', background: fondo,
        filter: bn ? `grayscale(1) sepia(${seppia}) contrast(1.08) brightness(0.97)` : 'saturate(0.9) contrast(1.02)',
      }} />
      {/* velo opaco della carta fotografica */}
      <div style={{ position: 'absolute', inset: b, background: 'radial-gradient(ellipse at 30% 20%, rgba(255,245,225,0.12), rgba(60,40,20,0.14))', mixBlendMode: 'multiply' }} />
      {nastro && <><Nastro x={w * 0.12} y={-8} rot={-28} /><Nastro x={w * 0.88} y={-8} rot={24} /></>}
    </div>
  );
};

const Nastro: React.FC<{ x: number; y: number; rot: number; colore?: string }> = ({ x, y, rot, colore = 'rgba(196,74,58,0.62)' }) => (
  <div style={{
    position: 'absolute', left: x, top: y, width: 190, height: 58, transform: `translate(-50%,-50%) rotate(${rot}deg)`,
    background: `repeating-linear-gradient(45deg, ${colore} 0 14px, rgba(235,210,190,0.55) 14px 28px)`,
    boxShadow: '0 2px 6px rgba(0,0,0,0.18)', opacity: 0.92,
    clipPath: 'polygon(3% 0, 97% 4%, 100% 50%, 96% 100%, 2% 96%, 0 50%)',
  }} />
);

// scritta a pennello che si "scrive" da sinistra a destra (o dall'alto in basso se verticale)
const Pennello: React.FC<Pos & { testo: string; t: number; tempo: number; size: number; dur?: number; colore?: string; font?: string; verticale?: boolean; peso?: number; spazio?: number }> = ({ testo, t, tempo, size, dur = 0.7, colore = INCHIOSTRO, font = PENNELLO, verticale, peso = 400, spazio = 0, ...p }) => {
  if (tempo < t) return null;
  const k = inOut(prog(tempo, t, dur)) * 115;
  const dir = verticale ? '180deg' : '90deg';
  const mask = `linear-gradient(${dir}, #000 ${k - 15}%, transparent ${k}%)`;
  return (
    <div style={{
      ...centro(p), fontFamily: font, fontSize: size, color: colore, whiteSpace: 'nowrap', lineHeight: 1, fontWeight: peso,
      writingMode: verticale ? 'vertical-rl' : undefined, letterSpacing: spazio,
      WebkitMaskImage: mask, maskImage: mask, textShadow: '0 0 1px rgba(29,23,18,0.4)',
    }}>{testo}</div>
  );
};

// testo a macchina da scrivere, lettera per lettera
const Macchina: React.FC<Pos & { testo: string; t: number; tempo: number; size?: number; colore?: string; cps?: number; peso?: number }> = ({ testo, t, tempo, size = 58, colore = INCHIOSTRO, cps = 28, peso = 700, ...p }) => {
  if (tempo < t) return null;
  const n = Math.min(testo.length, Math.floor((tempo - t) * cps) + 1);
  return <div style={{ ...centro(p), fontFamily: MACCHINA, fontWeight: peso, fontSize: size, color: colore, whiteSpace: 'pre', letterSpacing: 4, opacity: 0.88 }}>
    {testo.slice(0, n)}<span style={{ opacity: 0 }}>{testo.slice(n)}</span>
  </div>;
};

// didascalia: nome in serif + kanji piccoli sotto
const Nome: React.FC<Pos & { nome: string; kanji?: string; ruolo?: string; t: number; tempo: number; size?: number }> = ({ nome, kanji, ruolo, t, tempo, size = 112, ...p }) => {
  if (tempo < t) return null;
  const k = outCubic(prog(tempo, t, 0.7));
  return (
    <div style={{ ...centro(p, `translateY(${(1 - k) * 30}px)`), opacity: k, textAlign: 'center', whiteSpace: 'nowrap' }}>
      {ruolo && <div style={{ fontFamily: MACCHINA, fontSize: size * 0.4, letterSpacing: 8, color: ROSSO, fontWeight: 700, marginBottom: size * 0.15 }}>{ruolo}</div>}
      <div style={{ fontFamily: SERIF, fontSize: size, fontWeight: 600, color: INCHIOSTRO, lineHeight: 1 }}>{nome}</div>
      {kanji && <div style={{ fontFamily: MINCHO, fontSize: size * 0.48, color: INCHIOSTRO, opacity: 0.7, marginTop: size * 0.2, letterSpacing: size * 0.12 }}>{kanji}</div>}
    </div>
  );
};

// timbro hanko rosso: cade forte e resta, con l'inchiostro un po' irregolare
const Hanko: React.FC<Pos & { testo: string; t: number; tempo: number; size?: number; sotto?: string; verticale?: boolean }> = ({ testo, t, tempo, size = 150, sotto, verticale = true, ...p }) => {
  if (tempo < t) return null;
  const k = prog(tempo, t, 0.13);
  const s = 1.7 - 0.7 * Easing.in(Easing.quad)(k);
  const o = k < 1 ? 0.3 + 0.6 * k : 0.9;
  return (
    <div style={{ ...centro(p, `scale(${s})`), opacity: o, textAlign: 'center', mixBlendMode: 'multiply' }}>
      <div style={{
        display: 'inline-block', border: `${size * 0.09}px solid ${ROSSO}`, borderRadius: size * 0.14, padding: `${size * 0.12}px ${size * 0.1}px`,
        fontFamily: MINCHO, fontWeight: 800, fontSize: size, color: ROSSO, lineHeight: 1.02, writingMode: verticale ? 'vertical-rl' : undefined,
        filter: 'url(#inchiostro)',
      }}>{testo}</div>
      {sotto && <div style={{ fontFamily: MACCHINA, fontWeight: 700, fontSize: size * 0.3, color: ROSSO, letterSpacing: 6, marginTop: size * 0.18, filter: 'url(#inchiostro)' }}>{sotto}</div>}
    </div>
  );
};

// cerchio rosso a mano, tracciato sulla parola
const Cerchio: React.FC<Pos & { w: number; h: number; t: number; tempo: number; spessore?: number }> = ({ w, h, t, tempo, spessore = 12, ...p }) => {
  if (tempo < t) return null;
  const k = outCubic(prog(tempo, t, 0.5));
  const pts: string[] = [];
  for (let i = 0; i <= 64; i++) {
    const a = -1.9 + (i / 64) * Math.PI * 2.18;
    const r = 1 + 0.035 * Math.sin(i * 0.9) + i * 0.0012;
    pts.push(`${(w / 2 + Math.cos(a) * (w / 2 - spessore) * r).toFixed(1)},${(h / 2 + Math.sin(a) * (h / 2 - spessore) * r).toFixed(1)}`);
  }
  return (
    <svg width={w} height={h} style={{ ...centro(p), overflow: 'visible', filter: 'drop-shadow(0 0 6px rgba(0,0,0,0.6))' }}>
      <polyline points={pts.join(' ')} fill="none" stroke="#ff3b2e" strokeWidth={spessore} strokeLinecap="round" strokeLinejoin="round"
        pathLength={1} strokeDasharray="1" strokeDashoffset={1 - k} />
    </svg>
  );
};

// X rossa a pennello
const Croce: React.FC<Pos & { w: number; t: number; tempo: number }> = ({ w, t, tempo, ...p }) => {
  if (tempo < t) return null;
  const a = outCubic(prog(tempo, t, 0.16)), b = outCubic(prog(tempo, t + 0.12, 0.16));
  return (
    <svg width={w} height={w * 0.7} viewBox="0 0 100 70" style={{ ...centro(p), overflow: 'visible', mixBlendMode: 'multiply' }}>
      <path d="M8 8 Q50 38 93 63" fill="none" stroke={ROSSO} strokeWidth={7} strokeLinecap="round" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - a} />
      <path d="M90 6 Q48 36 9 64" fill="none" stroke={ROSSO} strokeWidth={7} strokeLinecap="round" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - b} />
    </svg>
  );
};

// scheda d'archivio per le idee fallite (riso, taxi, motel)
const Scheda: React.FC<{ kanji: string; titolo: string; icona: React.ReactNode }> = ({ kanji, titolo, icona }) => (
  <div style={{
    width: 980, height: 560, background: `url(${f('washi.jpg')}) 0 0 / 900px, #f2ead6`, backgroundBlendMode: 'multiply',
    boxShadow: 'inset 0 0 0 2px rgba(0,0,0,0.12)', position: 'relative', display: 'flex', alignItems: 'center', padding: '0 70px', gap: 60,
  }}>
    <div style={{ position: 'absolute', top: 30, left: 40, right: 40, height: 4, background: ROSSO, opacity: 0.7 }} />
    <div style={{ width: 300, height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icona}</div>
    <div>
      <div style={{ fontFamily: MINCHO, fontWeight: 800, fontSize: 132, color: INCHIOSTRO, lineHeight: 1.05, whiteSpace: 'nowrap' }}>{kanji}</div>
      <div style={{ fontFamily: MACCHINA, fontWeight: 700, fontSize: 56, color: INCHIOSTRO, letterSpacing: 6, marginTop: 26, whiteSpace: 'nowrap' }}>{titolo}</div>
    </div>
  </div>
);
const tratto = { fill: 'none', stroke: INCHIOSTRO, strokeWidth: 7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const Ciotola = () => <svg viewBox="0 0 100 100" width={280}><path d="M12 48 H88 Q84 82 50 84 Q16 82 12 48 Z" {...tratto} /><path d="M30 40 Q34 28 30 18 M50 40 Q54 26 50 14 M70 40 Q74 28 70 18" {...tratto} strokeWidth={5} /><path d="M38 84 L36 92 H64 L62 84" {...tratto} /></svg>;
const Taxi = () => <svg viewBox="0 0 100 100" width={290}><path d="M8 66 V52 L22 48 L32 32 H68 L78 48 L92 52 V66 Z" {...tratto} /><path d="M36 36 H48 V48 H28 Z M52 36 H64 L72 48 H52 Z" {...tratto} strokeWidth={4} /><circle cx="27" cy="68" r="9" {...tratto} fill="#efe6d2" /><circle cx="73" cy="68" r="9" {...tratto} fill="#efe6d2" /><rect x="40" y="22" width="20" height="9" {...tratto} strokeWidth={4} /></svg>;
const Insegna = () => <svg viewBox="0 0 100 100" width={260}><path d="M50 6 V18" {...tratto} /><path d="M50 18 C 25 18 18 40 50 62 C 82 40 75 18 50 18 Z" {...tratto} stroke={ROSSO} /><path d="M50 62 V94 M34 94 H66" {...tratto} /></svg>;

// il braccio allungabile di Yokoi: pantografo a forbice che si disegna e poi si estende
const Pantografo: React.FC<{ tempo: number; t: number }> = ({ tempo, t }) => {
  if (tempo < t) return null;
  const disegno = outCubic(prog(tempo, t, 0.9));
  const est = inOut(prog(tempo, t + 0.7, 1.6));
  const N = 7, L = 230;
  const th = (68 - 44 * est) * Math.PI / 180;
  const dx = L * Math.cos(th), dy = L * Math.sin(th) / 2;
  const x0 = 150;
  const seg: string[] = [];
  for (let i = 0; i < N; i++) {
    const a = x0 + i * dx;
    seg.push(`M${a} ${-dy} L${a + dx} ${dy}`, `M${a} ${dy} L${a + dx} ${-dy}`);
  }
  const fine = x0 + N * dx;
  const giunti: [number, number][] = [];
  for (let i = 0; i <= N; i++) giunti.push([x0 + i * dx, -dy], [x0 + i * dx, dy], ...(i < N ? [[x0 + (i + 0.5) * dx, 0] as [number, number]] : []));
  const s = { fill: 'none', stroke: INCHIOSTRO, strokeWidth: 9, strokeLinecap: 'round' as const };
  return (
    <svg width={2000} height={800} viewBox="0 -400 2000 800" style={{ overflow: 'visible' }}>
      <g pathLength={1} style={{ opacity: 1 }}>
        {/* impugnatura ad anelli */}
        <circle cx={70} cy={-dy - 40} r={48} {...s} pathLength={1} strokeDasharray="1" strokeDashoffset={1 - disegno} />
        <circle cx={70} cy={dy + 40} r={48} {...s} pathLength={1} strokeDasharray="1" strokeDashoffset={1 - disegno} />
        <path d={`M110 ${-dy - 20} L${x0} ${-dy} M110 ${dy + 20} L${x0} ${dy}`} {...s} />
        {seg.map((d, i) => <path key={i} d={d} {...s} pathLength={1} strokeDasharray="1" strokeDashoffset={clamp01(1 - disegno * 1.4 + i * 0.03)} />)}
        {giunti.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={11} fill={CARTA} stroke={INCHIOSTRO} strokeWidth={5} opacity={disegno} />)}
        {/* pinza */}
        <path d={`M${fine} ${-dy} Q${fine + 90} ${-dy - 30} ${fine + 120} ${-30} M${fine} ${dy} Q${fine + 90} ${dy + 30} ${fine + 120} ${30}`} {...s} stroke={ROSSO} opacity={disegno} />
      </g>
      {/* quota "allungabile" */}
      <g opacity={est} fontFamily={MACCHINA} fontSize={46} fontWeight={700} fill={INCHIOSTRO}>
        <path d={`M${x0} 230 H${fine + 120}`} stroke={INCHIOSTRO} strokeWidth={3} strokeDasharray="14 10" />
        <path d={`M${x0} 210 V250 M${fine + 120} 210 V250`} stroke={INCHIOSTRO} strokeWidth={3} />
        <text x={(x0 + fine + 120) / 2} y={300} textAnchor="middle" letterSpacing={6}>ALLUNGABILE</text>
      </g>
    </svg>
  );
};

// curva delle vendite: sale per decenni, poi crolla in rosso
const Grafico: React.FC<{ tempo: number }> = ({ tempo }) => {
  const sale = inOut(prog(tempo, 19.4, 1.9));
  const crolla = outCubic(prog(tempo, 21.74, 0.85));
  const W = 1500, H = 640;
  const su = 'M0 560 C 260 540 420 520 620 440 S 980 160 1080 120';
  const giu = 'M1080 120 C 1150 110 1190 260 1250 420 S 1400 610 1500 620';
  if (tempo < 19.3) return null;
  return (
    <svg width={W} height={H + 120} viewBox={`0 -20 ${W} ${H + 120}`} style={{ overflow: 'visible' }}>
      <path d={`M0 ${H} H${W}`} stroke={INCHIOSTRO} strokeWidth={4} opacity={0.6} />
      {[0, 620, 1080, 1500].map((x, i) => <path key={i} d={`M${x} ${H - 12} V${H + 12}`} stroke={INCHIOSTRO} strokeWidth={4} opacity={0.6} />)}
      <g fontFamily={MACCHINA} fontWeight={700} fontSize={44} fill={INCHIOSTRO} opacity={0.75}>
        <text x={0} y={H + 70}>1889</text><text x={620} y={H + 70} textAnchor="middle">1950</text>
        <text x={1080} y={H + 70} textAnchor="middle">1960</text><text x={1500} y={H + 70} textAnchor="end">1965</text>
      </g>
      <path d={su} fill="none" stroke={INCHIOSTRO} strokeWidth={12} strokeLinecap="round" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - sale} />
      <path d={giu} fill="none" stroke={ROSSO} strokeWidth={14} strokeLinecap="round" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - crolla} />
      <text x={20} y={40} fontFamily={MACCHINA} fontWeight={700} fontSize={46} letterSpacing={5} fill={INCHIOSTRO} opacity={sale * 0.8}>CARTE DA GIOCO VENDUTE</text>
    </svg>
  );
};

const Contatore: React.FC<Pos & { t: number; tempo: number }> = ({ t, tempo, ...p }) => {
  if (tempo < t) return null;
  const k = outCubic(prog(tempo, t, 1.3));
  const n = Math.round(1_000_000 * k / 1000) * 1000;
  return (
    <div style={{ ...centro(p), textAlign: 'center', whiteSpace: 'nowrap' }}>
      <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 250, color: INCHIOSTRO, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>+{n.toLocaleString('it-IT')}</div>
      <div style={{ fontFamily: MACCHINA, fontWeight: 700, fontSize: 60, letterSpacing: 10, color: ROSSO, marginTop: 20, opacity: clamp01((tempo - t) / 0.4) }}>PEZZI VENDUTI</div>
    </div>
  );
};

// ---------------------------------------------------------------- il mondo
const ALTEZZA = 26500;
const ANNI: [string, number][] = [['1889', 1050], ['1960', 9300], ['1966', 18500], ['1980', 21300], ['1981', 23600], ['OGGI', 25700]];

const Rotolo: React.FC = () => (
  <>
    {/* tavolo */}
    <div style={{ position: 'absolute', left: -9000, top: -9000, width: 18000, height: ALTEZZA + 18000, background: `url(${f('tavolo.jpg')}) 0 0 / 1600px, #241912` }} />
    {/* ombra del rotolo sul tavolo */}
    <div style={{ position: 'absolute', left: -1090, top: -200, width: 2180, height: ALTEZZA + 400, boxShadow: '0 60px 160px 40px rgba(0,0,0,0.75)' }} />
    {/* bordi di seta del kakemono */}
    <div style={{ position: 'absolute', left: -1090, top: -200, width: 2180, height: ALTEZZA + 400, background: 'repeating-linear-gradient(135deg, #1c2333 0 22px, #212a3d 22px 44px)', boxShadow: 'inset 0 0 0 6px #b79a5a, inset 0 0 0 10px #1c2333, inset 0 0 0 13px rgba(183,154,90,0.6)' }} />
    {/* carta */}
    <div style={{
      position: 'absolute', left: -1000, top: 0, width: 2000, height: ALTEZZA,
      background: CARTA, boxShadow: 'inset 0 0 120px rgba(90,60,25,0.35), inset 0 0 18px rgba(60,40,20,0.4)',
    }}>
      <div style={{ position: 'absolute', inset: 0, background: `url(${f('washi.jpg')}) 0 0 / 1100px`, opacity: 0.5, mixBlendMode: 'multiply' }} />
    </div>
    {/* bastoni di legno in cima e in fondo */}
    {[-230, ALTEZZA + 230].map((y) => (
      <div key={y} style={{ position: 'absolute', left: -1250, top: y - 55, width: 2500, height: 110, borderRadius: 55, background: 'linear-gradient(180deg,#5a3a22,#2b1a0f 60%,#140c07)', boxShadow: '0 30px 60px rgba(0,0,0,0.6)' }} />
    ))}
    {/* filo del tempo: linea d'inchiostro lungo il margine sinistro, con gli anni */}
    <svg width={200} height={ALTEZZA} style={{ position: 'absolute', left: -930, top: 0, overflow: 'visible' }}>
      <path d={`M60 500 V${ALTEZZA - 400}`} stroke={INCHIOSTRO} strokeWidth={5} opacity={0.35} strokeDasharray="2 18" strokeLinecap="round" />
      {ANNI.map(([a, y]) => (
        <g key={a}>
          <circle cx={60} cy={y} r={16} fill={ROSSO} opacity={0.85} />
          <text x={60} y={y + 80} textAnchor="middle" fontFamily={MACCHINA} fontWeight={700} fontSize={44} fill={INCHIOSTRO} opacity={0.7}>{a}</text>
        </g>
      ))}
    </svg>
  </>
);

const Carta: React.FC<{ n: string; w: number }> = ({ n, w }) => (
  <div style={{ width: w, padding: w * 0.03, background: '#2a1d14', borderRadius: w * 0.05 }}>
    <Img src={f(n)} style={{ display: 'block', width: '100%', borderRadius: w * 0.03 }} />
  </div>
);

const Mondo: React.FC<{ t: number }> = ({ t }) => (
  <>
    <Rotolo />

    {/* ------------------------- 1889 */}
    <Pennello x={0} y={1050} testo="1889" t={5.95} tempo={t} size={520} dur={0.9} />
    <Pennello x={730} y={1120} testo="明治二十二年" t={6.4} tempo={t} size={84} font={MINCHO} peso={500} verticale dur={0.8} />
    <Macchina x={0} y={1440} testo="NINTENDO KOPPAI · KYOTO" t={6.6} tempo={t} size={74} />
    <Cade x={-380} y={2020} rot={-8} t={8.54} tempo={t}><Carta n="carte/c009.jpg" w={540} /></Cade>
    <Cade x={380} y={1990} rot={7} t={8.85} tempo={t}><Carta n="carte/c000.jpg" w={540} /></Cade>
    <Cade x={0} y={2080} rot={-1} t={9.2} tempo={t}><Carta n="carte/c005.jpg" w={580} /></Cade>
    <Hanko x={0} y={2450} rot={-8} testo="ヤクザ" sotto="YAKUZA" t={9.9} tempo={t} size={170} verticale={false} />

    {/* ------------------------- Kyoto e Fusajiro */}
    <Pennello x={-260} y={3010} testo="京都" t={11.62} tempo={t} size={230} font={MINCHO} peso={800} dur={0.5} />
    <Macchina x={300} y={3020} testo="KYOTO" t={11.7} tempo={t} size={96} />
    <Cade x={0} y={3600} rot={-2} t={11.45} tempo={t}><Foto src="kyoto.jpg" w={1320} /></Cade>
    <Cade x={0} y={4640} rot={2.5} t={12.1} tempo={t}><Foto src="negozio1889.jpg" w={1340} /></Cade>
    <Nome x={0} y={5380} nome="Fusajiro Yamauchi" kanji="山内房治郎" ruolo="FONDATORE · 1889" t={12.5} tempo={t} size={132} />

    {/* ------------------------- carte dipinte a mano, poi le bische */}
    <Cade x={-280} y={6200} rot={-3} t={13.6} tempo={t} dur={0.9}><Carta n="carte/c108.jpg" w={700} /></Cade>
    <Pennello x={370} y={5960} testo="花札" t={14.45} tempo={t} size={250} font={MINCHO} peso={800} dur={0.45} />
    <Macchina x={370} y={6180} testo="HANAFUDA" t={14.55} tempo={t} size={84} />
    <Macchina x={370} y={6300} testo="dipinte a mano" t={14.7} tempo={t} size={64} peso={400} />
    <Cade x={0} y={7430} rot={-2} t={15.35} tempo={t}><Foto src="koikoi.jpg" w={1400} bn={false} /></Cade>
    <Hanko x={430} y={8000} rot={7} testo="博打" sotto="BISCHE" t={16.3} tempo={t} size={170} />
    <Cade x={-430} y={8080} rot={-6} t={16.9} tempo={t}><Foto src="hanafuda-scatola.jpg" w={460} bn={false} /></Cade>

    {/* ------------------------- anni 60: il crollo */}
    <Pennello x={0} y={9280} testo="1960" t={20.6} tempo={t} size={520} dur={0.7} />
    <div style={{ position: 'absolute', left: -700, top: 9680, transform: 'scale(0.93)', transformOrigin: '0 0' }}><Grafico tempo={t} /></div>

    {/* ------------------------- Hiroshi */}
    <Cade x={0} y={11280} rot={-2.5} t={23.45} tempo={t}><Foto src="hiroshi-giovane.jpg" w={900} /></Cade>
    <Hanko x={400} y={11620} rot={9} testo="倒産寸前" sotto="FALLIMENTO" t={24.5} tempo={t} size={130} />
    <Nome x={0} y={12250} nome="Hiroshi Yamauchi" kanji="山内溥" ruolo="PRESIDENTE DAL 1949" t={23.62} tempo={t} size={132} />

    {/* ------------------------- tre idee, tre flop */}
    <Cade x={-30} y={13000} rot={-2} t={27.25} tempo={t}><Scheda kanji="即席米" titolo="RISO ISTANTANEO" icona={<Ciotola />} /></Cade>
    <Cade x={30} y={13700} rot={2} t={29.35} tempo={t}><Scheda kanji="タクシー" titolo="TAXI" icona={<Taxi />} /></Cade>
    <Cade x={-30} y={14400} rot={-1.5} t={30.98} tempo={t}><Scheda kanji="ラブホテル" titolo="MOTEL A ORE" icona={<Insegna />} /></Cade>
    <Croce x={-30} y={13000} w={820} t={31.66} tempo={t} />
    <Croce x={30} y={13700} w={820} t={31.92} tempo={t} />
    <Croce x={-30} y={14400} w={820} t={32.18} tempo={t} />
    <Hanko x={0} y={13700} rot={-10} testo="失敗" sotto="FLOP" t={32.75} tempo={t} size={330} />

    {/* ------------------------- Gunpei Yokoi e il braccio */}
    <Macchina x={0} y={15300} testo="TECNICO DI LABORATORIO" t={34.55} tempo={t} size={78} />
    <Cade x={0} y={15950} rot={3} t={35.6} tempo={t}><Foto src="yokoi2.jpg" w={880} /></Cade>
    <Nome x={0} y={16640} nome="Gunpei Yokoi" kanji="横井軍平" t={35.75} tempo={t} size={132} />
    <div style={{ position: 'absolute', left: -930, top: 17380, transform: 'translateY(-50%) scale(0.92)', transformOrigin: '0 50%' }}><Pantografo tempo={t} t={37.8} /></div>
    <Macchina x={0} y={17880} testo="+ pezzi di scarto" t={39.6} tempo={t} size={72} peso={400} />

    {/* ------------------------- Ultra Hand */}
    <Pennello x={0} y={18480} testo="Ultra Hand" t={40.85} tempo={t} size={235} dur={0.6} />
    <Pennello x={0} y={18720} testo="ウルトラハンド · 1966" t={41.1} tempo={t} size={88} font={MINCHO} peso={500} dur={0.5} />
    <Cade x={0} y={19380} rot={-3} t={41.3} tempo={t}><Foto src="ultrahand-scatola.jpg" w={1220} bn={false} /></Cade>
    <Contatore x={0} y={20200} t={43.5} tempo={t} />
    <Hanko x={470} y={20560} rot={6} testo="黒字" sotto="CONTI SALVI" t={45.17} tempo={t} size={130} />

    {/* ------------------------- Game & Watch, Donkey Kong, Mario */}
    <Pennello x={0} y={21280} testo="1980" t={48.9} tempo={t} size={300} dur={0.5} />
    <Cade x={0} y={21950} rot={-2} t={49.1} tempo={t}><Foto src="gw-chef.jpg" w={1350} bn={false} /></Cade>
    <Macchina x={0} y={22560} testo="GAME & WATCH" t={49.2} tempo={t} size={92} />
    <Cade x={0} y={23600} rot={0} t={51.45} tempo={t}><Foto src="dk.png" w={1000} bn={false} /></Cade>
    <Macchina x={0} y={24420} testo="1981 · DONKEY KONG" t={51.6} tempo={t} size={80} />
    {/* Jumpman, il primo Mario, in basso a sinistra nello schermo */}
    <Cerchio x={-112} y={23935} w={170} h={170} t={52.25} tempo={t} spessore={8} />
    <Macchina x={0} y={24560} testo="JUMPMAN → MARIO" t={52.35} tempo={t} size={72} colore={ROSSO} />

    {/* ------------------------- oggi (l'inizio del video) */}
    <Pennello x={0} y={25080} testo="Nintendo" t={1.3} tempo={t} size={250} font={SERIF} peso={700} dur={0.5} />
    <div style={{ ...centro({ x: 0, y: 25720 }), filter: 'drop-shadow(0 30px 50px rgba(0,0,0,0.5))' }}>
      <Img src={f('switch.png')} style={{ width: 1400, display: 'block' }} />
    </div>
    <Cade x={430} y={26080} rot={6} t={2.5} tempo={t} dur={0.45}><Img src={f('mario.png')} style={{ width: 380, display: 'block' }} /></Cade>
  </>
);

// ---------------------------------------------------------------- composizione
export const DocNintendo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;
  const c = camera(t);
  const k = width / 2160; // tutto è pensato per 2160 di larghezza

  // velocità di schermo → mosso direzionale (solo quando la camera corre)
  const p = camera(t - 1 / fps);
  const vx = (c.x - p.x) * c.z * k, vy = (c.y - p.y) * c.z * k;
  const bx = Math.min(24, Math.abs(vx) * 0.2), by = Math.min(44, Math.abs(vy) * 0.2);
  const mosso = bx + by > 1.2;

  // finale: il mondo si scurisce e resta la regola
  const buio = interpolate(t, [55.2, 56.0], [0, 0.6], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const regola1 = outCubic(prog(t, 55.55, 0.8)), regola2 = outCubic(prog(t, 56.65, 0.8));

  return (
    <AbsoluteFill style={{ background: '#120c08', overflow: 'hidden' }}>
      <style>{FONT_LOCALI}</style>
      <svg width={0} height={0} style={{ position: 'absolute' }}>
        <filter id="mosso"><feGaussianBlur stdDeviation={`${bx.toFixed(2)} ${by.toFixed(2)}`} /></filter>
        <filter id="inchiostro"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={4} /><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.2 1.7" /><feComposite in="SourceGraphic" operator="in" /></filter>
      </svg>

      <div style={{ position: 'absolute', inset: 0, filter: mosso ? 'url(#mosso)' : undefined }}>
        <div style={{
          position: 'absolute', left: width / 2, top: height / 2, transformOrigin: '0 0',
          transform: `scale(${c.z * k}) rotate(${c.rot}deg) translate(${-c.x}px, ${-c.y}px)`,
        }}>
          <Mondo t={t} />
        </div>
      </div>

      {/* luce calda dall'alto a sinistra + vignettatura */}
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 90% 70% at 30% 18%, rgba(255,214,160,0.16), rgba(0,0,0,0) 60%)', mixBlendMode: 'screen' }} />
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 85% 75% at 50% 48%, rgba(0,0,0,0) 45%, rgba(10,6,3,0.72) 100%)' }} />
      <AbsoluteFill style={{ background: `rgba(8,5,3,${buio})` }} />

      {/* la regola finale */}
      {t > 55.4 && (
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
          <div style={{ fontFamily: PENNELLO, fontSize: 250 * k, color: '#f3ead6', opacity: regola1, transform: `translateY(${(1 - regola1) * 40 * k}px)`, textShadow: '0 10px 40px rgba(0,0,0,0.6)', lineHeight: 1.1 }}>Reinventarsi</div>
          <div style={{ fontFamily: PENNELLO, fontSize: 250 * k, color: '#f3ead6', opacity: regola2, transform: `translateY(${(1 - regola2) * 40 * k}px)`, textShadow: '0 10px 40px rgba(0,0,0,0.6)', lineHeight: 1.1 }}>
            o <span style={{ color: '#e0503f' }}>morire.</span>
          </div>
          <div style={{ marginTop: 90 * k, opacity: regola2, transform: `scale(${1.5 - 0.5 * Easing.in(Easing.quad)(prog(t, 57.2, 0.14))})` }}>
            {t > 57.2 && <div style={{ border: `${12 * k}px solid ${ROSSO}`, borderRadius: 18 * k, padding: `${14 * k}px ${16 * k}px`, fontFamily: MINCHO, fontWeight: 800, fontSize: 120 * k, color: ROSSO, writingMode: 'vertical-rl', background: 'rgba(243,234,214,0.92)' }}>任天堂</div>}
          </div>
        </AbsoluteFill>
      )}

      {/* grana di pellicola */}
      <Img src={f(`grana${frame % 6}.png`)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', mixBlendMode: 'overlay', opacity: 0.22 }} />

      <Audio src={f('vo.wav')} />
    </AbsoluteFill>
  );
};

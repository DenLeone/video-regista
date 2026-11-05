import React from 'react';
import { Easing, Freeze, Img, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { loadFont as caricaCormorant } from '@remotion/google-fonts/CormorantGaramond';
import { loadFont as caricaCourier } from '@remotion/google-fonts/CourierPrime';

// Mattoni grafici del mondo "Rotolo" (carta washi, inchiostro, timbri hanko, foto d'epoca con nastro).
// Generato da work/doc-prova/estrai-pezzi.py a partire dalla prova src/DocNintendo.tsx: i ritocchi
// vanno fatti qui. Ogni elemento riceve il tempo corrente (`tempo`) e quello in cui compare (`t`).

// cartella del documento dentro public/ (la imposta Rotolo prima di disegnare)
let DIR = '';
export const impostaCartella = (d: string) => { DIR = d.endsWith('/') ? d : d + '/'; };
export const f = (n: string) => staticFile(DIR + n);

const { fontFamily: SERIF } = caricaCormorant('normal', { weights: ['500', '600', '700'], subsets: ['latin', 'latin-ext'] });
const { fontFamily: MACCHINA } = caricaCourier('normal', { weights: ['400', '700'], subsets: ['latin', 'latin-ext'] });
export { SERIF, MACCHINA };
export const MINCHO = 'DocMincho';
export const PENNELLO = 'DocPennello';
// font giapponesi ridotti ai soli caratteri del documento (pc/rotolo/prepara.mjs li scarica nella cartella)
export const fontLocali = () => `
@font-face{font-family:${MINCHO};src:url(${f('mincho500.woff2')});font-weight:500;font-display:block}
@font-face{font-family:${MINCHO};src:url(${f('mincho800.woff2')});font-weight:800;font-display:block}
@font-face{font-family:${PENNELLO};src:url(${f('pennello.woff2')});font-display:block}`;

export const INCHIOSTRO = '#1d1712';
export const ROSSO = '#b3291f';
export const CARTA = '#efe6d2';

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
export const outCubic = (p: number) => 1 - Math.pow(1 - clamp01(p), 3);
export const inOut = (p: number) => { p = clamp01(p); return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; };
export const prog = (t: number, da: number, dur: number) => clamp01((t - da) / dur);

// ---------------------------------------------------------------- mattoni
export type Pos = { x: number; y: number; rot?: number };
export const centro = (p: Pos, extra = ''): React.CSSProperties => ({
  position: 'absolute', left: p.x, top: p.y, transform: `translate(-50%,-50%) rotate(${p.rot ?? 0}deg) ${extra}`,
});

// un oggetto che "cade" sulla carta: arriva un po' più grande e sollevato, l'ombra si stringe all'atterraggio
export const Cade: React.FC<Pos & { t: number; tempo: number; children: React.ReactNode; ombra?: boolean; dur?: number }> = ({ t, tempo, children, ombra = true, dur = 0.6, ...p }) => {
  if (tempo < t - 0.05) return null;
  const k = outCubic(prog(tempo, t, dur));
  const o = clamp01((tempo - t) / 0.12);
  const s = 1 + 0.16 * (1 - k);
  const r = (p.rot ?? 0) + 5 * (1 - k);
  const sh = ombra ? `drop-shadow(0 ${14 + 70 * (1 - k)}px ${22 + 70 * (1 - k)}px rgba(0,0,0,${0.42 - 0.12 * (1 - k)}))` : 'none';
  return <div style={{ ...centro({ ...p, rot: r }, `scale(${s})`), opacity: o, filter: sh }}>{children}</div>;
};

// immagine o clip video (overlay-*.mp4): la clip parte quando l'elemento compare (t), senza audio,
// e finita resta ferma sull'ultimo fotogramma
export const eVideo = (n = '') => /\.(mp4|mov|m4v|webm)$/i.test(n);
// loop: la clip ricomincia invece di fermarsi (le GIF, convertite in mp4 dalla regia locale)
export const Media: React.FC<{ src: string; style?: React.CSSProperties; t?: number; dur?: number; loop?: boolean }> = ({ src, style, t = 0, dur, loop }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!eVideo(src)) return <Img src={f(src)} style={style} />;
  const n = dur ? Math.max(1, Math.floor(dur * fps) - 1) : Infinity;
  const k = Math.max(0, frame - Math.round(t * fps));
  return <Freeze frame={loop && Number.isFinite(n) ? k % n : Math.min(n - 1, k)}><OffthreadVideo src={f(src)} muted style={style} /></Freeze>;
};

// stampa fotografica d'epoca con bordo bianco e due strisce di washi tape
export const Foto: React.FC<{ src: string; w: number; bn?: boolean; seppia?: number; bordo?: number; nastro?: boolean; contain?: boolean; h?: number; fondo?: string; t?: number; dur?: number; loop?: boolean }> = ({ src, w, bn = true, seppia = 0.35, bordo, nastro = true, contain, h, fondo, t, dur, loop }) => {
  const b = bordo ?? w * 0.045;
  return (
    <div style={{ position: 'relative', width: w, padding: b, background: '#f4efe4', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)' }}>
      <Media src={src} t={t} dur={dur} loop={loop} style={{
        display: 'block', width: '100%', height: h, objectFit: contain ? 'contain' : 'cover', background: fondo,
        filter: bn ? `grayscale(1) sepia(${seppia}) contrast(1.08) brightness(0.97)` : 'saturate(0.9) contrast(1.02)',
      }} />
      {/* velo opaco della carta fotografica */}
      <div style={{ position: 'absolute', inset: b, background: 'radial-gradient(ellipse at 30% 20%, rgba(255,245,225,0.12), rgba(60,40,20,0.14))', mixBlendMode: 'multiply' }} />
      {nastro && <><Nastro x={w * 0.12} y={-8} rot={-28} /><Nastro x={w * 0.88} y={-8} rot={24} /></>}
    </div>
  );
};

export const Nastro: React.FC<{ x: number; y: number; rot: number; colore?: string }> = ({ x, y, rot, colore = 'rgba(196,74,58,0.62)' }) => (
  <div style={{
    position: 'absolute', left: x, top: y, width: 190, height: 58, transform: `translate(-50%,-50%) rotate(${rot}deg)`,
    background: `repeating-linear-gradient(45deg, ${colore} 0 14px, rgba(235,210,190,0.55) 14px 28px)`,
    boxShadow: '0 2px 6px rgba(0,0,0,0.18)', opacity: 0.92,
    clipPath: 'polygon(3% 0, 97% 4%, 100% 50%, 96% 100%, 2% 96%, 0 50%)',
  }} />
);

// scritta a pennello che si "scrive" da sinistra a destra (o dall'alto in basso se verticale)
export const Pennello: React.FC<Pos & { testo: string; t: number; tempo: number; size: number; dur?: number; colore?: string; font?: string; verticale?: boolean; peso?: number; spazio?: number }> = ({ testo, t, tempo, size, dur = 0.7, colore = INCHIOSTRO, font = PENNELLO, verticale, peso = 400, spazio = 0, ...p }) => {
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
export const Macchina: React.FC<Pos & { testo: string; t: number; tempo: number; size?: number; colore?: string; cps?: number; peso?: number }> = ({ testo, t, tempo, size = 58, colore = INCHIOSTRO, cps = 28, peso = 700, ...p }) => {
  if (tempo < t) return null;
  const n = Math.min(testo.length, Math.floor((tempo - t) * cps) + 1);
  return <div style={{ ...centro(p), fontFamily: MACCHINA, fontWeight: peso, fontSize: size, color: colore, whiteSpace: 'pre', letterSpacing: 4, opacity: 0.88 }}>
    {testo.slice(0, n)}<span style={{ opacity: 0 }}>{testo.slice(n)}</span>
  </div>;
};

// didascalia: nome in serif + kanji piccoli sotto
export const Nome: React.FC<Pos & { nome: string; kanji?: string; ruolo?: string; t: number; tempo: number; size?: number }> = ({ nome, kanji, ruolo, t, tempo, size = 112, ...p }) => {
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
export const Hanko: React.FC<Pos & { testo: string; t: number; tempo: number; size?: number; sotto?: string; verticale?: boolean }> = ({ testo, t, tempo, size = 150, sotto, verticale = true, ...p }) => {
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
export const Cerchio: React.FC<Pos & { w: number; h: number; t: number; tempo: number; spessore?: number }> = ({ w, h, t, tempo, spessore = 12, ...p }) => {
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
export const Croce: React.FC<Pos & { w: number; t: number; tempo: number }> = ({ w, t, tempo, ...p }) => {
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
export const Scheda: React.FC<{ kanji: string; titolo: string; icona: React.ReactNode }> = ({ kanji, titolo, icona }) => (
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
export const tratto = { fill: 'none', stroke: INCHIOSTRO, strokeWidth: 7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
export const Ciotola = () => <svg viewBox="0 0 100 100" width={280}><path d="M12 48 H88 Q84 82 50 84 Q16 82 12 48 Z" {...tratto} /><path d="M30 40 Q34 28 30 18 M50 40 Q54 26 50 14 M70 40 Q74 28 70 18" {...tratto} strokeWidth={5} /><path d="M38 84 L36 92 H64 L62 84" {...tratto} /></svg>;
export const Taxi = () => <svg viewBox="0 0 100 100" width={290}><path d="M8 66 V52 L22 48 L32 32 H68 L78 48 L92 52 V66 Z" {...tratto} /><path d="M36 36 H48 V48 H28 Z M52 36 H64 L72 48 H52 Z" {...tratto} strokeWidth={4} /><circle cx="27" cy="68" r="9" {...tratto} fill="#efe6d2" /><circle cx="73" cy="68" r="9" {...tratto} fill="#efe6d2" /><rect x="40" y="22" width="20" height="9" {...tratto} strokeWidth={4} /></svg>;
export const Insegna = () => <svg viewBox="0 0 100 100" width={260}><path d="M50 6 V18" {...tratto} /><path d="M50 18 C 25 18 18 40 50 62 C 82 40 75 18 50 18 Z" {...tratto} stroke={ROSSO} /><path d="M50 62 V94 M34 94 H66" {...tratto} /></svg>;

// il braccio allungabile di Yokoi: pantografo a forbice che si disegna e poi si estende
export const Pantografo: React.FC<{ tempo: number; t: number }> = ({ tempo, t }) => {
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

// grafico a mano: la curva si disegna dalla parola, poi (crollo) precipita in rosso su tCambio
export const Grafico: React.FC<{ tempo: number; t: number; tCambio: number; etichette: string[]; titolo?: string; forma?: 'crollo' | 'crescita' | 'picco' }> = ({ tempo, t, tCambio, etichette, titolo, forma = 'crollo' }) => {
  if (tempo < t - 0.1) return null;
  const sale = inOut(prog(tempo, t, Math.max(0.6, (tCambio - t) * 0.95)));
  const cambio = outCubic(prog(tempo, tCambio, 0.85));
  const W = 1500, H = 640;
  const su = forma === 'crescita' ? 'M0 600 C 400 580 800 420 1100 240 S 1400 60 1500 40' : 'M0 560 C 260 540 420 520 620 440 S 980 160 1080 120';
  const giu = forma === 'crollo' ? 'M1080 120 C 1150 110 1190 260 1250 420 S 1400 610 1500 620' : forma === 'picco' ? 'M1080 120 C 1180 100 1260 160 1320 260 S 1450 380 1500 400' : '';
  const xs = etichette.map((_, i) => (etichette.length === 1 ? 0 : (i / (etichette.length - 1)) * W));
  return (
    <svg width={W} height={H + 120} viewBox={`0 -20 ${W} ${H + 120}`} style={{ overflow: 'visible' }}>
      <path d={`M0 ${H} H${W}`} stroke={INCHIOSTRO} strokeWidth={4} opacity={0.6} />
      {xs.map((x, i) => <path key={i} d={`M${x} ${H - 12} V${H + 12}`} stroke={INCHIOSTRO} strokeWidth={4} opacity={0.6} />)}
      <g fontFamily={MACCHINA} fontWeight={700} fontSize={44} fill={INCHIOSTRO} opacity={0.75}>
        {etichette.map((e, i) => <text key={i} x={xs[i]} y={H + 70} textAnchor={i === 0 ? 'start' : i === etichette.length - 1 ? 'end' : 'middle'}>{e}</text>)}
      </g>
      <path d={su} fill="none" stroke={INCHIOSTRO} strokeWidth={12} strokeLinecap="round" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - sale} />
      {giu && <path d={giu} fill="none" stroke={ROSSO} strokeWidth={14} strokeLinecap="round" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - cambio} />}
      {titolo && <text x={20} y={40} fontFamily={MACCHINA} fontWeight={700} fontSize={46} letterSpacing={5} fill={INCHIOSTRO} opacity={sale * 0.8}>{titolo.toUpperCase()}</text>}
    </svg>
  );
};

export const Contatore: React.FC<Pos & { t: number; tempo: number; valore: number; prefisso?: string; etichetta?: string }> = ({ t, tempo, valore, prefisso = '+', etichetta, ...p }) => {
  if (tempo < t) return null;
  const k = outCubic(prog(tempo, t, 1.3));
  const passo = valore >= 10000 ? 1000 : 1;
  const n = Math.round(valore * k / passo) * passo;
  return (
    <div style={{ ...centro(p), textAlign: 'center', whiteSpace: 'nowrap' }}>
      <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 250, color: INCHIOSTRO, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{prefisso}{n.toLocaleString('it-IT')}</div>
      <div style={{ fontFamily: MACCHINA, fontWeight: 700, fontSize: 60, letterSpacing: 10, color: ROSSO, marginTop: 20, opacity: clamp01((tempo - t) / 0.4) }}>{etichetta}</div>
    </div>
  );
};


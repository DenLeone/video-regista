// Stile Documentario: piano sequenza verticale disegnato col codice, con Denis in camera dentro il mondo.
// Motore della camera e degli oggetti ripreso da src/racconto (stessa estetica: carta, inchiostro, rosso, grana,
// alone, vignettatura, mano libera, sfocatura nei movimenti veloci) con tre differenze:
//  - interpolazione monotona (Fritsch–Carlson): la camera passa per ogni chiave senza mai andare oltre, così quando
//    è dentro la stampa di Denis non ne scopre mai il bordo, e nelle pause continua a scivolare piano;
//  - la stampa "tu" con il video vero di Denis: la camera ci entra finché il video riempie lo schermo;
//  - eroi nuovi per il verticale: frase a macchina (evidenziatore o fili tra parole), curva che esplode, acronimo che
//    si apre, contatore; fili rossi tra gli oggetti.
// Props da pc/locale/doc-mondo.mjs.
import React from 'react';
import { AbsoluteFill, Audio, Img, OffthreadVideo, interpolate, random, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { loadFont as inter } from '@remotion/google-fonts/Inter';
import { loadFont as caveat } from '@remotion/google-fonts/Caveat';
import { loadFont as courier } from '@remotion/google-fonts/CourierPrime';
import type { Chiave, Evento, Oggetto, PropsDocumentario } from './tipi';

const { fontFamily: SANS } = inter('normal', { weights: ['500', '700', '900'], subsets: ['latin', 'latin-ext'] });
const { fontFamily: MANO } = caveat('normal', { weights: ['700'], subsets: ['latin', 'latin-ext'] });
const { fontFamily: MACCHINA } = courier('normal', { weights: ['400', '700'], subsets: ['latin', 'latin-ext'] });

const CARTA = '#EFEADF';
const INCHIOSTRO = '#16161A';
const ROSSO = '#D8322A';
const GRIGIO_RIGHE = '#CBC4B6';
const EVIDENZIATORE = 'rgba(255, 214, 64, 0.75)';
// bordo della stampa "tu": il video occupa il rettangolo interno (deve coincidere con pc/locale/doc-mondo.mjs)
export const BORDO_TU = 0.04;

const liscio = (x: number) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

// ---------- camera: cubica monotona sul tempo per x, y, log(zoom), rotazione ----------
function monotona(ts: number[], ys: number[], t: number) {
  const n = ts.length;
  if (t <= ts[0]) return ys[0];
  if (t >= ts[n - 1]) return ys[n - 1];
  let i = 0;
  while (ts[i + 1] < t) i++;
  const d = (k: number) => (ys[k + 1] - ys[k]) / (ts[k + 1] - ts[k]);
  const m = (k: number) => {
    if (k === 0) return 0;               // parte da ferma
    if (k === n - 1) return 0;           // arriva da ferma
    const a = d(k - 1), b = d(k);
    if (a * b <= 0) return 0;            // cambio di direzione: fermo in quel punto (niente oltre)
    const h0 = ts[k] - ts[k - 1], h1 = ts[k + 1] - ts[k];
    const w1 = 2 * h1 + h0, w2 = h1 + 2 * h0;
    return (w1 + w2) / (w1 / a + w2 / b); // media armonica pesata (Fritsch–Butland): mai oltre
  };
  const h = ts[i + 1] - ts[i], s = (t - ts[i]) / h, s2 = s * s, s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * ys[i] + (s3 - 2 * s2 + s) * h * m(i) + (-2 * s3 + 3 * s2) * ys[i + 1] + (s3 - s2) * h * m(i + 1);
}
type Stato = { x: number; y: number; z: number; r: number };
function camera(k: Chiave[], t: number): Stato {
  const ts = k.map((c) => c.t);
  return {
    x: monotona(ts, k.map((c) => c.x), t), y: monotona(ts, k.map((c) => c.y), t),
    z: Math.exp(monotona(ts, k.map((c) => Math.log(c.zoom)), t)), r: monotona(ts, k.map((c) => c.rot || 0), t),
  };
}

// mano libera: somma di seni lenti, ampiezza fissa sullo schermo
function mano(t: number) {
  const n = (f: number, ph: number) => Math.sin(t * f + ph);
  return { dx: 4 * n(0.7, 1) + 2.5 * n(1.9, 4) + 1 * n(4.3, 2), dy: 3.5 * n(0.9, 3) + 2 * n(2.3, 0) + 0.8 * n(5.1, 5), dr: 0.1 * n(0.5, 2) + 0.04 * n(1.7, 1) };
}

const eroeDi = (o: Oggetto, t: number) => Math.max(0, ...(o.eroe || []).map(([a, b]) => Math.min(liscio((t - a + 0.35) / 0.5), liscio((b - t + 0.35) / 0.5))));

// ---------- contenuti ----------
const Righe: React.FC<{ n: number; da: number }> = ({ n, da }) => (
  <div style={{ position: 'absolute', left: '9%', right: '9%', top: `${da}%`, bottom: '7%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
    {Array.from({ length: n }, (_, i) => <div key={i} style={{ height: 12, borderRadius: 6, background: GRIGIO_RIGHE, width: `${[100, 94, 98, 72, 96, 88, 60][i % 7]}%` }} />)}
  </div>
);
const testoScritto = (o: Oggetto, t: number) => {
  if (!o.titolo) return '';
  if (!o.scrivi) return o.titolo;
  const [a, b] = o.scrivi;
  return o.titolo.slice(0, Math.round(o.titolo.length * clamp01((t - a) / Math.max(0.1, b - a))));
};
const carta = (o: Oggetto) => ({ width: '100%', height: '100%', background: `linear-gradient(170deg, #F6F2EA, ${CARTA} 60%, #E6DFD2)`, position: 'relative' as const, overflow: 'hidden' as const });

// frase a macchina: parole a larghezza fissa (Courier), così si sa dove sta ogni parola per evidenziatore e fili
function impaginaFrase(o: Oggetto) {
  const fs = o.w * 0.085, cw = fs * 0.6, lh = fs * 1.5;
  const max = Math.floor((o.w * 0.84) / cw);
  const pos: { x: number; y: number; w: number }[] = [];
  let col = 0, riga = 0;
  for (const p of o.parole || []) {
    if (col > 0 && col + p.w.length > max) { col = 0; riga++; }
    pos.push({ x: o.w * 0.08 + col * cw, y: o.h * 0.14 + riga * lh, w: p.w.length * cw });
    col += p.w.length + 1;
  }
  return { fs, lh, pos };
}
const Frase: React.FC<{ o: Oggetto; t: number }> = ({ o, t }) => {
  const { fs, lh, pos } = impaginaFrase(o);
  const parole = o.parole || [];
  const attuale = parole.reduce((k, p, i) => (t >= p.t ? i : k), -1);
  return (
    <div style={carta(o)}>
      <svg width={o.w} height={o.h} style={{ position: 'absolute', left: 0, top: 0 }}>
        {o.modo === 'sequenza' && attuale >= 0 && (() => {
          const p = pos[attuale];
          const k = clamp01((t - parole[attuale].t) / 0.12);
          return <rect x={p.x - 6} y={p.y - fs * 0.05} width={(p.w + 12) * k} height={fs * 1.15} fill={EVIDENZIATORE} rx={6} />;
        })()}
        {o.modo === 'fili' && (o.fili || []).map(([a, b, tf], i) => {
          if (t < tf || !pos[a] || !pos[b]) return null;
          const k = liscio((t - tf) / 0.45);
          const x1 = pos[a].x + pos[a].w / 2, y1 = pos[a].y + fs * 1.1, x2 = pos[b].x + pos[b].w / 2, y2 = pos[b].y + fs * 1.1;
          const cx = (x1 + x2) / 2, cy = Math.max(y1, y2) + lh * 0.9;
          const lun = Math.hypot(x2 - x1, y2 - y1) * 1.4 + 200;
          return (
            <g key={i}>
              <path d={`M${x1},${y1} Q${cx},${cy} ${x2},${y2}`} fill="none" stroke={ROSSO} strokeWidth={7} strokeLinecap="round" strokeDasharray={lun} strokeDashoffset={lun * (1 - k)} />
              <circle cx={x1} cy={y1} r={11} fill={ROSSO} /><circle cx={x2} cy={y2} r={11 * k} fill={ROSSO} />
            </g>
          );
        })}
      </svg>
      {parole.map((p, i) => {
        const visibile = t >= p.t - 0.05 || o.modo !== 'sequenza';
        const sbiadita = o.sbiadisci && i < o.sbiadisci.fino ? 1 - 0.85 * clamp01((t - o.sbiadisci.t) / 1.2) : 1;
        const legata = o.modo === 'fili' && (o.fili || []).some(([a, b, tf]) => (a === i || b === i) && t >= tf);
        return (
          <div key={i} style={{ position: 'absolute', left: pos[i].x, top: pos[i].y, fontFamily: MACCHINA, fontWeight: 700, fontSize: fs, lineHeight: 1.1,
            color: legata ? ROSSO : INCHIOSTRO, opacity: (visibile ? 1 : 0.12) * sbiadita, whiteSpace: 'pre' }}>{p.w}</div>
        );
      })}
    </div>
  );
};

const Curva: React.FC<{ o: Oggetto; t: number }> = ({ o, t }) => {
  // crescita lenta fino al 62% della larghezza, poi esplode; il tratto si disegna fino a t0, poi il resto in 0,7 s
  const W = o.w, H = o.h, x0 = W * 0.12, y0 = H * 0.84, x1 = W * 0.9, y1 = H * 0.12;
  const f = (u: number) => (u < 0.62 ? 0.12 * (u / 0.62) : 0.12 + 0.88 * Math.pow((u - 0.62) / 0.38, 2.2));
  const fino = t < (o.t0 ?? 0) ? 0.62 * clamp01((t - o.entra) / Math.max(0.3, (o.t0 ?? 0) - o.entra)) : 0.62 + 0.38 * liscio((t - (o.t0 ?? 0)) / 0.7);
  const punti = Array.from({ length: 60 }, (_, i) => (i / 59) * fino).map((u) => `${x0 + (x1 - x0) * u},${y0 - (y0 - y1) * f(u)}`);
  return (
    <div style={carta(o)}>
      <svg width={W} height={H} style={{ position: 'absolute', left: 0, top: 0 }}>
        <line x1={x0} y1={y0} x2={x1} y2={y0} stroke={INCHIOSTRO} strokeWidth={8} />
        <line x1={x0} y1={y0} x2={x0} y2={y1 - 20} stroke={INCHIOSTRO} strokeWidth={8} />
        {[0.25, 0.5, 0.75].map((u) => <line key={u} x1={x0} x2={x1} y1={y0 - (y0 - y1) * u} y2={y0 - (y0 - y1) * u} stroke={GRIGIO_RIGHE} strokeWidth={4} />)}
        <polyline points={punti.join(' ')} fill="none" stroke={ROSSO} strokeWidth={16} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {o.sotto ? <div style={{ position: 'absolute', left: x0, bottom: H * 0.03, fontFamily: SANS, fontWeight: 900, fontSize: W * 0.075, color: INCHIOSTRO }}>{o.sotto}</div> : null}
    </div>
  );
};

const Acronimo: React.FC<{ o: Oggetto; t: number }> = ({ o, t }) => {
  const righe = o.lettere || [];
  const fs = Math.min(o.h / (righe.length * 1.25), o.w * 0.24);
  return (
    <div style={{ ...carta(o), display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingLeft: o.w * 0.08 }}>
      {righe.map((r, i) => {
        const k = clamp01((t - r.t) / 0.5);
        const resto = r.resto.slice(0, Math.round(r.resto.length * k));
        return (
          <div key={i} style={{ fontFamily: SANS, fontWeight: 900, fontSize: fs, lineHeight: 1.12, letterSpacing: -3, whiteSpace: 'nowrap' }}>
            <span style={{ color: ROSSO }}>{r.l}</span><span style={{ color: INCHIOSTRO, fontSize: fs * 0.4, letterSpacing: -1 }}>{resto}</span>
          </div>
        );
      })}
    </div>
  );
};

const Contatore: React.FC<{ o: Oggetto; t: number }> = ({ o, t }) => {
  const k = 1 - Math.pow(1 - clamp01((t - (o.t0 ?? 0)) / Math.max(0.2, (o.t1 ?? 1) - (o.t0 ?? 0))), 3);
  const v = Math.round((o.valore || 0) * k).toLocaleString('it-IT');
  return (
    <div style={{ ...carta(o), display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: o.w * 0.15, color: INCHIOSTRO, letterSpacing: -3, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
      {o.sotto ? <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: o.w * 0.075, color: ROSSO, marginTop: o.h * 0.04, letterSpacing: 6 }}>{o.sotto}</div> : null}
    </div>
  );
};

const Contenuto: React.FC<{ o: Oggetto; t: number }> = ({ o, t }) => {
  const titolo = testoScritto(o, t);
  switch (o.tipo) {
    case 'foto':
      return (
        <div style={{ width: '100%', height: '100%', background: '#FBFAF7', padding: '4% 4% 16%', boxSizing: 'border-box', position: 'relative' }}>
          {/* foto vere a tutta cornice; loghi e schemi (png, svg, webp) interi, su carta */}
          {o.foto ? <Img src={staticFile(o.foto)} style={{ width: '100%', height: '100%', objectFit: /\.(png|svg|webp)$/i.test(o.foto) ? 'contain' : 'cover', background: '#FBFAF7', filter: 'contrast(1.05) saturate(0.85) sepia(0.12)' }} /> : null}
          {o.sotto ? <div style={{ position: 'absolute', left: 0, right: 0, bottom: '3%', textAlign: 'center', fontFamily: MANO, fontWeight: 700, fontSize: o.h * 0.085, color: INCHIOSTRO }}>{o.sotto}</div> : null}
        </div>
      );
    case 'documento':
      return (
        <div style={carta(o)}>
          {o.foto ? (
            <Img src={staticFile(o.foto)} style={{ position: 'absolute', left: '6%', top: '5%', width: '88%', height: o.titolo ? '62%' : '90%', objectFit: 'contain', objectPosition: 'top', filter: 'grayscale(0.25) contrast(1.05)', mixBlendMode: 'multiply' }} />
          ) : null}
          {o.sotto ? <div style={{ position: 'absolute', left: '8%', top: o.foto ? '70%' : '7%', fontFamily: SANS, fontWeight: 700, fontSize: o.w * 0.05, letterSpacing: 4, color: '#8A8273' }}>{o.sotto}</div> : null}
          {titolo ? <div style={{ position: 'absolute', left: '8%', right: '8%', top: o.foto ? '76%' : '16%', fontFamily: SANS, fontWeight: 900, fontSize: o.w * 0.1, lineHeight: 1.02, color: INCHIOSTRO, letterSpacing: -2 }}>{titolo}</div> : null}
          {!o.foto ? <Righe n={o.righe ?? 6} da={52} /> : null}
        </div>
      );
    case 'parola':
      return (
        <div style={{ width: '100%', height: '100%', background: '#F4F0E6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: Math.min(o.h * 0.56, (o.w * 0.9) / Math.max(1, titolo.length * 0.62)), letterSpacing: -3, color: INCHIOSTRO, whiteSpace: 'nowrap' }}>{titolo}</div>
        </div>
      );
    case 'cartellino':
      return (
        <div style={{ width: '100%', height: '100%', position: 'relative' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg,#FFF7E3,#F2E3BE)', clipPath: 'polygon(12% 0, 100% 0, 100% 100%, 12% 100%, 0 50%)' }} />
          <div style={{ position: 'absolute', left: '5%', top: '44%', width: o.h * 0.12, height: o.h * 0.12, borderRadius: '50%', background: '#2a2622' }} />
          <div style={{ position: 'absolute', left: '17%', right: '4%', top: 0, bottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: Math.min(o.h * 0.5, (o.w * 0.78) / Math.max(1, titolo.length * 0.6)), color: INCHIOSTRO, letterSpacing: -3, lineHeight: 1 }}>{titolo}</div>
            {o.sotto ? <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: o.h * 0.13, color: '#6E6457', marginTop: o.h * 0.04 }}>{o.sotto}</div> : null}
          </div>
        </div>
      );
    case 'tu': {
      const vivo = (o.vivo || []).some(([a, b]) => t >= a - 1.2 && t <= b + 1.2);
      const b = `${BORDO_TU * 100}%`;
      return (
        <div style={{ width: '100%', height: '100%', background: '#FBFAF7', position: 'relative' }}>
          <div style={{ position: 'absolute', left: b, right: b, top: b, bottom: b, overflow: 'hidden', background: '#111' }}>
            {vivo && o.video ? <OffthreadVideo src={staticFile(o.video)} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : o.fermo ? <Img src={staticFile(o.fermo)} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'grayscale(0.4)' }} /> : null}
          </div>
        </div>
      );
    }
    case 'frase': return <Frase o={o} t={t} />;
    case 'curva': return <Curva o={o} t={t} />;
    case 'acronimo': return <Acronimo o={o} t={t} />;
    case 'contatore': return <Contatore o={o} t={t} />;
    default: return null;
  }
};

// cade sulla scrivania: da più grande e alto (ombra larga) a posato, con un piccolo assestamento
const Fisico: React.FC<{ o: Oggetto; t: number; fps: number; frame: number; luce: number; children: React.ReactNode }> = ({ o, t, fps, frame, luce, children }) => {
  const p = spring({ frame: frame - Math.round(o.entra * fps), fps, config: { damping: 16, stiffness: 110, mass: 1.1 } });
  if (t < o.entra - 0.02) return null;
  const alto = 1 - p;
  return (
    <div style={{
      position: 'absolute', left: o.x, top: o.y, width: o.w, height: o.h,
      transform: `translate(${-alto * 40}px, ${-alto * 120}px) rotate(${(o.rot || 0) + alto * 5}deg) scale(${1 + alto * 0.18})`,
      opacity: Math.min(1, p * 3),
      boxShadow: `${8 + alto * 30}px ${14 + alto * 60}px ${10 + 70 * alto}px rgba(0,0,0,${0.5 - alto * 0.15})`,
      filter: luce < 0.999 ? `brightness(${0.42 + 0.58 * luce}) saturate(${0.35 + 0.65 * luce})` : undefined,
    }}>
      {children}
    </div>
  );
};

// ---------- eventi sulla parola ----------
const centro = (o: Oggetto) => ({ x: o.x + o.w / 2, y: o.y + o.h / 2 });
const Cerchio: React.FC<{ e: Extract<Evento, { tipo: 'cerchio' }>; o: Oggetto; t: number }> = ({ e, o, t }) => {
  const p = liscio((t - e.t) / 0.55);
  const via = 1 - liscio((t - e.t - 4) / 0.6);
  if (t < e.t || via <= 0) return null;
  const rx = e.rx ?? o.w * 0.6, ry = e.ry ?? o.h * 0.2;
  const cx = centro(o).x + (e.dx || 0), cy = centro(o).y + (e.dy || 0);
  const punti = Array.from({ length: 80 }, (_, i) => {
    const a = -Math.PI * 0.6 + (i / 79) * Math.PI * 2.25;
    const r = 1 + 0.035 * Math.sin(a * 3 + 1);
    return `${cx + Math.cos(a) * rx * r},${cy + Math.sin(a) * ry * r * (1 + i / 900)}`;
  });
  const lun = 2.25 * Math.PI * Math.sqrt((rx * rx + ry * ry) / 2);
  return (
    <svg style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }} width={1} height={1}>
      <polyline points={punti.join(' ')} fill="none" stroke={ROSSO} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={lun} strokeDashoffset={lun * (1 - p)} opacity={0.92 * via} />
    </svg>
  );
};
const Timbro: React.FC<{ e: Extract<Evento, { tipo: 'timbro' }>; o: Oggetto; t: number; fps: number }> = ({ e, o, t, fps }) => {
  if (t < e.t) return null;
  const f = (t - e.t) * fps;
  const s = f < 4 ? interpolate(f, [0, 4], [2.2, 0.96]) : interpolate(f, [4, 8], [0.96, 1], { extrapolateRight: 'clamp' });
  const size = e.size || o.w * 0.14;
  return (
    <div style={{ position: 'absolute', left: centro(o).x + (e.dx || 0), top: centro(o).y + (e.dy || 0), transform: `translate(-50%,-50%) rotate(-9deg) scale(${s})`,
      opacity: Math.min(1, f / 2) * 0.88, border: `${Math.round(size / 11)}px solid ${ROSSO}`, borderRadius: size * 0.12, padding: `${size * 0.06}px ${size * 0.24}px`,
      fontFamily: SANS, fontWeight: 900, fontSize: size, color: ROSSO, letterSpacing: 4, whiteSpace: 'nowrap', background: 'rgba(246,241,232,0.55)' }}>
      {e.testo}
    </div>
  );
};
const Barra: React.FC<{ e: Extract<Evento, { tipo: 'barra' }>; o: Oggetto; t: number }> = ({ e, o, t }) => {
  if (t < e.t) return null;
  const p = liscio((t - e.t) / 0.35);
  return <div style={{ position: 'absolute', left: o.x + o.w * 0.06, top: o.y + o.h * 0.5 + (e.dy || 0), width: o.w * 0.88 * p, height: 22, borderRadius: 11, background: ROSSO, transform: 'rotate(-6deg)', transformOrigin: '0 50%', opacity: 0.92 }} />;
};
const Fili: React.FC<{ e: Extract<Evento, { tipo: 'fili' }>; da: Oggetto; verso: Oggetto[]; t: number }> = ({ e, da, verso, t }) => {
  if (t < e.t) return null;
  const a = centro(da);
  return (
    <svg style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }} width={1} height={1}>
      {verso.map((o, i) => {
        const k = liscio((t - e.t - i * (e.passo ?? 0.25)) / 0.6);
        if (k <= 0) return null;
        const b = centro(o);
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 + Math.hypot(b.x - a.x, b.y - a.y) * 0.08;
        const lun = Math.hypot(b.x - a.x, b.y - a.y) * 1.1;
        return (
          <g key={o.id}>
            <path d={`M${a.x},${a.y} Q${mx},${my} ${b.x},${b.y}`} fill="none" stroke={ROSSO} strokeWidth={10} strokeLinecap="round" strokeDasharray={lun} strokeDashoffset={lun * (1 - k)} opacity={0.9} />
            <circle cx={b.x} cy={b.y} r={22 * k} fill={ROSSO} />
          </g>
        );
      })}
      <circle cx={a.x} cy={a.y} r={26} fill={ROSSO} />
    </svg>
  );
};

// ---------- mondo ----------
const Fondo: React.FC<{ w: number; h: number; tema: PropsDocumentario['mondo']['tema'] }> = ({ w, h, tema }) => {
  const base = { position: 'absolute' as const, left: -4000, top: -4000, width: w + 8000, height: h + 8000 };
  if (tema === 'bacheca') return <div style={{ ...base, background: '#6B4A2E', backgroundImage: 'radial-gradient(rgba(0,0,0,0.18) 1.5px, transparent 2px), radial-gradient(rgba(255,220,170,0.08) 1px, transparent 2px)', backgroundSize: '9px 9px, 13px 13px' }} />;
  return (
    <div style={{ ...base, background: tema === 'mappa' ? '#17242A' : '#1B1D22', backgroundImage: [
      'radial-gradient(ellipse at 30% 40%, rgba(255,214,160,0.05), transparent 55%)',
      'repeating-linear-gradient(93deg, rgba(255,255,255,0.012) 0 3px, rgba(0,0,0,0.02) 3px 9px)',
      'repeating-linear-gradient(2deg, rgba(255,255,255,0.01) 0 40px, rgba(0,0,0,0.025) 40px 120px)',
    ].join(',') }} />
  );
};

export const Documentario: React.FC<PropsDocumentario> = (props) => {
  const frame = useCurrentFrame();
  const { fps, width: W, height: H } = useVideoConfig();
  const t = frame / fps;
  const cam = camera(props.camera, t);
  const prima = camera(props.camera, Math.max(0, t - 1 / fps));
  const scala = (W / props.vista) * cam.z;
  const vel = Math.hypot(cam.x - prima.x, cam.y - prima.y) * scala + Math.abs(Math.log(cam.z / prima.z)) * W * 0.5;
  const sfoca = Math.min(8, Math.max(0, (vel - 6) * 0.12));
  const m = mano(t);
  const timbro = props.eventi.find((e) => e.tipo === 'timbro' && t >= e.t && t < e.t + 0.3);
  const colpo = timbro ? Math.sin(frame * 2.7) * 8 * (1 - (t - timbro.t) / 0.3) : 0;
  const oggetti = new Map(props.oggetti.map((o) => [o.id, o]));
  const eroi = props.oggetti.map((o) => eroeDi(o, t));
  const qualcuno = Math.max(0, ...eroi);
  // quanto il video di Denis riempie lo schermo (0 = lontano, 1 = pieno): alone, vignettatura e grana si ritirano
  const pieno = Math.max(0, ...props.oggetti.filter((o) => o.tipo === 'tu').map((o) => clamp01(((o.w * (1 - 2 * BORDO_TU) * scala) / W - 0.7) / 0.28)));

  return (
    <AbsoluteFill style={{ backgroundColor: '#0E0F12', overflow: 'hidden' }}>
      <AbsoluteFill style={{ filter: sfoca > 0.3 ? `blur(${sfoca.toFixed(2)}px)` : undefined }}>
        <div style={{ position: 'absolute', left: 0, top: 0, width: props.mondo.w, height: props.mondo.h, transformOrigin: '0 0',
          transform: `translate(${W / 2 + m.dx * (1 - pieno) + colpo}px, ${H / 2 + m.dy * (1 - pieno)}px) rotate(${cam.r + m.dr * (1 - pieno)}deg) scale(${scala}) translate(${-cam.x}px, ${-cam.y}px)` }}>
          <Fondo w={props.mondo.w} h={props.mondo.h} tema={props.mondo.tema} />
          {props.oggetti.map((o, i) => (
            <Fisico key={o.id} o={o} t={t} fps={fps} frame={frame} luce={o.tipo === 'tu' && eroi[i] > 0 ? 1 : 1 - qualcuno * (1 - eroi[i]) * 0.72}>
              <Contenuto o={o} t={t} />
            </Fisico>
          ))}
          {props.eventi.map((e, i) => {
            const o = oggetti.get(e.oggetto);
            if (!o) return null;
            if (e.tipo === 'cerchio') return <Cerchio key={i} e={e} o={o} t={t} />;
            if (e.tipo === 'timbro') return <Timbro key={i} e={e} o={o} t={t} fps={fps} />;
            if (e.tipo === 'fili') return <Fili key={i} e={e} da={o} verso={e.verso.map((v) => oggetti.get(v)).filter(Boolean) as Oggetto[]} t={t} />;
            return <Barra key={i} e={e} o={o} t={t} />;
          })}
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 46%, rgba(255,214,170,0.10), transparent 70%)', mixBlendMode: 'screen', opacity: 1 - pieno }} />
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 95% 75% at 50% 50%, transparent 55%, rgba(0,0,0,0.62) 100%)', opacity: 1 - 0.65 * pieno }} />
      <AbsoluteFill style={{ backgroundImage: `url(${staticFile('racconto/grana.png')})`, backgroundSize: '512px 512px',
        backgroundPosition: `${Math.floor(random(`g${frame}`) * 512)}px ${Math.floor(random(`h${frame}`) * 512)}px`, opacity: 0.11 * (1 - 0.5 * pieno), mixBlendMode: 'overlay' }} />
      {props.voce ? <Audio src={staticFile(props.voce)} /> : null}
    </AbsoluteFill>
  );
};

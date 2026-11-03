import React from 'react';
import { AbsoluteFill, Audio, Img, interpolate, random, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { loadFont as inter } from '@remotion/google-fonts/Inter';
import { loadFont as caveat } from '@remotion/google-fonts/Caveat';
import { Chiave, Evento, Oggetto, Racconto as Props, VISTA } from './tipi';

// Un solo piano sequenza su una scrivania scura: la camera scivola, si avvicina ai dettagli, si
// allontana per viaggiare e rientra. Mai tagli, mai fermi: tra due chiavi la velocità è continua
// (Hermite con tangenti sul tempo) e nelle pause la camera continua a scivolare piano.
// Sopra: mano libera leggera, sfocatura nei movimenti veloci, grana, alone e vignettatura.

const { fontFamily: SANS } = inter('normal', { weights: ['500', '700', '900'], subsets: ['latin'] });
const { fontFamily: MANO } = caveat('normal', { weights: ['700'], subsets: ['latin'] });

const CARTA = '#EFEADF';
const INCHIOSTRO = '#16161A';
const ROSSO = '#E0342A';
const GRIGIO_RIGHE = '#CBC4B6';

const liscio = (x: number) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };

// ---------- camera ----------
type Stato = { x: number; y: number; z: number; r: number };
function camera(chiavi: Chiave[], t: number): Stato {
  const k = chiavi;
  if (t <= k[0].t) return { x: k[0].x, y: k[0].y, z: k[0].zoom, r: k[0].rot || 0 };
  if (t >= k[k.length - 1].t) { const u = k[k.length - 1]; return { x: u.x, y: u.y, z: u.zoom, r: u.rot || 0 }; }
  let i = 0;
  while (k[i + 1].t < t) i++;
  const a = k[i], b = k[i + 1];
  const h = b.t - a.t;
  const s = (t - a.t) / h;
  // tangenti sul tempo (differenze centrate): velocità continua, nessuno scatto alle chiavi
  const tang = (j: number, f: (c: Chiave) => number) => {
    const p = k[Math.max(0, j - 1)], n = k[Math.min(k.length - 1, j + 1)];
    return n.t === p.t ? 0 : (f(n) - f(p)) / (n.t - p.t);
  };
  const herm = (f: (c: Chiave) => number) => {
    const p0 = f(a), p1 = f(b), m0 = tang(i, f) * h, m1 = tang(i + 1, f) * h;
    const s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * p0 + (s3 - 2 * s2 + s) * m0 + (-2 * s3 + 3 * s2) * p1 + (s3 - s2) * m1;
  };
  return { x: herm((c) => c.x), y: herm((c) => c.y), z: Math.exp(herm((c) => Math.log(c.zoom))), r: herm((c) => c.rot || 0) };
}

// mano libera: somma di seni lenti, ampiezza fissa sullo schermo (non cresce con lo zoom)
function mano(t: number) {
  const n = (f: number, ph: number) => Math.sin(t * f + ph);
  return { dx: 5 * n(0.7, 1) + 3 * n(1.9, 4) + 1.2 * n(4.3, 2), dy: 4 * n(0.9, 3) + 2.5 * n(2.3, 0) + 1 * n(5.1, 5), dr: 0.12 * n(0.5, 2) + 0.05 * n(1.7, 1) };
}

// ---------- protagonista ----------
const eroeDi = (o: Oggetto, t: number) => Math.max(0, ...(o.eroe || []).map(([a, b]) => Math.min(liscio((t - a + 0.35) / 0.5), liscio((b - t + 0.35) / 0.5))));

// ---------- oggetti ----------
const Righe: React.FC<{ n: number; da: number }> = ({ n, da }) => (
  <div style={{ position: 'absolute', left: '9%', right: '9%', top: `${da}%`, bottom: '7%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
    {Array.from({ length: n }, (_, i) => (
      <div key={i} style={{ height: 10, borderRadius: 5, background: GRIGIO_RIGHE, width: `${[100, 94, 98, 72, 96, 88, 60][i % 7]}%` }} />
    ))}
  </div>
);

const testoScritto = (o: Oggetto, t: number) => {
  if (!o.titolo) return '';
  if (!o.scrivi) return o.titolo;
  const [a, b] = o.scrivi;
  return o.titolo.slice(0, Math.round(o.titolo.length * liscio((t - a) / Math.max(0.1, b - a))));
};

const Contenuto: React.FC<{ o: Oggetto; t: number }> = ({ o, t }) => {
  const titolo = testoScritto(o, t);
  switch (o.tipo) {
    case 'foto':
      return (
        <div style={{ width: '100%', height: '100%', background: '#FBFAF7', padding: '3.5% 3.5% 15%', boxSizing: 'border-box', position: 'relative' }}>
          {o.foto ? <Img src={staticFile(o.foto)} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'contrast(1.05) saturate(0.9)' }} />
            : <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,#5b6470,#2c3138)' }} />}
          {o.sotto ? <div style={{ position: 'absolute', left: 0, right: 0, bottom: '2%', textAlign: 'center', fontFamily: MANO, fontWeight: 700, fontSize: o.h * 0.085, color: INCHIOSTRO }}>{o.sotto}</div> : null}
        </div>
      );
    case 'documento':
      return (
        <div style={{ width: '100%', height: '100%', background: `linear-gradient(170deg, #F6F2EA, ${CARTA} 60%, #E6DFD2)`, position: 'relative', overflow: 'hidden' }}>
          {o.sotto ? <div style={{ position: 'absolute', left: '9%', top: '7%', fontFamily: SANS, fontWeight: 700, fontSize: o.w * 0.045, letterSpacing: 4, color: '#8A8273' }}>{o.sotto}</div> : null}
          <div style={{ position: 'absolute', left: '9%', right: '9%', top: o.sotto ? '15%' : '9%', fontFamily: SANS, fontWeight: 900, fontSize: o.w * 0.11, lineHeight: 1.02, color: INCHIOSTRO, letterSpacing: -2 }}>{titolo}</div>
          <Righe n={o.righe ?? 6} da={o.sotto ? 52 : 46} />
        </div>
      );
    case 'parola':
      return (
        <div style={{ width: '100%', height: '100%', background: '#F4F0E6', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 0 0 3px rgba(0,0,0,0.04)' }}>
          <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: o.h * 0.56, letterSpacing: -3, color: o.colore || INCHIOSTRO, whiteSpace: 'nowrap' }}>{titolo}</div>
        </div>
      );
    case 'scheda':
      return (
        <div style={{ width: '100%', height: '100%', background: '#FFFEFA', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', left: 0, right: 0, top: '18%', height: 4, background: '#E86A6A' }} />
          {[1, 2, 3, 4, 5].map((i) => <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: `${18 + i * 14}%`, height: 2, background: '#BFD3E6' }} />)}
          {o.sotto ? <div style={{ position: 'absolute', left: '7%', top: '5%', fontFamily: MANO, fontWeight: 700, fontSize: o.h * 0.1, color: '#6B6B6B' }}>{o.sotto}</div> : null}
          <div style={{ position: 'absolute', left: '7%', right: '7%', top: '30%', fontFamily: SANS, fontWeight: 900, fontSize: o.w * 0.1, lineHeight: 1.05, color: INCHIOSTRO, letterSpacing: -2 }}>{titolo}</div>
        </div>
      );
    case 'cartellino':
      return (
        <div style={{ width: '100%', height: '100%', position: 'relative' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg,#FFF7E3,#F2E3BE)', clipPath: 'polygon(14% 0, 100% 0, 100% 100%, 14% 100%, 0 50%)' }} />
          <div style={{ position: 'absolute', left: '7%', top: '43%', width: o.h * 0.14, height: o.h * 0.14, borderRadius: '50%', background: '#2a2622' }} />
          <div style={{ position: 'absolute', left: '20%', right: '5%', top: 0, bottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: o.h * 0.42, color: INCHIOSTRO, letterSpacing: -3, lineHeight: 1 }}>{titolo}</div>
            {o.sotto ? <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: o.h * 0.13, color: '#6E6457', marginTop: o.h * 0.04 }}>{o.sotto}</div> : null}
          </div>
        </div>
      );
    case 'pc':
      // il mini PC visto dall'alto: alluminio champagne, griglia di fori, scritta incisa
      return (
        <div style={{ width: '100%', height: '100%', borderRadius: o.w * 0.08, background: 'linear-gradient(145deg,#E9D9B5,#BFA474 55%,#9C8457)', position: 'relative', overflow: 'hidden',
          boxShadow: 'inset 0 4px 10px rgba(255,255,255,0.45), inset 0 -8px 18px rgba(0,0,0,0.25)' }}>
          <div style={{ position: 'absolute', inset: '12%', borderRadius: o.w * 0.05, backgroundImage: 'radial-gradient(circle, rgba(40,30,15,0.55) 26%, transparent 30%)', backgroundSize: `${o.w * 0.045}px ${o.w * 0.045}px`, opacity: 0.8 }} />
          {titolo ? <div style={{ position: 'absolute', left: 0, right: 0, bottom: '5%', textAlign: 'center', fontFamily: SANS, fontWeight: 900, fontSize: o.w * 0.1, color: 'rgba(55,40,15,0.88)', letterSpacing: 4 }}>{titolo}</div> : null}
        </div>
      );
    case 'badge':
      return (
        <div style={{ width: '100%', height: '100%', background: '#FFFFFF', borderRadius: o.w * 0.06, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '22%', background: '#2F6FE4' }} />
          <div style={{ position: 'absolute', left: '50%', top: '30%', width: o.w * 0.36, height: o.w * 0.36, marginLeft: -o.w * 0.18, borderRadius: '50%', background: '#D9DDE3' }} />
          <div style={{ position: 'absolute', left: '50%', top: '30%', width: o.w * 0.16, height: o.w * 0.16, marginLeft: -o.w * 0.08, marginTop: o.w * 0.05, borderRadius: '50%', background: '#AEB5BF' }} />
          <div style={{ position: 'absolute', left: '6%', right: '6%', top: '64%', textAlign: 'center', fontFamily: SANS, fontWeight: 900, fontSize: o.w * 0.15, color: INCHIOSTRO, lineHeight: 1.0, letterSpacing: -2 }}>{titolo}</div>
        </div>
      );
    case 'linea': {
      const tacche = o.tacche || [];
      return (
        <div style={{ width: '100%', height: '100%', background: '#F4EEDF', position: 'relative' }}>
          <div style={{ position: 'absolute', left: '4%', right: '4%', top: '38%', height: 6, background: INCHIOSTRO }} />
          {tacche.map((x, i) => (
            <div key={i} style={{ position: 'absolute', left: `${4 + 92 * x.frazione}%`, top: '24%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ width: 6, height: o.h * 0.28, background: INCHIOSTRO }} />
              <div style={{ marginTop: o.h * 0.06, fontFamily: SANS, fontWeight: 900, fontSize: o.h * 0.26, color: INCHIOSTRO, whiteSpace: 'nowrap' }}>{x.etichetta}</div>
            </div>
          ))}
        </div>
      );
    }
    default:
      return null;
  }
};

// cade sulla scrivania: da più grande e alto (ombra larga) a posato (ombra corta), con un piccolo assestamento
const Fisico: React.FC<{ o: Oggetto; t: number; fps: number; frame: number; luce: number; children: React.ReactNode }> = ({ o, t, fps, frame, luce, children }) => {
  const p = spring({ frame: frame - Math.round(o.entra * fps), fps, config: { damping: 16, stiffness: 110, mass: 1.1 } });
  if (t < o.entra - 0.02) return null;
  const alto = 1 - p;
  const ombra = 10 + 70 * alto;
  return (
    <div style={{
      position: 'absolute', left: o.x, top: o.y, width: o.w, height: o.h,
      transform: `translate(${-alto * 40}px, ${-alto * 120}px) rotate(${(o.rot || 0) + alto * 5}deg) scale(${1 + alto * 0.18})`,
      opacity: Math.min(1, p * 3),
      boxShadow: `${8 + alto * 30}px ${14 + alto * 60}px ${ombra}px rgba(0,0,0,${0.45 - alto * 0.15})`,
      filter: luce < 0.999 ? `brightness(${0.45 + 0.55 * luce}) saturate(${0.35 + 0.65 * luce})` : undefined,
    }}>
      {children}
    </div>
  );
};

// ---------- eventi sulla parola ----------
const Cerchio: React.FC<{ e: Extract<Evento, { tipo: 'cerchio' }>; o: Oggetto; t: number }> = ({ e, o, t }) => {
  const p = liscio((t - e.t) / 0.55);
  // dopo 3 s il segno se ne va: tornando su un oggetto non si accumulano cerchi vecchi
  const via = 1 - liscio((t - e.t - 3) / 0.6);
  if (t < e.t || via <= 0) return null;
  const rx = e.rx ?? o.w * 0.62, ry = e.ry ?? o.h * 0.62;
  const cx = o.x + o.w / 2 + (e.dx || 0), cy = o.y + o.h / 2 + (e.dy || 0);
  // ellisse fatta a mano: un giro e un pezzetto, leggermente storta
  const punti = Array.from({ length: 80 }, (_, i) => {
    const a = -Math.PI * 0.6 + (i / 79) * Math.PI * 2.25;
    const r = 1 + 0.035 * Math.sin(a * 3 + 1);
    return `${cx + Math.cos(a) * rx * r},${cy + Math.sin(a) * ry * r * (1 + i / 900)}`;
  });
  const lun = 2.25 * Math.PI * Math.sqrt((rx * rx + ry * ry) / 2);
  return (
    <svg style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }} width={1} height={1}>
      <polyline points={punti.join(' ')} fill="none" stroke={ROSSO} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray={lun} strokeDashoffset={lun * (1 - p)} opacity={0.92 * via} />
    </svg>
  );
};

const Timbro: React.FC<{ e: Extract<Evento, { tipo: 'timbro' }>; o: Oggetto; t: number; fps: number }> = ({ e, o, t, fps }) => {
  if (t < e.t) return null;
  const f = (t - e.t) * fps;
  const s = f < 4 ? interpolate(f, [0, 4], [2.2, 0.96]) : interpolate(f, [4, 8], [0.96, 1], { extrapolateRight: 'clamp' });
  const col = e.colore || ROSSO;
  return (
    <div style={{ position: 'absolute', left: o.x + o.w / 2 + (e.dx || 0), top: o.y + o.h / 2 + (e.dy || 0), transform: `translate(-50%,-50%) rotate(-9deg) scale(${s})`,
      opacity: Math.min(1, f / 2) * 0.9, border: `12px solid ${col}`, borderRadius: 18, padding: '10px 36px', fontFamily: SANS, fontWeight: 900, fontSize: 150, color: col,
      letterSpacing: 4, whiteSpace: 'nowrap', ...(e.size ? { fontSize: e.size, borderWidth: Math.round(e.size / 12) } : {}) }}>
      {e.testo}
    </div>
  );
};

const Barra: React.FC<{ e: Extract<Evento, { tipo: 'barra' }>; o: Oggetto; t: number }> = ({ e, o, t }) => {
  if (t < e.t) return null;
  const p = liscio((t - e.t) / 0.35);
  return <div style={{ position: 'absolute', left: o.x + o.w * 0.06, top: o.y + o.h * 0.5 + (e.dy || 0), width: o.w * 0.88 * p, height: 16, borderRadius: 8, background: ROSSO, transform: 'rotate(-3deg)', opacity: 0.92 }} />;
};

// ---------- scrivania ----------
const Scrivania: React.FC<{ w: number; h: number }> = ({ w, h }) => (
  <div style={{ position: 'absolute', left: -1500, top: -1500, width: w + 3000, height: h + 3000,
    background: '#1B1D22', backgroundImage: [
      'radial-gradient(ellipse at 30% 40%, rgba(255,214,160,0.05), transparent 55%)',
      'repeating-linear-gradient(93deg, rgba(255,255,255,0.012) 0 3px, rgba(0,0,0,0.02) 3px 9px)',
      'repeating-linear-gradient(2deg, rgba(255,255,255,0.01) 0 40px, rgba(0,0,0,0.025) 40px 120px)',
    ].join(',') }} />
);

export const Racconto: React.FC<Props> = (props) => {
  const frame = useCurrentFrame();
  const { fps, width: W, height: H } = useVideoConfig();
  const t = frame / fps;
  const cam = camera(props.camera, t);
  // velocità sullo schermo per la sfocatura dei movimenti veloci
  const prima = camera(props.camera, Math.max(0, t - 1 / fps));
  const scala = (W / VISTA) * cam.z;
  const vel = Math.hypot(cam.x - prima.x, cam.y - prima.y) * scala + Math.abs(Math.log(cam.z / prima.z)) * W * 0.5;
  const sfoca = Math.min(7, Math.max(0, (vel - 6) * 0.12));
  const m = mano(t);
  // colpo dei timbri: la camera vibra un attimo
  const timbro = props.eventi.find((e) => e.tipo === 'timbro' && t >= e.t && t < e.t + 0.3);
  const colpo = timbro ? Math.sin(frame * 2.7) * 9 * (1 - (t - timbro.t) / 0.3) : 0;
  const oggetti = new Map(props.oggetti.map((o) => [o.id, o]));
  const eroi = props.oggetti.map((o) => eroeDi(o, t));
  const qualcuno = Math.max(0, ...eroi);

  return (
    <AbsoluteFill style={{ backgroundColor: '#0E0F12', overflow: 'hidden' }}>
      <AbsoluteFill style={{ filter: sfoca > 0.3 ? `blur(${sfoca.toFixed(2)}px)` : undefined }}>
        <div style={{ position: 'absolute', left: 0, top: 0, width: props.mondo.w, height: props.mondo.h, transformOrigin: '0 0',
          transform: `translate(${W / 2 + m.dx + colpo}px, ${H / 2 + m.dy}px) rotate(${cam.r + m.dr}deg) scale(${scala}) translate(${-cam.x}px, ${-cam.y}px)` }}>
          <Scrivania w={props.mondo.w} h={props.mondo.h} />
          {props.oggetti.map((o, i) => {
            const luce = 1 - qualcuno * (1 - eroi[i]) * 0.7;
            return (
              <Fisico key={o.id} o={o} t={t} fps={fps} frame={frame} luce={luce}>
                <Contenuto o={o} t={t} />
              </Fisico>
            );
          })}
          {props.eventi.map((e, i) => {
            const o = oggetti.get(e.oggetto);
            if (!o) return null;
            if (e.tipo === 'cerchio') return <Cerchio key={i} e={e} o={o} t={t} />;
            if (e.tipo === 'timbro') return <Timbro key={i} e={e} o={o} t={t} fps={fps} />;
            return <Barra key={i} e={e} o={o} t={t} />;
          })}
        </div>
      </AbsoluteFill>
      {/* luce calda della lampada al centro, alone morbido e vignettatura */}
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 60% 75% at 50% 46%, rgba(255,214,170,0.10), transparent 70%)', mixBlendMode: 'screen' }} />
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 75% 95% at 50% 50%, transparent 55%, rgba(0,0,0,0.62) 100%)' }} />
      {/* grana: tessera di rumore spostata a ogni fotogramma */}
      <AbsoluteFill style={{ backgroundImage: `url(${staticFile('racconto/grana.png')})`, backgroundSize: '512px 512px',
        backgroundPosition: `${Math.floor(random(`g${frame}`) * 512)}px ${Math.floor(random(`h${frame}`) * 512)}px`, opacity: 0.11, mixBlendMode: 'overlay' }} />
      {props.audio ? <Audio src={staticFile(props.audio)} /> : null}
    </AbsoluteFill>
  );
};

// Stile "Redazione": livello grafico trasparente da mettere sopra un video di opinione su un fatto di cronaca
// (prima prova: Cracovia, 08/11/2026). Ritagli di giornale veri, macchina da scrivere, pennarello rosso, etichette,
// citazioni, cartello finale. Bianco/nero/carta + un solo rosso cronaca. Le grafiche stanno nella fascia alta (sopra
// la testa) o in quella bassa (sul busto), mai sul viso.
// Props: { durata, fps, cartella, elementi: [...] } scritte da pc/locale/redazione.mjs.
import React from 'react';
import { AbsoluteFill, Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { loadFont as inter } from '@remotion/google-fonts/Inter';
import { loadFont as courier } from '@remotion/google-fonts/CourierPrime';
import { loadFont as caveat } from '@remotion/google-fonts/Caveat';

const { fontFamily: SANS } = inter('normal', { weights: ['500', '700', '900'], subsets: ['latin', 'latin-ext'] });
const { fontFamily: MACCHINA } = courier('normal', { weights: ['400', '700'], subsets: ['latin', 'latin-ext'] });
const { fontFamily: MANO } = caveat('normal', { weights: ['700'], subsets: ['latin', 'latin-ext'] });

const ROSSO = '#D8322A', CARTA = '#F2EEE6', INCHIOSTRO = '#141416';
// fasce (frazioni dell'altezza): sopra la testa e sul busto; il viso sta tra 0,32 e 0,52
const FASCIA = { alto: 0.05, basso: 0.58 } as const;

type Base = { da: number; a: number; zona?: 'alto' | 'basso'; y?: number };
export type Elemento = Base & (
  | { tipo: 'ritaglio'; file: string; larghezza?: number; rot?: number; aspetto?: number; cerchio?: { t: number; x0: number; y0: number; x1: number; y1: number }; fonte?: string }
  | { tipo: 'foto'; file: string; etichetta?: string }
  | { tipo: 'macchina'; righe: { testo: string; t: number; colore?: string; grande?: boolean }[] }
  | { tipo: 'etichetta'; testo: string }
  | { tipo: 'parola'; testo: string; timbro?: boolean }
  | { tipo: 'citazione'; testo: string; autore: string; parole?: number[] }
  | { tipo: 'titolo'; testo: string; t: number; sotto?: string; tSotto?: number }
  | { tipo: 'commenti'; voci: { testo: string; t: number }[]; domanda?: { t: number } }
  | { tipo: 'tris'; voci: { testo: string; t: number }[]; unione: { testo: string; t: number } }
  | { tipo: 'finale'; testo: string }
);
export type PropsRedazione = { durata: number; fps?: number; cartella: string; elementi: Elemento[] };

const clamp = (x: number) => Math.min(1, Math.max(0, x));
const fuori = Easing.bezier(0.16, 1, 0.3, 1);

// entrata (scivola dentro con una leggera rotazione, poi si assesta) e uscita (si sfila verso l'alto)
function moto(t: number, el: Base, fps: number, lato = 1) {
  const k = spring({ frame: Math.max(0, (t - el.da) * fps), fps, config: { damping: 15, stiffness: 120, mass: 0.9 } });
  const u = interpolate(t, [el.a - 0.35, el.a], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.in(Easing.cubic) });
  return { k, u, stile: { opacity: Math.min(1, k * 1.8) * (1 - u), transform: `translate(${(1 - k) * 260 * lato}px, ${-u * 120}px) rotate(${(1 - k) * 4 * lato}deg)`, filter: `blur(${(1 - Math.min(1, k * 1.4)) * 10 + u * 8}px)` } };
}
const scrivi = (testo: string, t: number, t0: number, cps = 22) => testo.slice(0, Math.max(0, Math.floor((t - t0) * cps)));

const Ritaglio: React.FC<{ el: Extract<Elemento, { tipo: 'ritaglio' }>; t: number; cartella: string }> = ({ el, t, cartella }) => {
  const { fps, width: W } = useVideoConfig();
  const { stile } = moto(t, el, fps, el.rot && el.rot < 0 ? -1 : 1);
  const w = (el.larghezza ?? 0.86) * W;
  const c = el.cerchio;
  const pc = c ? clamp((t - c.t) / 0.5) : 0;
  return (
    <div style={{ position: 'absolute', left: (W - w) / 2, top: 0, width: w, ...stile, transform: `${stile.transform} rotate(${el.rot ?? -1.5}deg)` }}>
      <div style={{ position: 'relative', background: CARTA, padding: w * 0.025, boxShadow: '0 30px 70px rgba(0,0,0,0.55), 0 6px 14px rgba(0,0,0,0.35)' }}>
        <Img src={staticFile(`${cartella}/${el.file}`)} style={{ width: '100%', display: 'block', mixBlendMode: 'multiply', filter: 'grayscale(1) contrast(1.08)' }} />  {/* solo l'immagine in bianco e nero: il pennarello resta rosso */}
        {c && t >= c.t ? (() => {
          // in pixel dell'immagine (larghezza interna × aspetto), così il tratto e la sua lunghezza sono veri
          const iw = w * 0.95, ih = iw * (el.aspetto ?? 0.5);
          const cx = ((c.x0 + c.x1) / 2) * iw, cy = ((c.y0 + c.y1) / 2) * ih, rx = ((c.x1 - c.x0) / 2) * iw + 40, ry = ((c.y1 - c.y0) / 2) * ih + 55;
          const punti = Array.from({ length: 90 }, (_, i) => {
            const a = -Math.PI * 0.62 + (i / 89) * Math.PI * 2.18;
            return `${cx + Math.cos(a) * rx * (1 + 0.025 * Math.sin(a * 3))},${cy + Math.sin(a) * ry * (1 + i / 1400)}`;
          });
          const lun = 2.18 * Math.PI * Math.sqrt((rx * rx + ry * ry) / 2) * 1.05;
          return (
            <svg width={iw} height={ih} style={{ position: 'absolute', left: w * 0.025, top: w * 0.025, overflow: 'visible' }}>
              <polyline points={punti.join(' ')} fill="none" stroke={ROSSO} strokeWidth={16} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={lun} strokeDashoffset={lun * (1 - pc)} />
            </svg>
          );
        })() : null}
      </div>
      {el.fonte ? <div style={{ marginTop: 18, fontFamily: MACCHINA, fontWeight: 700, fontSize: 46, color: '#fff', textShadow: '0 3px 12px rgba(0,0,0,0.8)', letterSpacing: 2 }}>{el.fonte}</div> : null}
    </div>
  );
};

const Foto: React.FC<{ el: Extract<Elemento, { tipo: 'foto' }>; t: number; cartella: string }> = ({ el, t, cartella }) => {
  const { fps, width: W } = useVideoConfig();
  const { stile } = moto(t, el, fps, -1);
  const zoom = 1 + 0.06 * clamp((t - el.da) / Math.max(1, el.a - el.da));
  return (
    <div style={{ position: 'absolute', left: W * 0.07, top: 0, width: W * 0.86, ...stile }}>
      <div style={{ background: '#fff', padding: 26, paddingBottom: 110, boxShadow: '0 30px 70px rgba(0,0,0,0.55)', transform: 'rotate(1.5deg)', position: 'relative' }}>
        <div style={{ width: '100%', aspectRatio: '3 / 2', overflow: 'hidden' }}>
          <Img src={staticFile(`${cartella}/${el.file}`)} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${zoom})`, filter: 'grayscale(1) contrast(1.15) brightness(0.95)' }} />
        </div>
        {el.etichetta ? <div style={{ position: 'absolute', left: 0, right: 0, bottom: 22, textAlign: 'center', fontFamily: MACCHINA, fontWeight: 700, fontSize: 64, color: INCHIOSTRO, letterSpacing: 3 }}>{el.etichetta}</div> : null}
      </div>
    </div>
  );
};

const Macchina: React.FC<{ el: Extract<Elemento, { tipo: 'macchina' }>; t: number }> = ({ el, t }) => {
  const { fps, width: W } = useVideoConfig();
  const { stile } = moto(t, el, fps);
  return (
    <div style={{ position: 'absolute', left: W * 0.07, top: 0, width: W * 0.86, ...stile, transform: stile.transform.replace(/rotate\([^)]*\)/, '') }}>
      {el.righe.map((r, i) => {
        const testo = scrivi(r.testo, t, r.t, 18);
        if (!testo) return null;
        const cursore = testo.length < r.testo.length || (t - r.t < 1.2 && Math.floor(t * 2.5) % 2 === 0);
        return (
          <div key={i} style={{ display: 'inline-block', marginBottom: 26, marginRight: '100%', background: r.grande ? INCHIOSTRO : 'rgba(20,20,22,0.82)', padding: r.grande ? '10px 34px' : '8px 26px',
            fontFamily: MACCHINA, fontWeight: 700, fontSize: r.grande ? 190 : 96, lineHeight: 1.1, color: r.colore === 'rosso' ? ROSSO : '#fff', whiteSpace: 'nowrap', letterSpacing: 2 }}>
            {testo}<span style={{ opacity: cursore ? 1 : 0, color: ROSSO }}>▌</span>
          </div>
        );
      })}
    </div>
  );
};

const Etichetta: React.FC<{ el: Extract<Elemento, { tipo: 'etichetta' }>; t: number }> = ({ el, t }) => {
  const { fps, width: W } = useVideoConfig();
  const { stile } = moto(t, el, fps, -1);
  return (
    <div style={{ position: 'absolute', left: W * 0.07, top: 0, ...stile }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 22, background: ROSSO, padding: '14px 36px', fontFamily: SANS, fontWeight: 900, fontSize: 78, color: '#fff', letterSpacing: 6, boxShadow: '0 14px 34px rgba(0,0,0,0.45)' }}>
        <span style={{ width: 22, height: 22, borderRadius: 11, background: '#fff', opacity: Math.floor(t * 2) % 2 ? 1 : 0.35 }} />{el.testo}
      </div>
    </div>
  );
};

const Parola: React.FC<{ el: Extract<Elemento, { tipo: 'parola' }>; t: number }> = ({ el, t }) => {
  const { fps, width: W } = useVideoConfig();
  const f = (t - el.da) * fps;
  const u = interpolate(t, [el.a - 0.3, el.a], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const s = el.timbro ? (f < 4 ? interpolate(f, [0, 4], [2.4, 0.95]) : interpolate(f, [4, 8], [0.95, 1], { extrapolateRight: 'clamp' })) : 1;
  return (
    <div style={{ position: 'absolute', left: 0, width: W, top: 0, textAlign: 'center', opacity: Math.min(1, f / 2) * (1 - u) }}>
      <span style={{ display: 'inline-block', transform: `rotate(-6deg) scale(${s})`, border: `16px solid ${ROSSO}`, borderRadius: 24, padding: '18px 56px', fontFamily: SANS, fontWeight: 900, fontSize: 230,
        color: ROSSO, letterSpacing: 8, background: 'rgba(242,238,230,0.92)' }}>{el.testo}</span>
    </div>
  );
};

const Citazione: React.FC<{ el: Extract<Elemento, { tipo: 'citazione' }>; t: number }> = ({ el, t }) => {
  const { fps, width: W } = useVideoConfig();
  const { stile } = moto(t, el, fps);
  const parole = el.testo.split(' ');
  return (
    <div style={{ position: 'absolute', left: W * 0.07, top: 0, width: W * 0.86, ...stile }}>
      <div style={{ background: CARTA, padding: '60px 70px', boxShadow: '0 30px 70px rgba(0,0,0,0.55)', borderLeft: `26px solid ${ROSSO}` }}>
        <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: 120, lineHeight: 1.06, color: INCHIOSTRO, letterSpacing: -2 }}>
          «{parole.map((p, i) => <span key={i} style={{ color: (el.parole || []).includes(i) ? ROSSO : INCHIOSTRO }}>{p}{i < parole.length - 1 ? ' ' : ''}</span>)}»
        </div>
        <div style={{ marginTop: 34, fontFamily: MACCHINA, fontWeight: 700, fontSize: 54, color: '#5E584D', letterSpacing: 1 }}>— {el.autore}</div>
      </div>
    </div>
  );
};

const Titolo: React.FC<{ el: Extract<Elemento, { tipo: 'titolo' }>; t: number }> = ({ el, t }) => {
  const { fps, width: W } = useVideoConfig();
  const { stile } = moto(t, el, fps);
  const testo = scrivi(el.testo, t, el.t, 14);
  return (
    <div style={{ position: 'absolute', left: W * 0.07, top: 0, width: W * 0.86, ...stile }}>
      <div style={{ background: CARTA, padding: '50px 64px', boxShadow: '0 30px 70px rgba(0,0,0,0.55)' }}>
        <div style={{ height: 14, background: INCHIOSTRO, marginBottom: 40 }} />
        <div style={{ minHeight: 230, fontFamily: 'Georgia, serif', fontWeight: 900, fontSize: 210, lineHeight: 1, color: ROSSO, letterSpacing: -4 }}>
          {testo}<span style={{ opacity: Math.floor(t * 2.5) % 2 ? 1 : 0, color: INCHIOSTRO }}>|</span>
        </div>
        {el.sotto && el.tSotto !== undefined ? <div style={{ marginTop: 26, fontFamily: 'Georgia, serif', fontSize: 74, color: '#3A3833', fontStyle: 'italic' }}>{scrivi(el.sotto, t, el.tSotto, 20)}</div> : null}
        <div style={{ marginTop: 34, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {[96, 88, 92].map((w, i) => <div key={i} style={{ height: 16, width: `${w}%`, background: '#CFC8BB', borderRadius: 8 }} />)}
        </div>
      </div>
    </div>
  );
};

const Commenti: React.FC<{ el: Extract<Elemento, { tipo: 'commenti' }>; t: number }> = ({ el, t }) => {
  const { fps, width: W } = useVideoConfig();
  const { stile } = moto(t, el, fps);
  const q = el.domanda && t >= el.domanda.t ? spring({ frame: (t - el.domanda.t) * fps, fps, config: { damping: 10, stiffness: 160 } }) : 0;
  return (
    <div style={{ position: 'absolute', left: W * 0.07, top: 0, width: W * 0.86, ...stile }}>
      <div style={{ fontFamily: MACCHINA, fontWeight: 700, fontSize: 52, color: '#fff', letterSpacing: 4, marginBottom: 22, textShadow: '0 3px 12px rgba(0,0,0,0.8)' }}>DAI COMMENTI</div>
      {el.voci.map((v, i) => {
        if (t < v.t) return null;
        const k = spring({ frame: (t - v.t) * fps, fps, config: { damping: 14, stiffness: 170 } });
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 28, background: 'rgba(250,250,250,0.96)', borderRadius: 40, padding: '30px 40px', marginBottom: 26, width: 'fit-content',
            transform: `translateX(${(1 - k) * -120}px) scale(${0.9 + 0.1 * k})`, opacity: k, boxShadow: '0 18px 40px rgba(0,0,0,0.45)', marginLeft: i * 120 }}>
            <div style={{ width: 92, height: 92, borderRadius: 46, background: '#9A9A9A', filter: 'blur(6px)' }} />
            <div>
              <div style={{ width: 230, height: 22, borderRadius: 11, background: '#BDBDBD', filter: 'blur(5px)', marginBottom: 14 }} />
              <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 92, color: INCHIOSTRO }}>{v.testo}</div>
            </div>
          </div>
        );
      })}
      {q > 0 ? <div style={{ position: 'absolute', right: 20, top: 60, fontFamily: SANS, fontWeight: 900, fontSize: 520, lineHeight: 1, color: ROSSO, transform: `scale(${q}) rotate(${(1 - q) * 30}deg)`, textShadow: '0 20px 50px rgba(0,0,0,0.5)' }}>?</div> : null}
    </div>
  );
};

const Tris: React.FC<{ el: Extract<Elemento, { tipo: 'tris' }>; t: number }> = ({ el, t }) => {
  const { fps, width: W } = useVideoConfig();
  const { stile } = moto(t, el, fps);
  const m = clamp((t - el.unione.t) / 0.45), e = fuori(m);
  return (
    <div style={{ position: 'absolute', left: W * 0.07, top: 0, width: W * 0.86, height: 900, ...stile }}>
      {el.voci.map((v, i) => {
        if (t < v.t) return null;
        const k = spring({ frame: (t - v.t) * fps, fps, config: { damping: 13, stiffness: 180 } });
        return (
          <div key={i} style={{ position: 'absolute', left: 0, top: i * 230 * (1 - e) + 230 * e, opacity: (1 - e * 0.999) * k, transform: `scale(${0.85 + 0.15 * k})`, transformOrigin: 'left center',
            background: INCHIOSTRO, border: `8px solid ${ROSSO}`, padding: '20px 40px', fontFamily: SANS, fontWeight: 900, fontSize: 110, color: '#fff', letterSpacing: 2, whiteSpace: 'nowrap' }}>{v.testo}</div>
        );
      })}
      {m > 0 ? <div style={{ position: 'absolute', left: 0, top: 230, opacity: e, transform: `scale(${0.8 + 0.2 * e})`, transformOrigin: 'left center', background: ROSSO, padding: '24px 56px',
        fontFamily: SANS, fontWeight: 900, fontSize: 170, color: '#fff', letterSpacing: 10 }}>{el.unione.testo}</div> : null}
    </div>
  );
};

const Finale: React.FC<{ el: Extract<Elemento, { tipo: 'finale' }>; t: number }> = ({ el, t }) => {
  const nero = clamp((t - el.da) / 0.5);
  const testo = scrivi(el.testo, t, el.da + 0.4, 20);
  return (
    <AbsoluteFill style={{ background: `rgba(0,0,0,${0.92 * nero})`, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 160 }}>
      <div style={{ fontFamily: 'Georgia, serif', fontSize: 150, lineHeight: 1.15, color: '#fff', textAlign: 'center' }}>{testo}<span style={{ color: ROSSO, opacity: Math.floor(t * 2.5) % 2 ? 1 : 0 }}>|</span></div>
    </AbsoluteFill>
  );
};

export const Redazione: React.FC<PropsRedazione> = ({ cartella, elementi }) => {
  const frame = useCurrentFrame();
  const { fps, height: H } = useVideoConfig();
  const t = frame / fps;
  return (
    <AbsoluteFill>
      {elementi.map((el, i) => {
        if (t < el.da - 0.05 || t > el.a + 0.05) return null;
        const top = (el.y ?? FASCIA[el.zona ?? 'alto']) * H;
        const corpo = (() => {
          switch (el.tipo) {
            case 'ritaglio': return <Ritaglio el={el} t={t} cartella={cartella} />;
            case 'foto': return <Foto el={el} t={t} cartella={cartella} />;
            case 'macchina': return <Macchina el={el} t={t} />;
            case 'etichetta': return <Etichetta el={el} t={t} />;
            case 'parola': return <Parola el={el} t={t} />;
            case 'citazione': return <Citazione el={el} t={t} />;
            case 'titolo': return <Titolo el={el} t={t} />;
            case 'commenti': return <Commenti el={el} t={t} />;
            case 'tris': return <Tris el={el} t={t} />;
            default: return null;
          }
        })();
        if (el.tipo === 'finale') return <Finale key={i} el={el} t={t} />;
        return <AbsoluteFill key={i} style={{ top, height: 'auto' }}>{corpo}</AbsoluteFill>;
      })}
    </AbsoluteFill>
  );
};

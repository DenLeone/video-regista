import React from 'react';
import { AbsoluteFill, Easing, interpolate, Sequence, useCurrentFrame } from 'remotion';
import { IconCrop, IconHandStop, IconPencil, IconPointer, IconScissors, IconTypography, IconZoomIn } from '@tabler/icons-react';
import { f, Sfx } from './comune';
import type { Piano } from './piano';

// Scheda da editor (stile «Elaborato», dal video di riferimento di Imran Edits): per 2-3 secondi il video si rimpicciolisce dentro
// una finestra bianca da programma di montaggio (barra degli strumenti a sinistra, timeline con il cursore sotto) e poi torna a
// tutto schermo. `ScalaVideo` avvolge il video; `SchedaEditorFondo` sta dietro e disegna la finestra.

// Il video dentro la finestra: 9:16, largo 760 px (1080 × 0,7037), con spazio a sinistra per gli strumenti e sotto per la timeline
const BOX = { x: 200, y: 170, w: 760 };
const SCALA = BOX.w / 1080;
const ENTRA = 10;
const ESCE = 9;

/** 0 = video a tutto schermo, 1 = video nella finestra; `fr` = fotogramma del giro, `da`/`len` = la scheda */
export const faseScheda = (fr: number, da: number, len: number) => {
  const l = fr - da;
  if (l < 0 || l > len) return 0;
  const su = interpolate(l, [0, ENTRA], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const giu = interpolate(l, [len - ESCE, len], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.in(Easing.cubic) });
  return Math.min(su, giu);
};

// pagina profilo social finta: il video diventa la miniatura al centro della griglia, poi si ingrandisce di nuovo a tutto schermo
const TESSERA = { x: 380, y: 720, w: 320 };
const SCALA_TESSERA = TESSERA.w / 1080;
const lunghezza = (dur: number) => Math.max(ENTRA + ESCE + 4, f(dur));

const fasePiano = (piano: Piano, fr: number) => {
  const e = Math.max(0, ...(piano.schedeEditor || []).map((s) => faseScheda(fr, f(s.at), lunghezza(s.dur))));
  const p = Math.max(0, ...(piano.paginaProfilo || []).map((s) => faseScheda(fr, f(s.at), lunghezza(s.dur))));
  return p > e ? { p, box: TESSERA, scala: SCALA_TESSERA, tessera: true } : { p: e, box: BOX, scala: SCALA, tessera: false };
};

export const ScalaVideo: React.FC<{ piano: Piano; children: React.ReactNode }> = ({ piano, children }) => {
  const fr = useCurrentFrame();
  const { p, box, scala, tessera } = fasePiano(piano, fr);
  if (p <= 0) return <>{children}</>;
  const s = 1 - (1 - scala) * p;
  return (
    <AbsoluteFill style={{
      transformOrigin: '0 0', transform: `translate(${(box.x * p).toFixed(2)}px, ${(box.y * p).toFixed(2)}px) scale(${s.toFixed(4)})`,
      borderRadius: (tessera ? 22 : 16) * p / s, overflow: 'hidden', boxShadow: p > 0.5 ? '0 10px 40px rgba(0,0,0,0.25)' : undefined,
    }}>
      {children}
    </AbsoluteFill>
  );
};

const STRUMENTI = [IconPointer, IconScissors, IconHandStop, IconZoomIn, IconTypography, IconPencil, IconCrop];
const PEZZI = [ // timeline finta: [da, a, colore] in % della larghezza, due piste
  [[2, 30, '#E3B341'], [33, 58, '#D9A532'], [61, 96, '#E3B341']],
  [[8, 44, '#C9CCD2'], [48, 90, '#D5D8DD']],
] as const;

const FondoScheda: React.FC<{ len: number }> = ({ len }) => {
  const fr = useCurrentFrame();
  const p = faseScheda(fr, 0, len);
  const ui = interpolate(fr, [4, 14], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) * interpolate(fr, [len - 8, len - 2], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const cursore = interpolate(fr, [ENTRA, len - ESCE], [4, 94], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const tl = { x: BOX.x, w: BOX.w, y: BOX.y + Math.round(BOX.w * 16 / 9) + 40 }; // timeline sotto il video
  return (
    <AbsoluteFill style={{ background: '#F7F7F5', opacity: Math.min(1, p * 2.2) }}>
      <div style={{ opacity: ui }}>
        {/* finestra: tre puntini */}
        <div style={{ position: 'absolute', left: BOX.x - 120, top: 80, display: 'flex', gap: 14 }}>
          {['#FF5F57', '#FEBC2E', '#28C840'].map((c) => <div key={c} style={{ width: 18, height: 18, borderRadius: 9, background: c }} />)}
        </div>
        {/* barra degli strumenti a sinistra */}
        <div style={{ position: 'absolute', left: 60, top: BOX.y + 40, width: 84, padding: '18px 0', borderRadius: 22, background: '#FFFFFF', border: '2px solid #E4E5E8',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 26, boxShadow: '0 6px 18px rgba(0,0,0,0.07)' }}>
          {STRUMENTI.map((I, i) => (
            <div key={i} style={{ width: 56, height: 56, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', background: i === 0 ? '#16181D' : 'transparent' }}>
              <I size={32} stroke={1.8} color={i === 0 ? '#FFFFFF' : '#40444C'} />
            </div>
          ))}
        </div>
        {/* controlli sottili sotto il video, poi la striscia scura del montaggio con il blocco dorato che scorre (come nel riferimento) */}
        <div style={{ position: 'absolute', left: tl.x, top: tl.y - 14, width: tl.w, height: 70, borderRadius: 10, background: '#F1F2F4', border: '2px solid #E4E5E8', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', left: 16, right: 16, top: 14, height: 4, borderRadius: 2, background: '#D5D8DD' }} />
          <div style={{ position: 'absolute', left: 16, top: 11, width: `${cursore}%`, maxWidth: 'calc(100% - 32px)', height: 10, borderRadius: 5, background: '#E3B341', opacity: 0.0 }} />
          <div style={{ position: 'absolute', left: 16, right: 16, top: 34, display: 'flex', justifyContent: 'space-between' }}>
            {Array.from({ length: 22 }).map((_, i) => <div key={i} style={{ width: 14, height: 14, borderRadius: 3, background: i % 5 === 0 ? '#9AA0AA' : '#C9CCD2' }} />)}
          </div>
          <div style={{ position: 'absolute', left: `${cursore}%`, top: 0, bottom: 0, width: 3, background: '#FF3B30' }} />
        </div>
        <div style={{ position: 'absolute', left: tl.x, top: tl.y + 64, width: tl.w, height: 96, borderRadius: 8, background: '#15120E', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', left: `${Math.max(2, Math.min(60, cursore * 0.62))}%`, top: 12, width: '34%', height: 72, borderRadius: 6,
            background: 'linear-gradient(180deg,#F0CB5A,#C99A22)', border: '2px solid #F7DE8C' }} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const SchedaEditorFondo: React.FC<{ piano: Piano; sfx?: number }> = ({ piano, sfx = 0 }) => (
  <>
    {(piano.schedeEditor || []).map((s, i) => {
      const len = lunghezza(s.dur);
      return (
        <Sequence key={`se${i}`} from={f(s.at)} durationInFrames={len}>
          <FondoScheda len={len} />
          {sfx > 0 ? <Sfx nome="whoosh" da={0} volume={0.5 * sfx} /> : null}
        </Sequence>
      );
    })}
  </>
);

// Solo per vedere la scheda (si renderizza con un entry provvisorio, vedi PROGRESSO.md)
export const ProvaScheda: React.FC = () => (
  <AbsoluteFill style={{ background: '#0B0B0B' }}>
    <SchedaEditorFondo piano={{ schedeEditor: [{ at: 0, dur: 2.4 }] } as unknown as Piano} />
    <ScalaVideo piano={{ schedeEditor: [{ at: 0, dur: 2.4 }] } as unknown as Piano}>
      <AbsoluteFill style={{ background: 'linear-gradient(160deg,#6b4a3a,#2a1d18)' }}>
        <div style={{ position: 'absolute', left: 340, top: 520, width: 400, height: 520, borderRadius: 200, background: '#caa68e' }} />
      </AbsoluteFill>
    </ScalaVideo>
  </AbsoluteFill>
);

// ---- Pagina profilo social ----
const GRIGLIA = [0, 1, 2, 3, 4, 5, 6, 7, 8];
const COLORI = ['#2B3A55', '#5A3E36', '#1F4B4A', '#4B3B63', '#58463A', '#2E4F3D'];

const MINIATURE: [string, string, string][] = [
  ['#3B2F4A', '#14101C', '453K'], ['#', '#', ''], ['#1F2A44', '#0C1020', '125K'],
  ['#233E66', '#0B1830', '126K'], ['#6A3B3B', '#241313', '88K'], ['#3E4A3A', '#141A12', '98K'],
];

const FondoProfilo: React.FC<{ len: number; nome: string; visibile?: string; numeri?: [string, string, string] }> = ({ len, nome, visibile, numeri = ['258', '97K', '146'] }) => {
  const fr = useCurrentFrame();
  const p = faseScheda(fr, 0, len);
  // lampo bianco all'entrata, poi la pagina grigio-azzurra
  const lampo = interpolate(fr, [0, 4, 11], [1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const ui = interpolate(fr, [6, 14], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) * interpolate(fr, [len - 8, len - 2], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  // il fascio di luce sull'intestazione arriva a metà
  const fascio = interpolate(fr, [ENTRA + 2, ENTRA + 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const iniziale = ((visibile || nome.replace(/^@/, ''))[0] || 'D').toUpperCase();
  return (
    <AbsoluteFill style={{ background: '#4F5870', opacity: Math.min(1, p * 2.2) }}>
      <AbsoluteFill style={{ opacity: ui }}>
        <div style={{ position: 'absolute', left: 0, top: 200, right: 0, height: 360, opacity: fascio * 0.95,
          background: 'linear-gradient(90deg, rgba(235,243,255,0) 0%, rgba(235,243,255,0.92) 100%)', clipPath: 'polygon(0 22%, 100% 0, 100% 100%, 0 78%)' }} />
        <div style={{ position: 'absolute', left: 60, top: 250, display: 'flex', alignItems: 'center', gap: 36 }}>
          <div style={{ width: 170, height: 170, borderRadius: 85, background: 'linear-gradient(135deg,#E3B341,#C9632B)', border: '6px solid #FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif', fontWeight: 800, fontSize: 80, color: '#FFFFFF' }}>{iniziale}</div>
          <div style={{ fontFamily: 'Inter, sans-serif', color: '#101828' }}>
            <div style={{ fontSize: 46, fontWeight: 800 }}>{visibile || nome}</div>
            {visibile ? <div style={{ fontSize: 26, opacity: 0.65, marginTop: 4 }}>{nome}</div> : null}
            <div style={{ display: 'flex', gap: 40, marginTop: 18, fontSize: 30 }}>
              {[[numeri[0], 'post'], [numeri[1], 'follower'], [numeri[2], 'seguiti']].map(([n, e]) => (
                <div key={e}><div style={{ fontWeight: 800 }}>{n}</div><div style={{ fontSize: 22, opacity: 0.7 }}>{e}</div></div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ position: 'absolute', left: 60, top: 520, width: 960, display: 'flex', gap: 20, fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 30 }}>
          <div style={{ flex: 1, textAlign: 'center', padding: '18px 0', borderRadius: 14, background: '#2F4FD8', color: '#DCE6FF' }}>Segui</div>
          <div style={{ flex: 1, textAlign: 'center', padding: '18px 0', borderRadius: 14, background: '#3A4260', color: '#E8ECF8' }}>Messaggio</div>
        </div>
        {MINIATURE.map(([c1, c2, n], k) => {
          const c = k % 3, r = Math.floor(k / 3);
          if (c === 1 && r === 0) return null; // qui sta il video
          return (
            <div key={k} style={{ position: 'absolute', left: 40 + c * 340, top: TESSERA.y + r * 590, width: 320, height: 569, borderRadius: 22, background: `linear-gradient(160deg, ${c1}, ${c2})`, opacity: 0.92 }}>
              <div style={{ position: 'absolute', left: 18, bottom: 16, fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 26, color: '#FFFFFFB0' }}>▶ {n}</div>
            </div>
          );
        })}
        <AbsoluteFill style={{ background: 'rgba(14,20,40,0.28)', opacity: 1 - fascio * 0.5, pointerEvents: 'none' }} />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: '#F4F8FF', opacity: lampo }} />
    </AbsoluteFill>
  );
};

export const PaginaProfiloFondo: React.FC<{ piano: Piano; nome?: string; visibile?: string; numeri?: [string, string, string]; sfx?: number }> = ({ piano, nome = '@tuoprofilo', visibile, numeri, sfx = 0 }) => (
  <>
    {(piano.paginaProfilo || []).map((s, i) => {
      const len = lunghezza(s.dur);
      return (
        <Sequence key={`pp${i}`} from={f(s.at)} durationInFrames={len}>
          <FondoProfilo len={len} nome={nome} visibile={visibile} numeri={numeri} />
          {sfx > 0 ? <Sfx nome="whoosh" da={0} volume={0.5 * sfx} /> : null}
        </Sequence>
      );
    })}
  </>
);

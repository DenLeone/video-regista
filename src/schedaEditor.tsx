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

const fasePiano = (piano: Piano, fr: number) => Math.max(0, ...(piano.schedeEditor || []).map((s) => faseScheda(fr, f(s.at), Math.max(ENTRA + ESCE + 4, f(s.dur)))));

export const ScalaVideo: React.FC<{ piano: Piano; children: React.ReactNode }> = ({ piano, children }) => {
  const fr = useCurrentFrame();
  const p = fasePiano(piano, fr);
  if (p <= 0) return <>{children}</>;
  const s = 1 - (1 - SCALA) * p;
  return (
    <AbsoluteFill style={{
      transformOrigin: '0 0', transform: `translate(${(BOX.x * p).toFixed(2)}px, ${(BOX.y * p).toFixed(2)}px) scale(${s.toFixed(4)})`,
      borderRadius: 16 * p / s, overflow: 'hidden', boxShadow: p > 0.5 ? '0 10px 40px rgba(0,0,0,0.25)' : undefined,
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
        {/* timeline */}
        <div style={{ position: 'absolute', left: tl.x, top: tl.y, width: tl.w, height: 230, borderRadius: 18, background: '#FFFFFF', border: '2px solid #E4E5E8', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 34, background: '#F0F1F3', borderBottom: '2px solid #E4E5E8' }}>
            {Array.from({ length: 19 }).map((_, i) => <div key={i} style={{ position: 'absolute', left: `${i * 5.5 + 2}%`, bottom: 0, width: 2, height: i % 3 === 0 ? 16 : 9, background: '#B9BDC4' }} />)}
          </div>
          {PEZZI.map((pista, k) => (
            <div key={k} style={{ position: 'absolute', left: 0, right: 0, top: 54 + k * 82, height: 66 }}>
              {pista.map(([a, b, c], j) => <div key={j} style={{ position: 'absolute', left: `${a}%`, width: `${b - a}%`, top: 0, bottom: 0, borderRadius: 10, background: c }} />)}
            </div>
          ))}
          <div style={{ position: 'absolute', left: `${cursore}%`, top: 0, bottom: 0, width: 4, background: '#FF3B30', borderRadius: 2 }}>
            <div style={{ position: 'absolute', left: -9, top: 0, width: 22, height: 26, background: '#FF3B30', borderRadius: '4px 4px 11px 11px' }} />
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const SchedaEditorFondo: React.FC<{ piano: Piano; sfx?: number }> = ({ piano, sfx = 0 }) => (
  <>
    {(piano.schedeEditor || []).map((s, i) => {
      const len = Math.max(ENTRA + ESCE + 4, f(s.dur));
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

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

const FondoProfilo: React.FC<{ len: number; nome: string }> = ({ len, nome }) => {
  const fr = useCurrentFrame();
  const p = faseScheda(fr, 0, len);
  const zoom = interpolate(fr, [ENTRA, len - ESCE], [1, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const ui = interpolate(fr, [3, 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) * interpolate(fr, [len - 8, len - 2], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const iniziale = (nome.replace(/^@/, '')[0] || 'D').toUpperCase();
  return (
    <AbsoluteFill style={{ background: '#0F1624', opacity: Math.min(1, p * 2.2) }}>
      <AbsoluteFill style={{ opacity: ui, transformOrigin: '50% 30%', transform: `scale(${zoom.toFixed(3)})` }}>
        <div style={{ position: 'absolute', left: 60, top: 250, display: 'flex', alignItems: 'center', gap: 36 }}>
          <div style={{ width: 170, height: 170, borderRadius: 85, background: 'linear-gradient(135deg,#E3B341,#C9632B)', border: '6px solid #FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif', fontWeight: 800, fontSize: 80, color: '#FFFFFF' }}>{iniziale}</div>
          <div style={{ fontFamily: 'Inter, sans-serif', color: '#FFFFFF' }}>
            <div style={{ fontSize: 46, fontWeight: 800 }}>{nome}</div>
            <div style={{ display: 'flex', gap: 40, marginTop: 18, fontSize: 30 }}>
              {[['258', 'post'], ['97K', 'follower'], ['146', 'seguiti']].map(([n, e]) => (
                <div key={e}><div style={{ fontWeight: 800 }}>{n}</div><div style={{ fontSize: 22, opacity: 0.7 }}>{e}</div></div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ position: 'absolute', left: 60, top: 520, width: 960, display: 'flex', gap: 20, fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 30 }}>
          <div style={{ flex: 1, textAlign: 'center', padding: '18px 0', borderRadius: 14, background: '#2F5BEA', color: '#FFFFFF' }}>Segui</div>
          <div style={{ flex: 1, textAlign: 'center', padding: '18px 0', borderRadius: 14, background: '#232C3F', color: '#FFFFFF' }}>Messaggio</div>
        </div>
        {GRIGLIA.map((k) => {
          const c = k % 3, r = Math.floor(k / 3);
          if (c === 1 && r === 0) return null; // qui sta il video
          return <div key={k} style={{ position: 'absolute', left: 40 + c * 340, top: TESSERA.y + r * 590, width: 320, height: 569, borderRadius: 22, background: COLORI[k % COLORI.length], opacity: 0.85 }} />;
        })}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const PaginaProfiloFondo: React.FC<{ piano: Piano; nome?: string; sfx?: number }> = ({ piano, nome = '@tuoprofilo', sfx = 0 }) => (
  <>
    {(piano.paginaProfilo || []).map((s, i) => {
      const len = lunghezza(s.dur);
      return (
        <Sequence key={`pp${i}`} from={f(s.at)} durationInFrames={len}>
          <FondoProfilo len={len} nome={nome} />
          {sfx > 0 ? <Sfx nome="whoosh" da={0} volume={0.5 * sfx} /> : null}
        </Sequence>
      );
    })}
  </>
);

import React from 'react';
import { AbsoluteFill, Easing, Img, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { loadFont } from '@remotion/google-fonts/Montserrat';
import { Clips, f, Icone, Inserti, MusicaSotto, Sfx, usaFps, volumeSfx } from './comune';
import { Piano } from './piano';

// ListaUI (03/11): video a lista numerata con schermate animate pulite, stile app (riferimento:
// reel "3 tips" con cartelle blu "No.1", chat che si scrive, finestra di file, griglia del profilo,
// scheda di un'app). Denis parla sotto; le schermate a tutto schermo entrano con un cerchio bianco
// che si allarga, la voce non si ferma mai. Sottotitoli piccoli a 2–3 parole.

const { fontFamily: FONT } = loadFont('normal', { weights: ['500', '600', '700', '800'], subsets: ['latin'] });

const CREMA = '#F7F5EF';
const NERO = '#111111';
const GRIGIO = '#8E8E93';
const BLU = '#4AA8F0';
const MENTA = '#8FE3CF';
const SFX = { whoosh: 0.35, ui_in: 0.4, ui_conferma: 0.45 } as const;
export type Schermata = NonNullable<Piano['schermate']>[number];
const PIENE = new Set(['capitolo', 'chat', 'finestra', 'griglia', 'app']);

const appare = (frame: number, fps: number, ritardo = 0) => spring({ frame: frame - ritardo, fps, config: { damping: 15, stiffness: 170 } });
const scritto = (testo: string, frame: number, da: number, a: number) => testo.slice(0, Math.round(interpolate(frame, [da, a], [0, testo.length], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })));

// ---------- pezzi ----------
const Cartella: React.FC<{ size: number; testo?: string }> = ({ size, testo }) => (
  <div style={{ position: 'relative', width: size, height: size * 0.72 }}>
    <div style={{ position: 'absolute', left: 0, top: 0, width: size * 0.42, height: size * 0.2, background: '#3E9BE0', borderRadius: size * 0.05 }} />
    <div style={{ position: 'absolute', left: 0, top: size * 0.08, width: size, height: size * 0.64, background: `linear-gradient(180deg, #7CC6F7, ${BLU})`, borderRadius: size * 0.07,
      boxShadow: '0 6px 18px rgba(30,100,170,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: FONT, fontWeight: 700, fontSize: size * 0.13 }}>
      {testo}
    </div>
  </div>
);

const Miniatura: React.FC<{ file?: string; i: number; frame: number; fps: number; ritardo: number; style: React.CSSProperties }> = ({ file, i, frame, fps, ritardo, style }) => {
  const s = appare(frame, fps, ritardo);
  const vuota = ['#E9E4DA', '#DCD6CB', '#EFEAE1'][i % 3];
  return (
    <div style={{ ...style, overflow: 'hidden', background: vuota, transform: `scale(${0.6 + 0.4 * s})`, opacity: Math.min(1, s * 1.5) }}>
      {file ? <Img src={staticFile(`media/${file}`)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
    </div>
  );
};

const Cursore: React.FC<{ frame: number }> = ({ frame }) => (
  <span style={{ display: 'inline-block', width: 3, height: '1em', background: NERO, marginLeft: 2, verticalAlign: 'text-bottom', opacity: Math.floor(frame / 8) % 2 ? 0 : 1 }} />
);

// ---------- schermate ----------
const Capitolo: React.FC<{ s: Schermata; len: number }> = ({ s, len }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = appare(frame, fps, 3);
  const zoom = interpolate(frame, [0, len], [1, 1.06]);
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', transform: `scale(${zoom})` }}>
      <div style={{ transform: `scale(${0.7 + 0.3 * a})`, opacity: a, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Cartella size={130} />
        {s.numero != null ? <div style={{ marginTop: 18, fontFamily: FONT, fontWeight: 600, fontSize: 40, color: NERO }}>No.{s.numero}</div> : null}
        {s.titolo ? <div style={{ marginTop: 6, maxWidth: 900, textAlign: 'center', fontFamily: FONT, fontWeight: 600, fontSize: 104, lineHeight: 1.05, letterSpacing: -2, color: NERO }}>{s.titolo}</div> : null}
      </div>
    </AbsoluteFill>
  );
};

const Chat: React.FC<{ s: Schermata; len: number }> = ({ s, len }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = appare(frame, fps, 2);
  const testo = s.testo || '';
  const pronto = frame > len * 0.75;
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ width: 900, minHeight: 330, background: '#fff', borderRadius: 32, boxShadow: '0 12px 40px rgba(0,0,0,0.12)', padding: '30px 36px 90px', boxSizing: 'border-box',
        position: 'relative', transform: `translateY(${(1 - a) * 60}px)`, opacity: a, fontFamily: FONT }}>
        <div style={{ fontSize: 26, fontWeight: 600, color: GRIGIO, marginBottom: 18 }}>{s.titolo || 'Chat'}</div>
        <div style={{ fontSize: 44, fontWeight: 500, color: NERO, lineHeight: 1.3 }}>{scritto(testo, frame, 6, Math.max(8, len * 0.7))}<Cursore frame={frame} /></div>
        <div style={{ position: 'absolute', right: 30, bottom: 26, width: 64, height: 64, borderRadius: 32, background: pronto ? NERO : '#C9C9CE',
          transform: `scale(${pronto ? 1 + 0.12 * Math.max(0, Math.sin((frame - len * 0.75) / 3)) : 1})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 38, fontWeight: 800 }}>↑</div>
      </div>
    </AbsoluteFill>
  );
};

const Finestra: React.FC<{ s: Schermata }> = ({ s }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = appare(frame, fps, 1);
  const voci = s.voci?.length ? s.voci : ['progetti', 'riferimenti', 'musica', 'grafica', 'idee'];
  const media = s.media?.length ? s.media : [];
  const tasselli = Math.max(6, Math.min(9, media.length || 6));
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ width: 980, height: 1180, background: '#fff', borderRadius: 26, boxShadow: '0 14px 44px rgba(0,0,0,0.14)', overflow: 'hidden',
        transform: `scale(${0.85 + 0.15 * a})`, opacity: a, fontFamily: FONT, display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: 70, borderBottom: '1px solid #ECECEC', display: 'flex', alignItems: 'center', padding: '0 24px', gap: 12 }}>
          {['#FF5F57', '#FEBC2E', '#28C840'].map((c) => <div key={c} style={{ width: 20, height: 20, borderRadius: 10, background: c }} />)}
          <div style={{ flex: 1, textAlign: 'center', fontSize: 26, fontWeight: 600, color: GRIGIO }}>{s.titolo || 'workspace'}</div>
        </div>
        <div style={{ flex: 1, display: 'flex' }}>
          <div style={{ width: 300, borderRight: '1px solid #ECECEC', padding: '24px 20px', boxSizing: 'border-box' }}>
            {voci.map((v, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 26, color: NERO, marginBottom: 22, opacity: interpolate(frame, [i * 2, i * 2 + 6], [0, 1], { extrapolateRight: 'clamp' }) }}>
                <div style={{ width: 30, height: 22, borderRadius: 4, background: BLU }} />{v}
              </div>
            ))}
          </div>
          <div style={{ flex: 1, padding: 24, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, alignContent: 'start' }}>
            {Array.from({ length: tasselli }, (_, i) => (
              <Miniatura key={i} file={media[i]} i={i} frame={frame} fps={fps} ritardo={6 + i * 4} style={{ height: 290, borderRadius: 12 }} />
            ))}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Griglia: React.FC<{ s: Schermata }> = ({ s }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = appare(frame, fps, 1);
  const media = s.media || [];
  const scroll = interpolate(frame, [10, 70], [0, -260], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) });
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ width: 860, height: 1560, background: '#fff', borderRadius: 60, border: `14px solid ${NERO}`, overflow: 'hidden', transform: `translateY(${(1 - a) * 120}px)`, opacity: a, fontFamily: FONT }}>
        <div style={{ height: 70, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 40px', fontSize: 28, fontWeight: 700 }}>
          <span>9:41</span><span>●●● ▮</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 34px 20px' }}>
          <span style={{ fontSize: 36, fontWeight: 800 }}>{s.titolo || '@_black_den'}</span>
          <span style={{ background: BLU, color: '#fff', fontSize: 26, fontWeight: 700, padding: '8px 22px', borderRadius: 10 }}>Segui</span>
        </div>
        <div style={{ transform: `translateY(${scroll}px)`, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
          {Array.from({ length: 15 }, (_, i) => (
            <Miniatura key={i} file={media.length ? media[i % media.length] : undefined} i={i} frame={frame} fps={fps} ritardo={3 + i * 2} style={{ height: 380 }} />
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const App: React.FC<{ s: Schermata; len: number }> = ({ s, len }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = appare(frame, fps, 1);
  const testo = s.testo || '';
  const via = Math.round(len * 0.55);
  const barra = interpolate(frame, [via, len - 4], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const risultati = frame > via + 8;
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ width: 900, background: '#fff', borderRadius: 30, boxShadow: '0 14px 44px rgba(0,0,0,0.13)', padding: 44, boxSizing: 'border-box',
        transform: `scale(${0.88 + 0.12 * a})`, opacity: a, fontFamily: FONT }}>
        <div style={{ fontSize: 76, fontWeight: 700, letterSpacing: -1.5, color: NERO }}>{s.titolo || 'App'}</div>
        <div style={{ marginTop: 26, fontSize: 22, fontWeight: 700, color: GRIGIO, letterSpacing: 2 }}>PROMPT</div>
        <div style={{ marginTop: 10, background: '#F2F2F4', borderRadius: 16, padding: 24, minHeight: 180, fontSize: 32, lineHeight: 1.35, color: NERO }}>
          {scritto(testo, frame, 4, via - 4)}{frame < via ? <Cursore frame={frame} /> : null}
        </div>
        <div style={{ marginTop: 26, height: 76, borderRadius: 14, background: frame < via ? NERO : BLU, color: '#fff', fontSize: 30, fontWeight: 700, position: 'relative', overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {frame >= via ? <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${barra * 100}%`, background: 'rgba(255,255,255,0.22)' }} /> : null}
          <span style={{ position: 'relative' }}>{frame < via ? 'Genera' : 'Sto generando…'}</span>
        </div>
        {risultati ? [0, 1].map((i) => (
          <div key={i} style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 18, opacity: appare(frame, fps, via + 8 + i * 5) }}>
            <div style={{ width: 56, height: 56, borderRadius: 28, background: BLU, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>▶</div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4, height: 56 }}>
              {Array.from({ length: 40 }, (_, j) => <div key={j} style={{ flex: 1, background: '#B9D8F2', height: `${20 + 70 * Math.abs(Math.sin(j * 1.7 + i))}%`, borderRadius: 2 }} />)}
            </div>
          </div>
        )) : null}
      </div>
    </AbsoluteFill>
  );
};

// pillola sopra il volto: non copre il video
const Pillola: React.FC<{ s: Schermata; len: number }> = ({ s, len }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = appare(frame, fps, 0);
  const via = interpolate(frame, [len - 6, len], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <div style={{ position: 'absolute', top: 170, left: 0, right: 0, display: 'flex', justifyContent: 'center', opacity: a * via }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 22, background: 'rgba(255,255,255,0.94)', borderRadius: 26, padding: '18px 30px', boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
        transform: `translateY(${(1 - a) * -60}px)`, fontFamily: FONT, minWidth: 560 }}>
        {s.numero != null ? <Cartella size={74} /> : <div style={{ width: 62, height: 62, borderRadius: 31, background: BLU, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>▶</div>}
        <div style={{ flex: 1 }}>
          {s.numero != null ? <div style={{ fontSize: 22, fontWeight: 600, color: GRIGIO }}>No.{s.numero}</div> : null}
          <div style={{ fontSize: 40, fontWeight: 700, color: NERO, lineHeight: 1.1 }}>{s.titolo || ''}</div>
          {s.testo ? <div style={{ fontSize: 22, fontWeight: 500, color: GRIGIO }}>{s.testo}</div> : null}
        </div>
        {s.numero == null ? (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 46 }}>
            {[0, 1, 2, 3, 4].map((j) => <div key={j} style={{ width: 7, borderRadius: 3, background: BLU, height: `${30 + 70 * Math.abs(Math.sin(frame / 4 + j))}%` }} />)}
          </div>
        ) : null}
      </div>
    </div>
  );
};

// cerchio bianco che si allarga e porta alla schermata, poi la schermata su fondo crema
const Piena: React.FC<{ s: Schermata; len: number }> = ({ s, len }) => {
  const frame = useCurrentFrame();
  const r = interpolate(frame, [0, 7], [0, 160], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  return (
    <AbsoluteFill style={{ backgroundColor: CREMA, clipPath: `circle(${r}% at 50% 50%)` }}>
      {s.tipo === 'capitolo' ? <Capitolo s={s} len={len} /> : s.tipo === 'chat' ? <Chat s={s} len={len} />
        : s.tipo === 'finestra' ? <Finestra s={s} /> : s.tipo === 'griglia' ? <Griglia s={s} /> : <App s={s} len={len} />}
    </AbsoluteFill>
  );
};

// un contenitore da solo, su fondo trasparente (campionario per DaVinci: pc/campionario.mjs).
// fondo = crema dietro, come nel video; senza, si esporta con il canale alfa
export const Pezzo: React.FC<{ s: Schermata; durata: number; fondo?: boolean }> = ({ s, durata, fondo }) => {
  usaFps({ fps: 30 });
  const len = f(durata);
  return (
    <AbsoluteFill style={{ backgroundColor: fondo ? CREMA : 'transparent' }}>
      {s.tipo === 'capitolo' ? <Capitolo s={s} len={len} /> : s.tipo === 'chat' ? <Chat s={s} len={len} />
        : s.tipo === 'finestra' ? <Finestra s={s} /> : s.tipo === 'griglia' ? <Griglia s={s} />
        : s.tipo === 'app' ? <App s={s} len={len} /> : <Pillola s={s} len={len + 6} />}
    </AbsoluteFill>
  );
};

// ---------- titolo e sottotitoli ----------
const Titolo: React.FC<{ testo: string; len: number }> = ({ testo, len }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = appare(frame, fps, 0);
  const via = interpolate(frame, [len - 6, len], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  // prime due parole enormi, il resto sotto più piccolo (come "Claude / Motion Graphics")
  const parole = testo.split(' ');
  const meta = Math.min(2, parole.length);
  const grande = Math.min(132, Math.floor(1700 / Math.max(6, parole.slice(0, meta).join(' ').length)));
  return (
    <div style={{ position: 'absolute', top: 150, left: 50, right: 50, textAlign: 'center', opacity: a * via, transform: `translateY(${(1 - a) * 30}px)`, fontFamily: FONT }}>
      <div style={{ fontSize: grande, fontWeight: 600, lineHeight: 0.95, letterSpacing: -4, color: MENTA, textShadow: '0 4px 24px rgba(0,0,0,0.25)' }}>{parole.slice(0, meta).join(' ')}</div>
      <div style={{ fontSize: 64, fontWeight: 500, color: MENTA, textShadow: '0 3px 16px rgba(0,0,0,0.3)' }}>{parole.slice(meta).join(' ')}</div>
    </div>
  );
};

type Blocco = { at: number; fine: number; testo: string };
function blocchi(parole: Piano['parole']): Blocco[] {
  const out: Blocco[] = [];
  let cur: { at: number; fine: number; w: string[] } | null = null;
  for (const p of parole || []) {
    if (cur && (cur.w.length >= 3 || p.at - cur.fine > 0.35)) { out.push({ at: cur.at, fine: cur.fine, testo: cur.w.join(' ') }); cur = null; }
    if (!cur) cur = { at: p.at, fine: p.at + p.dur, w: [] };
    cur.w.push(p.w);
    cur.fine = p.at + p.dur;
  }
  if (cur) out.push({ at: cur.at, fine: cur.fine, testo: cur.w.join(' ') });
  return out;
}

const Sottotitolo: React.FC<{ testo: string; suCarta: boolean }> = ({ testo, suCarta }) => (
  <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: suCarta ? 330 : 560 }}>
    <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 44, color: '#fff', padding: suCarta ? '4px 16px' : 0, borderRadius: 8,
      background: suCarta ? 'rgba(140,140,146,0.85)' : 'transparent', textShadow: suCarta ? 'none' : '0 2px 10px rgba(0,0,0,0.7)', textAlign: 'center', maxWidth: 900 }}>
      {testo}
    </div>
  </AbsoluteFill>
);

export const ListaUI: React.FC<Piano> = (piano) => {
  usaFps(piano);
  const sfx = volumeSfx(piano);
  const schermate = piano.schermate || [];
  const piene = schermate.filter((s) => PIENE.has(s.tipo));
  const titolo = (piano.titolo || '').trim();
  const lenTitolo = f(2.6);
  const suCarta = (t: number) => piene.some((s) => t >= s.at && t < s.at + s.dur);

  return (
    <AbsoluteFill style={{ backgroundColor: NERO }}>
      <Clips piano={piano} />
      <Inserti piano={piano} sfx={sfx} />
      <Icone piano={piano} sfx={sfx} />
      <MusicaSotto piano={piano} />

      {titolo && !suCarta(0) ? (
        <Sequence from={0} durationInFrames={lenTitolo}>
          <Titolo testo={titolo} len={lenTitolo} />
        </Sequence>
      ) : null}

      {schermate.map((s, i) => {
        const len = Math.max(1, f(s.dur));
        return (
          <Sequence key={`s${i}`} from={f(s.at)} durationInFrames={len}>
            {PIENE.has(s.tipo) ? <Piena s={s} len={len} /> : <Pillola s={s} len={len} />}
          </Sequence>
        );
      })}

      {blocchi(piano.parole).map((b, i) => (
        <Sequence key={`p${i}`} from={f(b.at)} durationInFrames={Math.max(1, f(b.fine - b.at + 0.08))}>
          <Sottotitolo testo={b.testo} suCarta={suCarta(b.at)} />
        </Sequence>
      ))}

      {sfx > 0 ? schermate.map((s, i) => {
        const nome = PIENE.has(s.tipo) ? (s.tipo === 'capitolo' ? 'whoosh' : 'ui_in') : 'ui_conferma';
        return <Sfx key={`x${i}`} nome={nome} da={f(s.at)} volume={SFX[nome] * sfx} />;
      }) : null}
    </AbsoluteFill>
  );
};

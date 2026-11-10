import React from 'react';
import { AbsoluteFill, Easing, Img, interpolate, OffthreadVideo, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { loadFont as loadAnton } from '@remotion/google-fonts/Anton';
import { loadFont as loadMarker } from '@remotion/google-fonts/PermanentMarker';
import { loadFont as loadMontserrat } from '@remotion/google-fonts/Montserrat';
import { Clips, f, Icone, MusicaSotto, Sfx, usaFps, volumeSfx } from './comune';
import { Clip, durataClip, Keyword, Piano } from './piano';
import { dentro, SICURA } from './testo';

// Stile "Kal" (dai 3 esempi in 12 · Risorse/Kal, 10/11): persona seduta, inquadratura fissa, pochi tagli.
// Una parola grande alla volta in maiuscolo stretto giallo senape nel terzo alto, a volte attraversata da
// una parola scritta a mano in rosso; sottotitoli sempre, piccoli e bianchi, 3–4 parole all'altezza del
// petto. I B-roll non vanno a tutto schermo: stanno in un riquadro su un tappetino da taglio verde
// (scelta di Denis al posto del fondo rosso a griglia dei riferimenti). Niente chiusura con l'handle.

const { fontFamily: ANTON } = loadAnton('normal', { weights: ['400'], subsets: ['latin'] });
const { fontFamily: MARKER } = loadMarker('normal', { weights: ['400'], subsets: ['latin'] });
const { fontFamily: MONTSERRAT } = loadMontserrat('normal', { weights: ['600', '700'], subsets: ['latin'] });
const GIALLO = '#F2C230';
const ROSSO = '#E3262B';
const MAT = '#1F5A45';
const OMBRA = '0 4px 18px rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.6)';
const OMBRA_SOTTO = '0 0 2px rgba(0,0,0,0.75), 0 2px 8px rgba(0,0,0,0.55)';
const Y_SOTTOTITOLI = 1180;
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

// ---------- sottotitoli: gruppi di 3–4 parole, sempre ----------
type Gruppo = { at: number; fine: number; testo: string };
const pulisci = (w: string) => w.replace(/^[«"“(]+|[»"”).,;:!?…]+$/g, '');
export function gruppiKal(parole: Piano['parole'] = [], titoli: Keyword[] = []): Gruppo[] {
  const out: Gruppo[] = [];
  let cur: { at: number; fine: number; w: string[] } | null = null;
  const chiudi = () => { if (cur?.w.length) out.push({ at: cur.at, fine: cur.fine, testo: cur.w.join(' ') }); cur = null; };
  for (const p of parole) {
    const w = pulisci(String(p.w).trim());
    if (!w) continue;
    // nuovo gruppo: pausa, gruppo pieno (4 parole o ~22 lettere), o fine frase prima
    if (cur && (p.at - cur.fine > 0.45 || cur.w.length >= 4 || (cur.w.join(' ').length + w.length > 22))) chiudi();
    if (!cur) cur = { at: p.at, fine: p.at + p.dur, w: [] };
    cur.w.push(w);
    cur.fine = p.at + p.dur;
    if (/[.!?]$/.test(String(p.w).trim())) chiudi();
  }
  chiudi();
  out.forEach((g, k) => { const dopo = out[k + 1]; g.fine = dopo && dopo.at - g.fine < 0.5 ? dopo.at : g.fine + 0.2; });
  // durante una parola grande i sottotitoli tacciono: si legge quella
  return out.filter((g) => !titoli.some((t) => g.at >= t.at - 0.05 && g.at < t.at + t.dur))
    .map((g) => { const t = titoli.find((x) => x.at > g.at && x.at < g.fine); return t ? { ...g, fine: t.at } : g; })
    .filter((g) => g.fine - g.at >= 0.1);
}

const Sottotitolo: React.FC<{ testo: string; len: number }> = ({ testo, len }) => {
  const fr = useCurrentFrame();
  const v = Math.min(interpolate(fr, [0, 3], [0, 1], clamp), interpolate(fr, [len - 2, len], [1, 0], clamp));
  const fs = dentro(testo, { famiglia: MONTSERRAT, peso: 600 }, 50);
  return (
    <div style={{ position: 'absolute', top: Y_SOTTOTITOLI - fs * 0.6, left: SICURA.lato, right: SICURA.lato, textAlign: 'center',
      fontFamily: MONTSERRAT, fontWeight: 600, fontSize: fs, lineHeight: 1.2, color: '#FFFFFF', textShadow: OMBRA_SOTTO, opacity: v }}>
      {testo}
    </div>
  );
};

// ---------- parola grande, con la scritta a mano rossa ----------
const Parola: React.FC<{ k: Keyword; len: number }> = ({ k, len }) => {
  const fr = useCurrentFrame();
  const entra = interpolate(fr, [0, 6], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.6)) });
  const esce = interpolate(fr, [len - 5, len], [1, 0], clamp);
  const parola = k.word.toUpperCase();
  const righe = parola.length > 11 && parola.includes(' ') ? [parola.slice(0, parola.lastIndexOf(' ', Math.ceil(parola.length / 2) + 2)), parola.slice(parola.lastIndexOf(' ', Math.ceil(parola.length / 2) + 2) + 1)] : [parola];
  const fs = Math.min(240, ...righe.map((r) => dentro(r, { famiglia: ANTON, peso: 400 }, 240)));
  const mano = (k.note || '').replace(/^\/\/\s*/, '').trim();
  const scrive = interpolate(fr, [4, 14], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const top = 250; // sempre in alto: l'AI a volte manda il top degli altri stili (in basso)
  return (
    <AbsoluteFill style={{ opacity: esce }}>
      <div style={{ position: 'absolute', top, left: SICURA.lato - 40, right: SICURA.lato - 40, textAlign: 'center' }}>
        {k.tag ? <div style={{ fontFamily: ANTON, fontSize: 52, color: '#FFFFFF', letterSpacing: '0.02em', textShadow: OMBRA, opacity: entra }}>{k.tag.toUpperCase()}</div> : null}
        {righe.map((r, i) => (
          <div key={i} style={{ fontFamily: ANTON, fontSize: fs, lineHeight: 0.95, color: GIALLO, letterSpacing: '0.01em', textShadow: OMBRA,
            transform: `scale(${0.7 + 0.3 * entra})`, opacity: Math.min(1, entra * 1.5) }}>{r}</div>
        ))}
        {mano ? (
          <div style={{ position: 'relative', marginTop: -fs * 0.12, fontFamily: MARKER, fontSize: Math.min(110, fs * 0.62), color: ROSSO, lineHeight: 1,
            transform: 'rotate(-6deg)', textShadow: '0 3px 10px rgba(0,0,0,0.45)', clipPath: `inset(0 ${(1 - scrive) * 100}% 0 0)` }}>{mano}</div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

// ---------- B-roll e immagini nel riquadro sul tappetino da taglio verde ----------
const Tappetino: React.FC = () => (
  <AbsoluteFill style={{
    backgroundColor: MAT,
    backgroundImage: [
      'linear-gradient(rgba(255,255,255,0.32) 2px, transparent 2px)', 'linear-gradient(90deg, rgba(255,255,255,0.32) 2px, transparent 2px)',
      'linear-gradient(rgba(255,255,255,0.13) 1px, transparent 1px)', 'linear-gradient(90deg, rgba(255,255,255,0.13) 1px, transparent 1px)',
      'repeating-linear-gradient(45deg, rgba(255,255,255,0.07) 0 1px, transparent 1px 160px)',
    ].join(', '),
    backgroundSize: '150px 150px, 150px 150px, 30px 30px, 30px 30px, auto',
    backgroundPosition: '-1px -1px',
  }}>
    {/* righello in alto e a sinistra, come i tappetini veri */}
    {Array.from({ length: 8 }, (_, i) => (
      <div key={`n${i}`} style={{ position: 'absolute', top: 10, left: 150 * i + 6, fontFamily: MONTSERRAT, fontWeight: 600, fontSize: 22, color: 'rgba(255,255,255,0.55)' }}>{i * 5}</div>
    ))}
    <AbsoluteFill style={{ background: 'radial-gradient(ellipse 90% 70% at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.35) 100%)' }} />
  </AbsoluteFill>
);

const Riquadro: React.FC<{ clip: Clip; len: number }> = ({ clip, len }) => {
  const fr = useCurrentFrame();
  const entra = interpolate(fr, [0, 8], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const ins = clip.inserto;
  const immagine = ins?.tipo === 'immagine';
  const w = 860, h = 1360;
  return (
    <AbsoluteFill>
      <Tappetino />
      <div style={{ position: 'absolute', left: (1080 - w) / 2, top: (1920 - h) / 2 - 40, width: w, height: h, borderRadius: 34, overflow: 'hidden',
        backgroundColor: '#0d0d0d', boxShadow: '0 30px 70px rgba(0,0,0,0.55), 0 6px 18px rgba(0,0,0,0.4)',
        transform: `translateY(${(1 - entra) * 60}px) scale(${0.94 + 0.06 * entra})`, opacity: entra }}>
        {immagine && ins
          ? <Img src={staticFile(`media/${ins.file}`)} style={{ width: '100%', height: '100%', objectFit: 'contain', backgroundColor: '#111' }} />
          : ins
          ? <OffthreadVideo src={staticFile(`media/${ins.file}`)} startFrom={f(ins.start || 0)} endAt={f(ins.start || 0) + len} muted
            style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <OffthreadVideo src={staticFile(`media/${clip.file}`)} startFrom={f(clip.start)} endAt={f(clip.start) + len} muted
            style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
      </div>
    </AbsoluteFill>
  );
};

export const Kal: React.FC<Piano> = (piano) => {
  usaFps(piano);
  const sfx = volumeSfx(piano);
  const titoli = piano.keywords;
  const gruppi = gruppiKal(piano.parole, titoli);
  let t = 0;
  const riquadri = piano.clips.map((c) => { const da = t; const len = Math.max(1, f(durataClip(c))); t += f(durataClip(c)); return { c, da, len }; })
    .filter(({ c }) => c.broll || c.inserto);

  return (
    <AbsoluteFill style={{ backgroundColor: '#0A0A0A' }}>
      {/* il girato (la voce passa sempre da qui); i B-roll e le immagini ci vanno sopra nel riquadro */}
      <Clips piano={{ ...piano, clips: piano.clips.map((c) => (c.inserto ? { ...c, inserto: undefined } : c)) }} fondo="#0A0A0A" />
      {riquadri.map(({ c, da, len }, i) => (
        <Sequence key={`r${i}`} from={da} durationInFrames={len}>
          <Riquadro clip={c} len={len} />
        </Sequence>
      ))}
      <Icone piano={piano} sfx={sfx} />
      <MusicaSotto piano={piano} />

      {gruppi.map((g, i) => (
        <Sequence key={`s${i}`} from={f(g.at)} durationInFrames={Math.max(2, f(g.fine) - f(g.at))}>
          <Sottotitolo testo={g.testo} len={Math.max(2, f(g.fine) - f(g.at))} />
        </Sequence>
      ))}
      {titoli.map((k, i) => (
        <Sequence key={`k${i}`} from={f(k.at)} durationInFrames={Math.max(1, f(k.dur))}>
          <Parola k={k} len={Math.max(1, f(k.dur))} />
        </Sequence>
      ))}
      {sfx > 0 ? titoli.map((k, i) => <Sfx key={`w${i}`} nome="whoosh" da={f(k.at) - 5} volume={0.45 * sfx} />) : null}
    </AbsoluteFill>
  );
};

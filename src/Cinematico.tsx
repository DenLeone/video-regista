import React from 'react';
import { AbsoluteFill, Easing, interpolate, Sequence, useCurrentFrame } from 'remotion';
import { loadFont } from '@remotion/google-fonts/Montserrat';
import { Clips, f, Inserti, Sfx, usaFps, volumeSfx } from './comune';
import { Keyword, Piano, W } from './piano';

// Stile "Cinematico" (dai 3 esempi di Denis, 18/10): spot di prodotto, immagini calde con
// vignettatura, sottotitoli bianchi una parola alla volta al centro, titoli Montserrat neri
// e stretti con un'etichetta piccola sopra (marca) e un sottotitolo giallo sotto (il dato).

const { fontFamily: MONTSERRAT } = loadFont('normal', { weights: ['500', '600', '700', '900'], subsets: ['latin'] });
const GIALLO = '#FFE62E';
const FONDO = '#0A0806';
const OMBRA = '0 4px 24px rgba(0,0,0,0.45), 0 1px 3px rgba(0,0,0,0.6)';
// look caldo sulle clip: un filo di contrasto e saturazione, tinta calda leggera; senza
// scurire (Giacca autunnale, 18/10: con l'I-Log convertito il volto quasi non si vedeva)
const LOOK = 'contrast(1.03) saturate(1.08) sepia(0.1)';
const SFX = { whoosh: 0.55, impatto: 0.7 } as const;
const CENTRO_PAROLE = 1100; // y del centro dei sottotitoli
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

type Gruppo = { at: number; fine: number; testo: string };

const pulisci = (w: string) => w.replace(/^[«"“(]+|[»"”).,;:!?…]+$/g, '');
const lettere = (w: string) => (w.match(/[a-zà-ÿ0-9]/gi) || []).length;

// parole → gruppi da mostrare. Le parole di 1–2 lettere ("di", "è", "la") vanno con la
// successiva (da sole lampeggerebbero per un decimo); ogni gruppo resta fino al successivo
// se arriva presto. Durante un titolo i sottotitoli spariscono: si legge il titolo.
// punteggiatura: le parole restano come dette, virgole e punti compresi (stile Esplicativo)
export function gruppiParole(parole: Piano['parole'] = [], titoli: Keyword[] = [], punteggiatura = false): Gruppo[] {
  const out: Gruppo[] = [];
  const pul = (w: string) => (punteggiatura ? w.trim() : pulisci(w));
  for (let i = 0; i < parole.length; i++) {
    let testo = pul(parole[i].w);
    if (!testo || (punteggiatura && !lettere(testo))) continue;
    const at = parole[i].at;
    let fine = at + parole[i].dur;
    const dopo = parole[i + 1];
    if (lettere(testo) <= 2 && dopo && (punteggiatura ? lettere(pul(dopo.w)) : pul(dopo.w)) && dopo.at - fine < 0.35) {
      testo = `${testo} ${pul(dopo.w)}`;
      fine = dopo.at + dopo.dur;
      i++;
    }
    out.push({ at, fine, testo });
  }
  out.forEach((g, k) => {
    const dopo = out[k + 1];
    g.fine = dopo && dopo.at - g.fine < 0.5 ? dopo.at : g.fine + 0.2;
  });
  return out
    .filter((g) => !titoli.some((t) => g.at >= t.at - 0.05 && g.at < t.at + t.dur))
    .map((g) => {
      const t = titoli.find((x) => x.at > g.at && x.at < g.fine);
      return t ? { ...g, fine: t.at } : g;
    })
    .filter((g) => g.fine - g.at >= 0.1);
}

const Parola: React.FC<{ testo: string; len: number }> = ({ testo, len }) => {
  const fr = useCurrentFrame();
  const entra = interpolate(fr, [0, 4], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const esce = interpolate(fr, [len - 2, len], [1, 0], clamp);
  const fs = Math.min(70, (W - 160) / Math.max(1, testo.length * 0.6));
  return (
    <AbsoluteFill>
      <div style={{
        position: 'absolute', top: CENTRO_PAROLE - fs * 0.6, left: 80, right: 80, textAlign: 'center',
        fontFamily: MONTSERRAT, fontWeight: 700, fontSize: fs, lineHeight: 1.2, color: '#FFFFFF', letterSpacing: '-0.01em',
        textShadow: OMBRA, opacity: Math.min(entra, esce), transform: `translateY(${(1 - entra) * 12}px) scale(${0.9 + 0.1 * entra})`,
      }}>
        {testo}
      </div>
    </AbsoluteFill>
  );
};

// titolo: etichetta piccola (tag), nome o dato grande (word), sottotitolo giallo (note).
// Entra a scalare dal basso con una sfocatura che si scioglie, esce sfumando.
const Titolo: React.FC<{ k: Keyword; len: number }> = ({ k, len }) => {
  const fr = useCurrentFrame();
  const esce = interpolate(fr, [len - 7, len], [1, 0], clamp);
  const pezzo = (da: number) => {
    const v = interpolate(fr, [da, da + 9], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
    return { opacity: v * esce, filter: `blur(${(1 - v) * 10 + (1 - esce) * 6}px)`, transform: `translateY(${(1 - v) * 26}px)` };
  };
  const fs = Math.max(72, Math.min(128, (W - 130) / Math.max(1, k.word.length * 0.66)));
  const note = (k.note || '').replace(/^\/\/\s*/, '');
  const top = k.top ?? 380;
  const ombra = interpolate(fr, [0, 9], [0, 1], clamp) * esce;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ opacity: ombra, background: `radial-gradient(ellipse 75% ${fs * 1.6}px at 50% ${top + fs * 0.8}px, rgba(0,0,0,0.38), rgba(0,0,0,0))` }} />
      <div style={{
        position: 'absolute', top, left: 60, right: 60, display: 'flex', flexDirection: 'column', alignItems: 'center',
        textAlign: 'center', fontFamily: MONTSERRAT, color: '#FFFFFF', textShadow: OMBRA,
      }}>
        {k.tag ? <div style={{ fontWeight: 500, fontSize: 40, lineHeight: 1.1, ...pezzo(0) }}>{k.tag}</div> : null}
        <div style={{ fontWeight: 900, fontSize: fs, lineHeight: 0.98, letterSpacing: '-0.045em', ...pezzo(2) }}>{k.word}</div>
        {note ? <div style={{ fontWeight: 600, fontSize: 50, lineHeight: 1.15, color: GIALLO, letterSpacing: '-0.01em', marginTop: 4, ...pezzo(5) }}>{note}</div> : null}
      </div>
    </AbsoluteFill>
  );
};

export const Cinematico: React.FC<Piano> = (piano) => {
  usaFps(piano);
  const sfx = volumeSfx(piano);
  const titoli = piano.keywords;
  const gruppi = gruppiParole(piano.parole, titoli);

  return (
    <AbsoluteFill style={{ backgroundColor: FONDO }}>
      <Clips piano={piano} fondo={FONDO} filtro={LOOK} />
      {/* tinta calda e vignettatura */}
      <AbsoluteFill style={{ backgroundColor: '#FF8A2A', mixBlendMode: 'soft-light', opacity: 0.1 }} />
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 100% 80% at 50% 50%, rgba(0,0,0,0) 62%, rgba(0,0,0,0.28) 100%)' }} />

      <Inserti piano={piano} sfx={sfx} />

      {gruppi.map((g, i) => (
        <Sequence key={`p${i}`} from={f(g.at)} durationInFrames={Math.max(2, f(g.fine) - f(g.at))}>
          <Parola testo={g.testo} len={Math.max(2, f(g.fine) - f(g.at))} />
        </Sequence>
      ))}

      {titoli.map((k, i) => (
        <Sequence key={`t${i}`} from={f(k.at)} durationInFrames={Math.max(1, f(k.dur))}>
          <Titolo k={k} len={Math.max(1, f(k.dur))} />
        </Sequence>
      ))}

      {sfx > 0 ? (
        <>
          {titoli[0] ? <Sfx nome="impatto" da={f(titoli[0].at)} volume={SFX.impatto * sfx} /> : null}
          {/* il soffio arriva al picco quando il titolo è entrato (~0,1 s dopo l'inizio) */}
          {titoli.map((k, i) => <Sfx key={`sw${i}`} nome="whoosh" da={f(k.at) - 6} volume={SFX.whoosh * sfx} />)}
        </>
      ) : null}
    </AbsoluteFill>
  );
};

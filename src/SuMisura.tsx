import React, { useEffect, useState } from 'react';
import { AbsoluteFill, Audio, continueRender, delayRender, Easing, interpolate, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { Clips, f, Sfx, volumeSfx } from './comune';
import { gruppiParole } from './Cinematico';
import { durataTotale, FontStile, GraficaStile, Keyword, Piano, Posizione, W } from './piano';

// Stile "su misura": tutta la grafica arriva da Drive (Stili/<nome>/stile.txt, letto da
// scripts/stile-su-misura.mjs) dentro piano.grafica. Nessun codice per uno stile nuovo.

const BASE: GraficaStile = {
  nome: 'Su misura', apertura: 'normale', fontApertura: { famiglia: 'Inter Tight', peso: 800 }, coloreApertura: '#FFD86B',
  sottotitoli: 'frase', fontSottotitoli: { famiglia: 'Montserrat', peso: 700 }, coloreSottotitoli: '#FFFFFF', maiuscolo: false,
  posizione: 'basso', dimensione: 56, titoli: true, fontTitoli: { famiglia: 'Montserrat', peso: 900 }, coloreTitoli: '#FFFFFF',
  accento: '#FFE62E', posTitoli: 'alto', look: 'naturale', biancoNero: 'no', vignetta: 0.2, sfx: true, musica: null,
};
const LOOK: Record<GraficaStile['look'], string | undefined> = {
  naturale: undefined,
  caldo: 'contrast(1.03) saturate(1.08) sepia(0.1)',
  freddo: 'contrast(1.04) saturate(0.95) hue-rotate(-6deg)',
  'bianco e nero': 'grayscale(1) contrast(1.08)',
};
const Y: Record<Posizione, number> = { alto: 420, centro: 1060, basso: 1440 };
const OMBRA = '0 3px 14px rgba(0,0,0,0.55), 0 1px 3px rgba(0,0,0,0.7)';
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const famiglia = (ft: FontStile) => `"${ft.famiglia}", "Montserrat", sans-serif`;

// carica i font dello stile prima del primo fotogramma: file messi in asset/ (copiati in
// public/stili/…) oppure Google Fonts per nome. Se un font non arriva si va avanti col ripiego.
function useFont(fonts: FontStile[]) {
  const [attesa] = useState(() => delayRender('font dello stile'));
  useEffect(() => {
    const unici = [...new Map(fonts.map((ft) => [`${ft.famiglia}|${ft.peso}|${ft.file || ''}`, ft])).values()];
    const carica = async (ft: FontStile) => {
      if (ft.file) {
        const face = new FontFace(ft.famiglia, `url(${staticFile(ft.file)})`, { weight: String(ft.peso) });
        document.fonts.add(await face.load());
        return;
      }
      const nome = encodeURIComponent(ft.famiglia).replace(/%20/g, '+');
      for (const href of [`https://fonts.googleapis.com/css2?family=${nome}:wght@${ft.peso}&display=block`, `https://fonts.googleapis.com/css2?family=${nome}&display=block`]) {
        const l = document.createElement('link');
        l.rel = 'stylesheet';
        l.href = href;
        const ok = await new Promise<boolean>((fatto) => { l.onload = () => fatto(true); l.onerror = () => fatto(false); document.head.appendChild(l); });
        if (ok) break; // peso non disponibile: riprovo senza
      }
      await document.fonts.load(`${ft.peso} 40px "${ft.famiglia}"`);
    };
    const limite = new Promise((fatto) => setTimeout(fatto, 15000));
    Promise.race([Promise.allSettled(unici.map(carica)), limite]).finally(() => continueRender(attesa));
  }, []);
}

type Pezzo = { at: number; fine: number; testo: string };
const pulisci = (w: string) => w.replace(/^[«"“(]+|[»"”).,;:…]+$/g, '');

// sottotitoli a frasi brevi: 2–5 parole, si va a capo su pause e punteggiatura
function frasiBrevi(parole: Piano['parole'] = [], maxParole = 5, maxCar = 28): Pezzo[] {
  const out: Pezzo[] = [];
  let cur: { at: number; fine: number; w: string[] } | null = null;
  parole.forEach((p, i) => {
    const prima = parole[i - 1];
    const stacco = prima && (p.at - (prima.at + prima.dur) > 0.35 || /[.,;:!?…]$/.test(prima.w));
    const lungo = cur && (cur.w.length >= maxParole || cur.w.join(' ').length + p.w.length + 1 > maxCar);
    if (!cur || stacco || lungo) { if (cur) out.push({ at: cur.at, fine: cur.fine, testo: cur.w.join(' ') }); cur = { at: p.at, fine: p.at + p.dur, w: [] }; }
    cur!.w.push(pulisci(p.w));
    cur!.fine = p.at + p.dur;
  });
  if (cur) out.push({ at: (cur as { at: number }).at, fine: (cur as { fine: number }).fine, testo: (cur as { w: string[] }).w.join(' ') });
  out.forEach((g, k) => { const dopo = out[k + 1]; g.fine = dopo && dopo.at - g.fine < 0.5 ? dopo.at : g.fine + 0.25; });
  return out.filter((g) => g.testo.trim());
}

const Sottotitolo: React.FC<{ testo: string; len: number; g: GraficaStile }> = ({ testo, len, g }) => {
  const fr = useCurrentFrame();
  const entra = interpolate(fr, [0, 4], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const esce = interpolate(fr, [len - 2, len], [1, 0], clamp);
  const t = g.maiuscolo ? testo.toUpperCase() : testo;
  const fs = Math.min(g.dimensione, (W - 140) / Math.max(1, t.length * 0.52));
  return (
    <AbsoluteFill>
      <div style={{
        position: 'absolute', top: Y[g.posizione] - fs * 0.6, left: 70, right: 70, textAlign: 'center',
        fontFamily: famiglia(g.fontSottotitoli), fontWeight: g.fontSottotitoli.peso, fontSize: fs, lineHeight: 1.2,
        color: g.coloreSottotitoli, textShadow: OMBRA, opacity: Math.min(entra, esce), transform: `translateY(${(1 - entra) * 10}px)`,
      }}>
        {t}
      </div>
    </AbsoluteFill>
  );
};

// apertura a lettere enormi: le parole si accumulano riga per riga (entrano con una sfocatura
// che si scioglie); a una pausa o dopo 4 righe si ricomincia da un blocco nuovo
type Blocco = { at: number; fine: number; parole: { w: string; at: number }[] };
function blocchiApertura(parole: Piano['parole'] = []): Blocco[] {
  if (!parole.length) return [];
  // l'apertura dura la prima frase (fino al primo punto), almeno 1,5 s e al massimo 5 s
  const fineFrase = parole.find((p) => /[.!?]$/.test(p.w));
  const limite = Math.min(5, Math.max(1.5, fineFrase ? fineFrase.at + fineFrase.dur : 5));
  const usate = parole.filter((p) => p.at < limite);
  const blocchi: Blocco[] = [];
  let cur: Blocco | null = null;
  usate.forEach((p, i) => {
    const prima = usate[i - 1];
    const stacco = prima && (p.at - (prima.at + prima.dur) > 0.4 || /[,;:]$/.test(prima.w));
    if (!cur || stacco || cur.parole.length >= 8) { cur = { at: p.at, fine: p.at + p.dur, parole: [] }; blocchi.push(cur); }
    cur.parole.push({ w: pulisci(p.w).toUpperCase(), at: p.at });
    cur.fine = p.at + p.dur;
  });
  blocchi.forEach((b, k) => { const dopo = blocchi[k + 1]; b.fine = dopo ? dopo.at : Math.max(b.fine + 0.4, limite); });
  return blocchi;
}

const Apertura: React.FC<{ b: Blocco; len: number; g: GraficaStile }> = ({ b, len, g }) => {
  const fr = useCurrentFrame();
  const esce = interpolate(fr, [len - 4, len], [1, 0], clamp);
  // righe da ~12 caratteri; la parola più lunga del blocco decide la dimensione
  const righe: { w: string; at: number }[][] = [[]];
  for (const p of b.parole) {
    const r = righe[righe.length - 1];
    if (r.length && [...r, p].map((x) => x.w).join(' ').length > 13) righe.push([p]);
    else r.push(p);
  }
  const lunga = Math.max(...righe.map((r) => r.map((x) => x.w).join(' ').length));
  const fs = Math.max(80, Math.min(150, (W - 130) / Math.max(1, lunga * 0.6)));
  return (
    <AbsoluteFill style={{ opacity: esce }}>
      <div style={{ position: 'absolute', top: 240, left: 64, right: 64, fontFamily: famiglia(g.fontApertura), fontWeight: g.fontApertura.peso, fontSize: fs, lineHeight: 0.95, letterSpacing: '-0.02em', color: g.coloreApertura, textShadow: '0 6px 30px rgba(0,0,0,0.35)' }}>
        {righe.map((r, i) => (
          <div key={i}>
            {r.map((p, j) => {
              const da = f(p.at - b.at);
              const v = interpolate(fr, [da, da + 5], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
              return <span key={j} style={{ display: 'inline-block', marginRight: '0.25em', opacity: v, filter: `blur(${(1 - v) * 12}px)`, transform: `translateY(${(1 - v) * 30}px)` }}>{p.w}</span>;
            })}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

const Titolo: React.FC<{ k: Keyword; len: number; g: GraficaStile }> = ({ k, len, g }) => {
  const fr = useCurrentFrame();
  const esce = interpolate(fr, [len - 7, len], [1, 0], clamp);
  const pezzo = (da: number) => {
    const v = interpolate(fr, [da, da + 9], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
    return { opacity: v * esce, filter: `blur(${(1 - v) * 10 + (1 - esce) * 6}px)`, transform: `translateY(${(1 - v) * 26}px)` };
  };
  const fs = Math.max(72, Math.min(124, (W - 130) / Math.max(1, k.word.length * 0.66)));
  const top = k.top ?? (g.posTitoli === 'alto' ? 380 : g.posTitoli === 'centro' ? 820 : 1250);
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', top, left: 60, right: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', color: g.coloreTitoli, textShadow: OMBRA }}>
        {k.tag ? <div style={{ fontFamily: famiglia(g.fontSottotitoli), fontWeight: 500, fontSize: 40, ...pezzo(0) }}>{k.tag}</div> : null}
        <div style={{ fontFamily: famiglia(g.fontTitoli), fontWeight: g.fontTitoli.peso, fontSize: fs, lineHeight: 0.98, letterSpacing: '-0.04em', ...pezzo(2) }}>{k.word}</div>
        {k.note ? <div style={{ fontFamily: famiglia(g.fontSottotitoli), fontWeight: 600, fontSize: 48, color: g.accento, marginTop: 4, ...pezzo(5) }}>{k.note.replace(/^\/\/\s*/, '')}</div> : null}
      </div>
    </AbsoluteFill>
  );
};

export const SuMisura: React.FC<Piano> = (piano) => {
  const g: GraficaStile = { ...BASE, ...(piano.grafica || {}) };
  useFont([g.fontApertura, g.fontSottotitoli, g.fontTitoli]);
  const totale = f(durataTotale(piano));
  const sfx = g.sfx ? volumeSfx(piano) : 0;
  const titoli = g.titoli ? piano.keywords : [];
  const aperture = g.apertura === 'grande' ? blocchiApertura(piano.parole) : [];
  const fineApertura = aperture.length ? aperture[aperture.length - 1].fine : 0;
  const dopoApertura = (piano.parole || []).filter((p) => p.at >= fineApertura - 0.01);
  const pezzi = g.sottotitoli === 'nessuno' ? []
    : g.sottotitoli === 'parola' ? gruppiParole(dopoApertura, titoli)
    : frasiBrevi(dopoApertura).filter((p) => !titoli.some((t) => p.at >= t.at - 0.05 && p.at < t.at + t.dur));
  const m = g.musica;

  return (
    <AbsoluteFill style={{ backgroundColor: '#0B0B0B' }}>
      <Clips piano={piano} fondo="#0B0B0B" filtro={LOOK[g.look]} />
      {g.vignetta > 0 ? <AbsoluteFill style={{ background: `radial-gradient(ellipse 100% 80% at 50% 50%, rgba(0,0,0,0) 60%, rgba(0,0,0,${g.vignetta.toFixed(2)}) 100%)` }} /> : null}

      {aperture.map((b, i) => (
        <Sequence key={`a${i}`} from={f(b.at)} durationInFrames={Math.max(2, f(b.fine) - f(b.at))}>
          <Apertura b={b} len={Math.max(2, f(b.fine) - f(b.at))} g={g} />
        </Sequence>
      ))}
      {pezzi.map((p, i) => (
        <Sequence key={`s${i}`} from={f(p.at)} durationInFrames={Math.max(2, f(p.fine) - f(p.at))}>
          <Sottotitolo testo={p.testo} len={Math.max(2, f(p.fine) - f(p.at))} g={g} />
        </Sequence>
      ))}
      {titoli.map((k, i) => (
        <Sequence key={`t${i}`} from={f(k.at)} durationInFrames={Math.max(1, f(k.dur))}>
          <Titolo k={k} len={Math.max(1, f(k.dur))} g={g} />
        </Sequence>
      ))}

      {m ? <Audio src={staticFile(m.file)} loop volume={(fr) => m.volume * Math.min(1, fr / 15, (totale - fr) / 30)} /> : null}
      {sfx > 0 ? (
        <>
          {aperture[0] ? <Sfx nome="whoosh" da={f(aperture[0].at) - 6} volume={0.45 * sfx} /> : null}
          {titoli.map((k, i) => <Sfx key={`sw${i}`} nome="whoosh" da={f(k.at) - 6} volume={0.55 * sfx} />)}
        </>
      ) : null}
    </AbsoluteFill>
  );
};

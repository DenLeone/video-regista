import React, { useEffect, useState } from 'react';
import { AbsoluteFill, Audio, continueRender, delayRender, Easing, interpolate, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { Clips, f, Inserti, Ritagli, Sfx, volumeSfx } from './comune';
import { gruppiParole } from './Cinematico';
import { durataTotale, FontStile, GraficaStile, Keyword, Piano, Posizione, W } from './piano';

// Stile "su misura": tutta la grafica arriva da Drive (Stili/<nome>/stile.txt, letto da
// scripts/stile-su-misura.mjs) dentro piano.grafica. Nessun codice per uno stile nuovo.
// Ordine dei livelli: clip → scritte grandi → persona ritagliata (le scritte passano dietro) →
// inserti → sottotitoli e titoli.

const BASE: GraficaStile = {
  nome: 'Su misura', apertura: 'normale', fontApertura: { famiglia: 'Inter Tight', peso: 800 }, coloreApertura: '#FFD86B',
  sottotitoli: 'frase', fontSottotitoli: { famiglia: 'Montserrat', peso: 700 }, coloreSottotitoli: '#FFFFFF', maiuscolo: false,
  posizione: 'basso', dimensione: 56, titoli: true, fontTitoli: { famiglia: 'Montserrat', peso: 900 }, coloreTitoli: '#FFFFFF',
  accento: '#FFE62E', posTitoli: 'alto', tipoTitoli: 'titoli', fontCorsivo: { famiglia: 'Playfair Display', peso: 400, corsivo: true },
  dietro: false, look: 'naturale', biancoNero: 'no', vignetta: 0.2, sfx: true, musica: null,
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
const stileFont = (ft: FontStile) => ({ fontFamily: famiglia(ft), fontWeight: ft.peso, fontStyle: ft.corsivo ? 'italic' : 'normal' });

// carica i font dello stile prima del primo fotogramma: file messi in asset/ (copiati in
// public/stili/…) oppure Google Fonts per nome. Se un font non arriva si va avanti col ripiego.
function useFont(fonts: FontStile[]) {
  const [attesa] = useState(() => delayRender('font dello stile'));
  useEffect(() => {
    const unici = [...new Map(fonts.map((ft) => [`${ft.famiglia}|${ft.peso}|${ft.corsivo}|${ft.file || ''}`, ft])).values()];
    const carica = async (ft: FontStile) => {
      const stile = ft.corsivo ? 'italic' : 'normal';
      if (ft.file) {
        const face = new FontFace(ft.famiglia, `url(${staticFile(ft.file)})`, { weight: String(ft.peso), style: stile });
        document.fonts.add(await face.load());
        return;
      }
      const nome = encodeURIComponent(ft.famiglia).replace(/%20/g, '+');
      const varianti = ft.corsivo
        ? [`${nome}:ital,wght@1,${ft.peso}`, `${nome}:ital@1`, nome]
        : [`${nome}:wght@${ft.peso}`, nome];
      for (const v of varianti) {
        const l = document.createElement('link');
        l.rel = 'stylesheet';
        l.href = `https://fonts.googleapis.com/css2?family=${v}&display=block`;
        const ok = await new Promise<boolean>((fatto) => { l.onload = () => fatto(true); l.onerror = () => fatto(false); document.head.appendChild(l); });
        if (ok) break; // variante non disponibile: riprovo più semplice
      }
      await document.fonts.load(`${stile} ${ft.peso} 40px "${ft.famiglia}"`);
    };
    const limite = new Promise((fatto) => setTimeout(fatto, 15000));
    Promise.race([Promise.allSettled(unici.map(carica)), limite]).finally(() => continueRender(attesa));
  }, []);
}

type Pezzo = { at: number; fine: number; testo: string };
const pulisci = (w: string) => w.replace(/^[«"“(]+|[»"”).,;:…]+$/g, '');
const norm = (w: string) => pulisci(w).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

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
  const c = cur as { at: number; fine: number; w: string[] } | null;
  if (c) out.push({ at: c.at, fine: c.fine, testo: c.w.join(' ') });
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
        ...stileFont(g.fontSottotitoli), fontSize: fs, lineHeight: 1.2,
        color: g.coloreSottotitoli, textShadow: OMBRA, opacity: Math.min(entra, esce), transform: `translateY(${(1 - entra) * 10}px)`,
      }}>
        {t}
      </div>
    </AbsoluteFill>
  );
};

// ---------- scritte a due livelli ----------
// righe "piccole" in corsivo (le parole di raccordo) e righe "grandi" (le parole chiave) che
// entrano parola per parola con una sfocatura che si scioglie ed escono sfocandosi
type Riga = { tipo: 'piccolo' | 'grande'; parole: { w: string; da: number }[] };
type Blocco = { at: number; fine: number; righe: Riga[] };

// parole di raccordo italiane: restano piccole se l'AI non ha indicato le parole da ingrandire
const RACCORDO = new Set(('il lo la i gli le l un uno una un\' di a da in con su per tra fra e ed o ma che chi cui non mi ti si ci vi ne ' +
  'del dello della dei degli delle al allo alla ai agli alle dal dallo dalla dai dagli dalle nel nello nella nei negli nelle sul sullo ' +
  'sulla sui sugli sulle col coi come quando se perche anche gia piu molto tanto poi cosi io tu lui lei noi voi loro me te sé mio mia ' +
  'tuo tua suo sua nostro vostro questo questa questi queste quello quella quelli quelle ho hai ha abbiamo avete hanno sono sei e ' +
  'siamo siete era ero erano essere avere fare fatto sto stai sta stiamo state stanno ce c sempre ancora proprio solo tutto tutti ' +
  'tutte qui qua li la cosa cose dire detto parla parlare vado va andare oggi adesso ora allora quindi pero dove').split(/\s+/));

function righeDi(parole: { w: string; at: number }[], enfasi: Set<string>, inizio: number): Riga[] {
  const righe: Riga[] = [];
  for (const p of parole) {
    const n = norm(p.w);
    const grande = enfasi.size ? enfasi.has(n) : !RACCORDO.has(n) && (n.length >= 5 || /\d/.test(n));
    const tipo: Riga['tipo'] = grande ? 'grande' : 'piccolo';
    const ultima = righe[righe.length - 1];
    const testo = (ultima?.parole.map((x) => x.w).join(' ').length || 0) + p.w.length;
    if (ultima && ultima.tipo === tipo && testo <= (tipo === 'grande' ? 12 : 22)) ultima.parole.push({ w: pulisci(p.w), da: p.at - inizio });
    else righe.push({ tipo, parole: [{ w: pulisci(p.w), da: p.at - inizio }] });
  }
  return righe;
}

// fine dell'apertura: la prima frase (fino al primo punto) se sta in 5 s, altrimenti l'ultima
// virgola o pausa entro 5 s, mai a metà frase ("…giubbotto e questo qui me", Giacca autunnale
// 19/10); almeno 1,5 s. Stessa regola in ritagliPersona (scripts/regista.mjs)
export function fineApertura(parole: Piano['parole'] = []): number {
  const fineFrase = parole.find((p) => /[.!?]$/.test(p.w));
  if (fineFrase && fineFrase.at + fineFrase.dur <= 5) return Math.max(1.5, fineFrase.at + fineFrase.dur);
  const pause = parole.filter((p, i) => p.at + p.dur <= 5 && p.at + p.dur >= 1.5 && (/[,;:.!?]$/.test(p.w) || (parole[i + 1] && parole[i + 1].at - (p.at + p.dur) > 0.35)));
  return pause.length ? pause[pause.length - 1].at + pause[pause.length - 1].dur : 5;
}

// l'apertura: si va a un blocco nuovo a ogni pausa o virgola, o dopo 7 parole
export function blocchiApertura(parole: Piano['parole'] = [], enfasi: string[] = []): Blocco[] {
  if (!parole.length) return [];
  const limite = fineApertura(parole);
  const usate = parole.filter((p) => p.at < limite);
  const enf = new Set(enfasi.map(norm));
  const gruppi: { at: number; fine: number; parole: { w: string; at: number }[] }[] = [];
  usate.forEach((p, i) => {
    const prima = usate[i - 1];
    const stacco = prima && (p.at - (prima.at + prima.dur) > 0.4 || /[,;:]$/.test(prima.w));
    const cur = gruppi[gruppi.length - 1];
    if (!cur || stacco || cur.parole.length >= 7) gruppi.push({ at: p.at, fine: p.at + p.dur, parole: [{ w: p.w, at: p.at }] });
    else { cur.parole.push({ w: p.w, at: p.at }); cur.fine = p.at + p.dur; }
  });
  return gruppi.map((g, k) => ({ at: g.at, fine: gruppi[k + 1] ? gruppi[k + 1].at : Math.max(g.fine + 0.4, limite), righe: righeDi(g.parole, enf, g.at) }));
}

// con le scritte dietro alla persona il blocco scende all'altezza di testa e spalle (come negli
// esempi del Narrativo); senza, resta nel terzo alto
const ScrittaDueLivelli: React.FC<{ righe: Riga[]; len: number; g: GraficaStile; top?: number }> = ({ righe, len, g, top }) => {
  top = top ?? (g.dietro ? 420 : 240);
  const fr = useCurrentFrame();
  const esce = interpolate(fr, [len - 5, len], [0, 1], clamp);
  const lungaGrande = Math.max(1, ...righe.filter((r) => r.tipo === 'grande').map((r) => r.parole.map((x) => x.w).join(' ').length));
  const fsGrande = Math.max(110, Math.min(250, 940 / (lungaGrande * 0.5)));
  const vistaGrande = righe.findIndex((r) => r.tipo === 'grande');
  return (
    <AbsoluteFill style={{ opacity: 1 - esce, filter: `blur(${esce * 10}px)` }}>
      {/* il blocco è largo quanto le parole grandi: il corsivo parte dal loro bordo sinistro
          (o finisce sul destro, sotto), non dal bordo dello schermo (Giacca autunnale, 19/10) */}
      <div style={{ position: 'absolute', top, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
      <div style={{ display: 'inline-flex', flexDirection: 'column', maxWidth: W - 140, color: g.coloreApertura, textShadow: '0 6px 30px rgba(0,0,0,0.3)' }}>
        {righe.map((r, i) => (
          <div key={i} style={r.tipo === 'grande'
            ? { ...stileFont(g.fontApertura), fontSize: fsGrande, lineHeight: 0.92, letterSpacing: '-0.01em', textAlign: 'center', textTransform: 'uppercase' }
            // il corsivo è sottile: un'ombra più stretta lo stacca dal cielo chiaro
            : { ...stileFont(g.fontCorsivo), fontSize: 64, lineHeight: 1.15, whiteSpace: 'nowrap', textAlign: vistaGrande >= 0 && i > vistaGrande ? 'right' : 'left', marginBottom: 6,
              textShadow: '0 2px 12px rgba(0,0,0,0.55), 0 1px 3px rgba(0,0,0,0.45)' }}>
            {r.parole.map((p, j) => {
              const da = f(p.da);
              const v = interpolate(fr, [da, da + 6], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
              return (
                <span key={j} style={{ display: 'inline-block', marginRight: r.tipo === 'grande' ? '0.18em' : '0.28em', opacity: v,
                  filter: `blur(${(1 - v) * (r.tipo === 'grande' ? 16 : 8)}px)`, transform: `translateY(${(1 - v) * 24}px) scale(${r.tipo === 'grande' ? 1.08 - 0.08 * v : 1})` }}>
                  {p.w}
                </span>
              );
            })}
          </div>
        ))}
      </div>
      </div>
    </AbsoluteFill>
  );
};

// frase forte dell'AI: tag = corsivo che introduce, word = parole enormi, note = coda in corsivo
const righeFrase = (k: Keyword): Riga[] => [
  ...(k.tag ? [{ tipo: 'piccolo' as const, parole: k.tag.split(/\s+/).map((w) => ({ w, da: 0 })) }] : []),
  { tipo: 'grande', parole: k.word.split(/\s+/).map((w, i) => ({ w, da: 0.15 + i * 0.12 })) },
  ...(k.note ? [{ tipo: 'piccolo' as const, parole: k.note.replace(/^\/\/\s*/, '').split(/\s+/).map((w) => ({ w, da: 0.45 })) }] : []),
];

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
        {k.tag ? <div style={{ ...stileFont(g.fontSottotitoli), fontWeight: 500, fontSize: 40, ...pezzo(0) }}>{k.tag}</div> : null}
        <div style={{ ...stileFont(g.fontTitoli), fontSize: fs, lineHeight: 0.98, letterSpacing: '-0.04em', ...pezzo(2) }}>{k.word}</div>
        {k.note ? <div style={{ ...stileFont(g.fontSottotitoli), fontWeight: 600, fontSize: 48, color: g.accento, marginTop: 4, ...pezzo(5) }}>{k.note.replace(/^\/\/\s*/, '')}</div> : null}
      </div>
    </AbsoluteFill>
  );
};

export const SuMisura: React.FC<Piano> = (piano) => {
  const g: GraficaStile = { ...BASE, ...(piano.grafica || {}) };
  useFont([g.fontApertura, g.fontSottotitoli, g.fontTitoli, g.fontCorsivo]);
  const totale = f(durataTotale(piano));
  const sfx = g.sfx ? volumeSfx(piano) : 0;
  const frasi = g.titoli && g.tipoTitoli === 'frasi' ? piano.keywords : [];
  const titoli = g.titoli && g.tipoTitoli === 'titoli' ? piano.keywords : [];
  const aperture = g.apertura === 'grande' ? blocchiApertura(piano.parole, piano.enfasi) : [];
  const fineApertura = aperture.length ? aperture[aperture.length - 1].fine : 0;
  const dopoApertura = (piano.parole || []).filter((p) => p.at >= fineApertura - 0.01);
  const occupato = [...titoli, ...frasi];
  const pezzi = g.sottotitoli === 'nessuno' ? []
    : g.sottotitoli === 'parola' ? gruppiParole(dopoApertura, occupato)
    : frasiBrevi(dopoApertura).filter((p) => !occupato.some((t) => p.at >= t.at - 0.05 && p.at < t.at + t.dur));
  const m = g.musica;
  const len = (a: number, b: number) => Math.max(2, f(b) - f(a));

  return (
    <AbsoluteFill style={{ backgroundColor: '#0B0B0B' }}>
      <Clips piano={piano} fondo="#0B0B0B" filtro={LOOK[g.look]} />
      {g.vignetta > 0 ? <AbsoluteFill style={{ background: `radial-gradient(ellipse 100% 80% at 50% 50%, rgba(0,0,0,0) 60%, rgba(0,0,0,${g.vignetta.toFixed(2)}) 100%)` }} /> : null}

      {aperture.map((b, i) => (
        <Sequence key={`a${i}`} from={f(b.at)} durationInFrames={len(b.at, b.fine)}>
          <ScrittaDueLivelli righe={b.righe} len={len(b.at, b.fine)} g={g} />
        </Sequence>
      ))}
      {frasi.map((k, i) => (
        <Sequence key={`f${i}`} from={f(k.at)} durationInFrames={Math.max(2, f(k.dur))}>
          <ScrittaDueLivelli righe={righeFrase(k)} len={Math.max(2, f(k.dur))} g={g} top={k.top} />
        </Sequence>
      ))}
      {g.dietro ? <Ritagli piano={piano} filtro={LOOK[g.look]} /> : null}
      <Inserti piano={piano} sfx={sfx} />

      {pezzi.map((p, i) => (
        <Sequence key={`s${i}`} from={f(p.at)} durationInFrames={len(p.at, p.fine)}>
          <Sottotitolo testo={p.testo} len={len(p.at, p.fine)} g={g} />
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
          {aperture.map((b, i) => <Sfx key={`sa${i}`} nome="whoosh" da={f(b.at) - 6} volume={(i ? 0.3 : 0.45) * sfx} />)}
          {aperture.flatMap((b, i) => b.righe.filter((r) => r.tipo === 'grande').map((r, j) => <Sfx key={`pa${i}-${j}`} nome="colpo" da={f(b.at + r.parole[0].da)} volume={0.5 * sfx} />))}
          {frasi.map((k, i) => <Sfx key={`sf${i}`} nome="whoosh" da={f(k.at) - 6} volume={0.45 * sfx} />)}
          {frasi.map((k, i) => <Sfx key={`pf${i}`} nome="colpo" da={f(k.at + 0.15)} volume={0.5 * sfx} />)}
          {titoli.map((k, i) => <Sfx key={`st${i}`} nome="whoosh" da={f(k.at) - 6} volume={0.55 * sfx} />)}
        </>
      ) : null}
    </AbsoluteFill>
  );
};

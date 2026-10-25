import React, { useEffect, useState } from 'react';
import { AbsoluteFill, Audio, continueRender, delayRender, Easing, interpolate, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { Clips, f, Inserti, Ritagli, Sfx, usaFps, volumeSfx } from './comune';
import { gruppiParole } from './Cinematico';
import { durataTotale, FontStile, GraficaStile, Keyword, Piano, Posizione, W } from './piano';
import { clamp, norm, OMBRA, pulisci, RACCORDO, stileFont, larghezzaTesto } from './testo';
import { BlocchiMotion, blocchiParlato, Cartello, Firma, Fumi, tagliFumo } from './Motion';

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
  teal: undefined, // LUT teal e arancio già applicata in ffmpeg
  'chiaro caldo': undefined, // in ffmpeg: volto ben esposto e luce calda (regista.mjs)
};
const Y: Record<Posizione, number> = { alto: 420, centro: 1060, basso: 1440 };
// sottotitoli: contorno scuro stretto in più, leggibili anche sui B-roll chiari (tasti lilla, cielo)
const OMBRA_SOTTO = '0 0 2px rgba(0,0,0,0.75), 0 2px 8px rgba(0,0,0,0.55), 0 3px 16px rgba(0,0,0,0.45)';

// carica i font dello stile prima del primo fotogramma: file messi in asset/ (copiati in
// public/stili/…) oppure Google Fonts per nome. Se un font non arriva si va avanti col ripiego.
export function useFont(fonts: FontStile[]) {
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

// sottotitoli a frasi brevi: 2–5 parole, si va a capo su pause e punteggiatura. Quando si va a
// capo solo per lunghezza, una parola "debole" in fondo (articolo, preposizione, congiunzione) passa
// alla riga dopo: "una tastiera 100% quindi col | pad numerico" → "…quindi | col pad numerico"
const DEBOLI = new Set(('il lo la i gli le l un uno una di a da in con su per tra fra e ed o ma che del dello della dei degli delle ' +
  'al allo alla ai agli alle dal dallo dalla dai nel nello nella nei sul sulla col coi mio mia tuo tua suo sua non').split(' '));
function frasiBrevi(parole: Piano['parole'] = [], maxParole = 5, maxCar = 28): Pezzo[] {
  type P = { w: string; at: number; fine: number };
  const out: Pezzo[] = [];
  const chiudi = (ws: P[]) => { if (ws.length) out.push({ at: ws[0].at, fine: ws[ws.length - 1].fine, testo: ws.map((x) => x.w).join(' ') }); };
  let cur: P[] = [];
  parole.forEach((p, i) => {
    const prima = parole[i - 1];
    const stacco = prima && (p.at - (prima.at + prima.dur) > 0.35 || /[.,;:!?…]$/.test(prima.w));
    const lungo = cur.length >= maxParole || cur.map((x) => x.w).join(' ').length + p.w.length + 1 > maxCar;
    if (cur.length && (stacco || lungo)) {
      let resto: P[] = [];
      while (!stacco && cur.length > 1 && DEBOLI.has(norm(cur[cur.length - 1].w))) resto.unshift(cur.pop() as P);
      chiudi(cur);
      cur = resto;
    }
    cur.push({ w: pulisci(p.w), at: p.at, fine: p.at + p.dur });
  });
  chiudi(cur);
  out.forEach((g, k) => { const dopo = out[k + 1]; g.fine = dopo && dopo.at - g.fine < 0.5 ? dopo.at : g.fine + 0.25; });
  return out.filter((g) => g.testo.trim());
}

const caratteri = (testo: string, g: GraficaStile) => (g.maiuscolo ? testo.toUpperCase() : g.minuscolo ? testo.toLowerCase() : testo);

const Sottotitolo: React.FC<{ testo: string; len: number; g: GraficaStile }> = ({ testo, len, g }) => {
  const fr = useCurrentFrame();
  const entra = interpolate(fr, [0, 4], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const esce = interpolate(fr, [len - 2, len], [1, 0], clamp);
  const t = caratteri(testo, g);
  const fs = Math.min(g.dimensione, (W - 140) / Math.max(1, t.length * 0.52));
  return (
    <AbsoluteFill>
      <div style={{
        position: 'absolute', top: Y[g.posizione] - fs * 0.6, left: 70, right: 70, textAlign: 'center',
        ...stileFont(g.fontSottotitoli), fontSize: fs, lineHeight: 1.2,
        color: g.coloreSottotitoli, textShadow: OMBRA_SOTTO, opacity: Math.min(entra, esce), transform: `translateY(${(1 - entra) * 10}px)`,
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
  // l'AI può dare enfasi di più parole ("SPACE ONE"): conta ogni parola (Space One, 25/10)
  const enf = new Set(enfasi.flatMap((e) => String(e).split(/\s+/)).filter(Boolean).map(norm));
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
  // stima a 0,5 em a lettera, poi la misura vera nel font: "SOUNDCORE" in Oswald 700 usciva dai
  // bordi (Space One, 25/10). Le righe grandi stanno sempre in W - 140
  const stima = Math.max(110, Math.min(250, 940 / (lungaGrande * 0.5)));
  const misure = righe.filter((r) => r.tipo === 'grande').map((r) => {
    const testo = r.parole.map((x) => x.w.toUpperCase()).join(' ');
    const l = larghezzaTesto(testo, g.fontApertura, stima);
    return l === null ? null : l + stima * 0.18 * r.parole.length;
  });
  const piu = Math.max(0, ...misure.map((l) => l ?? 0));
  const fsGrande = piu > W - 140 ? Math.floor(stima * (W - 140) / piu) : stima;
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

// ---------- frasi forti dette, parola per parola (Esplicativo, 20/10) ----------
// dagli esempi di Denis (reel tech americani): le frasi che reggono il video escono enormi al
// centro, una parola alla volta mentre le dice, minuscole e con la punteggiatura; il resto del
// parlato resta piccolo in basso. La parola entra con un piccolo scatto (da 82% a 100%)
const Y_GRANDE: Record<Posizione, number> = { alto: 560, centro: 980, basso: 1300 };
// righe di al massimo ~12 caratteri (le etichette sui B-roll muti: "wireless e bluetooth")
function righeEtichetta(t: string, max = 12): string[] {
  const righe: string[] = [];
  for (const p of t.split(/\s+/).filter(Boolean)) {
    const ultima = righe[righe.length - 1];
    if (ultima && ultima.length + 1 + p.length <= max) righe[righe.length - 1] = `${ultima} ${p}`;
    else righe.push(p);
  }
  return righe.slice(0, 3);
}
const ParolaGrande: React.FC<{ testo: string; len: number; ultima: boolean; g: GraficaStile }> = ({ testo, len, ultima, g }) => {
  const fr = useCurrentFrame();
  const entra = interpolate(fr, [0, 3], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.7)) });
  const esce = ultima ? interpolate(fr, [len - 3, len], [1, 0], clamp) : 1;
  const righe = righeEtichetta(caratteri(testo, g));
  // ~0,62 em a lettera nel Montserrat ExtraBold minuscolo: la riga non esce mai dai bordi
  const fs = Math.min(150, (W - 120) / Math.max(1, Math.max(...righe.map((r) => r.length)) * 0.62));
  return (
    <AbsoluteFill>
      <div style={{
        position: 'absolute', top: Y_GRANDE[g.posTitoli] - fs * (0.6 + 0.5 * (righe.length - 1)), left: 50, right: 50, textAlign: 'center',
        ...stileFont(g.fontTitoli), fontSize: fs, lineHeight: 1.0, letterSpacing: '-0.02em', color: g.coloreTitoli,
        textShadow: '0 6px 24px rgba(0,0,0,0.42), 0 2px 5px rgba(0,0,0,0.35)',
        opacity: Math.min(1, entra * 1.6) * esce, transform: `scale(${0.82 + 0.18 * entra})`,
      }}>
        {righe.map((r, i) => <div key={i} style={{ whiteSpace: 'nowrap' }}>{r}</div>)}
      </div>
    </AbsoluteFill>
  );
};

// le parole dette dentro ogni frase forte, a gruppi come i sottotitoli (le parole di 1–2
// lettere vanno con la successiva), ognuna fino alla successiva e l'ultima fino alla fine
function paroleGrandi(parole: Piano['parole'] = [], frasi: Keyword[] = []) {
  return frasi.flatMap((k) => {
    const dentro = parole.filter((p) => p.at >= k.at - 0.05 && p.at < k.at + k.dur);
    // sui B-roll senza voce la scritta dell'AI, tutta insieme: un'etichetta di cosa si vede
    // (980, 20/10: "knob volume" e "wireless e bluetooth" sulla carrellata finale non uscivano)
    if (!dentro.length) return k.word.trim() ? [{ at: k.at, fine: k.at + k.dur, testo: k.word.trim(), ultima: true }] : [];
    const gruppi = gruppiParole(dentro, [], true);
    return gruppi.map((x, i) => ({ ...x, fine: i === gruppi.length - 1 ? Math.max(x.fine, k.at + k.dur) : gruppi[i + 1].at, ultima: i === gruppi.length - 1 }));
  });
}

// inizio "prima e dopo" (12K Quality, 19/10): per un attimo l'immagine piatta, come esce dalla
// camera in I-Log, poi una linea di luce la attraversa e dietro resta il colore finale
const PIATTO = 'saturate(0.18) contrast(0.6) brightness(1.25) sepia(0.06)';
const RIVELA = { inizio: 14, fine: 40 };
const Rivela: React.FC<{ piano: Piano }> = ({ piano }) => {
  const fr = useCurrentFrame();
  const p = interpolate(fr, [RIVELA.inizio, RIVELA.fine], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ clipPath: `inset(0 0 0 ${p * 100}%)` }}>
        <Clips piano={piano} fondo="#0B0B0B" filtro={PIATTO} muto />
      </AbsoluteFill>
      {p > 0 && p < 1 ? <div style={{ position: 'absolute', top: 0, bottom: 0, left: `calc(${p * 100}% - 2px)`, width: 4, background: 'rgba(255,255,255,0.9)', boxShadow: '0 0 28px 8px rgba(255,255,255,0.4)' }} /> : null}
    </AbsoluteFill>
  );
};

// chiusura con logo Instagram e nome (come negli esempi di 12K Quality): l'immagine si scurisce,
// il logo entra bianco, si accende dei colori di Instagram e torna bianco
const CHIUSURA = 54;
const LogoInstagram: React.FC<{ colori: number }> = ({ colori }) => {
  const forme = (tratto: string) => (
    <g fill="none" stroke={tratto} strokeWidth={1.9}>
      <rect x="2.5" y="2.5" width="19" height="19" rx="5.4" />
      <circle cx="12" cy="12" r="4.4" />
    </g>
  );
  return (
    <svg width={150} height={150} viewBox="0 0 24 24">
      <defs>
        <radialGradient id="ig" cx="0.3" cy="1.07" r="1.5" gradientUnits="objectBoundingBox">
          <stop offset="0" stopColor="#FDF497" /><stop offset="0.08" stopColor="#FDF497" /><stop offset="0.45" stopColor="#FD5949" />
          <stop offset="0.6" stopColor="#D6249F" /><stop offset="0.9" stopColor="#285AEB" />
        </radialGradient>
      </defs>
      {forme('#FFFFFF')}
      <circle cx="17.3" cy="6.7" r="1.2" fill="#FFFFFF" />
      <g opacity={colori}>{forme('url(#ig)')}<circle cx="17.3" cy="6.7" r="1.2" fill="#D6249F" /></g>
    </svg>
  );
};
const Chiusura: React.FC<{ nome: string; g: GraficaStile }> = ({ nome, g }) => {
  const fr = useCurrentFrame();
  const v = interpolate(fr, [0, 12], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const colori = interpolate(fr, [10, 22, 38, 50], [0, 1, 1, 0], clamp);
  return (
    <AbsoluteFill style={{ backgroundColor: `rgba(0,0,0,${(0.62 * v).toFixed(3)})`, justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ opacity: v, transform: `scale(${0.92 + 0.08 * v})`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 }}>
        <LogoInstagram colori={colori} />
        <div style={{ ...stileFont(g.fontSottotitoli), fontWeight: 600, fontSize: 40, color: '#FFFFFF', letterSpacing: '0.06em', textTransform: 'uppercase', textShadow: OMBRA }}>{nome}</div>
      </div>
    </AbsoluteFill>
  );
};

export const SuMisura: React.FC<Piano> = (piano) => {
  usaFps(piano);
  const g: GraficaStile = { ...BASE, ...(piano.grafica || {}) };
  useFont([g.fontApertura, g.fontSottotitoli, g.fontTitoli, g.fontCorsivo]);
  const totale = f(durataTotale(piano));
  const sfx = g.sfx ? volumeSfx(piano) : 0;
  const aperture = g.apertura === 'grande' ? blocchiApertura(piano.parole, piano.enfasi) : [];
  const fineApertura = aperture.length ? aperture[aperture.length - 1].fine : 0;
  // durante l'apertura grande nessun'altra scritta: la frase forte dell'AI sulla stessa frase
  // usciva sopra il corsivo dell'apertura (Cinematic Talk su Manifestazioni, 25/10)
  const scritte = (piano.keywords || []).filter((k) => k.at >= fineApertura - 0.05);
  const frasi = g.titoli && g.tipoTitoli === 'frasi' ? scritte : [];
  const titoli = g.titoli && g.tipoTitoli === 'titoli' ? scritte : [];
  const forti = g.titoli && g.tipoTitoli === 'parole' ? scritte : [];
  const cartelli = g.titoli && g.tipoTitoli === 'cartelli' ? scritte : [];
  // Motion: tutto il parlato a blocchi (le parole chiave dell'AI enormi), tranne dove c'è un cartello
  const blocchi = g.sottotitoli === 'blocchi' ? blocchiParlato(piano.parole, piano.enfasi, cartelli) : [];
  const grandi = paroleGrandi(piano.parole, forti);
  const dopoApertura = (piano.parole || []).filter((p) => p.at >= fineApertura - 0.01);
  const occupato = [...titoli, ...frasi, ...forti];
  const pezzi = g.sottotitoli === 'nessuno' || g.sottotitoli === 'blocchi' ? []
    : g.sottotitoli === 'parola' ? gruppiParole(dopoApertura, occupato, Boolean(g.minuscolo))
    : frasiBrevi(dopoApertura).filter((p) => !occupato.some((t) => p.at >= t.at - 0.05 && p.at < t.at + t.dur));
  const m = g.musica;
  const len = (a: number, b: number) => Math.max(2, f(b) - f(a));

  return (
    <AbsoluteFill style={{ backgroundColor: '#0B0B0B' }}>
      <Clips piano={piano} fondo="#0B0B0B" filtro={LOOK[g.look]} />
      {g.vignetta > 0 ? <AbsoluteFill style={{ background: `radial-gradient(ellipse 100% 80% at 50% 50%, rgba(0,0,0,0) 60%, rgba(0,0,0,${g.vignetta.toFixed(2)}) 100%)` }} /> : null}
      {g.rivela ? <Sequence durationInFrames={RIVELA.fine + 1}><Rivela piano={piano} /></Sequence> : null}

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
      <Inserti piano={piano} sfx={sfx} cornice={g.cornice} />
      {g.fumo ? <Fumi piano={piano} /> : null}
      <BlocchiMotion blocchi={blocchi} g={g} />
      {cartelli.map((k, i) => (
        <Sequence key={`ca${i}`} from={f(k.at)} durationInFrames={Math.max(8, f(k.dur))}>
          <Cartello k={k} len={Math.max(8, f(k.dur))} g={g} />
        </Sequence>
      ))}
      {g.firma ? <Firma nome={g.firma} g={g} /> : null}

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
      {grandi.map((p, i) => (
        <Sequence key={`g${i}`} from={f(p.at)} durationInFrames={len(p.at, p.fine)}>
          <ParolaGrande testo={p.testo} len={len(p.at, p.fine)} ultima={p.ultima} g={g} />
        </Sequence>
      ))}

      {g.chiusura && totale > CHIUSURA * 2 ? (
        <Sequence from={totale - CHIUSURA} durationInFrames={CHIUSURA}><Chiusura nome={g.chiusura} g={g} /></Sequence>
      ) : null}

      {m ? <Audio src={staticFile(m.file)} loop volume={(fr) => m.volume * Math.min(1, fr / 15, (totale - fr) / 30)} /> : null}
      {sfx > 0 ? (
        <>
          {aperture.map((b, i) => <Sfx key={`sa${i}`} nome="whoosh" da={f(b.at) - 6} volume={(i ? 0.3 : 0.45) * sfx} />)}
          {aperture.flatMap((b, i) => b.righe.filter((r) => r.tipo === 'grande').map((r, j) => <Sfx key={`pa${i}-${j}`} nome="colpo" da={f(b.at + r.parole[0].da)} volume={0.5 * sfx} />))}
          {frasi.map((k, i) => <Sfx key={`sf${i}`} nome="whoosh" da={f(k.at) - 6} volume={0.45 * sfx} />)}
          {frasi.map((k, i) => <Sfx key={`pf${i}`} nome="colpo" da={f(k.at + 0.15)} volume={0.5 * sfx} />)}
          {titoli.map((k, i) => <Sfx key={`st${i}`} nome="whoosh" da={f(k.at) - 6} volume={0.55 * sfx} />)}
          {forti.map((k, i) => <Sfx key={`sg${i}`} nome="whoosh" da={f(k.at) - 5} volume={0.3 * sfx} />)}
          {blocchi.flatMap((b, i) => b.colpo.map((da, j) => <Sfx key={`mb${i}-${j}`} nome="glitch" da={f(b.at + da)} volume={0.22 * sfx} />))}
          {g.fumo ? tagliFumo(piano).map((at, i) => <Sfx key={`fu${i}`} nome="whoosh" da={at - 10} volume={0.5 * sfx} />) : null}
          {cartelli.map((k, i) => <Sfx key={`sc${i}`} nome="whoosh" da={f(k.at) - 4} volume={0.35 * sfx} />)}
          {g.rivela ? <Sfx nome="whoosh" da={RIVELA.inizio - 4} volume={0.4 * sfx} /> : null}
          {g.chiusura && totale > CHIUSURA * 2 ? <Sfx nome="whoosh" da={totale - CHIUSURA - 4} volume={0.35 * sfx} /> : null}
        </>
      ) : null}
    </AbsoluteFill>
  );
};

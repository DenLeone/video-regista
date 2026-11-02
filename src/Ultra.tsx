import React from 'react';
import { AbsoluteFill, Easing, interpolate, Sequence, useCurrentFrame } from 'remotion';
import { f } from './comune';
import { BloccoM, tagliFumo } from './Motion';
import { GraficaStile, Piano } from './piano';
import { clamp, dentro, SICURA, stileFont } from './testo';

// Stile Ultra (esempi in Stili/Ultra, studiati fotogramma per fotogramma il 27/10), in verticale:
// - tutto il parlato a strati davanti al petto: parole sottili bianche e parole chiave enormi e
//   grassissime, in minuscolo come le dice, una sopra l'altra con le righe quasi attaccate
//   ("You / KNOW / that agent", "that / SELLS / way / MORE")
// - le parole grandi cambiano colore a giro (giallo, rosso, lime, grigio chiaro)
// - ogni parola entra scivolando da sinistra con la scia (sfocata in orizzontale) in ~5 fotogrammi
// - transizioni sfocate (scia veloce) sui cambi di scena scelti dall'AI

export const PALETTE_ULTRA = ['#F4E41C', '#F2231B', '#C6E01F', '#E4E4E4'];
const ENTRATA = 5; // fotogrammi della scivolata

// scia orizzontale: uno stesso testo ripetuto spostato e trasparente dietro a quello vero
const Scia: React.FC<{ v: number; children: React.ReactNode }> = ({ v, children }) => {
  if (v >= 1) return <>{children}</>;
  const passo = (1 - v) * 26;
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      {[3, 2, 1].map((k) => (
        <span key={k} aria-hidden style={{ position: 'absolute', left: -passo * k, top: 0, opacity: 0.22 * v, filter: `blur(${(1 - v) * 6}px)` }}>{children}</span>
      ))}
      <span style={{ filter: `blur(${(1 - v) * 3}px)` }}>{children}</span>
    </span>
  );
};

const Parola: React.FC<{ testo: string; da: number; stile: React.CSSProperties; grande: boolean; pop?: boolean }> = ({ testo, da, stile, grande, pop }) => {
  const fr = useCurrentFrame();
  const v = interpolate(fr, [da, da + ENTRATA], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  if (fr < da) return <span style={{ ...stile, visibility: 'hidden' }}>{testo}</span>;
  if (pop) {
    const scala = 0.86 + v * 0.14;
    return (
      <span style={{ ...stile, display: 'inline-block', opacity: Math.min(1, v * 1.8), transform: `scale(${scala})`, transformOrigin: '50% 60%' }}>
        {testo}
      </span>
    );
  }
  const x = (1 - v) * -60;
  const scala = grande ? 1 + (1 - v) * 0.12 : 1;
  return (
    <span style={{ ...stile, display: 'inline-block', opacity: Math.min(1, v * 1.6), transform: `translateX(${x}px) scale(${scala})`, transformOrigin: '30% 60%' }}>
      <Scia v={v}>{testo}</Scia>
    </span>
  );
};

// dietro la persona il blocco sale alle spalle; altrimenti resta sopra la zona di TikTok, all'altezza delle gambe in un piano intero
const ANCORA_SPALLE = 1020;

const BloccoUltra: React.FC<{ b: BloccoM; len: number; g: GraficaStile; colore: (k: number) => string; solo?: 'tutte' | 'grandi' | 'piccole' }> = ({ b, len, g, colore, solo = 'tutte' }) => {
  const fr = useCurrentFrame();
  const esce = interpolate(fr, [len - 4, len], [0, 1], clamp);
  const testoRiga = (r: BloccoM['righe'][number]) => r.parole.map((x) => x.w).join(' ');
  // righe grandi: la più lunga decide la dimensione (le altre uguali), misurata nel font vero
  // negli esempi la parola grande prende circa due terzi della larghezza ("know", "sells", "more")
  const MAX = 250;
  // le parole lunghe ("semplicemente") possono allargarsi fino alla zona sicura per non diventare minuscole
  const misura = (t: string, ft = g.fontTitoli) => { const fs = dentro(t, ft, MAX, 700, 1.04); return fs >= 130 ? fs : Math.min(130, dentro(t, ft, MAX, SICURA.larghezza, 1.04)); };
  const righeGrandi = b.righe.filter((r) => r.tipo === 'grande');
  const fsGrande = righeGrandi.length ? Math.min(MAX, ...righeGrandi.map((r) => misura(testoRiga(r)))) : MAX;
  const base = Math.max(40, Math.min(100, g.dimensione || 84));
  const righePiccole = b.righe.filter((r) => r.tipo === 'piccolo');
  const fsPiccola = righePiccole.length ? Math.min(base, ...righePiccole.map((r) => dentro(testoRiga(r), g.fontSottotitoli, base))) : base;
  const corsivo = Boolean(g.enfasiCorsivo);
  const righe = b.righe.map((r) => {
    const testo = testoRiga(r);
    const grande = r.tipo === 'grande';
    const num = grande && /\d/.test(testo);
    const ft = grande && corsivo && !num ? g.fontCorsivo : grande ? g.fontTitoli : g.fontSottotitoli;
    const fs = grande ? (corsivo && !num ? misura(testo, ft) : fsGrande) : Math.min(fsPiccola, dentro(testo, ft, fsPiccola));
    return { r, grande, ft, fs, h: Math.ceil(grande ? fs * 0.92 : fs * 1.18) };
  });
  const dalBasso: number[] = [];
  let acc = 0;
  for (let i = righe.length - 1; i >= 0; i--) { dalBasso[i] = acc; acc += righe[i].h; }
  // alto = terzo alto, centro = petto, basso = sopra i tasti. «Dietro» con la posizione
  // lasciata in basso sale alle spalle: è lì che la persona copre le parole grosse.
  const ANCORA: Record<string, number> = { alto: 1180, centro: 900, basso: 1920 - Math.min(1330, SICURA.basso) };
  const ancora = g.dietro && g.posizione === 'basso' ? ANCORA_SPALLE : (ANCORA[g.posizione] ?? ANCORA.basso);
  const pop = g.entrata === 'pop';
  const scritto = (w: string, grande: boolean) => {
    if (grande && g.maiuscoloGrandi) return w.toUpperCase();
    if (g.maiuscolo) return w.toUpperCase();
    if (g.minuscolo) return w.toLowerCase();
    return w;
  };
  let grandi = 0;
  const ombra = 'drop-shadow(0 3px 8px rgba(0,0,0,0.45)) drop-shadow(0 1px 2px rgba(0,0,0,0.5))';
  const visibili = righe.some((x) => (solo === 'grandi' ? x.grande : solo === 'piccole' ? !x.grande : true));
  if (!visibili) return null;
  return (
    <AbsoluteFill style={{ opacity: 1 - esce, filter: esce > 0 ? `blur(${esce * 10}px)` : undefined }}>
      <div style={{ position: 'absolute', left: SICURA.lato, right: SICURA.lato, bottom: ancora, height: acc, filter: ombra }}>
        {righe.map((x, i) => {
          if (solo === 'grandi' && !x.grande) return null;
          if (solo === 'piccole' && x.grande) return null;
          const c = x.grande && !corsivo ? colore(grandi++) : x.grande ? '#FFFFFF' : g.coloreSottotitoli;
          const stile: React.CSSProperties = {
            ...stileFont(x.ft), fontSize: x.fs, lineHeight: x.grande ? 0.84 : 0.98, color: c,
            letterSpacing: x.grande ? '-0.035em' : '-0.01em',
          };
          return (
            <div key={i} style={{ position: 'absolute', left: 0, right: 0, bottom: dalBasso[i], textAlign: 'center', whiteSpace: 'nowrap' }}>
              {x.r.parole.map((p, j) => (
                <React.Fragment key={j}>
                  <Parola testo={scritto(p.w, x.grande)} da={f(p.da)} stile={stile} grande={x.grande} pop={pop} />
                  {j < x.r.parole.length - 1 ? <span style={stile}> </span> : null}
                </React.Fragment>
              ))}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

export const BlocchiUltra: React.FC<{ blocchi: BloccoM[]; g: GraficaStile; solo?: 'tutte' | 'grandi' | 'piccole' }> = ({ blocchi, g, solo = 'tutte' }) => {
  const palette = g.palette && g.palette.length ? g.palette : PALETTE_ULTRA;
  // il colore gira su tutte le parole grandi del video, non riparte a ogni blocco
  const primo: number[] = [];
  let n = 0;
  for (const b of blocchi) { primo.push(n); n += b.righe.filter((r) => r.tipo === 'grande').length; }
  return (
    <>
      {blocchi.map((b, i) => {
        const len = Math.max(2, f(b.fine) - f(b.at));
        return (
          <Sequence key={`u${i}`} from={f(b.at)} durationInFrames={len}>
            <BloccoUltra b={b} len={len} g={g} solo={solo} colore={(k) => palette[(primo[i] + k) % palette.length]} />
          </Sequence>
        );
      })}
    </>
  );
};

// ---------- transizione sfocata ----------
// sui tagli segnati dall'AI (`fumo`, come per il fumo del Motion) l'immagine si sfoca e scivola con una scia (come negli esempi, ~0,4 s), poi torna nitida
const SFOCATA = 0.4;
const SfocataView: React.FC<{ len: number }> = ({ len }) => {
  const fr = useCurrentFrame();
  const p = fr / Math.max(1, len - 1);
  const forza = interpolate(p, [0, 0.5, 1], [0, 1, 0], { ...clamp, easing: Easing.inOut(Easing.quad) });
  return (
    <AbsoluteFill style={{ backdropFilter: `blur(${(forza * 26).toFixed(1)}px) brightness(${(1 + forza * 0.12).toFixed(3)})`, WebkitBackdropFilter: `blur(${(forza * 26).toFixed(1)}px)` }} />
  );
};
export const Sfocature: React.FC<{ piano: Piano }> = ({ piano }) => {
  const durata = f(SFOCATA);
  return (
    <>
      {tagliFumo(piano).map((at, i) => (
        <Sequence key={`sf${i}`} from={Math.max(0, at - Math.round(durata / 2))} durationInFrames={durata}>
          <SfocataView len={durata} />
        </Sequence>
      ))}
    </>
  );
};

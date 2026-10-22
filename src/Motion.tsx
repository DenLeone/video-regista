import React from 'react';
import { AbsoluteFill, Easing, interpolate, random, Sequence, useCurrentFrame } from 'remotion';
import { f } from './comune';
import { durataClip, GraficaStile, Keyword, Piano } from './piano';
import { clamp, norm, pulisci, RACCORDO, stileFont } from './testo';

// Stile Motion (esempi in Stili/Motion, studiati fotogramma per fotogramma il 20/10), in verticale:
// - tutto il parlato a blocchi davanti al petto: righe piccole in corsivo bianco che compaiono
//   parola per parola quando le dice, ferme; le parole chiave enormi, in corsivo pieno e colorate,
//   entrano "a scramble" (lettere a caso sparse che si fissano in ~0,4 s); il blocco sparisce in 0,15 s
// - transizioni a nuvola di fumo che entra da destra, copre tutto sul taglio e si dirada
// - cartelli: scritta a tutto schermo su fondo scurito, lettere battute a macchina
// - logo Instagram e nome fissi in basso a sinistra

type RigaM = { tipo: 'piccolo' | 'grande'; parole: { w: string; da: number }[] };
export type BloccoM = { at: number; fine: number; righe: RigaM[]; colpo: number[] };

const MAX_PICCOLA = 20; // caratteri di una riga piccola (corsivo a 58 px su 1080)
const MAX_GRANDE = 13;  // caratteri della riga grande
const TENUTA = 0.45;    // secondi in cui la parola grande, composta, resta ferma prima del blocco dopo
const TENUTA_MAX = 0.6; // ritardo massimo del blocco dopo rispetto al parlato

// parole da fare enormi: quelle scelte dall'AI (`enfasi`, anche di più parole: "I SUOI RUOLI"),
// ognuna alla prima volta che la dice dopo la precedente; senza, una parola "piena" ogni ~2,5 s
function segnaGrandi(parole: { w: string; at: number }[], enfasi: string[]): boolean[] {
  const grande = parole.map(() => false);
  const n = parole.map((p) => norm(p.w));
  if (enfasi.length) {
    let cursore = 0;
    for (const e of enfasi) {
      const pezzi = String(e).split(/\s+/).map(norm).filter(Boolean);
      if (!pezzi.length) continue;
      const trova = (da: number) => {
        for (let i = da; i + pezzi.length <= n.length; i++) if (pezzi.every((x, k) => n[i + k] === x) && !grande[i]) return i;
        return -1;
      };
      let i = trova(cursore);
      if (i < 0) i = trova(0);
      if (i < 0) continue;
      pezzi.forEach((_, k) => { grande[i + k] = true; });
      cursore = i + pezzi.length;
    }
    return grande;
  }
  let ultima = -10;
  parole.forEach((p, i) => {
    if (p.at - ultima < 2.5 || RACCORDO.has(n[i])) return;
    if (n[i].length >= 7 || /\d/.test(n[i])) { grande[i] = true; ultima = p.at; }
  });
  return grande;
}

// il parlato a blocchi: si va a capo su pause e punteggiatura, dopo le parole grandi (chiudono il
// blocco, come "Dopo questa estate si è / DIMESSO") o quando le righe piccole sarebbero più di due.
// `salta`: i momenti coperti dai cartelli
export function blocchiParlato(parole: Piano['parole'] = [], enfasi: string[] = [], salta: { at: number; dur: number }[] = []): BloccoM[] {
  const usate = parole.filter((p) => !salta.some((s) => p.at >= s.at - 0.05 && p.at < s.at + s.dur));
  const grande = segnaGrandi(usate, enfasi);
  const blocchi: (BloccoM & { ultimo: number })[] = [];
  usate.forEach((p, i) => {
    const w = pulisci(p.w);
    if (!w) return;
    const prima = usate[i - 1];
    const cur = blocchi[blocchi.length - 1];
    const tipo: RigaM['tipo'] = grande[i] ? 'grande' : 'piccolo';
    const riga = cur?.righe[cur.righe.length - 1];
    const lungo = (r?: RigaM) => (r ? r.parole.map((x) => x.w).join(' ').length : 0);
    const nuovo = !cur || !prima
      || p.at - (prima.at + prima.dur) > 0.35 || /[.,;:!?…]$/.test(prima.w)
      || (riga?.tipo === 'grande' && tipo === 'piccolo')
      || (riga?.tipo === 'grande' && tipo === 'grande' && lungo(riga) + w.length + 1 > MAX_GRANDE)
      || (tipo === 'piccolo' && riga?.tipo === 'piccolo' && lungo(riga) + w.length + 1 > MAX_PICCOLA && cur.righe.length >= 2)
      || cur.righe.some((r) => r.tipo === 'grande') && tipo === 'grande' && riga?.tipo !== 'grande';
    if (nuovo) {
      blocchi.push({ at: p.at, fine: p.at + p.dur, righe: [{ tipo, parole: [{ w, da: 0 }] }], colpo: tipo === 'grande' ? [0] : [], ultimo: p.at + p.dur });
      return;
    }
    const da = p.at - cur.at;
    if (riga && riga.tipo === tipo && (tipo === 'grande' || lungo(riga) + w.length + 1 <= MAX_PICCOLA)) riga.parole.push({ w, da });
    else {
      cur.righe.push({ tipo, parole: [{ w, da }] });
      if (tipo === 'grande') cur.colpo.push(da);
    }
    cur.ultimo = p.at + p.dur;
  });
  // la parola grande deve avere il tempo di comporsi e restare ferma un attimo (Manifestazioni,
  // 21/10: col parlato fitto il blocco dopo arrivava mentre le lettere giravano ancora): se serve
  // il blocco dopo parte un po' più tardi (al massimo TENUTA_MAX) e le sue prime parole escono insieme
  for (let k = 0; k + 1 < blocchi.length; k++) {
    const b = blocchi[k], dopo = blocchi[k + 1];
    if (!b.colpo.length) continue;
    const minimo = b.at + Math.max(...b.colpo) + SCRAMBLE + TENUTA;
    const ritardo = Math.min(TENUTA_MAX, minimo - dopo.at);
    if (ritardo <= 0) continue;
    dopo.at += ritardo;
    for (const r of dopo.righe) for (const p of r.parole) p.da = Math.max(0, p.da - ritardo);
    dopo.colpo = dopo.colpo.map((d) => Math.max(0, d - ritardo));
    if (dopo.ultimo < dopo.at) dopo.ultimo = dopo.at;
  }
  return blocchi.map((b, k) => {
    const dopo = blocchi[k + 1];
    const fine = dopo && dopo.at - b.ultimo < 0.7 ? dopo.at : Math.max(b.ultimo + 0.35, b.colpo.length ? b.at + Math.max(...b.colpo) + SCRAMBLE + TENUTA : 0);
    return { at: b.at, fine, righe: b.righe, colpo: b.colpo };
  });
}

const LETTERE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const SCRAMBLE = 0.3; // secondi per fissare tutte le lettere (negli esempi ~0,4 s, ma col parlato fitto serve più svelto)

// una parola grande che entra a scramble: ogni lettera compare a caso (prima rade, poi fitte) con
// un carattere qualunque che cambia ogni 2 fotogrammi, poi si fissa, più o meno da sinistra a destra.
// La lettera vera c'è sempre (invisibile) e tiene il posto: la riga non balla
const Scramble: React.FC<{ testo: string; da: number; seme: string; riempi: React.CSSProperties }> = ({ testo, da, seme, riempi }) => {
  const fr = useCurrentFrame() - da;
  const D = Math.max(6, f(SCRAMBLE));
  const lettere = [...testo];
  const n = Math.max(1, lettere.length - 1);
  return (
    <>
      {lettere.map((c, i) => {
        if (c === ' ') return <span key={i}> </span>;
        const compare = Math.floor(random(`${seme}-c${i}`) * D * 0.55);
        const fissa = Math.round(D * (0.35 + 0.4 * (i / n) + 0.25 * random(`${seme}-f${i}`)));
        const visibile = fr >= compare;
        const finta = visibile && fr < fissa;
        const carattere = finta ? LETTERE[Math.floor(random(`${seme}-${i}-${Math.floor(fr / 2)}`) * LETTERE.length)] : c;
        return (
          <span key={i} style={{ position: 'relative', display: 'inline-block' }}>
            <span style={{ ...riempi, visibility: !visibile || finta ? 'hidden' : 'visible' }}>{c}</span>
            {finta ? <span style={{ ...riempi, position: 'absolute', left: '50%', top: 0, transform: 'translateX(-50%)', opacity: 0.8 }}>{carattere}</span> : null}
          </span>
        );
      })}
    </>
  );
};

// riempimento delle parole grandi: il colore dello stile, un po' più scuro in basso. Va su ogni
// lettera: il ritaglio sul testo non passa ai figli inline-block
const riempimento = (c: string): React.CSSProperties => ({
  backgroundImage: `linear-gradient(180deg, ${c} 0%, ${c} 45%, color-mix(in srgb, ${c} 78%, #7A3A00) 100%)`,
  WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
});

const BloccoView: React.FC<{ b: BloccoM; len: number; g: GraficaStile; seme: string }> = ({ b, len, g, seme }) => {
  const fr = useCurrentFrame();
  const esce = interpolate(fr, [len - 5, len], [0, 1], clamp);
  const lungaGrande = Math.max(1, ...b.righe.filter((r) => r.tipo === 'grande').map((r) => r.parole.map((x) => x.w).join(' ').length));
  const fsGrande = Math.max(96, Math.min(170, 900 / (lungaGrande * 0.62)));
  const conGrande = b.righe.some((r) => r.tipo === 'grande');
  const scramble = g.entrata !== 'sfocata';
  const riempi = riempimento(g.coloreApertura);
  return (
    // il blocco poggia su una linea all'altezza del petto (y ≈ 1400): le righe crescono verso l'alto
    <AbsoluteFill style={{ opacity: 1 - esce, filter: esce > 0 ? `blur(${esce * 8}px)` : undefined }}>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 1920 - 1400, display: 'flex', justifyContent: 'center' }}>
        <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: conGrande ? 'flex-start' : 'center', maxWidth: 1080 - 120 }}>
          {b.righe.map((r, i) => r.tipo === 'grande' ? (
            <div key={i} style={{ ...stileFont(g.fontApertura), fontSize: fsGrande, lineHeight: 0.95, textTransform: 'uppercase', whiteSpace: 'nowrap',
              alignSelf: 'center', letterSpacing: '0.01em', filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.55)) drop-shadow(0 1px 2px rgba(0,0,0,0.6))' }}>
              <span>
                {r.parole.map((p, j) => {
                  const da = f(p.da);
                  const testo = p.w.toUpperCase() + (j < r.parole.length - 1 ? ' ' : '');
                  if (scramble) return <Scramble key={j} testo={testo} da={da} seme={`${seme}-${i}-${j}`} riempi={riempi} />;
                  const v = interpolate(fr, [da, da + 6], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
                  return <span key={j} style={{ ...riempi, display: 'inline-block', opacity: v, filter: `blur(${(1 - v) * 14}px)` }}>{testo}</span>;
                })}
              </span>
            </div>
          ) : (
            <div key={i} style={{ ...stileFont(g.fontCorsivo), fontSize: 58, lineHeight: 1.08, color: g.coloreSottotitoli, whiteSpace: 'nowrap',
              marginLeft: conGrande ? '0.5em' : 0, textShadow: '0 2px 10px rgba(0,0,0,0.6), 0 1px 2px rgba(0,0,0,0.6)' }}>
              {r.parole.map((p, j) => {
                const da = f(p.da);
                // le parole piccole non si muovono: compaiono in 2 fotogrammi quando le dice
                return <span key={j} style={{ opacity: interpolate(fr, [da, da + 2], [0, 1], clamp) }}>{p.w}{j < r.parole.length - 1 ? ' ' : ''}</span>;
              })}
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const BlocchiMotion: React.FC<{ blocchi: BloccoM[]; g: GraficaStile }> = ({ blocchi, g }) => (
  <>
    {blocchi.map((b, i) => {
      const len = Math.max(2, f(b.fine) - f(b.at));
      return (
        <Sequence key={`m${i}`} from={f(b.at)} durationInFrames={len}>
          <BloccoView b={b} len={len} g={g} seme={`b${i}`} />
        </Sequence>
      );
    })}
  </>
);

// ---------- transizione a fumo ----------
// nuvola chiara che entra da destra, copre tutto il fotogramma sul taglio e si dirada sulla scena
// nuova (come negli esempi, ~0,7 s). Rumore frattale SVG a metà risoluzione (più leggero), che
// scorre mentre il fronte avanza; il bordo del fronte è sfilacciato dal rumore stesso
const FUMO = 0.75; // secondi, centrati sul taglio
const FumoView: React.FC<{ len: number; seme: number }> = ({ len, seme }) => {
  const fr = useCurrentFrame();
  const p = fr / Math.max(1, len - 1);
  const fronte = interpolate(p, [0, 0.5], [1.15, -0.45], { ...clamp, easing: Easing.out(Easing.quad) });
  const pieno = interpolate(p, [0.3, 0.48, 0.56, 0.9], [0, 0.85, 0.85, 0], clamp);
  const svanisce = interpolate(p, [0.5, 1], [1, 0], { ...clamp, easing: Easing.in(Easing.quad) });
  const deriva = p * 160;
  const id = `fumo${seme}`;
  return (
    <AbsoluteFill style={{ opacity: svanisce }}>
      <svg width={540} height={960} viewBox="0 0 540 960" style={{ width: 1080, height: 1920 }}>
        <defs>
          <filter id={`${id}r`} x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.0085 0.0065" numOctaves={4} seed={seme} />
            {/* alfa dal rumore, contrastato: sbuffi pieni e buchi */}
            <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  2.6 0 0 0 -0.95" />
          </filter>
          <linearGradient id={`${id}g`} x1="0" x2="1" y1="0" y2="0">
            <stop offset={Math.max(0, Math.min(1, fronte))} stopColor="#000" />
            <stop offset={Math.max(0, Math.min(1, fronte + 0.35))} stopColor="#FFF" />
          </linearGradient>
          <mask id={`${id}m`}><rect width="540" height="960" fill={`url(#${id}g)`} /></mask>
        </defs>
        <g mask={`url(#${id}m)`}>
          <g transform={`translate(${-deriva} ${-deriva * 0.3})`}>
            <rect width="760" height="1100" filter={`url(#${id}r)`} />
          </g>
          <g transform={`translate(${-deriva * 1.6} ${deriva * 0.2})`} opacity={0.8}>
            <rect width="820" height="1100" filter={`url(#${id}r)`} transform="scale(1.6)" />
          </g>
        </g>
        <rect width="540" height="960" fill="#E9E9EA" opacity={pieno} mask={`url(#${id}m)`} />
      </svg>
    </AbsoluteFill>
  );
};

// fotogrammi dei tagli con il fumo (clip con `fumo`, mai la prima)
export const tagliFumo = (piano: Piano) => {
  let t = 0;
  const tagli: number[] = [];
  piano.clips.forEach((c, i) => { if (c.fumo && i > 0) tagli.push(t); t += f(durataClip(c)); });
  return tagli;
};
export const Fumi: React.FC<{ piano: Piano }> = ({ piano }) => {
  const durata = f(FUMO);
  return (
    <>
      {tagliFumo(piano).map((at, i) => (
        <Sequence key={`fu${i}`} from={Math.max(0, at - Math.round(durata / 2))} durationInFrames={durata}>
          <FumoView len={durata} seme={7 + i * 13} />
        </Sequence>
      ))}
    </>
  );
};

// ---------- cartelli ----------
// scritta a tutto schermo su fondo scurito ("IL POLITICO PIÙ POTENTE"): lettere battute a macchina,
// la seconda riga (note) dopo la prima, uscita in dissolvenza
export const Cartello: React.FC<{ k: Keyword; len: number; g: GraficaStile }> = ({ k, len, g }) => {
  const fr = useCurrentFrame();
  // entrata e uscita di 6 fotogrammi, più corte se il cartello è breve (prova troncata a metà)
  const b = Math.max(1, Math.min(6, Math.floor(len / 2) - 1));
  const scuro = interpolate(fr, [0, b, len - b, len], [0, 1, 1, 0], clamp);
  const esce = interpolate(fr, [len - b, len], [1, 0], clamp);
  const uno = k.word.toUpperCase();
  const due = (k.note || '').replace(/^\/\/\s*/, '').toUpperCase();
  const passo = 1.1; // fotogrammi per lettera
  const battute = (testo: string, da: number) => testo.slice(0, Math.max(0, Math.floor((fr - da) / passo)));
  const fs = Math.max(70, Math.min(118, 940 / (Math.max(uno.length, due.length, 1) * 0.5)));
  return (
    <AbsoluteFill style={{ backgroundColor: `rgba(6,6,8,${(0.62 * scuro).toFixed(3)})`, justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ ...stileFont(g.fontTitoli), fontSize: fs, lineHeight: 1.08, color: g.coloreTitoli, textAlign: 'center', textTransform: 'uppercase',
        letterSpacing: '0.01em', padding: '0 60px', opacity: esce, textShadow: '0 4px 24px rgba(0,0,0,0.6)' }}>
        {/* la riga intera c'è sempre, invisibile: le lettere battute non spostano niente */}
        <div style={{ position: 'relative' }}><span style={{ visibility: 'hidden' }}>{uno}</span>
          <span style={{ position: 'absolute', left: 0, right: 0, top: 0 }}>{battute(uno, 3)}</span></div>
        {due ? <div style={{ position: 'relative', fontSize: fs * 0.82 }}><span style={{ visibility: 'hidden' }}>{due}</span>
          <span style={{ position: 'absolute', left: 0, right: 0, top: 0 }}>{battute(due, 3 + uno.length * passo + 6)}</span></div> : null}
      </div>
    </AbsoluteFill>
  );
};

// ---------- firma ----------
// logo Instagram e nome fissi in basso a sinistra, sopra la zona della didascalia di Instagram
export const Firma: React.FC<{ nome: string; g: GraficaStile }> = ({ nome, g }) => (
  <div style={{ position: 'absolute', left: 46, top: 1452, display: 'flex', alignItems: 'center', gap: 12, opacity: 0.9,
    filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.6))' }}>
    <svg width={40} height={40} viewBox="0 0 24 24">
      <g fill="none" stroke="#FFFFFF" strokeWidth={2.1}><rect x="2.5" y="2.5" width="19" height="19" rx="5.4" /><circle cx="12" cy="12" r="4.4" /></g>
      <circle cx="17.3" cy="6.7" r="1.3" fill="#FFFFFF" />
    </svg>
    <span style={{ ...stileFont(g.fontSottotitoli), fontWeight: 600, fontSize: 28, color: '#FFFFFF', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{nome}</span>
  </div>
);

import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, Easing, Img, interpolate, OffthreadVideo, useCurrentFrame, useVideoConfig } from 'remotion';
import { areaImmagine, colpiDi, corpo, corpoRiga, creaCamera, Documento, fotoBN, geometriaLastra, impagina, kanjiSotto, lastra, Posato, Presentatore, schedeDi, trattiLastra } from './rotolo/impagina';
import { Badge, Canvas, ContatoreTech, Hero, NomeTech, progBarra, Riga, Riquadro, SchedaTech, T, Vetro } from './rotolo/tech';
import {
  Cade, CARTA, centro, Cerchio, Ciotola, Contatore, Croce, f, fontLocali, Foto, Grafico, Hanko, impostaCartella, INCHIOSTRO, Insegna,
  Macchina, MACCHINA, MINCHO, Nome, outCubic, Pantografo, PENNELLO, Pennello, prog, ROSSO, Scheda, SERIF, tratto, Taxi,
} from './rotolo/pezzi';

// Rotolo: documentario a piano sequenza su un kakemono srotolato su un tavolo scuro, verticale 4K.
// Tutto il video sta in beats.json (props): pc/rotolo/LEGGIMI.md spiega il formato e il flusso.
// Impaginazione e camera le calcola src/rotolo/impagina.ts (lo stesso file che usano gli SFX).

export type PropsRotolo = Documento;
export const durataRotolo = (p: PropsRotolo) => p.durata;

const ICONE: Record<string, React.FC> = {
  ciotola: Ciotola, taxi: Taxi, insegna: Insegna,
  casa: () => <svg viewBox="0 0 100 100" width={270}><path d="M12 50 L50 16 L88 50 M22 42 V88 H78 V42 M42 88 V64 H58 V88" {...tratto} /></svg>,
  telefono: () => <svg viewBox="0 0 100 100" width={220}><rect x="28" y="8" width="44" height="84" rx="8" {...tratto} /><path d="M44 80 H56" {...tratto} /></svg>,
  libro: () => <svg viewBox="0 0 100 100" width={280}><path d="M50 24 Q30 14 10 20 V82 Q30 76 50 86 Q70 76 90 82 V20 Q70 14 50 24 Z M50 24 V86" {...tratto} /></svg>,
  soldi: () => <svg viewBox="0 0 100 100" width={270}><rect x="8" y="28" width="84" height="46" rx="4" {...tratto} /><circle cx="50" cy="51" r="12" {...tratto} /></svg>,
  fabbrica: () => <svg viewBox="0 0 100 100" width={280}><path d="M8 90 V50 L30 62 V50 L52 62 V50 L74 62 V20 H88 V90 Z" {...tratto} /></svg>,
  gioco: () => <svg viewBox="0 0 100 100" width={280}><rect x="10" y="30" width="80" height="44" rx="20" {...tratto} /><path d="M30 44 V60 M22 52 H38" {...tratto} /><circle cx="66" cy="48" r="4" {...tratto} /><circle cx="76" cy="58" r="4" {...tratto} /></svg>,
};

const Carta: React.FC<{ n: string; w: number }> = ({ n, w }) => (
  <div style={{ width: w, padding: w * 0.03, background: '#2a1d14', borderRadius: w * 0.05 }}>
    <Img src={f(n)} style={{ display: 'block', width: '100%', borderRadius: w * 0.03 }} />
  </div>
);

const Fondale: React.FC<{ altezza: number; anni: [string, number][] }> = ({ altezza, anni }) => (
  <>
    <div style={{ position: 'absolute', left: -9000, top: -9000, width: 18000, height: altezza + 18000, background: `url(${f('tavolo.jpg')}) 0 0 / 1600px, #241912` }} />
    <div style={{ position: 'absolute', left: -1090, top: -200, width: 2180, height: altezza + 400, boxShadow: '0 60px 160px 40px rgba(0,0,0,0.75)' }} />
    <div style={{ position: 'absolute', left: -1090, top: -200, width: 2180, height: altezza + 400, background: 'repeating-linear-gradient(135deg, #1c2333 0 22px, #212a3d 22px 44px)', boxShadow: 'inset 0 0 0 6px #b79a5a, inset 0 0 0 10px #1c2333, inset 0 0 0 13px rgba(183,154,90,0.6)' }} />
    <div style={{ position: 'absolute', left: -1000, top: 0, width: 2000, height: altezza, background: CARTA, boxShadow: 'inset 0 0 120px rgba(90,60,25,0.35), inset 0 0 18px rgba(60,40,20,0.4)' }}>
      <div style={{ position: 'absolute', inset: 0, background: `url(${f('washi.jpg')}) 0 0 / 1100px`, opacity: 0.5, mixBlendMode: 'multiply' }} />
    </div>
    {[-230, altezza + 230].map((y) => (
      <div key={y} style={{ position: 'absolute', left: -1250, top: y - 55, width: 2500, height: 110, borderRadius: 55, background: 'linear-gradient(180deg,#5a3a22,#2b1a0f 60%,#140c07)', boxShadow: '0 30px 60px rgba(0,0,0,0.6)' }} />
    ))}
    <svg width={200} height={altezza} style={{ position: 'absolute', left: -930, top: 0, overflow: 'visible' }}>
      <path d={`M60 500 V${altezza - 400}`} stroke={INCHIOSTRO} strokeWidth={5} opacity={0.35} strokeDasharray="2 18" strokeLinecap="round" />
      {anni.map(([a, y], i) => (
        <g key={i}>
          <circle cx={60} cy={y} r={16} fill={ROSSO} opacity={0.85} />
          <text x={60} y={y + 80} textAnchor="middle" fontFamily={MACCHINA} fontWeight={700} fontSize={44} fill={INCHIOSTRO} opacity={0.7}>{a}</text>
        </g>
      ))}
    </svg>
  </>
);

// un elemento impaginato → il suo disegno
const Pezzo: React.FC<{ p: Posato; t: number }> = ({ p, t: tempo }) => {
  const { el, x, y, w, h, t, rot } = p;
  switch (el.tipo) {
    case 'anno':
      return <Pennello x={x} y={y} testo={el.testo || ''} t={t} tempo={tempo} size={corpo(el)} dur={el.dur ?? 0.8} />;
    case 'titolo':
      return <Pennello x={x} y={y} testo={el.testo || ''} t={t} tempo={tempo} size={corpo(el)} dur={el.dur ?? 0.6} />;
    case 'kanji': {
      const conSotto = !!el.sotto;
      // etichetta lunga (es. VIAGGIO IN OCCIDENTE): sotto i kanji invece che accanto, per non sovrapporsi
      const sotto = conSotto && (kanjiSotto(el));
      const sk = Math.min(230, 1300 / Math.max(1, (el.testo || '').length));
      return <>
        <Pennello x={conSotto && !sotto ? x - 260 : x} y={sotto ? y - 70 : y} testo={el.testo || ''} t={t} tempo={tempo} size={sk} font={MINCHO} peso={800} dur={el.dur ?? 0.5} />
        {conSotto && <Macchina x={sotto ? x : x + 330} y={sotto ? y + 150 : y + 10} testo={el.sotto!} t={t + 0.1} tempo={tempo} size={Math.min(88, Math.floor(1300 / (el.sotto!.length * 0.64)))} />}
      </>;
    }
    case 'macchina':
      return <Macchina x={x} y={y} testo={el.testo || ''} t={t} tempo={tempo} size={corpo(el)} colore={el.colore === 'rosso' ? ROSSO : undefined} />;
    case 'nome':
      return <Nome x={x} y={y} nome={el.nome || ''} kanji={el.kanjiNome} ruolo={el.ruolo} t={t} tempo={tempo} size={corpo(el)} />;
    case 'foto':
      return <Cade x={x} y={y} rot={rot} t={t} tempo={tempo}><Foto src={el.file!} w={w} bn={fotoBN(el)} t={t} dur={el.durClip} /></Cade>;
    case 'ritaglio': {
      // "sopra": sull'angolo in basso a destra dell'elemento prima, un po' fuori
      const o = el.sopra ? p.ospite : undefined;
      const ww = o ? 420 : w;
      const rx = o ? o.x + o.w * 0.38 : x, ry = o ? o.y + o.h * 0.42 : y;
      return <Cade x={rx} y={ry} rot={rot + 4} t={t} tempo={tempo} dur={0.45}><Img src={f(el.file!)} style={{ width: ww, display: 'block' }} /></Cade>;
    }
    case 'carte': {
      const fs = el.files || [];
      const n = fs.length;
      const cw = n > 2 ? 540 : 620;
      const passo = n > 1 ? (w - cw) / (n - 1) : 0;
      // la carta di mezzo sta sopra le altre
      const ordine = fs.map((_, i) => i).sort((a, b) => Math.abs(b - (n - 1) / 2) - Math.abs(a - (n - 1) / 2));
      return <>{ordine.map((i) => (
        <Cade key={i} x={x - w / 2 + cw / 2 + i * passo} y={y - (i === Math.floor(n / 2) ? -30 : 0)} rot={(i - (n - 1) / 2) * 7} t={t + i * 0.3} tempo={tempo}>
          <Carta n={fs[i]} w={cw} />
        </Cade>
      ))}</>;
    }
    case 'timbro': {
      const o = p.ospite;
      // sulle foto e sulle carte il timbro va sull'angolo; sotto i testi e i numeri, in basso a destra
      const suImmagine = o && (o.el.tipo === 'foto' || o.el.tipo === 'carte' || o.el.tipo === 'ritaglio');
      const tx = el.solo || !o ? x : o.x + o.w * (suImmagine ? 0.42 : 0.38);
      const alto = (el.testo || '').length >= 3 && /[一-鿿]/.test(el.testo || '');
      const ty = el.solo || !o ? y : suImmagine ? o.y + o.h * (alto ? 0.26 : 0.44) : o.y + o.h / 2 + 150;
      return <Hanko x={tx} y={ty} rot={el.solo ? -8 : rot} testo={el.testo || ''} sotto={el.sotto} t={t} tempo={tempo} size={el.grande ? 330 : 150} verticale={(el.testo || '').length <= 4 && /[぀-ヿ一-鿿]/.test(el.testo || '') && !/^[゠-ヿ]+$/.test(el.testo || '')} />;
    }
    case 'schede': {
      const voci = el.voci || [];
      const top = y - h / 2;
      return <>
        {voci.map((v, k) => {
          const Icona = ICONE[v.icona || ''];
          return <Cade key={k} x={x + (k % 2 ? 30 : -30)} y={top + k * schedeDi().passo + schedeDi().alt / 2} rot={k % 2 ? 2 : -2} t={v.t ?? t} tempo={tempo}>
            <Scheda kanji={v.kanji || ''} titolo={v.titolo.toUpperCase()} icona={Icona ? <Icona /> : null} />
          </Cade>;
        })}
        {(el.croci || []).map((c, k) => <Croce key={k} x={x + (k % 2 ? 30 : -30)} y={top + k * schedeDi().passo + schedeDi().alt / 2} w={820} t={c} tempo={tempo} />)}
        {el.timbroFinale && <Hanko x={x} y={y} rot={-10} testo={el.timbroFinale.testo} sotto={el.timbroFinale.sotto} t={el.timbroFinale.t} tempo={tempo} size={330} />}
      </>;
    }
    case 'grafico':
      return <div style={{ position: 'absolute', left: x - 700, top: y - 380, transform: 'scale(0.93)', transformOrigin: '0 0' }}>
        <Grafico tempo={tempo} t={t} tCambio={el.tCambio ?? t + 2} etichette={el.etichette || []} titolo={el.titoloGrafico} forma={el.forma} />
      </div>;
    case 'contatore':
      return <Contatore x={x} y={y} t={t} tempo={tempo} valore={el.valore ?? 0} prefisso={el.prefisso ?? '+'} etichetta={(el.etichetta || '').toUpperCase()} />;
    case 'schema':
      return <div style={{ position: 'absolute', left: x - 930, top: y, transform: 'translateY(-50%) scale(0.92)', transformOrigin: '0 50%' }}><Pantografo tempo={tempo} t={t} /></div>;
    case 'cerchio': {
      const o = p.ospite;
      if (!o) return null;
      const a = areaImmagine(o);
      return <Cerchio x={a.x0 + (el.cx ?? 0.5) * a.w} y={a.y0 + (el.cy ?? 0.5) * a.h} w={170} h={170} t={t} tempo={tempo} spessore={8} />;
    }
  }
  return null;
};

// ---------------------------------------------------------------- mondo tech
const nomeFile = (n = '') => n.replace(/\.[a-z0-9]+$/i, '').replace(/^overlay[_-]/i, '').replace(/[_-]+/g, ' ').toUpperCase();
const PezzoTech: React.FC<{ p: Posato; t: number }> = ({ p, t: tempo }) => {
  const { el, x, y, w, h, t, rot } = p;
  switch (el.tipo) {
    case 'anno': return <Hero x={x} y={y} testo={el.testo || ''} t={t} tempo={tempo} size={corpo(el)} mono />;
    case 'titolo': case 'kanji': return <Hero x={x} y={y} testo={el.testo || ''} t={t} tempo={tempo} size={el.tipo === 'kanji' ? 200 : corpo(el)} />;
    case 'macchina': return <Riga x={x} y={y} testo={(el.testo || '').toUpperCase()} t={t} tempo={tempo} size={corpo(el)} colore={el.colore === 'rosso' ? T.rosso : T.accento} />;
    case 'nome': return <NomeTech x={x} y={y} nome={el.nome || ''} ruolo={el.ruolo} t={t} tempo={tempo} size={corpo(el)} />;
    case 'foto': return <Cade x={x} y={y} rot={rot * 0.4} t={t} tempo={tempo} dur={0.5}><Vetro src={el.file!} w={w} etichetta={el.etichetta || nomeFile(el.file)} attivo={1} t={t} dur={el.durClip} /></Cade>;
    case 'ritaglio': {
      const o = el.sopra ? p.ospite : undefined;
      const ww = o ? 420 : w;
      return <Cade x={o ? o.x + o.w * 0.38 : x} y={o ? o.y + o.h * 0.42 : y} t={t} tempo={tempo} dur={0.45}>
        <Img src={f(el.file!)} style={{ width: ww, display: 'block', filter: 'drop-shadow(0 0 60px rgba(79,209,255,0.25))' }} />
      </Cade>;
    }
    case 'carte': return <>{(el.files || []).map((n, i, a) => <Cade key={i} x={x + (i - (a.length - 1) / 2) * 420} y={y} t={t + i * 0.3} tempo={tempo}><Vetro src={n} w={520} etichetta="" attivo={1} /></Cade>)}</>;
    case 'timbro': {
      const o = p.ospite;
      const img = o && (o.el.tipo === 'foto' || o.el.tipo === 'ritaglio');
      const tx = el.solo || !o ? x : img ? o.x + o.w * 0.22 : o.x;
      const ty = el.solo || !o ? y : img ? o.y + o.h / 2 - 20 : o.y + o.h / 2 + 130;
      return <Badge x={tx} y={ty} rot={el.solo ? -4 : -3} testo={(el.testo || '').toUpperCase()} sotto={el.sotto} t={t} tempo={tempo} size={el.grande ? 170 : 110} />;
    }
    case 'schede': {
      const sc = schedeDi('tech');
      const top = y - h / 2;
      return <>
        {(el.voci || []).map((v, k) => (
          <Cade key={k} x={x} y={top + k * sc.passo + sc.alt / 2} t={v.t ?? t} tempo={tempo} dur={0.45}>
            <SchedaTech titolo={v.titolo} icona={v.icona} barrata={progBarra(tempo, el.croci?.[k])} />
          </Cade>
        ))}
        {el.timbroFinale && <Badge x={x + 200} y={y} rot={-6} testo={el.timbroFinale.testo.toUpperCase()} sotto={el.timbroFinale.sotto} t={el.timbroFinale.t} tempo={tempo} size={150} />}
      </>;
    }
    case 'contatore': return <ContatoreTech x={x} y={y} t={t} tempo={tempo} valore={el.valore ?? 0} prefisso={el.prefisso ?? ''} suffisso={el.suffisso ?? ''} etichetta={(el.etichetta || '').toUpperCase()} />;
    case 'cerchio': {
      const o = p.ospite;
      if (!o) return null;
      const a = areaImmagine(o, 'tech');
      return <Riquadro x={a.x0 + (el.cx ?? 0.5) * a.w} y={a.y0 + (el.cy ?? 0.5) * a.h} w={el.zoom ? 200 : 260} h={el.zoom ? 200 : 260} t={t} tempo={tempo} />;
    }
    case 'grafico': case 'schema':
      return <div style={{ filter: 'invert(1) hue-rotate(180deg) brightness(1.2)' }}><Pezzo p={p} t={tempo} /></div>;
  }
  return null;
};

// regola del prompt tech: tutto quello che non è il beat attivo scende al 15% e si sfoca un po'
function luce(doc: Documento, p: Posato, tempo: number): React.CSSProperties {
  const inizi = doc.beats.map((b) => b.t);
  const fine = p.beat === -1 ? inizi[0] - 0.4 : inizi[p.beat + 1] !== undefined ? inizi[p.beat + 1] - 0.2 : Infinity;
  const k = Math.min(1, Math.max(0, (tempo - fine) / 0.45));
  return { opacity: 1 - 0.85 * k, filter: k > 0.02 ? `blur(${(3 * k).toFixed(2)}px)` : undefined };
}

// ---------------------------------------------------------------- lastra del presentatore
// Il video della persona occupa il fondo dello schermo (p = quota: 1 tutto, 0,5 metà). Non si taglia al
// centro: si sposta perché il viso resti dentro con spazio sopra la testa, anche mentre la lastra si stringe.
const Lastra: React.FC<{ pres: Presentatore; p: number; v: number; t: number; tech: boolean }> = ({ pres, p, v, t, tech }) => {
  const { width: W, height: H } = useVideoConfig();
  // stessa geometria dei keyframe di DaVinci (pc/locale/lastra.mjs): sta in impagina.ts
  const { alta, left, top, vw, vh } = geometriaLastra(pres, p, t, W, H);
  const mosso = Math.min(18, Math.abs(v) * 30);
  const bordo = tech ? '#4fd1ff' : '#b79a5a';
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: alta, overflow: 'hidden', background: '#000',
      boxShadow: p < 0.999 ? '0 -30px 80px rgba(0,0,0,0.65)' : undefined, filter: mosso > 0.5 ? `blur(${mosso.toFixed(1)}px)` : undefined }}>
      <OffthreadVideo src={f(pres.file)} muted style={{ position: 'absolute', left, top, width: vw, height: vh }} />
      {p < 0.999 && <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 6, background: bordo, boxShadow: `0 0 30px ${bordo}`, opacity: 0.9 }} />}
    </div>
  );
};

export const Rotolo: React.FC<PropsRotolo> = (doc) => {
  impostaCartella(doc.cartella);
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;
  const imp = useMemo(() => impagina(doc), [doc]);
  const tech = doc.mondo === 'tech';
  const tratti = useMemo(() => trattiLastra(doc), [doc]);
  // tech: una traccia dal bus a ogni beat, all'altezza del suo primo elemento
  const tracce = useMemo(() => doc.beats.map((b, i) => ({ t: b.t, y: Math.min(...imp.posati.filter((p) => p.beat === i && p.h > 0).map((p) => p.y - p.h / 2)) + 40 })).filter((x) => Number.isFinite(x.y)), [doc, imp]);
  const cam = useMemo(() => creaCamera(imp.camera, colpiDi(imp.posati, doc)), [imp, doc]);
  const c = cam(t);
  const k = width / 2160;

  const pr = cam(t - 1 / fps);
  const vx = (c.x - pr.x) * c.z * k, vy = (c.y - pr.y) * c.z * k;
  const bx = Math.min(tech ? 14 : 24, Math.abs(vx) * (tech ? 0.12 : 0.2)), by = Math.min(tech ? 26 : 44, Math.abs(vy) * (tech ? 0.12 : 0.2));
  const mosso = bx + by > 1.2;

  const pl = lastra(doc, t, tratti); // quota di schermo del presentatore
  const plPrima = lastra(doc, t - 1 / fps, tratti);
  const fin = doc.finale;
  const buio = fin ? interpolate(t, [fin.t + 2.2, fin.t + 3.0], [0, 0.6], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 0;
  // solo grafica (livello per DaVinci, ProRes 4444): il mondo sta nel suo riquadro in alto, sotto è trasparente
  // e lì DaVinci mette il video vero del presentatore
  const sg = !!doc.soloGrafica;
  const hMondo = sg && doc.presentatore ? height * (1 - pl) : height;
  const fondo = tech ? T.fondo : '#120c08';

  return (
    <AbsoluteFill style={{ background: sg ? 'transparent' : fondo, overflow: 'hidden' }}>
      <style>{fontLocali()}</style>
      <svg width={0} height={0} style={{ position: 'absolute' }}>
        <filter id="mosso"><feGaussianBlur stdDeviation={`${bx.toFixed(2)} ${by.toFixed(2)}`} /></filter>
        <filter id="inchiostro"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={4} /><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.2 1.7" /><feComposite in="SourceGraphic" operator="in" /></filter>
      </svg>

      <div style={{ position: 'absolute', left: 0, top: 0, width, height: hMondo, overflow: 'hidden', background: sg ? fondo : undefined, display: hMondo < 1 ? 'none' : undefined }}>
      <div style={{ position: 'absolute', inset: 0, filter: mosso ? 'url(#mosso)' : undefined }}>
        <div style={{ position: 'absolute', left: width / 2, top: (height * (1 - pl)) / 2, transformOrigin: '0 0', transform: `scale(${c.z * k}) rotate(${c.rot}deg) translate(${-c.x}px, ${-c.y}px)` }}>
          {tech ? <Canvas altezza={imp.altezza} anni={imp.anni} tempo={t} tracce={tracce} /> : <Fondale altezza={imp.altezza} anni={imp.anni} />}
          {imp.posati.map((p) => tech
            ? <div key={p.id} style={{ position: 'absolute', left: 0, top: 0, ...luce(doc, p, t) }}><PezzoTech p={p} t={t} /></div>
            : <Pezzo key={p.id} p={p} t={t} />)}
        </div>
      </div>

      {!sg && doc.presentatore && pl > 0.001 && <Lastra pres={doc.presentatore} p={pl} v={(pl - plPrima) * fps} t={t} tech={tech} />}
      <AbsoluteFill style={{ background: tech ? 'radial-gradient(ellipse 80% 60% at 50% 40%, rgba(79,140,255,0.10), rgba(0,0,0,0) 65%)' : 'radial-gradient(ellipse 90% 70% at 30% 18%, rgba(255,214,160,0.16), rgba(0,0,0,0) 60%)', mixBlendMode: 'screen' }} />
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 85% 75% at 50% 48%, rgba(0,0,0,0) 45%, rgba(10,6,3,0.72) 100%)' }} />
      <AbsoluteFill style={{ background: `rgba(8,5,3,${buio})` }} />
      {sg && <Img src={f(`grana${frame % 6}.png`)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', mixBlendMode: 'overlay', opacity: tech ? 0.12 : 0.22 }} />}
      </div>
      {/* bordo e ombra della lastra sopra il video vero (con la trasparenza passano a DaVinci) */}
      {sg && doc.presentatore && pl > 0.001 && pl < 0.999 && <>
        <div style={{ position: 'absolute', left: 0, right: 0, top: hMondo, height: 160 * k, background: 'linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0))' }} />
        <div style={{ position: 'absolute', left: 0, right: 0, top: hMondo, height: 6 * k, background: tech ? '#4fd1ff' : '#b79a5a', boxShadow: `0 0 ${30 * k}px ${tech ? '#4fd1ff' : '#b79a5a'}`, opacity: 0.9 }} />
      </>}

      {fin && t > fin.righe[0]?.t - 0.2 && (
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
          {fin.righe.map((r, i) => {
            const q = outCubic(prog(t, r.t, 0.8));
            const parti = r.rosso && r.testo.includes(r.rosso) ? r.testo.split(r.rosso) : [r.testo];
            return <div key={i} style={{ fontFamily: PENNELLO, fontSize: corpoRiga(r.testo) * k, color: '#f3ead6', opacity: q, transform: `translateY(${(1 - q) * 40 * k}px)`, textShadow: '0 10px 40px rgba(0,0,0,0.6)', lineHeight: 1.1, whiteSpace: 'nowrap' }}>
              {parti.length > 1 ? <>{parti[0]}<span style={{ color: '#e0503f' }}>{r.rosso}</span>{parti[1]}</> : r.testo}
            </div>;
          })}
          {fin.timbro && t > fin.timbro.t && (
            <div style={{ marginTop: 90 * k, transform: `scale(${1.5 - 0.5 * Easing.in(Easing.quad)(prog(t, fin.timbro.t, 0.14))})` }}>
              <div style={{ border: `${12 * k}px solid ${ROSSO}`, borderRadius: 18 * k, padding: `${14 * k}px ${16 * k}px`, fontFamily: MINCHO, fontWeight: 800, fontSize: 120 * k, color: ROSSO, writingMode: 'vertical-rl', background: 'rgba(243,234,214,0.92)' }}>{fin.timbro.testo}</div>
            </div>
          )}
        </AbsoluteFill>
      )}

      {!sg && <Img src={f(`grana${frame % 6}.png`)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', mixBlendMode: 'overlay', opacity: tech ? 0.12 : 0.22 }} />}
      {!sg && <Audio src={f(doc.voce)} />}
    </AbsoluteFill>
  );
};
void SERIF;

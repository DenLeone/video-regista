import React from 'react';
import { AbsoluteFill, Img, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { loadFont } from '@remotion/google-fonts/Montserrat';
import { loadFont as loadMono } from '@remotion/google-fonts/JetBrainsMono';
import { f, Sfx } from './comune';
import { Piano } from './piano';

// 📱 Documentario verticale (16/11): Denis parla nella metà bassa, nella fascia alta (sopra la testa: dal
// fotogramma del girato Sony la testa parte a ~1/3 dell'altezza) compaiono schermate animate pulite, angoli
// arrondati e ombra morbida, che entrano a molla ed escono sfumando (riferimenti: «TikTok AI» montato da Denis
// e lo Short dell'EQ). Tipi: chat (di Claude: la domanda si scrive, la risposta arriva parola per parola),
// terminale (comandi battuti), numeri (dati enormi), titolo (parola chiave nel riquadro arancio), repo
// (scheda GitHub), immagine (foto della cartella). Le scrive la regia in `schermate` (scripts/regia.mjs).

const { fontFamily: SANS } = loadFont('normal', { weights: ['600', '700', '800', '900'], subsets: ['latin'] });
const { fontFamily: MONO } = loadMono('normal', { weights: ['500', '700'], subsets: ['latin'] });

export type SchermataSopra = NonNullable<Piano['schermate']>[number];
export const TIPI_SOPRA = new Set(['chat', 'terminale', 'numeri', 'titolo', 'repo', 'immagine', 'lista', 'primadopo', 'logo', 'parola']);
// ✨ Ultron 2 (18/11): «animazione» = spazio lasciato vuoto nel render; dopo, Ultron ci mette l'animazione scritta da Claude
// fascia delle schermate: da 240 px (zone.json, Denis 19/11: sopra è fuori dalla zona sicura) fino a ~1/3 dell'altezza, larghe 940 px
const AREA = { top: 240, bottom: 640, left: 70, larghezza: 940 };
const CORALLO = '#D97757';
const ARANCIO = '#FF6A13';

const molla = (frame: number, fps: number, ritardo = 0) => spring({ frame: frame - ritardo, fps, config: { damping: 14, stiffness: 140 } });
const scritto = (testo: string, frame: number, da: number, a: number) =>
  testo.slice(0, Math.round(interpolate(frame, [da, a], [0, testo.length], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })));
const paroleScritte = (testo: string, frame: number, da: number, a: number) => {
  const parole = testo.split(/\s+/).filter(Boolean);
  return parole.slice(0, Math.round(interpolate(frame, [da, a], [0, parole.length], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }))).join(' ');
};

const Cursore: React.FC<{ frame: number; colore: string }> = ({ frame, colore }) => (
  <span style={{ display: 'inline-block', width: 4, height: '1em', background: colore, marginLeft: 3, verticalAlign: 'text-bottom', opacity: Math.floor(frame / 8) % 2 ? 0 : 1 }} />
);

// la scheda: entra a molla dall'alto, esce sfumando negli ultimi 8 fotogrammi
const Scheda: React.FC<{ len: number; sfondo?: string; bordo?: string; children: React.ReactNode; senzaScheda?: boolean }> = ({ len, sfondo, bordo, children, senzaScheda }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = molla(frame, fps, 0);
  const esce = interpolate(frame, [len - 8, len], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <div style={{ position: 'absolute', left: AREA.left, top: AREA.top, width: AREA.larghezza, maxHeight: AREA.bottom - AREA.top, display: 'flex', justifyContent: 'center' }}>
      <div style={{
        width: '100%', boxSizing: 'border-box', overflow: 'hidden',
        ...(senzaScheda ? {} : { background: sfondo, borderRadius: 30, boxShadow: '0 18px 50px rgba(0,0,0,0.55)', border: bordo ? `1.5px solid ${bordo}` : undefined }),
        transform: `translateY(${(1 - a) * -40}px) scale(${(0.88 + 0.12 * a) * (0.96 + 0.04 * esce)})`, opacity: Math.min(1, a * 1.4) * esce, transformOrigin: '50% 0%',
      }}>
        {children}
      </div>
    </div>
  );
};

// il simbolo di Claude: raggi corallo; `gira` = sta pensando (ruota e pulsa)
const Stella: React.FC<{ size: number; frame: number; gira?: boolean }> = ({ size, frame, gira }) => (
  <svg width={size} height={size} viewBox="-50 -50 100 100" style={{ flex: 'none', transform: `rotate(${gira ? frame * 7 : 0}deg) scale(${gira ? 0.9 + 0.12 * Math.sin(frame / 3) : 1})` }}>
    {Array.from({ length: 10 }, (_, i) => <rect key={i} x={-5} y={-48} width={10} height={36} rx={5} fill={CORALLO} transform={`rotate(${i * 36})`} />)}
  </svg>
);

// chat di Claude come nell'app (Denis, 16/11: «la barra della chat in cui si scrivono le cose, il caricamento»):
// 1) la domanda si batte nella barra in basso, la freccia si accende; 2) invio: la barra si svuota e la domanda
// sale nel fumetto; 3) Claude pensa (stella che gira, puntini); 4) la risposta arriva parola per parola
const Chat: React.FC<{ s: SchermataSopra; len: number }> = ({ s, len }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const domanda = s.testo || '';
  const risposta = s.risposta || '';
  const invio = Math.round(len * (risposta ? 0.4 : 0.7));       // fotogramma dell'invio
  const pensa = invio + Math.round(Math.min(fps * 0.9, len * 0.14)); // fine del caricamento
  const battuto = scritto(domanda, frame, 5, invio - 6);
  const inviato = frame >= invio;
  const sale = molla(frame, fps, invio);
  const pronto = !inviato && battuto.length === domanda.length;
  const vista = risposta && frame >= pensa ? paroleScritte(risposta, frame, pensa, len * 0.9) : '';
  const puntini = '.'.repeat(1 + (Math.floor(frame / 6) % 3));
  return (
    <Scheda len={len} sfondo="#FAF9F5">
      <div style={{ padding: '22px 30px 24px', fontFamily: SANS, display: 'flex', flexDirection: 'column', minHeight: 430, boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <Stella size={30} frame={frame} />
          <span style={{ fontSize: 30, fontWeight: 700, color: '#3D3929' }}>{s.titolo || 'Claude'}</span>
        </div>
        <div style={{ flex: 1 }}>
          {inviato ? (
            <div style={{ display: 'flex', justifyContent: 'flex-end', opacity: Math.min(1, sale * 1.5), transform: `translateY(${(1 - sale) * 70}px)` }}>
              <div style={{ maxWidth: 760, background: '#EFECE3', borderRadius: 22, padding: '14px 22px', fontSize: 31, fontWeight: 600, color: '#1F1E1D', lineHeight: 1.28 }}>{domanda}</div>
            </div>
          ) : null}
          {inviato && risposta ? (
            <div style={{ marginTop: 16, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <div style={{ marginTop: 4 }}><Stella size={34} frame={frame} gira={frame < pensa} /></div>
              {frame < pensa
                ? <span style={{ fontSize: 30, fontWeight: 600, color: '#8A8577', lineHeight: 1.4 }}>Sto pensando{puntini}</span>
                : <span style={{ fontSize: 31, fontWeight: 600, color: '#3D3929', lineHeight: 1.34 }}>{vista}</span>}
            </div>
          ) : null}
        </div>
        {/* la barra della chat */}
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 14, background: '#FFFFFF', border: `2px solid ${pronto ? CORALLO : '#DEDACF'}`, borderRadius: 24, padding: '14px 14px 14px 22px',
          boxShadow: '0 4px 14px rgba(60,50,30,0.08)' }}>
          <span style={{ fontSize: 28, fontWeight: 600, color: '#B5B0A3' }}>+</span>
          <div style={{ flex: 1, fontSize: 30, fontWeight: 600, lineHeight: 1.28, color: inviato ? '#B5B0A3' : '#1F1E1D', minHeight: 40 }}>
            {inviato ? 'Rispondi a Claude…' : <>{battuto}<Cursore frame={frame} colore="#1F1E1D" /></>}
          </div>
          <div style={{ width: 54, height: 54, borderRadius: 16, flex: 'none', background: pronto ? CORALLO : '#E7E3D8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 32, fontWeight: 900,
            transform: `scale(${pronto ? 1 + 0.1 * Math.max(0, Math.sin(frame / 2.5)) : inviato && frame < invio + 5 ? 0.86 : 1})` }}>↑</div>
        </div>
      </div>
    </Scheda>
  );
};

// terminale: i comandi si battono uno dopo l'altro
const Terminale: React.FC<{ s: SchermataSopra; len: number }> = ({ s, len }) => {
  const frame = useCurrentFrame();
  const righe = (s.voci?.length ? s.voci : [s.testo || '']).filter(Boolean).slice(0, 4);
  const passo = (len * 0.82 - 6) / Math.max(1, righe.length);
  return (
    <Scheda len={len} sfondo="#141414" bordo="rgba(255,255,255,0.08)">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 22px', background: '#232323' }}>
        {['#FF5F57', '#FEBC2E', '#28C840'].map((c) => <span key={c} style={{ width: 16, height: 16, borderRadius: 8, background: c, display: 'inline-block' }} />)}
        <span style={{ marginLeft: 14, fontFamily: SANS, fontSize: 24, fontWeight: 700, color: '#9A9A9A' }}>{s.titolo || 'Claude Code'}</span>
      </div>
      <div style={{ padding: '22px 26px 26px', fontFamily: MONO, fontSize: 29, fontWeight: 500, color: '#EDEDED', lineHeight: 1.5 }}>
        {righe.map((r, i) => {
          const da = 6 + i * passo;
          if (frame < da) return null;
          const t = scritto(r, frame, da, da + passo * 0.8);
          return (
            <div key={i} style={{ wordBreak: 'break-all' }}>
              <span style={{ color: CORALLO, fontWeight: 700 }}>&gt; </span>{t}
              {t.length < r.length || i === righe.length - 1 ? <Cursore frame={frame} colore="#EDEDED" /> : null}
            </div>
          );
        })}
      </div>
    </Scheda>
  );
};

// numeri enormi: «300+ skill», «71 agenti», «gratis»
const Numeri: React.FC<{ s: SchermataSopra; len: number }> = ({ s, len }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const voci = (s.voci?.length ? s.voci : [s.testo || '']).filter(Boolean).slice(0, 4);
  const passo = Math.min(10, (len * 0.5) / Math.max(1, voci.length));
  return (
    <Scheda len={len} sfondo="rgba(12,12,12,0.8)" bordo="rgba(255,255,255,0.14)">
      <div style={{ padding: '26px 38px', fontFamily: SANS }}>
        {s.titolo ? <div style={{ fontSize: 28, fontWeight: 800, color: '#FFB347', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>{s.titolo}</div> : null}
        {voci.map((v, i) => {
          const m = /^([\d.,]+\s*[+%k]?|\+?[\d.,]+)\s*(.*)$/i.exec(v.trim());
          const numero = m ? m[1].trim() : v, etichetta = m ? m[2] : '';
          const a = molla(frame, fps, 4 + i * passo);
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 18, opacity: Math.min(1, a * 1.3), transform: `translateX(${(1 - a) * -30}px)` }}>
              <span style={{ fontSize: m ? 88 : 64, fontWeight: 900, color: '#FFFFFF', lineHeight: 1.05, textTransform: 'uppercase' }}>{numero}</span>
              {etichetta ? <span style={{ fontSize: 40, fontWeight: 800, color: '#FFB347', textTransform: 'uppercase' }}>{etichetta}</span> : null}
            </div>
          );
        })}
      </div>
    </Scheda>
  );
};

// titolo: parole tra *asterischi* nel riquadro arancio («LA *GOD MODE* DI CLAUDE»)
const Titolo: React.FC<{ s: SchermataSopra; len: number }> = ({ s, len }) => {
  const pezzi = String(s.testo || '').split(/(\*[^*]+\*)/).filter(Boolean);
  return (
    <Scheda len={len} senzaScheda>
      <div style={{ textAlign: 'center', fontFamily: SANS, padding: '10px 0' }}>
        {s.titolo ? <div style={{ fontSize: 30, fontWeight: 800, color: '#FFB347', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 14, textShadow: '0 2px 10px rgba(0,0,0,0.7)' }}>{s.titolo}</div> : null}
        <div style={{ fontSize: 82, fontWeight: 900, color: '#FFFFFF', lineHeight: 1.12, textTransform: 'uppercase', textShadow: '0 4px 18px rgba(0,0,0,0.75)' }}>
          {pezzi.map((p, i) => (p.startsWith('*')
            ? <span key={i} style={{ background: ARANCIO, color: '#111111', padding: '0 14px', borderRadius: 10, textShadow: 'none', boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone' }}>{p.slice(1, -1)}</span>
            : <span key={i}>{p}</span>))}
        </div>
      </div>
    </Scheda>
  );
};

// scheda GitHub: «affaan-m / ECC», descrizione, etichette
const Repo: React.FC<{ s: SchermataSopra; len: number }> = ({ s, len }) => (
  <Scheda len={len} sfondo="#FFFFFF">
    <div style={{ padding: '26px 34px 30px', fontFamily: SANS }}>
      <div style={{ fontSize: 24, fontWeight: 700, color: '#59636E', marginBottom: 10 }}>github.com</div>
      <div style={{ fontSize: 46, fontWeight: 800, color: '#0969DA', lineHeight: 1.1 }}>{s.titolo || ''}</div>
      {s.testo ? <div style={{ marginTop: 14, fontSize: 31, fontWeight: 600, color: '#1F2328', lineHeight: 1.35 }}>{s.testo}</div> : null}
      {s.voci?.length ? (
        <div style={{ marginTop: 18, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {s.voci.slice(0, 4).map((v) => <span key={v} style={{ background: '#DDF4FF', color: '#0969DA', fontSize: 26, fontWeight: 700, padding: '6px 16px', borderRadius: 999 }}>{v}</span>)}
        </div>
      ) : null}
    </div>
  </Scheda>
);

const Immagine: React.FC<{ s: SchermataSopra; len: number }> = ({ s, len }) => (
  <Scheda len={len} sfondo="#111111">
    {/* la foto intera (contain), mai ritagliata: dietro la stessa foto sfocata riempie la scheda (Fifine 19/11: «40% OFF» mozzato) */}
    {s.media?.[0] ? <div style={{ position: 'relative', width: '100%', height: AREA.bottom - AREA.top - 20, overflow: 'hidden' }}>
      <Img src={staticFile(`media/${s.media[0]}`)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(28px) brightness(0.7)', transform: 'scale(1.15)' }} />
      <Img src={staticFile(`media/${s.media[0]}`)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />
    </div> : null}
    {s.titolo ? <div style={{ position: 'absolute', left: 24, bottom: 18, fontFamily: SANS, fontSize: 30, fontWeight: 800, color: '#fff', textShadow: '0 2px 10px rgba(0,0,0,0.8)' }}>{s.titolo}</div> : null}
  </Scheda>
);

// ---------- ✨ Ultron 2 (18/11): motion graphic più ricche ----------
// numero dentro una voce («300 skill» → 300, «1.000» → 1000, «27 azioni» → 27); null se non c'è
const numeroDi = (v: string) => {
  const m = /(\d[\d.,]*)/.exec(v);
  if (!m) return null;
  const n = Number(m[1].replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.'));
  return Number.isFinite(n) ? { n, prima: v.slice(0, m.index), dopo: v.slice(m.index + m[1].length) } : null;
};
const conta = (n: number, frame: number, da: number, a: number, base = 0) => {
  const t = interpolate(frame, [da, a], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const e = 1 - Math.pow(1 - t, 3);
  const x = Math.round(base + (n - base) * e);
  return x >= 1000 ? x.toLocaleString('it-IT') : String(x);
};
// luce che attraversa una scheda (riflesso), da sinistra a destra tra i fotogrammi da→a
const Riflesso: React.FC<{ frame: number; da: number; a: number }> = ({ frame, da, a }) => {
  const x = interpolate(frame, [da, a], [-60, 160], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: `linear-gradient(105deg, transparent ${x - 30}%, rgba(255,255,255,0.28) ${x}%, transparent ${x + 30}%)` }} />;
};

// lista che si costruisce: ogni voce entra con il suo contatore che sale («300 skill · 74 agenti · 27 azioni»)
const Lista: React.FC<{ s: SchermataSopra; len: number }> = ({ s, len }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const voci = (s.voci?.length ? s.voci : [s.testo || '']).filter(Boolean).slice(0, 4);
  const passo = Math.max(6, Math.min(14, (len * 0.55) / Math.max(1, voci.length)));
  return (
    <Scheda len={len} sfondo="linear-gradient(160deg, rgba(24,24,28,0.92), rgba(8,8,10,0.92))" bordo="rgba(255,255,255,0.16)">
      <div style={{ padding: '24px 34px 28px', fontFamily: SANS, position: 'relative' }}>
        {s.titolo ? <div style={{ fontSize: 28, fontWeight: 800, color: ARANCIO, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>{s.titolo}</div> : null}
        {voci.map((v, i) => {
          const da = 4 + i * passo;
          const a = molla(frame, fps, da);
          const num = numeroDi(v);
          const acceso = frame >= da && frame < da + passo;
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 22, margin: '8px 0', opacity: Math.min(1, a * 1.4), transform: `translateX(${(1 - a) * 60}px)` }}>
              <div style={{ width: 18, height: 18, borderRadius: 9, flex: 'none', background: acceso ? ARANCIO : 'rgba(255,255,255,0.35)', boxShadow: acceso ? `0 0 22px ${ARANCIO}` : 'none' }} />
              <div style={{ fontSize: 74, fontWeight: 900, color: '#FFFFFF', lineHeight: 1.04, textTransform: 'uppercase', letterSpacing: -1 }}>
                {num ? <>{num.prima}<span style={{ color: acceso ? '#FFD39A' : '#FFFFFF' }}>{conta(num.n, frame, da, da + passo * 1.4)}</span><span style={{ fontSize: 46, fontWeight: 800, color: '#FFB347' }}>{num.dopo}</span></> : v}
              </div>
            </div>
          );
        })}
        <Riflesso frame={frame} da={len * 0.62} a={len * 0.92} />
      </div>
    </Scheda>
  );
};

// prima → dopo: la barra piccola resta grigia, quella del «dopo» cresce col contatore, poi lampo e badge ×N
const PrimaDopo: React.FC<{ s: SchermataSopra; len: number }> = ({ s, len }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const [p = '', d = ''] = s.voci || [];
  const np = numeroDi(p)?.n || 1, nd = numeroDi(d)?.n || np * 10;
  const cresce = interpolate(frame, [12, len * 0.6], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const e = 1 - Math.pow(1 - cresce, 3);
  const largo = 780, lp = Math.max(60, largo * Math.min(1, np / nd));
  const lampo = interpolate(frame, [len * 0.6, len * 0.6 + 4, len * 0.6 + 14], [0, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const badge = molla(frame, fps, len * 0.6);
  const volte = Math.round(nd / np);
  const riga = (et: string, w: number, colore: string, testo: string, grande: boolean) => (
    <div style={{ margin: '14px 0' }}>
      <div style={{ fontSize: 26, fontWeight: 800, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 6 }}>{et}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <div style={{ width: w, height: grande ? 58 : 34, borderRadius: 14, background: colore, boxShadow: grande ? `0 0 ${20 + 40 * lampo}px ${ARANCIO}` : 'none' }} />
        <span style={{ fontSize: grande ? 76 : 44, fontWeight: 900, color: '#fff', whiteSpace: 'nowrap' }}>{testo}</span>
      </div>
    </div>
  );
  return (
    <Scheda len={len} sfondo="rgba(10,10,12,0.9)" bordo="rgba(255,255,255,0.14)">
      <div style={{ padding: '22px 34px 26px', fontFamily: SANS, position: 'relative' }}>
        {s.titolo ? <div style={{ fontSize: 28, fontWeight: 800, color: ARANCIO, letterSpacing: 2, textTransform: 'uppercase' }}>{s.titolo}</div> : null}
        {riga('Prima', lp * 0.6, 'rgba(255,255,255,0.28)', p, false)}
        {riga('Dopo', Math.max(lp * 0.6, (largo * 0.7) * e), `linear-gradient(90deg, #FF8A3D, ${ARANCIO})`, numeroDi(d) ? `${numeroDi(d)!.prima}${conta(nd, frame, 12, len * 0.6, np)}${numeroDi(d)!.dopo}` : d, true)}
        {volte >= 2 ? <div style={{ position: 'absolute', right: 30, top: 18, background: ARANCIO, color: '#111', fontSize: 44, fontWeight: 900, padding: '6px 20px', borderRadius: 16,
          transform: `scale(${badge}) rotate(${(1 - badge) * -20}deg)`, opacity: Math.min(1, badge * 1.5) }}>×{volte}</div> : null}
        <div style={{ position: 'absolute', inset: 0, background: '#fff', opacity: lampo * 0.18, pointerEvents: 'none' }} />
      </div>
    </Scheda>
  );
};

// logo in scena: la foto (logo o schermata) entra ruotando in 3D, si posa, una luce la attraversa, didascalia sotto
const Logo: React.FC<{ s: SchermataSopra; len: number }> = ({ s, len }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = molla(frame, fps, 0);
  const esce = interpolate(frame, [len - 8, len], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const ondeggia = Math.sin(frame / 18) * 4;
  const testo = molla(frame, fps, 10);
  return (
    <div style={{ position: 'absolute', left: AREA.left, top: AREA.top, width: AREA.larghezza, height: AREA.bottom - AREA.top, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', perspective: 1400, opacity: esce }}>
      <div style={{ width: 380, height: 380, borderRadius: 64, position: 'relative', overflow: 'hidden', background: 'radial-gradient(circle at 30% 25%, #2A2A30, #0C0C0E)',
        boxShadow: `0 30px 80px rgba(0,0,0,0.6), 0 0 ${40 + 30 * Math.sin(frame / 10)}px rgba(255,106,19,0.35)`, border: '2px solid rgba(255,255,255,0.14)',
        transform: `rotateY(${(1 - a) * 80 + ondeggia}deg) rotateX(${(1 - a) * -20 + ondeggia * 0.4}deg) scale(${0.6 + 0.4 * a})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {s.media?.[0] ? <Img src={staticFile(`media/${s.media[0]}`)} style={{ width: '78%', height: '78%', objectFit: 'contain' }} /> : null}
        <Riflesso frame={frame} da={8} a={30} />
      </div>
      {s.titolo || s.testo ? (
        <div style={{ marginTop: 22, textAlign: 'center', fontFamily: SANS, opacity: Math.min(1, testo * 1.4), transform: `translateY(${(1 - testo) * 20}px)` }}>
          {s.titolo ? <div style={{ fontSize: 54, fontWeight: 900, color: '#fff', textShadow: '0 4px 18px rgba(0,0,0,0.8)' }}>{s.titolo}</div> : null}
          {s.testo ? <div style={{ fontSize: 30, fontWeight: 700, color: '#FFB347', textShadow: '0 2px 10px rgba(0,0,0,0.8)' }}>{s.testo}</div> : null}
        </div>
      ) : null}
    </div>
  );
};

// parola del gancio: arriva enorme e sfocata, sbatte al suo posto (scossa), scintille intorno; *parola* = arancio
const Parola: React.FC<{ s: SchermataSopra; len: number }> = ({ s, len }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = spring({ frame, fps, config: { damping: 11, stiffness: 220 } });
  const esce = interpolate(frame, [len - 8, len], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const scossa = frame > 4 && frame < 12 ? Math.sin(frame * 3.1) * (12 - frame) * 1.6 : 0;
  const pezzi = String(s.testo || '').split(/(\*[^*]+\*)/).filter(Boolean);
  const scintille = Array.from({ length: 14 }, (_, i) => {
    const ang = (i / 14) * Math.PI * 2 + i;
    const t = interpolate(frame, [5, 26], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    const r = 120 + 360 * t * (0.6 + (i % 3) * 0.2);
    return <div key={i} style={{ position: 'absolute', left: '50%', top: '50%', width: 10, height: 10, borderRadius: 5, background: i % 2 ? ARANCIO : '#FFD39A',
      transform: `translate(${Math.cos(ang) * r}px, ${Math.sin(ang) * r * 0.55}px) scale(${1 - t})`, opacity: frame < 5 ? 0 : 1 - t }} />;
  });
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: AREA.top, height: AREA.bottom - AREA.top, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: esce }}>
      {scintille}
      <div style={{ textAlign: 'center', fontFamily: SANS, padding: '0 50px', transform: `translateX(${scossa}px) scale(${2.4 - 1.4 * a})`, filter: `blur(${Math.max(0, (1 - a) * 18)}px)`, opacity: Math.min(1, a * 2) }}>
        {s.titolo ? <div style={{ fontSize: 34, fontWeight: 800, color: '#FFB347', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 8, textShadow: '0 2px 10px rgba(0,0,0,0.8)' }}>{s.titolo}</div> : null}
        <div style={{ fontSize: 112, fontWeight: 900, color: '#fff', lineHeight: 1.02, textTransform: 'uppercase', letterSpacing: -2, textShadow: '0 6px 30px rgba(0,0,0,0.8)' }}>
          {pezzi.map((p, i) => (p.startsWith('*') ? <span key={i} style={{ color: ARANCIO }}>{p.slice(1, -1)}</span> : <span key={i}>{p}</span>))}
        </div>
      </div>
    </div>
  );
};

const Una: React.FC<{ s: SchermataSopra; len: number }> = ({ s, len }) => {
  if (s.tipo === 'chat') return <Chat s={s} len={len} />;
  if (s.tipo === 'terminale') return <Terminale s={s} len={len} />;
  if (s.tipo === 'numeri') return <Numeri s={s} len={len} />;
  if (s.tipo === 'titolo') return <Titolo s={s} len={len} />;
  if (s.tipo === 'repo') return <Repo s={s} len={len} />;
  if (s.tipo === 'immagine') return <Immagine s={s} len={len} />;
  if (s.tipo === 'lista') return <Lista s={s} len={len} />;
  if (s.tipo === 'primadopo') return <PrimaDopo s={s} len={len} />;
  if (s.tipo === 'logo') return <Logo s={s} len={len} />;
  if (s.tipo === 'parola') return <Parola s={s} len={len} />;
  return null;
};

export const SchermateSopra: React.FC<{ piano: Piano; sfx: number }> = ({ piano, sfx }) => {
  const schermate = (piano.schermate || []).filter((s) => TIPI_SOPRA.has(s.tipo));
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {schermate.map((s, i) => {
        const len = Math.max(12, f(s.dur));
        return (
          <Sequence key={`ss${i}`} from={f(s.at)} durationInFrames={len}>
            <Una s={s} len={len} />
          </Sequence>
        );
      })}
      {sfx > 0 ? schermate.map((s, i) => <Sfx key={`sx${i}`} nome="whoosh" da={f(s.at) - 4} volume={0.32 * sfx} />) : null}
      {sfx > 0 ? schermate.filter((s) => s.tipo === 'chat' && s.risposta).map((s, i) => <Sfx key={`sr${i}`} nome="ui_conferma" da={f(s.at + s.dur * 0.4)} volume={0.3 * sfx} />) : null}
    </AbsoluteFill>
  );
};

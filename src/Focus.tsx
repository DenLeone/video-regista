import React from 'react';
import { AbsoluteFill, Easing, Img, interpolate, OffthreadVideo, random, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { loadFont } from '@remotion/google-fonts/Inter';
import { Clips, f, Icone, MusicaSotto, Ritagli, Scheda, schedeInserti, Sfx, usaFps, volumeSfx } from './comune';
import { durataClip, Keyword, Piano } from './piano';

// Focus (09/11, dal reel di riferimento in Drive "12 · Risorse/Stili/Focus/esempi"):
// - scritta a due livelli: riga piccola in corsivo leggero rosso scuro sopra ("My name is"), parola ENORME in
//   corsivo nerissimo con sfumatura rossa ("Hera"), parolina sotto a destra ("rose"); passa DIETRO la persona
// - le lettere entrano una alla volta sfocate, con quadratini rossi "pixel" che lampeggiano intorno
// - schede foto inclinate con bordo rosso, pillola rossa e icona app sull'angolo; cerchio a retino che esplode dietro
// - sui B-roll (voce da un'altra sorgente) il contorno di un telefono con la scritta dentro
// - nei cambi di scena un flash "fantasma" in negativo scuro
// keywords: word = parola enorme, note = riga piccola sopra, tag = parolina sotto (e pillola sulla scheda)

const { fontFamily: INTER } = loadFont('italic', { weights: ['300', '900'], subsets: ['latin'] });
const { fontFamily: INTER_DRITTO } = loadFont('normal', { weights: ['300', '800', '900'], subsets: ['latin'] });

const ROSSO = '#E3141F';
const SCURO = '#8C0A12';

const liscio = (x: number) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };

// ---------- scene: clip per clip, con cambi di scena e B-roll ----------
type Tratto = { da: number; len: number; broll: boolean; cambio: boolean; indice: number };
function tratti(piano: Piano): Tratto[] {
  let t = 0;
  let scene = 0;
  return piano.clips.map((c, i) => {
    const len = f(durataClip(c));
    const prima = piano.clips[i - 1];
    const cambio = i > 0 && prima.file !== c.file;
    if (cambio) scene++;
    const x = { da: t, len, broll: Boolean(c.broll), cambio, indice: scene };
    t += len;
    return x;
  });
}


// ---------- parole chiave fitte ----------
// Nel riferimento arriva una parola grande ogni 2–3 s. Se la regia ne ha date poche (Test Impact, 09/11:
// 4 in 72 s), i buchi si riempiono dal parlato: la parola più "forte" del tratto (numeri, nomi, parole
// lunghe) diventa la scritta grande e le 2–4 parole prima la riga piccola sopra.
const VUOTE = new Set(('che di il la lo le gli i un una uno per con non sono è e a in su da ma se mi ti si ci vi del della dei delle degli '
  + 'al alla allo ai alle dal dalla nel nella nei sul sulla anche perché quindi poi comunque allora ovviamente questo questa questi queste '
  + 'quello quella quelli quelle cosa come dove quando molto tutto tutti tutta tutte più meno sarebbe sarebbero potrebbero ancora già solo '
  + 'sempre mai essere avere fare detto dice dicono vuol dire io tu lui lei noi voi loro mio mia tuo tua suo sua nostro vostro ho hai ha '
  + 'abbiamo hanno era erano sei siamo siete o oppure né cui quale quali qui qua là lì così tipo cioè però infatti invece proprio stato '
  + 'stata fatto fatta andato andata devi deve vorrebbe vorresti mentre dopo prima ogni').split(' '));
const pulisci = (w: string) => w.replace(/^[«"'(\[]+|[»"'),.;:!?\]]+$/g, '');
const forza = (w: string, primaDiFrase: boolean) => {
  const p = pulisci(w), l = p.toLowerCase();
  if (!p || VUOTE.has(l)) return 0;
  if (/\d/.test(p)) return 10;
  let s = p.length >= 7 ? 2 + p.length / 8 : p.length >= 5 ? 1 : 0.2;
  if (/^[A-ZÀ-Ý]/.test(p) && !primaDiFrase) s += 3;
  return s;
};
function paroleFitte(piano: Piano): Keyword[] {
  const date = [...piano.keywords].sort((a, b) => a.at - b.at);
  const parole = piano.parole || [];
  if (!parole.length) return date;
  const fine = piano.clips.reduce((t, c) => t + durataClip(c), 0);
  const PASSO = 2.6, usate = new Set(date.map((k) => k.word.toLowerCase()));
  const tutte = [...date];
  let t = 0.2;
  while (t < fine - 1.2) {
    const dentro = tutte.find((k) => k.at <= t + 0.2 && k.at + k.dur > t);
    if (dentro) { t = dentro.at + dentro.dur + 0.25; continue; }
    const prossima = tutte.filter((k) => k.at > t).sort((a, b) => a.at - b.at)[0];
    const limite = Math.min(t + PASSO, prossima ? prossima.at - 0.6 : fine);
    let meglio = -1, punti = 0.9;
    parole.forEach((w, i) => {
      if (w.at < t || w.at >= limite) return;
      const primaDiFrase = i === 0 || /[.!?]$/.test(parole[i - 1].w);
      const s = forza(w.w, primaDiFrase) - (usate.has(pulisci(w.w).toLowerCase()) ? 3 : 0);
      if (s > punti) { punti = s; meglio = i; }
    });
    if (meglio < 0) { t = limite; continue; }
    const w = parole[meglio];
    const parola = pulisci(w.w);
    // riga piccola: le parole subito prima, nella stessa frase (max 4)
    const prima: string[] = [];
    for (let j = meglio - 1; j >= 0 && prima.length < 4; j--) {
      if (/[.!?]$/.test(parole[j].w) || w.at - parole[j].at > 2.2) break;
      prima.unshift(pulisci(parole[j].w));
    }
    const at = Math.max(t, w.at - 0.12);
    const dur = Math.max(1.2, Math.min(2.4, (prossima ? prossima.at - 0.25 : fine) - at));
    tutte.push({ at: +at.toFixed(3), dur: +dur.toFixed(3), word: parola.charAt(0).toUpperCase() + parola.slice(1), note: prima.join(' ') || undefined });
    usate.add(parola.toLowerCase());
    t = at + dur + 0.25;
  }
  return tutte.sort((a, b) => a.at - b.at);
}

// ---------- effetti ----------
// cerchio a retino rosso che esplode e svanisce
const Retino: React.FC<{ cx: number; cy: number; r: number }> = ({ cx, cy, r }) => {
  const fr = useCurrentFrame();
  const p = interpolate(fr, [0, 14], [0, 1], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const raggio = r * (0.35 + 0.9 * p);
  const op = (1 - p) * 0.9;
  if (op <= 0.01) return null;
  return (
    <div style={{
      position: 'absolute', left: cx - raggio, top: cy - raggio, width: raggio * 2, height: raggio * 2, borderRadius: '50%', opacity: op,
      backgroundImage: `radial-gradient(circle, ${ROSSO} 32%, transparent 38%)`, backgroundSize: '22px 22px',
      WebkitMaskImage: 'radial-gradient(circle, transparent 38%, black 52%, black 66%, transparent 72%)',
      maskImage: 'radial-gradient(circle, transparent 38%, black 52%, black 66%, transparent 72%)',
    }} />
  );
};

// quadratini rossi che lampeggiano intorno a una zona, per pochi fotogrammi
const Pixel: React.FC<{ seme: string; x: number; y: number; w: number; h: number; n?: number }> = ({ seme, x, y, w, h, n = 12 }) => {
  const fr = useCurrentFrame();
  if (fr > 14) return null;
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const nasce = Math.floor(random(`${seme}n${i}`) * 9);
        const vive = 2 + Math.floor(random(`${seme}v${i}`) * 4);
        if (fr < nasce || fr > nasce + vive) return null;
        const lato = 14 + random(`${seme}l${i}`) * 34;
        return (
          <div key={i} style={{ position: 'absolute', left: x + random(`${seme}x${i}`) * w, top: y + random(`${seme}y${i}`) * h, width: lato * (1 + random(`${seme}r${i}`)), height: lato,
            background: ROSSO, opacity: 0.35 + 0.6 * random(`${seme}o${i}`) }} />
        );
      })}
    </>
  );
};

// ---------- la scritta a due livelli ----------
const grandezza = (parola: string) => {
  const righe = parola.length > 11 && parola.includes(' ') ? 2 : 1;
  const lunga = Math.max(...parola.split(righe === 2 ? ' ' : '\u0000').map((x) => x.length));
  // Inter 900 corsivo: ~0,6 em a lettera; deve stare in 980 px, se no l'ultima lettera va a capo dietro la persona ("Italian" per Italiano, 09/11)
  return { size: Math.min(300, Math.round(960 / Math.max(3.2, lunga * 0.6))), righe };
};

// sfumato: la sfumatura rossa va su ogni lettera (il background-clip del contenitore non passa alle lettere animate)
const SFUMATA = { background: 'linear-gradient(180deg, #F2434A 0%, #D3141E 45%, #8A0A12 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' } as const;
const Lettere: React.FC<{ testo: string; ritardo?: number; passo?: number; sfumato?: boolean }> = ({ testo, ritardo = 0, passo = 1.2, sfumato }) => {
  const fr = useCurrentFrame();
  return (
    <>
      {[...testo].map((ch, i) => {
        const p = interpolate(fr - ritardo - i * passo, [0, 6], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        return (
          <span key={i} style={{ display: 'inline-block', opacity: p, filter: `blur(${(1 - p) * 12}px)`, transform: `translateX(${(1 - p) * -28}px)`, whiteSpace: 'pre',
            ...(sfumato ? { ...SFUMATA, paddingRight: '0.06em', marginRight: '-0.06em' } : {}) }}>{ch}</span>
        );
      })}
    </>
  );
};

const Scritta: React.FC<{ k: Keyword; len: number; i: number; top: number }> = ({ k, len, i, top }) => {
  const fr = useCurrentFrame();
  const { size, righe } = grandezza(k.word);
  const esce = interpolate(fr, [len - 6, len], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const alto = top + (righe === 2 ? 0 : 40);
  return (
    <AbsoluteFill style={{ opacity: 1 - esce, filter: esce > 0 ? `blur(${esce * 10}px)` : undefined, transform: `scale(${1 + esce * 0.06})` }}>
      <Pixel seme={`k${i}`} x={60} y={alto - 40} w={960} h={size * righe + 120} />
      <div style={{ position: 'absolute', left: 50, right: 50, top: alto, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ position: 'relative', display: 'inline-block' }}>
          {k.note ? (
            <div style={{ position: 'absolute', left: size * 0.12, top: -size * 0.32, fontFamily: INTER, fontStyle: 'italic', fontWeight: 300, fontSize: size * 0.22, color: SCURO, letterSpacing: -1, whiteSpace: 'nowrap' }}>
              <Lettere testo={k.note} passo={0.8} />
            </div>
          ) : null}
          <div style={{ fontFamily: INTER, fontStyle: 'italic', fontWeight: 900, fontSize: size, lineHeight: 0.92, letterSpacing: -size * 0.055, textAlign: 'center', whiteSpace: 'nowrap',
            paddingRight: size * 0.08, filter: 'drop-shadow(0 8px 14px rgba(120,0,0,0.22))' }}>
            {righe === 2 ? k.word.split(' ').map((w, j) => <div key={j}><Lettere testo={w} ritardo={3 + j * 4} sfumato /></div>) : <Lettere testo={k.word} ritardo={3} sfumato />}
          </div>
          {k.tag ? (
            <div style={{ position: 'absolute', right: size * 0.1, bottom: -size * 0.2, fontFamily: INTER, fontStyle: 'italic', fontWeight: 300, fontSize: size * 0.2, color: SCURO, letterSpacing: -1, whiteSpace: 'nowrap' }}>
              <Lettere testo={k.tag} ritardo={8} passo={0.8} />
            </div>
          ) : null}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ---------- telefono sui B-roll ----------
const Telefono: React.FC<{ k?: Keyword; dentro: number }> = ({ k, dentro }) => {
  const fr = useCurrentFrame();
  const p = spring({ frame: fr, fps: 30, config: { damping: 16, stiffness: 140 } });
  const W = 640, H = 1180, x = (1080 - W) / 2, y = 300;
  const parole = k ? k.word.toUpperCase().split(' ') : [];
  return (
    <AbsoluteFill style={{ opacity: p }}>
      <div style={{ position: 'absolute', left: x, top: y + (1 - p) * 60, width: W, height: H, borderRadius: 96, border: '5px solid rgba(255,255,255,0.75)',
        boxShadow: `0 0 0 3px ${ROSSO}55, inset 0 0 60px rgba(255,255,255,0.25)`, background: 'linear-gradient(180deg, rgba(255,255,255,0.28), rgba(255,255,255,0.06) 45%, rgba(255,255,255,0))' }}>
        <div style={{ position: 'absolute', left: W / 2 - 60, top: 34, width: 120, height: 34, borderRadius: 17, background: ROSSO }} />
        {k ? (
          <Sequence from={Math.max(0, dentro)} layout="none">
            <div style={{ position: 'absolute', left: 30, right: 30, top: 150, textAlign: 'center' }}>
              {k.note ? <div style={{ fontFamily: INTER_DRITTO, fontWeight: 300, fontSize: 46, color: SCURO, lineHeight: 1.05 }}><Lettere testo={k.note} passo={0.7} /></div> : null}
              {parole.map((w, j) => (
                <div key={j} style={{ fontFamily: INTER_DRITTO, fontWeight: 900, fontSize: Math.min(96, Math.round(500 / Math.max(4, w.length * 0.72))), color: ROSSO, letterSpacing: -2, lineHeight: 1.0, whiteSpace: 'nowrap',
                  textShadow: '0 2px 0 rgba(255,255,255,0.6)' }}>
                  <Lettere testo={w} ritardo={4 + j * 5} passo={1} />
                </div>
              ))}
              {k.tag ? <div style={{ fontFamily: INTER_DRITTO, fontWeight: 800, fontSize: 58, color: ROSSO, marginTop: 6 }}><Lettere testo={k.tag.toUpperCase()} ritardo={14} /></div> : null}
            </div>
          </Sequence>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

// ---------- schede foto ----------
const SchedaFocus: React.FC<{ s: Scheda; i: number; pillola?: string }> = ({ s, i, pillola }) => {
  const fr = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: fr, fps, config: { damping: 13, stiffness: 150 } });
  const esce = interpolate(fr, [s.len - 6, s.len], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const orizz = s.pezzi[0].ins.orient === 'h';
  const w = orizz ? 760 : 520, h = orizz ? 470 : 680;
  const cx = 540 + (i % 2 ? 60 : -40), cy = 640;
  const rot = i % 2 ? 4 : -3;
  const zoom = 1 + 0.05 * (fr / Math.max(1, s.len));
  return (
    <AbsoluteFill style={{ opacity: 1 - esce }}>
      <Retino cx={cx} cy={cy} r={Math.max(w, h) * 0.85} />
      <div style={{ position: 'absolute', left: cx - w / 2, top: cy - h / 2, width: w, height: h, borderRadius: 44, overflow: 'hidden', border: `6px solid ${ROSSO}`,
        boxShadow: `0 0 0 3px rgba(255,255,255,0.7), 0 22px 50px rgba(160,0,10,0.28)`, background: '#ddd',
        transform: `rotate(${rot * p}deg) scale(${0.55 + 0.45 * p})`, filter: p < 0.9 ? `blur(${(1 - p) * 10}px)` : undefined }}>
        {s.pezzi.map((pz, j) => (
          <Sequence key={j} from={pz.from - s.from} durationInFrames={pz.len} layout="none">
            {pz.ins.tipo === 'immagine'
              ? <Img src={staticFile(`media/${pz.ins.file}`)} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${zoom})` }} />
              : <OffthreadVideo src={staticFile(`media/${pz.ins.file}`)} startFrom={f(pz.ins.start || 0)} endAt={f(pz.ins.start || 0) + pz.len} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
          </Sequence>
        ))}
      </div>
      {/* icona app rossa sull'angolo e pillola con la parolina */}
      <div style={{ position: 'absolute', left: cx + w / 2 - 48, top: cy - h / 2 + 30, width: 92, height: 92, borderRadius: 24, background: ROSSO, transform: `rotate(${rot + 8}deg) scale(${p})`,
        boxShadow: '0 8px 18px rgba(160,0,10,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 0, height: 0, borderLeft: '26px solid white', borderTop: '16px solid transparent', borderBottom: '16px solid transparent', marginLeft: 6 }} />
      </div>
      {pillola ? (
        <div style={{ position: 'absolute', left: cx - w / 2 - 30, top: cy - h / 2 + 40, padding: '6px 26px', borderRadius: 30, background: ROSSO, color: 'white',
          fontFamily: INTER, fontStyle: 'italic', fontWeight: 300, fontSize: 44, transform: `rotate(${rot}deg) scale(${interpolate(fr, [6, 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })})` }}>
          {pillola}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

// flash "fantasma": negativo scuro e sfocato per 3 fotogrammi sul cambio di scena
const fantasma = (fr: number, cambi: number[]) => {
  const c = cambi.find((x) => fr >= x && fr < x + 3);
  return c == null ? undefined : 'invert(1) hue-rotate(180deg) brightness(0.45) contrast(1.4) blur(7px)';
};

export const Focus: React.FC<Piano> = (piano) => {
  usaFps(piano);
  const fr = useCurrentFrame();
  const sfx = volumeSfx(piano);
  const tr = tratti(piano);
  // un cambio di scena su tre (e ogni entrata o uscita da un B-roll) ha il flash fantasma
  const cambi = tr.filter((x, i) => x.cambio && (x.indice % 3 === 1 || x.broll !== tr[i - 1]?.broll)).map((x) => x.da);
  // come nel riferimento le schede foto sono brevi (max ~3 s): poi torna la parola grande dietro
  const schede = schedeInserti(piano).map((s) => ({ ...s, len: Math.min(s.len, f(3.2)) }));
  const parole = React.useMemo(() => paroleFitte(piano), [piano]);
  const nelTratto = (k: Keyword) => tr.find((x) => f(k.at) >= x.da && f(k.at) < x.da + x.len);
  // la parola che cade su una scheda foto va nella pillola della scheda, non dietro
  const inScheda = (k: Keyword) => schede.some((s) => f(k.at) >= s.from - 6 && f(k.at) < s.from + s.len);
  const TOP = 300;

  return (
    <AbsoluteFill style={{ backgroundColor: '#E9E7EA' }}>
      <AbsoluteFill style={{ filter: fantasma(fr, cambi) }}>
        <Clips piano={piano} fondo="#E9E7EA" />
      </AbsoluteFill>

      {/* retino sui cambi di scena senza flash */}
      {tr.filter((x) => x.cambio && !cambi.includes(x.da)).map((x, i) => (
        <Sequence key={`rc${i}`} from={x.da} durationInFrames={16}>
          <Retino cx={540} cy={1000} r={620} />
        </Sequence>
      ))}

      {/* scritte grandi (fuori dai B-roll): sotto il ritaglio della persona */}
      {parole.map((k, i) => (nelTratto(k)?.broll || inScheda(k) ? null : (
        <Sequence key={`k${i}`} from={f(k.at)} durationInFrames={Math.max(8, f(k.dur))}>
          <Scritta k={k} len={Math.max(8, f(k.dur))} i={i} top={TOP} />
        </Sequence>
      )))}

      {/* schede foto dietro alla persona (il ritaglio passa davanti, la faccia resta libera) */}
      {schede.map((s, i) => {
        const k = parole.find((y) => f(y.at) >= s.from - 6 && f(y.at) < s.from + s.len);
        return (
          <Sequence key={`s${i}`} from={s.from} durationInFrames={Math.max(2, s.len)}>
            <SchedaFocus s={s} i={i} pillola={k ? k.tag || k.word : undefined} />
          </Sequence>
        );
      })}

      <Ritagli piano={piano} />

      {/* telefono sopra i B-roll, con dentro la parola del momento */}
      {tr.filter((x) => x.broll).map((x, i) => {
        const k = parole.find((y) => f(y.at) >= x.da - 3 && f(y.at) < x.da + x.len);
        return (
          <Sequence key={`t${i}`} from={x.da} durationInFrames={x.len}>
            <Telefono k={k} dentro={k ? f(k.at) - x.da : 0} />
          </Sequence>
        );
      })}

      <Icone piano={piano} sfx={sfx} />
      <MusicaSotto piano={piano} />

      {/* fondo appena caldo ai bordi, come lo studio del riferimento */}
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 85% 70% at 50% 45%, transparent 60%, rgba(120,0,10,0.06) 100%)', pointerEvents: 'none' }} />

      {sfx > 0 ? (
        <>
          {parole.map((k, i) => <Sfx key={`sk${i}`} nome="ui_in" da={f(k.at)} volume={0.4 * sfx} />)}
          {cambi.map((c, i) => <Sfx key={`sg${i}`} nome="glitch" da={c} volume={0.45 * sfx} />)}
          {schede.map((s, i) => <Sfx key={`ss${i}`} nome="whoosh" da={s.from - 4} volume={0.45 * sfx} />)}
        </>
      ) : null}
    </AbsoluteFill>
  );
};

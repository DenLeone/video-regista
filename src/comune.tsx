import React from 'react';
import { AbsoluteFill, Audio, Easing, Img, interpolate, OffthreadVideo, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { Clip, durataClip, fpsDi, Piano } from './piano';

// Pezzi comuni a tutti gli stili: le clip con la voce, gli effetti sonori.

// secondi → fotogrammi agli fps del video. Ogni composizione chiama usaFps(piano) per prima cosa:
// un render fa una composizione sola, con fps fissi
let fpsVideo = fpsDi({});
export const usaFps = (piano: Pick<Piano, 'fps'>) => { fpsVideo = fpsDi(piano); };
export const f = (s: number) => Math.round(s * fpsVideo);

// micro dissolvenza (2 fotogrammi) a inizio e fine: niente "click" sui tagli
export const sfuma = (len: number, base = 1) => (fr: number) => base * Math.max(0, Math.min(1, (fr + 1) / 2, (len - fr) / 2));

// Una clip a tutto schermo. Le clip orizzontali vanno "contenute" sopra
// una copia sfocata di sé stesse, così non si perde metà inquadratura.
// `filtro`: correzione colore CSS dello stile (es. look caldo del Cinematico).
export const ClipView: React.FC<{ clip: Clip; len: number; fondo?: string; filtro?: string; muto?: boolean }> = ({ clip, len, fondo = '#0B1014', filtro, muto }) => {
  const src = staticFile(`media/${clip.file}`);
  const startFrom = f(clip.start);
  const endAt = startFrom + len;
  const scale = clip.punch ? 1.18 : 1;
  // clip in bianco e nero (stili su misura): si aggiunge al filtro dello stile
  if (clip.bn) filtro = `${filtro ?? ''} grayscale(1) contrast(1.06)`.trim();
  const mutaImmagine = Boolean(clip.audio || clip.muto || muto);
  const voce = clip.audio && !muto ? (
    <Audio src={staticFile(`media/${clip.audio.file}`)} startFrom={f(clip.audio.start)} endAt={f(clip.audio.start) + len} volume={sfuma(len)} />
  ) : null;
  const volume = sfuma(len, clip.volume ?? 1);
  if (clip.orient === 'h') {
    return (
      <AbsoluteFill style={{ backgroundColor: fondo }}>
        <OffthreadVideo src={src} startFrom={startFrom} endAt={endAt} muted
          style={{ width: '100%', height: '100%', objectFit: 'cover', filter: `blur(40px) brightness(0.55)${filtro ? ` ${filtro}` : ''}`, transform: 'scale(1.15)' }} />
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
          <OffthreadVideo src={src} startFrom={startFrom} endAt={endAt} muted={mutaImmagine} volume={volume}
            style={{ width: '100%', objectFit: 'contain', transform: `scale(${scale})`, filter: filtro }} />
        </AbsoluteFill>
        {voce}
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{ backgroundColor: fondo }}>
      <OffthreadVideo src={src} startFrom={startFrom} endAt={endAt} muted={mutaImmagine} volume={volume}
        style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${scale})`, filter: filtro }} />
      {voce}
    </AbsoluteFill>
  );
};

// tutte le clip una dopo l'altra sulla timeline
export const Clips: React.FC<{ piano: Piano; fondo?: string; filtro?: string; muto?: boolean }> = ({ piano, fondo, filtro, muto }) => {
  let cursor = 0;
  return (
    <>
      {piano.clips.map((c, i) => {
        const from = cursor;
        const len = Math.max(1, f(durataClip(c)));
        cursor += f(durataClip(c));
        return (
          <Sequence key={`c${i}`} from={from} durationInFrames={len}>
            <ClipView clip={c} len={len} fondo={fondo} filtro={filtro} muto={muto} />
          </Sequence>
        );
      })}
    </>
  );
};

// volume base degli effetti, calcolato dal montaggio in base al livello della voce
export const volumeSfx = (piano: Piano) => (piano.sfx === false ? 0 : Math.max(0, Math.min(1, piano.sfx?.volume ?? 0.25)));

// un effetto sonoro (public/sfx, generati da scripts/genera-sfx.mjs) a partire dal fotogramma `da`
export const Sfx: React.FC<{ nome: string; da: number; volume: number }> = ({ nome, da, volume }) => (
  <Sequence from={Math.max(0, da)} durationInFrames={f(2)} layout="none">
    <Audio src={staticFile(nome.includes('/') ? nome : `sfx/${nome}.wav`)} volume={volume} />
  </Sequence>
);

// ---------- musica sotto la voce (solo se Denis la chiede) ----------
// Entra in 0,6 s, esce in 1,5 s sull'ultimo fotogramma; mentre Denis parla scende a meno della metà
// (~ -8 dB) con rampe di 0,3 s, nelle pause e sui B-roll senza parlato torna su
const SOTTO_VOCE = 0.4;
export const MusicaSotto: React.FC<{ piano: Piano }> = ({ piano }) => {
  const m = piano.musica;
  if (!m) return null;
  const totale = Math.max(1, f(piano.clips.reduce((t, c) => t + durataClip(c), 0)));
  const rampa = f(0.3);
  const parlato = m.parlato.map(([a, b]) => [f(a), f(b)] as const);
  const quanto = (fr: number) => {
    // 1 = sta parlando, 0 = pausa, con la rampa ai bordi
    let v = 0;
    for (const [a, b] of parlato) {
      if (fr < a - rampa) break;
      const dentro = Math.min((fr - (a - rampa)) / rampa, ((b + rampa) - fr) / rampa, 1);
      v = Math.max(v, Math.max(0, dentro));
    }
    return v;
  };
  return (
    <Audio src={staticFile(m.file)} loop startFrom={f(m.da || 0)}
      volume={(fr) => m.volume * (1 - (1 - SOTTO_VOCE) * quanto(fr)) * Math.min(1, fr / f(0.6), Math.max(0, totale - fr) / f(1.5))} />
  );
};

// ---------- inserti: schede arrotondate sopra l'inquadratura ----------
// Mentre Denis parla di qualcosa che c'è in un file (registrazione dello schermo, screenshot, foto,
// B-roll del prodotto) la scheda entra dal basso, resta sospesa sopra l'inquadratura ed esce verso
// l'alto. Più clip di fila con lo stesso inserto = una sola scheda, senza rientrare.
export type PezzoInserto = { from: number; len: number; ins: NonNullable<Clip['inserto']> };
export type Scheda = { from: number; len: number; pezzi: PezzoInserto[] };

// `unisci` (stile reazione): clip diverse una dopo l'altra restano nella stessa scheda, cambia solo il
// contenuto (come nell'edit di Blackden); telefono e copertina restano schede a sé
export function schedeInserti(piano: Piano, unisci = false): Scheda[] {
  const schede: Scheda[] = [];
  let t = 0;
  const aSe = (i: NonNullable<Clip['inserto']>) => Boolean(i.telefono || i.copertina || i.tipo === 'immagine');
  for (const c of piano.clips) {
    const len = f(durataClip(c));
    if (c.inserto) {
      const prec = schede[schede.length - 1];
      // una clip più corta della frase (reazione) chiude la scheda quando finisce
      const lenIns = c.inserto.tipo === 'video' && c.inserto.end != null ? Math.max(2, Math.min(len, f(c.inserto.end - (c.inserto.start || 0)))) : len;
      const pezzo = { from: t, len: lenIns, ins: c.inserto };
      const ultimo = prec?.pezzi[prec.pezzi.length - 1].ins;
      // la clip "guarda" (a volume pieno, scheda grande) ha sempre la sua scheda
      if (prec && ultimo && prec.from + prec.len === t && Boolean(ultimo.pieno) === Boolean(c.inserto.pieno)
        && (c.inserto.continua || ultimo.file === c.inserto.file || (unisci && !aSe(ultimo) && !aSe(c.inserto)))) {
        prec.pezzi.push(pezzo);
        prec.len += lenIns;
      } else schede.push({ from: t, len: lenIns, pezzi: [pezzo] });
    }
    t += len;
  }
  // una scheda deve restare almeno ~1,6 s (entrata e uscita comprese): se la frase è corta
  // prosegue sopra la clip dopo, senza toccare la scheda successiva né sforare la fine
  const fine = f(piano.clips.reduce((x, c) => x + durataClip(c), 0));
  schede.forEach((s, i) => {
    const limite = Math.min(schede[i + 1]?.from ?? fine, fine);
    const ultimo = s.pezzi[s.pezzi.length - 1];
    const disponibile = ultimo.ins.tipo === 'video' ? f((ultimo.ins.end ?? 0) - (ultimo.ins.start ?? 0)) - ultimo.len : Infinity;
    const extra = Math.max(0, Math.min(48 - s.len, limite - (s.from + s.len), disponibile));
    s.len += extra;
    ultimo.len += extra;
  });
  return schede;
}

// cornice "tv" (stile Motion): televisore anni '70 giallo marca "BlackDenTV", schermo 4:3 bombato
// con righe di scansione (Denis prepara le immagini in 4:3, 22/10); all'accensione 4 fotogrammi di
// barre colorate, poi il contenuto
const BARRE = ['#C0C0C0', '#C0C000', '#00C0C0', '#00C000', '#C000C0', '#C00000', '#0000C0'];
const TvView: React.FC<{ s: Scheda; contenuto: React.ReactNode }> = ({ s, contenuto }) => {
  const fr = useCurrentFrame();
  const entra = interpolate(fr, [0, 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.back(1.3)) });
  const esce = interpolate(fr, [s.len - 9, s.len], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.in(Easing.cubic) });
  const vis = Math.min(1, fr / 5) * (1 - esce);
  const barre = fr < 10 && fr >= 4;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ backgroundColor: `rgba(0,0,0,${0.45 * vis})` }} />
      <div style={{
        position: 'absolute', left: 90, top: 250, width: 900, height: 830, borderRadius: 70, backgroundColor: '#E8B22E',
        background: 'linear-gradient(180deg, #F2C443 0%, #E3A925 60%, #C98E17 100%)',
        boxShadow: '0 50px 110px rgba(0,0,0,0.6), inset 0 -10px 0 rgba(0,0,0,0.12), inset 0 6px 0 rgba(255,255,255,0.25)',
        opacity: vis, transform: `translateY(${(1 - entra) * 220 - esce * 80}px) scale(${0.8 + 0.2 * entra - 0.06 * esce})`,
      }}>
        <div style={{ position: 'absolute', left: 50, top: 50, width: 800, height: 600, borderRadius: 56, overflow: 'hidden', backgroundColor: '#0A0A0A',
          boxShadow: 'inset 0 0 0 10px #2A2112, 0 0 0 4px rgba(0,0,0,0.25)' }}>
          {fr < 4 ? null : barre
            ? <div style={{ display: 'flex', width: '100%', height: '100%' }}>{BARRE.map((c) => <div key={c} style={{ flex: 1, backgroundColor: c }} />)}</div>
            : contenuto}
          <AbsoluteFill style={{ background: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.16) 0px, rgba(0,0,0,0.16) 2px, rgba(0,0,0,0) 2px, rgba(0,0,0,0) 5px)' }} />
          <AbsoluteFill style={{ background: 'radial-gradient(ellipse 75% 70% at 50% 45%, rgba(255,255,255,0.08) 0%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%)', borderRadius: 56 }} />
        </div>
        {/* targhetta del marchio, griglia dell'altoparlante e manopole */}
        <div style={{ position: 'absolute', left: 58, bottom: 52, padding: '10px 22px 12px', borderRadius: 14,
          background: 'linear-gradient(180deg, #2B2B2B 0%, #0E0E0E 100%)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), 0 3px 6px rgba(0,0,0,0.35)',
          fontFamily: '"Montserrat", sans-serif', fontWeight: 900, fontStyle: 'italic', fontSize: 46, letterSpacing: '0.01em', lineHeight: 1, whiteSpace: 'nowrap' }}>
          <span style={{ color: '#F4F4F4' }}>Black</span><span style={{ color: '#F2C443' }}>Den</span>
          <span style={{ color: '#F4F4F4', fontSize: 30, marginLeft: 6, padding: '2px 8px', borderRadius: 6, border: '3px solid #F4F4F4', position: 'relative', top: -4 }}>TV</span>
        </div>
        {[0, 1, 2, 3, 4].map((k) => <div key={`g${k}`} style={{ position: 'absolute', left: 430, bottom: 56 + k * 13, width: 200, height: 6, borderRadius: 3, backgroundColor: 'rgba(60,40,10,0.45)' }} />)}
        {[0, 1].map((k) => <div key={k} style={{ position: 'absolute', right: 62 + k * 92, bottom: 48, width: 70, height: 70, borderRadius: 35,
          background: 'radial-gradient(circle at 35% 30%, #6B5A3A, #2A2112)', boxShadow: '0 4px 8px rgba(0,0,0,0.4)' }} />)}
      </div>
    </AbsoluteFill>
  );
};

const SchedaView: React.FC<{ s: Scheda; cornice?: 'scheda' | 'tv' | 'reazione' }> = ({ s, cornice }) => {
  const fr = useCurrentFrame();
  const entra = interpolate(fr, [0, 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.back(1.4)) });
  const esce = interpolate(fr, [s.len - 9, s.len], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.in(Easing.cubic) });
  const vis = Math.min(1, fr / 6) * (1 - esce);
  const primo = s.pezzi[0].ins;
  const orizz = primo.orient === 'h';
  const w = orizz ? 960 : 640, h = orizz ? 540 : 1138;
  const zoom = 1 + 0.05 * (fr / Math.max(1, s.len)); // le immagini si muovono piano
  const contenuto = s.pezzi.map((p, i) => (
    <Sequence key={i} from={p.from - s.from} durationInFrames={p.len} layout="none">
      {p.ins.tipo === 'immagine'
        ? <Img src={staticFile(`media/${p.ins.file}`)} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${zoom})` }} />
        : <OffthreadVideo src={staticFile(`media/${p.ins.file}`)} startFrom={f(p.ins.start || 0)} endAt={f(p.ins.start || 0) + p.len} muted
          style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
    </Sequence>
  ));
  if (cornice === 'tv') return <TvView s={s} contenuto={contenuto} />;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ backgroundColor: `rgba(0,0,0,${0.3 * vis})` }} />
      <div style={{
        position: 'absolute', left: (1080 - w) / 2, top: 900 - h / 2, width: w, height: h, borderRadius: orizz ? 30 : 46, overflow: 'hidden',
        border: '3px solid rgba(255,255,255,0.18)', boxShadow: '0 40px 90px rgba(0,0,0,0.55), 0 8px 24px rgba(0,0,0,0.35)', backgroundColor: '#111',
        opacity: vis, transform: `translateY(${(1 - entra) * 160 - esce * 90}px) scale(${0.86 + 0.14 * entra - 0.08 * esce}) rotate(${(1 - entra) * -3}deg)`,
      }}>
        {contenuto}
      </div>
    </AbsoluteFill>
  );
};

export const Inserti: React.FC<{ piano: Piano; sfx?: number; cornice?: 'scheda' | 'tv' | 'reazione' }> = ({ piano, sfx = 0, cornice }) => (
  <>
    {schedeInserti(piano).map((s, i) => (
      <Sequence key={`in${i}`} from={s.from} durationInFrames={Math.max(2, s.len)}>
        <SchedaView s={s} cornice={cornice} />
      </Sequence>
    ))}
    {sfx > 0 ? schedeInserti(piano).flatMap((s, i) => [
      <Sfx key={`si${i}`} nome="whoosh" da={s.from - 7} volume={0.5 * sfx} />,
      <Sfx key={`so${i}`} nome="whoosh" da={s.from + s.len - 12} volume={0.28 * sfx} />,
    ]) : null}
  </>
);

// ---------- ritagli: la persona sopra le scritte grandi ----------
// video con trasparenza (scripts/ritaglio.py) della sola persona, allineato alla clip: messo dopo
// le scritte, le fa passare dietro a Denis. Solo clip verticali (riempiono il fotogramma).
export const Ritagli: React.FC<{ piano: Piano; filtro?: string }> = ({ piano, filtro }) => {
  let t = 0;
  return (
    <>
      {piano.clips.map((c, i) => {
        const da = t;
        t += f(durataClip(c));
        if (!c.ritaglio || c.orient === 'h') return null;
        const fl = c.bn ? `${filtro ?? ''} grayscale(1) contrast(1.06)`.trim() : filtro;
        return (
          <Sequence key={`r${i}`} from={da + f(c.ritaglio.da)} durationInFrames={Math.max(1, f(c.ritaglio.dur))}>
            <AbsoluteFill>
              <OffthreadVideo src={staticFile(`media/${c.ritaglio.file}`)} transparent muted
                style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${c.punch ? 1.18 : 1})`, filter: fl }} />
            </AbsoluteFill>
          </Sequence>
        );
      })}
    </>
  );
};

// ---------- icone ----------
// loghi di app e marche (CapCut, 27/10: "vanno usate con un glow e un effetto in entrata quando la
// nomino"): l'icona entra a scatto (scala con rimbalzo, sfocatura che si scioglie, mezzo giro),
// un anello di luce si allarga, poi resta ferma con un bagliore che pulsa piano ed esce sfumando.
// Nel terzo alto, sopra la testa, dentro la zona sicura di TikTok
const IconaView: React.FC<{ file: string; len: number }> = ({ file, len }) => {
  const fr = useCurrentFrame();
  const entra = interpolate(fr, [0, 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.back(1.8)) });
  const v = interpolate(fr, [0, 7], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const esce = interpolate(fr, [len - 6, len], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const anello = interpolate(fr, [2, 18], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const pulsa = 0.6 + 0.2 * Math.sin(fr / 6);
  // sopra la testa: nei talking head gli occhi stanno a ~35–40% dell'altezza (670–770 px)
  const lato = 260;
  const cy = 440;
  const scala = (0.3 + 0.7 * entra) * (1 - 0.15 * esce);
  return (
    <AbsoluteFill style={{ opacity: v * (1 - esce) }}>
      {/* alone dietro l'icona */}
      <div style={{ position: 'absolute', left: 540 - lato, top: cy - lato, width: lato * 2, height: lato * 2, borderRadius: '50%',
        background: `radial-gradient(circle, rgba(255,255,255,${(0.8 * pulsa).toFixed(3)}) 0%, rgba(255,255,255,0.22) 40%, rgba(255,255,255,0) 68%)`,
        transform: `scale(${scala})` }} />
      {/* anello di luce all'entrata */}
      <div style={{ position: 'absolute', left: 540 - lato / 2, top: cy - lato / 2, width: lato, height: lato, borderRadius: '50%',
        border: '6px solid rgba(255,255,255,0.9)', boxShadow: '0 0 30px rgba(255,255,255,0.8)',
        opacity: (1 - anello) * 0.9, transform: `scale(${0.8 + anello * 1.1})` }} />
      <Img src={staticFile(`media/${file}`)} style={{ position: 'absolute', left: 540 - lato / 2, top: cy - lato / 2 + Math.sin(fr / 14) * 6, width: lato, height: lato,
        objectFit: 'contain', borderRadius: '22%',
        filter: `blur(${((1 - entra) * 14 + esce * 8).toFixed(2)}px) drop-shadow(0 0 ${Math.round(30 + 24 * pulsa)}px rgba(255,255,255,${(0.95 * pulsa).toFixed(3)})) drop-shadow(0 10px 24px rgba(0,0,0,0.45))`,
        transform: `scale(${scala}) rotate(${(-12 * (1 - entra)).toFixed(2)}deg)` }} />
    </AbsoluteFill>
  );
};

export const Icone: React.FC<{ piano: Piano; sfx?: number }> = ({ piano, sfx = 0 }) => (
  <>
    {(piano.icone || []).map((ic, i) => {
      const len = Math.max(8, f(ic.dur));
      return (
        <Sequence key={`ic${i}`} from={f(ic.at)} durationInFrames={len}>
          <IconaView file={ic.file} len={len} />
          {sfx > 0 ? <Sfx nome="ui_in" da={0} volume={0.5 * sfx} /> : null}
        </Sequence>
      );
    })}
  </>
);

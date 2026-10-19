import React from 'react';
import { AbsoluteFill, Audio, Easing, Img, interpolate, OffthreadVideo, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { Clip, durataClip, FPS, Piano } from './piano';

// Pezzi comuni a tutti gli stili: le clip con la voce, gli effetti sonori.

export const f = (s: number) => Math.round(s * FPS);

// micro dissolvenza (2 fotogrammi) a inizio e fine: niente "click" sui tagli
export const sfuma = (len: number, base = 1) => (fr: number) => base * Math.max(0, Math.min(1, (fr + 1) / 2, (len - fr) / 2));

// Una clip a tutto schermo. Le clip orizzontali vanno "contenute" sopra
// una copia sfocata di sé stesse, così non si perde metà inquadratura.
// `filtro`: correzione colore CSS dello stile (es. look caldo del Cinematico).
export const ClipView: React.FC<{ clip: Clip; len: number; fondo?: string; filtro?: string }> = ({ clip, len, fondo = '#0B1014', filtro }) => {
  const src = staticFile(`media/${clip.file}`);
  const startFrom = f(clip.start);
  const endAt = startFrom + len;
  const scale = clip.punch ? 1.18 : 1;
  // clip in bianco e nero (stili su misura): si aggiunge al filtro dello stile
  if (clip.bn) filtro = `${filtro ?? ''} grayscale(1) contrast(1.06)`.trim();
  const mutaImmagine = Boolean(clip.audio || clip.muto);
  const voce = clip.audio ? (
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
export const Clips: React.FC<{ piano: Piano; fondo?: string; filtro?: string }> = ({ piano, fondo, filtro }) => {
  let cursor = 0;
  return (
    <>
      {piano.clips.map((c, i) => {
        const from = cursor;
        const len = Math.max(1, f(durataClip(c)));
        cursor += f(durataClip(c));
        return (
          <Sequence key={`c${i}`} from={from} durationInFrames={len}>
            <ClipView clip={c} len={len} fondo={fondo} filtro={filtro} />
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
  <Sequence from={Math.max(0, da)} durationInFrames={FPS * 2} layout="none">
    <Audio src={staticFile(`sfx/${nome}.wav`)} volume={volume} />
  </Sequence>
);

// ---------- inserti: schede arrotondate sopra l'inquadratura ----------
// Mentre Denis parla di qualcosa che c'è in un file (registrazione dello schermo, screenshot, foto,
// B-roll del prodotto) la scheda entra dal basso, resta sospesa sopra l'inquadratura ed esce verso
// l'alto. Più clip di fila con lo stesso inserto = una sola scheda, senza rientrare.
type PezzoInserto = { from: number; len: number; ins: NonNullable<Clip['inserto']> };
type Scheda = { from: number; len: number; pezzi: PezzoInserto[] };

function schedeInserti(piano: Piano): Scheda[] {
  const schede: Scheda[] = [];
  let t = 0;
  for (const c of piano.clips) {
    const len = f(durataClip(c));
    if (c.inserto) {
      const prec = schede[schede.length - 1];
      const pezzo = { from: t, len, ins: c.inserto };
      if (prec && prec.from + prec.len === t && (c.inserto.continua || prec.pezzi[prec.pezzi.length - 1].ins.file === c.inserto.file)) {
        prec.pezzi.push(pezzo);
        prec.len += len;
      } else schede.push({ from: t, len, pezzi: [pezzo] });
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

const SchedaView: React.FC<{ s: Scheda }> = ({ s }) => {
  const fr = useCurrentFrame();
  const entra = interpolate(fr, [0, 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.back(1.4)) });
  const esce = interpolate(fr, [s.len - 9, s.len], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.in(Easing.cubic) });
  const vis = Math.min(1, fr / 6) * (1 - esce);
  const primo = s.pezzi[0].ins;
  const orizz = primo.orient === 'h';
  const w = orizz ? 960 : 640, h = orizz ? 540 : 1138;
  const zoom = 1 + 0.05 * (fr / Math.max(1, s.len)); // le immagini si muovono piano
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ backgroundColor: `rgba(0,0,0,${0.3 * vis})` }} />
      <div style={{
        position: 'absolute', left: (1080 - w) / 2, top: 900 - h / 2, width: w, height: h, borderRadius: orizz ? 30 : 46, overflow: 'hidden',
        border: '3px solid rgba(255,255,255,0.18)', boxShadow: '0 40px 90px rgba(0,0,0,0.55), 0 8px 24px rgba(0,0,0,0.35)', backgroundColor: '#111',
        opacity: vis, transform: `translateY(${(1 - entra) * 160 - esce * 90}px) scale(${0.86 + 0.14 * entra - 0.08 * esce}) rotate(${(1 - entra) * -3}deg)`,
      }}>
        {s.pezzi.map((p, i) => (
          <Sequence key={i} from={p.from - s.from} durationInFrames={p.len} layout="none">
            {p.ins.tipo === 'immagine'
              ? <Img src={staticFile(`media/${p.ins.file}`)} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${zoom})` }} />
              : <OffthreadVideo src={staticFile(`media/${p.ins.file}`)} startFrom={f(p.ins.start || 0)} endAt={f(p.ins.start || 0) + p.len} muted
                style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
          </Sequence>
        ))}
      </div>
    </AbsoluteFill>
  );
};

export const Inserti: React.FC<{ piano: Piano; sfx?: number }> = ({ piano, sfx = 0 }) => (
  <>
    {schedeInserti(piano).map((s, i) => (
      <Sequence key={`in${i}`} from={s.from} durationInFrames={Math.max(2, s.len)}>
        <SchedaView s={s} />
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

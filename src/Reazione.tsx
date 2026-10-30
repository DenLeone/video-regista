import React from 'react';
import { AbsoluteFill, Easing, Img, interpolate, OffthreadVideo, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { f, Scheda, schedeInserti, Sfx } from './comune';
import { GraficaStile, Piano } from './piano';
import { clamp, stileFont } from './testo';

// Stile reazione (l'edit "Blackden" di Denis, studiato il 29/10): Denis alla scrivania risponde a un
// altro creator.
// - Le clip dell'altro stanno in una scheda verticale arrotondata, in alto, inclinata in prospettiva
//   come un telefono girato, a sinistra o a destra, DIETRO a Denis (la sua testa passa davanti: la
//   persona ritagliata va sopra, vedi SuMisura). Clip diverse di fila: la scheda resta, cambia il contenuto.
// - Le clip "audio …" si sentono sotto la voce di Denis; le "guarda …" nel suo silenzio, a volume pieno e
//   in una scheda più grande e meno inclinata (Denis la guarda insieme a chi vede il video).
// - Copertina del post all'apertura, dritta e centrata; screenshot dentro un telefono.
// - Schede informative di vetro scuro (titolo colorato, sezioni, "in sintesi") scritte dall'AI.
// - I suoni sono quelli di Denis (asset/suoni dello stile), estratti dal suo edit.

const VOLUME_CLIP = 0.32; // la voce dell'altro, sempre sotto quella di Denis
const VOLUME_GUARDA = 1; // "guarda …": Denis tace

// effetto sonoro dello stile per nome ("entrata scheda"), altrimenti quello di riserva del repo
export const suono = (g: GraficaStile, nome: string, riserva: string) => g.suoni?.[nome] || riserva;

const Contenuto: React.FC<{ s: Scheda }> = ({ s }) => (
  <>
    {s.pezzi.map((p, i) => (
      <Sequence key={i} from={p.from - s.from} durationInFrames={p.len} layout="none">
        <AbsoluteFill style={{ overflow: 'hidden' }}>
          {p.ins.tipo === 'immagine'
            ? <Img src={staticFile(`media/${p.ins.file}`)} style={{ width: '100%', height: '100%', objectFit: p.ins.copertina ? 'contain' : 'cover', objectPosition: 'top' }} />
            : <OffthreadVideo src={staticFile(`media/${p.ins.file}`)} startFrom={f(p.ins.start || 0)} endAt={f(p.ins.start || 0) + p.len + 1}
              muted={!p.ins.audio} volume={p.ins.audio ? (p.ins.pieno ? VOLUME_GUARDA : VOLUME_CLIP) : 0}
              style={{ width: '100%', height: '100%', objectFit: 'cover', transform: p.ins.zoom ? 'scale(2.3)' : undefined, transformOrigin: '50% 32%' }} />}
        </AbsoluteFill>
      </Sequence>
    ))}
  </>
);

// la scheda in prospettiva: entra dal suo lato ruotando, resta inclinata, esce ruotando via
const SchedaInclinata: React.FC<{ s: Scheda; sinistra: boolean }> = ({ s, sinistra }) => {
  const fr = useCurrentFrame();
  const entra = interpolate(fr, [0, 10], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const esce = interpolate(fr, [s.len - 8, s.len], [0, 1], { ...clamp, easing: Easing.in(Easing.cubic) });
  const orizz = s.pezzi[0].ins.orient === 'h';
  const pieno = Boolean(s.pezzi[0].ins.pieno);
  const w = orizz ? (pieno ? 800 : 620) : pieno ? 540 : 440, h = orizz ? (pieno ? 450 : 350) : pieno ? 960 : 782;
  const left = sinistra ? (pieno ? 50 : 70) : 1080 - (pieno ? 50 : 70) - w;
  const verso = sinistra ? 1 : -1;
  const giro = (pieno ? 10 : 20) + 50 * (1 - entra) + 40 * esce;
  return (
    <AbsoluteFill style={{ perspective: 1500 }}>
      <div style={{
        position: 'absolute', left, top: orizz ? (pieno ? 260 : 300) : pieno ? 110 : 150, width: w, height: h, borderRadius: 36, overflow: 'hidden', backgroundColor: '#0D0D0F',
        border: '2px solid rgba(255,255,255,0.28)', boxShadow: '0 30px 70px rgba(0,0,0,0.45)',
        opacity: Math.min(entra * 1.5, 1 - esce),
        transform: `translateX(${verso * -(1 - entra) * 160}px) rotateY(${verso * giro}deg)`, transformOrigin: sinistra ? 'left center' : 'right center',
      }}>
        <Contenuto s={s} />
        {/* riflesso del vetro */}
        <AbsoluteFill style={{ background: 'linear-gradient(120deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0) 35%)' }} />
      </div>
    </AbsoluteFill>
  );
};

// copertina del post: dritta, centrata in alto, entra scendendo
const Copertina: React.FC<{ s: Scheda }> = ({ s }) => {
  const fr = useCurrentFrame();
  const entra = interpolate(fr, [0, 9], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.4)) });
  const esce = interpolate(fr, [s.len - 7, s.len], [0, 1], clamp);
  return (
    <div style={{ position: 'absolute', left: 230, top: 130, width: 620, height: 640, opacity: 1 - esce,
      transform: `translateY(${(1 - entra) * -80}px) scale(${0.9 + 0.1 * entra})`, filter: 'drop-shadow(0 24px 50px rgba(0,0,0,0.45))' }}>
      <Contenuto s={s} />
    </div>
  );
};

// telefono con lo screenshot, di lato
const Telefono: React.FC<{ s: Scheda; sinistra: boolean }> = ({ s, sinistra }) => {
  const fr = useCurrentFrame();
  const entra = interpolate(fr, [0, 10], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.2)) });
  const esce = interpolate(fr, [s.len - 8, s.len], [0, 1], { ...clamp, easing: Easing.in(Easing.cubic) });
  const w = 360, h = 740;
  return (
    <div style={{
      position: 'absolute', left: sinistra ? 90 : 1080 - 90 - w, top: 170, width: w, height: h, borderRadius: 62, padding: 13,
      background: 'linear-gradient(145deg, #F4F4F6, #CFCFD4)', boxShadow: '0 40px 80px rgba(0,0,0,0.5), inset 0 0 0 2px rgba(0,0,0,0.15)',
      opacity: 1 - esce, transform: `translateY(${(1 - entra) * 260 + esce * -120}px) rotate(${(sinistra ? -1 : 1) * (4 - 4 * entra + 3)}deg)`,
    }}>
      <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 50, overflow: 'hidden', backgroundColor: '#FFF' }}>
        <Contenuto s={s} />
        <div style={{ position: 'absolute', top: 12, left: '50%', width: 110, height: 32, marginLeft: -55, borderRadius: 16, backgroundColor: '#000' }} />
      </div>
    </div>
  );
};

export const InsertiReazione: React.FC<{ piano: Piano; g: GraficaStile; sfx: number }> = ({ piano, g, sfx }) => {
  const schede = schedeInserti(piano, true);
  let lato = 1;
  return (
    <>
      {schede.map((s, i) => {
        const ins = s.pezzi[0].ins;
        const tel = Boolean(ins.telefono);
        const cop = Boolean(ins.copertina);
        if (!tel && !cop) lato = 1 - lato; // le clip si alternano: destra, sinistra, destra…
        const sinistra = lato === 1;
        const len = Math.max(2, s.len);
        return (
          <Sequence key={`re${i}`} from={s.from} durationInFrames={len}>
            {cop ? <Copertina s={{ ...s, len }} /> : tel ? <Telefono s={{ ...s, len }} sinistra={!sinistra} /> : <SchedaInclinata s={{ ...s, len }} sinistra={sinistra} />}
          </Sequence>
        );
      })}
      {sfx > 0 ? schede.flatMap((s, i) => {
        const ins = s.pezzi[0].ins;
        const v = Math.min(0.7, sfx * 2.2);
        const entrata = ins.telefono ? suono(g, 'entrata telefono', 'whoosh') : suono(g, 'entrata scheda', 'whoosh');
        return [
          <Sfx key={`rs${i}`} nome={entrata} da={s.from - 2} volume={v} />,
          ...s.pezzi.slice(1).map((p, k) => (
            <Sfx key={`rc${i}-${k}`} nome={k % 2 ? suono(g, 'cambio scheda 2', suono(g, 'cambio scheda', 'whoosh')) : suono(g, 'cambio scheda', 'whoosh')}
              da={p.from - 2} volume={v} />
          )),
        ];
      }) : null}
    </>
  );
};

// ---------- schede informative di vetro ----------
const SchedaInfo: React.FC<{ k: NonNullable<Piano['schede']>[number]; len: number; g: GraficaStile }> = ({ k, len, g }) => {
  const fr = useCurrentFrame();
  const entra = interpolate(fr, [0, 10], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const esce = interpolate(fr, [len - 8, len], [0, 1], { ...clamp, easing: Easing.in(Easing.cubic) });
  const voce = (n: number) => interpolate(fr, [6 + n * 4, 14 + n * 4], [0, 1], clamp);
  const testo = stileFont(g.fontSottotitoli);
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', paddingBottom: 340 }}>
      <div style={{
        width: 920, maxHeight: 1240, borderRadius: 36, padding: '38px 42px', boxSizing: 'border-box', overflow: 'hidden',
        backgroundColor: 'rgba(16,16,22,0.74)', backdropFilter: 'blur(22px)', WebkitBackdropFilter: 'blur(22px)',
        border: '1.5px solid rgba(255,255,255,0.14)', boxShadow: '0 40px 90px rgba(0,0,0,0.5)',
        opacity: entra * (1 - esce), transform: `translateY(${(1 - entra) * 50 - esce * 30}px) scale(${0.94 + 0.06 * entra})`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, paddingBottom: 22, borderBottom: '1.5px solid rgba(255,255,255,0.1)' }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: k.colore, display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 0 22px ${k.colore}88`, color: '#111', fontWeight: 900, fontSize: 28, fontFamily: '"Montserrat", sans-serif' }}>!</div>
          <div style={{ ...stileFont(g.fontTitoli), fontSize: 40, color: k.colore, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{k.titolo}</div>
        </div>
        {k.sezioni.map((x, i) => (
          <div key={i} style={{ marginTop: 24, paddingLeft: 22, borderLeft: `4px solid ${k.colore}`, opacity: voce(i), transform: `translateY(${(1 - voce(i)) * 14}px)` }}>
            {x.titolo ? <div style={{ ...testo, fontWeight: 700, fontSize: 38, color: '#FFFFFF', lineHeight: 1.2 }}>{x.titolo}</div> : null}
            {x.testo ? <div style={{ ...testo, fontWeight: 400, fontSize: 32, color: 'rgba(255,255,255,0.8)', lineHeight: 1.35, marginTop: 6 }}>{x.testo}</div> : null}
          </div>
        ))}
        {k.sintesi ? (
          <div style={{ marginTop: 28, padding: '18px 22px', borderRadius: 18, backgroundColor: 'rgba(61,220,132,0.12)', border: '1.5px solid rgba(61,220,132,0.35)',
            opacity: voce(k.sezioni.length), transform: `translateY(${(1 - voce(k.sezioni.length)) * 14}px)` }}>
            <div style={{ ...stileFont(g.fontTitoli), fontSize: 28, color: '#3DDC84', letterSpacing: '0.06em' }}>IN SINTESI</div>
            <div style={{ ...testo, fontWeight: 500, fontSize: 32, color: '#FFFFFF', lineHeight: 1.35, marginTop: 6 }}>{k.sintesi}</div>
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

export const SchedeInfo: React.FC<{ piano: Piano; g: GraficaStile; sfx: number }> = ({ piano, g, sfx }) => (
  <>
    {(piano.schede || []).map((k, i) => {
      const len = Math.max(20, f(k.dur));
      return (
        <Sequence key={`si${i}`} from={f(k.at)} durationInFrames={len}>
          <SchedaInfo k={k} len={len} g={g} />
          {sfx > 0 ? <>
            <Sfx nome={suono(g, 'click scheda', 'ui_in')} da={0} volume={Math.min(0.7, sfx * 2.2)} />
            <Sfx nome={suono(g, 'uscita scheda info', 'whoosh')} da={len - 8} volume={Math.min(0.6, sfx * 2)} />
          </> : null}
        </Sequence>
      );
    })}
  </>
);

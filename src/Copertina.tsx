import React from 'react';
import { AbsoluteFill, Img, staticFile } from 'remotion';
import { FontStile, GraficaStile } from './piano';
import { useFont } from './SuMisura';
import { norm, stileFont } from './testo';

// Copertina per Reel e TikTok (render "still", scripts/regista.mjs copertina): un fotogramma pulito
// del video (senza scritte) con il titolo scelto dall'AI, nei font e colori dello stile.
// Il titolo sta nella fascia che resta visibile ovunque: dentro il ritaglio 3:4 della griglia del
// profilo Instagram (y 240–1680) e sopra la didascalia di TikTok e Reels (ultimi ~400 px).
export type PropsCopertina = { sfondo: string; testo: string; evidenzia?: string[]; grafica?: GraficaStile | null };

const FONT_BASE: FontStile = { famiglia: 'Montserrat', peso: 900 };

// a capo su parole intere, righe di ~12 caratteri (al massimo 4: oltre, il titolo si rimpicciolisce)
function righe(testo: string): string[] {
  const parole = testo.toUpperCase().split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (const p of parole) {
    const u = out[out.length - 1];
    if (u && (u + ' ' + p).length <= 12) out[out.length - 1] = `${u} ${p}`;
    else out.push(p);
  }
  return out.length <= 4 ? out : [out.slice(0, -3).join(' '), ...out.slice(-3)];
}

export const Copertina: React.FC<PropsCopertina> = ({ sfondo, testo, evidenzia = [], grafica }) => {
  const font = grafica?.fontApertura || FONT_BASE;
  useFont([font]);
  const colore = grafica?.coloreSottotitoli && grafica.sottotitoli === 'blocchi' ? grafica.coloreSottotitoli : '#FFFFFF';
  const accento = grafica?.coloreApertura || '#FFD86B';
  const forti = new Set(evidenzia.flatMap((e) => e.split(/\s+/)).map(norm));
  const rr = righe(testo);
  const lunga = Math.max(...rr.map((r) => r.length), 1);
  // un carattere maiuscolo pieno è largo ~0,75 em: la riga più lunga sta nei 960 px utili
  const fs = Math.min(180, 960 / (lunga * 0.75));
  return (
    <AbsoluteFill style={{ backgroundColor: '#0B0B0B' }}>
      <Img src={staticFile(sfondo)} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scale(1.04)' }} />
      {/* scuro in basso e ai bordi: il titolo si legge su qualsiasi sfondo */}
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.72) 78%, rgba(0,0,0,0.82) 100%)' }} />
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 95% 75% at 50% 45%, rgba(0,0,0,0) 60%, rgba(0,0,0,0.35) 100%)' }} />
      <div style={{ position: 'absolute', left: 60, right: 60, bottom: 1920 - 1440, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        {rr.map((r, i) => (
          <div key={i} style={{ ...stileFont(font), fontSize: fs, lineHeight: 0.98, letterSpacing: '-0.01em', whiteSpace: 'nowrap',
            filter: 'drop-shadow(0 6px 18px rgba(0,0,0,0.6)) drop-shadow(0 2px 3px rgba(0,0,0,0.7))' }}>
            {r.split(' ').map((p, j) => (
              <span key={j} style={{ color: forti.has(norm(p)) ? accento : colore }}>{p}{j < r.split(' ').length - 1 ? ' ' : ''}</span>
            ))}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

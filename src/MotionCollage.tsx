import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { Clips, f, Inserti, Sfx, usaFps, volumeSfx, Icone, MusicaSotto } from './comune';
import { durataTotale, Piano } from './piano';

// Stile motion-collage: mix di clip reali (5-10%) + motion graphics collage (90-95%)
// Sfondo carta/giornale, elementi strappati, box gialli, frecce, testi kinetici
// Sincronizzato ai tempi della voce (Whisper).

export const MotionCollage: React.FC<Piano> = (piano) => {
  usaFps(piano);
  const totale = f(durataTotale(piano));
  const sfx = volumeSfx(piano);

  return (
    <AbsoluteFill style={{ backgroundColor: '#F5F0E6' }}>
      {/* Sfondo texture carta - da sostituire con asset da Drive */}
      <AbsoluteFill style={{ background: 'repeating-linear-gradient(45deg, #f0e6d2, #f0e6d2 10px, #e8dcc0 10px, #e8dcc0 20px)' }} />

      <Clips piano={piano} />

      {/* Placeholder per elementi collage */}
      <Sequence from={0} durationInFrames={Math.max(1, totale)}>
        <div style={{ position: 'absolute', top: 200, left: 50, color: '#222', fontSize: 48, fontWeight: 700 }}>
          MOTION-COLLAGE
        </div>
      </Sequence>

      <Inserti piano={piano} sfx={sfx} />
      <Icone piano={piano} sfx={sfx} />
      <MusicaSotto piano={piano} />
    </AbsoluteFill>
  );
};

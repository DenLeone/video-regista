// Stile "Presentazione": fondo Tiffany con griglia da carta tecnica, testo blu-nero enorme che si accumula
// parola per parola, accenti corallo, infografiche che cambiano col tema di cui si parla.
// Ispirato a un reel di riferimento (fondo giallo, grottesco nero) ma con colori e font propri.
import { loadFont as caricaUnbounded } from '@remotion/google-fonts/Unbounded';
import { loadFont as caricaBricolage } from '@remotion/google-fonts/BricolageGrotesque';
import { loadFont as caricaSyne } from '@remotion/google-fonts/Syne';
import { loadFont as caricaMono } from '@remotion/google-fonts/JetBrainsMono';

export const COLORI = {
  fondo: '#81D8D0',      // Tiffany
  griglia: '#0B1F24',    // linee della griglia (usate con poca opacità)
  testo: '#0B1F24',      // blu-nero
  accento: '#FF5A3C',    // corallo: pallini, tasti, cursori
  linea: '#FFFFFF',      // linea che "scrive" la riga prima delle parole
  scheda: '#0B1F24',     // card scure (prompt, contatori)
  schedaTesto: '#81D8D0',
};

export const FONT = {
  unbounded: caricaUnbounded('normal', { weights: ['500', '700', '800'], subsets: ['latin', 'latin-ext'] }).fontFamily,
  bricolage: caricaBricolage('normal', { weights: ['500', '700', '800'], subsets: ['latin', 'latin-ext'] }).fontFamily,
  syne: caricaSyne('normal', { weights: ['500', '700', '800'], subsets: ['latin', 'latin-ext'] }).fontFamily,
  mono: caricaMono('normal', { weights: ['500', '700'], subsets: ['latin', 'latin-ext'] }).fontFamily,
};

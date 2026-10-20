import { FontStile } from './piano';

// Pezzi di testo comuni agli stili su misura (SuMisura.tsx) e al Motion (Motion.tsx).
export const OMBRA = '0 3px 14px rgba(0,0,0,0.55), 0 1px 3px rgba(0,0,0,0.7)';
export const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
export const famiglia = (ft: FontStile) => `"${ft.famiglia}", "Montserrat", sans-serif`;
export const stileFont = (ft: FontStile) => ({ fontFamily: famiglia(ft), fontWeight: ft.peso, fontStyle: ft.corsivo ? 'italic' : 'normal' });
export const pulisci = (w: string) => w.replace(/^[«"“(]+|[»"”).,;:…]+$/g, '');
export const norm = (w: string) => pulisci(w).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// parole di raccordo italiane: restano piccole se l'AI non ha indicato le parole da ingrandire
export const RACCORDO = new Set(('il lo la i gli le l un uno una un\' di a da in con su per tra fra e ed o ma che chi cui non mi ti si ci vi ne ' +
  'del dello della dei degli delle al allo alla ai agli alle dal dallo dalla dai dagli dalle nel nello nella nei negli nelle sul sullo ' +
  'sulla sui sugli sulle col coi come quando se perche anche gia piu molto tanto poi cosi io tu lui lei noi voi loro me te sé mio mia ' +
  'tuo tua suo sua nostro vostro questo questa questi queste quello quella quelli quelle ho hai ha abbiamo avete hanno sono sei e ' +
  'siamo siete era ero erano essere avere fare fatto sto stai sta stiamo state stanno ce c sempre ancora proprio solo tutto tutti ' +
  'tutte qui qua li la cosa cose dire detto parla parlare vado va andare oggi adesso ora allora quindi pero dove').split(/\s+/));

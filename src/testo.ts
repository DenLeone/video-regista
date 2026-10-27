import { FontStile } from './piano';

// Pezzi di testo comuni agli stili su misura (SuMisura.tsx) e al Motion (Motion.tsx).
export const OMBRA = '0 3px 14px rgba(0,0,0,0.55), 0 1px 3px rgba(0,0,0,0.7)';
export const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
export const famiglia = (ft: FontStile) => `"${ft.famiglia}", "Montserrat", sans-serif`;
export const stileFont = (ft: FontStile) => ({ fontFamily: famiglia(ft), fontWeight: ft.peso, fontStyle: ft.corsivo ? 'italic' : 'normal' });
// larghezza vera di una riga nel font scelto (canvas del browser che fa il render); null fuori dal browser
let tela: CanvasRenderingContext2D | null | undefined;
export function larghezzaTesto(testo: string, ft: FontStile, fs: number): number | null {
  if (tela === undefined) tela = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  if (!tela) return null;
  tela.font = `${ft.corsivo ? 'italic ' : ''}${ft.peso} ${fs}px ${famiglia(ft)}`;
  return tela.measureText(testo).width;
}
// Zone sicure di TikTok/Reels su 1080×1920 (modello ufficiale TikTok per i video in feed): niente scritte
// nei 120 px ai lati né nei 240 in alto; in basso descrizione, nome e pulsanti coprono ~560 px nei
// post normali (660 con il bottone delle inserzioni). Denis 27/10: in Motion le parole uscivano dai bordi
export const SICURA = { lato: 120, alto: 240, basso: 1920 - 560, larghezza: 1080 - 2 * 120 };
// dimensione che fa stare la riga nella larghezza sicura, misurata nel font vero (riserva = margine
// in più, es. per le lettere a caso dello scramble, che possono essere più larghe di quelle finali)
export function dentro(testo: string, ft: FontStile, fs: number, max = SICURA.larghezza, riserva = 1): number {
  const l = larghezzaTesto(testo, ft, fs);
  if (l === null || l * riserva <= max) return fs;
  return Math.floor((fs * max) / (l * riserva));
}
export const pulisci = (w: string) => w.replace(/^[«"“(]+|[»"”).,;:…]+$/g, '');
export const norm = (w: string) => pulisci(w).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// parole di raccordo italiane: restano piccole se l'AI non ha indicato le parole da ingrandire
export const RACCORDO = new Set(('il lo la i gli le l un uno una un\' di a da in con su per tra fra e ed o ma che chi cui non mi ti si ci vi ne ' +
  'del dello della dei degli delle al allo alla ai agli alle dal dallo dalla dai dagli dalle nel nello nella nei negli nelle sul sullo ' +
  'sulla sui sugli sulle col coi come quando se perche anche gia piu molto tanto poi cosi io tu lui lei noi voi loro me te sé mio mia ' +
  'tuo tua suo sua nostro vostro questo questa questi queste quello quella quelli quelle ho hai ha abbiamo avete hanno sono sei e ' +
  'siamo siete era ero erano essere avere fare fatto sto stai sta stiamo state stanno ce c sempre ancora proprio solo tutto tutti ' +
  'tutte qui qua li la cosa cose dire detto parla parlare vado va andare oggi adesso ora allora quindi pero dove').split(/\s+/));

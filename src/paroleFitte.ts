// Parole chiave fitte per lo stile Focus. Logica pura (niente React): la prova scripts/parole-fitte.test.mjs
// la esegue con Node.
//
// Nel riferimento arriva una parola grande ogni 2–3 s. Se la regia ne ha date poche (Test Impact, 09/11:
// 4 in 72 s), i buchi si riempiono dal parlato: la parola più "forte" del tratto (numeri, nomi, parole
// lunghe) diventa la scritta grande e le 2–4 parole prima la riga piccola sopra.
import type { Keyword, Piano } from './piano';

const VUOTE = new Set(('che di il la lo le gli i un una uno per con non sono è e a in su da ma se mi ti si ci vi del della dei delle degli '
  + 'al alla allo ai alle dal dalla nel nella nei sul sulla anche perché quindi poi comunque allora ovviamente questo questa questi queste '
  + 'quello quella quelli quelle cosa come dove quando molto tutto tutti tutta tutte più meno sarebbe sarebbero potrebbero ancora già solo '
  + 'sempre mai essere avere fare detto dice dicono vuol dire io tu lui lei noi voi loro mio mia tuo tua suo sua nostro vostro ho hai ha '
  + 'abbiamo hanno era erano sei siamo siete o oppure né cui quale quali qui qua là lì così tipo cioè però infatti invece proprio stato '
  + 'stata fatto fatta andato andata devi deve vorrebbe vorresti mentre dopo prima ogni').split(' '));

const PASSO = 2.6;    // ogni quanto si cerca una parola nuova
const MINIMA = 1.2;   // una scritta sta a schermo almeno così
const MASSIMA = 2.4;
const STACCO = 0.25;  // pausa tra due scritte

export const pulisci = (w: string) => w.replace(/^[«"'(\[]+|[»"'),.;:!?\]]+$/g, '');

export const forza = (w: string, primaDiFrase: boolean) => {
  const p = pulisci(w), l = p.toLowerCase();
  if (!p || VUOTE.has(l)) return 0;
  if (/\d/.test(p)) return 10;
  let s = p.length >= 7 ? 2 + p.length / 8 : p.length >= 5 ? 1 : 0.2;
  if (/^[A-ZÀ-Ý]/.test(p) && !primaDiFrase) s += 3;
  return s;
};

export function paroleFitte(piano: Piano): Keyword[] {
  const date = [...(piano.keywords || [])].sort((a, b) => a.at - b.at);
  const parole = piano.parole || [];
  if (!parole.length) return date;
  const fine = piano.clips.reduce((t, c) => t + Math.max(0, c.end - c.start), 0);
  const usate = new Set(date.map((k) => k.word.toLowerCase()));
  const tutte = [...date];
  let t = 0.2;
  // Ogni giro deve portare avanti t. Il 09/11 non succedeva (parola della regia 0,2–0,6 s dopo t: il
  // limite cadeva prima di t e il giro si ripeteva uguale) e il render di Focus restava appeso finché
  // Remotion non scadeva. Il tetto ai giri è la cintura sopra le bretelle.
  for (let giri = 0; t < fine - MINIMA && giri < 5000; giri++) {
    const dentro = tutte.find((k) => k.at <= t + 0.2 && k.at + k.dur > t);
    if (dentro) { t = dentro.at + dentro.dur + STACCO; continue; }
    const prossima = tutte.filter((k) => k.at > t).sort((a, b) => a.at - b.at)[0];
    // fin dove può restare una scritta nuova senza coprire la prossima
    const tetto = prossima ? prossima.at - STACCO : fine;
    // la parola deve partire in tempo per restare a schermo almeno MINIMA
    const limite = Math.min(t + PASSO, tetto - MINIMA);
    if (limite <= t) { t = prossima ? prossima.at : fine; continue; }   // buco troppo corto: si salta
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
    const dur = Math.min(MASSIMA, tetto - at);   // at < limite ≤ tetto − MINIMA, quindi dur > MINIMA
    tutte.push({ at: +at.toFixed(3), dur: +dur.toFixed(3), word: parola.charAt(0).toUpperCase() + parola.slice(1), note: prima.join(' ') || undefined });
    usate.add(parola.toLowerCase());
    t = at + dur + STACCO;
  }
  return tutte.sort((a, b) => a.at - b.at);
}

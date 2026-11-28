// Stile «Elaborato»: pagina profilo e scheda editor non devono dipendere dall'AI (Gemini ignora i campi nuovi della regia).
// Se lo stile le vuole e la regia non le ha piazzate, vanno dove stanno nel riferimento: pagina profilo a 2,5 s, scheda editor a 6 s.
// Le icone di concetto che cadono sotto una scheda si tolgono. Si applica al piano prima del render; il render ha la stessa regola come rete di sicurezza.
import { ICONE_CONCETTO } from './icone-concetto.mjs';

// Icone di concetto automatiche (Denis, 27/11: «hai smesso di metterle»): l'AI ne dà 3-5, qui se ne aggiungono dal parlato quando una parola
// ha un'icona (nome della lista o sinonimo), una ogni 3 s al massimo, alternando i lati, mai sotto una scheda né nei primi 1,6 s.
const SINONIMI = {
  sponsor: 'soldi', pagato: 'soldi', pagati: 'soldi', euro: 'soldi', costa: 'soldi', prezzo: 'etichetta', giochi: 'gamepad', gioco: 'gamepad',
  chiesa: 'edificio', regali: 'regalo', doni: 'regalo', dono: 'regalo', mondo: 'mondo', germania: 'mondo', storia: 'libro', libri: 'libro',
  nemico: 'bersaglio', piace: 'cuore', amore: 'cuore', motivo: 'domanda', perche: 'domanda', rifiutato: 'divieto', abolito: 'divieto', vietato: 'divieto',
  celti: 'gruppo', romani: 'gruppo', gente: 'gruppo', sempreverde: 'foglia', rami: 'foglia', natale: 'albero', anno: 'calendario', anni: 'calendario',
  cristiano: 'croce', cristiana: 'croce', pagano: 'fuoco', rito: 'fuoco', idea: 'idea', secondo: 'orologio', tempo: 'orologio', soldi: 'soldi',
};
const norm = (w) => String(w || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
function nomeIcona(w) {
  const n = norm(w);
  if (n.length < 4) return null;
  if (SINONIMI[n]) return SINONIMI[n];
  if (ICONE_CONCETTO[n]) return n;
  const radice = n.slice(0, Math.max(5, n.length - 2)); // «alberi» → «albero», «telefoni» → «telefono»
  return Object.keys(ICONE_CONCETTO).find((k) => k.length >= 5 && k.startsWith(radice.slice(0, 5)) && radice.length >= 5) || null;
}
function aggiungiIcone(piano, durata, occupati) {
  const esistenti = [...(piano.iconeConcetto || [])];
  const scelte = [];
  const tutte = () => [...esistenti, ...scelte];
  for (const w of piano.parole || []) {
    const nome = nomeIcona(w.w);
    if (!nome || w.at < 1.6 || w.at > durata - 1.5) continue;
    if (tutte().some((i) => Math.abs(i.at - (w.at - 0.1)) < 3.05 || i.nome === nome && Math.abs(i.at - w.at) < 9)) continue;
    if (occupati.some((s) => w.at < s.at + s.dur + 0.4 && w.at + 1.8 > s.at - 0.4)) continue;
    scelte.push({ nome, at: Math.round((w.at - 0.1) * 100) / 100, dur: 1.8, lato: (esistenti.length + scelte.length) % 2 === 0 ? 'destra' : 'sinistra' });
  }
  piano.iconeConcetto = [...esistenti, ...scelte].sort((a, b) => a.at - b.at);
  return scelte.length;
}

// Parole giganti in più (Denis, 27/11: «aumenta il numero»): l'AI ne sceglie una ogni 5-6 s, qui si aggiungono parole «piene» (≥6 lettere o numeri)
// a distanza di almeno 2,6 s dalle altre, mai dove sta una scheda, la pagina profilo o la scheda editor (lì le giganti non si vedrebbero).
// `enfasi` si legge nell'ordine del parlato (come src/Motion.tsx, segnaGrandi): la lista si rifà in ordine di tempo e una parola entra solo
// se non è già stata detta tra la precedente e lei (altrimenti il render la metterebbe sulla prima volta).
const RACCORDI = new Set(['quindi', 'perche', 'perché', 'allora', 'comunque', 'dunque', 'tuttavia', 'sempre', 'ancora', 'questo', 'questa', 'questi', 'queste', 'quello', 'quella', 'quelli', 'quelle', 'cosa', 'cose', 'molto', 'anche', 'dentro', 'invece', 'durante', 'quando', 'siamo', 'stato', 'stata', 'hanno', 'fatto', 'essere', 'veramente', 'diciamo', 'praticamente', 'proprio', 'adesso', 'quasi', 'tutto', 'tutti', 'tutte', 'nostro', 'nostra', 'vostro', 'quanto', 'prima', 'dopo', 'sotto', 'sopra', 'vedere', 'vediamo', 'faccio', 'faccia']);
export const MIN_DISTANZA_GIGANTI = 2.6;
function aggiungiGiganti(piano, occupati, durata) {
  const parole = piano.parole || [];
  const n = parole.map((p) => norm(p.w));
  const items = [];
  let cursore = 0;
  const usate = new Set();
  for (const e of piano.enfasi || []) {
    const pezzi = String(e).split(/\s+/).map(norm).filter(Boolean);
    if (!pezzi.length) continue;
    const trova = (da) => { for (let i = da; i + pezzi.length <= n.length; i++) if (pezzi.every((x, k) => n[i + k] === x) && !usate.has(i)) return i; return -1; };
    let i = trova(cursore);
    if (i < 0) i = trova(0);
    if (i < 0) continue;
    pezzi.forEach((_, k) => usate.add(i + k));
    cursore = i + pezzi.length;
    items.push({ idx: i, len: pezzi.length, testo: String(e) });
  }
  let aggiunte = 0;
  for (let i = 0; i < parole.length; i++) {
    const w = parole[i];
    if (usate.has(i) || w.at < 0.4 || w.at > durata - 1.2) continue;
    if (!(n[i].length >= 6 || /\d/.test(n[i])) || RACCORDI.has(n[i]) || RACCORDI.has(String(w.w).toLowerCase())) continue;
    if (occupati.some((s) => w.at < s.at + s.dur + 0.3 && w.at + 1.6 > s.at - 0.3)) continue;
    if (items.some((it) => Math.abs(parole[it.idx].at - w.at) < MIN_DISTANZA_GIGANTI)) continue;
    const prec = items.filter((it) => it.idx < i).sort((a, b) => b.idx - a.idx)[0];
    let doppia = false;
    for (let k = prec ? prec.idx + prec.len : 0; k < i; k++) if (n[k] === n[i] && !usate.has(k)) { doppia = true; break; }
    if (doppia) continue;
    usate.add(i);
    items.push({ idx: i, len: 1, testo: String(w.w).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '') });
    aggiunte++;
  }
  if (aggiunte) piano.enfasi = items.sort((a, b) => a.idx - b.idx).map((it) => it.testo);
  return aggiunte;
}

// Tagli più veloci (Denis, 27/11: «velocizza zoom e tagli»): un pezzo di Denis lungo più di 2,8 s si divide in pezzi di ~1,8 s, sulle pause tra le
// parole, e lo zoom (punch-in) alterna a ogni taglio. Il parlato resta continuo (stessa sorgente, un pezzo comincia dove finisce l'altro).
// L'ultimo pezzo tiene lo zoom che aveva il pezzo intero, così l'alternanza con quello dopo resta quella decisa dalla regia.
export const PEZZO_TARGET = 1.8;
export const PEZZO_MIN = 1.0;
function dividiPezzi(piano) {
  const parole = piano.parole || [];
  const nuove = [];
  let t = 0, tagli = 0;
  for (const c of piano.clips || []) {
    const d = c.end - c.start;
    const intera = !c.inserto && !c.broll && !c.muto && (!c.audio || typeof c.audio === 'object') && !c.lento && !c.rampa && !c.bn && !c.telefono && d > PEZZO_TARGET * 1.55;
    if (!intera) { nuove.push(c); t += Math.max(0, d); continue; }
    const k = Math.max(2, Math.round(d / PEZZO_TARGET));
    const punti = [];
    for (let j = 1; j < k; j++) {
      const ideale = t + (d * j) / k;
      const vicina = parole.filter((w) => Math.abs(w.at - ideale) <= 0.5).sort((a, b) => Math.abs(a.at - ideale) - Math.abs(b.at - ideale))[0];
      const taglio = vicina ? vicina.at - 0.05 : ideale;
      const prec = punti.length ? punti[punti.length - 1] : t;
      if (taglio - prec >= PEZZO_MIN && t + d - taglio >= PEZZO_MIN) punti.push(taglio);
    }
    if (!punti.length) { nuove.push(c); t += d; continue; }
    const estremi = [t, ...punti, t + d];
    const pezzi = estremi.slice(0, -1).map((da, i) => {
      const pezzo = { ...c, start: +(c.start + (da - t)).toFixed(3), end: +(c.start + (estremi[i + 1] - t)).toFixed(3) };
      if (i > 0) { delete pezzo.fumo; delete pezzo.transizione; }
      // voce da un'altra sorgente (modalità discorso): comincia dove comincia il pezzo
      if (c.audio && typeof c.audio === 'object') pezzo.audio = { ...c.audio, start: +(c.audio.start + (da - t)).toFixed(3) };
      pezzo.punch = Boolean(c.punch) !== ((estremi.length - 2 - i) % 2 === 1);
      return pezzo;
    });
    tagli += punti.length;
    nuove.push(...pezzi);
    t += d;
  }
  piano.clips = nuove;
  return tagli;
}

// Schermate animate (Denis, 27/11: chat lunghissima, documento trascinato nella chat, /clear come nello stile Ultron): compaiono sopra la testa,
// nello stesso posto delle schede immagine, quando Denis dice la parola giusta. Una volta ciascuna, mai su una scheda, la pagina profilo o la scheda editor.
// parola → animazione: «conversazione» = chat lunga che scorre, «clear» = il comando battuto nel terminale, «incollare/incolla» = il file trascinato nella chat
export const TRIGGER_SCHERMATE = [
  { parole: ['conversazione', 'rileggere', 'rilegge', 'consuma'], anticipo: 0.2, dur: 3.4, schermata: { tipo: 'chatlunga', titolo: 'Claude' } },
  { parole: ['clear'], anticipo: 1.0, dur: 2.6, schermata: { tipo: 'terminale', titolo: 'Claude Code', voci: ['/clear'] } }, // «slash clear»: parte da «slash»
  { parole: ['incollare', 'incolla', 'incolli', 'incollo', 'incollate'], anticipo: 0.9, dur: 3.2, schermata: { tipo: 'documento', titolo: 'Claude', testo: 'regole.md' } },
];
function aggiungiSchermate(piano, durata, occupati) {
  const esistenti = [...(piano.schermate || [])];
  const nuove = [];
  const finestre = () => [...occupati, ...esistenti, ...nuove].map((x) => ({ at: x.at, dur: x.dur }));
  for (const t of TRIGGER_SCHERMATE) {
    // la prima occasione libera: se la parola cade su una scheda si prova con la successiva
    for (const w of (piano.parole || []).filter((p) => t.parole.includes(norm(p.w)))) {
      const at = Math.round(Math.max(1.2, w.at - t.anticipo) * 100) / 100;
      if (at + t.dur > durata - 0.8) continue;
      if (finestre().some((s) => at < s.at + s.dur + 0.4 && at + t.dur > s.at - 0.4)) continue;
      nuove.push({ at, dur: t.dur, ...t.schermata });
      break;
    }
  }
  if (nuove.length) piano.schermate = [...esistenti, ...nuove].sort((a, b) => a.at - b.at);
  return nuove.length;
}

export function completaPianoElaborato(piano) {
  const g = piano?.grafica || {};
  const durata = (piano?.clips || []).reduce((s, c) => s + Math.max(0, c.end - c.start), 0);
  let pagina = piano.paginaProfilo || [];
  let editor = piano.schedeEditor || [];
  const libero = (at, dur) => ![...pagina, ...editor].some((s) => at < s.at + s.dur + 0.6 && at + dur > s.at - 0.6);
  if (g.paginaProfilo && !pagina.length && durata >= 9 && libero(2.5, 2.4)) pagina = [{ at: 2.5, dur: 2.4 }];
  if (g.schedaEditor && !editor.length && durata >= 12 && libero(6, 2.8)) editor = [{ at: 6, dur: 2.8 }];
  if (pagina.length) piano.paginaProfilo = pagina;
  if (editor.length) piano.schedeEditor = editor;
  const occupati = [...pagina, ...editor];
  // schede immagine: i pezzi con un inserto (immagine o video) stanno sopra la testa; le icone automatiche non ci vanno sotto
  { let t = 0; for (const c of piano.clips || []) { const d = Math.max(0, c.end - c.start); if (c.inserto) occupati.push({ at: t, dur: d }); t += d; } }
  const schermateNuove = g.sulPetto && g.dietro ? aggiungiSchermate(piano, durata, occupati) : 0;
  occupati.push(...(piano.schermate || []).map((x) => ({ at: x.at, dur: x.dur })));
  if (piano.iconeConcetto?.length) piano.iconeConcetto = piano.iconeConcetto.filter((i) => !occupati.some((s) => i.at < s.at + s.dur + 0.3 && i.at + i.dur > s.at - 0.3));
  let nuove = 0;
  if (g.iconeConcetto) nuove = aggiungiIcone(piano, durata, occupati);
  const tagliNuovi = g.sulPetto ? dividiPezzi(piano) : 0;
  const gigantiNuovi = g.sulPetto && g.dietro ? aggiungiGiganti(piano, occupati, durata) : 0;
  // numeri soltanto (il log è pubblico): cosa arriva davvero al render
  return `elaborato: flag pagina ${g.paginaProfilo ? 'sì' : 'no'}, scheda ${g.schedaEditor ? 'sì' : 'no'}, medie ${g.paroleMedie ? 'sì' : 'no'}, petto ${g.sulPetto ? 'sì' : 'no'}, tessere ${g.tessere ? 'sì' : 'no'} · piano: pagine ${(piano.paginaProfilo || []).length}, schede ${(piano.schedeEditor || []).length}, icone ${(piano.iconeConcetto || []).length} (${nuove} automatiche), miniature ${(piano.miniatureProfilo || []).length}, giganti ${(piano.enfasi || []).length} (${gigantiNuovi} aggiunte), schermate ${(piano.schermate || []).length} (${schermateNuove} nuove), pezzi ${(piano.clips || []).length} (${tagliNuovi} tagli in più), medie AI ${(piano.enfasiMedia || []).length} · ${durata.toFixed(1)} s`;
}

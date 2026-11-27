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
  if (piano.iconeConcetto?.length) piano.iconeConcetto = piano.iconeConcetto.filter((i) => !occupati.some((s) => i.at < s.at + s.dur + 0.3 && i.at + i.dur > s.at - 0.3));
  let nuove = 0;
  if (g.iconeConcetto) nuove = aggiungiIcone(piano, durata, occupati);
  // numeri soltanto (il log è pubblico): cosa arriva davvero al render
  return `elaborato: flag pagina ${g.paginaProfilo ? 'sì' : 'no'}, scheda ${g.schedaEditor ? 'sì' : 'no'}, medie ${g.paroleMedie ? 'sì' : 'no'}, petto ${g.sulPetto ? 'sì' : 'no'}, tessere ${g.tessere ? 'sì' : 'no'} · piano: pagine ${(piano.paginaProfilo || []).length}, schede ${(piano.schedeEditor || []).length}, icone ${(piano.iconeConcetto || []).length} (${nuove} automatiche), miniature ${(piano.miniatureProfilo || []).length}, giganti ${(piano.enfasi || []).length}, medie AI ${(piano.enfasiMedia || []).length} · ${durata.toFixed(1)} s`;
}

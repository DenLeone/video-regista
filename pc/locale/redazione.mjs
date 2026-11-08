// Stile Redazione: dalla scaletta (grafiche agganciate alle parole) alle props della composizione Redazione
// (src/redazione/Redazione.tsx) e agli eventi sonori.
//   node pc/locale/redazione.mjs <scaletta.json> <parole.json> <uscita props.json> --cartella redazione/<nome> [--fps 29.97] [--eventi eventi.json]
// Nella scaletta ogni tempo può essere un numero (secondi) o "parola@dopo": la prima parola detta che comincia così
// a partire da quel secondo ("cracovia@0", "dieci@27"). Le grafiche finiscono a "a" (stesso formato).
import fs from 'node:fs';

const args = process.argv.slice(2);
const opz = (k, d = '') => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const [fScaletta, fParole, uscita] = args;
const scaletta = JSON.parse(fs.readFileSync(fScaletta, 'utf8'));
let parole = JSON.parse(fs.readFileSync(fParole, 'utf8'));
parole = Array.isArray(parole) ? parole : parole.parole;
const DURATA = Number(opz('--durata', scaletta.durata || parole.at(-1).e + 0.5));
const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
let mancanti = 0;
function tempo(v) {
  if (typeof v === 'number') return v;
  if (typeof v !== 'string' || !v.includes('@')) return v;
  const [p, dopo] = v.split('@');
  const w = parole.find((x) => x.s >= Number(dopo) - 0.05 && norm(x.w).startsWith(norm(p)));
  if (!w) { console.log(`[redazione] parola "${p}" dopo ${dopo} s non trovata`); mancanti++; return Number(dopo); }
  return +w.s.toFixed(3);
}
// risolve ricorsivamente i campi tempo (da, a, t, tSotto)
function risolvi(o) {
  if (Array.isArray(o)) return o.map(risolvi);
  if (o && typeof o === 'object') return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, ['da', 'a', 't', 'tSotto'].includes(k) ? tempo(v) : risolvi(v)]));
  return o;
}
const elementi = risolvi(scaletta.elementi).map((e) => ({ ...e, a: Math.min(DURATA, e.a) }));
fs.writeFileSync(uscita, JSON.stringify({ durata: +DURATA.toFixed(3), fps: Number(opz('--fps', 30000 / 1001)), cartella: opz('--cartella'), elementi }, null, 1));

// suoni: carta per ritagli/foto/citazioni, tasti per la macchina da scrivere, pennarello per il cerchio, timbro, pop
if (opz('--eventi')) {
  const S = { carta: '01 Carta/caduta foto', tasto: '04 Scrittura/macchina da scrivere tasto', pennarello: '04 Scrittura/pennarello', timbro: '03 Timbri e colpi/timbro',
    pop: '07 Digitale/pop', swish: '05 Movimento/swish corto', colpo: '03 Timbri e colpi/colpo sordo', fruscio: '01 Carta/fruscio' };
  const ev = [];
  const tasti = (testo, t0, cps) => [...testo].forEach((c, i) => { if (c !== ' ') ev.push({ t: t0 + i / cps, suono: S.tasto, db: -15 }); });
  for (const e of elementi) {
    if (['ritaglio', 'foto', 'citazione', 'titolo'].includes(e.tipo)) ev.push({ t: e.da, suono: S.carta, db: -10 });
    if (e.tipo === 'ritaglio' && e.cerchio) ev.push({ t: e.cerchio.t, suono: S.pennarello, db: -9, durata: 0.6 });
    if (e.tipo === 'macchina') e.righe.forEach((r) => tasti(r.testo, r.t, 18));
    if (e.tipo === 'titolo') { tasti(e.testo, e.t, 14); ev.push({ t: e.t + e.testo.length / 14, suono: S.colpo, db: -6 }); }
    if (e.tipo === 'etichetta') ev.push({ t: e.da, suono: S.swish, db: -12 });
    if (e.tipo === 'parola') ev.push({ t: e.da, suono: e.timbro ? S.timbro : S.pop, db: -6 });
    if (e.tipo === 'commenti') { e.voci.forEach((v) => ev.push({ t: v.t, suono: S.pop, db: -10 })); if (e.domanda) ev.push({ t: e.domanda.t, suono: S.colpo, db: -6 }); }
    if (e.tipo === 'tris') { e.voci.forEach((v) => ev.push({ t: v.t, suono: S.colpo, db: -9 })); ev.push({ t: e.unione.t, suono: S.timbro, db: -5 }); }
    if (e.tipo === 'finale') { ev.push({ t: e.da, suono: S.swish, db: -10 }); tasti(e.testo, e.da + 0.4, 20); }
  }
  ev.sort((a, b) => a.t - b.t);
  fs.writeFileSync(opz('--eventi'), JSON.stringify({ durata: DURATA, letto: { stanza: '09 Ambiente/stanza', musica: scaletta.musica || '10 Musica/tensione' }, eventi: ev }, null, 1));
}
console.log(`[redazione] ${elementi.length} grafiche, ${mancanti} parole non trovate → ${uscita}`);

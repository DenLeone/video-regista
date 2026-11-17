import assert from 'node:assert/strict';
import { test } from 'node:test';
import { _discorsoPerTest, daAccorciare, durataChiesta, minimoDiscorso, riapplicaParole, unisciParole } from './regista.mjs';

// ⏱️ 16/11, due recensioni (tastiera e microfono): il brief della squadra chiedeva 28–45 s (regole dell'Analista), l'AI
// aveva accorciato il discorso a ~40 s e il Regista, vedendo tolto più del 30%, aveva rimesso TUTTO il parlato.
const ANALISTA = `Stile: Cinematico

Dai numeri dei social (📊 Analista), tienine conto:
- Montato finale tra 28 e 45 secondi: oltre il minuto il pubblico cala.
- Primi 2 secondi: il prodotto già in funzione.
- Tagli ogni 2-3 secondi, niente pause.`;

test('la durata chiesta nel brief si legge, i «primi 2 secondi» no', () => {
  assert.deepEqual(durataChiesta(ANALISTA), [28, 45]);
  assert.deepEqual(durataChiesta('Collab FIFINE, deve vendere: 35–50 s, prezzo in apertura'), [35, 50]);
  assert.deepEqual(durataChiesta('video da 30-60s'), [30, 60]);
  assert.deepEqual(durataChiesta('un video di 1-2 minuti'), [60, 120]);
  assert.equal(durataChiesta('Primi 2 secondi forti. Tagli ogni 2-3 secondi.'), null);
  assert.equal(durataChiesta('Stile: Kal'), null);
  assert.equal(durataChiesta(''), null);
});

// ⏱️ 17/11: «Mantieni i video sotto i 40 secondi» (Analista) non era una durata: video da 3–4 minuti
test('il solo tetto («sotto i 40 secondi», «massimo 45 s») diventa una durata', () => {
  assert.deepEqual(durataChiesta('- Mantieni i video sotto i 40 secondi per evitare cali drastici di attenzione.'), [28, 40]);
  assert.deepEqual(durataChiesta('massimo 45 s'), [31, 45]);
  assert.deepEqual(durataChiesta('non più di 60 secondi'), [42, 60]);
  assert.equal(durataChiesta('mostra il gadget nei primi 2 secondi'), null);
  assert.equal(durataChiesta('Taglia i respiri sotto i 2 secondi'), null);
  // il taglio dell'AI a 42 s di un discorso da 233 s ora vale (prima: minimo 163 s, tornava tutto)
  assert.ok(minimoDiscorso(233, [28, 40]) <= 42);
});

test('il minimo da tenere: 70% del discorso, o 3/4 della durata chiesta se il brief vuole un video più corto', () => {
  assert.equal(minimoDiscorso(156, [28, 45]), 21);
  assert.ok(Math.abs(minimoDiscorso(156, null) - 109.2) < 1e-9);
  // discorso già corto quanto il brief: vale il 70%
  assert.equal(daAccorciare(50, [35, 50]), false);
  assert.equal(minimoDiscorso(50, [35, 50]), 35);
});

// una recensione di una tastiera: 14 frasi da 5,7 s (≈ 80 s), pause di 0,3 s
const testi = [
  'Ecco la Ajax K1, la prima tastiera completamente bianca che prendo.',
  'Il gioco di luce preimpostato è azzurrino,',
  'sembra ghiaccio che si scontra.',
  'La pecca più grande è che',
  'non ha il tre mode, solo USB Type-C.',
  'Come feeling di battitura è clicky.',
  'Non è il mio tipo di tastiera ma mi piace da morire.',
  'Il costo è ottimo, non costa tanto.',
  "C'è il knob in alluminio per il volume.",
  'Potete personalizzare tutto dal software.',
  'Potete scegliere quali tasti illuminare.',
  'Ad esempio solo quelli che vi servono perché',
  'giocate solo con quelli.',
  'Come tastiera è assolutamente consigliata.',
];
function analisiDi(righe) {
  const frasi = righe.map((testo, i) => ({ id: `F${String(i + 1).padStart(3, '0')}`, principale: 'A', inizio: i * 6, fine: i * 6 + 5.7, testo }));
  const parole = frasi.flatMap((f) => {
    const w = f.testo.split(' '), passo = (f.fine - f.inizio) / w.length;
    return w.map((x, j) => ({ w: x, s: +(f.inizio + j * passo).toFixed(3), e: +(f.inizio + (j + 0.9) * passo).toFixed(3) }));
  });
  return { fps: 30, sorgenti: [{ id: 'A', file: 'a.mp4', principale: true, tipo: 'video', durata: righe.length * 6, orient: 'v', parole }], frasi };
}
const regiaCon = (ids, extra = {}) => ({ titolo: 'Tastiera', sequenza: ids.map((frase) => ({ frase, camera: 'A' })), keywords: [], ...extra });
const ids = (seq) => seq.filter((x) => x.frase).map((x) => x.frase);

test('brief da 28–45 s: il taglio dell\'AI a ~40 s resta (prima tornava tutto il parlato)', () => {
  const tenute = ['F001', 'F002', 'F003', 'F004', 'F005', 'F008', 'F014'];
  const r = _discorsoPerTest(analisiDi(testi), regiaCon(tenute), { brief: ANALISTA });
  assert.deepEqual(ids(r.sequenza), tenute);
  assert.equal(r.discorso.troppo, null);
  assert.equal(r.discorso.tenute, 7);
  assert.ok(r.piano.clips.length < 14);
});

test('senza durata nel brief, un taglio oltre il 30% non vale ancora: resta il discorso intero, ma si dice perché', () => {
  const r = _discorsoPerTest(analisiDi(testi), regiaCon(['F001', 'F002', 'F003', 'F004', 'F005', 'F008', 'F014']));
  assert.equal(ids(r.sequenza).length, 14);
  assert.match(r.discorso.troppo, /teneva 40 s su 80.*sotto il minimo di 56 s/);
});

test('anche col brief corto, un taglio sotto i 3/4 della durata minima non vale', () => {
  const r = _discorsoPerTest(analisiDi(testi), regiaCon(['F001', 'F008', 'F014']), { brief: ANALISTA });
  assert.equal(ids(r.sequenza).length, 14);
  assert.match(r.discorso.troppo, /sotto il minimo di 21 s/);
});

test('con il modello di riserva (lite) il discorso resta intero, come prima', () => {
  const r = _discorsoPerTest(analisiDi(testi), regiaCon(['F001', 'F002', 'F003', 'F008', 'F014']), { brief: ANALISTA, modello: 'gemini-3.5-flash-lite' });
  assert.equal(ids(r.sequenza).length, 14);
  assert.equal(r.discorso.riserva, true);
});

test('discorso accorciato: un pezzo che resta appeso («…perché») senza la sua continuazione esce', () => {
  const r = _discorsoPerTest(analisiDi(testi), regiaCon(['F001', 'F002', 'F003', 'F008', 'F009', 'F012', 'F014']), { brief: ANALISTA });
  assert.deepEqual(ids(r.sequenza), ['F001', 'F002', 'F003', 'F008', 'F009', 'F014']);
});

test('un pezzo appeso resta se dopo c\'è la sua continuazione, anche oltre un «ehm» tolto o una pausa lunga', () => {
  const righe = ['Ecco il microfono nuovo, tutto bianco.', 'La cosa che mi piace è che', 'ehm', 'si sente benissimo anche in cuffia.', 'Il prezzo è di cinquanta euro.', 'Per me è promosso.'];
  const r = _discorsoPerTest(analisiDi(righe), regiaCon(['F001', 'F002', 'F004', 'F005', 'F006']));
  assert.deepEqual(ids(r.sequenza), ['F001', 'F002', 'F004', 'F005', 'F006']);
  // correzione (niente sequenza di partenza): «…che» [1,5 s di pausa] «si sente…» è sempre il filo giusto
  const a = analisiDi(['Ecco il microfono nuovo, tutto bianco.', 'La cosa che mi piace è che', 'si sente benissimo anche in cuffia.', 'Il prezzo è di cinquanta euro.', 'Per me è promosso.']);
  a.frasi[2].inizio += 1.5;
  const c = _discorsoPerTest(a, regiaCon(['F001', 'F002', 'F003', 'F004', 'F005']), { nuova: true, correzione: true });
  assert.deepEqual(ids(c.sequenza), ['F001', 'F002', 'F003', 'F004', 'F005']);
});

test('l\'ultimo pezzo appeso non esce: la chiusura la sistema risolviRegia', () => {
  const righe = ['Ecco il microfono nuovo, tutto bianco.', 'Si sente benissimo anche in cuffia.', 'Il prezzo è di cinquanta euro.', 'Per me è promosso e', 'lo consiglio a tutti.'];
  const r = _discorsoPerTest(analisiDi(righe), regiaCon(['F001', 'F002', 'F003', 'F004']));
  assert.ok(ids(r.sequenza).includes('F004'));
});

test('"Solo render" e macchine dei pezzi montano la regia salvata così com\'è', () => {
  const salvata = _discorsoPerTest(analisiDi(testi), regiaCon(['F001', 'F002', 'F003', 'F008', 'F009', 'F012', 'F014']), { brief: ANALISTA });
  const dopo = _discorsoPerTest(analisiDi(testi), { ...regiaCon([]), sequenza: salvata.sequenza, discorso: true }, { nuova: false });
  assert.deepEqual(ids(dopo.sequenza), ids(salvata.sequenza));
  assert.equal(dopo.piano.testo, salvata.piano.testo);
});

test('le parole corrette dalla prova di lettura tornano anche su un piano rifatto dalla regia (Ajax → Ajazz)', () => {
  const salvate = unisciParole([{ sbagliata: 'Ajax', giusta: 'Ajaz' }], [{ sbagliata: 'Ajax', giusta: 'Ajazz' }, { sbagliata: 'Pro', giusta: 'AirPods Pro' }, { sbagliata: 'due parole', giusta: 'x' }]);
  assert.deepEqual(salvate, [{ sbagliata: 'Ajax', giusta: 'Ajazz' }]);
  const regia = { ...regiaCon(['F001', 'F002', 'F003', 'F008', 'F014']), parole_corrette: salvate };
  const { piano } = _discorsoPerTest(analisiDi(testi), regia, { nuova: false });
  assert.match(piano.testo, /Ajax/);
  riapplicaParole(piano, regia);
  riapplicaParole(piano, regia); // due volte: stesso risultato
  assert.match(piano.testo, /Ecco la Ajazz K1/);
  assert.ok(piano.parole.some((p) => /^Ajazz/.test(p.w)) && !piano.parole.some((p) => /^Ajax/.test(p.w)));
});

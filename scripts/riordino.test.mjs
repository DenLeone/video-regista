// Ispettore · riordino per prodotto: un Drive in memoria, Gemini finto. Le regole che contano: niente file perso, niente
// sovrascritto, tolte solo cartelle vuote, tutto si rimette con l'annulla.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { annulla, cartellaDelProdotto, messaggioInizio, chiaveClip, esegui, esitoPerFabbrica, inventario, pianifica, perProdotto, raggruppa, riconosci, togliVecchie } from './riordino.mjs';

const ORA = Date.UTC(2026, 10, 26, 12, 0, 0);
const VECCHIO = '2026-11-20T10:00:00Z';
const riga = (p, mod = VECCHIO, size = 1000) => ({ Path: p, Name: p.split('/').pop(), Size: size, ModTime: mod });

// Drive in memoria: path (relativo a 05) → file. Le cartelle esistono finché c'è qualcosa dentro.
function driveFinto(righe) {
  const files = new Map(righe.map((r) => [r.Path, r]));
  const rimosse = [];
  const deps = {
    adesso: () => ORA, log: () => {}, pausa: async () => {},
    esiste: async (p) => files.has(p),
    sposta: async (da, a) => { const f = files.get(da); files.delete(da); files.set(a, { ...f, Path: a, Name: a.split('/').pop() }); },
    restano: async (dir) => [...files.keys()].filter((k) => k.startsWith(`${dir}/`)).length,
    rimuoviVuote: async (dir) => { assert.equal([...files.keys()].filter((k) => k.startsWith(`${dir}/`)).length, 0, `tolta una cartella NON vuota: ${dir}`); rimosse.push(dir); return true; },
    salvaGiornale: async () => {},
  };
  return { files, deps, rimosse };
}

const RIGHE = [
  riga('Anker powerbank/clip1.mp4'), riga('Anker powerbank/b1.mp4'), riga('Anker powerbank/B-roll/vecchio.mp4'),
  riga('Anker 2/p1.mp4'), riga('Anker 2/b2.mp4'), riga('Anker 2/note.txt'), riga('Anker 2/protetto.mp4'),
  riga('Insta 360/Luna/z1.mp4'), riga('Insta 360/Luna/clip1.mp4'), riga('Insta 360/Luna/foto1.jpg'), riga('Insta 360/Luna/voce.wav'),
  riga('Ajazz AK820/a.mp4'),
  riga('Misc/x.mp4'),
  riga('Nuova/n1.mp4', new Date(ORA - 3600_000).toISOString()),
  riga('_Archivio/stile/x.mp4'), riga('sciolto.mp4'),
];
const R = (path, p, v, c = 0.9) => [chiaveClip(inventario([RIGHE.find((x) => x.Path === path)])[0]), { p, v, c }];
const CACHE = Object.fromEntries([
  R('Anker powerbank/clip1.mp4', 'Anker powerbank', true), R('Anker powerbank/b1.mp4', 'Anker Powerbank', false),
  R('Anker 2/p1.mp4', 'Anker powerbank', true), R('Anker 2/b2.mp4', 'Anker powerbank 27650', false), R('Anker 2/protetto.mp4', 'Anker powerbank', true),
  R('Insta 360/Luna/z1.mp4', 'Anker powerbank 27650', true), R('Insta 360/Luna/clip1.mp4', 'Anker powerbank', true), R('Insta 360/Luna/foto1.jpg', 'Anker powerbank', null),
  R('Ajazz AK820/a.mp4', 'Ajazz AK820', true),
  R('Misc/x.mp4', '', false, 0.2),
  R('Nuova/n1.mp4', 'Moero', true),
]);
const MAPPA = { 'Anker powerbank': 'Anker powerbank', 'Anker Powerbank': 'Anker powerbank', 'Anker powerbank 27650': 'Anker powerbank', 'Ajazz AK820': 'Ajazz AK820', Moero: 'Moero' };

test('inventario: salta file sciolti e cartelle «_», riconosce tipi e cose già a posto', () => {
  const inv = inventario([...RIGHE, riga('Anker powerbank/Parlato/v1/p.mp4'), riga('X/doc.pdf')]);
  assert.ok(!inv.some((c) => c.path === 'sciolto.mp4' || c.path.startsWith('_Archivio') || c.nome === 'doc.pdf' || c.nome === 'note.txt'));
  assert.equal(inv.find((c) => c.path === 'Anker powerbank/B-roll/vecchio.mp4').giaPosto, true);
  assert.equal(inv.find((c) => c.path === 'Anker powerbank/Parlato/v1/p.mp4').giaPosto, true);
  assert.deepEqual(inv.filter((c) => c.tipo === 'audio').map((c) => c.nome), ['voce.wav']);
  assert.equal(inv.find((c) => c.nome === 'foto1.jpg').tipo, 'foto');
});

test('cartellaDelProdotto: una cartella esistente se combacia, se no un nome pulito', () => {
  assert.equal(cartellaDelProdotto('Anker powerbank', { 'Anker powerbank': 3, Altro: 9 }), 'Anker powerbank');
  assert.equal(cartellaDelProdotto('Anker Powerbank 27650', { 'Anker powerbank': 3, Altro: 9 }), 'Anker powerbank'); // una dentro l'altra, senza dubbi
  assert.equal(cartellaDelProdotto('Anker: Prime/27650?', { Altro: 9 }), 'Anker Prime 27650');
  assert.equal(cartellaDelProdotto('Ajazz', { 'Ajazz AK820': 3, 'Ajazz AK975': 3 }), 'Ajazz'); // due candidate alla pari: non si sceglie
});

test('riconosci: solo le clip nuove, a lotti, con la cache; una clip illeggibile non ferma le altre', async () => {
  const inv = inventario(RIGHE).filter((c) => !c.giaPosto && c.tipo !== 'audio').slice(0, 7);
  const cache = {};
  let chiamate = 0, leggibile = false;
  const deps = { adesso: () => ORA, log: () => {}, pausa: async () => {},
    estrai: async (c) => { if (c.nome === 'b1.mp4' && !leggibile) throw new Error('non si legge'); return { jpg: 'AAA', wav: c.tipo === 'video' ? 'BBB' : null }; },
    chiedi: async (parts) => { chiamate++; const n = parts.filter((p) => p.inline_data?.mime_type === 'image/jpeg').length; return { clip: Array.from({ length: n }, (_, k) => ({ k: k + 1, prodotto: ' Anker: Powerbank ', parlato: k % 2 === 0, conf: 0.8 })) }; } };
  const r = await riconosci(inv, cache, deps, { lotto: 3 });
  assert.equal(r.finito, true);
  assert.equal(chiamate, 3);
  assert.equal(Object.keys(cache).length, 6); // la illeggibile resta fuori
  assert.equal(Object.values(cache)[0].p, 'Anker Powerbank'); // nome pulito (niente «:»)
  chiamate = 0; leggibile = true; // la clip illeggibile ora si legge
  await riconosci(inv, cache, deps, { lotto: 3 });
  assert.equal(chiamate, 1); // solo quella che mancava
  assert.equal(Object.keys(cache).length, 7);
  const tardi = await riconosci(inv, {}, { ...deps, adesso: () => ORA + 10 }, { lotto: 3, scadenza: ORA });
  assert.deepEqual(tardi, { fatti: 0, finito: false }); // tempo finito: si riprende al giro dopo
});

test('riconosci: si ferma tra un lotto e l\'altro se Denis dice «ferma»', async () => {
  const inv = inventario(RIGHE).filter((c) => !c.giaPosto && c.tipo !== 'audio').slice(0, 6);
  let fermo = false, chiamate = 0;
  const deps = { adesso: () => ORA, log: () => {}, pausa: async () => { fermo = true; }, estrai: async () => ({ jpg: 'A', wav: null }), chiedi: async (parts) => { chiamate++; return { clip: [] }; } };
  const r = await riconosci(inv, {}, deps, { lotto: 2, stop: () => fermo });
  assert.equal(r.finito, false);
  assert.equal(chiamate, 1); // un lotto, poi lo stop
});

test('riconosci: salva a intervalli (cache e avanzamento), così un giro interrotto non perde il lavoro', async () => {
  const inv = inventario(RIGHE).filter((c) => !c.giaPosto && c.tipo !== 'audio').slice(0, 8);
  const visti = [];
  const deps = { adesso: () => ORA, log: () => {}, pausa: async () => {}, estrai: async () => ({ jpg: 'A', wav: null }),
    chiedi: async (parts) => ({ clip: parts.filter((p) => p.inline_data).map((_, k) => ({ k: k + 1, prodotto: 'X', parlato: true, conf: 0.9 })) }) };
  const cache = {};
  await riconosci(inv, cache, deps, { lotto: 2, ogni: 2, checkpoint: async (n) => visti.push([n, Object.keys(cache).length]) });
  assert.deepEqual(visti, [[4, 4], [8, 8]]); // 4 lotti da 2 clip: un salvataggio dopo il secondo e uno dopo il quarto
});

test('messaggio di partenza: quante clip, quante da riconoscere e una stima del tempo', () => {
  const m = messaggioInizio({ clip: 2400, cartelle: 85, nuove: 2000, note: 400, budgetMinuti: 300 });
  assert.match(m, /ho trovato <b>2400<\/b> file in <b>85<\/b> cartelle/);
  assert.match(m, /Da riconoscere ora: <b>2000<\/b> clip \(altre 400 le conosco già/);
  assert.match(m, /tra 2,8 ore e 5,6 ore, in circa 2 giri/); // 2000 clip × 5–10 s
  assert.match(messaggioInizio({ clip: 10, cartelle: 2, nuove: 6, note: 0 }), /tra 1 minuto e 1 minuto/);
  assert.match(messaggioInizio({ clip: 100, cartelle: 2, nuove: 60, note: 0 }), /tra 5 minuti e 10 minuti/);
  const tutte = messaggioInizio({ clip: 50, cartelle: 4, nuove: 0, note: 30, prova: true });
  assert.match(tutte, /\(prova\)/);
  assert.match(tutte, /Le conosco già tutte \(30\)/);
  assert.doesNotMatch(tutte, /Tempo, a occhio/);
});

test('raggruppa: stesso nome scritto in modo diverso si unisce da solo; il resto lo decide Gemini; nel dubbio niente', async () => {
  const chiedi = async () => ({ gruppi: [{ canonico: 'Anker Powerbank', nomi: ['Anker powerbank', 'Anker powerbank 27650', 'Inventato'] }, { canonico: 'X', nomi: ['Ajazz AK820'] }] });
  const m = await raggruppa({ 'Anker powerbank': 5, 'Anker Powerbank': 2, 'Anker powerbank 27650': 3, 'Ajazz AK820': 4 }, { chiedi, log: () => {} });
  assert.equal(m['Anker Powerbank'], 'Anker Powerbank');
  assert.equal(m['Anker powerbank 27650'], 'Anker Powerbank');
  assert.equal(m['Ajazz AK820'], 'Ajazz AK820'); // un gruppo da un nome solo non unisce niente
  const rotto = await raggruppa({ 'Anker A': 1, 'Altro B': 1 }, { chiedi: async () => { throw new Error('quota'); }, log: () => {} });
  assert.deepEqual(rotto, { 'Anker A': 'Anker A', 'Altro B': 'Altro B' });
});

test('pianifica: parlato nella cartella del prodotto, B-roll in B-roll/, audio col parlato, dubbi e cose da non toccare restano', () => {
  const inv = inventario(RIGHE);
  const { mosse, dubbie, aPosto, saltate } = pianifica(inv, CACHE, MAPPA, { ora: ORA, protetti: new Set(['Anker 2/protetto.mp4']) });
  const dest = Object.fromEntries(mosse.map((m) => [m.da, m.a]));
  assert.equal(dest['Anker powerbank/b1.mp4'], 'Anker powerbank/B-roll/b1.mp4');
  assert.equal(dest['Anker 2/p1.mp4'], 'Anker powerbank/p1.mp4');
  assert.equal(dest['Anker 2/b2.mp4'], 'Anker powerbank/B-roll/b2.mp4');
  assert.equal(dest['Insta 360/Luna/z1.mp4'], 'Anker powerbank/z1.mp4');
  assert.equal(dest['Insta 360/Luna/clip1.mp4'], 'Anker powerbank/clip1 (2).mp4'); // «clip1.mp4» c'è già: mai sovrascrivere
  assert.equal(dest['Insta 360/Luna/foto1.jpg'], 'Anker powerbank/B-roll/foto1.jpg'); // le foto sono B-roll
  assert.equal(dest['Insta 360/Luna/voce.wav'], 'Anker powerbank/voce.wav'); // l'audio segue il prodotto della sua cartella, come parlato
  assert.ok(!('Ajazz AK820/a.mp4' in dest)); // già a posto
  assert.deepEqual(dubbie.map((d) => d.path), ['Misc/x.mp4']);
  assert.deepEqual(saltate.map((s) => [s.path, s.motivo.slice(0, 12)]).sort(), [['Anker 2/protetto.mp4', 'usato da un '], ['Nuova/n1.mp4', 'cartella mod']]);
  assert.equal(aPosto, 3); // Anker powerbank/clip1, B-roll/vecchio, Ajazz AK820/a
  assert.equal(new Set(mosse.map((m) => m.a.toLowerCase())).size, mosse.length); // nessuna destinazione doppia
  const [p] = perProdotto(mosse);
  assert.deepEqual({ prodotto: p.prodotto, cartelle: p.cartelleUnite, parlato: p.parlato, broll: p.broll }, { prodotto: 'Anker powerbank', cartelle: 3, parlato: 4, broll: 3 });
});

test('esecuzione: nessun file perso, tolte solo le cartelle rimaste vuote, il giornale rimette tutto', async () => {
  const inv = inventario(RIGHE);
  const { mosse } = pianifica(inv, CACHE, MAPPA, { ora: ORA, protetti: new Set(['Anker 2/protetto.mp4']) });
  const { files, deps, rimosse } = driveFinto(RIGHE);
  const prima = new Set(files.keys());
  const giornale = [];
  const r = await esegui(mosse, giornale, deps);
  assert.deepEqual({ fatte: r.fatte, saltate: r.saltate, interrotto: r.interrotto }, { fatte: mosse.length, saltate: 0, interrotto: false });
  assert.equal(files.size, prima.size); // nessun file perso o duplicato
  assert.equal(giornale.length, mosse.length);
  const vecchie = await togliVecchie(mosse, deps);
  // «Luna» e «Insta 360» sono vuote e se ne vanno; «Anker 2» ha ancora note.txt e protetto.mp4; «Misc» e «Nuova» non si sono toccate
  assert.deepEqual(rimosse.sort(), ['Insta 360', 'Insta 360/Luna']);
  assert.deepEqual(vecchie.restano.map((x) => x.dir), ['Anker 2']);
  assert.ok(files.has('Anker 2/note.txt') && files.has('Anker 2/protetto.mp4') && files.has('Misc/x.mp4') && files.has('Nuova/n1.mp4'));
  // annulla: ogni file torna dov'era
  const a = await annulla(giornale, deps);
  assert.equal(a.rimessi, mosse.length);
  assert.deepEqual([...files.keys()].sort(), [...prima].sort());
});

test('esecuzione: destinazione occupata, file sparito, stop e tempo finito', async () => {
  const { files, deps } = driveFinto([riga('A/x.mp4'), riga('B/x.mp4'), riga('A/y.mp4'), riga('A/z.mp4')]);
  const mosse = [{ da: 'A/x.mp4', a: 'B/x.mp4' }, { da: 'A/zz.mp4', a: 'B/zz.mp4' }, { da: 'A/y.mp4', a: 'B/y.mp4' }];
  const g = [];
  const r = await esegui(mosse, g, deps);
  assert.deepEqual({ f: r.fatte, s: r.saltate }, { f: 1, s: 2 });
  assert.ok(files.has('A/x.mp4') && files.has('B/x.mp4')); // l'esistente NON è stato sovrascritto
  const s1 = await esegui([{ da: 'A/z.mp4', a: 'B/z.mp4' }], [], deps, { stop: async () => true });
  assert.equal(s1.interrotto, true);
  assert.ok(files.has('A/z.mp4'));
  const s2 = await esegui([{ da: 'A/z.mp4', a: 'B/z.mp4' }], [], { ...deps, adesso: () => ORA + 5 }, { scadenza: ORA });
  assert.equal(s2.interrotto, true);
  assert.ok(files.has('A/z.mp4'));
});

test('annulla: non sovrascrive se il posto d\'origine è stato rioccupato', async () => {
  const { files, deps } = driveFinto([riga('B/x.mp4'), riga('A/x.mp4')]);
  const r = await annulla([{ da: 'A/x.mp4', a: 'B/x.mp4' }], deps);
  assert.deepEqual(r, { rimessi: 0, saltati: 1 });
  assert.ok(files.has('A/x.mp4') && files.has('B/x.mp4'));
});

test('esito per la Fabbrica: nello stesso formato dell\'Ispettore di prima; i prodotti già montati sono «fatta»', () => {
  const e = esitoPerFabbrica([{ cartella: 'Anker powerbank', parlato: 4 }, { cartella: 'Ajazz AK820', parlato: 2 }, { cartella: 'Solo B-roll', parlato: 0 }], ['ajazz ak820']);
  assert.deepEqual(Object.keys(e.cartelle), ['Anker powerbank', 'Ajazz AK820']);
  assert.deepEqual({ c: e.cartelle['Anker powerbank'].colore, t: e.cartelle['Anker powerbank'].tipo, n: e.cartelle['Anker powerbank'].clip }, { c: 'verde', t: 'recensione', n: 4 });
  assert.equal(e.cartelle['Ajazz AK820'].colore, 'fatta');
});

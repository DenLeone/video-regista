import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spostaGancio } from './regista.mjs';

// il discorso del FIFINE AM8 (16/11): l'apertura debole, la frase forte a metà
const frasi = [
  { id: 'F001', testo: 'Ho appena sbustato questo Fifine AM8' },
  { id: 'F002', testo: 'sembra tenere abbastanza bene l\'audio.' },
  { id: 'F007', testo: 'Il prezzo è ultra competitivo perché' },
  { id: 'F008', testo: 'a 50€ vi portate a casa un mic che è di qualità semi-professionale' },
  { id: 'F009', testo: 'Quindi se volete aumentare il livello' },
];
const seq = frasi.map((f) => ({ frase: f.id }));

test('il gancio va in apertura e il pezzo che lo introduceva esce', () => {
  const g = spostaGancio(seq, { gancio: 'F008', sequenza: [] }, frasi);
  assert.deepEqual(g.seq.map((x) => x.frase), ['F008', 'F001', 'F002', 'F009']);
  assert.match(g.avviso, /tolto F007/);
});

test('un gancio che rimanda a prima non si sposta, se non parte dalla parola giusta', () => {
  assert.deepEqual(spostaGancio(seq, { gancio: 'F009', sequenza: [] }, frasi).seq, seq);
  const conParola = spostaGancio(seq, { gancio: 'F009', sequenza: [{ frase: 'F009', da_parola: 'se volete' }] }, frasi);
  assert.equal(conParola.seq[0].frase, 'F009');
});

test('senza gancio, o con il gancio già in apertura, non cambia niente', () => {
  assert.deepEqual(spostaGancio(seq, {}, frasi).seq, seq);
  assert.deepEqual(spostaGancio(seq, { gancio: 'F001' }, frasi).seq, seq);
  assert.deepEqual(spostaGancio(seq, { gancio: 'F099' }, frasi).seq, seq);
});

test('nelle correzioni i pezzi separati dalla loro continuazione tornano al loro posto (FIFINE v2)', async () => {
  const { controllaFilo } = await import('./regista.mjs');
  // con i tempi: «continua nella successiva» = stessa voce, senza punto, pausa sotto 0,8 s
  const t = [
    { id: 'F001', testo: 'Ho appena sbustato questo Fifine AM8', inizio: 0, fine: 2 },
    { id: 'F002', testo: "sembra tenere abbastanza bene l'audio.", inizio: 2.2, fine: 4 },
    { id: 'F007', testo: 'Il prezzo è ultra competitivo perché', inizio: 10, fine: 12 },
    { id: 'F008', testo: 'a 50€ vi portate a casa un mic che è di qualità semi-professionale', inizio: 12.2, fine: 15 },
    { id: 'F009', testo: 'Quindi se volete aumentare il livello', inizio: 15.3, fine: 17 },
    { id: 'F010', testo: "questo qua è un ottimo prodotto anche perché ha l'entrata anche XLR.", inizio: 17.2, fine: 20 },
  ].map((f) => ({ ...f, principale: 'A' }));
  const v2 = ['F008', 'F009', 'F001', 'F002', 'F007', 'F010'].map((frase) => ({ frase }));
  const { seq, tolti, spostati } = controllaFilo(v2, t);
  assert.deepEqual(seq.map((x) => x.frase), ['F008', 'F001', 'F002', 'F009', 'F010']);
  assert.deepEqual(tolti, ['F007']);
  assert.deepEqual(spostati, ['F009']);
  // l'ordine giusto non si tocca
  assert.deepEqual(controllaFilo(t.map((f) => ({ frase: f.id })), t).tolti, []);
  // uno spostamento voluto (frase completa, col punto) resta: «chiudi con l'audio»
  const voluto = ['F001', 'F007', 'F008', 'F009', 'F010', 'F002'].map((frase) => ({ frase }));
  const r = controllaFilo(voluto, t);
  assert.deepEqual(r.seq.map((x) => x.frase), ['F001', 'F007', 'F008', 'F009', 'F010', 'F002']);
});

// 🧹 la coda finale e 📖 le parole corrette (16/11, FIFINE: «…è il mutuo quindi»)
const paroleDi = (testo, da) => testo.split(' ').map((w, i) => ({ w, s: da + i * 0.4, e: da + i * 0.4 + 0.3 }));
const analisiFinale = () => {
  const f1 = 'A 50 euro vi portate a casa un microfono.', f2 = 'una cosa utile è il mutuo quindi';
  return { fps: 30, sorgenti: [{ id: 'A', file: 'a.mp4', principale: true, tipo: 'video', durata: 20, orient: 'v', parole: [...paroleDi(f1, 0), ...paroleDi(f2, 4)] }],
    frasi: [{ id: 'F001', principale: 'A', inizio: 0, fine: 3.6, testo: f1 }, { id: 'F002', principale: 'A', inizio: 4, fine: 6.8, testo: f2 }] };
};

test('l\'ultima frase non finisce più su «quindi»', async () => {
  const { risolviRegia } = await import('./regia.mjs');
  const { piano, avvisi } = risolviRegia({ sequenza: [{ frase: 'F001', camera: 'A' }, { frase: 'F002', camera: 'A' }], keywords: [] }, analisiFinale());
  assert.ok(avvisi.some((a) => /tolto «quindi»/.test(a)), avvisi.join(' | '));
  assert.match(piano.testo, /è il mutuo$/);
  assert.ok(!piano.parole.some((p) => /quindi/i.test(p.w)));
});

test('le parole sbagliate si correggono nei sottotitoli e nel testo, con punteggiatura e maiuscola', async () => {
  const { applicaParole } = await import('./regista.mjs');
  const piano = { testo: 'è il mutuo. Mutuo!', parole: [{ w: 'il' }, { w: 'mutuo.' }, { w: 'Mutuo!' }] };
  const regia = { testo_montato: 'è il mutuo.' };
  const fatte = applicaParole(piano, regia, [{ sbagliata: 'mutuo', giusta: 'muto' }, { sbagliata: 'due parole', giusta: 'x' }, { sbagliata: 'il', giusta: 'il' }]);
  assert.deepEqual(piano.parole.map((p) => p.w), ['il', 'muto.', 'Muto!']);
  assert.equal(piano.testo, 'è il muto. Muto!');
  assert.equal(regia.testo_montato, 'è il muto.');
  assert.equal(fatte.length, 1);
});

test('gancio di più pezzi (Skill, 19/11): «cos\'è» + «dove lo trovi» in testa, nell\'ordine scritto', async () => {
  const { idGancio } = await import('./regista.mjs');
  assert.deepEqual(idGancio(['F6', 'F003']), ['F006', 'F003']);
  assert.deepEqual(idGancio('F006, F007 F003'), ['F006', 'F007', 'F003']);
  const fr = [
    { id: 'F001', testo: 'siccome io odio quelli che vi dicono commenta' },
    { id: 'F003', testo: 'lo trovate già nel mio link in bio' },
    { id: 'F006', testo: 'una skill che' },
    { id: 'F007', testo: 'vi permette di avere qualsiasi motion graphics' },
    { id: 'F011', testo: 'poche parole gli insegnate' },
  ];
  const s = fr.map((f) => ({ frase: f.id }));
  const g = spostaGancio(s, { gancio: ['F006', 'F007', 'F003'], sequenza: [] }, fr);
  assert.deepEqual(g.seq.map((x) => x.frase), ['F006', 'F007', 'F003', 'F001', 'F011']);
  assert.match(g.avviso, /F006 \+ F007 \+ F003/);
  // già in testa: niente
  assert.deepEqual(spostaGancio(g.seq, { gancio: 'F006,F007,F003' }, fr).seq, g.seq);
  // il primo pezzo rimanda a prima: non si sposta niente
  const fr2 = fr.map((f) => (f.id === 'F006' ? { ...f, testo: 'quindi una skill che' } : f));
  assert.deepEqual(spostaGancio(s, { gancio: ['F006', 'F003'] }, fr2).seq, s);
});

test('3 ganci: solo se Denis lo chiede; il brief della variante porta gancio, numero e le prossime', async () => {
  const { vuoleTreGanci, briefVariante } = await import('./regista.mjs');
  assert.equal(vuoleTreGanci('Stile: Ultron\n3 ganci'), true);
  assert.equal(vuoleTreGanci('tre ganci per favore'), true);
  assert.equal(vuoleTreGanci('Stile: Ultra'), false);
  const b = briefVariante('Ultron', ['F015', 'F016'], 2, [['F020']]);
  assert.equal(b, 'Stile: Ultron\nGancio: F015, F016\nVariante: 2\nGanci dopo: [["F020"]]');
  assert.equal(briefVariante('Ultra', 'F020', 3, []), 'Stile: Ultra\nGancio: F020\nVariante: 3');
});

test('3 ganci: un giro «render» con «Gancio:» nel brief è una variante', async () => {
  const { execFileSync } = await import('node:child_process');
  const leggi = (env) => execFileSync(process.execPath, ['--input-type=module', '-e', "const m = await import('./scripts/regista.mjs'); console.log(JSON.stringify(m.VARIANTE))"], { encoding: 'utf8', env: { ...process.env, ...env } }).trim().split('\n').pop();
  assert.equal(leggi({ AZIONE: 'render', BRIEF_EXTRA: 'Stile: Ultron\nGancio: F015, F016\nVariante: 2\nGanci dopo: [["F020"]]' }), '{"gancio":"F015, F016","n":2,"dopo":[["F020"]]}');
  assert.equal(leggi({ AZIONE: 'monta', BRIEF_EXTRA: 'Gancio: F015' }), 'null');
});

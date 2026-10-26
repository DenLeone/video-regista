import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FASI_APP, faseAttuale, minutiMancanti, motivoChiaro, nomeRiprovabile, schedaFasi, testoMancano } from '../src/stato-giro';

test('prima dei messaggi del giro si è ancora all’installazione', () => {
  assert.equal(faseAttuale(undefined, true), 'installazione');
  assert.equal(faseAttuale(undefined, false), 'installazione');
  const fasi = schedaFasi({ inCoda: true });
  assert.equal(fasi[0].ora, true);
  assert.equal(fasi[0].fatta, false);
  assert.equal(fasi.filter((f) => f.fatta).length, 0);
  assert.equal(minutiMancanti(undefined, true), 26);
  assert.equal(testoMancano(26), 'Mancano circa 26 min');
});

test('a metà render le fasi prima sono fatte e ne mancano circa sei minuti', () => {
  const fasi = schedaFasi({ corrente: 'render', fasi: { render: '39 secondi' } });
  assert.deepEqual(fasi.map((f) => f.id), FASI_APP.map((f) => f.id));
  assert.equal(fasi.find((f) => f.id === 'tagli')?.fatta, true);
  assert.equal(fasi.find((f) => f.id === 'render')?.ora, true);
  assert.equal(fasi.find((f) => f.id === 'render')?.dettaglio, '39 secondi');
  assert.equal(fasi.find((f) => f.id === 'carico')?.fatta, false);
  assert.equal(minutiMancanti('render'), 6);
});

test('un errore tiene la fase in cui si è fermato e il motivo in italiano', () => {
  const fasi = schedaFasi({ corrente: 'prepara', fine: 'ko' });
  assert.equal(fasi.find((f) => f.id === 'prepara')?.ko, true);
  assert.equal(fasi.find((f) => f.id === 'prepara')?.ora, false);
  assert.equal(motivoChiaro('Errore: Non trovo la cartella "Anime" in 01 · Da editare.\n\naltro'), 'Non trovo la cartella "Anime" in 01 · Da editare.');
  assert.match(motivoChiaro('', 'failure'), /installazione/);
  assert.equal(motivoChiaro('', 'cancelled'), 'Il giro è stato annullato.');
  assert.equal(nomeRiprovabile('Anime'), true);
  assert.equal(nomeRiprovabile('—'), false);
  assert.equal(nomeRiprovabile('⚡ cartelle con VAI'), false);
});

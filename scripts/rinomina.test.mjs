import assert from 'node:assert/strict';
import { test } from 'node:test';
import { controlla, rinomina } from './rinomina.mjs';

// Drive in memoria: cartella → nome → id
function drive(file, { rompiA = null } = {}) {
  const d = new Map(Object.entries(file).map(([n, id]) => [n, id]));
  let mosse = 0;
  const rclone = (cmd, ...a) => {
    if (cmd === 'lsjson') return JSON.stringify([...d.keys()].map((Name) => ({ Name })));
    if (cmd === 'moveto') {
      mosse++;
      if (rompiA && mosse === rompiA) throw new Error('rotto');
      const da = a[0].split('/').pop(), a2 = a[1].split('/').pop();
      if (!d.has(da)) throw new Error('manca');
      if (d.has(a2)) throw new Error('sovrascriverebbe');
      d.set(a2, d.get(da)); d.delete(da);
      return '';
    }
    throw new Error(`comando ${cmd}`);
  };
  return { d, rclone };
}

test('controlla: nomi mancanti, doppi, già presi', () => {
  const p = ['a.jpg', 'b.jpg', 'c.jpg'];
  assert.equal(controlla(p, { 'a.jpg': 'x.jpg' }), null);
  assert.match(controlla(p, {}), /nessun nome/);
  assert.match(controlla(p, { 'z.jpg': 'x.jpg' }), /non c'è/);
  assert.match(controlla(p, { 'a.jpg': 'x.jpg', 'b.jpg': 'x.jpg' }), /stesso nome/);
  assert.match(controlla(p, { 'a.jpg': 'c.jpg' }), /già preso/);
  assert.match(controlla(p, { 'a.jpg': '../x.jpg' }), /non valido/);
  // scambio e catena: i nomi nuovi sono nomi vecchi che cambiano a loro volta → permesso
  assert.equal(controlla(p, { 'a.jpg': 'b.jpg', 'b.jpg': 'a.jpg' }), null);
  assert.equal(controlla(p, { 'a.jpg': 'b.jpg', 'b.jpg': 'c.jpg', 'c.jpg': 'd.jpg' }), null);
});

test('rinomina: scambi e catene, stessi file (stesso id), niente perso', () => {
  const { d, rclone } = drive({ '05_2022.jpg': 1, '06_2023.jpg': 2, '07_2020.jpg': 3, '08_lutero.jpg': 4, '09_saturnali.jpg': 5, '01_altro.jpg': 6 });
  const n = rinomina({ rclone, cartella: 'Natale', mappa: {
    '07_2020.jpg': '05_2020.jpg', '05_2022.jpg': '06_2022.jpg', '06_2023.jpg': '07_2023.jpg',
    '09_saturnali.jpg': '08_saturnali.jpg', '08_lutero.jpg': '09_lutero.jpg' } });
  assert.equal(n, 5);
  assert.deepEqual([...d.entries()].sort(), [['01_altro.jpg', 6], ['05_2020.jpg', 3], ['06_2022.jpg', 1], ['07_2023.jpg', 2], ['08_saturnali.jpg', 5], ['09_lutero.jpg', 4]]);
});

test('rinomina: se una mossa fallisce i nomi tornano come prima', () => {
  const file = { 'a.jpg': 1, 'b.jpg': 2, 'c.jpg': 3 };
  for (const rompiA of [2, 4, 6]) {
    const { d, rclone } = drive(file, { rompiA });
    assert.throws(() => rinomina({ rclone, cartella: 'Natale', mappa: { 'a.jpg': 'b.jpg', 'b.jpg': 'c.jpg', 'c.jpg': 'a.jpg' } }), /tornati come prima/);
    assert.deepEqual([...d.entries()].sort(), [['a.jpg', 1], ['b.jpg', 2], ['c.jpg', 3]], `mossa ${rompiA}`);
  }
});

test('rinomina: cartella fuori posto o mappa sbagliata non tocca niente', () => {
  const { d, rclone } = drive({ 'a.jpg': 1 });
  assert.throws(() => rinomina({ rclone, cartella: '../Altro', mappa: { 'a.jpg': 'b.jpg' } }), /cartella non valida/);
  assert.throws(() => rinomina({ rclone, cartella: 'Natale', mappa: { 'x.jpg': 'b.jpg' } }), /non c'è/);
  assert.deepEqual([...d.entries()], [['a.jpg', 1]]);
});

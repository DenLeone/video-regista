import assert from 'node:assert/strict';
import { test } from 'node:test';
import { briefVocale, capisciVocale, pulisciComando, riepilogoVocale, trascriviVocale } from '../src/vocale';

const STILI = ['Cinematico', 'Kal', 'Ultra'];

test('il comando di monta tiene stile, senza tagli e musica; lo stile si aggancia a quelli veri', () => {
  const c = pulisciComando({ azione: 'monta', cartella: 'Stuzzicadenti', stile: 'ultra', senza_tagli: true, musica: 'Sly and Nimble', note: '' }, STILI);
  assert.deepEqual(c, { azione: 'monta', cartella: 'Stuzzicadenti', stile: 'Ultra', senza_tagli: true, musica: 'Sly and Nimble' });
  assert.equal(briefVocale(c, 'Kal'), 'Stile: Ultra. Musica: Sly and Nimble. senza tagli');
  assert.equal(briefVocale({ azione: 'monta', cartella: 'X' }, 'Kal'), 'Stile: Kal');
});

test('senza cartella, con azione sconosciuta o correzione vuota non è un comando', () => {
  assert.equal(pulisciComando({ azione: 'monta' }, STILI).azione, 'nessuna');
  assert.equal(pulisciComando({ azione: 'balla', cartella: 'X' }, STILI).azione, 'nessuna');
  assert.equal(pulisciComando({ azione: 'correggi', cartella: 'X' }, STILI).azione, 'nessuna');
  assert.equal(pulisciComando({ azione: 'monta', cartella: 'X', stile: 'Inventato' }, STILI).stile, undefined);
});

test('il riepilogo dice cosa farà', () => {
  const r = riepilogoVocale({ azione: 'monta', cartella: 'Luce <tv>', senza_tagli: true }, 'Kal', (s) => s.replace(/</g, '&lt;'));
  assert.match(r, /Luce &lt;tv>/);
  assert.match(r, /Kal<\/b> \(quello di sempre\)/);
  assert.match(r, /Senza tagli/);
});

test('trascrizione e comando passano da Groq (Whisper e Llama), senza altre chiavi', async () => {
  const chiamate: string[] = [];
  const finto = (async (u: string | URL | Request, o?: RequestInit) => {
    const url = String(u);
    chiamate.push(url.replace(/bot[^/]+/, 'bot…'));
    if (url.includes('getFile')) return new Response(JSON.stringify({ result: { file_path: 'voice/a.oga' } }));
    if (url.includes('/file/bot')) return new Response(new Uint8Array([1, 2, 3]));
    if (url.includes('transcriptions')) return new Response(JSON.stringify({ text: ' monta stuzzicadenti in ultra senza tagli ' }));
    const corpo = JSON.parse(String(o?.body));
    assert.match(corpo.messages[0].content, /Stuzzicadenti \| Luce per tv/);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ azione: 'monta', cartella: 'Stuzzicadenti', stile: 'Ultra', senza_tagli: true }) } }] }));
  }) as typeof fetch;
  const testo = await trascriviVocale(finto, 'g', 'tok', 'id1');
  assert.equal(testo, 'monta stuzzicadenti in ultra senza tagli');
  const c = await capisciVocale(finto, 'g', testo!, ['Stuzzicadenti', 'Luce per tv'], STILI);
  assert.deepEqual(c, { azione: 'monta', cartella: 'Stuzzicadenti', stile: 'Ultra', senza_tagli: true });
  assert.ok(chiamate.every((u) => u.startsWith('https://api.telegram.org/') || u.startsWith('https://api.groq.com/')));
});

test('se Groq non risponde il vocale non diventa un comando', async () => {
  const giu = (async () => new Response('no', { status: 500 })) as typeof fetch;
  assert.deepEqual(await capisciVocale(giu, 'g', 'monta x', [], STILI), { azione: 'nessuna' });
});

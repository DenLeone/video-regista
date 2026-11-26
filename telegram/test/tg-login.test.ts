// Accesso con Telegram: la firma si ricalcola con node:crypto (indipendente dal codice del Worker, che usa WebCrypto).
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { verificaInitData } from '../src/tg-login';

const TOKEN = '123456:ABC-token-finto';
const ADESSO = Date.UTC(2026, 10, 26, 12, 0, 0);
export function firma(campi: Record<string, string>, token = TOKEN): string {
  const controllo = Object.entries(campi).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('\n');
  const segreto = createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = createHmac('sha256', segreto).update(controllo).digest('hex');
  return new URLSearchParams({ ...campi, hash }).toString();
}
const campi = (extra: Record<string, string> = {}) => ({ auth_date: String(ADESSO / 1000 - 60), query_id: 'AAH', user: JSON.stringify({ id: 50, first_name: 'Den' }), ...extra });

test('firma giusta, recente, account permesso: entra', async () => {
  assert.deepEqual(await verificaInitData(firma(campi()), TOKEN, ['50', '51'], ADESSO), { ok: true, id: '50' });
});

test('firma sbagliata (altro token, dati cambiati, hash tolto): rifiutato', async () => {
  const altro = await verificaInitData(firma(campi(), 'altro:token'), TOKEN, ['50'], ADESSO);
  assert.equal(altro.ok, false);
  const manomesso = firma(campi()).replace('%22id%22%3A50', '%22id%22%3A51'); // user.id cambiato dopo la firma
  assert.equal((await verificaInitData(manomesso, TOKEN, ['50', '51'], ADESSO)).ok, false);
  const senza = new URLSearchParams(campi()).toString();
  assert.equal((await verificaInitData(senza, TOKEN, ['50'], ADESSO)).ok, false);
  assert.equal((await verificaInitData('', TOKEN, ['50'], ADESSO)).ok, false);
  assert.equal((await verificaInitData('x'.repeat(5000), TOKEN, ['50'], ADESSO)).ok, false);
});

test('account non permesso o dati vecchi o dal futuro: rifiutato anche con la firma giusta', async () => {
  const estraneo = await verificaInitData(firma(campi({ user: JSON.stringify({ id: 99 }) })), TOKEN, ['50'], ADESSO);
  assert.deepEqual(estraneo, { ok: false, motivo: 'questo account Telegram non è autorizzato' });
  const vecchi = await verificaInitData(firma(campi({ auth_date: String(ADESSO / 1000 - 7200) })), TOKEN, ['50'], ADESSO);
  assert.match((vecchi as { motivo: string }).motivo, /scaduti/);
  const futuro = await verificaInitData(firma(campi({ auth_date: String(ADESSO / 1000 + 3600) })), TOKEN, ['50'], ADESSO);
  assert.equal(futuro.ok, false);
  assert.equal((await verificaInitData(firma(campi({ user: 'non json' })), TOKEN, ['50'], ADESSO)).ok, false);
});

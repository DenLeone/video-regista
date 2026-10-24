import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bytesToB64url, concat, sha256 } from '../src/b64';
import { gestisciApp } from '../src/api';
import type { Imp, Ops, Segreti } from '../src/ops';
import { cborEncode } from '../src/webauthn';

const ORIGIN = 'https://regista.test';

function memoria(): { ops: Ops; db: Map<string, unknown>; telegram: string[] } {
  const db = new Map<string, unknown>();
  const telegram: string[] = [];
  const imp: Imp = { versione: 'stabile', ai: 'gemini', modello: 'sonnet', gemini: 'flash', stile: 'Blueprint', prova: 'manuale' };
  const ops: Ops = {
    chat: () => '8332006597',
    leggi: async <T,>(_e: Segreti, k: string) => db.get(k) as T | undefined,
    scrivi: async (_e, k, v) => { db.set(k, v); },
    cancella: async (_e, k) => { db.delete(k); },
    prepara: async () => {},
    impostazioni: async () => imp,
    salvaImpostazioni: async (_e, v) => { Object.assign(imp, v); },
    stili: () => [{ nome: 'Blueprint', tasto: '📐 Blueprint', cosa: 'tavola tecnica' }],
    cartelle: async () => ({ elenco: ['Prova'], vai: ['Prova'], aggiornato: 1 }),
    richiediElenco: async () => true,
    lancia: async () => null,
    provaRegia: async () => null,
    archivia: async () => null,
    giri: async () => [],
    video: async () => [],
    memo: async () => undefined,
    scriviMemo: async () => {},
    card: async () => undefined,
    pendenti: async () => [],
    collegamenti: async () => ({ ig: false, prova: 'manuale', provaNome: 'A mano' }),
    confermaPubblicazione: async () => null,
    inviaTelegram: async (_e, t) => { telegram.push(t); },
    nomeStile: (n) => n || undefined,
    componiBrief: () => 'Stile: Blueprint',
    conAltroStile: (b) => b || '',
    conStile: (b) => b,
    PROVA_S: 10,
    url97: 'https://drive.example/97',
    url98: 'https://drive.example/98',
    regia: async () => undefined,
  };
  return { ops, db, telegram };
}

function env(extra: Partial<Segreti> = {}): Segreti {
  return {
    TELEGRAM_BOT_TOKEN: 't', TELEGRAM_SECRET: 's', ALLOWED_CHAT_ID: '8332006597,933961188',
    GITHUB_TOKEN: 'g', GITHUB_REPO: 'DenLeone/video-regista', NOTIFY_TOKEN: 'n',
    APP_SETUP_CODE: 'SEGRETO-DENIS',
    R2_ACCOUNT_ID: 'a'.repeat(32), R2_ACCESS_KEY_ID: 'AKIATEST', R2_SECRET_ACCESS_KEY: 'secretsecretsecret',
    R2_BUCKET: 'regista-inbox',
    ...extra,
  };
}

function chiama(ops: Ops, e: Segreti, path: string, method = 'GET', body?: unknown, cookie?: string) {
  return gestisciApp(new Request(ORIGIN + path, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), e, ops);
}

async function passkeyFinta(challenge: string) {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const b64urlTo = (s: string) => {
    const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  };
  const x = b64urlTo(jwk.x || '');
  const y = b64urlTo(jwk.y || '');
  const credId = crypto.getRandomValues(new Uint8Array(16));
  const cose = new Map<number, Uint8Array | number>();
  cose.set(1, 2); cose.set(3, -7); cose.set(-1, 1); cose.set(-2, x); cose.set(-3, y);
  const authData = concat([
    await sha256('regista.test'), new Uint8Array([0x45]), new Uint8Array(4), new Uint8Array(16),
    new Uint8Array([0, credId.length]), credId, cborEncode(cose),
  ]);
  const att = new Map<string, Uint8Array | string | Map<string, string>>();
  att.set('fmt', 'none'); att.set('attStmt', new Map()); att.set('authData', authData);
  const clientDataJSON = new TextEncoder().encode(JSON.stringify({ type: 'webauthn.create', challenge, origin: ORIGIN }));
  return {
    id: bytesToB64url(credId),
    response: { clientDataJSON: bytesToB64url(clientDataJSON), attestationObject: bytesToB64url(cborEncode(att)) },
  };
}

test('auth, blocco del secondo iPhone e caricamento che non rimanda i pezzi fatti', async () => {
  const { ops, telegram } = memoria();
  const e = env();
  const originale = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const u = String(input);
    if (u.includes('cors')) return new Response('<ok/>', { status: 200 });
    if (u.includes('uploads')) return new Response('<InitiateMultipartUploadResult><UploadId>UP123</UploadId></InitiateMultipartUploadResult>', { status: 200 });
    return new Response('no', { status: 500 });
  }) as typeof fetch;
  try {
    const anon = await chiama(ops, e, '/api/home');
    assert.equal(anon.status, 401);

    const codice = await chiama(ops, e, '/api/auth/codice', 'POST', {});
    assert.equal(codice.status, 200);
    const testo = /<code>([^<]+)<\/code>/.exec(telegram[0] || '')?.[1] || '';
    assert.match(testo, /^[A-Z0-9]{4}-[A-Z0-9]{4}$/);

    const opz = await chiama(ops, e, '/api/auth/registrazione/opzioni', 'POST', { codice: testo });
    assert.equal(opz.status, 200);
    const sfida = await opz.json() as { sfida: string; publicKey: { challenge: string } };
    const cred = await passkeyFinta(sfida.publicKey.challenge);
    const ver = await chiama(ops, e, '/api/auth/registrazione/verifica', 'POST', { sfida: sfida.sfida, id: cred.id, response: cred.response });
    assert.equal(ver.status, 200);
    const cookie = ver.headers.get('set-cookie')?.split(';')[0];
    assert.ok(cookie?.startsWith('__Host-regista='));

    const diNuovo = await chiama(ops, e, '/api/auth/codice', 'POST', {});
    assert.equal(diNuovo.status, 403);
    const senza = await chiama(ops, e, '/api/auth/registrazione/opzioni', 'POST', { codice: testo });
    assert.equal(senza.status, 401);
    const conSegreto = await chiama(ops, e, '/api/auth/registrazione/opzioni', 'POST', { codice: 'SEGRETO-DENIS' });
    assert.equal(conSegreto.status, 200);

    const home = await chiama(ops, e, '/api/home', 'GET', undefined, cookie);
    assert.equal(home.status, 200);

    const inizio = await chiama(ops, e, '/api/upload/inizia', 'POST', {
      nome: 'Benchy', modalita: 'scelti',
      file: [{ nome: 'IMG_20261022.mov', size: 20 * 1024 * 1024, tipo: 'video/quicktime' }],
    }, cookie);
    assert.equal(inizio.status, 200);
    const avvio = await inizio.json() as { upload: { id: string; file: { nome: string; fatteNumeri: number[] }[] }; url: { pezzi: { n: number }[] }[] };
    assert.equal(avvio.upload.file[0].nome, 'IMG_20261022.mov');
    assert.deepEqual(avvio.upload.file[0].fatteNumeri, []);
    assert.ok(avvio.url[0].pezzi.length >= 1);
    const id = avvio.upload.id;

    const segna = await chiama(ops, e, `/api/upload/${id}/parte`, 'POST', { nome: 'IMG_20261022.mov', numero: 1, etag: '"etag-1"' }, cookie);
    assert.equal(segna.status, 200);
    const url = await chiama(ops, e, `/api/upload/${id}/url`, 'POST', { nome: 'IMG_20261022.mov', parti: [1, 2] }, cookie);
    const pezzi = await url.json() as { pezzi: { n: number }[] };
    assert.deepEqual(pezzi.pezzi.map((p) => p.n), [2]);
    const stato = await chiama(ops, e, `/api/upload/${id}`, 'GET', undefined, cookie);
    const riassunto = await stato.json() as { file: { fatteNumeri: number[] }[] };
    assert.deepEqual(riassunto.file[0].fatteNumeri, [1]);

    const rif = await chiama(ops, e, '/api/upload/inizia', 'POST', {
      nome: 'Riferimento', riferimento: true,
      file: [{ nome: 'reel.mp4', size: 12 * 1024 * 1024, tipo: 'video/mp4' }],
    }, cookie);
    assert.equal(rif.status, 200);
    const dopo = await chiama(ops, e, '/api/home', 'GET', undefined, cookie);
    const homeJson = await dopo.json() as { upload: { id: string } | null };
    assert.equal(homeJson.upload?.id, id);
  } finally {
    globalThis.fetch = originale;
  }
});

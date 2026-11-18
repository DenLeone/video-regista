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
    chat: () => '111111111',
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
    anticipa: async () => null,
    allaSquadra: async () => null,
    studiaStile: async () => null,
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
    TELEGRAM_BOT_TOKEN: 't', TELEGRAM_SECRET: 's', ALLOWED_CHAT_ID: '111111111,222222222',
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
  const logErrori: string[] = [];
  const consoleOrig = console.error;
  console.error = (...a: unknown[]) => { logErrori.push(a.map(String).join(' ')); };
  const chiamate: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input);
    chiamate.push(`${init?.method || 'GET'} ${u}`);
    if (/[?&]cors=/.test(u) || u.includes('lifecycle')) return new Response('AccessDenied', { status: 403 });
    if (u.includes('uploads=')) return new Response('<InitiateMultipartUploadResult><UploadId>UP123</UploadId></InitiateMultipartUploadResult>', { status: 200 });
    if ((init?.method || 'GET') === 'POST' && u.includes('uploadId=')) return new Response('<CompleteMultipartUploadResult/>', { status: 200 });
    if ((init?.method || 'GET') === 'PUT') return new Response('', { status: 200 });
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
    const avvio = await inizio.json() as { upload: { id: string; file: { nome: string; fatteNumeri: number[] }[] }; url: { pezzi: { n: number; url: string }[] }[] };
    assert.equal(avvio.upload.file[0].nome, 'IMG_20261022.mov');
    assert.deepEqual(avvio.upload.file[0].fatteNumeri, []);
    assert.ok(avvio.url[0].pezzi.length >= 1);
    const firmato = new URL(avvio.url[0].pezzi[0].url);
    assert.equal(firmato.searchParams.has('cors'), false);
    assert.equal(firmato.searchParams.has('lifecycle'), false);
    assert.match(firmato.pathname, /\/inbox\//);
    assert.equal(firmato.searchParams.get('X-Amz-Algorithm'), 'AWS4-HMAC-SHA256');
    const id = avvio.upload.id;

    const segna = await chiama(ops, e, `/api/upload/${id}/parte`, 'POST', { nome: 'IMG_20261022.mov', numero: 1, etag: '"etag-1"' }, cookie);
    assert.equal(segna.status, 200);
    const url = await chiama(ops, e, `/api/upload/${id}/url`, 'POST', { nome: 'IMG_20261022.mov', parti: [1, 2] }, cookie);
    const pezzi = await url.json() as { pezzi: { n: number }[] };
    assert.deepEqual(pezzi.pezzi.map((p) => p.n), [2]);
    const stato = await chiama(ops, e, `/api/upload/${id}`, 'GET', undefined, cookie);
    const riassunto = await stato.json() as { file: { fatteNumeri: number[]; totale: number }[] };
    assert.deepEqual(riassunto.file[0].fatteNumeri, [1]);
    for (let n = 2; n <= riassunto.file[0].totale; n++) {
      const altro = await chiama(ops, e, `/api/upload/${id}/parte`, 'POST', { nome: 'IMG_20261022.mov', numero: n, etag: `"etag-${n}"` }, cookie);
      assert.equal(altro.status, 200);
    }
    const fine = await chiama(ops, e, `/api/upload/${id}/completa`, 'POST', { nome: 'IMG_20261022.mov' }, cookie);
    assert.equal(fine.status, 200);
    assert.equal(((await fine.json()) as { pronto: boolean }).pronto, true);

    const rif = await chiama(ops, e, '/api/upload/inizia', 'POST', {
      nome: 'Riferimento', riferimento: true,
      file: [{ nome: 'reel.mp4', size: 12 * 1024 * 1024, tipo: 'video/mp4' }],
    }, cookie);
    assert.equal(rif.status, 200);
    const dopo = await chiama(ops, e, '/api/home', 'GET', undefined, cookie);
    const homeJson = await dopo.json() as { upload: { id: string } | null };
    assert.equal(homeJson.upload?.id, id);
    // 👥 Alla Squadra: solo a caricamento finito, una volta sola, con nome e id del caricamento
    const squadra: string[][] = [];
    ops.allaSquadra = async (_e, c, r) => { squadra.push([c, r]); return null; };
    const nessuno = await chiama(ops, e, '/api/squadra', 'POST', { r2: 'inesistente123' }, cookie);
    assert.equal(nessuno.status, 400);
    const via = await chiama(ops, e, '/api/squadra', 'POST', { r2: id }, cookie);
    assert.equal(via.status, 200);
    assert.deepEqual(squadra, [['Benchy', id]]);
    const doppio = await chiama(ops, e, '/api/squadra', 'POST', { r2: id }, cookie);
    assert.equal(doppio.status, 409);
    assert.equal(squadra.length, 1);
    assert.equal(chiamate.some((c) => /[?&]cors=/.test(c) || c.includes('lifecycle')), false);
    assert.ok(chiamate.some((c) => c.startsWith('POST ') && c.includes('/inbox/') && c.includes('uploads=')));
    assert.ok(chiamate.some((c) => c.startsWith('POST ') && c.includes('/inbox/') && c.includes('uploadId=')));
    assert.equal(logErrori.some((r) => /AccessDenied|IMG_|Benchy|reel/i.test(r)), false);
  } finally {
    console.error = consoleOrig;
    globalThis.fetch = originale;
  }
});

test('📲 Comandi: chiave, file interi su R2, poi Squadra / montaggio / solo caricato', async () => {
  const { ops, db } = memoria();
  const e = env();
  const chiave = 'C'.repeat(43);
  const { sha256Hex } = await import('../src/b64');
  db.set('app:comandi', { impronta: await sha256Hex(chiave), creata: 1 });
  const pesi = new Map<string, number>();
  const squadra: string[][] = [], lanci: unknown[] = [], anticipi: string[] = [];
  ops.allaSquadra = async (_e, c, r) => { squadra.push([c, r]); return null; };
  ops.lancia = async (_e, i) => { lanci.push(i); return null; };
  ops.anticipa = async (_e, c) => { anticipi.push(c); return null; };
  const originale = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = new URL(String(input));
    if ((init?.method || 'GET') === 'HEAD') {
      const p = pesi.get(decodeURIComponent(u.pathname.split('/').slice(2).join('/')));
      return p == null ? new Response(null, { status: 404 }) : new Response(null, { status: 200, headers: { 'content-length': String(p) } });
    }
    return new Response('', { status: 200 });
  }) as typeof fetch;
  const post = (path: string, body: unknown, k = chiave) => gestisciApp(new Request(ORIGIN + path, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${k}` }, body: JSON.stringify(body),
  }), e, ops);
  try {
    assert.equal((await post('/api/comandi/inizia', { nome: 'X' }, 'sbagliata'.repeat(5))).status, 401);
    assert.equal((await gestisciApp(new Request(ORIGIN + '/api/comandi/inizia', { method: 'POST', body: '{}' }), e, ops)).status, 401);

    const avvio = await (await post('/api/comandi/inizia', { nome: 'Ajazz AK820' })).json() as { id: string };
    const f1 = await (await post('/api/comandi/file', { id: avvio.id, file: 'C1293.mov', size: 1000 })).json() as { nome: string; url: string };
    const f2 = await (await post('/api/comandi/file', { id: avvio.id, file: 'C1293.mov', size: 500 })).json() as { nome: string; url: string };
    assert.equal(f1.nome, 'C1293.mov');
    assert.equal(f2.nome, 'C1293_2.mov', 'stesso nome: non si sovrascrive');
    const firmato = new URL(f1.url);
    assert.equal(firmato.searchParams.has('partNumber'), false);
    assert.equal(firmato.searchParams.get('X-Amz-SignedHeaders'), 'host');
    assert.match(firmato.pathname, new RegExp(`/inbox/${avvio.id}/C1293\\.mov$`));

    // un file arrivato a metà: niente partenza
    pesi.set(`inbox/${avvio.id}/C1293.mov`, 1000);
    pesi.set(`inbox/${avvio.id}/C1293_2.mov`, 200);
    const meta = await post('/api/comandi/fine', { id: avvio.id, dove: 'squadra' });
    assert.equal(meta.status, 409);
    assert.match(((await meta.json()) as { errore: string }).errore, /C1293_2\.mov/);
    assert.equal(squadra.length, 0);

    pesi.set(`inbox/${avvio.id}/C1293_2.mov`, 500);
    const ok = await post('/api/comandi/fine', { id: avvio.id, dove: 'Squadra ' });
    assert.equal(ok.status, 200);
    assert.match(((await ok.json()) as { messaggio: string }).messaggio, /2 clip/);
    assert.deepEqual(squadra, [['Ajazz AK820', avvio.id]]);
    assert.equal((await post('/api/comandi/fine', { id: avvio.id, dove: 'squadra' })).status, 409, 'una volta sola');
    assert.equal((await post('/api/comandi/file', { id: avvio.id, file: 'altro.mov', size: 5 })).status, 409, 'chiuso');

    // nome senza estensione e dimensione scritta come testo (come li manda Comandi)
    const t = await (await post('/api/comandi/inizia', { nome: 'Testo' })).json() as { id: string };
    const ft = await (await post('/api/comandi/file', { id: t.id, file: 'C1294', size: '106 MB' })).json() as { nome: string };
    assert.equal(ft.nome, 'C1294.mov');
    assert.equal((await post('/api/comandi/fine', { id: t.id, dove: 'carica' })).status, 409, 'file non ancora su R2');
    pesi.set(`inbox/${t.id}/C1294.mov`, 777);
    assert.equal((await post('/api/comandi/fine', { id: t.id, dove: 'carica' })).status, 200);

    // montaggio diretto e solo caricato
    const m = await (await post('/api/comandi/inizia', { nome: 'Monta' })).json() as { id: string };
    await post('/api/comandi/file', { id: m.id, file: 'a.mov', size: 10 });
    pesi.set(`inbox/${m.id}/a.mov`, 10);
    assert.equal((await post('/api/comandi/fine', { id: m.id, dove: 'monta' })).status, 200);
    assert.deepEqual(lanci, [{ cartella: 'Monta', brief: 'Stile: Blueprint', r2: m.id }]);
    const c = await (await post('/api/comandi/inizia', { nome: 'Dopo' })).json() as { id: string };
    await post('/api/comandi/file', { id: c.id, file: 'b.mov', size: 10 });
    pesi.set(`inbox/${c.id}/b.mov`, 10);
    assert.equal((await post('/api/comandi/fine', { id: c.id })).status, 200);
    assert.equal(db.get('app:upload_aperto'), c.id);
    assert.deepEqual(anticipi, ['Testo', 'Dopo']);

    // la chiave si crea solo con la sessione dell'app
    assert.equal((await gestisciApp(new Request(ORIGIN + '/api/comandi/chiave', { method: 'POST', body: '{}' }), e, ops)).status, 401);
  } finally { globalThis.fetch = originale; }
});

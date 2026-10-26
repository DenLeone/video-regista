import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chiaveStileR2, contaSalti, nomeStilePulito, preparaStileApp, slugStile } from '../../scripts/stile-app.mjs';
import { leggiStile } from '../../scripts/stile-su-misura.mjs';
import { gestisciApp } from '../src/api';
import type { Ops, Segreti } from '../src/ops';
import { chiediStile } from '../src/stile-ai';
import { correggiStileSalvato, gestisciStile, riceviEsitoStile } from '../src/stile-api';
import {
  audioPulito, diarioStile, fotogrammiPuliti, leggiJsonModello, rigaDiario, riassuntoStile, ritmoSicuro, unisciNomi,
} from '../src/stile-studio';

const STILE = `Nome: Giallo veloce
Quando usarlo: reel tech veloci
Tono: diretto
Apertura: normale
Font apertura: Inter Tight 800
Colore apertura: #FFD86B
Sottotitoli: parola
Font sottotitoli: Montserrat 700
Colore sottotitoli: #FFFFFF
Maiuscolo sottotitoli: no
Posizione sottotitoli: basso
Dimensione sottotitoli: 56
Titoli: sì
Font titoli: Montserrat 900
Colore titoli: #FFFFFF
Colore accento: #FFE62E
Posizione titoli: alto
Look: caldo
Soggetto in risalto: no
Sfondo sfocato: no
Inizio: normale
Tagli dentro le frasi: sì
Chiusura: no
Firma: no
Transizioni: no
Inserti: scheda
B-roll stock: no
Effetti sonori: sì
Musica: no
Volume musica: 12
Ritmo dei tagli: un taglio ogni 1,2 secondi
Inquadrature: punch-in leggero sul volto
Apertura e chiusura: aggancio sul prodotto
Cose da evitare: zoom continuo
Altro: copertina sul primo piano
`;

const FOTO = '/9j/' + 'A'.repeat(90);
const TOKEN = 'sessione-stile-demo-1';

function memoria() {
  const db = new Map<string, unknown>();
  const ops = {
    chat: () => '111111111',
    leggi: async <T,>(_e: Segreti, k: string) => db.get(k) as T | undefined,
    scrivi: async (_e: Segreti, k: string, v: unknown) => { db.set(k, v); },
    cancella: async (_e: Segreti, k: string) => { db.delete(k); },
    prepara: async () => {},
    impostazioni: async () => ({ versione: 'stabile', ai: 'gemini', modello: 'sonnet', gemini: 'flash', stile: 'Blueprint', prova: 'manuale' }),
    salvaImpostazioni: async () => {},
    stili: () => [{ nome: 'Blueprint', tasto: '📐 Blueprint', cosa: 'tavola' }, { nome: 'Cinematico', tasto: '🎬 Cinematico', cosa: 'spot' }],
    cartelle: async () => undefined,
    richiediElenco: async () => false,
    lancia: async () => null,
    provaRegia: async () => null,
    archivia: async () => null,
    studiaStile: async () => null,
    giri: async () => [],
    video: async () => [],
    memo: async () => undefined,
    scriviMemo: async () => {},
    card: async () => undefined,
    pendenti: async () => [],
    collegamenti: async () => ({ ig: false, prova: 'manuale' as const, provaNome: 'A mano' }),
    confermaPubblicazione: async () => null,
    inviaTelegram: async () => {},
    nomeStile: (n?: string) => n,
    componiBrief: () => '',
    conAltroStile: (b?: string) => b || '',
    conStile: (b: string) => b,
    PROVA_S: 10,
    url97: 'https://drive.example/97',
    url98: 'https://drive.example/98',
    regia: async () => undefined,
  } satisfies Ops;
  return { ops, db };
}

function env(extra: Partial<Segreti> = {}): Segreti {
  return {
    TELEGRAM_BOT_TOKEN: 't', TELEGRAM_SECRET: 's', ALLOWED_CHAT_ID: '111111111',
    GITHUB_TOKEN: 'g', GITHUB_REPO: 'DenLeone/video-regista', NOTIFY_TOKEN: 'n',
    GEMINI_API_KEY: 'chiave-test',
    ...extra,
  };
}

let catena: Promise<unknown> = Promise.resolve();
function serie<T>(fn: () => Promise<T>): Promise<T> {
  const fatto = catena.then(fn, fn);
  catena = fatto.then(() => undefined, () => undefined);
  return fatto;
}

function spiaDiario() {
  const righe: string[] = [];
  const originale = console.log;
  console.log = (...a: unknown[]) => {
    const r = a.map(String).join(' ');
    if (r.startsWith('stile ')) righe.push(r);
    originale.apply(console, a);
  };
  return {
    righe,
    ripristina() { console.log = originale; },
  };
}

const RIGA = /^stile fase=(analizza|chat|gemini|claude|voce) esito=(avvio|\d{1,3})$/;
function diariPuliti(righe: string[]) {
  assert.equal(righe.length > 0, true);
  for (const r of righe) {
    assert.match(r, RIGA);
    assert.equal(/segreto|parlato|giallo|trascrizione|chiave|img_|benchy|\.mov|\.mp4/i.test(r), false);
  }
}

function rispostaModello(stile: string, risposta = 'Tagli corti e scritte in basso.') {
  return new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text: JSON.stringify({ risposta, stile }) }] } }],
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}

test('slug, ritmo e stile.txt restano quelli che il montaggio sa leggere', () => {
  assert.equal(slugStile('../../etc/passwd'), 'etc-passwd');
  assert.equal(slugStile('..'), '');
  assert.equal(chiaveStileR2('Caffè caldo'), 'stili/caffe-caldo/stile.txt');
  assert.equal(chiaveStileR2('../segreto'), 'stili/segreto/stile.txt');
  assert.equal(chiaveStileR2(''), '');
  assert.equal(nomeStilePulito('  Giallo  veloce '), 'Giallo veloce');
  assert.equal(nomeStilePulito('a'), '');
  assert.equal(contaSalti([10, 10, 40, 41]), 1);

  const letto = leggiStile(STILE, 'Giallo veloce');
  assert.equal(letto.grafica.sottotitoli, 'parola');
  assert.equal(letto.grafica.coloreSottotitoli, '#FFFFFF');
  // colori sempre naturali (25/10): "Look: caldo" nello stile non cambia il girato
  assert.equal(letto.grafica.look, 'naturale');
  assert.equal(letto.grafica.vignetta, 0);
  assert.match(letto.testoAI, /Ritmo dei tagli/);
  const pronto = preparaStileApp('Giallo veloce', STILE);
  assert.equal(pronto.look12k, false);
  assert.equal(pronto.lookFfmpeg, null);
  assert.match(pronto.testoAI, /punch-in/);
  const teal = preparaStileApp('Notte', STILE.replace('Look: caldo', 'Look: teal e arancio').replace('Musica: no', 'Musica: sì'));
  assert.equal(teal.look12k, false); // anche "teal e arancio" resta naturale
  assert.equal(teal.avvisi.length, 1);

  const ritmo = ritmoSicuro(12.2, 5);
  assert.equal('errore' in ritmo, false);
  if (!('errore' in ritmo)) assert.equal(ritmo.taglioMedio, 2);
  assert.equal('errore' in ritmoSicuro(0, 1), true);
  const troppiFoto = fotogrammiPuliti([FOTO, FOTO, FOTO, FOTO, FOTO, FOTO, FOTO]);
  const enorme = fotogrammiPuliti(['A'.repeat(200000)]);
  assert.equal('errore' in troppiFoto && /Troppi/.test(troppiFoto.errore), true);
  assert.equal('errore' in enorme && /troppo grande/.test(enorme.errore), true);
  assert.equal(audioPulito('A'.repeat(2_100_000)), undefined);

  const conRecinto = leggiJsonModello('```json\n' + JSON.stringify({ risposta: 'Ok.', stile: STILE }) + '\n```');
  assert.equal(conRecinto?.risposta, 'Ok.');
  assert.equal(leggiJsonModello('TRASCRIZIONE SEGRETA senza json'), null);
  assert.match(riassuntoStile(STILE), /#FFFFFF/);
  assert.match(riassuntoStile(STILE), /1,2 secondi/);

  const uniti = unisciNomi(
    [{ nome: 'Blueprint', tasto: 'b', cosa: 'base' }],
    [{ nome: 'Narrativo', cosa: 'dal Drive' }, { nome: 'Blueprint' }],
    [{ nome: 'Giallo veloce', desc: 'reel tech' }, { nome: 'Narrativo', desc: 'non deve vincere' }],
  );
  assert.deepEqual(uniti.map((s) => s.nome), ['Blueprint', 'Narrativo', 'Giallo veloce']);
  assert.equal(uniti[1].cosa, 'dal Drive');
  assert.equal(uniti[2].tasto, '✦ Giallo veloce');
});

test('un errore dell’AI non riporta trascrizione né titolo', async () => serie(async () => {
  const log: string[] = [];
  const originale = console.error;
  console.error = (...a: unknown[]) => { log.push(a.map(String).join(' ')); };
  const diario = spiaDiario();
  try {
    const ko = await chiediStile({
      fetch: async () => new Response('TRASCRIZIONE SEGRETA titolo privato', { status: 500 }),
      geminiKey: 'k',
      prompt: 'dentro c’è TRASCRIZIONE SEGRETA',
      foto: [],
    });
    assert.equal(ko.ok, false);
    if (!ko.ok) assert.equal(/SEGRETA|titolo|TRASCRIZIONE/.test(ko.errore), false);
    const sporco = await chiediStile({
      fetch: async () => new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'niente json, TRASCRIZIONE SEGRETA' }] } }],
      }), { status: 200 }),
      geminiKey: 'k', prompt: 'x', foto: [],
    });
    assert.equal(sporco.ok, false);
    if (!sporco.ok) assert.equal(sporco.errore.includes('SEGRETA'), false);
    assert.equal(log.some((r) => r.includes('SEGRETA')), false);
    assert.equal(log.some((r) => /ha risposto 500|non riuscito \(500\)/.test(r)), true);
    assert.equal(log.some((r) => /illeggibile/.test(r)), true);
  } finally {
    console.error = originale;
    diario.ripristina();
  }
}));

test('analisi, chat, salva, rinomina, duplica, elimina', async () => serie(async () => {
  const { ops, db } = memoria();
  const e = env({ GROQ_API_KEY: 'groq-test' });
  await ops.scrivi(e, `app:sess:${TOKEN}`, { exp: Date.now() + 86_400_000 });
  const cookie = `__Host-regista=${TOKEN}`;
  const anon = await gestisciApp(new Request('https://regista.test/api/stile'), e, ops);
  assert.equal(anon.status, 401);

  const troppi = await gestisciStile(new Request('https://regista.test/api/stile/analizza', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ durata: 8, tagli: 3, fotogrammi: [FOTO, FOTO, FOTO, FOTO, FOTO, FOTO, FOTO] }),
  }), e, ops, '/api/stile/analizza', async () => { throw new Error('non doveva chiamare l’AI'); });
  assert.equal(troppi.status, 400);

  const visti: string[] = [];
  const wav = btoa(String.fromCharCode(...new Uint8Array(1200).fill(3)));
  const rete = async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input);
    const corpo = String(init?.body || '');
    visti.push(u);
    if (u.includes('groq')) return new Response(JSON.stringify({ text: 'parlato segreto del video' }), { status: 200 });
    if (u.includes('anthropic')) return new Response('no', { status: 500 });
    const giallo = /sottotitoli gialli/i.test(corpo);
    if (!giallo) assert.equal(corpo.includes('parlato segreto del video'), true);
    const stile = giallo ? STILE.replace('Colore sottotitoli: #FFFFFF', 'Colore sottotitoli: #FFE62E') : STILE;
    return rispostaModello(stile, giallo ? 'Sottotitoli gialli.' : 'Tagli corti e scritte bianche.');
  };
  const fatto = await gestisciStile(new Request('https://regista.test/api/stile/analizza', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ durata: 9.5, tagli: 4, fotogrammi: [FOTO, FOTO], audio: wav }),
  }), e, ops, '/api/stile/analizza', rete);
  assert.equal(fatto.status, 200);
  const analisi = await fatto.json() as { bozza: { riassunto: string; voce: boolean; quando: number; messaggi: { testo: string }[] } };
  assert.equal(typeof analisi.bozza.quando, 'number');
  assert.equal(analisi.bozza.quando > 0, true);
  assert.equal(analisi.bozza.voce, true);
  assert.match(analisi.bozza.riassunto, /Ritmo/);
  assert.equal(JSON.stringify(analisi).includes('parlato segreto'), false);
  assert.equal(visti.some((u) => u.includes('groq')), true);

  const chat = await gestisciStile(new Request('https://regista.test/api/stile/chat', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ testo: 'sottotitoli gialli' }),
  }), e, ops, '/api/stile/chat', rete);
  const dopoChat = await chat.json() as { bozza: { riassunto: string } };
  assert.match(dopoChat.bozza.riassunto, /#FFE62E/);

  const salva = await gestisciApp(new Request('https://regista.test/api/stile/salva', {
    method: 'POST', headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ nome: 'Giallo veloce' }),
  }), e, ops);
  assert.equal(salva.status, 200);
  const salvato = await salva.json() as { avviso: string; salvati: { nome: string }[] };
  assert.match(salvato.avviso, /Manca R2/);
  assert.equal(salvato.salvati[0].nome, 'Giallo veloce');
  const lista = db.get('app:stili') as { nome: string; testo: string }[];
  assert.equal(lista.length, 1);
  assert.match(lista[0].testo, /Nome: Giallo veloce/);
  assert.equal(lista[0].testo.includes('parlato segreto'), false);

  const base = await gestisciApp(new Request('https://regista.test/api/stile/rinomina', {
    method: 'POST', headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ id: lista[0] && (db.get('app:stili') as { id: string }[])[0].id, nome: 'Blueprint' }),
  }), e, ops);
  assert.equal(base.status, 400);

  const id = (db.get('app:stili') as { id: string }[])[0].id;
  const copia = await gestisciApp(new Request('https://regista.test/api/stile/duplica', {
    method: 'POST', headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ id, nome: 'Giallo copia' }),
  }), e, ops);
  assert.equal(copia.status, 200);
  assert.equal((db.get('app:stili') as unknown[]).length, 2);

  const via = await gestisciApp(new Request('https://regista.test/api/stile/elimina', {
    method: 'POST', headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ id }),
  }), e, ops);
  assert.equal(via.status, 200);
  const resti = db.get('app:stili') as { nome: string }[];
  assert.deepEqual(resti.map((s) => s.nome), ['Giallo copia']);
}));

test('se il telefono si stacca, la bozza resta e il log non ha dati', async () => serie(async () => {
  assert.equal(rigaDiario('analizza', 'avvio'), 'stile fase=analizza esito=avvio');
  assert.equal(rigaDiario('gemini', 502), 'stile fase=gemini esito=502');
  diarioStile('voce', 200);
  const { ops, db } = memoria();
  const e = env();
  const diario = spiaDiario();
  try {
    let sblocca: (r: Response) => void = () => {};
    const rete = () => new Promise<Response>((ok) => { sblocca = ok; });
    const attesi: Promise<unknown>[] = [];
    const pendente = gestisciStile(new Request('https://regista.test/api/stile/analizza', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ durata: 9.5, tagli: 4, fotogrammi: [FOTO, FOTO], audio: 'parlato segreto del video' }),
    }), e, ops, '/api/stile/analizza', rete, { waitUntil(p) { attesi.push(p); } });
    await new Promise((ok) => setTimeout(ok, 30));
    assert.equal(attesi.length, 1);
    assert.equal(db.get('app:stile_bozza'), undefined);
    assert.equal(diario.righe.includes('stile fase=analizza esito=avvio'), true);
    sblocca(rispostaModello(STILE, 'Tagli corti.'));
    const res = await pendente;
    await attesi[0];
    assert.equal(res.status, 200);
    const salvata = db.get('app:stile_bozza') as { quando?: number; testo?: string } | undefined;
    assert.equal(typeof salvata?.quando, 'number');
    assert.equal(String(salvata?.testo || '').includes('parlato segreto'), false);
    diariPuliti(diario.righe);
    assert.equal(diario.righe.includes('stile fase=analizza esito=200'), true);
    assert.equal(diario.righe.some((r) => r.startsWith('stile fase=gemini')), false);

    const letto = await gestisciStile(new Request('https://regista.test/api/stile'), e, ops, '/api/stile');
    const pagina = await letto.json() as { bozza: { quando: number; haTesto: boolean } };
    assert.equal(pagina.bozza.haTesto, true);
    assert.equal(pagina.bozza.quando, salvata?.quando);
  } finally {
    diario.ripristina();
  }
}));

test('Gemini lento o sovraccarico: si passa al Flash Lite, e un 400 riprova senza ragionamento', async () => serie(async () => {
  const chiesti: string[] = [];
  const buono = JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ risposta: 'ok', stile: 'Nome: Prova\nTono: diretto\nSottotitoli: parola\nLook: naturale\nRitmo dei tagli: veloce, un taglio ogni secondo\nInquadrature: volto e dettagli' }) }] } }] });
  const originale = console.error;
  console.error = () => {};
  try {
    const dopo503 = await chiediStile({
      fetch: async (url) => {
        chiesti.push(String(url).split('/models/')[1]);
        return String(url).includes('flash-lite') ? new Response(buono, { status: 200 }) : new Response('', { status: 503 });
      },
      geminiKey: 'k', prompt: 'x', foto: [],
    });
    assert.equal(dopo503.ok, true);
    assert.deepEqual(chiesti, ['gemini-flash-latest:generateContent', 'gemini-flash-lite-latest:generateContent']);
    const corpi: string[] = [];
    const dopo400 = await chiediStile({
      fetch: async (_url, init) => {
        corpi.push(String(init?.body));
        return corpi.length === 1 ? new Response('', { status: 400 }) : new Response(buono, { status: 200 });
      },
      geminiKey: 'k', prompt: 'x', foto: [],
    });
    assert.equal(dopo400.ok, true);
    assert.equal(corpi[0].includes('thinkingConfig'), true);
    assert.equal(corpi[1].includes('thinkingConfig'), false);
  } finally {
    console.error = originale;
  }
}));

test('studio sul video intero: avvio su GitHub, esito in bozza con gli effetti da creare', async () => serie(async () => {
  const { ops, db } = memoria();
  const e = env();
  const avviati: string[] = [];
  const messaggi: string[] = [];
  const o = { ...ops, studiaStile: async (_e: Segreti, r2: string) => { avviati.push(r2); return null; }, inviaTelegram: async (_e: Segreti, t: string) => { messaggi.push(t); } } satisfies Ops;
  const post = (p: string, b: unknown) => gestisciStile(new Request(`https://regista.test${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }), e, o, p);

  db.set('app:upload:rifabcdef12', { riferimento: true, pronto: false });
  assert.equal((await post('/api/stile/video', { upload: 'rifabcdef12' })).status, 409);
  db.set('app:upload:rifabcdef12', { riferimento: true, pronto: true });
  const avvio = await post('/api/stile/video', { upload: 'rifabcdef12' });
  assert.equal(avvio.status, 200);
  assert.deepEqual(avviati, ['rifabcdef12']);
  const inCorso = await (await gestisciStile(new Request('https://regista.test/api/stile'), e, o, '/api/stile')).json() as { analisi: { r2: string } | null };
  assert.equal(inCorso.analisi?.r2, 'rifabcdef12');

  assert.equal((await riceviEsitoStile(e, o, { r2: 'altro12345', ok: true })).status, 409);
  const stile = 'Nome: Polaroid veloce\nTono: ironico\nSottotitoli: parola\nLook: caldo\nTitoli: frasi\nRitmo dei tagli: un taglio al secondo\nInquadrature: volto e dettagli';
  const ok = await riceviEsitoStile(e, o, { r2: 'rifabcdef12', ok: true, stile, risposta: 'Ho visto cornici a polaroid.', daCreare: ['cornice a polaroid che entra ruotando'], durata: 31.2, tagli: 28, taglioMedio: 1.1 });
  assert.equal(ok.status, 200);
  const dopo = await (await gestisciStile(new Request('https://regista.test/api/stile'), e, o, '/api/stile')).json() as { analisi: unknown; bozza: { nome: string; daCreare: string[] } };
  assert.equal(dopo.analisi, null);
  assert.equal(dopo.bozza.nome, 'Polaroid veloce');
  assert.deepEqual(dopo.bozza.daCreare, ['cornice a polaroid che entra ruotando']);
  assert.match(String((db.get('app:stile_bozza') as { testo: string }).testo), /# DA CREARE: cornice a polaroid/);
  assert.equal(messaggi.length, 1);

  db.set('app:stile_analisi', { r2: 'rifabcdef12', quando: Date.now() });
  await riceviEsitoStile(e, o, { r2: 'rifabcdef12', ok: false, errore: 'Gemini non ha elaborato il video' });
  const ko = await (await gestisciStile(new Request('https://regista.test/api/stile'), e, o, '/api/stile')).json() as { analisi: { errore: string } };
  assert.equal(ko.analisi.errore, 'Gemini non ha elaborato il video');
}));

test('correzione di uno stile salvato: sostituisce, toglie, aggiunge e copia su R2', async () => serie(async () => {
  const { ops, db } = memoria();
  const e = env();
  const testo = 'Nome: Cinematic Talk\nTono: calmo\n\n# --- SCRITTE ---\nApertura: normale\nSottotitoli: parola\nTitoli: parole grandi\n\n# --- IMMAGINE ---\nLook: caldo\nChiusura: @_black_den\n\n# --- AUDIO ---\nMusica: sì\nVolume musica: 15\n\n# --- REGIA ---\nRitmo dei tagli: disteso\nInquadrature: piano medio';
  db.set('app:stili', [{ id: 'ct1', nome: 'Cinematic Talk', testo, quando: 1, desc: '' }]);
  assert.equal((await correggiStileSalvato(e, ops, { nome: 'nessuno', campi: {} })).status, 404);
  const r = await correggiStileSalvato(e, ops, { nome: 'cinematic talk', campi: { Apertura: 'grande', 'Font apertura': 'Oswald 700', Chiusura: 'no', Musica: 'no', 'Volume musica': null }, note: ['DA CREARE: invito finale'] });
  assert.equal(r.status, 200);
  const nuovo = (db.get('app:stili') as { testo: string }[])[0].testo;
  assert.match(nuovo, /^Apertura: grande$/m);
  assert.match(nuovo, /^Font apertura: Oswald 700$/m);
  assert.match(nuovo, /^Chiusura: no$/m);
  assert.match(nuovo, /^Musica: no$/m);
  assert.equal(/Volume musica/.test(nuovo), false);
  assert.match(nuovo, /^# DA CREARE: invito finale$/m);
  assert.ok(nuovo.indexOf('Font apertura') < nuovo.indexOf('# --- REGIA'));
}));

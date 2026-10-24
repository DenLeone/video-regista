import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chiaveStileR2, contaSalti, nomeStilePulito, preparaStileApp, slugStile } from '../../scripts/stile-app.mjs';
import { leggiStile } from '../../scripts/stile-su-misura.mjs';
import { gestisciApp } from '../src/api';
import type { Ops, Segreti } from '../src/ops';
import { chiediStile } from '../src/stile-ai';
import { gestisciStile } from '../src/stile-api';
import {
  audioPulito, fotogrammiPuliti, leggiJsonModello, riassuntoStile, ritmoSicuro, unisciNomi,
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
    chat: () => '8332006597',
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
    TELEGRAM_BOT_TOKEN: 't', TELEGRAM_SECRET: 's', ALLOWED_CHAT_ID: '8332006597',
    GITHUB_TOKEN: 'g', GITHUB_REPO: 'DenLeone/video-regista', NOTIFY_TOKEN: 'n',
    GEMINI_API_KEY: 'chiave-test',
    ...extra,
  };
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
  assert.equal(letto.grafica.look, 'caldo');
  assert.match(letto.testoAI, /Ritmo dei tagli/);
  const pronto = preparaStileApp('Giallo veloce', STILE);
  assert.equal(pronto.look12k, false);
  assert.equal(pronto.lookFfmpeg, null);
  assert.match(pronto.testoAI, /punch-in/);
  const teal = preparaStileApp('Notte', STILE.replace('Look: caldo', 'Look: teal e arancio').replace('Musica: no', 'Musica: sì'));
  assert.equal(teal.look12k, true);
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

test('un errore dell’AI non riporta trascrizione né titolo', async () => {
  const log: string[] = [];
  const originale = console.error;
  console.error = (...a: unknown[]) => { log.push(a.map(String).join(' ')); };
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
  } finally {
    console.error = originale;
  }
});

test('analisi, chat, salva, rinomina, duplica, elimina', async () => {
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
  const analisi = await fatto.json() as { bozza: { riassunto: string; voce: boolean; messaggi: { testo: string }[] } };
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
});

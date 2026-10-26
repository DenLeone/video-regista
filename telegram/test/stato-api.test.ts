import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gestisciApp } from '../src/api';
import type { Avvio, CardApp, Giro, MemoApp, Ops, Segreti } from '../src/ops';

function env(): Segreti {
  return {
    TELEGRAM_BOT_TOKEN: 't', TELEGRAM_SECRET: 's', ALLOWED_CHAT_ID: '111111111',
    GITHUB_TOKEN: 'g', GITHUB_REPO: 'DenLeone/video-regista', NOTIFY_TOKEN: 'n',
  };
}

test('lo stato dell’app mostra fase e tempo, e Riprova rilancia gli stessi dati', async () => {
  const db = new Map<string, unknown>();
  const token = 'a'.repeat(24);
  db.set(`app:sess:${token}`, { exp: Date.now() + 1e9 });
  const card: Record<string, CardApp> = {
    '1001': { nome: 'Benchy PETG', fasi: { render: '39 secondi' }, corrente: 'render', minuti: 12 },
    '1002': {
      nome: 'Anime', fasi: { prepara: 'analisi' }, corrente: 'prepara', minuti: 4, fine: 'ko',
      errore: 'Errore: Non trovo la cartella "Anime" in 01 · Da editare.',
    },
    '1003': { nome: '—', fasi: {}, minuti: 1, fine: 'ko' },
  };
  const memo: Record<string, MemoApp> = {
    '1002': { nome: 'Anime', origine: '97', brief: 'Stile: Blueprint' },
    '1003': { nome: '—' },
  };
  const lanci: Avvio[] = [];
  const ora = new Date().toISOString();
  const giri: Giro[] = [
    { id: 1001, status: 'in_progress', conclusion: null, created_at: ora, updated_at: ora, html_url: 'https://github.com/example/1001' },
    { id: 1002, status: 'completed', conclusion: 'failure', created_at: ora, updated_at: ora, html_url: 'https://github.com/example/1002' },
    { id: 1003, status: 'completed', conclusion: 'failure', created_at: ora, updated_at: ora, html_url: 'https://github.com/example/1003' },
  ];
  const ops = {
    chat: () => '111111111',
    leggi: async <T,>(_e: Segreti, k: string) => db.get(k) as T | undefined,
    scrivi: async (_e: Segreti, k: string, v: unknown) => { db.set(k, v); },
    cancella: async () => {},
    prepara: async () => {},
    impostazioni: async () => ({ versione: 'stabile' as const, ai: 'gemini' as const, modello: 'sonnet' as const, gemini: 'flash' as const, stile: 'Blueprint', prova: 'manuale' as const }),
    salvaImpostazioni: async () => {},
    stili: () => [],
    cartelle: async () => ({ elenco: [], vai: [], aggiornato: 0 }),
    richiediElenco: async () => true,
    lancia: async (_e: Segreti, i: Avvio) => { lanci.push(i); return null; },
    provaRegia: async () => null,
    archivia: async () => null,
    studiaStile: async () => null,
    giri: async () => giri,
    video: async () => [],
    memo: async (_e: Segreti, id: string) => memo[id],
    scriviMemo: async () => {},
    card: async (_e: Segreti, id: string) => card[id],
    pendenti: async () => [{ nome: 'In coda', quando: Date.now() }],
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

  const cookie = `__Host-regista=${token}`;
  const req = (path: string, method = 'GET', body?: unknown) => gestisciApp(new Request(`https://regista.test${path}`, {
    method,
    headers: { 'content-type': 'application/json', cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), env(), ops);

  const stato = await (await req('/api/stato')).json() as {
    attivi: { fase: string; mancano: number; mancanoTesto: string; fasi: { id: string; fatta: boolean; ora: boolean }[] }[];
    pendenti: { faseNome: string; mancanoTesto: string }[];
    falliti: { runId: string; errore: string; puoRiprovare: boolean }[];
  };
  assert.equal(stato.attivi[0].fase, 'render');
  assert.equal(stato.attivi[0].mancano, 6);
  assert.equal(stato.attivi[0].mancanoTesto, 'Mancano circa 6 min');
  assert.equal(stato.attivi[0].fasi.find((f) => f.id === 'tagli')?.fatta, true);
  assert.equal(stato.attivi[0].fasi.find((f) => f.id === 'render')?.ora, true);
  assert.equal(stato.pendenti[0].faseNome, 'Installazione');
  assert.equal(stato.pendenti[0].mancanoTesto, 'Mancano circa 26 min');
  const anime = stato.falliti.find((f) => f.runId === '1002');
  assert.equal(anime?.errore, 'Non trovo la cartella "Anime" in 01 · Da editare.');
  assert.equal(anime?.puoRiprovare, true);
  assert.equal(stato.falliti.find((f) => f.runId === '1003')?.puoRiprovare, false);

  const riprova = await req('/api/video/1002', 'POST', { azione: 'riprova' });
  assert.equal(riprova.status, 200);
  assert.deepEqual(lanci[0], {
    cartella: 'Anime', origine: '97', correzione: undefined, brief: 'Stile: Blueprint', azione: undefined, secondi: undefined,
  });
});

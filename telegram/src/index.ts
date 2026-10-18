// Bot Telegram "Regista": il pannello di controllo del montaggio automatico.
// Gira su Cloudflare Workers (sempre acceso, anche a PC spento).
//
//   POST /tg       webhook di Telegram (verificato con il secret token)
//   POST /notify   JSON da scripts/regista.mjs e dal workflow: fasi, esiti, elenco cartelle
//   POST /video    multipart da scripts/regista.mjs: video finale (anteprima ≤ 50 MB)
//   GET  /setup?k= collega webhook e menu comandi (protetto da TELEGRAM_SECRET)
//
// Ogni schermata si aggiorna nello stesso messaggio; ogni montaggio ha una scheda
// di avanzamento che si modifica da sola fase per fase. Comandi solo dalle chat in
// ALLOWED_CHAT_ID (separati da virgola); le notifiche vanno a tutte.

import { DurableObject } from 'cloudflare:workers';

export interface Env {
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_SECRET: string;
  ALLOWED_CHAT_ID: string;  // uno o più chat id separati da virgola
  GITHUB_TOKEN: string;      // fine-grained, Actions read & write sul repo
  GITHUB_REPO: string;       // "DenLeone/video-regista"
  NOTIFY_TOKEN: string;      // condiviso con il workflow
  MEMORIA: DurableObjectNamespace<Memoria>;
}

// ---------- memoria (una sola istanza, chiave/valore) ----------
export class Memoria extends DurableObject {
  async leggi(k: string): Promise<unknown> { return this.ctx.storage.get(k); }
  async scrivi(k: string, v: unknown) { await this.ctx.storage.put(k, v); }
  async cancella(k: string) { await this.ctx.storage.delete(k); }
  // atomiche (dentro l'oggetto nessun'altra richiesta si inserisce tra get e put):
  // servono quando Telegram consegna più file nello stesso istante
  async aggiungi(k: string, v: unknown): Promise<number> {
    const a = ((await this.ctx.storage.get(k)) as unknown[] | undefined) || [];
    a.push(v);
    await this.ctx.storage.put(k, a);
    return a.length;
  }
  async prenota(k: string): Promise<boolean> {
    if (await this.ctx.storage.get(k)) return false;
    await this.ctx.storage.put(k, true);
    return true;
  }
}
const mem = (env: Env) => env.MEMORIA.get(env.MEMORIA.idFromName('denis'));
// i metodi chiamati da remoto (RPC) non portano il tipo generico: lo rimetto qui
const leggi = async <T>(env: Env, k: string) => (await mem(env).leggi(k)) as T | undefined;
const autorizzati = (env: Env) => env.ALLOWED_CHAT_ID.split(',').map((s) => s.trim()).filter(Boolean);
const ok = (env: Env, chat: string) => autorizzati(env).includes(chat);

// ---------- costanti ----------
const WORKFLOW = 'regista.yml';
const URL_97 = 'https://drive.google.com/drive/folders/1wKYoQPmiuu7H65pr1lqiMi8bcefWmtaB';
const URL_98 = 'https://drive.google.com/drive/folders/1icN7ww-f6CrClZ5nhxi9eiX3_rO3MC4D';
const VERSIONE_COMANDI = 3; // cambia → il bot ri-registra da solo il menu comandi
const LINEA = '━━━━━━━━━━━━━━━━━━';

// ai = AI principale; l'altra fa sempre da riserva automatica
type Imp = { versione: 'stabile' | 'beta'; ai: 'gemini' | 'claude'; modello: 'haiku' | 'sonnet' | 'opus'; gemini: 'flash' | 'pro' };
const IMP_BASE: Imp = { versione: 'stabile', ai: 'gemini', modello: 'sonnet', gemini: 'flash' };
const RAMO: Record<Imp['versione'], string> = { stabile: 'main', beta: 'regista-v2' };
const NOME_MODELLO: Record<Imp['modello'], string> = { haiku: 'Haiku', sonnet: 'Sonnet', opus: 'Opus' };
const NOME_GEMINI: Record<Imp['gemini'], string> = { flash: 'Flash', pro: 'Pro' };
async function impostazioni(env: Env): Promise<Imp> {
  const i = { ...IMP_BASE, ...((await leggi<Partial<Imp>>(env, 'impostazioni')) || {}) };
  if (i.ai !== 'claude') i.ai = 'gemini'; // il vecchio "auto" diventa Gemini
  return i;
}
const motore = (i: Imp) => {
  const g = `Gemini ${NOME_GEMINI[i.gemini]}`, c = `Claude ${NOME_MODELLO[i.modello]}`;
  return `${i.versione === 'beta' ? 'Beta · ' : ''}${i.ai === 'gemini' ? `${g} (riserva ${c})` : `${c} (riserva ${g})`}`;
};

// ---------- Telegram ----------
type Button = { text: string; callback_data?: string; url?: string };
type Kb = Button[][];
type Schermo = { testo: string; tasti?: Kb };

async function tg<T = unknown>(env: Env, method: string, body: unknown): Promise<{ ok: boolean; result?: T; description?: string }> {
  const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  return r.json();
}
async function invia(env: Env, chat: string, s: Schermo, silenzioso = false): Promise<number | undefined> {
  const r = await tg<{ message_id: number }>(env, 'sendMessage', {
    chat_id: chat, text: s.testo, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, disable_notification: silenzioso,
    reply_markup: { inline_keyboard: s.tasti || [] },
  });
  return r.result?.message_id;
}
// modifica sul posto; se il messaggio non esiste più ne manda uno nuovo. Restituisce l'id valido.
async function mostra(env: Env, chat: string, s: Schermo, msgId?: number, silenzioso = false): Promise<number | undefined> {
  if (msgId) {
    const r = await tg(env, 'editMessageText', {
      chat_id: chat, message_id: msgId, text: s.testo, parse_mode: 'HTML', link_preview_options: { is_disabled: true },
      reply_markup: { inline_keyboard: s.tasti || [] },
    });
    if (r.ok || /not modified/i.test(r.description || '')) return msgId;
  }
  return invia(env, chat, s, silenzioso);
}
const togliTasti = (env: Env, chat: string, msgId?: number) =>
  msgId ? tg(env, 'editMessageReplyMarkup', { chat_id: chat, message_id: msgId, reply_markup: { inline_keyboard: [] } }) : null;
const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const tronca = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const kTok = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
const ora = (iso: string | number) => new Date(iso).toLocaleString('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const minuti = (from: string, to = new Date().toISOString()) => Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 60000));
const tasto = (text: string, callback_data: string): Button => ({ text, callback_data: callback_data.slice(0, 64) });
const link = (text: string, url: string): Button => ({ text, url });
const MENU_TASTO = tasto('◀ Menu', 'menu');

// ---------- GitHub ----------
async function gh(env: Env, path: string, init: RequestInit = {}) {
  return fetch(`https://api.github.com/repos/${env.GITHUB_REPO}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${env.GITHUB_TOKEN}`, accept: 'application/vnd.github+json',
      'user-agent': 'regista-telegram', 'x-github-api-version': '2022-11-28', ...(init.headers || {}),
    },
  });
}
type Inputs = { cartella?: string; brief?: string; origine?: '97' | '98'; correzione?: string; telegram?: string };
const dispatch = (env: Env, ref: string, inputs: Record<string, string>) =>
  gh(env, `/actions/workflows/${WORKFLOW}/dispatches`, { method: 'POST', body: JSON.stringify({ ref, inputs }) });

async function avvia(env: Env, i: Inputs, imp: Imp): Promise<string | null> {
  const base: Record<string, string> = { cartella: i.cartella || '', brief: i.brief || '', origine: i.origine || '97', correzione: i.correzione || '' };
  if (i.telegram) base.telegram = i.telegram; // indispensabile: se il workflow non lo conosce, meglio fallire che montare altro
  let r = await dispatch(env, RAMO[imp.versione], { ...base, ai: imp.ai, modello: imp.modello, modello_gemini: imp.gemini });
  // il workflow della versione stabile non conosce ancora ai/modello: riprovo senza
  if (r.status === 422) {
    const t = await r.text();
    if (!/unexpected inputs/i.test(t)) return `GitHub 422: ${t}`;
    r = await dispatch(env, RAMO[imp.versione], base);
  }
  return r.status === 204 ? null : `GitHub ${r.status}: ${await r.text()}`;
}

type Run = { id: number; status: string; conclusion: string | null; created_at: string; run_started_at?: string; updated_at: string; html_url: string; head_branch?: string };
async function giri(env: Env): Promise<Run[] | string> {
  const r = await gh(env, `/actions/workflows/${WORKFLOW}/runs?per_page=15`);
  if (!r.ok) return `GitHub ${r.status}`;
  return ((await r.json()) as { workflow_runs: Run[] }).workflow_runs;
}

// ---------- scheda di avanzamento ----------
const FASI = [
  { id: 'scarico', nome: 'Download', emoji: '📥' },
  { id: 'prepara', nome: 'Analisi', emoji: '🎞' },
  { id: 'regia', nome: 'Regia AI', emoji: '🧠' },
  { id: 'render', nome: 'Render', emoji: '🎬' },
  { id: 'carico', nome: 'Upload', emoji: '📤' },
] as const;
type IdFase = (typeof FASI)[number]['id'];
type Card = {
  nome: string; fasi: Partial<Record<IdFase, string>>; corrente?: IdFase; minuti: number;
  msg: Record<string, number>; versione?: string; brief?: string; correzione?: string; fine?: 'ok' | 'ko'; inCoda?: boolean;
};
type RunMemo = { nome: string; origine?: '97' | '98'; correzione?: string; brief?: string };
type Pendente = { nome: string; chat: string; msg?: number; quando: number; card: Card; origine?: '97' | '98' };

function faseDaTesto(t: string): IdFase | undefined {
  if (t.includes('📥')) return 'scarico';
  if (t.includes('🎞')) return 'prepara';
  if (t.includes('🧠') || t.includes('🔁')) return 'regia';
  if (t.includes('🎬')) return 'render';
  if (t.includes('📤')) return 'carico';
  return undefined;
}
const pulisci = (t: string) => t.replace(/^(✏️ Correzione · )?\s*[\p{Extended_Pictographic}️‍]+\s*/u, '').replace(/\s*\(\d+ min\)\s*$/, '').trim();

function scheda(c: Card): string {
  const idx = c.corrente ? FASI.findIndex((f) => f.id === c.corrente) : -1;
  const fatte = c.fine === 'ok' ? FASI.length : Math.max(0, idx);
  const barra = '▰'.repeat(fatte) + '▱'.repeat(FASI.length - fatte);
  const titolo = c.fine === 'ok' ? `✅ <b>${esc(c.nome)}</b> · completato`
    : c.fine === 'ko' ? `⚠️ <b>${esc(c.nome)}</b> · interrotto`
    : c.inCoda ? `🚀 <b>${esc(c.nome)}</b> · in coda` : `⚙️ <b>${esc(c.nome)}</b> · in lavorazione`;
  const sotto = c.inCoda ? 'avvio del server GitHub (1–3 min)' : `${fatte}/${FASI.length} · ${c.minuti} min`;
  const righe = [titolo, `<code>${barra}</code>  ${sotto}${c.versione ? ` · ${esc(c.versione)}` : ''}`];
  if (c.correzione) righe.push(`✏️ <i>${esc(tronca(c.correzione, 120))}</i>`);
  else if (c.brief) righe.push(`📝 <i>${esc(tronca(c.brief, 120))}</i>`);
  righe.push('');
  FASI.forEach((f, i) => {
    const icona = c.fine === 'ok' || i < idx ? '✅' : i === idx ? (c.fine === 'ko' ? '❌' : '⏳') : '▫️';
    const attiva = c.fine === 'ok' || i <= idx;
    const dettaglio = c.fasi[f.id] ? ` — <i>${esc(tronca(c.fasi[f.id] as string, 110))}</i>` : '';
    righe.push(`${icona} ${attiva ? `<b>${f.nome}</b>` : f.nome}${dettaglio}`);
  });
  return righe.join('\n');
}
const tastiScheda = (runUrl?: string): Kb => [[tasto('📊 Stato', 'stato'), ...(runUrl ? [link('🔧 Log', runUrl)] : [])]];

async function aggiornaCard(env: Env, runId: string, c: Card, runUrl?: string) {
  for (const chat of autorizzati(env)) c.msg[chat] = (await mostra(env, chat, { testo: scheda(c), tasti: tastiScheda(runUrl) }, c.msg[chat], true)) ?? c.msg[chat];
  await mem(env).scrivi(`card:${runId}`, c);
}

// la prima notizia di un giro: se l'ho avviato io da qui, adotto il messaggio "in coda"
async function cardDelGiro(env: Env, runId: string, nome: string, versione?: string, richiesto?: string): Promise<Card> {
  const esistente = await leggi<Card>(env, `card:${runId}`);
  if (esistente) return esistente;
  const pendenti = ((await leggi<Pendente[]>(env, 'pendenti')) || []).filter((p) => Date.now() - p.quando < 40 * 60000);
  // richiesto: il nome chiesto dal bot (la cartella può essere diventata "Nome (2)")
  const stesso = pendenti.findIndex((p) => [nome, richiesto].filter(Boolean).some((x) => p.nome.toLowerCase() === String(x).toLowerCase()));
  const i = stesso >= 0 ? stesso : pendenti.findIndex((p) => p.nome === ''); // avvio "prima con VAI"
  let card: Card = { nome, fasi: {}, minuti: 0, msg: {}, versione };
  if (i >= 0) {
    const p = pendenti.splice(i, 1)[0];
    card = { ...p.card, nome, inCoda: false, msg: p.msg ? { [p.chat]: p.msg } : {}, versione: p.card.versione || versione };
    await mem(env).scrivi(`run:${runId}`, { nome, origine: p.origine, correzione: p.card.correzione, brief: p.card.brief } satisfies RunMemo);
  }
  await mem(env).scrivi('pendenti', pendenti);
  return card;
}

// ---------- schermate ----------
async function adesso(env: Env): Promise<string> {
  const g = await giri(env);
  if (typeof g === 'string') return `⚠️ ${g}`;
  const attivi = g.filter((w) => w.status !== 'completed');
  if (!attivi.length) return '💤 nessun montaggio in corso';
  const righe: string[] = [];
  for (const a of attivi) {
    const c = await leggi<Card>(env, `card:${a.id}`);
    const min = minuti(a.run_started_at || a.created_at);
    if (!c) { righe.push(`⚙️ <b>montaggio in corso</b> · ${min} min`); continue; }
    const fase = c.corrente ? FASI.find((f) => f.id === c.corrente)?.nome : 'preparazione server';
    righe.push(`⚙️ <b>${esc(c.nome)}</b> · ${fase} · ${min} min`);
  }
  return righe.join('\n');
}

async function pannello(env: Env): Promise<Schermo> {
  const imp = await impostazioni(env);
  return {
    testo: [
      '🎬 <b>REGISTA</b> · montaggio automatico 9:16', LINEA,
      `<b>Adesso</b>   ${await adesso(env)}`,
      `<b>Motore</b>   ${esc(motore(imp))}`, LINEA,
      '<b>1.</b> Mandami i video qui <b>come File</b> (nome in didascalia) oppure caricali su Drive in <code>97 - Editare/NomeVideo</code>',
      '<b>2.</b> <b>Nuovo montaggio</b> (uno, guidato) o <b>Più video</b> (tanti, in parallelo)',
      '<b>3.</b> Ricevi qui il video: approvi o chiedi una correzione',
    ].join('\n'),
    tasti: [
      [tasto('🆕 Nuovo montaggio', 'nuovo'), tasto('📦 Più video', 'lotto')],
      [tasto('📊 Stato', 'stato'), tasto('⚙️ Impostazioni', 'imp')],
      [link('📂 97 · Da montare', URL_97), link('✅ 98 · Fatti', URL_98)],
      [tasto('❓ Guida', 'guida')],
    ],
  };
}

async function schermoStato(env: Env): Promise<Schermo> {
  const g = await giri(env);
  const righe = ['📊 <b>Stato</b>', LINEA];
  if (typeof g === 'string') righe.push(`⚠️ ${g}`);
  else {
    righe.push(await adesso(env));
    const pendenti = ((await leggi<Pendente[]>(env, 'pendenti')) || []).filter((p) => Date.now() - p.quando < 40 * 60000);
    if (pendenti.length) righe.push(`🚀 ${pendenti.length} ${pendenti.length === 1 ? 'avvio' : 'avvii'} in attesa del server GitHub`);
    // i giri "a vuoto" (nessuna cartella da montare) durano ~1 min: non sono video, li nascondo
    const veri = g.filter((w) => w.status === 'completed' && (w.conclusion !== 'success' || minuti(w.run_started_at || w.created_at, w.updated_at) >= 3));
    if (veri.length) {
      righe.push('', '<b>Ultimi montaggi</b>');
      for (const w of veri.slice(0, 10)) {
        const m = await leggi<RunMemo | string>(env, `run:${w.id}`);
        const nome = typeof m === 'string' ? m : m?.nome;
        const icona = w.conclusion === 'success' ? '✅' : w.conclusion === 'cancelled' ? '⏹' : '⚠️';
        righe.push(`${icona} ${ora(w.created_at)} · <b>${esc(nome || '—')}</b> · ${minuti(w.run_started_at || w.created_at, w.updated_at)} min`);
      }
    }
  }
  righe.push('', `<i>aggiornato alle ${ora(Date.now()).split(', ')[1] || ''}</i>`);
  return { testo: righe.join('\n'), tasti: [[tasto('🔄 Aggiorna', 'stato'), MENU_TASTO]] };
}

async function schermoImpostazioni(env: Env): Promise<Schermo> {
  const i = await impostazioni(env);
  const sel = (on: boolean, t: string) => `${on ? '● ' : '○ '}${t}`;
  const desc = {
    stabile: 'versione in produzione (ramo main)',
    beta: 'ramo di prova regista-v2: le novità prima del rilascio',
    gemini: 'principale Gemini; se è al limite passa da solo a Claude',
    claude: 'principale Claude; se è al limite passa da solo a Gemini',
    flash: 'veloce, ottima lettura delle immagini, pochi token, limiti alti — consigliato',
    pro: 'ragiona meglio sui tagli; più lento, più token, limiti giornalieri più bassi',
    haiku: 'il più economico, scelte più semplici',
    sonnet: 'equilibrio qualità/consumi — consigliato',
    opus: 'il più bravo, consuma molto di più',
  };
  return {
    testo: [
      '⚙️ <b>Impostazioni</b>', LINEA,
      `<b>Motore</b> · ${i.versione === 'beta' ? 'Beta' : 'Stabile'}`, `<i>${desc[i.versione]}</i>`, '',
      `<b>AI principale</b> · ${i.ai === 'claude' ? 'Claude' : 'Gemini'}`, `<i>${desc[i.ai]}</i>`, '',
      `<b>Modello Gemini</b> · ${NOME_GEMINI[i.gemini]}`, `<i>${desc[i.gemini]}</i>`, '',
      `<b>Modello Claude</b> · ${NOME_MODELLO[i.modello]}`, `<i>${desc[i.modello]}</i>`,
    ].join('\n'),
    tasti: [
      [tasto(sel(i.versione === 'stabile', 'Stabile'), 'i:versione:stabile'), tasto(sel(i.versione === 'beta', 'Beta'), 'i:versione:beta')],
      [tasto(sel(i.ai === 'gemini', 'AI: Gemini'), 'i:ai:gemini'), tasto(sel(i.ai === 'claude', 'AI: Claude'), 'i:ai:claude')],
      [tasto(sel(i.gemini === 'flash', 'Gemini Flash'), 'i:gemini:flash'), tasto(sel(i.gemini === 'pro', 'Gemini Pro'), 'i:gemini:pro')],
      [tasto(sel(i.modello === 'haiku', 'Haiku'), 'i:modello:haiku'), tasto(sel(i.modello === 'sonnet', 'Sonnet'), 'i:modello:sonnet'), tasto(sel(i.modello === 'opus', 'Opus'), 'i:modello:opus')],
      [MENU_TASTO],
    ],
  };
}

const GUIDA: Schermo = {
  testo: [
    '❓ <b>Come funziona</b>', LINEA,
    '<b>Due modi di consegnare il girato</b>',
    '📥 <b>Qui in chat</b>: mandami i file come <b>File</b> (📎 → File, non come video: così non vengono compressi), fino a 2 GB l\'uno (4 GB con Premium). Metti il nome del video come didascalia, poi 🚀 Monta. Gli originali finiscono in 97, il risultato in 98.',
    '📂 <b>Su Drive</b>: per file più grandi o tanti video insieme, una cartella in 97 - Editare.',
    '',
    '<b>1.</b> Crea <code>97 - Editare/NomeVideo/</code> e mettici tutto: clip iPhone, Sony, Insta360, B-roll, audio del microfono.',
    '<b>2.</b> 🆕 <b>Nuovo montaggio</b> → scegli la cartella e lo stile, rispondi alle domande (o salta), 🚀 Avvia.',
    '   📦 <b>Più video</b> → spunta tante cartelle, partono tutte insieme (indicazioni per video: <code>brief.txt</code> nella cartella).',
    '<b>3.</b> Segui la scheda di avanzamento: si aggiorna da sola (20–60 min).',
    '<b>4.</b> Arriva il video: 👍 Approva, ✏️ Correggi (scrivi cosa cambiare) o 🔁 Rifai da zero.',
    '',
    '<b>Audio</b> · microfono esterno > Insta360 > iPhone > Sony. Le camere della stessa ripresa vengono sincronizzate da sole.',
    '<b>Automatico</b> · un file <code>VAI</code> nella cartella fa partire il montaggio da solo (controllo periodico 7–23); con più cartelle VAI partono tutte in parallelo.',
    '',
    '<b>Comandi</b>',
    '/menu pannello · /nuovo montaggio · /stato',
    '/impostazioni · /annulla',
    '<code>/monta Nome | brief</code> avvio rapido senza domande (stile nel brief: <code>Stile: Cinematico</code>)',
  ].join('\n'),
  tasti: [[tasto('🆕 Nuovo montaggio', 'nuovo'), MENU_TASTO]],
};

// ---------- nuovo montaggio: passi ----------
type Brief = { cartella?: string; stile?: string; sponsor?: string; durata?: string; tono?: string; tavola?: string; note?: string; telegram?: boolean };
type Passo = 'cartella' | 'stile' | 'sponsor' | 'sponsor_testo' | 'durata' | 'tono' | 'tavola' | 'note' | 'riepilogo';
type Attesa =
  | { tipo: 'nuovo'; passo: Passo; dati: Brief; msg?: number; modifica?: boolean }
  | { tipo: 'lotto'; scelte: string[]; msg?: number }
  | { tipo: 'nome_raccolta'; poi: 'subito' | 'domande' | 'scheda'; msg?: number }
  | { tipo: 'correzione'; nome: string; runId?: string; msg?: number };
const kAttesa = (chat: string) => `attesa:${chat}`;
const ORDINE: Passo[] = ['cartella', 'stile', 'sponsor', 'durata', 'tono', 'tavola', 'note', 'riepilogo'];
const NUMERO: Record<Passo, number> = { cartella: 1, stile: 2, sponsor: 3, sponsor_testo: 3, durata: 4, tono: 5, tavola: 6, note: 7, riepilogo: 7 };
const PASSI = 7;
// stili pronti: gli stessi nomi di STILI in scripts/regista.mjs (il primo è quello predefinito)
const STILI = [{ nome: 'Blueprint', tasto: '📐 Blueprint', cosa: 'tavola tecnica, parole chiave in box, effetti digitali' },
  { nome: 'Cinematico', tasto: '🎬 Cinematico', cosa: 'spot di prodotto caldo, sottotitoli parola per parola, titoli grandi' }];
// la tavola esiste solo nel Blueprint: con gli altri stili il passo si salta
const saltaPasso = (p: Passo, d: Brief) => p === 'tavola' && Boolean(d.stile) && d.stile !== 'Blueprint';
// primo passo dei video mandati in chat (la cartella è già il nome dato al bot)
const PRIMO_TELEGRAM: Passo = 'stile';
const A_TESTO: Passo[] = ['cartella', 'sponsor_testo', 'tavola', 'note'];
type Cartelle = { elenco: string[]; vai: string[]; aggiornato: number };

// L'elenco di 97 - Editare arriva dal workflow. Se è vecchio lo chiedo da solo (giro "elenco" ≈1 min)
// e, quando arriva, aggiorno le schermate aperte che lo mostrano.
async function richiediElenco(env: Env, chat: string, forza = false): Promise<boolean> {
  const c = await leggi<Cartelle>(env, 'cartelle');
  const richiesto = (await leggi<number>(env, 'elenco_richiesto')) || 0;
  const inAttesa = new Set((await leggi<string[]>(env, 'attesa_elenco')) || []);
  inAttesa.add(chat);
  await mem(env).scrivi('attesa_elenco', [...inAttesa]);
  if (!forza && c && Date.now() - c.aggiornato < 10 * 60000) return false;
  if (Date.now() - richiesto < 3 * 60000) return true; // già chiesto da poco
  const imp = await impostazioni(env);
  const r = await dispatch(env, RAMO[imp.versione], { azione: 'elenco' });
  if (r.status !== 204) return false;
  await mem(env).scrivi('elenco_richiesto', Date.now());
  return true;
}
async function infoElenco(env: Env): Promise<string> {
  const c = await leggi<Cartelle>(env, 'cartelle');
  const richiesto = (await leggi<number>(env, 'elenco_richiesto')) || 0;
  const aggiorna = Date.now() - richiesto < 3 * 60000 && (!c || c.aggiornato < richiesto) ? ' · ⏳ aggiorno l\'elenco…' : '';
  return c ? `<i>97 - Editare alle ${ora(c.aggiornato).split(', ')[1]} · ⚡ = ha il file VAI${aggiorna}</i>`
    : `<i>${aggiorna ? '⏳ Recupero l\'elenco delle cartelle (≈1 min)…' : 'Elenco non disponibile: premi Aggiorna o scrivi il nome.'}</i>`;
}

// ---------- più video insieme ----------
async function schermoLotto(env: Env, a: Attesa & { tipo: 'lotto' }): Promise<Schermo> {
  const c = await leggi<Cartelle>(env, 'cartelle');
  const elenco = (c?.elenco || []).slice(0, 20);
  const tasti: Kb = elenco.map((n, i) => [tasto(`${a.scelte.includes(n) ? '✅' : '⬜'} ${c?.vai.includes(n) ? '⚡ ' : ''}${tronca(n, 34)}`, `l:t:${i}`)]);
  if (elenco.length) tasti.push([tasto('☑️ Tutte', 'l:tutte'), tasto('⬜ Nessuna', 'l:nessuna'), tasto('🔄 Aggiorna', 'l:aggiorna')]);
  else tasti.push([tasto('🔄 Aggiorna elenco', 'l:aggiorna')]);
  if (a.scelte.length) tasti.push([tasto(`🚀 Avvia ${a.scelte.length} ${a.scelte.length === 1 ? 'montaggio' : 'montaggi'}`, 'l:avvia')]);
  tasti.push([tasto('✖️ Annulla', 'annulla')]);
  const imp = await impostazioni(env);
  return {
    testo: [
      '📦 <b>Più video insieme</b>', LINEA,
      'Tocca le cartelle da montare: partono tutte <b>in parallelo</b>, ognuna con la sua scheda.',
      '<i>Regia automatica; per indicazioni su un video metti un <code>brief.txt</code> nella sua cartella.</i>',
      `⚙️ ${esc(motore(imp))}`, '', await infoElenco(env),
      `Selezionate: <b>${a.scelte.length}</b>`,
    ].join('\n'),
    tasti,
  };
}
async function mostraLotto(env: Env, chat: string, a: Attesa & { tipo: 'lotto' }, msgId?: number) {
  await richiediElenco(env, chat);
  a.msg = await mostra(env, chat, await schermoLotto(env, a), msgId ?? a.msg);
  await mem(env).scrivi(kAttesa(chat), a);
}

function testata(p: Passo) {
  const n = NUMERO[p];
  return `🆕 <b>Nuovo montaggio</b> · passo ${n}/${PASSI}\n<code>${'●'.repeat(n)}${'○'.repeat(PASSI - n)}</code>\n`;
}
const nav = (a: Attesa & { tipo: 'nuovo' }): Button[] => (a.modifica
  ? [tasto('◀ Riepilogo', 'w:riepilogo'), tasto('✖️ Annulla', 'annulla')]
  : [...(a.passo !== 'cartella' && !(a.dati.telegram && a.passo === PRIMO_TELEGRAM) ? [tasto('◀ Indietro', 'w:indietro')] : []), tasto('✖️ Annulla', 'annulla')]);

function riassunto(d: Brief, imp: Imp): string {
  return [
    d.telegram ? `📥 <b>Video</b>      ${esc(d.cartella || '')} · file da Telegram` : `📁 <b>Cartella</b>   ${d.cartella ? esc(d.cartella) : '⚡ tutte quelle con VAI'}`,
    `🎨 <b>Stile</b>         ${esc(d.stile || STILI[0].nome)}`,
    `💰 <b>Sponsor</b>    ${d.sponsor ? esc(d.sponsor) : 'nessuno'}`,
    `⏱ <b>Durata</b>     ${d.durata || 'automatica'}`,
    `🎭 <b>Tono</b>        ${d.tono || 'automatico'}`,
    ...(saltaPasso('tavola', d) ? [] : [`📐 <b>Tavola</b>     ${d.tavola ? esc(d.tavola) : 'automatica'}`]),
    `📝 <b>Note</b>        ${d.note ? esc(tronca(d.note, 200)) : '—'}`,
    `⚙️ <b>Motore</b>     ${esc(motore(imp))}`,
  ].join('\n');
}

async function schermoPasso(env: Env, a: Attesa & { tipo: 'nuovo' }): Promise<Schermo> {
  const d = a.dati;
  switch (a.passo) {
    case 'cartella': {
      if (d.telegram) return { testo: `${testata(a.passo)}\n✏️ <b>Come si chiama il video?</b>\nScrivimi il nome: diventa la cartella in 97 e in 98.`, tasti: [nav(a)] };
      const c = await leggi<Cartelle>(env, 'cartelle');
      const elenco = (c?.elenco || []).slice(0, 12);
      const righe: Kb = [];
      for (let i = 0; i < elenco.length; i += 2) {
        righe.push(elenco.slice(i, i + 2).map((n, j) => tasto(`${c?.vai.includes(n) ? '⚡ ' : '📁 '}${tronca(n, 22)}`, `w:c:${i + j}`)));
      }
      righe.push([tasto('⚡ Tutte quelle con VAI', 'w:c:*'), tasto('🔄 Aggiorna elenco', 'w:aggiorna')]);
      righe.push(nav(a));
      return { testo: `${testata(a.passo)}\n📁 <b>Quale cartella?</b>\nToccala qui sotto oppure scrivimi il nome esatto.\n\n${await infoElenco(env)}`, tasti: righe };
    }
    case 'stile':
      return {
        testo: `${testata(a.passo)}\n🎨 <b>Che stile?</b>\n${STILI.map((x) => `${x.tasto}: ${x.cosa}`).join('\n')}`,
        tasti: [STILI.map((x) => tasto(x.tasto, `w:v:stile:${x.nome}`)), nav(a)],
      };
    case 'sponsor':
      return { testo: `${testata(a.passo)}\n💰 <b>C'è uno sponsor?</b>`, tasti: [[tasto('No', 'w:v:sponsor:no'), tasto('Sì', 'w:v:sponsor:si')], nav(a)] };
    case 'sponsor_testo':
      return { testo: `${testata(a.passo)}\n💰 Scrivimi <b>marca/prodotto</b> e <b>cosa si testa</b>.\n<i>es. eSUN PETG, stampa Benchy veloce</i>`, tasti: [nav(a)] };
    case 'durata':
      return { testo: `${testata(a.passo)}\n⏱ <b>Quanto deve durare?</b>`, tasti: [[tasto('30 s', 'w:v:durata:30 s'), tasto('45 s', 'w:v:durata:45 s'), tasto('60 s', 'w:v:durata:60 s')], [tasto('Automatica', 'w:v:durata:')], nav(a)] };
    case 'tono':
      return { testo: `${testata(a.passo)}\n🎭 <b>Che tono?</b>`, tasti: [[tasto('Diretto', 'w:v:tono:diretto'), tasto('Ironico', 'w:v:tono:ironico')], [tasto('Tecnico', 'w:v:tono:tecnico'), tasto('Entusiasta', 'w:v:tono:entusiasta')], [tasto('Automatico', 'w:v:tono:')], nav(a)] };
    case 'tavola':
      return { testo: `${testata(a.passo)}\n📐 <b>Numero tavola?</b>\nScrivilo (es. <code>TAV. 05</code>) oppure:`, tasti: [[tasto('Automatica', 'w:v:tavola:')], nav(a)] };
    case 'note':
      return { testo: `${testata(a.passo)}\n📝 <b>Indicazioni per la regia?</b>\nCosa dire del prodotto, battute, cosa evitare… scrivilo oppure:`, tasti: [[tasto('Nessuna', 'w:v:note:')], nav(a)] };
    case 'riepilogo':
      return {
        testo: `🆕 <b>Nuovo montaggio</b> · pronto\n<code>${'●'.repeat(PASSI)}</code>\n\n${riassunto(d, await impostazioni(env))}`,
        tasti: [
          [tasto('🚀 Avvia montaggio', 'w:avvia')],
          [tasto('📁 Cartella', 'w:mod:cartella'), tasto('🎨 Stile', 'w:mod:stile'), tasto('💰 Sponsor', 'w:mod:sponsor')],
          [tasto('⏱ Durata', 'w:mod:durata'), tasto('🎭 Tono', 'w:mod:tono'), ...(saltaPasso('tavola', d) ? [] : [tasto('📐 Tavola', 'w:mod:tavola')]), tasto('📝 Note', 'w:mod:note')],
          [tasto('✖️ Annulla', 'annulla')],
        ],
      };
  }
}

async function vaiAPasso(env: Env, chat: string, a: Attesa & { tipo: 'nuovo' }, msgId?: number, nuovoMessaggio = false) {
  if (nuovoMessaggio) await togliTasti(env, chat, a.msg); // l'utente ha scritto: la domanda vecchia resta sopra senza tasti
  if (a.passo === 'cartella' && !a.dati.telegram) await richiediElenco(env, chat);
  a.msg = await mostra(env, chat, await schermoPasso(env, a), nuovoMessaggio ? undefined : (msgId ?? a.msg));
  await mem(env).scrivi(kAttesa(chat), a);
}

function prossimo(a: Attesa & { tipo: 'nuovo' }, d: Brief, appena: Passo, valore: string): Passo {
  if (appena === 'sponsor' && valore === 'si') return 'sponsor_testo';
  if (a.modifica) return 'riepilogo';
  const base = appena === 'sponsor_testo' ? 'sponsor' : appena;
  let i = ORDINE.indexOf(base) + 1;
  while (ORDINE[i] && saltaPasso(ORDINE[i], d)) i++;
  return ORDINE[i] || 'riepilogo';
}

async function rispondiPasso(env: Env, chat: string, a: Attesa & { tipo: 'nuovo' }, valore: string, msgId?: number, scritto = false) {
  const d = { ...a.dati };
  const p = a.passo;
  if (p === 'cartella') d.cartella = valore;
  else if (p === 'stile') d.stile = valore;
  else if (p === 'sponsor' && valore !== 'si') d.sponsor = '';
  else if (p === 'sponsor_testo') d.sponsor = valore;
  else if (p === 'durata') d.durata = valore;
  else if (p === 'tono') d.tono = valore;
  else if (p === 'tavola') d.tavola = valore;
  else if (p === 'note') d.note = valore;
  await vaiAPasso(env, chat, { ...a, dati: d, passo: prossimo(a, d, p, valore) }, msgId, scritto);
}

const componiBrief = (d: Brief) => [
  d.stile ? `Stile: ${d.stile}` : '',
  d.sponsor ? `Sponsor: ${d.sponsor}` : 'Nessuno sponsor',
  d.durata ? `Durata: ${d.durata}` : '', d.tono ? `Tono: ${d.tono}` : '',
  d.tavola && !saltaPasso('tavola', d) ? `Tavola: ${d.tavola}` : '', d.note ? `Note: ${d.note}` : '',
].filter(Boolean).join('. ');

// avvio: il messaggio diventa la scheda "in coda", poi la adotta il primo aggiornamento del giro
async function lancia(env: Env, chat: string, i: Inputs, msgId?: number) {
  await mem(env).cancella(kAttesa(chat));
  const imp = await impostazioni(env);
  const err = await avvia(env, i, imp);
  if (err) return mostra(env, chat, { testo: `⚠️ <b>Non sono riuscito ad avviare</b>\n<code>${esc(tronca(err, 500))}</code>`, tasti: [[MENU_TASTO]] }, msgId);
  const card: Card = {
    nome: i.cartella || '⚡ cartelle con VAI', fasi: {}, minuti: 0, msg: {}, inCoda: true,
    versione: imp.versione === 'beta' ? 'v2 beta' : undefined, brief: i.brief, correzione: i.correzione,
  };
  const id = await mostra(env, chat, { testo: scheda(card), tasti: [[tasto('📊 Stato', 'stato'), MENU_TASTO]] }, msgId);
  const pendenti = ((await leggi<Pendente[]>(env, 'pendenti')) || []).filter((p) => Date.now() - p.quando < 40 * 60000);
  pendenti.push({ nome: i.cartella || '', chat, msg: id, quando: Date.now(), card, origine: i.origine || '97' });
  await mem(env).scrivi('pendenti', pendenti);
}

// ---------- messaggi ----------
type FileMsg = { file_name?: string; file_size?: number; mime_type?: string };
type Msg = {
  message_id: number; chat: { id: number }; text?: string; caption?: string;
  video?: FileMsg; document?: FileMsg; photo?: FileMsg[]; animation?: FileMsg; video_note?: FileMsg; voice?: FileMsg; audio?: FileMsg;
};

// ---------- video mandati direttamente al bot ----------
// La Bot API fa scaricare ai bot solo 20 MB: qui si raccolgono i riferimenti ai messaggi,
// il download vero (fino a 2 GB a file) lo fa il workflow via MTProto.
type FileTg = { m: number; n: string; size: number; tipo: 'video' | 'audio' | 'foto' | 'testo'; compresso?: boolean };
const EST_VIDEO = /\.(mov|mp4|m4v|mkv|webm|insv)$/i, EST_AUDIO = /\.(wav|mp3|m4a|aac|flac|aiff?|ogg)$/i, EST_FOTO = /\.(jpe?g|png|heic|webp)$/i;
function fileDelMessaggio(msg: Msg): FileTg | null | 'rifiutato' {
  const id = msg.message_id;
  if (msg.document) {
    const n = msg.document.file_name || `file_${id}`, mime = msg.document.mime_type || '', size = msg.document.file_size || 0;
    if (mime.startsWith('video/') || EST_VIDEO.test(n)) return { m: id, n, size, tipo: 'video' };
    if (mime.startsWith('audio/') || EST_AUDIO.test(n)) return { m: id, n, size, tipo: 'audio' };
    if (mime.startsWith('image/') || EST_FOTO.test(n)) return { m: id, n, size, tipo: 'foto' };
    if (/\.txt$/i.test(n)) return { m: id, n: /brief/i.test(n) ? 'brief.txt' : n, size, tipo: 'testo' };
    return 'rifiutato';
  }
  const v = msg.video || msg.video_note || msg.animation;
  if (v) return { m: id, n: v.file_name || `video_${id}.mp4`, size: v.file_size || 0, tipo: 'video', compresso: true };
  if (msg.audio) return { m: id, n: msg.audio.file_name || `audio_${id}.m4a`, size: msg.audio.file_size || 0, tipo: 'audio' };
  if (msg.voice) return { m: id, n: `vocale_${id}.ogg`, size: msg.voice.file_size || 0, tipo: 'audio', compresso: true };
  if (msg.photo?.length) { const f = msg.photo[msg.photo.length - 1]; return { m: id, n: `foto_${id}.jpg`, size: f.file_size || 0, tipo: 'foto', compresso: true }; }
  return null;
}
const pesoLeggibile = (b: number) => (b >= 1e9 ? `${(b / 1e9).toFixed(1).replace('.', ',')} GB` : `${Math.max(1, Math.round(b / 1e6))} MB`);
const kR = (chat: string) => ({ file: `raccolta:${chat}`, nome: `raccolta_nome:${chat}`, msg: `raccolta_msg:${chat}`, scheda: `raccolta_scheda:${chat}` });
const nomeDaDidascalia = (c?: string) => (c || '').split('\n')[0].replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60);
const nomeAutomatico = () => `Video ${new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(/[/:]/g, '-').replace(', ', ' ')}`;

async function schermoRaccolta(env: Env, chat: string): Promise<Schermo> {
  const k = kR(chat);
  const files = (await leggi<FileTg[]>(env, k.file)) || [];
  const nome = await leggi<string>(env, k.nome);
  const totale = files.reduce((t, f) => t + f.size, 0);
  const icona = { video: '🎥', audio: '🎙', foto: '🖼', testo: '📝' };
  const compressi = files.filter((f) => f.compresso && f.tipo === 'video').length;
  const righe = [
    '📥 <b>Nuovo video da Telegram</b>', LINEA,
    `<b>${files.length} ${files.length === 1 ? 'file' : 'file'}</b> · ${pesoLeggibile(totale)}`,
    ...files.slice(0, 15).map((f) => `${icona[f.tipo]} ${esc(tronca(f.n, 40))} · ${pesoLeggibile(f.size)}${f.compresso && f.tipo === 'video' ? ' ⚠️ compresso' : ''}`),
    ...(files.length > 15 ? [`… e altri ${files.length - 15}`] : []),
    '', nome ? `<b>Nome</b>  ${esc(nome)}` : '<b>Nome</b>  <i>non ancora: scrivilo o mettilo come didascalia</i>',
  ];
  if (compressi) righe.push(`\n⚠️ Telegram ha compresso ${compressi} ${compressi === 1 ? 'video' : 'video'}: per la qualità piena rimandalo come <b>File</b> (📎 → File).`);
  righe.push('<i>Puoi mandare altri file: si aggiungono qui. Massimo 2 GB a file (4 GB con Premium).</i>');
  return {
    testo: righe.join('\n'),
    tasti: [
      [tasto('🚀 Monta subito', 'r:subito'), tasto('📝 Con domande', 'r:domande')],
      [tasto('✏️ Nome', 'r:nome'), tasto('🗑 Annulla', 'r:svuota')],
    ],
  };
}
const pausa = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

async function onFile(env: Env, chat: string, msg: Msg, f: FileTg) {
  const k = kR(chat);
  await mem(env).aggiungi(k.file, f);
  const didascalia = nomeDaDidascalia(msg.caption);
  if (didascalia && !(await leggi<string>(env, k.nome))) await mem(env).scrivi(k.nome, didascalia);
  // una sola scheda anche se arrivano tanti file nello stesso istante
  if (await mem(env).prenota(k.scheda)) {
    const id = await invia(env, chat, await schermoRaccolta(env, chat));
    await mem(env).scrivi(k.msg, id);
    await pausa(2500); // aspetto gli altri file dello stesso invio e aggiorno una volta
    return mostra(env, chat, await schermoRaccolta(env, chat), id);
  }
  let id = await leggi<number>(env, k.msg);
  if (!id) { await pausa(3000); id = await leggi<number>(env, k.msg); }
  if (id) await mostra(env, chat, await schermoRaccolta(env, chat), id);
}

async function nomeRaccolta(env: Env, chat: string, a: Attesa & { tipo: 'nome_raccolta' }, nome: string) {
  await mem(env).cancella(kAttesa(chat));
  await togliTasti(env, chat, a.msg);
  const k = kR(chat);
  await mem(env).scrivi(k.nome, nome);
  if (a.poi === 'subito') return lanciaRaccolta(env, chat, nome, '');
  if (a.poi === 'domande') return vaiAPasso(env, chat, { tipo: 'nuovo', passo: PRIMO_TELEGRAM, dati: { cartella: nome, telegram: true } });
  await togliTasti(env, chat, await leggi<number>(env, k.msg));
  await mem(env).scrivi(k.msg, await invia(env, chat, await schermoRaccolta(env, chat)));
}

async function svuotaRaccolta(env: Env, chat: string) {
  const k = kR(chat);
  for (const x of [k.file, k.nome, k.msg, k.scheda]) await mem(env).cancella(x);
}

async function lanciaRaccolta(env: Env, chat: string, nome: string, brief: string, msgId?: number) {
  const files = (await leggi<FileTg[]>(env, kR(chat).file)) || [];
  if (!files.length) return mostra(env, chat, { testo: '📥 Non ho file in attesa: mandameli qui e poi premi Monta.', tasti: [[MENU_TASTO]] }, msgId);
  const telegram = JSON.stringify(files.map((f) => ({ m: f.m, n: f.n })));
  const vecchia = await leggi<number>(env, kR(chat).msg);
  await svuotaRaccolta(env, chat);
  if (vecchia && vecchia !== msgId) await togliTasti(env, chat, vecchia);
  return lancia(env, chat, { cartella: nome, brief, telegram }, msgId);
}

async function onMessage(env: Env, msg: Msg) {
  const chat = String(msg.chat.id);
  const text = (msg.text || '').trim();
  if (!ok(env, chat)) {
    if (text.startsWith('/start')) await invia(env, chat, { testo: `🔒 Bot privato. Il tuo chat id è <code>${chat}</code>: chiedi a Denis di aggiungerlo.` });
    return;
  }
  const f = fileDelMessaggio(msg);
  if (f === 'rifiutato') return invia(env, chat, { testo: '🤔 Questo tipo di file non lo uso. Mandami video, audio del microfono, foto o un <code>brief.txt</code>.' });
  if (f) return onFile(env, chat, msg, f);
  const cmd = text.match(/^\/(\w+)(?:@\w+)?\s*(.*)$/s);
  if (cmd) {
    const [, nome, resto] = cmd;
    if (nome === 'annulla') { await mem(env).cancella(kAttesa(chat)); return invia(env, chat, await pannello(env)); }
    if (nome === 'stato') return invia(env, chat, await schermoStato(env));
    if (nome === 'impostazioni') return invia(env, chat, await schermoImpostazioni(env));
    if (nome === 'aiuto' || nome === 'guida') return invia(env, chat, GUIDA);
    if (nome === 'nuovo') return vaiAPasso(env, chat, { tipo: 'nuovo', passo: 'cartella', dati: {} });
    if (nome === 'monta') {
      const [cartella = '', brief = ''] = resto.split('|').map((s) => s.trim());
      return lancia(env, chat, { cartella, brief });
    }
    return invia(env, chat, await pannello(env)); // /start, /menu e comandi sconosciuti
  }

  // testo libero: risposta a una domanda in sospeso?
  const attesa = await leggi<Attesa>(env, kAttesa(chat));
  if (attesa?.tipo === 'nome_raccolta' && text) return nomeRaccolta(env, chat, attesa, nomeDaDidascalia(text) || nomeAutomatico());
  if (attesa?.tipo === 'correzione') {
    await togliTasti(env, chat, attesa.msg);
    const memo = attesa.runId ? await leggi<RunMemo | string>(env, `run:${attesa.runId}`) : undefined;
    return lancia(env, chat, { cartella: attesa.nome, origine: '98', correzione: text, brief: typeof memo === 'object' ? memo?.brief : undefined });
  }
  if (attesa?.tipo === 'nuovo' && A_TESTO.includes(attesa.passo) && text) return rispondiPasso(env, chat, attesa, text, undefined, true);
  return invia(env, chat, await pannello(env));
}

// ---------- tasti ----------
type Callback = { id: string; data?: string; message?: { message_id: number; chat: { id: number } } };

async function onCallback(env: Env, cb: Callback) {
  const chat = String(cb.message?.chat.id ?? '');
  const msgId = cb.message?.message_id;
  const data = cb.data || '';
  const avviso = (text?: string) => tg(env, 'answerCallbackQuery', { callback_query_id: cb.id, ...(text ? { text } : {}) });
  if (!ok(env, chat)) return avviso();

  if (data === 'menu') { await avviso(); return mostra(env, chat, await pannello(env), msgId); }
  if (data === 'stato') { await avviso(); return mostra(env, chat, await schermoStato(env), msgId); }
  if (data === 'imp') { await avviso(); return mostra(env, chat, await schermoImpostazioni(env), msgId); }
  if (data === 'guida') { await avviso(); return mostra(env, chat, GUIDA, msgId); }
  if (data === 'annulla') { await avviso('Annullato'); await mem(env).cancella(kAttesa(chat)); return mostra(env, chat, await pannello(env), msgId); }
  if (data === 'nuovo') { await avviso(); return vaiAPasso(env, chat, { tipo: 'nuovo', passo: 'cartella', dati: {} }, msgId); }
  if (data === 'lotto') { await avviso(); return mostraLotto(env, chat, { tipo: 'lotto', scelte: [] }, msgId); }

  if (data.startsWith('r:')) {
    const [, azione, poi = ''] = data.split(':');
    const k = kR(chat);
    const files = (await leggi<FileTg[]>(env, k.file)) || [];
    if (!files.length) { await avviso('Nessun file in attesa'); return mostra(env, chat, await pannello(env), msgId); }
    if (azione === 'svuota') {
      await avviso('Annullato');
      await svuotaRaccolta(env, chat);
      return mostra(env, chat, { testo: '🗑 Raccolta annullata. I file restano nella chat: rimandameli quando vuoi.', tasti: [[MENU_TASTO]] }, msgId);
    }
    if (azione === 'nomeauto') {
      await avviso();
      const att = await leggi<Attesa>(env, kAttesa(chat));
      const p = (['subito', 'domande', 'scheda'].includes(poi) ? poi : 'scheda') as 'subito' | 'domande' | 'scheda';
      return nomeRaccolta(env, chat, att?.tipo === 'nome_raccolta' ? att : { tipo: 'nome_raccolta', poi: p, msg: msgId }, nomeAutomatico());
    }
    const nome = await leggi<string>(env, k.nome);
    if (nome && azione === 'subito') { await avviso('Avvio…'); return lanciaRaccolta(env, chat, nome, '', msgId); }
    if (nome && azione === 'domande') { await avviso(); return vaiAPasso(env, chat, { tipo: 'nuovo', passo: PRIMO_TELEGRAM, dati: { cartella: nome, telegram: true } }, msgId); }
    // serve il nome (o lo si vuole cambiare)
    await avviso();
    const dopo: 'subito' | 'domande' | 'scheda' = azione === 'subito' || azione === 'domande' ? azione : 'scheda';
    const id = await invia(env, chat, {
      testo: `✏️ <b>Come si chiama il video?</b>\nScrivimi il nome: diventa la cartella in 97 e in 98.${nome ? `\nAdesso: <i>${esc(nome)}</i>` : ''}`,
      tasti: [[tasto(`Usa «${nomeAutomatico()}»`, `r:nomeauto:${dopo}`)], [tasto('✖️ Annulla', 'annulla')]],
    });
    return mem(env).scrivi(kAttesa(chat), { tipo: 'nome_raccolta', poi: dopo, msg: id } satisfies Attesa);
  }

  if (data.startsWith('l:')) {
    const a = await leggi<Attesa>(env, kAttesa(chat));
    if (a?.tipo !== 'lotto') { await avviso('Questa schermata è scaduta'); return mostra(env, chat, await pannello(env), msgId); }
    const [, azione, x = ''] = data.split(':');
    const c = await leggi<Cartelle>(env, 'cartelle');
    const elenco = (c?.elenco || []).slice(0, 20);
    if (azione === 't') {
      const n = elenco[Number(x)];
      if (n) a.scelte = a.scelte.includes(n) ? a.scelte.filter((y) => y !== n) : [...a.scelte, n];
    } else if (azione === 'tutte') a.scelte = [...elenco];
    else if (azione === 'nessuna') a.scelte = [];
    else if (azione === 'aggiorna') { await avviso((await richiediElenco(env, chat, true)) ? 'Aggiorno l\'elenco, ≈1 min' : 'Elenco non disponibile'); return mostraLotto(env, chat, a, msgId); }
    else if (azione === 'avvia' && a.scelte.length) {
      await avviso(`Avvio ${a.scelte.length}…`);
      const scelte = [...a.scelte];
      await mostra(env, chat, { testo: `📦 <b>Avviati ${scelte.length} montaggi in parallelo</b>\n${scelte.map((n) => `• ${esc(n)}`).join('\n')}\n\n<i>Ognuno ha la sua scheda qui sotto; il video arriva appena è pronto.</i>`, tasti: [[tasto('📊 Stato', 'stato'), MENU_TASTO]] }, msgId);
      for (const n of scelte) await lancia(env, chat, { cartella: n });
      return;
    }
    await avviso();
    return mostraLotto(env, chat, a, msgId);
  }
  if (data === 'noop') return avviso();

  if (data.startsWith('i:')) {
    const [, chiave, valore] = data.split(':') as [string, keyof Imp, string];
    const imp = { ...(await impostazioni(env)), [chiave]: valore } as Imp;
    await mem(env).scrivi('impostazioni', imp);
    await avviso('Salvato');
    return mostra(env, chat, await schermoImpostazioni(env), msgId);
  }

  if (data.startsWith('w:')) {
    const a = await leggi<Attesa>(env, kAttesa(chat));
    if (a?.tipo !== 'nuovo') { await avviso('Questa procedura è scaduta'); return mostra(env, chat, await pannello(env), msgId); }
    const [, azione, x = '', y = ''] = data.split(':');
    if (azione === 'aggiorna') {
      await avviso((await richiediElenco(env, chat, true)) ? 'Aggiorno l\'elenco, ≈1 min' : 'Elenco non disponibile: scrivi il nome');
      return vaiAPasso(env, chat, a, msgId);
    }
    if (azione === 'indietro') {
      const base = a.passo === 'sponsor_testo' ? 'sponsor' : a.passo;
      let i = Math.max(0, ORDINE.indexOf(base) - 1);
      while (i > 0 && saltaPasso(ORDINE[i], a.dati)) i--;
      await avviso();
      return vaiAPasso(env, chat, { ...a, passo: ORDINE[i] }, msgId);
    }
    if (azione === 'riepilogo') { await avviso(); return vaiAPasso(env, chat, { ...a, passo: 'riepilogo', modifica: false }, msgId); }
    if (azione === 'mod') { await avviso(); return vaiAPasso(env, chat, { ...a, passo: x as Passo, modifica: true }, msgId); }
    if (azione === 'avvia') {
      await avviso('Avvio…');
      if (a.dati.telegram) return lanciaRaccolta(env, chat, a.dati.cartella || '', componiBrief(a.dati), msgId);
      return lancia(env, chat, { cartella: a.dati.cartella, brief: componiBrief(a.dati) }, msgId);
    }
    if (azione === 'c' && a.passo === 'cartella') {
      const c = await leggi<Cartelle>(env, 'cartelle');
      const nome = x === '*' ? '' : c?.elenco[Number(x)];
      if (nome === undefined) { await avviso('Elenco cambiato, riprova'); return vaiAPasso(env, chat, a, msgId); }
      await avviso();
      return rispondiPasso(env, chat, a, nome, msgId);
    }
    if (azione === 'v' && a.passo === x) { await avviso(); return rispondiPasso(env, chat, a, y, msgId); }
    return avviso(); // tasto di un passo già superato
  }

  // tasti sul video finito / sull'errore
  const [azione, runId] = data.split(':');
  const memoGrezzo = runId ? await leggi<RunMemo | string>(env, `run:${runId}`) : undefined;
  const memo: RunMemo | undefined = typeof memoGrezzo === 'string' ? { nome: memoGrezzo } : memoGrezzo;
  if (!memo) return avviso('Non trovo più questo montaggio');
  if (azione === 'ok') {
    await avviso('Approvato ✔︎');
    return tg(env, 'editMessageReplyMarkup', { chat_id: chat, message_id: msgId, reply_markup: { inline_keyboard: [[tasto('✔︎ Approvato', 'noop'), link('📂 Drive', URL_98)]] } });
  }
  if (azione === 'fix') {
    await avviso();
    const id = await invia(env, chat, {
      testo: `✏️ <b>Cosa cambio in ${esc(memo.nome)}?</b>\nScrivilo normale, per esempio:\n<i>hook più corto · più inquadrature del prodotto · togli APP ANKER · chiudi su BOCCIATO · parole chiave più in alto</i>`,
      tasti: [[tasto('✖️ Annulla', 'annulla')]],
    });
    return mem(env).scrivi(kAttesa(chat), { tipo: 'correzione', nome: memo.nome, runId, msg: id } satisfies Attesa);
  }
  if (azione === 'redo') {
    await avviso();
    const imp = await impostazioni(env);
    return invia(env, chat, {
      testo: `🔁 <b>Rifaccio ${esc(memo.nome)} da zero?</b>\nMotore: ${esc(motore(imp))}\n<i>Costa ≈1 h di GitHub Actions e un montaggio del limite AI. Il video attuale resta su Drive.</i>`,
      tasti: [[tasto('✅ Sì, rifai', `redo!:${runId}`), tasto('✖️ No', 'annulla')]],
    });
  }
  if (azione === 'redo!') { await avviso('Avvio…'); return lancia(env, chat, { cartella: memo.nome, origine: '98', brief: memo.brief }, msgId); }
  if (azione === 'retry') {
    await avviso('Riprovo…');
    return lancia(env, chat, { cartella: memo.nome, origine: memo.origine || (memo.correzione ? '98' : '97'), correzione: memo.correzione, brief: memo.brief });
  }
  return avviso();
}

// ---------- notifiche da regista.mjs ----------
type Info = {
  file?: string; durata?: number; tagli?: number; sorgenti?: number; voce?: string; keywords?: string[]; note?: string;
  ai?: { chi: string; modello: string; input: number; output: number; usd?: number } | null; minuti?: number; correzione?: string; errore?: string;
};
type Notify = {
  tipo?: 'fase' | 'esito' | 'cartelle' | 'vuoto'; esito?: string; nome: string; testo: string; ok?: boolean; foto?: string;
  run_url?: string; run_id?: string; step?: IdFase; minuti?: number; versione?: string; origine?: '97' | '98'; info?: Info; richiesto?: string;
  cartelle?: string[]; vai?: string[];
};

function didascalia(nome: string, info?: Info, testo = ''): string {
  if (!info || info.durata == null) return `✅ <b>${esc(nome)}</b>\n\n${esc(tronca(testo, 900))}`;
  const versione = info.file ? info.file.replace(/\.mp4$/i, '').replace(`${nome} - `, '') : 'FINALE';
  const ai = info.ai ? `🧠 ${esc(info.ai.chi)} ${esc(info.ai.modello.replace(/^claude-/, '').replace(/-\d{8}$/, ''))} · ${kTok(info.ai.input + info.ai.output)} token${info.ai.usd != null ? ` (≈ $${info.ai.usd.toFixed(2)} API)` : ''}` : '';
  const righe = [
    `✅ <b>${esc(nome)}</b> · ${esc(versione)}`,
    `⏱ ${info.durata} s  ·  ✂️ ${info.tagli} tagli  ·  🎥 ${info.sorgenti} sorgenti`,
    info.voce ? `🎙 voce ${esc(info.voce)}` : '',
    info.keywords?.length ? `🔑 ${esc(tronca(info.keywords.join(' · '), 160))}` : '',
    ai,
    `⌛ ${info.minuti ?? '?'} min${info.correzione ? `  ·  ✏️ ${esc(tronca(info.correzione, 80))}` : ''}`,
  ].filter(Boolean);
  const note = info.note ? `\n📝 <i>${esc(tronca(info.note, Math.max(80, 900 - righe.join('\n').length)))}</i>` : '';
  return righe.join('\n') + note;
}

const tastiRisultato = (runId?: string, runUrl?: string): Kb => [
  ...(runId ? [[tasto('👍 Approva', `ok:${runId}`), tasto('✏️ Correggi', `fix:${runId}`)], [tasto('🔁 Rifai da zero', `redo:${runId}`), link('📂 Drive', URL_98)]] : [[link('📂 Drive', URL_98)]]),
  ...(runUrl ? [[link('🔧 Log', runUrl)]] : []),
];

async function onNotify(env: Env, n: Notify) {
  const chats = autorizzati(env);
  if (n.tipo === 'cartelle') {
    await mem(env).scrivi('cartelle', { elenco: n.cartelle || [], vai: n.vai || [], aggiornato: Date.now() } satisfies Cartelle);
    const inAttesa = (await leggi<string[]>(env, 'attesa_elenco')) || [];
    await mem(env).scrivi('attesa_elenco', []);
    for (const chat of inAttesa) {
      const a = await leggi<Attesa>(env, kAttesa(chat));
      if (a?.tipo === 'nuovo' && a.passo === 'cartella') await mostra(env, chat, await schermoPasso(env, a), a.msg);
      else if (a?.tipo === 'lotto') await mostra(env, chat, await schermoLotto(env, a), a.msg);
    }
    return;
  }
  if (n.tipo === 'vuoto') {
    const pendenti = (await leggi<Pendente[]>(env, 'pendenti')) || [];
    const i = pendenti.findIndex((p) => p.nome === '');
    const s: Schermo = { testo: '🤷 <b>Nessuna cartella con VAI</b> in 97 - Editare: non ho montato niente.\nScegli la cartella da <b>Nuovo montaggio</b>.', tasti: [[tasto('🆕 Nuovo montaggio', 'nuovo'), link('📂 97', URL_97)]] };
    if (i >= 0) { const p = pendenti.splice(i, 1)[0]; await mem(env).scrivi('pendenti', pendenti); await mostra(env, p.chat, s, p.msg); }
    else for (const chat of chats) await invia(env, chat, s, true);
    return;
  }
  if (n.tipo === 'fase') {
    if (!n.run_id) { for (const chat of chats) await invia(env, chat, { testo: `<b>${esc(n.nome)}</b> · ${esc(n.testo)}` }, true); return; }
    const c = await cardDelGiro(env, n.run_id, n.nome, n.versione === 'v2' ? 'v2' : undefined, n.richiesto);
    const step = n.step || faseDaTesto(n.testo);
    if (step) { c.corrente = step; c.fasi[step] = pulisci(n.testo); }
    c.minuti = n.minuti ?? Number(/\((\d+) min\)\s*$/.exec(n.testo)?.[1] ?? c.minuti);
    c.inCoda = false;
    if (n.origine) {
      const memo = await leggi<RunMemo | string>(env, `run:${n.run_id}`);
      await mem(env).scrivi(`run:${n.run_id}`, { ...(typeof memo === 'object' ? memo : {}), nome: n.nome, origine: n.origine } satisfies RunMemo);
    }
    return aggiornaCard(env, n.run_id, c, n.run_url);
  }

  // esito
  if (n.run_id) {
    const vecchio = await leggi<RunMemo | string>(env, `run:${n.run_id}`);
    const base = typeof vecchio === 'object' ? vecchio : {};
    await mem(env).scrivi(`run:${n.run_id}`, { ...base, nome: n.nome, ...(n.origine ? { origine: n.origine } : {}), ...(n.info?.correzione ? { correzione: n.info.correzione } : {}) } satisfies RunMemo);
    const c = await cardDelGiro(env, n.run_id, n.nome);
    c.fine = n.ok ? 'ok' : 'ko';
    if (n.step) c.corrente = n.step;
    if (n.minuti != null) c.minuti = n.minuti;
    await aggiornaCard(env, n.run_id, c, n.run_url);
  }
  if (!n.ok) {
    const causa = n.info?.errore || n.testo.replace(/^Errore:\s*/, '').split('\n\n')[0];
    const s: Schermo = {
      testo: `⚠️ <b>Montaggio non riuscito</b> — ${esc(n.nome)}${n.step ? `\nFase: ${FASI.find((f) => f.id === n.step)?.nome}` : ''}\n<blockquote>${esc(tronca(causa, 700))}</blockquote>`,
      tasti: [[...(n.run_id ? [tasto('🔁 Riprova', `retry:${n.run_id}`)] : []), ...(n.run_url ? [link('🔧 Log', n.run_url)] : [])], [MENU_TASTO]],
    };
    for (const chat of chats) await invia(env, chat, s);
    return;
  }
  // riuscito ma il video non è passato: foto di anteprima
  const corpo = didascalia(n.nome, n.info, n.testo);
  const tasti = tastiRisultato(n.run_id, n.run_url);
  let fotoId: string | undefined; // la foto si carica una volta, poi si riusa il file_id
  for (const chat of chats) {
    if (n.foto) {
      const form = new FormData();
      form.append('chat_id', chat);
      form.append('caption', corpo);
      form.append('parse_mode', 'HTML');
      form.append('reply_markup', JSON.stringify({ inline_keyboard: tasti }));
      if (fotoId) form.append('photo', fotoId);
      else form.append('photo', new Blob([Uint8Array.from(atob(n.foto), (ch) => ch.charCodeAt(0))], { type: 'image/jpeg' }), 'anteprima.jpg');
      const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendPhoto`, { method: 'POST', body: form });
      if (r.ok) {
        const j = (await r.json()) as { result?: { photo?: { file_id: string }[] } };
        fotoId ??= j.result?.photo?.at(-1)?.file_id;
        continue;
      }
    }
    await invia(env, chat, { testo: corpo, tasti });
  }
}

// foto profilo del bot (workflow foto-bot, grafica/avatar-bot.jpg): la imposta con
// setMyProfilePhoto e la manda in chat con l'esito, così Denis la ha comunque
async function onFotoProfilo(env: Env, form: FormData) {
  const foto = form.get('foto');
  if (!foto || typeof foto === 'string') return 'foto mancante';
  const imposta = new FormData();
  imposta.append('photo', JSON.stringify({ type: 'static', photo: 'attach://foto' }));
  imposta.append('foto', foto, 'avatar.jpg');
  const r = (await (await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setMyProfilePhoto`, { method: 'POST', body: imposta })).json()) as { ok: boolean; description?: string };
  const testo = r.ok
    ? '🎬 <b>Nuova foto profilo impostata.</b>\nSe non la vedi subito, chiudi e riapri la chat.'
    : `🎬 <b>Foto profilo del bot</b>\nNon sono riuscito a impostarla da solo (<code>${esc(r.description || 'errore')}</code>): mettila da @BotFather → /mybots → Edit Bot → Edit Botpic, mandando questa foto.`;
  for (const chat of autorizzati(env)) {
    const out = new FormData();
    out.append('chat_id', chat);
    out.append('caption', testo);
    out.append('parse_mode', 'HTML');
    out.append('photo', foto, 'avatar.jpg');
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendPhoto`, { method: 'POST', body: out });
    // come file, per poterla salvare in qualità piena
    const doc = new FormData();
    doc.append('chat_id', chat);
    doc.append('document', foto, 'regista-den.jpg');
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendDocument`, { method: 'POST', body: doc });
  }
  return r.ok ? 'ok' : `non impostata: ${r.description}`;
}

// video finale (≤ 50 MB, limite dei bot): arriva già compresso da regista.mjs.
// Si carica una volta sola; agli altri utenti si rimanda lo stesso file_id.
async function onVideo(env: Env, form: FormData) {
  const nome = String(form.get('nome') || '');
  const runId = String(form.get('run_id') || '');
  const runUrl = String(form.get('run_url') || '');
  const testo = String(form.get('testo') || '');
  let info: Info | undefined;
  try { info = form.get('info') ? JSON.parse(String(form.get('info'))) : undefined; } catch { /* vecchio formato */ }
  const video = form.get('video');
  if (!video || typeof video === 'string') return false;
  if (runId) {
    const vecchio = await leggi<RunMemo | string>(env, `run:${runId}`);
    await mem(env).scrivi(`run:${runId}`, { ...(typeof vecchio === 'object' ? vecchio : {}), nome, ...(info?.correzione ? { correzione: info.correzione } : {}) } satisfies RunMemo);
    const c = await cardDelGiro(env, runId, nome);
    c.fine = 'ok';
    c.corrente = 'carico';
    if (info?.minuti != null) c.minuti = info.minuti;
    await aggiornaCard(env, runId, c, runUrl);
  }
  const corpo = didascalia(nome, info, testo);
  const tasti = tastiRisultato(runId || undefined, runUrl || undefined);
  let fileId: string | undefined;
  let almenoUno = false;
  for (const chat of autorizzati(env)) {
    const out = new FormData();
    out.append('chat_id', chat);
    out.append('caption', corpo);
    out.append('parse_mode', 'HTML');
    out.append('supports_streaming', 'true');
    out.append('width', '720');
    out.append('height', '1280');
    if (form.get('durata')) out.append('duration', String(Math.round(Number(form.get('durata')))));
    out.append('reply_markup', JSON.stringify({ inline_keyboard: tasti }));
    if (fileId) out.append('video', fileId);
    else out.append('video', video, `${nome}.mp4`);
    const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendVideo`, { method: 'POST', body: out });
    if (r.ok) {
      almenoUno = true;
      const j = (await r.json()) as { result?: { video?: { file_id: string } } };
      fileId ??= j.result?.video?.file_id;
    } else {
      await invia(env, chat, { testo: corpo, tasti }); // se il video non passa, almeno la scheda
    }
  }
  return almenoUno;
}

// ---------- menu comandi ----------
const COMANDI = [
  { command: 'menu', description: 'Pannello di controllo' },
  { command: 'nuovo', description: 'Nuovo montaggio guidato' },
  { command: 'stato', description: 'Montaggi in corso e ultimi risultati' },
  { command: 'impostazioni', description: 'Motore, AI e modello' },
  { command: 'aiuto', description: 'Come funziona' },
  { command: 'annulla', description: 'Annulla la procedura in corso' },
];
async function aggiornaComandi(env: Env, forza = false) {
  if (!forza && (await leggi<number>(env, 'versione_comandi')) === VERSIONE_COMANDI) return;
  await tg(env, 'setMyCommands', { commands: COMANDI });
  await mem(env).scrivi('versione_comandi', VERSIONE_COMANDI);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === 'POST' && url.pathname === '/tg') {
      if (req.headers.get('x-telegram-bot-api-secret-token') !== env.TELEGRAM_SECRET) return new Response('no', { status: 401 });
      const u = (await req.json()) as { message?: Msg; callback_query?: Callback };
      await aggiornaComandi(env);
      if (u.message) await onMessage(env, u.message);
      if (u.callback_query) await onCallback(env, u.callback_query);
      return new Response('ok');
    }

    if (req.method === 'POST' && (url.pathname === '/notify' || url.pathname === '/video' || url.pathname === '/foto-profilo')) {
      if (req.headers.get('x-regista-token') !== env.NOTIFY_TOKEN) return new Response('no', { status: 401 });
      if (url.pathname === '/notify') { await onNotify(env, (await req.json()) as Notify); return new Response('ok'); }
      if (url.pathname === '/foto-profilo') return new Response(await onFotoProfilo(env, await req.formData()));
      const inviato = await onVideo(env, await req.formData());
      return new Response(inviato ? 'ok' : 'video non inviato', { status: inviato ? 200 : 502 });
    }

    if (url.pathname === '/setup' && url.searchParams.get('k') === env.TELEGRAM_SECRET) {
      const r = await tg(env, 'setWebhook', { url: `${url.origin}/tg`, secret_token: env.TELEGRAM_SECRET, allowed_updates: ['message', 'callback_query'] });
      await aggiornaComandi(env, true);
      const info = await tg<{ url?: string; allowed_updates?: string[]; last_error_message?: string }>(env, 'getWebhookInfo', {});
      return Response.json({ set: r, url: info.result?.url, allowed_updates: info.result?.allowed_updates, last_error: info.result?.last_error_message });
    }

    return new Response('regista bot', { status: 200 });
  },
};

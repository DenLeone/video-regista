// Bot Telegram "Regista": il pannello di controllo del montaggio automatico.
// Gira su Cloudflare Workers (sempre acceso, anche a PC spento).
//
//   POST /tg       webhook di Telegram (verificato con il secret token)
//   POST /notify   JSON da scripts/regista.mjs e dal workflow: fasi, esiti, elenco cartelle
//   POST /video    multipart da scripts/regista.mjs: video finale (anteprima ≤ 50 MB)
//   POST /foto-profilo  multipart dal workflow foto-bot: foto profilo del bot
//   POST /copertina     multipart dal workflow regista: copertina del video (nome, foto)
//   GET  /stili.jpg      anteprima degli stili (mostrata quando chiede lo stile)
//   GET  /setup?k= collega webhook e menu comandi (protetto da TELEGRAM_SECRET)
//
// Telegram riceve subito "ok" e il lavoro continua dopo (waitUntil): niente attese sui
// tasti e niente aggiornamenti rimandati due volte se una risposta tarda.
//
// Ogni schermata si aggiorna nello stesso messaggio; ogni montaggio ha una scheda
// di avanzamento che si modifica da sola fase per fase. Comandi solo dalle chat in
// ALLOWED_CHAT_ID (separati da virgola); le notifiche vanno a tutte.

import { DurableObject } from 'cloudflare:workers';
import { ANTEPRIMA_STILI } from './anteprima-stili';
import { correggiStileSalvato, riceviEsitoStile } from './stile-api';
import { gestisciApp } from './api';
import { avvisoUtente } from './push';
import STILI_BASE from '../../scripts/stili-base.json';
import type { Ops, Segreti } from './ops';
import { unisciNomi } from './stile-studio';
import { PAGINA_PRIVACY, PAGINA_TERMINI, completaLoginTikTok, linkLoginTikTok, pianoDelGiorno, statoTikTok, type DepsSocial } from './social';

export interface Env {
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_SECRET: string;
  ALLOWED_CHAT_ID: string;  // uno o più chat id separati da virgola
  GITHUB_TOKEN: string;      // fine-grained, Actions read & write sul repo
  GITHUB_REPO: string;       // "DenLeone/video-regista"
  NOTIFY_TOKEN: string;      // condiviso con il workflow
  IG_TOKEN?: string;         // chiave Instagram (secret, 60 giorni): poi la tiene e la rinnova il bot
  APP_SETUP_CODE?: string;   // codice segreto per registrare o sostituire la passkey dell'app
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_BUCKET?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
  DRIVE_CLIENT_ID?: string;
  DRIVE_CLIENT_SECRET?: string;
  DRIVE_REFRESH_TOKEN?: string;
  GEMINI_API_KEY?: string;
  GROQ_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  TIKTOK_CLIENT_KEY?: string;     // app TikTok for Developers (Login Kit + Display API), per /social
  TIKTOK_CLIENT_SECRET?: string;
  ASSETS?: { fetch(req: Request): Promise<Response> };
  MEMORIA: DurableObjectNamespace<Memoria>;
}

// ---------- memoria (una sola istanza, chiave/valore) ----------
export class Memoria extends DurableObject {
  // /social: dopo la risposta a Telegram il Worker ha ~30 s, il piano (Instagram, TikTok, AI) ne
  // chiede di più. L'allarme dell'oggetto ha 15 minuti: il lavoro si sposta qui
  async socialDopo(chat: string, msg?: number) {
    await this.ctx.storage.put('social:richiesta', { chat, msg });
    await this.ctx.storage.setAlarm(Date.now());
  }
  async alarm() {
    const r = (await this.ctx.storage.get('social:richiesta')) as { chat: string; msg?: number } | undefined;
    await this.ctx.storage.delete('social:richiesta');
    if (!r) return;
    const env = this.env as Env;
    try { await completaSocial(env, r.chat, r.msg); } catch (e) { await segnalaErrore(env, r.chat, e); }
  }
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
  // in cima a un elenco (senza doppioni dello stesso giro), al massimo n elementi
  async inCima(k: string, v: { runId: string }, n: number) {
    const a = ((await this.ctx.storage.get(k)) as { runId: string }[] | undefined) || [];
    await this.ctx.storage.put(k, [v, ...a.filter((x) => x.runId !== v.runId)].slice(0, n));
  }
}
const mem = (env: Env) => env.MEMORIA.get(env.MEMORIA.idFromName('denis'));
// i metodi chiamati da remoto (RPC) non portano il tipo generico: lo rimetto qui
const leggi = async <T>(env: Env, k: string) => (await mem(env).leggi(k)) as T | undefined;
function memoriaApp(env: Env) {
  return {
    leggi: (k: string) => leggi(env, k),
    scrivi: (k: string, v: unknown) => mem(env).scrivi(k, v),
    cancella: (k: string) => mem(env).cancella(k),
  };
}
async function avvisaApp(env: Env, a: { tipo: string; titolo: string; corpo: string; url?: string }) {
  try { await avvisoUtente(env, memoriaApp(env), a); } catch (e) { console.error(e); }
}
const autorizzati = (env: Env) => env.ALLOWED_CHAT_ID.split(',').map((s) => s.trim()).filter(Boolean);
const ok = (env: Env, chat: string) => autorizzati(env).includes(chat);

// ---------- costanti ----------
const WORKFLOW = 'regista.yml';
const URL_97 = 'https://drive.google.com/drive/folders/1wKYoQPmiuu7H65pr1lqiMi8bcefWmtaB';
const URL_98 = 'https://drive.google.com/drive/folders/1icN7ww-f6CrClZ5nhxi9eiX3_rO3MC4D';
const URL_STILI = 'https://drive.google.com/drive/folders/1HD6Qv-KO3tmAQORJXuvsSnCALpK85e8w';
const cartellaDrive = (id: string) => `https://drive.google.com/drive/folders/${id}`;
const PROVA_S = 10; // render di prova di uno stile: i primi N secondi del video
const VERSIONE_COMANDI = 6; // cambia → il bot ri-registra da solo il menu comandi
let ORIGINE_BOT = ''; // https://regista-telegram…workers.dev (dalla richiesta in corso)
const ANTEPRIMA_URL = () => (ORIGINE_BOT ? `${ORIGINE_BOT}/stili.jpg?v=1` : undefined);
const LINEA = '━━━━━━━━━━━━━━━━━━';

// stili pronti: gli stessi nomi di STILI in scripts/regista.mjs; in più quelli su misura che
// Denis crea su Drive (cartelle in "12 · Risorse/Stili", elenco mandato dal workflow)
type Stile = { nome: string; tasto: string; cosa: string };
// stessi nomi di scripts/regista.mjs: l'elenco sta in scripts/stili-base.json
const STILI: Stile[] = STILI_BASE;
let STILI_DRIVE: string[] = []; // letti dalla memoria a ogni richiesta
// cartella su Drive e riga "Quando usarlo" di stile.txt (dal workflow), per descrizioni e link
type InfoStile = { nome: string; id?: string; desc?: string };
let INFO_STILI: InfoStile[] = [];
let STILI_APP: { nome: string; desc?: string }[] = []; // studiati nell'app, chiave app:stili
const infoStile = (nome: string) => INFO_STILI.find((x) => x.nome.toLowerCase() === nome.toLowerCase());
const tuttiStili = (): Stile[] => unisciNomi(
  STILI,
  STILI_DRIVE.map((n) => ({ nome: n, cosa: infoStile(n)?.desc || 'su misura, da Drive' })),
  STILI_APP,
);
// nome esatto; se il tasto l'ha accorciato (64 byte), l'unico stile che inizia così
function nomeStile(x?: string) {
  const t = String(x || '').toLowerCase();
  if (!t) return undefined;
  const tutti = tuttiStili();
  const inizio = tutti.filter((y) => y.nome.toLowerCase().startsWith(t));
  return (tutti.find((y) => y.nome.toLowerCase() === t) || (inizio.length === 1 ? inizio[0] : undefined))?.nome;
}
const stileDelBrief = (brief?: string) => nomeStile(/\bstile\s*:\s*([^.\n]+)/i.exec(brief || '')?.[1]?.trim());
// stesso brief con un altro stile (Cambia stile)
const conAltroStile = (brief: string | undefined, stile: string) =>
  [`Stile: ${stile}`, (brief || '').replace(/\bstile\s*:\s*[^.\n]*\.?\s*/i, '').trim()].filter(Boolean).join('. ');
// tasti degli stili, due per riga
const righeStili = (fai: (x: Stile) => Button): Kb => {
  const t = tuttiStili().map(fai);
  return Array.from({ length: Math.ceil(t.length / 2) }, (_, i) => t.slice(i * 2, i * 2 + 2));
};

// ai = AI principale; l'altra fa sempre da riserva automatica; stile = quello proposto di default
// prova = come esce il Reel: reel di prova che passa ai follower quando lo decide Denis (manuale)
// o da solo se va bene con i non follower (auto), oppure Reel normale (no)
type Imp = { versione: 'stabile' | 'beta'; ai: 'gemini' | 'claude'; modello: 'haiku' | 'sonnet' | 'opus'; gemini: 'flash' | 'pro'; stile: string; prova: 'manuale' | 'auto' | 'no' };
const IMP_BASE: Imp = { versione: 'stabile', ai: 'gemini', modello: 'sonnet', gemini: 'flash', stile: 'Blueprint', prova: 'manuale' };
const PROVA: Record<Imp['prova'], { nome: string; api: string }> = {
  manuale: { nome: 'reel di prova · ai follower quando decidi tu', api: 'MANUAL' },
  auto: { nome: 'reel di prova · ai follower da solo se va bene', api: 'SS_PERFORMANCE' },
  no: { nome: 'Reel normale (subito ai follower)', api: '' },
};
const RAMO: Record<Imp['versione'], string> = { stabile: 'main', beta: 'regista-v2' };
const NOME_MODELLO: Record<Imp['modello'], string> = { haiku: 'Haiku', sonnet: 'Sonnet', opus: 'Opus' };
const NOME_GEMINI: Record<Imp['gemini'], string> = { flash: 'Flash', pro: 'Pro' };
async function impostazioni(env: Env): Promise<Imp> {
  const i = { ...IMP_BASE, ...((await leggi<Partial<Imp>>(env, 'impostazioni')) || {}) };
  if (i.ai !== 'claude') i.ai = 'gemini'; // il vecchio "auto" diventa Gemini
  i.stile = nomeStile(i.stile) || STILI[0].nome;
  return i;
}
const motore = (i: Imp) => {
  const g = `Gemini ${NOME_GEMINI[i.gemini]}`, c = `Claude ${NOME_MODELLO[i.modello]}`;
  return `${i.versione === 'beta' ? 'Beta · ' : ''}${i.ai === 'gemini' ? `${g} (riserva ${c})` : `${c} (riserva ${g})`}`;
};

// ---------- Telegram ----------
type Button = { text: string; callback_data?: string; url?: string };
type Kb = Button[][];
// anteprima: URL di un'immagine mostrata grande sopra il testo (anteprima del link)
type Schermo = { testo: string; tasti?: Kb; anteprima?: string };
const opzioniAnteprima = (s: Schermo) => (s.anteprima
  ? { url: s.anteprima, prefer_large_media: true, show_above_text: true }
  : { is_disabled: true });

async function tg<T = unknown>(env: Env, method: string, body: unknown): Promise<{ ok: boolean; result?: T; description?: string }> {
  const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  return r.json();
}
// righe vuote (tasti facoltativi tutti assenti): Telegram rifiuterebbe il messaggio
const tastiera = (t?: Kb) => ({ inline_keyboard: (t || []).filter((r) => r.length) });
async function invia(env: Env, chat: string, s: Schermo, silenzioso = false): Promise<number | undefined> {
  const r = await tg<{ message_id: number }>(env, 'sendMessage', {
    chat_id: chat, text: s.testo, parse_mode: 'HTML', link_preview_options: opzioniAnteprima(s), disable_notification: silenzioso,
    reply_markup: tastiera(s.tasti),
  });
  return r.result?.message_id;
}
// modifica sul posto; se il messaggio non esiste più (o è un video) ne manda uno nuovo. Restituisce l'id valido.
async function mostra(env: Env, chat: string, s: Schermo, msgId?: number, silenzioso = false): Promise<number | undefined> {
  if (msgId) {
    const r = await tg(env, 'editMessageText', {
      chat_id: chat, message_id: msgId, text: s.testo, parse_mode: 'HTML', link_preview_options: opzioniAnteprima(s),
      reply_markup: tastiera(s.tasti),
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
// durata leggibile: "38.5 s", oltre il minuto "4:32 min" (i discorsi)
const durataTesto = (s: number) => { const t = Math.round(s); return t >= 60 ? `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')} min` : `${s} s`; };
const ora = (iso: string | number) => new Date(iso).toLocaleString('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const minuti = (from: string, to = new Date().toISOString()) => Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 60000));
// callback_data: al massimo 64 byte (non caratteri), altrimenti Telegram rifiuta tutto il messaggio
const byte = (s: string) => new TextEncoder().encode(s).length;
function corto(s: string, n = 64) {
  let t = s;
  while (byte(t) > n) t = t.slice(0, -1);
  return t;
}
const tasto = (text: string, callback_data: string): Button => ({ text, callback_data: corto(callback_data) });
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
// azione "render": rifà solo il render con la regia salvata (origine 98), senza AI;
// secondi: render di prova, solo i primi N secondi (Cambia stile → 🧪 Prova)
type Inputs = { cartella?: string; brief?: string; origine?: '97' | '98'; correzione?: string; telegram?: string; azione?: 'render'; secondi?: number; r2?: string };
const dispatch = (env: Env, ref: string, inputs: Record<string, string>) =>
  gh(env, `/actions/workflows/${WORKFLOW}/dispatches`, { method: 'POST', body: JSON.stringify({ ref, inputs }) });

async function avvia(env: Env, i: Inputs, imp: Imp): Promise<string | null> {
  const base: Record<string, string> = { cartella: i.cartella || '', brief: i.brief || '', origine: i.origine || '97', correzione: i.correzione || '' };
  if (i.telegram) base.telegram = i.telegram; // indispensabile: se il workflow non lo conosce, meglio fallire che montare altro
  if (i.azione) base.azione = i.azione;
  if (i.secondi) base.secondi = String(i.secondi); // idem: senza, partirebbe il render intero
  if (i.r2) base.r2 = i.r2; // girato già su R2: il runner non lo riscarica da Drive
  let r = await dispatch(env, RAMO[imp.versione], { ...base, ai: imp.ai, modello: imp.modello, modello_gemini: imp.gemini });
  // il workflow della versione stabile non conosce ancora ai/modello: riprovo senza
  if (r.status === 422) {
    const t = await r.text();
    if (!/unexpected inputs/i.test(t)) return `GitHub 422: ${t}`;
    if (i.r2 && /\br2\b/.test(t)) return 'Il workflow non conosce ancora il caricamento dall\'app (input r2). Aggiorna il ramo Stabile.';
    if (i.secondi && /secondi/.test(t)) return 'La versione Beta non ha ancora il render di prova: passa a Stabile da ⚙️ Impostazioni → 🔧 Avanzate.';
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
  { id: 'tagli', nome: 'Tagli', emoji: '✂️' },
  { id: 'render', nome: 'Render', emoji: '🎬' },
  { id: 'carico', nome: 'Upload', emoji: '📤' },
] as const;
type IdFase = (typeof FASI)[number]['id'];
type Card = {
  nome: string; fasi: Partial<Record<IdFase, string>>; corrente?: IdFase; minuti: number;
  msg: Record<string, number>; versione?: string; brief?: string; correzione?: string; fine?: 'ok' | 'ko'; errore?: string; inCoda?: boolean;
  prova?: number; soloRender?: boolean;
};
// pubblica: dati del video finito (dal workflow) e scelte di Denis per Instagram/YouTube;
// pubblicato: 'in corso' o il riepilogo con i link
type Pubblica = {
  fileId: string; file?: string; didascalia: string; copertina?: number; copertinaId?: string; youtube?: { titolo?: string; descrizione?: string } | null;
  ig?: boolean; yt?: boolean;
};
// azione/secondi: com'era partito il giro (🔁 Riprova di un render di prova rifà la prova, non un montaggio)
type RunMemo = {
  nome: string; origine?: '97' | '98'; correzione?: string; brief?: string; pubblica?: Pubblica; pubblicato?: string;
  azione?: 'render'; secondi?: number; stile?: string; approvato?: boolean;
};
type Pendente = { nome: string; chat: string; msg?: number; quando: number; card: Card; origine?: '97' | '98'; azione?: 'render'; secondi?: number };

function faseDaTesto(t: string): IdFase | undefined {
  if (t.includes('📥')) return 'scarico';
  if (t.includes('🎞')) return 'prepara';
  if (t.includes('🧠') || t.includes('🔁')) return 'regia';
  if (t.includes('✂')) return 'tagli';
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
  if (c.prova) righe.push(`🧪 <i>render di prova: solo i primi ${c.prova} s</i>`);
  else if (c.soloRender) righe.push('🔄 <i>solo render: stessa regia, grafica e colore rifatti</i>');
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
    // quello già saputo dal giro (dati per pubblicare, stile) resta: l'avvio aggiunge brief e scelte
    const giro = await leggi<RunMemo | string>(env, `run:${runId}`);
    await mem(env).scrivi(`run:${runId}`, {
      nome, origine: p.origine, correzione: p.card.correzione, brief: p.card.brief, azione: p.azione, secondi: p.secondi,
      ...(typeof giro === 'object' ? giro : {}),
    } satisfies RunMemo);
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

// i video mandati in chat li scarica il workflow con le chiavi Telegram (TG_API_ID, TG_API_HASH,
// TELEGRAM_BOT_TOKEN nei secret di GitHub): il workflow dice a ogni giro se ci sono (tgFile)
const fileInChatPronti = async (env: Env) => leggi<boolean>(env, 'tg_file');

async function pannello(env: Env): Promise<Schermo> {
  const imp = await impostazioni(env);
  const tgFile = await fileInChatPronti(env);
  return {
    testo: [
      '🎬 <b>REGISTA</b> · montaggio automatico 9:16', LINEA,
      `<b>Adesso</b>   ${await adesso(env)}`,
      `<b>Stile</b>       ${esc(imp.stile)} · <b>AI</b> ${esc(motore(imp))}`,
      ...(tgFile === false ? ['📥 <i>Video mandati in chat: da attivare (vedi ❓ Guida). Intanto usa Drive.</i>'] : []),
      LINEA,
      `<i>Girato in <code>01 · Da editare/NomeVideo</code>${tgFile === false ? '' : ' (o qui come File)'} → 🆕 Nuovo montaggio → il video arriva qui.</i>`,
    ].join('\n'),
    tasti: [
      [tasto('🆕 Nuovo montaggio', 'nuovo'), tasto('📦 Più video', 'lotto')],
      [tasto('📼 Ultimi video', 'video'), tasto('🎨 Stili', 'stili')],
      [tasto('📊 Stato', 'stato'), tasto('⚙️ Impostazioni', 'imp')],
      [link('📂 01 · Da editare', URL_97), link('✅ 02 · Fatti', URL_98)],
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

const sel = (on: boolean, t: string) => `${on ? '● ' : '○ '}${t}`;
const DESC = {
  stabile: 'versione in produzione (ramo main)',
  beta: 'ramo di prova regista-v2: le novità prima del rilascio',
  gemini: 'principale Gemini; se è al limite passa da solo a Claude',
  claude: 'principale Claude; se è al limite passa da solo a Gemini',
  flash: 'veloce, legge bene le immagini, limiti alti — consigliato',
  pro: 'ragiona meglio sui tagli; più lento, limiti giornalieri bassi',
  haiku: 'il più economico, scelte più semplici',
  sonnet: 'equilibrio qualità/consumi — consigliato',
  opus: 'il più bravo, consuma molto di più',
};

async function schermoImpostazioni(env: Env): Promise<Schermo> {
  const i = await impostazioni(env);
  const c = await collegamenti(env);
  return {
    testo: [
      '⚙️ <b>Impostazioni</b>', LINEA,
      `🎨 <b>Stile predefinito</b> · ${esc(i.stile)}`, '<i>proposto in Nuovo montaggio, Più video e video mandati in chat</i>', '',
      `🧠 <b>AI principale</b> · ${i.ai === 'claude' ? 'Claude' : 'Gemini'}`, `<i>${DESC[i.ai]}</i>`, '',
      `✨ <b>Modello Gemini</b> · ${NOME_GEMINI[i.gemini]}`, `<i>${DESC[i.gemini]}</i>`, '',
      `📸 <b>Instagram</b> · ${PROVA[i.prova].nome}`, '<i>come esce il Reel quando premi 📤 Pubblica</i>',
      `🔗 <b>Collegamenti</b> · Instagram ${statoIg(c)} · YouTube ${statoYt(c)}`,
    ].join('\n'),
    tasti: [
      ...righeStili((x) => tasto(sel(i.stile === x.nome, x.tasto), `i:stile:${x.nome}`)),
      [tasto(sel(i.ai === 'gemini', 'AI: Gemini'), 'i:ai:gemini'), tasto(sel(i.ai === 'claude', 'AI: Claude'), 'i:ai:claude')],
      [tasto(sel(i.gemini === 'flash', 'Gemini Flash'), 'i:gemini:flash'), tasto(sel(i.gemini === 'pro', 'Gemini Pro'), 'i:gemini:pro')],
      [tasto(sel(i.prova === 'manuale', 'Prova: decido io'), 'i:prova:manuale'), tasto(sel(i.prova === 'auto', 'Prova: automatica'), 'i:prova:auto'), tasto(sel(i.prova === 'no', 'Reel normale'), 'i:prova:no')],
      [tasto('🔗 Instagram e YouTube', 'col'), tasto('🔧 Avanzate', 'i:avanzate')],
      [MENU_TASTO],
    ],
  };
}

// ---------- collegamenti per 📤 Pubblica ----------
// Instagram: la chiave la custodisce il bot (secret IG_TOKEN, poi rinnovata ogni settimana).
// YouTube: i secret sono su GitHub, il workflow dice a ogni giro se ci sono (undefined = non ancora saputo).
type Collegamenti = { ig: boolean; igRinnovata?: number; yt?: boolean };
async function collegamenti(env: Env): Promise<Collegamenti> {
  const chiave = await leggi<ChiaveIg>(env, 'ig_token');
  return { ig: Boolean(chiave?.token || env.IG_TOKEN), igRinnovata: chiave?.rinnovata, yt: await leggi<boolean>(env, 'yt_pronto') };
}
const statoIg = (c: Collegamenti) => (c.ig ? '✅' : '⚠️ da collegare');
const statoYt = (c: Collegamenti) => (c.yt ? '✅' : c.yt === false ? '⚠️ da collegare' : '❔ da verificare');

async function schermoCollegamenti(env: Env, runId?: string): Promise<Schermo> {
  const c = await collegamenti(env);
  const richiesto = (await leggi<number>(env, 'elenco_richiesto')) || 0;
  const verifica = Date.now() - richiesto < 3 * 60000 ? '\n⏳ <i>Controllo i secret su GitHub (≈1 min)…</i>' : '';
  return {
    testo: [
      '🔗 <b>Collegare Instagram e YouTube</b> · una volta sola', LINEA,
      `📸 <b>Instagram</b> · ${c.ig ? `✅ collegato${c.igRinnovata ? ` (chiave rinnovata il ${ora(c.igRinnovata).split(',')[0]})` : ''}` : '⚠️ da collegare'}`,
      '1. Account Instagram <b>professionale</b> (creator o business).',
      '2. developers.facebook.com → la tua app → Instagram → <i>API setup with Instagram business login</i> → <b>Generate token</b>.',
      '3. Cloudflare → Workers → <code>regista-telegram</code> → Settings → Variables and Secrets → secret <code>IG_TOKEN</code> con quella chiave.',
      '<i>Poi la rinnovo io ogni settimana.</i>', '',
      `▶️ <b>YouTube</b> · ${c.yt ? '✅ collegato' : c.yt === false ? '⚠️ da collegare' : '❔ da verificare (premi 🔄)'}`,
      '1. console.cloud.google.com → nuovo progetto → abilita <b>YouTube Data API v3</b>.',
      '2. Schermata di consenso OAuth: esterna, stato <b>In production</b>.',
      '3. Credenziali → ID client OAuth <i>Applicazione web</i>, URI di reindirizzamento <code>https://developers.google.com/oauthplayground</code>.',
      '4. OAuth Playground → ⚙️ <i>Use your own OAuth credentials</i> → scope <code>https://www.googleapis.com/auth/youtube.upload</code> → Authorize → <i>Exchange authorization code for tokens</i> → copia il <b>refresh token</b>.',
      '5. GitHub → Settings → Secrets → Actions: <code>YT_CLIENT_ID</code>, <code>YT_CLIENT_SECRET</code>, <code>YT_REFRESH_TOKEN</code>.',
      `<i>Finché Google non verifica l'app, YouTube tiene i video privati: li rendi pubblici da YouTube Studio.</i>${verifica}`,
    ].join('\n'),
    tasti: [
      [link('📸 Meta for Developers', 'https://developers.facebook.com/apps/'), link('☁️ Cloudflare', 'https://dash.cloudflare.com/')],
      [link('▶️ Google Cloud', 'https://console.cloud.google.com/apis/library/youtube.googleapis.com'), link('🔑 OAuth Playground', 'https://developers.google.com/oauthplayground')],
      [link('🐙 Secret su GitHub', `https://github.com/${env.GITHUB_REPO}/settings/secrets/actions`), tasto('🔄 Verifica', runId ? `colv:${runId}` : 'colv')],
      [runId ? tasto('◀ Pubblica', `pubr:${runId}`) : tasto('◀ Impostazioni', 'imp')],
    ],
  };
}

// ---------- 🎨 stili ----------
async function schermoStili(env: Env): Promise<Schermo> {
  const imp = await impostazioni(env);
  const c = await leggi<Cartelle>(env, 'cartelle');
  const richiesto = (await leggi<number>(env, 'elenco_richiesto')) || 0;
  const aggiorno = Date.now() - richiesto < 3 * 60000 && (!c || c.aggiornato < richiesto);
  const tutti = tuttiStili();
  return {
    testo: [
      '🎨 <b>Stili</b>', LINEA,
      ...tutti.map((x) => `${x.tasto}${x.nome === imp.stile ? ' ⭐' : ''}\n<i>${esc(tronca(x.cosa, 150))}</i>`), '',
      '⭐ = predefinito, lo propongo nei nuovi montaggi: tocca uno stile per sceglierlo.',
      `🎬 <b>Su un video già fatto</b>: 🎨 Cambia stile sotto il video, con una prova di ${PROVA_S} s prima del video intero.`,
      '✨ <b>Stile nuovo</b>: su Drive copia <i>_Modello nuovo stile</i> dentro Stili, rinominala e compila <code>stile.txt</code>: la riga <i>Quando usarlo</i> diventa la descrizione qui.',
      ...(aggiorno ? ['⏳ <i>Aggiorno l\'elenco (≈1 min)…</i>'] : c ? [`<i>Elenco di Drive delle ${ora(c.aggiornato).split(', ')[1]}</i>`] : []),
    ].join('\n'),
    tasti: [
      ...tutti.map((x) => {
        const id = infoStile(x.nome)?.id;
        return [tasto(sel(x.nome === imp.stile, x.tasto), `st:def:${x.nome}`), ...(id ? [link('📂 Drive', cartellaDrive(id))] : [])];
      }),
      [link('📂 Cartella Stili', URL_STILI), tasto('🔄 Aggiorna', 'st:agg')],
      [MENU_TASTO],
    ],
  };
}

// ---------- 📼 ultimi video ----------
// Ogni video finito (anche le prove) resta qui: dall'elenco lo si rimanda giù in chat con i suoi
// tasti, senza cercarlo tra i messaggi. video/foto: file_id di Telegram, si rimanda all'istante.
type VideoFatto = {
  runId: string; nome: string; file?: string; stile?: string; durata?: number; prova?: number; link?: string;
  runUrl?: string; quando: number; video?: string; foto?: string; corpo: string;
};
const MAX_VIDEO = 12;
const versioneDi = (nome: string, file?: string, prova?: number) =>
  (prova ? `prova ${prova} s` : file ? file.replace(/\.mp4$/i, '').replace(`${nome} - `, '') : 'FINALE');
async function ricordaVideo(env: Env, v: VideoFatto) {
  if (v.runId) await mem(env).inCima('video', v, MAX_VIDEO);
}

async function schermoVideo(env: Env): Promise<Schermo> {
  const elenco = (await leggi<VideoFatto[]>(env, 'video')) || [];
  if (!elenco.length) {
    return {
      testo: ['📼 <b>Ultimi video</b>', LINEA, 'Ancora nessuno: i video finiti compaiono qui da adesso in poi.', '<i>Quelli di prima sono su Drive in 02 · Fatti.</i>'].join('\n'),
      tasti: [[link('✅ 02 · Fatti', URL_98), MENU_TASTO]],
    };
  }
  const righe: string[] = [];
  const tasti: Kb = [];
  for (const v of elenco) {
    const memo = await leggi<RunMemo | string>(env, `run:${v.runId}`);
    const pubblicato = typeof memo === 'object' && Boolean(memo.pubblicato) && memo.pubblicato !== 'in corso';
    const icona = v.prova ? '🧪' : '🎬';
    const versione = versioneDi(v.nome, v.file, v.prova);
    righe.push(`${icona} <b>${esc(v.nome)}</b> · ${esc(versione)}${v.stile ? ` · ${esc(v.stile)}` : ''} · ${ora(v.quando)}${pubblicato ? ' · 📤' : ''}`);
    tasti.push([tasto(`${icona} ${tronca(`${v.nome} · ${versione}`, 42)}`, `vid:${v.runId}`)]);
  }
  return {
    testo: ['📼 <b>Ultimi video</b>', LINEA, ...righe, '', '<i>Tocca un video: te lo rimando qui sotto con i suoi tasti (📤 Pubblica, 🎨 Cambia stile, ✏️ Correggi…). 🧪 = prova, 📤 = pubblicato.</i>'].join('\n'),
    tasti: [...tasti, [link('✅ 02 · Fatti', URL_98), MENU_TASTO]],
  };
}

async function rimandaVideo(env: Env, chat: string, v: VideoFatto) {
  const tasti = tastiRisultato(v.runId, v.runUrl, { prova: v.prova, stile: v.stile, link: v.link });
  if (v.video || v.foto) {
    const r = await tg(env, v.video ? 'sendVideo' : 'sendPhoto', {
      chat_id: chat, [v.video ? 'video' : 'photo']: v.video || v.foto, caption: v.corpo, parse_mode: 'HTML', reply_markup: tastiera(tasti),
    });
    if (r.ok) return;
  }
  await invia(env, chat, { testo: v.corpo, tasti });
}

async function schermoAvanzate(env: Env): Promise<Schermo> {
  const i = await impostazioni(env);
  return {
    testo: [
      '🔧 <b>Impostazioni avanzate</b>', LINEA,
      `<b>Motore</b> · ${i.versione === 'beta' ? 'Beta' : 'Stabile'}`, `<i>${DESC[i.versione]}</i>`, '',
      `<b>Modello Claude</b> (riserva) · ${NOME_MODELLO[i.modello]}`, `<i>${DESC[i.modello]}</i>`,
    ].join('\n'),
    tasti: [
      [tasto(sel(i.versione === 'stabile', 'Stabile'), 'i:versione:stabile'), tasto(sel(i.versione === 'beta', 'Beta'), 'i:versione:beta')],
      [tasto(sel(i.modello === 'haiku', 'Haiku'), 'i:modello:haiku'), tasto(sel(i.modello === 'sonnet', 'Sonnet'), 'i:modello:sonnet'), tasto(sel(i.modello === 'opus', 'Opus'), 'i:modello:opus')],
      [tasto('◀ Impostazioni', 'imp')],
    ],
  };
}

const GUIDA: Schermo = {
  testo: [
    '❓ <b>Come funziona</b>', LINEA,
    '<b>1. Il girato</b>',
    '📂 Su Drive: <code>01 · Da editare/NomeVideo/</code> con tutte le clip (iPhone, Sony, Insta360, B-roll, audio del microfono).',
    '📥 In chat: mandami i file come <b>File</b> (📎 → File, così non vengono compressi), il nome del video come didascalia.',
    '',
    '<b>2. Il montaggio</b>',
    '🆕 <b>Nuovo montaggio</b>: cartella → stile → 🚀 Avvia. Sponsor, durata, tono, giudizio e note sono facoltativi, dal riepilogo.',
    '✍️ Più veloce: scrivimi il nome della cartella e ti propongo di montarla.',
    '📦 <b>Più video</b>: spunti tante cartelle, scegli lo stile, partono tutte insieme.',
    '🎙️ <b>Un solo video nella cartella = discorso</b>: niente regia. Tengo tutto il parlato in ordine e alla durata vera (anche 4–5 min), tolgo solo pause, false partenze e ripetizioni, poi colore e scritte dello stile. Per la regia normale scegli una durata o scrivi <i>regia completa</i> nelle indicazioni.',
    'La scheda di avanzamento si aggiorna da sola (10–30 min).',
    '',
    '<b>3. Il video finito</b>',
    '👍 Approva · 📤 Pubblica · ✏️ Correggi (scrivi cosa cambiare) · 🔄 Solo render (stessa regia, grafica e colori aggiornati, pochi minuti) · 🔁 Rifai da zero.',
    `🎨 <b>Cambia stile</b>: stessa regia con un altro stile. Prima 🧪 una prova dei primi ${PROVA_S} s (arriva prima), poi 🎬 il video intero se ti piace.`,
    '📤 <b>Pubblica</b>: Instagram (reel di prova, da ⚙️ Impostazioni) e YouTube Shorts. Ti mostro didascalia e titolo scritti dall\'AI (li puoi cambiare, link compresi), poi ti mando i link. Il video passa in 03 · Da pubblicare. Da collegare una volta: ⚙️ Impostazioni → 🔗 Instagram e YouTube.',
    '📼 <b>Ultimi video</b>: tutti i video finiti (anche le prove); toccane uno e te lo rimando giù con i suoi tasti.',
    '',
    '<b>Da sapere</b>',
    '🎙 Audio: microfono esterno > Insta360 > iPhone > Sony. Le camere si sincronizzano da sole.',
    '🎨 Insta360 in i-Log: riconosciuta da sola e convertita con la LUT ufficiale, esposizione compensata.',
    '🏁 Esito finale: solo se dai un giudizio (nel video o nel riepilogo), con le tue parole.',
    '⚡ Un file <code>VAI</code> segna la cartella. Non parte da sola: da Nuovo montaggio, «Tutte quelle con VAI» le monta tutte.',
    '',
    '<b>Stili nuovi, senza codice</b>',
    'Su Drive in <code>12 · Risorse/Stili</code> copia la cartella <i>_Modello nuovo stile</i> e rinominala (es. <i>Narrativo</i>). Dentro: <code>stile.txt</code> (font, colori, sottotitoli, look, musica, indicazioni per la regia), <code>asset/</code> (tuoi font .ttf/.otf, musiche .mp3, LUT .cube), <code>esempi/</code> (video di riferimento). Compare in 🎨 Stili come ✨ stile dopo 🔄 Aggiorna; per cambiarlo modifichi <code>stile.txt</code>.',
    '',
    '<b>Video in chat: attivazione (una volta)</b>',
    'Su my.telegram.org → API development tools crea un\'app e copia <i>api_id</i> e <i>api_hash</i>. Poi su GitHub (DenLeone/video-regista → Settings → Secrets and variables → Actions) aggiungi <code>TG_API_ID</code>, <code>TG_API_HASH</code> e <code>TELEGRAM_BOT_TOKEN</code> (il token del bot da @BotFather).',
    '',
    '<b>Comandi</b> · /menu · /nuovo · /video · /stato · /stili · /impostazioni · /annulla',
    '<code>/monta Nome | indicazioni</code> avvio rapido (stile predefinito, o <code>Stile: Cinematico</code> nelle indicazioni)',
  ].join('\n'),
  tasti: [[tasto('🆕 Nuovo montaggio', 'nuovo'), tasto('📼 Ultimi video', 'video')], [MENU_TASTO]],
};

// ---------- nuovo montaggio: passi ----------
// Percorso veloce: cartella → stile → riepilogo con 🚀 Avvia. Sponsor, durata, tono, giudizio,
// note e tavola si aprono dal riepilogo, solo quando servono.
type Brief = {
  cartella?: string; scritta?: string; stile?: string; sponsor?: string; durata?: string; tono?: string;
  giudizio?: string; tavola?: string; note?: string; telegram?: boolean;
};
type Passo = 'cartella' | 'stile' | 'sponsor' | 'sponsor_testo' | 'durata' | 'tono' | 'giudizio' | 'tavola' | 'note' | 'riepilogo';
type Attesa =
  | { tipo: 'nuovo'; passo: Passo; dati: Brief; msg?: number; modifica?: boolean }
  | { tipo: 'lotto'; scelte: string[]; stile?: string; msg?: number }
  | { tipo: 'nome_raccolta'; poi: 'subito' | 'domande' | 'scheda'; msg?: number }
  | { tipo: 'correzione'; nome: string; runId?: string; msg?: number }
  | { tipo: 'didascalia'; runId: string; campo: 'didascalia' | 'titolo'; msg?: number }
  // nome di una cartella scritto senza domande in sospeso: "La monto?"
  | { tipo: 'rapido'; cartella: string; msg?: number }
  // schermata da ridisegnare quando arriva l'elenco aggiornato dal workflow (stili, secret YouTube)
  | { tipo: 'schermo'; quale: 'stili' | 'collegamenti'; runId?: string; msg?: number };
const kAttesa = (chat: string) => `attesa:${chat}`;
const ORDINE: Passo[] = ['cartella', 'stile', 'riepilogo'];
// primo passo dei video mandati in chat (la cartella è già il nome dato al bot)
const PRIMO_TELEGRAM: Passo = 'stile';
const A_TESTO: Passo[] = ['cartella', 'sponsor_testo', 'giudizio', 'tavola', 'note'];
// la tavola esiste solo nel Blueprint
const conTavola = (d: Brief, stileBase: string) => (d.stile || stileBase) === 'Blueprint';
type Cartelle = { elenco: string[]; vai: string[]; aggiornato: number };

// nome scritto a mano: le cartelle più simili dell'elenco ("Giacca autunno" → "Giacca autunnale")
const normNome = (t: string) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
function distanza(a: string, b: string) {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prec = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const t = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prec + (a[i - 1] === b[j - 1] ? 0 : 1));
      prec = t;
    }
  }
  return d[b.length];
}
function simili(nome: string, elenco: string[]): string[] {
  const n = normNome(nome);
  return elenco.map((x) => ({ x, d: normNome(x).includes(n) || n.includes(normNome(x)) ? 0 : distanza(normNome(x), n) }))
    .filter((c) => c.d <= Math.max(3, n.length / 3)).sort((p, q) => p.d - q.d).slice(0, 3).map((c) => c.x);
}

// L'elenco di 01 · Da editare arriva dal workflow. Se è vecchio lo chiedo da solo (giro "elenco" ≈1 min)
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
  return c ? `<i>01 · Da editare alle ${ora(c.aggiornato).split(', ')[1]} · ⚡ = ha il file VAI${aggiorna}</i>`
    : `<i>${aggiorna ? '⏳ Recupero l\'elenco delle cartelle (≈1 min)…' : 'Elenco non disponibile: premi Aggiorna o scrivi il nome.'}</i>`;
}

// ---------- più video insieme ----------
async function schermoLotto(env: Env, a: Attesa & { tipo: 'lotto' }): Promise<Schermo> {
  const c = await leggi<Cartelle>(env, 'cartelle');
  const imp = await impostazioni(env);
  const stile = a.stile || imp.stile;
  const elenco = (c?.elenco || []).slice(0, 20);
  const tasti: Kb = elenco.map((n, i) => [tasto(`${a.scelte.includes(n) ? '✅' : '⬜'} ${c?.vai.includes(n) ? '⚡ ' : ''}${tronca(n, 34)}`, `l:t:${i}`)]);
  if (elenco.length) tasti.push([tasto('☑️ Tutte', 'l:tutte'), tasto('⬜ Nessuna', 'l:nessuna'), tasto('🔄 Aggiorna', 'l:aggiorna')]);
  else tasti.push([tasto('🔄 Aggiorna elenco', 'l:aggiorna')]);
  tasti.push(...righeStili((x) => tasto(sel(stile === x.nome, x.tasto), `l:s:${x.nome}`)));
  if (a.scelte.length) tasti.push([tasto(`🚀 Avvia ${a.scelte.length} ${a.scelte.length === 1 ? 'montaggio' : 'montaggi'} · ${stile}`, 'l:avvia')]);
  tasti.push([tasto('✖️ Annulla', 'annulla')]);
  return {
    testo: [
      '📦 <b>Più video insieme</b>', LINEA,
      'Tocca le cartelle da montare: partono tutte <b>in parallelo</b>, ognuna con la sua scheda.',
      `🎨 Stile per tutti: <b>${esc(stile)}</b> · 🧠 ${esc(motore(imp))}`,
      '<i>Indicazioni per un singolo video: un <code>brief.txt</code> nella sua cartella.</i>',
      '', await infoElenco(env),
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

function testata(a: Attesa & { tipo: 'nuovo' }) {
  const i = ORDINE.indexOf(a.passo);
  if (a.modifica || i < 0 || a.passo === 'riepilogo') return `🆕 <b>Nuovo montaggio</b>${a.dati.cartella ? ` · ${esc(a.dati.cartella)}` : ''}\n`;
  const tot = a.dati.telegram ? 1 : 2, n = a.dati.telegram ? 1 : i + 1;
  return `🆕 <b>Nuovo montaggio</b> · passo ${n}/${tot}\n<code>${'●'.repeat(n)}${'○'.repeat(tot - n)}</code>\n`;
}
const nav = (a: Attesa & { tipo: 'nuovo' }): Button[] => (a.modifica
  ? [tasto('◀ Riepilogo', 'w:riepilogo'), tasto('✖️ Annulla', 'annulla')]
  : [...(a.passo === 'stile' && !a.dati.telegram ? [tasto('◀ Indietro', 'w:indietro')] : []), tasto('✖️ Annulla', 'annulla')]);

function riassunto(d: Brief, imp: Imp): string {
  const opz = [
    d.sponsor ? `💰 ${esc(d.sponsor)}` : '',
    d.durata ? `⏱ ${esc(d.durata)}` : '',
    d.tono ? `🎭 ${esc(d.tono)}` : '',
    d.giudizio ? `🏁 ${d.giudizio === '-' ? 'nessuna scritta' : esc(d.giudizio)}` : '',
    d.tavola && conTavola(d, imp.stile) ? `📐 ${esc(d.tavola)}` : '',
  ].filter(Boolean);
  return [
    d.telegram ? `📥 <b>Video</b>       ${esc(d.cartella || '')} · file da Telegram` : `📁 <b>Cartella</b>   ${d.cartella ? esc(d.cartella) : '⚡ tutte quelle con VAI'}`,
    `🎨 <b>Stile</b>         ${esc(d.stile || imp.stile)}`,
    `⚙️ <b>Opzioni</b>    ${opz.length ? opz.join(' · ') : '<i>nessuna, regia automatica</i>'}`,
    ...(d.note ? [`📝 <b>Note</b>        ${esc(tronca(d.note, 200))}`] : []),
    `🧠 <b>AI</b>             ${esc(motore(imp))}`,
  ].join('\n');
}

async function schermoPasso(env: Env, a: Attesa & { tipo: 'nuovo' }): Promise<Schermo> {
  const d = a.dati;
  const imp = await impostazioni(env);
  switch (a.passo) {
    case 'cartella': {
      if (d.telegram) return { testo: `${testata(a)}\n✏️ <b>Come si chiama il video?</b>\nScrivimi il nome: diventa la cartella in 97 e in 98.`, tasti: [nav(a)] };
      const c = await leggi<Cartelle>(env, 'cartelle');
      const elenco = (c?.elenco || []).slice(0, 12);
      const righe: Kb = [];
      let avviso = '';
      if (d.scritta) {
        const sim = simili(d.scritta, c?.elenco || []);
        avviso = `⚠️ <b>Non trovo «${esc(d.scritta)}»</b> in 01 · Da editare.${sim.length ? ' Intendevi:' : ''}\n`;
        for (const x of sim) righe.push([tasto(`👉 ${tronca(x, 40)}`, `w:c:${(c?.elenco || []).indexOf(x)}`)]);
        righe.push([tasto(`Usa comunque «${tronca(d.scritta, 30)}»`, 'w:usa')]);
      }
      for (let i = 0; i < elenco.length; i += 2) {
        righe.push(elenco.slice(i, i + 2).map((n, j) => tasto(`${c?.vai.includes(n) ? '⚡ ' : '📁 '}${tronca(n, 22)}`, `w:c:${i + j}`)));
      }
      righe.push([tasto('⚡ Tutte quelle con VAI', 'w:c:*'), tasto('🔄 Aggiorna elenco', 'w:aggiorna')]);
      righe.push(nav(a));
      return { testo: `${testata(a)}\n${avviso}📁 <b>Quale cartella?</b>\nToccala qui sotto oppure scrivimi il nome.\n\n${await infoElenco(env)}`, tasti: righe };
    }
    case 'stile':
      return {
        testo: `${testata(a)}\n🎨 <b>Che stile?</b>\n${tuttiStili().map((x) => `${x.tasto}: <i>${x.cosa}</i>`).join('\n')}\n<i>Stili nuovi: una cartella in Drive → 12 · Risorse/Stili (vedi ❓ Guida).</i>`,
        tasti: [...righeStili((x) => tasto(`${x.tasto}${x.nome === (d.stile || imp.stile) ? ' ✓' : ''}`, `w:v:stile:${x.nome}`)), nav(a)],
        anteprima: ANTEPRIMA_URL(),
      };
    case 'sponsor':
      return { testo: `${testata(a)}\n💰 <b>C'è uno sponsor?</b>`, tasti: [[tasto('No', 'w:v:sponsor:no'), tasto('Sì', 'w:v:sponsor:si')], nav(a)] };
    case 'sponsor_testo':
      return { testo: `${testata(a)}\n💰 Scrivimi <b>marca/prodotto</b> e <b>cosa si testa</b>.\n<i>es. eSUN PETG, stampa Benchy veloce</i>`, tasti: [nav(a)] };
    case 'durata':
      return { testo: `${testata(a)}\n⏱ <b>Quanto deve durare?</b>`, tasti: [[tasto('30 s', 'w:v:durata:30 s'), tasto('45 s', 'w:v:durata:45 s'), tasto('60 s', 'w:v:durata:60 s')], [tasto('Automatica', 'w:v:durata:')], nav(a)] };
    case 'tono':
      return { testo: `${testata(a)}\n🎭 <b>Che tono?</b>`, tasti: [[tasto('Diretto', 'w:v:tono:diretto'), tasto('Ironico', 'w:v:tono:ironico')], [tasto('Tecnico', 'w:v:tono:tecnico'), tasto('Entusiasta', 'w:v:tono:entusiasta')], [tasto('Automatico', 'w:v:tono:')], nav(a)] };
    case 'giudizio':
      return {
        testo: `${testata(a)}\n🏁 <b>Giudizio finale?</b>\nDiventa la scritta di chiusura, con le tue parole. Tocca o scrivilo (es. <code>8/10</code>, <code>da prendere</code>).\n<i>Dal video: lo prendo da quello che dici, se lo dici.</i>`,
        tasti: [
          [tasto('PROMOSSO ✓', 'w:v:giudizio:PROMOSSO ✓'), tasto('CI STA', 'w:v:giudizio:CI STA'), tasto('NON È MALE', 'w:v:giudizio:NON È MALE')],
          [tasto('BOCCIATO ✗', 'w:v:giudizio:BOCCIATO ✗'), tasto('Nessuna scritta', 'w:v:giudizio:-'), tasto('Dal video', 'w:v:giudizio:')],
          nav(a),
        ],
      };
    case 'tavola':
      return { testo: `${testata(a)}\n📐 <b>Numero tavola?</b>\nScrivilo (es. <code>TAV. 05</code>) oppure:`, tasti: [[tasto('Automatica', 'w:v:tavola:')], nav(a)] };
    case 'note':
      return { testo: `${testata(a)}\n📝 <b>Indicazioni per la regia?</b>\nCosa dire del prodotto, battute, cosa evitare… scrivilo oppure:`, tasti: [[tasto('Nessuna', 'w:v:note:')], nav(a)] };
    case 'riepilogo':
      return {
        testo: `🆕 <b>Nuovo montaggio</b> · pronto\n\n${riassunto(d, imp)}\n\n<i>🚀 per partire, oppure aggiungi un'opzione.</i>`,
        tasti: [
          [tasto('🚀 Avvia montaggio', 'w:avvia')],
          [...(d.telegram ? [] : [tasto('📁 Cartella', 'w:mod:cartella')]), tasto('🎨 Stile', 'w:mod:stile'), tasto('💰 Sponsor', 'w:mod:sponsor')],
          [tasto('⏱ Durata', 'w:mod:durata'), tasto('🎭 Tono', 'w:mod:tono'), tasto('🏁 Giudizio', 'w:mod:giudizio')],
          [tasto('📝 Note', 'w:mod:note'), ...(conTavola(d, imp.stile) ? [tasto('📐 Tavola', 'w:mod:tavola')] : []), tasto('✖️ Annulla', 'annulla')],
        ],
      };
  }
}

async function vaiAPasso(env: Env, chat: string, a: Attesa & { tipo: 'nuovo' }, msgId?: number, nuovoMessaggio = false) {
  if (a.passo === 'cartella' && !a.dati.telegram) await richiediElenco(env, chat);
  a.msg = await mostra(env, chat, await schermoPasso(env, a), nuovoMessaggio ? undefined : (msgId ?? a.msg));
  await mem(env).scrivi(kAttesa(chat), a);
}

function prossimo(a: Attesa & { tipo: 'nuovo' }, appena: Passo, valore: string): Passo {
  if (appena === 'sponsor' && valore === 'si') return 'sponsor_testo';
  if (a.modifica) return 'riepilogo';
  const i = ORDINE.indexOf(appena);
  return i >= 0 ? ORDINE[i + 1] || 'riepilogo' : 'riepilogo';
}

async function rispondiPasso(env: Env, chat: string, a: Attesa & { tipo: 'nuovo' }, valore: string, msgId?: number, scritto = false) {
  const d = { ...a.dati };
  const p = a.passo;
  if (p === 'cartella') {
    // scritta a mano: deve esistere in 97 (altrimenti il montaggio fallirebbe dopo minuti)
    if (scritto && !d.telegram) {
      const c = await leggi<Cartelle>(env, 'cartelle');
      const esatta = c?.elenco.find((n) => normNome(n) === normNome(valore));
      if (esatta) valore = esatta;
      else if (c?.elenco.length) return vaiAPasso(env, chat, { ...a, dati: { ...d, scritta: valore } }, msgId, scritto);
    }
    d.cartella = valore;
    delete d.scritta;
  } else if (p === 'stile') d.stile = nomeStile(valore) || d.stile;
  else if (p === 'sponsor' && valore !== 'si') d.sponsor = '';
  else if (p === 'sponsor_testo') d.sponsor = valore;
  else if (p === 'durata') d.durata = valore;
  else if (p === 'tono') d.tono = valore;
  else if (p === 'giudizio') d.giudizio = valore;
  else if (p === 'tavola') d.tavola = valore;
  else if (p === 'note') d.note = valore;
  await vaiAPasso(env, chat, { ...a, dati: d, passo: prossimo(a, p, valore) }, msgId, scritto);
}

const componiBrief = (d: Brief, stileBase: string) => [
  `Stile: ${d.stile || stileBase}`,
  d.sponsor ? `Sponsor: ${d.sponsor}` : '',
  d.durata ? `Durata: ${d.durata}` : '', d.tono ? `Tono: ${d.tono}` : '',
  d.giudizio ? (d.giudizio === '-' ? 'Giudizio finale: nessuno, niente scritta di esito' : `Giudizio finale: ${d.giudizio}`) : '',
  d.tavola && conTavola(d, stileBase) ? `Tavola: ${d.tavola}` : '', d.note ? `Note: ${d.note}` : '',
].filter(Boolean).join('. ');
// avvii senza domande (/monta, video in chat "Monta subito"): stile predefinito se non è già indicato
const conStile = (brief: string, stileBase: string) => (/\bstile\s*:/i.test(brief) ? brief : [`Stile: ${stileBase}`, brief].filter(Boolean).join('. '));

// avvio: il messaggio diventa la scheda "in coda", poi la adotta il primo aggiornamento del giro
async function lancia(env: Env, chat: string, i: Inputs, msgId?: number): Promise<string | null> {
  await mem(env).cancella(kAttesa(chat));
  const imp = await impostazioni(env);
  const err = await avvia(env, i, imp);
  if (err) {
    await mostra(env, chat, { testo: `⚠️ <b>Non sono riuscito ad avviare</b>\n<code>${esc(tronca(err, 500))}</code>`, tasti: [[MENU_TASTO]] }, msgId);
    return err;
  }
  const card: Card = {
    nome: i.cartella || '⚡ cartelle con VAI', fasi: {}, minuti: 0, msg: {}, inCoda: true,
    versione: imp.versione === 'beta' ? 'v2 beta' : undefined, brief: i.brief, correzione: i.correzione,
    prova: i.secondi, soloRender: i.azione === 'render',
  };
  const id = await mostra(env, chat, { testo: scheda(card), tasti: [[tasto('📊 Stato', 'stato'), MENU_TASTO]] }, msgId);
  const pendenti = ((await leggi<Pendente[]>(env, 'pendenti')) || []).filter((p) => Date.now() - p.quando < 40 * 60000);
  pendenti.push({ nome: i.cartella || '', chat, msg: id, quando: Date.now(), card, origine: i.origine || '97', azione: i.azione, secondi: i.secondi });
  await mem(env).scrivi('pendenti', pendenti);
  return null;
}

// nome di una cartella di 97 scritto in chat (senza domande in sospeso): propongo di montarla.
// Testo lungo, domande o niente di simile: false (si mostra il pannello come prima).
async function proponiCartella(env: Env, chat: string, testo: string): Promise<boolean> {
  if (!testo || testo.length > 60 || /[?\n]/.test(testo)) return false;
  const elenco = (await leggi<Cartelle>(env, 'cartelle'))?.elenco || [];
  const esatta = elenco.find((n) => normNome(n) === normNome(testo));
  if (esatta) { await mostraRapido(env, chat, esatta); return true; }
  if (normNome(testo).length < 4) return false;
  const sim = simili(testo, elenco);
  if (!sim.length) return false;
  await invia(env, chat, {
    testo: `📁 <b>Non trovo «${esc(testo)}»</b> in 01 · Da editare. Intendevi:`,
    tasti: [...sim.map((x) => [tasto(`👉 ${tronca(x, 40)}`, `q:c:${elenco.indexOf(x)}`)]), [MENU_TASTO]],
  });
  return true;
}
async function mostraRapido(env: Env, chat: string, cartella: string, msgId?: number) {
  const imp = await impostazioni(env);
  const c = await leggi<Cartelle>(env, 'cartelle');
  const id = await mostra(env, chat, {
    testo: `📁 <b>${esc(cartella)}</b> · in 01 · Da editare${c?.vai.includes(cartella) ? ' · ⚡ ha il VAI' : ''}\nLa monto adesso?\n\n${riassunto({ cartella }, imp)}`,
    tasti: [[tasto(`🚀 Monta · ${imp.stile}`, 'q:m')], [tasto('⚙️ Stile e opzioni', 'q:o'), tasto('✖️ No', 'annulla')]],
  }, msgId);
  await mem(env).scrivi(kAttesa(chat), { tipo: 'rapido', cartella, msg: id } satisfies Attesa);
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
  const imp = await impostazioni(env);
  const righe = [
    '📥 <b>Nuovo video da Telegram</b>', LINEA,
    ...((await fileInChatPronti(env)) === false ? ['⚠️ <b>I video in chat non sono ancora attivi</b>: mancano le chiavi Telegram su GitHub (vedi ❓ Guida). Il montaggio fallirebbe: per ora caricali su Drive in 97.', ''] : []),
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
      [tasto(`🚀 Monta subito · ${imp.stile}`, 'r:subito'), tasto('⚙️ Stile e opzioni', 'r:domande')],
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
  if (a.poi === 'subito') return lanciaRaccolta(env, chat, nome, conStile('', (await impostazioni(env)).stile));
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
    if (nome === 'video') return invia(env, chat, await schermoVideo(env));
    if (nome === 'stili') return invia(env, chat, await schermoStili(env));
    if (nome === 'impostazioni') return invia(env, chat, await schermoImpostazioni(env));
    if (nome === 'aiuto' || nome === 'guida') return invia(env, chat, GUIDA);
    if (nome === 'social') return social(env, chat);
    if (nome === 'tiktok') return invia(env, chat, await schermoTikTok(env));
    if (nome === 'nuovo') return vaiAPasso(env, chat, { tipo: 'nuovo', passo: 'cartella', dati: {} });
    if (nome === 'monta') {
      const [cartella = '', brief = ''] = resto.split('|').map((s) => s.trim());
      return lancia(env, chat, { cartella, brief: conStile(brief, (await impostazioni(env)).stile) });
    }
    return invia(env, chat, await pannello(env)); // /start, /menu e comandi sconosciuti
  }

  // testo libero: risposta a una domanda in sospeso?
  const attesa = await leggi<Attesa>(env, kAttesa(chat));
  if (attesa?.tipo === 'nome_raccolta' && text) return nomeRaccolta(env, chat, attesa, nomeDaDidascalia(text) || nomeAutomatico());
  if (attesa?.tipo === 'didascalia' && text) {
    await togliTasti(env, chat, attesa.msg);
    await mem(env).cancella(kAttesa(chat));
    const memo = await leggi<RunMemo>(env, `run:${attesa.runId}`);
    if (!memo?.pubblica) return invia(env, chat, { testo: 'Non trovo più questo video.', tasti: [[MENU_TASTO]] });
    const pubblica = attesa.campo === 'titolo'
      ? { ...memo.pubblica, youtube: { ...(memo.pubblica.youtube || {}), titolo: text.replace(/\s+/g, ' ').slice(0, 100) } }
      : { ...memo.pubblica, didascalia: text.slice(0, 2200) };
    const nuovo = { ...memo, pubblica } satisfies RunMemo;
    await mem(env).scrivi(`run:${attesa.runId}`, nuovo);
    return invia(env, chat, await schermoPubblica(env, attesa.runId, nuovo));
  }
  if (attesa?.tipo === 'correzione') {
    await togliTasti(env, chat, attesa.msg);
    const memo = attesa.runId ? await leggi<RunMemo | string>(env, `run:${attesa.runId}`) : undefined;
    return lancia(env, chat, { cartella: attesa.nome, origine: '98', correzione: text, brief: typeof memo === 'object' ? memo?.brief : undefined });
  }
  if (attesa?.tipo === 'nuovo' && A_TESTO.includes(attesa.passo) && text) return rispondiPasso(env, chat, attesa, text, undefined, true);
  if (await proponiCartella(env, chat, text)) return;
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
  if (data === 'social') { await avviso(); return social(env, chat); }
  if (data === 'stato') { await avviso(); return mostra(env, chat, await schermoStato(env), msgId); }
  if (data === 'imp') { await avviso(); return mostra(env, chat, await schermoImpostazioni(env), msgId); }
  if (data === 'guida') { await avviso(); return mostra(env, chat, GUIDA, msgId); }
  if (data === 'annulla') { await avviso('Annullato'); await mem(env).cancella(kAttesa(chat)); return mostra(env, chat, await pannello(env), msgId); }
  if (data === 'nuovo') { await avviso(); return vaiAPasso(env, chat, { tipo: 'nuovo', passo: 'cartella', dati: {} }, msgId); }
  if (data === 'lotto') { await avviso(); return mostraLotto(env, chat, { tipo: 'lotto', scelte: [] }, msgId); }
  if (data === 'video') { await avviso(); return mostra(env, chat, await schermoVideo(env), msgId); }
  if (data === 'stili') { await avviso(); return mostra(env, chat, await schermoStili(env), msgId); }
  if (data === 'col') { await avviso(); return mostra(env, chat, await schermoCollegamenti(env), msgId); }

  // 📼 ultimi video: rimando giù il video con i suoi tasti
  if (data.startsWith('vid:')) {
    const v = ((await leggi<VideoFatto[]>(env, 'video')) || []).find((x) => x.runId === data.slice(4));
    if (!v) { await avviso('Non lo trovo più'); return mostra(env, chat, await schermoVideo(env), msgId); }
    await avviso();
    return rimandaVideo(env, chat, v);
  }

  // 🎨 stili: predefinito e aggiornamento dell'elenco da Drive
  if (data.startsWith('st:')) {
    const [, azione, ...resto] = data.split(':');
    if (azione === 'def') {
      const stile = nomeStile(resto.join(':'));
      if (stile) await mem(env).scrivi('impostazioni', { ...(await impostazioni(env)), stile } satisfies Imp);
      await avviso(stile ? `Predefinito: ${stile}` : 'Stile non trovato');
    } else if (azione === 'agg') {
      await avviso((await richiediElenco(env, chat, true)) ? 'Aggiorno da Drive, ≈1 min' : 'Elenco non disponibile');
      await mem(env).scrivi(kAttesa(chat), { tipo: 'schermo', quale: 'stili', msg: msgId } satisfies Attesa);
    } else await avviso();
    return mostra(env, chat, await schermoStili(env), msgId);
  }

  // 🔗 collegamenti: "Verifica" chiede al workflow se i secret di YouTube ci sono (giro "elenco")
  if (data === 'colv' || data.startsWith('colv:')) {
    const runId = data.split(':')[1];
    await avviso((await richiediElenco(env, chat, true)) ? 'Controllo su GitHub, ≈1 min' : 'Non riesco a controllare adesso');
    await mem(env).scrivi(kAttesa(chat), { tipo: 'schermo', quale: 'collegamenti', runId, msg: msgId } satisfies Attesa);
    return mostra(env, chat, await schermoCollegamenti(env, runId), msgId);
  }

  // nome di cartella scritto in chat: 👉 suggerimento, 🚀 monta, ⚙️ opzioni
  if (data.startsWith('q:')) {
    const [, azione, x = ''] = data.split(':');
    if (azione === 'c') {
      const nome = (await leggi<Cartelle>(env, 'cartelle'))?.elenco[Number(x)];
      if (!nome) { await avviso('Elenco cambiato, riscrivi il nome'); return; }
      await avviso();
      return mostraRapido(env, chat, nome, msgId);
    }
    const a = await leggi<Attesa>(env, kAttesa(chat));
    if (a?.tipo !== 'rapido') { await avviso('Questa proposta è scaduta'); return mostra(env, chat, await pannello(env), msgId); }
    if (azione === 'm') { await avviso('Avvio…'); return lancia(env, chat, { cartella: a.cartella, brief: `Stile: ${(await impostazioni(env)).stile}` }, msgId); }
    if (azione === 'o') { await avviso(); return vaiAPasso(env, chat, { tipo: 'nuovo', passo: 'stile', dati: { cartella: a.cartella } }, msgId); }
    return avviso();
  }

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
    if (nome && azione === 'subito') { await avviso('Avvio…'); return lanciaRaccolta(env, chat, nome, conStile('', (await impostazioni(env)).stile), msgId); }
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
    else if (azione === 's') a.stile = nomeStile(x) || a.stile;
    else if (azione === 'aggiorna') { await avviso((await richiediElenco(env, chat, true)) ? 'Aggiorno l\'elenco, ≈1 min' : 'Elenco non disponibile'); return mostraLotto(env, chat, a, msgId); }
    else if (azione === 'avvia' && a.scelte.length) {
      await avviso(`Avvio ${a.scelte.length}…`);
      const scelte = [...a.scelte];
      const stile = a.stile || (await impostazioni(env)).stile;
      await mostra(env, chat, { testo: `📦 <b>Avviati ${scelte.length} montaggi in parallelo</b> · ${esc(stile)}\n${scelte.map((n) => `• ${esc(n)}`).join('\n')}\n\n<i>Ognuno ha la sua scheda qui sotto; il video arriva appena è pronto.</i>`, tasti: [[tasto('📊 Stato', 'stato'), MENU_TASTO]] }, msgId);
      for (const n of scelte) await lancia(env, chat, { cartella: n, brief: `Stile: ${stile}` });
      return;
    }
    await avviso();
    return mostraLotto(env, chat, a, msgId);
  }
  if (data === 'noop') return avviso();

  if (data.startsWith('i:')) {
    const [, chiave, valore] = data.split(':') as [string, keyof Imp | 'avanzate', string];
    if (chiave === 'avanzate') { await avviso(); return mostra(env, chat, await schermoAvanzate(env), msgId); }
    const imp = { ...(await impostazioni(env)), [chiave]: valore } as Imp;
    await mem(env).scrivi('impostazioni', imp);
    await avviso('Salvato');
    return mostra(env, chat, chiave === 'versione' || chiave === 'modello' ? await schermoAvanzate(env) : await schermoImpostazioni(env), msgId);
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
      await avviso();
      return vaiAPasso(env, chat, { ...a, passo: ORDINE[Math.max(0, ORDINE.indexOf(a.passo) - 1)] }, msgId);
    }
    if (azione === 'usa' && a.passo === 'cartella' && a.dati.scritta) { await avviso(); return rispondiPasso(env, chat, a, a.dati.scritta, msgId); }
    if (azione === 'riepilogo') { await avviso(); return vaiAPasso(env, chat, { ...a, passo: 'riepilogo', modifica: false }, msgId); }
    if (azione === 'mod') { await avviso(); return vaiAPasso(env, chat, { ...a, passo: x as Passo, modifica: true }, msgId); }
    if (azione === 'avvia') {
      await avviso('Avvio…');
      const brief = componiBrief(a.dati, (await impostazioni(env)).stile);
      if (a.dati.telegram) return lanciaRaccolta(env, chat, a.dati.cartella || '', brief, msgId);
      return lancia(env, chat, { cartella: a.dati.cartella, brief }, msgId);
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

  // tasti sul video finito / sull'errore (stile: terza parte, per Cambia stile)
  const [azione, runId, ...resto] = data.split(':');
  const memoGrezzo = runId ? await leggi<RunMemo | string>(env, `run:${runId}`) : undefined;
  const memo: RunMemo | undefined = typeof memoGrezzo === 'string' ? { nome: memoGrezzo } : memoGrezzo;
  if (!memo) return avviso('Non trovo più questo montaggio');
  if (azione === 'ok') {
    await avviso('Approvato ✔︎');
    await mem(env).scrivi(`run:${runId}`, { ...memo, approvato: true });
    return tg(env, 'editMessageReplyMarkup', { chat_id: chat, message_id: msgId, reply_markup: { inline_keyboard: [[tasto('✔︎ Approvato', 'noop'), tasto('📤 Pubblica', `pub:${runId}`)], [link('📂 Drive', URL_98)]] } });
  }
  if (azione.startsWith('pub')) return tastoPubblica(env, chat, azione, runId, memo, msgId, avviso);
  // 🎨 Cambia stile: scelta dello stile → 🧪 prova dei primi secondi o 🎬 video intero, con la stessa regia
  if (azione === 'stl') { await avviso(); return mostra(env, chat, schermoCambiaStile(runId, memo), msgId); }
  if (azione === 'sts' || azione === 'sp' || azione === 'sv') {
    const stile = nomeStile(resto.join(':'));
    if (!stile) { await avviso('Stile non trovato'); return mostra(env, chat, schermoCambiaStile(runId, memo), msgId); }
    if (azione === 'sts') { await avviso(); return mostra(env, chat, schermoProvaStile(runId, memo, stile), msgId); }
    await avviso(azione === 'sp' ? `Prova ${PROVA_S} s · ${stile}…` : `Video intero · ${stile}…`);
    return lancia(env, chat, { cartella: memo.nome, origine: '98', brief: conAltroStile(memo.brief, stile), azione: 'render', secondi: azione === 'sp' ? PROVA_S : undefined }, msgId);
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
      testo: `🔁 <b>Rifaccio ${esc(memo.nome)} da zero?</b>\nNuova regia con ${esc(motore(imp))}: tagli e testo possono cambiare.\n<i>Per tenere la stessa regia usa 🔄 Solo render (colore e grafica aggiornati) o 🎨 Cambia stile. Il video attuale resta su Drive.</i>`,
      tasti: [[tasto('✅ Sì, rifai', `redo!:${runId}`), tasto('✖️ No', 'annulla')]],
    });
  }
  if (azione === 'redo!') { await avviso('Avvio…'); return lancia(env, chat, { cartella: memo.nome, origine: '98', brief: memo.brief }, msgId); }
  // stessa regia, nuovo render (colore, grafica, stile aggiornati): niente AI, pochi minuti
  if (azione === 'ren') { await avviso('Rifaccio il render…'); return lancia(env, chat, { cartella: memo.nome, origine: '98', brief: memo.brief, azione: 'render' }); }
  if (azione === 'retry') {
    await avviso('Riprovo…');
    return lancia(env, chat, {
      cartella: memo.nome, origine: memo.origine || (memo.correzione || memo.azione ? '98' : '97'), correzione: memo.correzione, brief: memo.brief,
      azione: memo.azione, secondi: memo.secondi,
    });
  }
  return avviso();
}

function schermoCambiaStile(runId: string, memo: RunMemo): Schermo {
  const attuale = memo.stile || stileDelBrief(memo.brief);
  return {
    testo: [
      `🎨 <b>Cambia stile</b> · ${esc(memo.nome)}`, LINEA,
      'Stessa regia (tagli, testo, parole chiave): cambiano grafica, colore e sottotitoli.',
      ...(attuale ? [`Adesso: <b>${esc(attuale)}</b>`] : []), '',
      ...tuttiStili().map((x) => `${x.tasto}: <i>${esc(tronca(x.cosa, 90))}</i>`),
    ].join('\n'),
    tasti: [...righeStili((x) => tasto(`${x.tasto}${x.nome === attuale ? ' ✓' : ''}`, `sts:${runId}:${x.nome}`)), [tasto('✖️ Annulla', 'annulla')]],
  };
}
function schermoProvaStile(runId: string, memo: RunMemo, stile: string): Schermo {
  return {
    testo: [
      `🎨 <b>${esc(memo.nome)}</b> in stile <b>${esc(stile)}</b>`, LINEA,
      `🧪 <b>Prova ${PROVA_S} s</b>: solo l'inizio, arriva prima. Per vedere colore e grafica.`,
      '🎬 <b>Video intero</b>: tutto il video con il nuovo stile, come nuova versione in 98.',
      '<i>Il video attuale resta su Drive.</i>',
    ].join('\n'),
    tasti: [
      [tasto(`🧪 Prova ${PROVA_S} s`, `sp:${runId}:${stile}`), tasto('🎬 Video intero', `sv:${runId}:${stile}`)],
      [tasto('◀ Stili', `stl:${runId}`), tasto('✖️ Annulla', 'annulla')],
    ],
  };
}

// ---------- 📤 Pubblica: Instagram (reel di prova) e YouTube Shorts ----------
// Il bot avvia il workflow "pubblica" (scripts/pubblica.mjs) con l'ID del video su Drive, la
// didascalia e le scelte di Denis; il workflow risponde su /notify (tipo 'pubblicato') con lo
// stesso codice monouso (nonce), così l'esito arriva sul messaggio giusto.
const PUB_WORKFLOW = 'pubblica.yml';

// dove si pubblica davvero: scelto da Denis e collegato (YouTube non ancora saputo = si prova)
const destinazioni = (p: Pubblica, c: Collegamenti) => ({ ig: p.ig !== false && c.ig, yt: p.yt !== false && c.yt !== false });

async function schermoPubblica(env: Env, runId: string, memo: RunMemo): Promise<Schermo> {
  const p = memo.pubblica!;
  const imp = await impostazioni(env);
  const c = await collegamenti(env);
  const { ig, yt } = destinazioni(p, c);
  const titolo = p.youtube?.titolo || memo.nome;
  const daCollegare = !c.ig || c.yt === false;
  return {
    testo: [
      `📤 <b>Pubblico ${esc(memo.nome)}</b>`, LINEA,
      `📸 Instagram: ${!c.ig ? '⚠️ <i>da collegare</i>' : ig ? esc(PROVA[imp.prova].nome) : '<i>no</i>'}`,
      `▶️ YouTube Shorts: ${c.yt === false ? '⚠️ <i>da collegare</i>' : yt ? `«${esc(titolo)}»` : '<i>no</i>'}`,
      p.didascalia ? `<blockquote expandable>${esc(p.didascalia)}</blockquote>` : '<i>Nessuna didascalia: scrivila con ✏️ (o pubblica senza).</i>',
      '<i>La didascalia vale anche come descrizione su YouTube. Per cambiarla (o aggiungere un link) premi ✏️ e mandami il testo nuovo.</i>',
      ...(daCollegare ? ['🔗 <i>Per collegare quello che manca (una volta sola): tasto qui sotto.</i>'] : []),
    ].join('\n'),
    tasti: [
      ...(ig || yt ? [[tasto(`✅ Pubblica${ig && yt ? '' : ig ? ' su Instagram' : ' su YouTube'}`, `pub!:${runId}`)]] : []),
      [...(c.ig ? [tasto(`${ig ? '✅' : '⬜️'} Instagram`, `pubig:${runId}`)] : []), ...(c.yt !== false ? [tasto(`${yt ? '✅' : '⬜️'} YouTube`, `pubyt:${runId}`)] : [])],
      [tasto('✏️ Didascalia', `pubm:${runId}`), tasto('✏️ Titolo YouTube', `pubt:${runId}`)],
      [...(daCollegare ? [tasto('🔗 Collega', `pubguida:${runId}`)] : []), tasto('✖️ Annulla', 'annulla')],
    ],
  };
}

async function confermaPubblicazione(env: Env, chat: string, runId: string, memo: RunMemo, msgId?: number): Promise<string | null> {
  if (!memo.pubblica?.fileId || !memo.pubblica.file) return 'Mancano i dati per pubblicare. Rifallo con Solo render.';
  if (memo.pubblicato === 'in corso') return 'Pubblicazione già in corso';
  if (memo.pubblicato) return 'Già pubblicato';
  const imp = await impostazioni(env);
  const p = memo.pubblica;
  const dest = destinazioni(p, await collegamenti(env));
  if (!dest.ig && !dest.yt) return p.ig === false && p.yt === false ? 'Scegli almeno Instagram o YouTube' : 'Prima collega Instagram o YouTube';
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const dati = {
    nonce, nome: memo.nome, file: p.file, fileId: p.fileId, didascalia: p.didascalia, titolo: p.youtube?.titolo || memo.nome,
    copertina: p.copertina ?? 0, ...(p.copertinaId ? { copertinaId: p.copertinaId } : {}), ig: dest.ig, yt: dest.yt, prova: PROVA[imp.prova].api,
  };
  const r = await gh(env, `/actions/workflows/${PUB_WORKFLOW}/dispatches`, { method: 'POST', body: JSON.stringify({ ref: 'main', inputs: { dati: JSON.stringify(dati) } }) });
  if (r.status !== 204) return `GitHub ${r.status}: ${(await r.text()).slice(0, 300)}`;
  await mem(env).scrivi(`run:${runId}`, { ...memo, pubblicato: 'in corso' } satisfies RunMemo);
  await mem(env).scrivi(`pub:${nonce}`, { runId, chat, msg: msgId });
  const dove = [dati.ig ? `📸 Instagram (${PROVA[imp.prova].nome})` : '', dati.yt ? '▶️ YouTube Shorts' : ''].filter(Boolean).join('\n');
  await mostra(env, chat, { testo: `⏳ <b>Pubblico ${esc(memo.nome)}</b>\n${dove}\n<i>2–4 minuti: ti scrivo qui i link appena è online.</i>` }, msgId);
  return null;
}

async function tastoPubblica(env: Env, chat: string, azione: string, runId: string, memo: RunMemo, msgId: number | undefined, avviso: (t?: string) => Promise<unknown>) {
  if (!memo.pubblica?.fileId || !memo.pubblica.file) {
    await avviso();
    return invia(env, chat, { testo: `📤 Per <b>${esc(memo.nome)}</b> non ho i dati per pubblicare (video fatto prima del tasto Pubblica, o render di prova).\nRifallo con 🔄 <b>Solo render</b>: pochi minuti, stessa regia, e arriva con didascalia e titolo pronti.`, tasti: [[tasto('🔄 Solo render', `ren:${runId}`)]] });
  }
  if (memo.pubblicato) {
    await avviso(memo.pubblicato === 'in corso' ? 'Pubblicazione già in corso' : 'Già pubblicato');
    return memo.pubblicato === 'in corso' ? undefined : invia(env, chat, { testo: `✅ <b>${esc(memo.nome)}</b> è già pubblicato.\n${memo.pubblicato}`, tasti: [[MENU_TASTO]] });
  }
  const imp = await impostazioni(env);
  if (azione === 'pub') { await avviso(); return invia(env, chat, await schermoPubblica(env, runId, memo)); }
  if (azione === 'pubr') { await avviso(); return mostra(env, chat, await schermoPubblica(env, runId, memo), msgId); }
  if (azione === 'pubguida') { await avviso(); return mostra(env, chat, await schermoCollegamenti(env, runId), msgId); }
  if (azione === 'pubig' || azione === 'pubyt') {
    const k = azione === 'pubig' ? 'ig' : 'yt';
    const nuovo = { ...memo, pubblica: { ...memo.pubblica, [k]: memo.pubblica[k] === false } } satisfies RunMemo;
    await mem(env).scrivi(`run:${runId}`, nuovo);
    await avviso();
    return mostra(env, chat, await schermoPubblica(env, runId, nuovo), msgId);
  }
  if (azione === 'pubm' || azione === 'pubt') {
    await avviso();
    const campo = azione === 'pubt' ? 'titolo' : 'didascalia';
    const attuale = campo === 'titolo' ? memo.pubblica.youtube?.titolo || memo.nome : memo.pubblica.didascalia;
    const id = await mostra(env, chat, {
      testo: `✏️ <b>Mandami ${campo === 'titolo' ? 'il titolo nuovo per YouTube' : 'la didascalia nuova'}</b> per ${esc(memo.nome)}${campo === 'didascalia' ? ' (hashtag e link compresi)' : ' (max 100 caratteri)'}.\nAttuale:\n<code>${esc(attuale || '—')}</code>`,
      tasti: [[tasto('✖️ Annulla', 'annulla')]],
    }, msgId);
    return mem(env).scrivi(kAttesa(chat), { tipo: 'didascalia', runId, campo, msg: id } satisfies Attesa);
  }
  if (azione !== 'pub!') return avviso();
  await avviso('Avvio la pubblicazione…');
  const err = await confermaPubblicazione(env, chat, runId, memo, msgId);
  if (err) return mostra(env, chat, { testo: `⚠️ <b>Non sono riuscito ad avviare la pubblicazione</b>\n<code>${esc(tronca(err, 400))}</code>`, tasti: [[tasto('🔁 Riprova', `pub!:${runId}`), MENU_TASTO]] }, msgId);
}

type EsitoPiattaforma = { ok: boolean; link?: string; errore?: string; saltato?: boolean; prova?: boolean; privato?: boolean };
async function onPubblicato(env: Env, n: { nonce?: string; nome?: string; instagram?: EsitoPiattaforma; youtube?: EsitoPiattaforma; spostato?: boolean; errore?: string; run_url?: string }) {
  const k = `pub:${String(n.nonce || '').replace(/[^0-9a-f]/gi, '')}`;
  const p = n.nonce ? await leggi<{ runId: string; chat: string; msg?: number }>(env, k) : undefined;
  if (!p) return;
  await mem(env).cancella(k);
  const memo = await leggi<RunMemo>(env, `run:${p.runId}`);
  const nome = memo?.nome || n.nome || 'Il video';
  const riga = (icona: string, chi: string, e?: EsitoPiattaforma, extra = '') => !e ? ''
    : e.ok ? `${icona} ${chi}: ✅ online${extra}` : e.saltato ? `${icona} ${chi}: <i>${esc(e.errore || 'saltato')}</i>` : `${icona} ${chi}: ❌ ${esc(tronca(e.errore || 'errore', 300))}`;
  const righe = [
    riga('📸', 'Instagram', n.instagram, n.instagram?.prova ? ' come reel di prova (lo vedono prima i non follower)' : ''),
    riga('▶️', 'YouTube', n.youtube, n.youtube?.privato ? '\n<i>⚠️ YouTube lo tiene privato finché il collegamento non è verificato: rendilo pubblico da YouTube Studio.</i>' : ''),
    n.errore ? `⚠️ ${esc(tronca(n.errore, 300))}` : '',
    n.spostato ? '<i>Il video è in 03 · Da pubblicare.</i>' : '',
  ].filter(Boolean);
  const riuscito = Boolean(n.instagram?.ok || n.youtube?.ok);
  const links = [
    ...(n.instagram?.ok && n.instagram.link ? [link('📸 Apri su Instagram', n.instagram.link)] : []),
    ...(n.youtube?.ok && n.youtube.link ? [link('▶️ Apri su YouTube', n.youtube.link)] : []),
  ];
  if (memo) {
    const fatto = [n.instagram?.ok ? `📸 ${n.instagram.link}` : '', n.youtube?.ok ? `▶️ ${n.youtube.link}` : ''].filter(Boolean).join('\n');
    // pubblicato da una parte sola: l'altra si può ritentare (il video è già in 99, quindi solo da qui)
    await mem(env).scrivi(`run:${p.runId}`, { ...memo, pubblicato: riuscito ? fatto : undefined } satisfies RunMemo);
  }
  await mostra(env, p.chat, {
    testo: `${riuscito ? '✅' : '❌'} <b>${esc(nome)}</b>\n${righe.join('\n')}`,
    tasti: [
      ...(links.length ? [links] : []),
      [...(!riuscito ? [tasto('🔁 Riprova', `pub!:${p.runId}`)] : []), ...(n.run_url ? [link('🔧 Log', n.run_url)] : []), MENU_TASTO],
    ],
  }, p.msg);
}

// chiave Instagram: la prima arriva dal secret IG_TOKEN, poi il bot la rinnova ogni settimana
// (dura 60 giorni) e tiene in memoria quella nuova
type ChiaveIg = { token: string; rinnovata: number };
async function chiaveInstagram(env: Env): Promise<string | undefined> {
  return (await leggi<ChiaveIg>(env, 'ig_token'))?.token || env.IG_TOKEN || undefined;
}
async function rinnovaChiaveInstagram(env: Env) {
  const token = await chiaveInstagram(env);
  if (!token) return;
  const r = await fetch(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`);
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; error?: { message?: string } };
  if (r.ok && j.access_token) { await mem(env).scrivi('ig_token', { token: j.access_token, rinnovata: Date.now() } satisfies ChiaveIg); return; }
  for (const chat of autorizzati(env)) {
    await invia(env, chat, { testo: `⚠️ <b>Chiave di Instagram non rinnovata</b>\n<code>${esc(tronca(j.error?.message || `HTTP ${r.status}`, 300))}</code>\nSe è scaduta, generane una nuova (Meta for Developers) e aggiorna il secret IG_TOKEN su Cloudflare.`, tasti: [[MENU_TASTO]] }, true);
  }
}

// ---------- notifiche da regista.mjs ----------
// prova: render di prova (primi N s); link: il video su Drive; esempi/link: analisi degli esempi di uno stile
type Info = {
  file?: string; durata?: number; tagli?: number; sorgenti?: number; voce?: string; keywords?: string[]; note?: string; stile?: string;
  ai?: { chi: string; modello: string; input: number; output: number; usd?: number } | null; minuti?: number; correzione?: string; errore?: string;
  pubblica?: Pubblica; prova?: number; link?: string; esempi?: number;
};
// azione: com'è partito il giro (monta, render, esempi, regia, elenco); prova: secondi del render di prova
type Notify = {
  tipo?: 'fase' | 'esito' | 'cartelle' | 'vuoto' | 'pubblicato'; esito?: string; nome: string; testo: string; ok?: boolean; foto?: string;
  nonce?: string; instagram?: EsitoPiattaforma; youtube?: EsitoPiattaforma; spostato?: boolean; errore?: string;
  run_url?: string; run_id?: string; step?: IdFase; minuti?: number; versione?: string; origine?: '97' | '98'; info?: Info; richiesto?: string;
  cartelle?: string[]; vai?: string[]; tgFile?: boolean; stili?: string[]; stili_info?: InfoStile[]; yt?: boolean;
  azione?: string; prova?: number;
};

function didascalia(nome: string, info?: Info, testo = ''): string {
  if (!info || info.durata == null) return `✅ <b>${esc(nome)}</b>\n\n${esc(tronca(testo, 900))}`;
  const versione = info.file ? info.file.replace(/\.mp4$/i, '').replace(`${nome} - `, '') : 'FINALE';
  const ai = info.ai ? `🧠 ${esc(info.ai.chi)} ${esc(info.ai.modello.replace(/^claude-/, '').replace(/-\d{8}$/, ''))} · ${kTok(info.ai.input + info.ai.output)} token${info.ai.usd != null ? ` (≈ $${info.ai.usd.toFixed(2)} API)` : ''}` : '';
  const righe = [
    info.prova ? `🧪 <b>${esc(nome)}</b> · prova: i primi ${info.prova} s` : `✅ <b>${esc(nome)}</b> · ${esc(versione)}`,
    `${info.stile ? `🎨 ${esc(info.stile)}  ·  ` : ''}⏱ ${durataTesto(info.durata)}  ·  ✂️ ${info.tagli} tagli  ·  🎥 ${info.sorgenti} ${info.sorgenti === 1 ? 'sorgente' : 'sorgenti'}`,
    info.voce ? `🎙 voce ${esc(info.voce)}` : '',
    info.keywords?.length ? `🔑 ${esc(tronca(info.keywords.join(' · '), 160))}` : '',
    ai,
    `⌛ ${info.minuti ?? '?'} min${info.correzione ? `  ·  ✏️ ${esc(tronca(info.correzione, 80))}` : ''}`,
    info.prova ? `<i>Ti piace? 🎬 Video intero con ${info.stile ? esc(info.stile) : 'questo stile'}, oppure 🎨 prova un altro stile.</i>` : '',
  ].filter(Boolean);
  const note = info.note ? `\n📝 <i>${esc(tronca(info.note, Math.max(80, 900 - righe.join('\n').length)))}</i>` : '';
  return righe.join('\n') + note;
}

// tasti sotto il video: render di prova → video intero o altro stile; video vero → tutto il resto
function tastiRisultato(runId?: string, runUrl?: string, info?: Pick<Info, 'prova' | 'stile' | 'link'>): Kb {
  const fondo = [link('📂 Drive', info?.link || URL_98), ...(runUrl ? [link('🔧 Log', runUrl)] : [])];
  if (!runId) return [fondo];
  if (info?.prova) {
    return [
      [tasto(`🎬 Video intero${info.stile ? ` · ${info.stile}` : ''}`, info.stile ? `sv:${runId}:${info.stile}` : `ren:${runId}`)],
      [tasto('🎨 Prova un altro stile', `stl:${runId}`)],
      fondo,
    ];
  }
  return [
    [tasto('👍 Approva', `ok:${runId}`), tasto('📤 Pubblica', `pub:${runId}`)],
    [tasto('✏️ Correggi', `fix:${runId}`), tasto('🎨 Cambia stile', `stl:${runId}`)],
    [tasto('🔄 Solo render', `ren:${runId}`), tasto('🔁 Rifai da zero', `redo:${runId}`)],
    fondo,
  ];
}

// memo del giro alla fine: dati per pubblicare, stile e (se non partito da qui) com'era partito
const memoFinale = (vecchio: RunMemo | string | undefined, nome: string, origine?: '97' | '98', info?: Info, azione?: string): RunMemo => ({
  ...(typeof vecchio === 'object' ? vecchio : {}), nome,
  ...(origine ? { origine } : {}),
  ...(info?.correzione ? { correzione: info.correzione } : {}),
  ...(info?.pubblica ? { pubblica: info.pubblica, pubblicato: undefined } : {}),
  ...(info?.stile ? { stile: info.stile } : {}),
  ...(azione === 'render' ? { azione: 'render' as const } : {}),
  ...(info?.prova ? { secondi: info.prova } : {}),
});

async function onNotify(env: Env, n: Notify) {
  if (n.tipo === 'pubblicato') return onPubblicato(env, n);
  const chats = autorizzati(env);
  if (typeof n.tgFile === 'boolean' && (await fileInChatPronti(env)) !== n.tgFile) await mem(env).scrivi('tg_file', n.tgFile);
  if (n.tipo === 'cartelle') {
    await mem(env).scrivi('cartelle', { elenco: n.cartelle || [], vai: n.vai || [], aggiornato: Date.now() } satisfies Cartelle);
    if (Array.isArray(n.stili)) { await mem(env).scrivi('stili_drive', n.stili); STILI_DRIVE = n.stili; }
    if (Array.isArray(n.stili_info)) { await mem(env).scrivi('stili_info', n.stili_info); INFO_STILI = n.stili_info; }
    if (typeof n.yt === 'boolean') await mem(env).scrivi('yt_pronto', n.yt);
    const inAttesa = (await leggi<string[]>(env, 'attesa_elenco')) || [];
    await mem(env).scrivi('attesa_elenco', []);
    // il giro è arrivato: niente più "⏳ aggiorno" nelle schermate ridisegnate qui sotto
    await mem(env).scrivi('elenco_richiesto', 0);
    for (const chat of inAttesa) {
      const a = await leggi<Attesa>(env, kAttesa(chat));
      if (a?.tipo === 'nuovo' && a.passo === 'cartella') await mostra(env, chat, await schermoPasso(env, a), a.msg);
      else if (a?.tipo === 'lotto') await mostra(env, chat, await schermoLotto(env, a), a.msg);
      else if (a?.tipo === 'schermo') {
        await mostra(env, chat, a.quale === 'stili' ? await schermoStili(env) : await schermoCollegamenti(env, a.runId), a.msg);
        await mem(env).cancella(kAttesa(chat));
      }
    }
    return;
  }
  if (n.tipo === 'vuoto') {
    const pendenti = (await leggi<Pendente[]>(env, 'pendenti')) || [];
    const i = pendenti.findIndex((p) => p.nome === '');
    const s: Schermo = { testo: '🤷 <b>Nessuna cartella con VAI</b> in 01 · Da editare: non ho montato niente.\nScegli la cartella da <b>Nuovo montaggio</b>.', tasti: [[tasto('🆕 Nuovo montaggio', 'nuovo'), link('📂 01 · Da editare', URL_97)]] };
    if (i >= 0) { const p = pendenti.splice(i, 1)[0]; await mem(env).scrivi('pendenti', pendenti); await mostra(env, p.chat, s, p.msg); }
    else for (const chat of chats) await invia(env, chat, s, true);
    return;
  }
    // analisi degli esempi, prova della sola regia, copia degli originali dall'app: niente scheda di montaggio
  if (n.azione === 'esempi' || n.azione === 'regia' || n.azione === 'archivio') {
    if (n.azione === 'regia' && n.tipo !== 'fase') {
      await mem(env).scrivi('app:regia', { nome: n.nome, ok: Boolean(n.ok), testo: n.testo, quando: Date.now(), attesa: false, runUrl: n.run_url });
      await avvisaApp(env, { tipo: 'regia', titolo: n.ok ? 'Prova della regia' : 'Prova non riuscita', corpo: n.nome, url: '/' });
    }
    if (n.azione === 'archivio') {
      if (n.tipo === 'fase') return;
      const s: Schermo = n.ok
        ? { testo: `📥 <b>Originali su Drive</b> · ${esc(n.nome)}\n${esc(tronca(n.testo, 500))}`, tasti: [[link('📂 01 · Da editare', URL_97)]] }
        : { testo: `⚠️ <b>Copia su Drive non riuscita</b> — ${esc(n.nome)}\n<blockquote>${esc(tronca(n.testo, 500))}</blockquote>`, tasti: [[MENU_TASTO]] };
      for (const chat of chats) await invia(env, chat, s, true);
      await avvisaApp(env, { tipo: 'archivio', titolo: n.ok ? 'Originali su Drive' : 'Copia non riuscita', corpo: n.nome, url: '/' });
      return;
    }
    if (n.tipo === 'fase') return;
    const log = n.run_url ? [link('🔧 Log', n.run_url)] : [];
    const s: Schermo = !n.ok
      ? { testo: `⚠️ <b>${n.azione === 'esempi' ? 'Analisi degli esempi' : 'Prova della regia'} non riuscita</b> — ${esc(n.nome)}\n<blockquote>${esc(tronca(n.testo.replace(/^Errore:\s*/, ''), 700))}</blockquote>`, tasti: [[...log, MENU_TASTO]] }
      : n.azione === 'esempi'
        ? { testo: `🔎 <b>Esempi di ${esc(n.nome)} analizzati</b>\n${n.info?.esempi ?? 'I'} video di riferimento: fogli di fotogrammi in <code>Stili/${esc(n.nome)}/esempi/_analisi</code>, pronti da studiare per lo stile.`, tasti: [[...(n.info?.link ? [link('📂 Apri su Drive', n.info.link)] : []), ...log]] }
        : { testo: `📝 <b>Prova della regia</b> · ${esc(n.nome)}\n<blockquote expandable>${esc(tronca(n.testo, 3500))}</blockquote>`, tasti: [[...log, MENU_TASTO]] };
    for (const chat of chats) await invia(env, chat, s, true);
    return;
  }
  if (n.tipo === 'fase') {
    if (!n.run_id) { for (const chat of chats) await invia(env, chat, { testo: `<b>${esc(n.nome)}</b> · ${esc(n.testo)}` }, true); return; }
    const c = await cardDelGiro(env, n.run_id, n.nome, n.versione === 'v2' ? 'v2' : undefined, n.richiesto);
    const step = n.step || faseDaTesto(n.testo);
    if (step) { c.corrente = step; c.fasi[step] = pulisci(n.testo); }
    c.minuti = n.minuti ?? Number(/\((\d+) min\)\s*$/.exec(n.testo)?.[1] ?? c.minuti);
    c.inCoda = false;
    if (n.prova) c.prova = n.prova;
    if (n.azione === 'render') c.soloRender = true;
    if (n.origine) {
      const memo = await leggi<RunMemo | string>(env, `run:${n.run_id}`);
      await mem(env).scrivi(`run:${n.run_id}`, {
        ...(typeof memo === 'object' ? memo : {}), nome: n.nome, origine: n.origine,
        ...(n.azione === 'render' ? { azione: 'render' as const } : {}), ...(n.prova ? { secondi: n.prova } : {}),
      } satisfies RunMemo);
    }
    return aggiornaCard(env, n.run_id, c, n.run_url);
  }

  // esito
  if (n.run_id) {
    await mem(env).scrivi(`run:${n.run_id}`, memoFinale(await leggi<RunMemo | string>(env, `run:${n.run_id}`), n.nome, n.origine, n.info, n.azione));
    const c = await cardDelGiro(env, n.run_id, n.nome);
    c.fine = n.ok ? 'ok' : 'ko';
    if (!n.ok) {
      const causa = (n.info?.errore || n.testo || '').replace(/^Errore:\s*/i, '').split('\n').map((s) => s.trim()).filter(Boolean)[0] || '';
      if (causa) c.errore = causa.slice(0, 400);
    }
    if (n.step) c.corrente = n.step;
    if (n.minuti != null) c.minuti = n.minuti;
    if (n.prova) c.prova = n.prova;
    await aggiornaCard(env, n.run_id, c, n.run_url);
  }
  if (!n.ok) {
    const causa = n.info?.errore || n.testo.replace(/^Errore:\s*/, '').split('\n\n')[0];
    const cosa = n.prova ? 'Render di prova' : n.azione === 'render' ? 'Render' : 'Montaggio';
    const s: Schermo = {
      testo: `⚠️ <b>${cosa} non riuscito</b> — ${esc(n.nome)}${n.step ? `\nFase: ${FASI.find((f) => f.id === n.step)?.nome}` : ''}\n<blockquote>${esc(tronca(causa, 700))}</blockquote>`,
      tasti: [
        [...(n.run_id ? [tasto('🔁 Riprova', `retry:${n.run_id}`)] : []), ...(n.run_url ? [link('🔧 Log', n.run_url)] : [])],
        [...(/non trovo la cartella/i.test(causa) ? [tasto('🆕 Scegli la cartella', 'nuovo')] : []), MENU_TASTO],
      ],
    };
    for (const chat of chats) await invia(env, chat, s);
    return;
  }
  // riuscito ma il video non è passato: foto di anteprima
  const corpo = didascalia(n.nome, n.info, n.testo);
  const tasti = tastiRisultato(n.run_id, n.run_url, n.info);
  let fotoId: string | undefined; // la foto si carica una volta, poi si riusa il file_id
  for (const chat of chats) {
    if (n.foto) {
      const form = new FormData();
      form.append('chat_id', chat);
      form.append('caption', corpo);
      form.append('parse_mode', 'HTML');
      form.append('reply_markup', JSON.stringify(tastiera(tasti)));
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
  if (n.run_id && n.info?.durata != null) {
    await ricordaVideo(env, {
      runId: n.run_id, nome: n.nome, file: n.info.file, stile: n.info.stile, durata: n.info.durata, prova: n.info.prova, link: n.info.link,
      runUrl: n.run_url, quando: Date.now(), foto: fotoId, corpo,
    });
    await avvisaApp(env, { tipo: 'video', titolo: n.info.prova ? 'Prova pronta' : 'Video pronto', corpo: n.nome, url: `/?video=${n.run_id}` });
  }
}

// copertina del video per Reel e TikTok: come foto (da guardare) e come file in qualità piena
// (Telegram comprime le foto; su TikTok si carica dal telefono come copertina)
async function onCopertina(env: Env, form: FormData) {
  const foto = form.get('foto');
  const nome = String(form.get('nome') || '');
  if (!foto || typeof foto === 'string') return 'foto mancante';
  for (const chat of autorizzati(env)) {
    const out = new FormData();
    out.append('chat_id', chat);
    out.append('caption', `🖼 <b>Copertina</b> — ${esc(nome)}\nSu Instagram la metto io quando pubblichi dal bot. Per TikTok: salva il file qui sotto e caricalo come copertina.`);
    out.append('parse_mode', 'HTML');
    out.append('photo', foto, 'copertina.jpg');
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendPhoto`, { method: 'POST', body: out });
    const doc = new FormData();
    doc.append('chat_id', chat);
    doc.append('document', foto, `${nome || 'video'} - copertina.jpg`);
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendDocument`, { method: 'POST', body: doc });
  }
  return 'ok';
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
    await mem(env).scrivi(`run:${runId}`, memoFinale(await leggi<RunMemo | string>(env, `run:${runId}`), nome, undefined, info, info?.prova ? 'render' : undefined));
    const c = await cardDelGiro(env, runId, nome);
    c.fine = 'ok';
    c.corrente = 'carico';
    if (info?.minuti != null) c.minuti = info.minuti;
    if (info?.prova) c.prova = info.prova;
    await aggiornaCard(env, runId, c, runUrl);
  }
  const corpo = didascalia(nome, info, testo);
  const tasti = tastiRisultato(runId || undefined, runUrl || undefined, info);
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
    out.append('reply_markup', JSON.stringify(tastiera(tasti)));
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
  if (runId && almenoUno) {
    await ricordaVideo(env, {
      runId, nome, file: info?.file, stile: info?.stile, durata: info?.durata, prova: info?.prova, link: info?.link,
      runUrl: runUrl || undefined, quando: Date.now(), video: fileId, corpo,
    });
    await avvisaApp(env, { tipo: 'video', titolo: info?.prova ? 'Prova pronta' : 'Video pronto', corpo: nome, url: `/?video=${runId}` });
  }
  return almenoUno;
}

// ---------- menu comandi ----------
// ---------- social manager (social.ts) ----------
const depsSocial = async (env: Env): Promise<DepsSocial> => ({
  fetch: (i, o) => fetch(i, o),
  leggi: <T>(k: string) => leggi<T>(env, k),
  scrivi: (k, v) => mem(env).scrivi(k, v),
  cancella: (k) => mem(env).cancella(k),
  igToken: await chiaveInstagram(env),
  ttKey: env.TIKTOK_CLIENT_KEY,
  ttSecret: env.TIKTOK_CLIENT_SECRET,
  geminiKey: env.GEMINI_API_KEY,
  anthropicKey: env.ANTHROPIC_API_KEY,
});
const ORIGINE_FISSA = 'https://regista-telegram.denisnusinovic.workers.dev'; // dal cron non c'è una richiesta da cui leggerla
const origineBot = () => ORIGINE_BOT || ORIGINE_FISSA;

async function social(env: Env, chat: string) {
  const msg = await invia(env, chat, { testo: '⏳ Leggo Instagram e TikTok e preparo il piano… (circa un minuto)' }, true);
  await mem(env).socialDopo(chat, msg);
}
async function completaSocial(env: Env, chat: string, msg?: number) {
  const testo = await pianoDelGiorno(await depsSocial(env));
  const tasti = [[tasto('🔄 Aggiorna', 'social'), MENU_TASTO]];
  if (await mostra(env, chat, { testo, tasti }, msg)) return;
  // Telegram ha rifiutato l'HTML: lo stesso testo senza formattazione, piuttosto che niente
  await invia(env, chat, { testo: testo.replace(/<[^>]+>/g, ''), tasti });
}
// ogni mattina dal cron, a tutte le chat autorizzate
async function socialMattina(env: Env) {
  const testo = await pianoDelGiorno(await depsSocial(env));
  for (const chat of autorizzati(env)) await invia(env, chat, { testo, tasti: [[tasto('🔄 Aggiorna', 'social'), MENU_TASTO]] });
}
async function schermoTikTok(env: Env): Promise<Schermo> {
  const d = await depsSocial(env);
  const s = await statoTikTok(d);
  if (!s.app) {
    return {
      testo: '🎵 <b>TikTok</b>\nManca l’app TikTok for Developers. Su Cloudflare → <code>regista-telegram</code> → Variables and Secrets: <code>TIKTOK_CLIENT_KEY</code> e <code>TIKTOK_CLIENT_SECRET</code>.\n'
        + `Redirect URI nell’app: <code>${esc(origineBot())}/tiktok/callback</code>`,
      tasti: [[MENU_TASTO]],
    };
  }
  const scade = s.scade ? new Date(s.scade).toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' }) : '';
  return {
    testo: s.collegato
      ? `🎵 <b>TikTok collegato</b>\nIl bot rinnova l’accesso da solo fino al ${esc(scade)}. Ricollega solo se /social dà errore.`
      : '🎵 <b>TikTok non collegato</b>\nApri il link, accedi con .blackden e autorizza. Il link vale 15 minuti.',
    tasti: [[link(s.collegato ? '🔗 Ricollega' : '🔗 Collega TikTok', await linkLoginTikTok(d, origineBot()))], [MENU_TASTO]],
  };
}

const COMANDI = [
  { command: 'menu', description: 'Pannello di controllo' },
  { command: 'nuovo', description: 'Nuovo montaggio: cartella, stile, via' },
  { command: 'video', description: 'Ultimi video: pubblica, cambia stile, correggi' },
  { command: 'stato', description: 'Montaggi in corso e ultimi risultati' },
  { command: 'social', description: 'Numeri di Instagram e TikTok e piano di oggi' },
  { command: 'tiktok', description: 'Collega TikTok per le statistiche' },
  { command: 'stili', description: 'Stili disponibili e predefinito' },
  { command: 'impostazioni', description: 'Stile predefinito, AI, Instagram e YouTube' },
  { command: 'aiuto', description: 'Come funziona' },
  { command: 'annulla', description: 'Annulla la procedura in corso' },
];
async function aggiornaComandi(env: Env, forza = false) {
  if (!forza && (await leggi<number>(env, 'versione_comandi')) === VERSIONE_COMANDI) return;
  await tg(env, 'setMyCommands', { commands: COMANDI });
  await mem(env).scrivi('versione_comandi', VERSIONE_COMANDI);
}

// un errore del bot non deve restare muto (né far ripetere l'aggiornamento a Telegram)
async function segnalaErrore(env: Env, chat: string | undefined, e: unknown) {
  console.error(e);
  if (chat && ok(env, chat)) {
    await invia(env, chat, { testo: `⚠️ <b>Errore del bot</b>\n<code>${esc(tronca(String((e as Error)?.message || e), 300))}</code>\nRiprova; se si ripete, dimmelo.`, tasti: [[MENU_TASTO]] }).catch(() => undefined);
  }
}

async function dispatchSemplice(env: Env, inputs: Record<string, string>): Promise<string | null> {
  const imp = await impostazioni(env);
  const r = await dispatch(env, RAMO[imp.versione], inputs);
  if (r.status === 204) return null;
  return `GitHub ${r.status}: ${(await r.text()).slice(0, 300)}`;
}
async function provaRegiaApp(env: Env, cartella: string, brief: string): Promise<string | null> {
  const imp = await impostazioni(env);
  const err = await dispatchSemplice(env, { azione: 'regia', cartella, brief: brief || `Stile: ${imp.stile}`, origine: '98' });
  if (!err) await mem(env).scrivi('app:regia', { nome: cartella, attesa: true, quando: Date.now() });
  return err;
}
async function archiviaApp(env: Env, cartella: string, r2: string): Promise<string | null> {
  return dispatchSemplice(env, { azione: 'archivio', cartella, r2, origine: '97' });
}

function creaOps(): Ops {
  const e = (env: Segreti) => env as Env;
  return {
    chat: (env) => autorizzati(e(env))[0] || '',
    leggi: (env, k) => leggi(e(env), k),
    scrivi: (env, k, v) => mem(e(env)).scrivi(k, v),
    cancella: (env, k) => mem(e(env)).cancella(k),
    prepara: async (env) => {
      const envBot = e(env);
      STILI_DRIVE = (await leggi<string[]>(envBot, 'stili_drive')) || [];
      INFO_STILI = (await leggi<InfoStile[]>(envBot, 'stili_info')) || [];
      const app = (await leggi<{ nome?: string; desc?: string }[]>(envBot, 'app:stili')) || [];
      STILI_APP = app.filter((s): s is { nome: string; desc?: string } => typeof s?.nome === 'string' && s.nome.trim() !== '');
    },
    impostazioni: (env) => impostazioni(e(env)),
    salvaImpostazioni: async (env, imp) => { await mem(e(env)).scrivi('impostazioni', imp); },
    stili: () => tuttiStili().map((s) => ({ ...s, id: infoStile(s.nome)?.id, desc: infoStile(s.nome)?.desc || s.cosa })),
    cartelle: (env) => leggi(e(env), 'cartelle'),
    richiediElenco: async (env, forza) => richiediElenco(e(env), autorizzati(e(env))[0] || 'app', Boolean(forza)),
    lancia: async (env, i) => {
      const envBot = e(env);
      const chat = autorizzati(envBot)[0];
      if (!chat) return 'Manca ALLOWED_CHAT_ID';
      return lancia(envBot, chat, { ...i, azione: i.azione === 'render' ? 'render' : undefined });
    },
    provaRegia: (env, cartella, brief) => provaRegiaApp(e(env), cartella, brief),
    studiaStile: async (env, r2) => {
      const r = await gh(e(env), '/actions/workflows/stile.yml/dispatches', { method: 'POST', body: JSON.stringify({ ref: 'main', inputs: { r2 } }) });
      return r.status === 204 ? null : `GitHub ${r.status}: ${(await r.text()).slice(0, 200)}`;
    },
    archivia: (env, cartella, r2) => archiviaApp(e(env), cartella, r2),
    giri: (env) => giri(e(env)),
    video: async (env) => (await leggi<VideoFatto[]>(e(env), 'video')) || [],
    memo: async (env, runId) => {
      const m = await leggi<RunMemo | string>(e(env), `run:${runId}`);
      return typeof m === 'string' ? { nome: m } : m;
    },
    scriviMemo: (env, runId, m) => mem(e(env)).scrivi(`run:${runId}`, m),
    card: (env, runId) => leggi(e(env), `card:${runId}`),
    pendenti: async (env) => (await leggi<Pendente[]>(e(env), 'pendenti')) || [],
    collegamenti: async (env) => {
      const envBot = e(env);
      const c = await collegamenti(envBot);
      const imp = await impostazioni(envBot);
      return { ig: c.ig, yt: c.yt, prova: imp.prova, provaNome: PROVA[imp.prova].nome };
    },
    confermaPubblicazione: async (env, runId) => {
      const envBot = e(env);
      const chat = autorizzati(envBot)[0];
      if (!chat) return 'Manca ALLOWED_CHAT_ID';
      const memo = await leggi<RunMemo>(envBot, `run:${runId}`);
      if (!memo) return 'Non trovo più questo montaggio';
      return confermaPubblicazione(envBot, chat, runId, memo);
    },
    inviaTelegram: async (env, testo) => {
      const envBot = e(env);
      const chat = autorizzati(envBot)[0];
      if (!chat) throw new Error('nessuna chat');
      const id = await invia(envBot, chat, { testo });
      if (!id) throw new Error('Telegram non ha accettato il messaggio');
    },
    nomeStile,
    componiBrief,
    conAltroStile,
    conStile,
    PROVA_S,
    url97: URL_97,
    url98: URL_98,
    regia: (env) => leggi(e(env), 'app:regia'),
  };
}

export default {
  async fetch(req: Request, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }): Promise<Response> {
    const url = new URL(req.url);
    ORIGINE_BOT = url.origin;
    if (req.method === 'POST') {
      STILI_DRIVE = (await leggi<string[]>(env, 'stili_drive').catch(() => undefined)) || STILI_DRIVE;
      INFO_STILI = (await leggi<InfoStile[]>(env, 'stili_info').catch(() => undefined)) || INFO_STILI;
      const app = await leggi<{ nome?: string; desc?: string }[]>(env, 'app:stili').catch(() => undefined);
      if (app) STILI_APP = app.filter((s): s is { nome: string; desc?: string } => typeof s?.nome === 'string' && s.nome.trim() !== '');
    }

    if (url.pathname.startsWith('/api/')) return gestisciApp(req, env, creaOps(), ctx);

    if (req.method === 'POST' && url.pathname === '/tg') {
      if (req.headers.get('x-telegram-bot-api-secret-token') !== env.TELEGRAM_SECRET) return new Response('no', { status: 401 });
      const u = (await req.json()) as { message?: Msg; callback_query?: Callback };
      const chat = String(u.message?.chat.id ?? u.callback_query?.message?.chat.id ?? '') || undefined;
      ctx.waitUntil((async () => {
        try {
          await aggiornaComandi(env);
          if (u.message) await onMessage(env, u.message);
          if (u.callback_query) await onCallback(env, u.callback_query);
        } catch (e) { await segnalaErrore(env, chat, e); }
      })());
      return new Response('ok');
    }

    if (req.method === 'GET' && url.pathname === '/stili.jpg') {
      return new Response(Uint8Array.from(atob(ANTEPRIMA_STILI), (c) => c.charCodeAt(0)), {
        headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=86400' },
      });
    }

    if (req.method === 'POST' && (url.pathname === '/notify' || url.pathname === '/video' || url.pathname === '/foto-profilo' || url.pathname === '/copertina' || url.pathname === '/stile-esito' || url.pathname === '/stile-correggi')) {
      if (req.headers.get('x-regista-token') !== env.NOTIFY_TOKEN) return new Response('no', { status: 401 });
      if (url.pathname === '/notify') { await onNotify(env, (await req.json()) as Notify); return new Response('ok'); }
      if (url.pathname === '/foto-profilo') return new Response(await onFotoProfilo(env, await req.formData()));
      if (url.pathname === '/copertina') return new Response(await onCopertina(env, await req.formData()));
      // esito dello studio di uno stile (workflow stile.yml): bozza nell'app e avviso su Telegram
      if (url.pathname === '/stile-esito') return riceviEsitoStile(env, creaOps(), await req.json().catch(() => ({})));
      // correzione di uno stile salvato nell'app (workflow stile-correggi.yml)
      if (url.pathname === '/stile-correggi') return correggiStileSalvato(env, creaOps(), await req.json().catch(() => ({})));
      const inviato = await onVideo(env, await req.formData());
      return new Response(inviato ? 'ok' : 'video non inviato', { status: inviato ? 200 : 502 });
    }

    // chiave Instagram per il workflow "pubblica" (che non la conosce: la custodisce il bot)
    if (req.method === 'GET' && url.pathname === '/ig-token') {
      if (req.headers.get('x-regista-token') !== env.NOTIFY_TOKEN) return new Response('no', { status: 401 });
      return Response.json({ token: (await chiaveInstagram(env)) || null });
    }

    if (req.method === 'GET' && (url.pathname === '/privacy' || url.pathname === '/termini')) {
      return new Response(url.pathname === '/privacy' ? PAGINA_PRIVACY : PAGINA_TERMINI, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    }
    // ritorno dal login TikTok (link creato da /tiktok, con stato monouso)
    if (req.method === 'GET' && url.pathname === '/tiktok/callback') {
      const code = url.searchParams.get('code') || '', state = url.searchParams.get('state') || '';
      let esito = '✅ TikTok collegato. Torna su Telegram.';
      try {
        if (!code) throw new Error(url.searchParams.get('error_description') || 'TikTok non ha dato l’autorizzazione.');
        await completaLoginTikTok(await depsSocial(env), url.origin, code, state);
        ctx.waitUntil(Promise.all(autorizzati(env).map((c) => invia(env, c, { testo: '✅ <b>TikTok collegato</b>\nDa domattina i suoi numeri entrano nel piano. Subito: /social', tasti: [[MENU_TASTO]] }))));
      } catch (e) {
        esito = `❌ ${String((e as Error)?.message || e).slice(0, 300)}`;
      }
      return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font:18px system-ui;padding:40px 16px">${esc(esito)}</body>`, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    }

    if (url.pathname === '/setup' && url.searchParams.get('k') === env.TELEGRAM_SECRET) {
      const r = await tg(env, 'setWebhook', { url: `${url.origin}/tg`, secret_token: env.TELEGRAM_SECRET, allowed_updates: ['message', 'callback_query'] });
      await aggiornaComandi(env, true);
      const info = await tg<{ url?: string; allowed_updates?: string[]; last_error_message?: string }>(env, 'getWebhookInfo', {});
      return Response.json({ set: r, url: info.result?.url, allowed_updates: info.result?.allowed_updates, last_error: info.result?.last_error_message });
    }

    if (req.method === 'GET' && env.ASSETS) {
      const speciale = url.pathname === '/sw.js' || url.pathname === '/manifest.webmanifest';
      const asset = await env.ASSETS.fetch(req);
      if (speciale) {
        const h = new Headers(asset.headers);
        if (url.pathname === '/sw.js') h.set('cache-control', 'no-cache');
        if (url.pathname === '/manifest.webmanifest') h.set('content-type', 'application/manifest+json');
        return new Response(asset.body, { status: asset.status, headers: h });
      }
      if (asset.status !== 404) return asset;
      if (url.pathname === '/' || !url.pathname.includes('.')) {
        const index = await env.ASSETS.fetch(new Request(new URL('/index.html', url.origin), req));
        return new Response(index.body, { status: index.status, headers: index.headers });
      }
      return asset;
    }

    return new Response('regista bot', { status: 200 });
  },

  // cron di wrangler.toml, ogni mattina: piano social; il lunedì anche il rinnovo della chiave Instagram
  // (un solo cron: il piano gratuito di Cloudflare ne ha pochi per account)
  async scheduled(evento: { scheduledTime?: number }, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }) {
    const lunedi = new Date(evento?.scheduledTime || Date.now()).getUTCDay() === 1;
    ctx.waitUntil((async () => {
      if (lunedi) await rinnovaChiaveInstagram(env).catch((e) => console.error(e));
      await socialMattina(env).catch((e) => console.error(e));
    })());
  },
};

// Bot Telegram "regista": il telecomando del montaggio automatico.
// Gira su Cloudflare Workers (sempre acceso, anche a PC spento).
//
//   POST /tg       webhook di Telegram (verificato con il secret token)
//   POST /notify   JSON da scripts/regista.mjs: fasi ed esiti
//   POST /video    multipart da scripts/regista.mjs: anteprima video finale
//   GET  /setup?k= collega webhook e menu comandi (protetto da TELEGRAM_SECRET)
//
// Comandi (solo dalla chat di Denis, ALLOWED_CHAT_ID):
//   /nuovo                 brief guidato a domande, poi avvia
//   /monta                 monta la prima cartella con VAI
//   /monta Nome | brief    monta "Nome" (anche senza VAI) con un brief al volo
//   /stato                 giro in corso (fase, minuti) + ultimi giri
//   /annulla               annulla la conversazione in corso
//   /aiuto                 come si usa

import { DurableObject } from 'cloudflare:workers';

export interface Env {
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_SECRET: string;
  ALLOWED_CHAT_ID: string;
  GITHUB_TOKEN: string;      // fine-grained, Actions read & write sul repo
  GITHUB_REPO: string;       // "DenLeone/video-regista"
  NOTIFY_TOKEN: string;      // condiviso con il workflow
  MEMORIA: DurableObjectNamespace<Memoria>;
}

// ---------- memoria (una sola istanza, chiave/valore) ----------
export class Memoria extends DurableObject {
  async leggi<T>(k: string): Promise<T | undefined> { return this.ctx.storage.get<T>(k); }
  async scrivi(k: string, v: unknown) { await this.ctx.storage.put(k, v); }
  async cancella(k: string) { await this.ctx.storage.delete(k); }
}
const mem = (env: Env) => env.MEMORIA.get(env.MEMORIA.idFromName('denis'));

type Attesa =
  | { tipo: 'correzione'; nome: string }
  | { tipo: 'nuovo'; passo: Passo; dati: Brief };
type Passo = 'cartella' | 'sponsor' | 'sponsor_testo' | 'durata' | 'tono' | 'tavola' | 'note' | 'conferma';
type Brief = { cartella?: string; sponsor?: string; durata?: string; tono?: string; tavola?: string; note?: string };

// ---------- Telegram ----------
const WORKFLOW = 'regista.yml';
const FATTI_URL = 'https://drive.google.com/drive/folders/1icN7ww-f6CrClZ5nhxi9eiX3_rO3MC4D';
type Button = { text: string; callback_data?: string; url?: string };
const MENU: Button[][] = [
  [{ text: '🆕 Nuovo video', callback_data: 'nuovo' }, { text: '📊 Stato', callback_data: 'stato' }],
  [{ text: '🎬 Monta (prima con VAI)', callback_data: 'monta' }],
  [{ text: '📁 98 - Fatti', url: FATTI_URL }],
];

async function tg(env: Env, method: string, body: unknown) {
  const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  return r.json();
}
const say = (env: Env, chatId: string | number, text: string, keyboard?: Button[][], silenzioso = false) =>
  tg(env, 'sendMessage', {
    chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, disable_notification: silenzioso,
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
  });
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

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
type Inputs = { cartella?: string; brief?: string; origine?: '97' | '98'; correzione?: string };
async function avvia(env: Env, i: Inputs) {
  const r = await gh(env, `/actions/workflows/${WORKFLOW}/dispatches`, {
    method: 'POST',
    body: JSON.stringify({ ref: 'main', inputs: { cartella: i.cartella || '', brief: i.brief || '', origine: i.origine || '97', correzione: i.correzione || '' } }),
  });
  return r.status === 204 ? null : `GitHub ${r.status}: ${await r.text()}`;
}

type Run = { id: number; status: string; conclusion: string | null; created_at: string; run_started_at?: string; updated_at: string; event: string; html_url: string };
const minuti = (from: string, to = new Date().toISOString()) => Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 60000));
const ora = (iso: string) => new Date(iso).toLocaleString('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

async function stato(env: Env): Promise<string> {
  const r = await gh(env, `/actions/workflows/${WORKFLOW}/runs?per_page=12`);
  if (!r.ok) return `⚠️ GitHub ${r.status}`;
  const runs = ((await r.json()) as { workflow_runs: Run[] }).workflow_runs;
  if (!runs.length) return 'Nessun giro ancora.';
  const righe: string[] = [];
  const attivi = runs.filter((w) => w.status !== 'completed');
  for (const a of attivi) {
    let fase = 'in coda';
    const j = await gh(env, `/actions/runs/${a.id}/jobs`);
    if (j.ok) {
      const jobs = ((await j.json()) as { jobs: { steps?: { name: string; status: string }[] }[] }).jobs;
      const step = jobs[0]?.steps?.find((s) => s.status === 'in_progress');
      if (step) fase = step.name;
    }
    righe.push(`⏳ <b>In corso</b> da ${minuti(a.run_started_at || a.created_at)} min — fase: <b>${esc(fase)}</b>`);
  }
  if (!attivi.length) righe.push('💤 Nessun montaggio in corso.');
  // i controlli automatici senza niente da fare durano ~1 min: li nascondo
  const veri = runs.filter((w) => w.status === 'completed' && (w.event !== 'schedule' || minuti(w.run_started_at || w.created_at, w.updated_at) >= 3));
  if (veri.length) {
    righe.push('\n<b>Ultimi montaggi</b>');
    for (const w of veri.slice(0, 5)) {
      const icona = w.conclusion === 'success' ? '✅' : w.conclusion === 'cancelled' ? '⏹️' : '⚠️';
      righe.push(`${icona} ${ora(w.created_at)} · ${minuti(w.run_started_at || w.created_at, w.updated_at)} min`);
    }
  }
  return righe.join('\n');
}

const AIUTO = [
  '<b>🎬 Regista</b> — montaggio automatico Blueprint',
  '',
  '<b>Il modo più semplice</b>',
  '1. Su Drive crea <code>97 - Editare/NomeVideo/</code> e metti i video',
  '2. Premi 🆕 <b>Nuovo video</b>: ti faccio 5 domande e parto',
  '',
  '<b>Oppure</b> aggiungi per ultimo un file <b>VAI</b> nella cartella: parto da solo entro 30 min (7–23).',
  '',
  'Ti scrivo a ogni fase. Alla fine ti mando il <b>video</b>: premi ✏️ <b>Correggi</b> e scrivimi cosa cambiare, rifaccio la versione successiva.',
  '',
  '/nuovo · /monta · /stato · /annulla',
].join('\n');

// ---------- brief guidato ----------
const DOMANDE: Record<Passo, { testo: string; tasti?: Button[][] }> = {
  cartella: { testo: '📁 <b>Quale cartella</b> in <code>97 - Editare</code>? Scrivimi il nome esatto.', tasti: [[{ text: 'La prima con VAI', callback_data: 'n:cartella:' }]] },
  sponsor: { testo: '💰 <b>C\'è uno sponsor?</b>', tasti: [[{ text: 'No', callback_data: 'n:sponsor:no' }, { text: 'Sì', callback_data: 'n:sponsor:si' }]] },
  sponsor_testo: { testo: '💰 Scrivimi <b>marca/prodotto</b> e <b>cosa si testa</b> (es. "eSUN PETG, stampa Benchy veloce").' },
  durata: { testo: '⏱️ <b>Quanto deve durare?</b>', tasti: [[{ text: '30 s', callback_data: 'n:durata:30 s' }, { text: '45 s', callback_data: 'n:durata:45 s' }, { text: '60 s', callback_data: 'n:durata:60 s' }], [{ text: 'Decidi tu', callback_data: 'n:durata:' }]] },
  tono: { testo: '🎭 <b>Che tono?</b>', tasti: [[{ text: 'Diretto', callback_data: 'n:tono:diretto' }, { text: 'Ironico', callback_data: 'n:tono:ironico' }], [{ text: 'Tecnico', callback_data: 'n:tono:tecnico' }, { text: 'Entusiasta', callback_data: 'n:tono:entusiasta' }]] },
  tavola: { testo: '📐 <b>Numero tavola?</b> Scrivilo (es. <code>TAV. 05</code>) oppure:', tasti: [[{ text: 'Automatica', callback_data: 'n:tavola:' }]] },
  note: { testo: '📝 <b>Altro da sapere?</b> (cosa dire del prodotto, battute, cosa evitare…) Scrivilo oppure:', tasti: [[{ text: 'Niente', callback_data: 'n:note:' }]] },
  conferma: { testo: '' },
};
const ORDINE: Passo[] = ['cartella', 'sponsor', 'durata', 'tono', 'tavola', 'note', 'conferma'];

function componiBrief(d: Brief) {
  return [
    d.sponsor ? `Sponsor: ${d.sponsor}` : 'Nessuno sponsor',
    d.durata ? `Durata: ${d.durata}` : '',
    d.tono ? `Tono: ${d.tono}` : '',
    d.tavola ? `Tavola: ${d.tavola}` : '',
    d.note ? `Note: ${d.note}` : '',
  ].filter(Boolean).join('. ');
}

async function chiedi(env: Env, chat: string, a: Extract<Attesa, { tipo: 'nuovo' }>) {
  await mem(env).scrivi('attesa', a);
  if (a.passo === 'conferma') {
    const d = a.dati;
    return say(env, chat, [
      '<b>Riepilogo</b>',
      `📁 ${d.cartella ? esc(d.cartella) : 'prima cartella con VAI'}`,
      `💰 ${d.sponsor ? esc(d.sponsor) : 'nessuno sponsor'}`,
      `⏱️ ${d.durata || 'decidi tu'} · 🎭 ${d.tono || 'a tua scelta'} · 📐 ${d.tavola || 'automatica'}`,
      d.note ? `📝 ${esc(d.note)}` : '',
    ].filter(Boolean).join('\n'), [[{ text: '🚀 Avvia', callback_data: 'n:avvia:' }, { text: '✖️ Annulla', callback_data: 'annulla' }]]);
  }
  const q = DOMANDE[a.passo];
  return say(env, chat, q.testo, q.tasti);
}

async function avanza(env: Env, chat: string, a: Extract<Attesa, { tipo: 'nuovo' }>, valore: string) {
  const d = { ...a.dati };
  let prossimo: Passo;
  switch (a.passo) {
    case 'cartella': d.cartella = valore; prossimo = 'sponsor'; break;
    case 'sponsor': prossimo = valore === 'si' ? 'sponsor_testo' : 'durata'; break;
    case 'sponsor_testo': d.sponsor = valore; prossimo = 'durata'; break;
    case 'durata': d.durata = valore; prossimo = 'tono'; break;
    case 'tono': d.tono = valore; prossimo = 'tavola'; break;
    case 'tavola': d.tavola = valore; prossimo = 'note'; break;
    case 'note': d.note = valore; prossimo = 'conferma'; break;
    default: prossimo = ORDINE[ORDINE.indexOf(a.passo) + 1] || 'conferma';
  }
  return chiedi(env, chat, { tipo: 'nuovo', passo: prossimo, dati: d });
}

async function onMonta(env: Env, chat: string, i: Inputs) {
  await mem(env).cancella('attesa');
  const err = await avvia(env, i);
  const cosa = i.correzione ? `✏️ Correzione avviata su <b>${esc(i.cartella || '')}</b>\n<i>${esc(i.correzione)}</i>`
    : `🎬 Avviato${i.cartella ? ` su <b>${esc(i.cartella)}</b>` : ' (prima cartella con VAI)'}${i.brief ? `\n📝 <i>${esc(i.brief)}</i>` : ''}`;
  return say(env, chat, err ? `⚠️ Non sono riuscito ad avviare:\n<code>${esc(err)}</code>` :
    `${cosa}\n\nTi aggiorno a ogni fase. Tempo tipico 20–60 min.`, [[{ text: '📊 Stato', callback_data: 'stato' }]]);
}

// ---------- messaggi e bottoni ----------
async function onMessage(env: Env, msg: { chat: { id: number }; text?: string }) {
  const chat = String(msg.chat.id);
  const text = (msg.text || '').trim();
  if (chat !== env.ALLOWED_CHAT_ID) {
    if (text.startsWith('/start')) return say(env, chat, `Il tuo chat id è ${chat} (non autorizzato).`);
    return;
  }
  if (text.startsWith('/annulla')) { await mem(env).cancella('attesa'); return say(env, chat, 'Ok, annullato.', MENU); }
  if (text.startsWith('/stato')) return say(env, chat, await stato(env), MENU);
  if (text.startsWith('/nuovo')) return chiedi(env, chat, { tipo: 'nuovo', passo: 'cartella', dati: {} });
  if (text.startsWith('/monta')) {
    const [cartella = '', brief = ''] = text.replace(/^\/monta(@\w+)?/, '').split('|').map((s) => s.trim());
    return onMonta(env, chat, { cartella, brief });
  }
  if (text.startsWith('/')) return say(env, chat, AIUTO, MENU);

  // testo libero: risposta a una domanda in sospeso?
  const attesa = await mem(env).leggi<Attesa>('attesa');
  if (attesa?.tipo === 'correzione') return onMonta(env, chat, { cartella: attesa.nome, origine: '98', correzione: text });
  if (attesa?.tipo === 'nuovo' && ['cartella', 'sponsor_testo', 'tavola', 'note'].includes(attesa.passo)) return avanza(env, chat, attesa, text);
  return say(env, chat, AIUTO, MENU);
}

async function onCallback(env: Env, cb: { id: string; data?: string; message?: { chat: { id: number } } }) {
  const chat = String(cb.message?.chat.id ?? '');
  await tg(env, 'answerCallbackQuery', { callback_query_id: cb.id });
  if (chat !== env.ALLOWED_CHAT_ID) return;
  const data = cb.data || '';
  if (data === 'stato') return say(env, chat, await stato(env), MENU);
  if (data === 'monta') return onMonta(env, chat, {});
  if (data === 'nuovo') return chiedi(env, chat, { tipo: 'nuovo', passo: 'cartella', dati: {} });
  if (data === 'annulla') { await mem(env).cancella('attesa'); return say(env, chat, 'Ok, annullato.', MENU); }
  if (data.startsWith('riprova:')) return onMonta(env, chat, { cartella: data.slice(8) });

  if (data.startsWith('n:')) {
    const [, passo, valore = ''] = data.split(':');
    const attesa = await mem(env).leggi<Attesa>('attesa');
    if (passo === 'avvia' && attesa?.tipo === 'nuovo') {
      return onMonta(env, chat, { cartella: attesa.dati.cartella, brief: componiBrief(attesa.dati) });
    }
    if (attesa?.tipo === 'nuovo' && attesa.passo === passo) return avanza(env, chat, attesa, valore);
    return; // bottone vecchio, ignoro
  }

  const [azione, runId] = data.split(':');
  if (azione === 'ok' || azione === 'fix') {
    const nome = await mem(env).leggi<string>(`run:${runId}`);
    if (!nome) return say(env, chat, 'Non trovo più questo montaggio. Usa /monta Nome | correzione.');
    if (azione === 'ok') return say(env, chat, `👍 Perfetto. <b>${esc(nome)}</b> è in 98 - Fatti.`, [[{ text: '📁 Apri', url: FATTI_URL }]]);
    await mem(env).scrivi('attesa', { tipo: 'correzione', nome });
    return say(env, chat, `✏️ <b>Cosa cambio in ${esc(nome)}?</b>\nScrivimelo normale, es: <i>hook più corto, togli APP FILE, chiudi su BOCCIATO, parole chiave più in alto</i>.\n\n/annulla per lasciar stare.`);
  }
}

// ---------- notifiche da regista.mjs ----------
type Notify = { tipo?: 'fase' | 'esito'; esito?: string; nome: string; testo: string; ok?: boolean; foto?: string; run_url?: string; run_id?: string };

const tastiEsito = (n: { ok?: boolean; nome: string; run_id?: string; run_url?: string }): Button[][] => n.ok
  ? [
      ...(n.run_id ? [[{ text: '👍 Va bene', callback_data: `ok:${n.run_id}` }, { text: '✏️ Correggi', callback_data: `fix:${n.run_id}` }]] : []),
      [{ text: '📁 Apri 98 - Fatti', url: FATTI_URL }],
    ]
  : [[{ text: '🔁 Riprova', callback_data: `riprova:${n.nome}`.slice(0, 64) }], ...(n.run_url ? [[{ text: '🔧 Log su GitHub', url: n.run_url }]] : [])];

async function onNotify(env: Env, n: Notify) {
  const chat = env.ALLOWED_CHAT_ID;
  if (n.tipo === 'fase') return say(env, chat, `<b>${esc(n.nome)}</b> · ${esc(n.testo)}`, undefined, true);
  if (n.run_id) await mem(env).scrivi(`run:${n.run_id}`, n.nome);
  const corpo = `${n.esito || (n.ok ? '✅ pronto' : '⚠️ non montato')} — <b>${esc(n.nome)}</b>\n\n${esc(n.testo)}`.slice(0, 1000);
  const tasti = tastiEsito(n);
  if (n.foto) {
    const form = new FormData();
    form.append('chat_id', chat);
    form.append('caption', corpo);
    form.append('parse_mode', 'HTML');
    form.append('reply_markup', JSON.stringify({ inline_keyboard: tasti }));
    form.append('photo', new Blob([Uint8Array.from(atob(n.foto), (c) => c.charCodeAt(0))], { type: 'image/jpeg' }), 'anteprima.jpg');
    const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendPhoto`, { method: 'POST', body: form });
    if (r.ok) return;
  }
  return say(env, chat, corpo, tasti);
}

// anteprima video (≤ 50 MB, limite dei bot): arriva già compressa da regista.mjs
async function onVideo(env: Env, form: FormData) {
  const chat = env.ALLOWED_CHAT_ID;
  const nome = String(form.get('nome') || '');
  const runId = String(form.get('run_id') || '');
  const runUrl = String(form.get('run_url') || '');
  const testo = String(form.get('testo') || '');
  const video = form.get('video');
  if (runId) await mem(env).scrivi(`run:${runId}`, nome);
  const corpo = `✅ pronto — <b>${esc(nome)}</b>\n\n${esc(testo)}`.slice(0, 1000);
  const tasti = tastiEsito({ ok: true, nome, run_id: runId, run_url: runUrl });
  if (video && typeof video !== 'string') {
    const out = new FormData();
    out.append('chat_id', chat);
    out.append('caption', corpo);
    out.append('parse_mode', 'HTML');
    out.append('supports_streaming', 'true');
    out.append('width', '720');
    out.append('height', '1280');
    if (form.get('durata')) out.append('duration', String(Math.round(Number(form.get('durata')))));
    out.append('reply_markup', JSON.stringify({ inline_keyboard: tasti }));
    out.append('video', video, `${nome}.mp4`);
    const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendVideo`, { method: 'POST', body: out });
    if (r.ok) return true;
  }
  return false;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === 'POST' && url.pathname === '/tg') {
      if (req.headers.get('x-telegram-bot-api-secret-token') !== env.TELEGRAM_SECRET) return new Response('no', { status: 401 });
      const u = (await req.json()) as { message?: { chat: { id: number }; text?: string }; callback_query?: { id: string; data?: string; message?: { chat: { id: number } } } };
      if (u.message) await onMessage(env, u.message);
      if (u.callback_query) await onCallback(env, u.callback_query);
      return new Response('ok');
    }

    if (req.method === 'POST' && (url.pathname === '/notify' || url.pathname === '/video')) {
      if (req.headers.get('x-regista-token') !== env.NOTIFY_TOKEN) return new Response('no', { status: 401 });
      if (url.pathname === '/notify') { await onNotify(env, (await req.json()) as Notify); return new Response('ok'); }
      const inviato = await onVideo(env, await req.formData());
      return new Response(inviato ? 'ok' : 'video non inviato', { status: inviato ? 200 : 502 });
    }

    if (url.pathname === '/setup' && url.searchParams.get('k') === env.TELEGRAM_SECRET) {
      const r = await tg(env, 'setWebhook', { url: `${url.origin}/tg`, secret_token: env.TELEGRAM_SECRET, allowed_updates: ['message', 'callback_query'] });
      await tg(env, 'setMyCommands', { commands: [
        { command: 'nuovo', description: 'Nuovo video: 5 domande e parto' },
        { command: 'monta', description: 'Monta la prima cartella con VAI (oppure: Nome | brief)' },
        { command: 'stato', description: 'Cosa sta facendo adesso' },
        { command: 'annulla', description: 'Annulla la domanda in corso' },
        { command: 'aiuto', description: 'Come si usa' },
      ] });
      const info = (await tg(env, 'getWebhookInfo', {})) as { result?: { url?: string; allowed_updates?: string[]; last_error_message?: string } };
      return Response.json({ set: r, url: info.result?.url, allowed_updates: info.result?.allowed_updates, last_error: info.result?.last_error_message });
    }

    return new Response('regista bot', { status: 200 });
  },
};

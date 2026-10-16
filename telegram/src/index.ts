// Bot Telegram "regista": il telecomando del montaggio automatico.
// Gira su Cloudflare Workers (sempre acceso, anche a PC spento).
//
//   POST /tg       webhook di Telegram (verificato con il secret token)
//   POST /notify   chiamato da scripts/regista.mjs (fasi, esito finale, anteprima)
//   GET  /setup?k= collega webhook e menu comandi (protetto da TELEGRAM_SECRET)
//
// Comandi (solo dalla chat di Denis, ALLOWED_CHAT_ID):
//   /start /aiuto          menu con bottoni
//   /monta                 monta la prima cartella con VAI
//   /monta Nome | brief    monta "Nome" (anche senza VAI) con un brief al volo
//   /stato                 giro in corso (fase, minuti) + ultimi giri

export interface Env {
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_SECRET: string;
  ALLOWED_CHAT_ID: string;
  GITHUB_TOKEN: string;      // fine-grained, Actions read & write sul repo
  GITHUB_REPO: string;       // "DenLeone/video-regista"
  NOTIFY_TOKEN: string;      // condiviso con il workflow
}

const WORKFLOW = 'regista.yml';
const FATTI_URL = 'https://drive.google.com/drive/folders/1icN7ww-f6CrClZ5nhxi9eiX3_rO3MC4D';

type Button = { text: string; callback_data?: string; url?: string };
const MENU: Button[][] = [[{ text: '📊 Stato', callback_data: 'stato' }, { text: '🎬 Monta', callback_data: 'monta' }], [{ text: '📁 98 - Fatti', url: FATTI_URL }]];

async function tg(env: Env, method: string, body: unknown) {
  const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  return r.json();
}

const say = (env: Env, chatId: string | number, text: string, keyboard?: Button[][]) =>
  tg(env, 'sendMessage', {
    chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true,
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
  });

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function gh(env: Env, path: string, init: RequestInit = {}) {
  return fetch(`https://api.github.com/repos/${env.GITHUB_REPO}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${env.GITHUB_TOKEN}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'regista-telegram',
      'x-github-api-version': '2022-11-28',
      ...(init.headers || {}),
    },
  });
}

async function avvia(env: Env, cartella = '', brief = '') {
  const r = await gh(env, `/actions/workflows/${WORKFLOW}/dispatches`, {
    method: 'POST', body: JSON.stringify({ ref: 'main', inputs: { cartella, brief } }),
  });
  return r.status === 204 ? null : `GitHub ${r.status}: ${await r.text()}`;
}

type Run = { id: number; status: string; conclusion: string | null; created_at: string; run_started_at?: string; updated_at: string; event: string; html_url: string; display_title?: string };

const minuti = (from: string, to = new Date().toISOString()) => Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 60000));
const ora = (iso: string) => new Date(iso).toLocaleString('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

async function stato(env: Env): Promise<string> {
  const r = await gh(env, `/actions/workflows/${WORKFLOW}/runs?per_page=6`);
  if (!r.ok) return `⚠️ GitHub ${r.status}`;
  const runs = ((await r.json()) as { workflow_runs: Run[] }).workflow_runs;
  if (!runs.length) return 'Nessun giro ancora.';

  const righe: string[] = [];
  const attivo = runs.find((w) => w.status !== 'completed');
  if (attivo) {
    // fase in corso: primo step non completato del job
    let fase = 'in coda';
    const j = await gh(env, `/actions/runs/${attivo.id}/jobs`);
    if (j.ok) {
      const jobs = ((await j.json()) as { jobs: { steps?: { name: string; status: string }[] }[] }).jobs;
      const step = jobs[0]?.steps?.find((s) => s.status === 'in_progress');
      if (step) fase = step.name;
    }
    righe.push(`⏳ <b>In corso</b> da ${minuti(attivo.run_started_at || attivo.created_at)} min — fase: <b>${esc(fase)}</b>\n<a href="${attivo.html_url}">apri su GitHub</a>`);
  } else {
    righe.push('💤 Nessun montaggio in corso.');
  }

  // ultimi giri "veri" (i cron senza niente da fare durano ~1 min e si confondono: li riassumo)
  const fatti = runs.filter((w) => w.status === 'completed');
  if (fatti.length) {
    righe.push('\n<b>Ultimi giri</b>');
    for (const w of fatti.slice(0, 5)) {
      const icona = w.conclusion === 'success' ? '✅' : w.conclusion === 'cancelled' ? '⏹️' : '⚠️';
      const durata = minuti(w.run_started_at || w.created_at, w.updated_at);
      const tipo = w.event === 'schedule' ? 'controllo automatico' : 'avvio manuale';
      righe.push(`${icona} ${ora(w.created_at)} · ${tipo} · ${durata} min`);
    }
  }
  return righe.join('\n');
}

const AIUTO = [
  '<b>🎬 Regista</b> — montaggio automatico Blueprint',
  '',
  '<b>Come si usa</b>',
  '1. Su Drive: <code>97 - Editare/NomeVideo/</code> con i video',
  '2. Aggiungi per ultimo un file chiamato <b>VAI</b>',
  '3. Entro 30 min parte da solo (7–23), oppure premi 🎬 Monta',
  '',
  '<b>Comandi</b>',
  '/monta — monta la prima cartella con VAI',
  '/monta <i>Nome | brief</i> — es. <code>/monta Key air | 30 secondi, tono ironico</code>',
  '/stato — cosa sta facendo adesso',
  '',
  'Ti scrivo io a ogni fase e quando il video è pronto, con anteprima e link.',
].join('\n');

async function onMonta(env: Env, chatId: string, resto: string) {
  const [cartella = '', brief = ''] = resto.split('|').map((s) => s.trim());
  const err = await avvia(env, cartella, brief);
  return say(env, chatId, err ? `⚠️ Non sono riuscito ad avviare:\n<code>${esc(err)}</code>` :
    `🎬 Avviato${cartella ? ` su <b>${esc(cartella)}</b>` : ' (prima cartella con VAI)'}${brief ? `\n📝 Brief: <i>${esc(brief)}</i>` : ''}\n\nTi aggiorno qui a ogni fase. Tempo tipico 20–60 min.`,
    [[{ text: '📊 Stato', callback_data: 'stato' }]]);
}

async function onMessage(env: Env, msg: { chat: { id: number }; text?: string }) {
  const chatId = String(msg.chat.id);
  const text = (msg.text || '').trim();

  if (chatId !== env.ALLOWED_CHAT_ID) {
    if (text.startsWith('/start')) return say(env, chatId, `Il tuo chat id è ${chatId} (non autorizzato).`);
    return;
  }
  if (text.startsWith('/stato')) return say(env, chatId, await stato(env), MENU);
  if (text.startsWith('/monta')) return onMonta(env, chatId, text.replace(/^\/monta(@\w+)?/, '').trim());
  return say(env, chatId, AIUTO, MENU); // /start, /aiuto e qualsiasi altro testo
}

async function onCallback(env: Env, cb: { id: string; data?: string; message?: { chat: { id: number } } }) {
  const chatId = String(cb.message?.chat.id ?? '');
  await tg(env, 'answerCallbackQuery', { callback_query_id: cb.id });
  if (chatId !== env.ALLOWED_CHAT_ID) return;
  const data = cb.data || '';
  if (data === 'stato') return say(env, chatId, await stato(env), MENU);
  if (data === 'monta') return onMonta(env, chatId, '');
  if (data.startsWith('riprova:')) return onMonta(env, chatId, data.slice(8));
}

type Notify = { tipo?: 'fase' | 'esito'; esito?: string; nome: string; testo: string; ok?: boolean; foto?: string; run_url?: string };

async function onNotify(env: Env, n: Notify) {
  const chat = env.ALLOWED_CHAT_ID;
  if (n.tipo === 'fase') {
    return tg(env, 'sendMessage', { chat_id: chat, text: `<b>${esc(n.nome)}</b> · ${esc(n.testo)}`, parse_mode: 'HTML', disable_notification: true });
  }
  const titolo = `${n.esito || (n.ok ? '✅ pronto' : '⚠️ non montato')} — <b>${esc(n.nome)}</b>`;
  const corpo = `${titolo}\n\n${esc(n.testo)}`.slice(0, 1000); // limite caption foto
  const tasti: Button[][] = n.ok
    ? [[{ text: '📁 Apri 98 - Fatti', url: FATTI_URL }], ...(n.run_url ? [[{ text: '🔧 Dettagli GitHub', url: n.run_url }]] : [])]
    : [[{ text: '🔁 Riprova', callback_data: `riprova:${n.nome}`.slice(0, 64) }], ...(n.run_url ? [[{ text: '🔧 Log su GitHub', url: n.run_url }]] : [])];

  if (n.foto) {
    // anteprima: JPEG in base64 inviato come multipart
    const bin = Uint8Array.from(atob(n.foto), (c) => c.charCodeAt(0));
    const form = new FormData();
    form.append('chat_id', chat);
    form.append('caption', corpo);
    form.append('parse_mode', 'HTML');
    form.append('reply_markup', JSON.stringify({ inline_keyboard: tasti }));
    form.append('photo', new Blob([bin], { type: 'image/jpeg' }), 'anteprima.jpg');
    const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendPhoto`, { method: 'POST', body: form });
    if (r.ok) return;
  }
  return say(env, chat, corpo, tasti);
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

    if (req.method === 'POST' && url.pathname === '/notify') {
      if (req.headers.get('x-regista-token') !== env.NOTIFY_TOKEN) return new Response('no', { status: 401 });
      await onNotify(env, (await req.json()) as Notify);
      return new Response('ok');
    }

    if (url.pathname === '/setup' && url.searchParams.get('k') === env.TELEGRAM_SECRET) {
      const r = await tg(env, 'setWebhook', { url: `${url.origin}/tg`, secret_token: env.TELEGRAM_SECRET, allowed_updates: ['message', 'callback_query'] });
      await tg(env, 'setMyCommands', { commands: [
        { command: 'monta', description: 'Monta la prima cartella con VAI (oppure: Nome | brief)' },
        { command: 'stato', description: 'Cosa sta facendo adesso' },
        { command: 'aiuto', description: 'Come si usa' },
      ] });
      const info = (await tg(env, 'getWebhookInfo', {})) as { result?: { url?: string; allowed_updates?: string[]; last_error_message?: string } };
      // non esponiamo nulla di sensibile: solo url pubblico e tipi di eventi
      return Response.json({ set: r, url: info.result?.url, allowed_updates: info.result?.allowed_updates, last_error: info.result?.last_error_message });
    }

    return new Response('regista bot', { status: 200 });
  },
};

// Bot Telegram "regista": il telecomando del montaggio automatico.
// Gira su Cloudflare Workers (sempre acceso, anche a PC spento).
//
//   POST /tg       webhook di Telegram (verificato con il secret token)
//   POST /notify   chiamato da scripts/regista.mjs a fine montaggio
//
// Comandi (solo dalla chat di Denis, ALLOWED_CHAT_ID):
//   /start            mostra il chat id (serve per configurare ALLOWED_CHAT_ID)
//   /monta            avvia subito un giro (prende la prima cartella con VAI)
//   /monta Nome | brief   monta la cartella "Nome" anche senza VAI, con un brief al volo
//   /stato            ultimi giri su GitHub Actions

export interface Env {
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_SECRET: string;   // secret_token del webhook
  ALLOWED_CHAT_ID: string;   // chat id di Denis
  GITHUB_TOKEN: string;      // fine-grained, permesso Actions: read & write sul repo
  GITHUB_REPO: string;       // es. "denis/video-regista"
  NOTIFY_TOKEN: string;      // condiviso con il workflow (secret NOTIFY_TOKEN)
}

const WORKFLOW = 'regista.yml';

async function tg(env: Env, method: string, body: unknown) {
  const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  return r.json();
}

const say = (env: Env, chatId: string | number, text: string) =>
  tg(env, 'sendMessage', { chat_id: chatId, text, disable_web_page_preview: true });

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
    method: 'POST',
    body: JSON.stringify({ ref: 'main', inputs: { cartella, brief } }),
  });
  return r.status === 204 ? null : `GitHub ${r.status}: ${await r.text()}`;
}

async function stato(env: Env) {
  const r = await gh(env, `/actions/workflows/${WORKFLOW}/runs?per_page=5`);
  if (!r.ok) return `GitHub ${r.status}`;
  const j = (await r.json()) as { workflow_runs: { status: string; conclusion: string | null; created_at: string; event: string; html_url: string }[] };
  if (!j.workflow_runs.length) return 'Nessun giro ancora.';
  const icona = (s: string, c: string | null) => (s !== 'completed' ? '⏳' : c === 'success' ? '✅' : c === 'skipped' ? '⏭️' : '⚠️');
  return j.workflow_runs
    .map((w) => `${icona(w.status, w.conclusion)} ${new Date(w.created_at).toLocaleString('it-IT', { timeZone: 'Europe/Rome' })} · ${w.event}`)
    .join('\n');
}

async function onMessage(env: Env, msg: { chat: { id: number }; text?: string }) {
  const chatId = String(msg.chat.id);
  const text = (msg.text || '').trim();

  if (text.startsWith('/start')) {
    return say(env, chatId, `Ciao! Il tuo chat id è ${chatId}.${chatId === env.ALLOWED_CHAT_ID ? ' Sei autorizzato ✅' : ' (non ancora autorizzato)'}`);
  }
  if (chatId !== env.ALLOWED_CHAT_ID) return; // ignora chiunque altro

  if (text.startsWith('/stato')) return say(env, chatId, await stato(env));

  if (text.startsWith('/monta')) {
    const resto = text.replace(/^\/monta(@\w+)?/, '').trim();
    const [cartella = '', brief = ''] = resto.split('|').map((s) => s.trim());
    const err = await avvia(env, cartella, brief);
    return say(env, chatId, err ? `⚠️ Non sono riuscito ad avviare: ${err}` :
      `🎬 Avviato${cartella ? ` su "${cartella}"` : ''}. Ti scrivo qui quando è pronto (di solito 20–60 min).`);
  }

  return say(env, chatId, 'Per ora so fare:\n/monta — monta la prima cartella con VAI\n/monta Nome | brief — monta "Nome" con un brief\n/stato — ultimi giri');
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === 'POST' && url.pathname === '/tg') {
      if (req.headers.get('x-telegram-bot-api-secret-token') !== env.TELEGRAM_SECRET) return new Response('no', { status: 401 });
      const update = (await req.json()) as { message?: { chat: { id: number }; text?: string } };
      if (update.message) await onMessage(env, update.message);
      return new Response('ok');
    }

    if (req.method === 'POST' && url.pathname === '/notify') {
      if (req.headers.get('x-regista-token') !== env.NOTIFY_TOKEN) return new Response('no', { status: 401 });
      const { esito, nome, testo } = (await req.json()) as { esito: string; nome: string; testo: string };
      await say(env, env.ALLOWED_CHAT_ID, `${esito} — ${nome}\n\n${testo}`);
      return new Response('ok');
    }

    // Collega il webhook usando il token già salvato come secret: nessuno deve
    // maneggiare il token del bot. Protetto dal TELEGRAM_SECRET.
    if (url.pathname === '/setup' && url.searchParams.get('k') === env.TELEGRAM_SECRET) {
      const r = await tg(env, 'setWebhook', {
        url: `${url.origin}/tg`, secret_token: env.TELEGRAM_SECRET, allowed_updates: ['message'],
      });
      await tg(env, 'setMyCommands', { commands: [
        { command: 'monta', description: 'Monta la prima cartella con VAI (oppure: Nome | brief)' },
        { command: 'stato', description: 'Ultimi giri del montaggio' },
      ] });
      return Response.json(r);
    }

    return new Response('regista bot', { status: 200 });
  },
};

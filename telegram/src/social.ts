// Social manager: ogni mattina il bot legge le statistiche di Instagram e TikTok, tiene uno storico
// giornaliero (per vedere cosa cresce e cosa si è fermato) e chiede all'AI il piano del giorno.
//
// Instagram: la stessa chiave della pubblicazione (graph.instagram.com). Per le statistiche serve
// il permesso instagram_business_manage_insights: se manca, il messaggio lo dice.
// TikTok: Display API (Login Kit, sandbox con Denis come utente di prova). Niente salvataggi:
// l'API non li dà. Il token dura 24 ore, il rinnovo un anno: il bot lo rinnova da solo.

export type Piattaforma = 'ig' | 'tt';
export type Video = {
  id: string; p: Piattaforma; data: string; titolo: string; link?: string;
  views: number; like: number; commenti: number; condivisioni: number;
  salvati?: number; reach?: number; visioneMedia?: number; durata?: number; // secondi
};
export type Fotografia = { giorno: string; quando: number; video: Video[]; errori: string[]; tiktok: boolean };
export type ChiaveTikTok = { access: string; scade: number; refresh: string; refreshScade: number; openId?: string };

export type DepsSocial = {
  fetch: typeof fetch;
  leggi: <T>(k: string) => Promise<T | undefined>;
  scrivi: (k: string, v: unknown) => Promise<void>;
  cancella: (k: string) => Promise<void>;
  igToken?: string;
  ttKey?: string;
  ttSecret?: string;
  geminiKey?: string;
  anthropicKey?: string;
};

const K_TT = 'tt_token';
const K_TT_STATO = 'tt_stato';
const K_GIORNI = 'social:giorni';
const K_PIANI = 'social:piani';
const kGiorno = (g: string) => `social:g:${g}`;
const GIORNI_TENUTI = 35;

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const n = (x: number) => Math.round(x).toLocaleString('it-IT');
const conSegno = (x: number) => `${x >= 0 ? '+' : '−'}${n(Math.abs(x))}`;
const messaggio = (e: unknown) => String((e as Error)?.message || e).slice(0, 200);
export const giornoRoma = (t = Date.now()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date(t));

// ---------- Instagram ----------
const IG = 'https://graph.instagram.com';
type IgMedia = { id: string; caption?: string; media_product_type?: string; timestamp?: string; like_count?: number; comments_count?: number; permalink?: string };
type IgInsight = { name: string; values?: { value?: number }[]; total_value?: { value?: number } };

async function igJson<T>(d: DepsSocial, url: string): Promise<T> {
  const r = await d.fetch(url, { signal: AbortSignal.timeout(20_000) });
  const j = (await r.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!r.ok || j.error) throw new Error(`Instagram: ${j.error?.message || `HTTP ${r.status}`}`);
  return j;
}

// ig_reels_avg_watch_time non c'è su tutti i reel: se la richiesta intera viene rifiutata, senza
const METRICHE_IG = ['views', 'reach', 'saved', 'shares', 'ig_reels_avg_watch_time'];
async function insightsIg(d: DepsSocial, id: string, t: string): Promise<Record<string, number>> {
  for (const metriche of [METRICHE_IG, METRICHE_IG.slice(0, 4)]) {
    try {
      const j = await igJson<{ data?: IgInsight[] }>(d, `${IG}/${id}/insights?metric=${metriche.join(',')}&access_token=${t}`);
      return Object.fromEntries((j.data || []).map((x) => [x.name, Number(x.total_value?.value ?? x.values?.[0]?.value ?? 0)]));
    } catch (e) {
      if (metriche.length === 4) throw e;
    }
  }
  return {};
}

export async function videoInstagram(d: DepsSocial, quanti = 15): Promise<Video[]> {
  if (!d.igToken) throw new Error('Instagram: manca la chiave (secret IG_TOKEN)');
  const t = encodeURIComponent(d.igToken);
  const lista = await igJson<{ data?: IgMedia[] }>(d, `${IG}/me/media?fields=id,caption,media_product_type,timestamp,like_count,comments_count,permalink&limit=${quanti}&access_token=${t}`);
  const reel = (lista.data || []).filter((m) => m.media_product_type === 'REELS');
  return Promise.all(reel.map(async (m): Promise<Video> => {
    const i = await insightsIg(d, m.id, t);
    return {
      id: m.id, p: 'ig', data: m.timestamp || '', titolo: (m.caption || '').replace(/\s+/g, ' ').slice(0, 100), link: m.permalink,
      views: i.views || 0, like: m.like_count || 0, commenti: m.comments_count || 0, condivisioni: i.shares || 0,
      salvati: i.saved || 0, reach: i.reach || 0,
      ...(i.ig_reels_avg_watch_time ? { visioneMedia: Math.round(i.ig_reels_avg_watch_time / 100) / 10 } : {}),
    };
  }));
}

// ---------- TikTok ----------
const TT_AUTH = 'https://www.tiktok.com/v2/auth/authorize/';
const TT_TOKEN = 'https://open.tiktokapis.com/v2/oauth/token/';
const TT_VIDEO = 'https://open.tiktokapis.com/v2/video/list/?fields=id,create_time,title,video_description,duration,view_count,like_count,comment_count,share_count,share_url';
type TtVideo = { id: string; create_time?: number; title?: string; video_description?: string; duration?: number; view_count?: number; like_count?: number; comment_count?: number; share_count?: number; share_url?: string };

export const callbackTikTok = (origine: string) => `${origine}/tiktok/callback`;

export async function linkLoginTikTok(d: DepsSocial, origine: string): Promise<string> {
  const stato = crypto.randomUUID();
  await d.scrivi(K_TT_STATO, { stato, quando: Date.now() });
  const q = new URLSearchParams({
    client_key: d.ttKey || '', scope: 'user.info.basic,video.list', response_type: 'code',
    redirect_uri: callbackTikTok(origine), state: stato,
  });
  return `${TT_AUTH}?${q}`;
}

async function tokenTikTok(d: DepsSocial, campi: Record<string, string>): Promise<ChiaveTikTok> {
  const r = await d.fetch(TT_TOKEN, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'cache-control': 'no-cache' },
    body: new URLSearchParams({ client_key: d.ttKey || '', client_secret: d.ttSecret || '', ...campi }),
    signal: AbortSignal.timeout(20_000),
  });
  const j = (await r.json().catch(() => ({}))) as {
    access_token?: string; expires_in?: number; refresh_token?: string; refresh_expires_in?: number; open_id?: string;
    error?: string; error_description?: string;
  };
  if (!r.ok || !j.access_token || !j.refresh_token) throw new Error(`TikTok: ${j.error_description || j.error || `HTTP ${r.status}`}`);
  const ora = Date.now();
  const k: ChiaveTikTok = {
    access: j.access_token, scade: ora + (j.expires_in || 86_400) * 1000,
    refresh: j.refresh_token, refreshScade: ora + (j.refresh_expires_in || 31_536_000) * 1000, openId: j.open_id,
  };
  await d.scrivi(K_TT, k);
  return k;
}

// il link vale 15 minuti e una volta sola
export async function completaLoginTikTok(d: DepsSocial, origine: string, code: string, state: string): Promise<void> {
  const s = await d.leggi<{ stato: string; quando: number }>(K_TT_STATO);
  if (!s || s.stato !== state || Date.now() - s.quando > 15 * 60_000) throw new Error('Link scaduto o già usato: chiedi /tiktok al bot e riprova.');
  await d.cancella(K_TT_STATO);
  await tokenTikTok(d, { code, grant_type: 'authorization_code', redirect_uri: callbackTikTok(origine) });
}

async function accessoTikTok(d: DepsSocial): Promise<string | undefined> {
  const k = await d.leggi<ChiaveTikTok>(K_TT);
  if (!k || !d.ttKey) return undefined;
  if (k.scade - Date.now() > 5 * 60_000) return k.access;
  if (k.refreshScade < Date.now()) throw new Error('TikTok: accesso scaduto, ricollega con /tiktok');
  return (await tokenTikTok(d, { grant_type: 'refresh_token', refresh_token: k.refresh })).access;
}

export async function statoTikTok(d: DepsSocial): Promise<{ app: boolean; collegato: boolean; scade?: number }> {
  const k = await d.leggi<ChiaveTikTok>(K_TT);
  return { app: Boolean(d.ttKey && d.ttSecret), collegato: Boolean(k), scade: k?.refreshScade };
}

// undefined = TikTok non collegato (non è un errore)
export async function videoTikTok(d: DepsSocial, quanti = 20): Promise<Video[] | undefined> {
  const access = await accessoTikTok(d);
  if (!access) return undefined;
  const r = await d.fetch(TT_VIDEO, {
    method: 'POST',
    headers: { authorization: `Bearer ${access}`, 'content-type': 'application/json' },
    body: JSON.stringify({ max_count: Math.min(quanti, 20) }),
    signal: AbortSignal.timeout(20_000),
  });
  const j = (await r.json().catch(() => ({}))) as { data?: { videos?: TtVideo[] }; error?: { code?: string; message?: string } };
  if (!r.ok || (j.error?.code && j.error.code !== 'ok')) throw new Error(`TikTok: ${j.error?.message || j.error?.code || `HTTP ${r.status}`}`);
  return (j.data?.videos || []).map((v) => ({
    id: v.id, p: 'tt', data: v.create_time ? new Date(v.create_time * 1000).toISOString() : '',
    titolo: (v.title || v.video_description || '').replace(/\s+/g, ' ').slice(0, 100), link: v.share_url, durata: v.duration,
    views: v.view_count || 0, like: v.like_count || 0, commenti: v.comment_count || 0, condivisioni: v.share_count || 0,
  }));
}

// ---------- storico ----------
export async function fotografa(d: DepsSocial, ora = Date.now()): Promise<Fotografia> {
  const errori: string[] = [];
  const [ig, tt] = await Promise.all([
    videoInstagram(d).catch((e) => { errori.push(messaggio(e)); return [] as Video[]; }),
    videoTikTok(d).catch((e) => { errori.push(messaggio(e)); return [] as Video[]; }),
  ]);
  const f: Fotografia = { giorno: giornoRoma(ora), quando: ora, video: [...ig, ...(tt || [])], errori, tiktok: tt !== undefined };
  if (f.video.length) {
    await d.scrivi(kGiorno(f.giorno), f);
    const giorni = [...new Set([...((await d.leggi<string[]>(K_GIORNI)) || []), f.giorno])].sort();
    for (const g of giorni.slice(0, -GIORNI_TENUTI)) await d.cancella(kGiorno(g));
    await d.scrivi(K_GIORNI, giorni.slice(-GIORNI_TENUTI));
  }
  return f;
}

async function precedenti(d: DepsSocial, giorno: string, quanti = 7): Promise<Fotografia[]> {
  const giorni = ((await d.leggi<string[]>(K_GIORNI)) || []).filter((g) => g < giorno).slice(-quanti).reverse();
  const out: Fotografia[] = [];
  for (const g of giorni) {
    const f = await d.leggi<Fotografia>(kGiorno(g));
    if (f) out.push(f);
  }
  return out;
}

export type Riga = Video & { giorni: number; dViews?: number; dLike?: number; dCondivisioni?: number; dSalvati?: number; oreDa?: number };

// crescita dalla rilevazione più recente in cui c'era lo stesso video (anche se ieri una piattaforma era giù)
export function confronta(f: Fotografia, prima: Fotografia[]): Riga[] {
  return f.video.map((v) => {
    const giorni = v.data ? Math.max(0, Math.floor((f.quando - Date.parse(v.data)) / 86_400_000)) : 0;
    for (const p of prima) {
      const w = p.video.find((x) => x.id === v.id && x.p === v.p);
      if (!w) continue;
      return {
        ...v, giorni, oreDa: Math.round((f.quando - p.quando) / 3_600_000),
        dViews: v.views - w.views, dLike: v.like - w.like, dCondivisioni: v.condivisioni - w.condivisioni,
        ...(v.salvati !== undefined && w.salvati !== undefined ? { dSalvati: v.salvati - w.salvati } : {}),
      };
    }
    return { ...v, giorni };
  });
}

// ---------- AI ----------
async function chiediAI(d: DepsSocial, prompt: string): Promise<string | undefined> {
  if (d.geminiKey) {
    for (const [modello, ragiona] of [['gemini-flash-latest', true], ['gemini-flash-lite-latest', false]] as const) {
      try {
        const r = await d.fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modello}:generateContent`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': d.geminiKey },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.6, maxOutputTokens: 4096, ...(ragiona ? { thinkingConfig: { thinkingBudget: 1024 } } : {}) },
          }),
          signal: AbortSignal.timeout(60_000),
        });
        if (!r.ok) {
          console.error(`social: ${modello} ha risposto ${r.status}`);
          if (r.status === 401 || r.status === 403) break;
          continue;
        }
        const j = (await r.json()) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
        const t = (j.candidates?.[0]?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join('').trim();
        if (t) return t;
      } catch (e) {
        console.error(`social: ${modello} non raggiungibile (${(e as Error).name})`);
      }
    }
  }
  if (d.anthropicKey) {
    try {
      const r = await d.fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': d.anthropicKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 1500, messages: [{ role: 'user', content: prompt }] }),
        signal: AbortSignal.timeout(60_000),
      });
      if (r.ok) {
        const j = (await r.json()) as { content?: { text?: string }[] };
        const t = (j.content || []).map((p) => p.text || '').join('').trim();
        if (t) return t;
      } else console.error(`social: Claude ha risposto ${r.status}`);
    } catch (e) {
      console.error(`social: Claude non raggiungibile (${(e as Error).name})`);
    }
  }
  return undefined;
}

export function promptPiano(righe: Riga[], piani: { giorno: string; testo: string }[], conCrescita: boolean, oggi: string): string {
  const dati = righe.map((r) => ({
    p: r.p === 'ig' ? 'Instagram' : 'TikTok', giorni: r.giorni, titolo: r.titolo.slice(0, 80),
    views: r.views, ...(r.dViews !== undefined ? { crescita_views: r.dViews, ore: r.oreDa } : {}),
    like: r.like, commenti: r.commenti, condivisioni: r.condivisioni,
    ...(r.salvati !== undefined ? { salvati: r.salvati } : {}), ...(r.reach !== undefined ? { reach: r.reach } : {}),
    ...(r.visioneMedia ? { visione_media_s: r.visioneMedia } : {}), ...(r.durata ? { durata_s: r.durata } : {}),
  }));
  return [
    `Sei il social media manager di Denis (.blackden), creator tech italiano. Oggi è ${oggi}.`,
    'Contenuti: recensioni hardware (tastiere, mouse, microfoni, camere, gadget), affiliazione TikTok Shop, comparatore prezzi TikTok/Amazon, format DENbunking (debunking di disinformazione, politica e attualità). Pubblica Reel su Instagram e video su TikTok, spesso lo stesso video.',
    'Qui sotto le statistiche dei suoi ultimi video' + (conCrescita ? ', con la crescita dall’ultima rilevazione (crescita_views nelle ultime "ore").' : '. È il primo giorno di storico: niente crescita, solo totali.'),
    'TikTok non fornisce i salvataggi. Video con 0 views e 0 reach: probabilmente reel di prova o non distribuiti.',
    '',
    'Scrivi il messaggio Telegram di stamattina. Italiano, diretto, niente preamboli né complimenti, al massimo 1800 caratteri. Usa solo i tag HTML <b> e <i>, niente markdown. Struttura:',
    '<b>Cosa dicono i numeri</b> 2-3 punti con numeri veri: cosa cresce ancora e cosa si è fermato, quale argomento o format rende di più e su quale piattaforma, condivisioni e salvataggi rispetto alle views come segnale di qualità.',
    '<b>Oggi</b> 3 azioni concrete, fattibili oggi, in ordine di priorità (es. quale video portare sull’altra piattaforma, quale argomento rifare e con che aggancio, a quali commenti rispondere, a che ora pubblicare). Ogni azione legata a un dato.',
    '<b>Idea video</b> una idea con titolo e frase d’aggancio dei primi 2 secondi, coerente con ciò che funziona.',
    'Non inventare numeri o dati che non ci sono. Non riproporre le azioni dei piani precedenti se i numeri non sono cambiati.',
    '',
    `Dati: ${JSON.stringify(dati)}`,
    ...(piani.length ? ['', 'Piani dei giorni scorsi:', ...piani.map((p) => `${p.giorno}: ${p.testo.slice(0, 600)}`)] : []),
  ].join('\n');
}

// Telegram rifiuta l'HTML con tag sbilanciati o sconosciuti: si tiene solo <b>/<i> e solo se tornano i conti
export function htmlSicuro(s: string): string {
  const base = esc(s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'));
  const conTag = base.replace(/&lt;(\/?)(b|i)&gt;/g, '<$1$2>');
  const bilanciati = (['b', 'i'] as const).every((t) => (conTag.match(new RegExp(`<${t}>`, 'g')) || []).length === (conTag.match(new RegExp(`</${t}>`, 'g')) || []).length);
  return bilanciati ? conTag : base.replace(/&lt;\/?(b|i)&gt;/g, '');
}

// ---------- messaggio ----------
function riepilogo(f: Fotografia, righe: Riga[], conCrescita: boolean): string {
  const data = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', weekday: 'short', day: '2-digit', month: '2-digit' }).format(new Date(f.quando));
  const out = [`📊 <b>Social · ${esc(data)}</b>`];
  for (const p of ['ig', 'tt'] as const) {
    const nome = p === 'ig' ? 'Instagram' : 'TikTok';
    const mie = righe.filter((r) => r.p === p);
    if (p === 'tt' && !f.tiktok) { out.push(`<b>${nome}</b> non collegato: /tiktok`); continue; }
    if (!mie.length) continue;
    const tot = mie.reduce((a, r) => a + r.views, 0);
    const conD = mie.filter((r) => r.dViews !== undefined);
    const cresc = conD.reduce((a, r) => a + (r.dViews || 0), 0);
    out.push(`<b>${nome}</b> ${mie.length} video · ${conD.length ? `${conSegno(cresc)} views da ieri · ` : ''}${n(tot)} in tutto`);
  }
  const top = [...righe]
    .sort((a, b) => (conCrescita ? (b.dViews || 0) - (a.dViews || 0) : b.views - a.views))
    .filter((r) => (conCrescita ? (r.dViews || 0) > 0 : r.views > 0))
    .slice(0, 3);
  if (top.length) {
    out.push('', conCrescita ? '🔥 <b>Crescono di più</b>' : '🔥 <b>I più visti</b> <i>(primo giorno di storico: la crescita si vede da domani)</i>');
    top.forEach((r, i) => {
      const titolo = esc(r.titolo.slice(0, 50) || '(senza titolo)');
      const val = conCrescita ? `${conSegno(r.dViews || 0)} views` : `${n(r.views)} views`;
      out.push(`${i + 1}. ${r.p === 'ig' ? 'IG' : 'TT'} ${r.link ? `<a href="${esc(r.link)}">${titolo}</a>` : titolo} · ${val}`);
    });
  }
  return out.join('\n');
}

export async function pianoDelGiorno(d: DepsSocial, ora = Date.now()): Promise<string> {
  const f = await fotografa(d, ora);
  const prima = await precedenti(d, f.giorno);
  const righe = confronta(f, prima);
  const conCrescita = righe.some((r) => r.dViews !== undefined);
  const parti = [riepilogo(f, righe, conCrescita)];
  if (f.video.length) {
    const piani = (await d.leggi<{ giorno: string; testo: string }[]>(K_PIANI)) || [];
    const oggi = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(ora));
    const ai = await chiediAI(d, promptPiano(righe, piani.filter((p) => p.giorno !== f.giorno).slice(-3), conCrescita, oggi));
    if (ai) {
      await d.scrivi(K_PIANI, [...piani.filter((p) => p.giorno !== f.giorno), { giorno: f.giorno, testo: ai.slice(0, 1500) }].slice(-5));
      parti.push(htmlSicuro(ai.slice(0, 2600)));
    } else parti.push('<i>L’AI non ha risposto: per oggi solo i numeri.</i>');
  }
  if (f.errori.length) parti.push(f.errori.map((e) => `⚠️ ${esc(e)}`).join('\n'));
  return parti.join('\n\n');
}

// pagine minime richieste dalla configurazione dell'app TikTok (uso personale, nessun dato di terzi)
export const PAGINA_PRIVACY = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Privacy</title>
<body style="font:16px/1.5 system-ui;max-width:640px;margin:40px auto;padding:0 16px">
<h1>Privacy</h1><p>Questo strumento è ad uso personale di Denis Nusinovic (.blackden). Legge solo le statistiche pubbliche e aggregate dei video del suo account (visualizzazioni, like, commenti, condivisioni) per inviargli un riepilogo privato su Telegram.</p>
<p>Non raccoglie dati di altri utenti, non li vende né li condivide. I token di accesso sono conservati cifrati su Cloudflare e si possono revocare in qualsiasi momento dalle impostazioni di TikTok.</p>
</body>`;
export const PAGINA_TERMINI = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Termini</title>
<body style="font:16px/1.5 system-ui;max-width:640px;margin:40px auto;padding:0 16px">
<h1>Termini di servizio</h1><p>Strumento privato, usato solo dal titolare dell'account per leggere le statistiche dei propri video. Nessun servizio è offerto a terzi. Fornito così com'è, senza garanzie.</p>
</body>`;

// Crescita (30/10, "implementa tutto quello che non richiede un mio intervento"): oltre al piano del
// mattino (social.ts) il bot
// - legge i commenti nuovi di Instagram e per ognuno propone una risposta: ✅ la pubblica, ✏️ la scrivi
//   tu, 🙈 nasconde lo spam (serve instagram_manage_comments nella chiave: se manca, l'errore lo dice)
// - ogni 3 ore guarda se un video sta partendo più forte del solito e avvisa subito
// - il lunedì manda il report della settimana: follower, video migliori e peggiori, stesso video su
//   Instagram e TikTok a confronto, orari in cui pubblicare, domande ricorrenti nei commenti e il
//   radar dei concorrenti (account scelti con /radar, solo con la chiave di Facebook EAA…)
import { accountIg, chiediAI, htmlSicuro, giornoRoma, K_GIORNI, kGiorno, videoInstagram, videoTikTok, type DepsSocial, type Fotografia, type Video } from './social';

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const n = (x: number) => Math.round(x).toLocaleString('it-IT');
const tronca = (s: string, k: number) => (s.length > k ? `${s.slice(0, k - 1)}…` : s);

const K_VISTI = 'cm:visti';
const K_SETTIMANA = 'cm:settimana';
export const kCommento = (id: string) => `cm:${id}`;
const K_ULTIMO = 'social:ultimo';
const K_ALLARMI = 'social:allarmi';
export const K_RADAR = 'social:radar';
const K_FOLLOWER = 'social:follower';

async function graph<T>(d: DepsSocial, url: string, init?: RequestInit): Promise<T> {
  const r = await d.fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
  const j = (await r.json().catch(() => ({}))) as T & { error?: { message?: string; code?: number } };
  if (!r.ok || j.error) {
    const m = j.error?.message || `HTTP ${r.status}`;
    // permesso mancante: si dice quale
    if (/permission|\(#10\)|\(#200\)/i.test(m)) throw new Error(`Instagram: permesso mancante (${m.slice(0, 120)}). Per i commenti la chiave deve avere instagram_manage_comments`);
    throw new Error(`Instagram: ${m}`);
  }
  return j;
}
async function ig(d: DepsSocial) {
  if (!d.igToken) throw new Error('Instagram non collegato (IG_TOKEN)');
  const { base, io } = await accountIg(d.fetch, d.igToken, d.igUtente);
  return { base, io, t: encodeURIComponent(d.igToken) };
}

// ---------- commenti ----------
export type Commento = { id: string; testo: string; utente: string; quando: string; media: string; titolo: string; link?: string };
export type CommentoSalvato = Commento & { proposta?: string; spam?: boolean; msg?: number; fatto?: string };

/** commenti degli ultimi reel non ancora visti (il primo giro segna tutto come visto e tiene solo le ultime 48 ore) */
export async function commentiNuovi(d: DepsSocial, ora = Date.now()): Promise<Commento[]> {
  const { base, io, t } = await ig(d);
  const io2 = await graph<{ username?: string }>(d, `${base}/${io}?fields=username&access_token=${t}`).catch(() => ({} as { username?: string }));
  const media = await graph<{ data?: { id: string; caption?: string; permalink?: string; timestamp?: string; comments_count?: number }[] }>(d,
    `${base}/${io}/media?fields=id,caption,permalink,timestamp,comments_count&limit=15&access_token=${t}`);
  const tutti: Commento[] = [];
  for (const m of media.data || []) {
    if (!m.comments_count || (m.timestamp && ora - Date.parse(m.timestamp) > 30 * 86_400_000)) continue;
    const c = await graph<{ data?: { id: string; text?: string; username?: string; timestamp?: string }[] }>(d,
      `${base}/${m.id}/comments?fields=id,text,username,timestamp&limit=50&access_token=${t}`);
    for (const x of c.data || []) {
      if (!x.text || (io2.username && x.username === io2.username)) continue;
      tutti.push({ id: x.id, testo: x.text, utente: x.username || '?', quando: x.timestamp || '', media: m.id,
        titolo: (m.caption || '').replace(/\s+/g, ' ').slice(0, 60), link: m.permalink });
    }
  }
  const visti = await d.leggi<string[]>(K_VISTI);
  const nuovi = tutti.filter((c) => !(visti || []).includes(c.id) && (visti || ora - Date.parse(c.quando) < 48 * 3_600_000));
  await d.scrivi(K_VISTI, [...new Set([...(visti || []), ...tutti.map((c) => c.id)])].slice(-1500));
  // per le domande ricorrenti del report del lunedì
  if (nuovi.length) {
    const sett = (await d.leggi<{ g: string; t: string }[]>(K_SETTIMANA)) || [];
    await d.scrivi(K_SETTIMANA, [...sett, ...nuovi.map((c) => ({ g: giornoRoma(Date.parse(c.quando) || ora), t: c.testo.slice(0, 200) }))].slice(-400));
  }
  return nuovi.sort((a, b) => a.quando.localeCompare(b.quando));
}

/** risposta proposta dall'AI per ogni commento (nel tono di Denis), e se è spam */
export async function proposte(d: DepsSocial, commenti: Commento[]): Promise<Record<string, { risposta: string; spam: boolean }>> {
  if (!commenti.length) return {};
  const prompt = [
    'Sei Denis (.blackden), creator tech italiano: recensioni di gadget, affiliazione TikTok Shop/Amazon, debunking (DENbunking).',
    'Per ogni commento ai suoi Reel scrivi la risposta che darebbe lui: italiano parlato, breve (max 140 caratteri), cordiale e diretta, al massimo un emoji, mai servile. Se chiedono il link o il prezzo, rispondi che è in bio. Se non sai un dato tecnico non inventarlo: rispondi che lo verifichi o rimanda al video.',
    'spam = true per pubblicità, bot, truffe, insulti senza contenuto.',
    'Rispondi SOLO con JSON: {"<id>": {"risposta": "...", "spam": false}, ...}',
    '',
    JSON.stringify(commenti.map((c) => ({ id: c.id, video: c.titolo, utente: c.utente, commento: c.testo.slice(0, 300) }))),
  ].join('\n');
  const t = await chiediAI(d, prompt);
  try {
    const j = JSON.parse((t || '').replace(/^```(?:json)?\s*|\s*```$/g, '').trim()) as Record<string, { risposta?: string; spam?: boolean }>;
    return Object.fromEntries(Object.entries(j).map(([k, v]) => [k, { risposta: String(v?.risposta || '').slice(0, 300), spam: Boolean(v?.spam) }]));
  } catch { return {}; }
}

export async function rispondiCommento(d: DepsSocial, id: string, testo: string) {
  const { base, t } = await ig(d);
  await graph(d, `${base}/${id}/replies`, { method: 'POST', body: new URLSearchParams({ message: testo.slice(0, 2200), access_token: decodeURIComponent(t) }) });
}
export async function nascondiCommento(d: DepsSocial, id: string) {
  const { base, t } = await ig(d);
  await graph(d, `${base}/${id}`, { method: 'POST', body: new URLSearchParams({ hide: 'true', access_token: decodeURIComponent(t) }) });
}

export const testoCommento = (c: CommentoSalvato) => [
  `💬 <b>@${esc(c.utente)}</b> su ${c.link ? `<a href="${esc(c.link)}">${esc(c.titolo || 'un reel')}</a>` : `<i>${esc(c.titolo || 'un reel')}</i>`}`,
  `«${esc(tronca(c.testo, 500))}»`,
  ...(c.fatto ? ['', c.fatto] : c.spam ? ['', '🚩 <i>Sembra spam</i>'] : c.proposta ? ['', `✍️ <i>${esc(c.proposta)}</i>`] : []),
].join('\n');

// ---------- "sta esplodendo" ----------
const chiave = (v: Video) => `${v.p}:${v.id}`;
const mediana = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

/** avvisi per i video recenti che partono molto più forte del solito (una volta per ogni raddoppio) */
export async function controllaEsplosioni(d: DepsSocial, ora = Date.now()): Promise<string[]> {
  const [igv, ttv] = await Promise.all([videoInstagram(d).catch(() => [] as Video[]), videoTikTok(d).catch(() => undefined)]);
  const video = [...igv, ...(ttv || [])];
  if (!video.length) return [];
  const prima = await d.leggi<{ quando: number; views: Record<string, number> }>(K_ULTIMO);
  const allarmi = (await d.leggi<Record<string, number>>(K_ALLARMI)) || {};
  const out: string[] = [];
  for (const p of ['ig', 'tt'] as const) {
    const mie = video.filter((v) => v.p === p);
    // riferimento: le views tipiche dei video con più di 3 giorni (quasi a regime)
    const rif = mediana(mie.filter((v) => v.data && ora - Date.parse(v.data) > 3 * 86_400_000).map((v) => v.views));
    if (rif < 50) continue;
    for (const v of mie) {
      const ore = v.data ? (ora - Date.parse(v.data)) / 3_600_000 : Infinity;
      if (ore > 7 * 24) continue;
      const volte = v.views / rif;
      const livello = Math.floor(Math.log2(volte));
      if (volte < 2 || v.views < 500 || livello <= (allarmi[chiave(v)] ?? 0)) continue;
      allarmi[chiave(v)] = livello;
      const prec = prima?.views[chiave(v)];
      const passo = prec !== undefined && prima ? ` · +${n(v.views - prec)} nelle ultime ${Math.max(1, Math.round((ora - prima.quando) / 3_600_000))} ore` : '';
      out.push([
        `🚀 <b>Sta esplodendo</b> su ${p === 'ig' ? 'Instagram' : 'TikTok'}: ${v.link ? `<a href="${esc(v.link)}">${esc(v.titolo.slice(0, 60) || 'video')}</a>` : esc(v.titolo.slice(0, 60))}`,
        `${n(v.views)} views in ${ore < 48 ? `${Math.round(ore)} ore` : `${Math.round(ore / 24)} giorni`}${passo}: <b>${volte.toFixed(1)}×</b> un tuo video tipico (${n(rif)}).`,
        '',
        '<b>Adesso:</b> rispondi ai commenti (li trovi qui), fissa in alto quello col link o la domanda più utile, e prepara un seguito sullo stesso tema finché è caldo.'
          + (p === 'tt' && !igv.some((x) => similitudine(x.titolo, v.titolo) > 0.4) ? ' Su Instagram non c\'è ancora: portalo anche lì.' : ''),
      ].join('\n'));
    }
  }
  await d.scrivi(K_ULTIMO, { quando: ora, views: Object.fromEntries(video.map((v) => [chiave(v), v.views])) });
  await d.scrivi(K_ALLARMI, Object.fromEntries(Object.entries(allarmi).filter(([k]) => video.some((v) => chiave(v) === k))));
  return out;
}

// ---------- stesso video su Instagram e TikTok ----------
const parole = (s: string) => new Set(s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/#\S+/g, '').match(/[a-z0-9]{3,}/g) || []);
export function similitudine(a: string, b: string): number {
  const x = parole(a), y = parole(b);
  if (!x.size || !y.size) return 0;
  let k = 0; for (const w of x) if (y.has(w)) k++;
  return k / Math.min(x.size, y.size);
}
export function coppie(video: Video[]): { ig: Video; tt: Video }[] {
  const igv = video.filter((v) => v.p === 'ig'), ttv = video.filter((v) => v.p === 'tt');
  const out: { ig: Video; tt: Video }[] = [];
  for (const a of igv) {
    const b = ttv.filter((t) => Math.abs(Date.parse(t.data) - Date.parse(a.data)) < 5 * 86_400_000)
      .map((t) => ({ t, s: similitudine(a.titolo, t.titolo) })).sort((x, y) => y.s - x.s)[0];
    if (b && b.s >= 0.4 && !out.some((o) => o.tt.id === b.t.id)) out.push({ ig: a, tt: b.t });
  }
  return out;
}

// ---------- orari ----------
const oraRoma = (iso: string) => Number(new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', hourCycle: 'h23' }).format(new Date(iso)));
/** quando i follower sono online (Instagram) e a che ora sono andati meglio i tuoi video */
export async function orari(d: DepsSocial, video: Video[], ora = Date.now()): Promise<string[]> {
  const out: string[] = [];
  try {
    const { base, io, t } = await ig(d);
    const j = await graph<{ data?: { values?: { value?: Record<string, number> }[] }[] }>(d, `${base}/${io}/insights?metric=online_followers&period=lifetime&access_token=${t}`);
    const vals = (j.data?.[0]?.values || []).map((v) => v.value || {}).filter((v) => Object.keys(v).length);
    if (vals.length) {
      // le ore di Instagram sono nel fuso del Pacifico: si portano a quello italiano
      const somma = new Array(24).fill(0);
      for (const v of vals) for (const [h, c] of Object.entries(v)) somma[(Number(h) + 9) % 24] += c;
      const top = somma.map((c, h) => ({ h, c })).sort((a, b) => b.c - a.c).slice(0, 3).sort((a, b) => a.h - b.h);
      out.push(`Follower Instagram più online: ${top.map((x) => `${x.h}:00`).join(', ')}`);
    }
  } catch { /* online_followers serve 100+ follower e il permesso delle statistiche: senza, solo lo storico */ }
  const maturi = video.filter((v) => v.data && ora - Date.parse(v.data) > 3 * 86_400_000 && v.views > 0);
  if (maturi.length >= 6) {
    const fasce = new Map<string, number[]>();
    for (const v of maturi) {
      const h = oraRoma(v.data);
      const f = h < 12 ? 'mattina (prima delle 12)' : h < 16 ? 'primo pomeriggio (12–16)' : h < 20 ? 'tardo pomeriggio (16–20)' : 'sera (dopo le 20)';
      fasce.set(f, [...(fasce.get(f) || []), v.views]);
    }
    const r = [...fasce].filter(([, a]) => a.length >= 2).map(([f, a]) => ({ f, m: mediana(a), k: a.length })).sort((a, b) => b.m - a.m);
    if (r.length >= 2) out.push(`I tuoi video rendono di più pubblicati di ${r[0].f}: ${n(r[0].m)} views tipiche contro ${n(r[r.length - 1].m)} di ${r[r.length - 1].f}`);
  }
  return out;
}

// ---------- radar concorrenti ----------
type Bd = { business_discovery?: { username?: string; followers_count?: number; media?: { data?: { caption?: string; like_count?: number; comments_count?: number; timestamp?: string; permalink?: string; media_product_type?: string }[] } } };
export async function radar(d: DepsSocial, ora = Date.now()): Promise<{ righe: string[]; dati: unknown[] }> {
  const nomi = (await d.leggi<string[]>(K_RADAR)) || [];
  if (!nomi.length) return { righe: [], dati: [] };
  const { base, io, t } = await ig(d);
  if (!base.includes('facebook')) return { righe: ['Radar: serve la chiave di Facebook (EAA…), con quella di Instagram Meta non lo permette'], dati: [] };
  const righe: string[] = [], dati: unknown[] = [];
  for (const nome of nomi.slice(0, 10)) {
    try {
      const j = await graph<Bd>(d, `${base}/${io}?fields=business_discovery.username(${encodeURIComponent(nome)}){username,followers_count,media.limit(15){caption,like_count,comments_count,timestamp,permalink,media_product_type}}&access_token=${t}`);
      const b = j.business_discovery;
      const recenti = (b?.media?.data || []).filter((m) => m.timestamp && ora - Date.parse(m.timestamp) < 14 * 86_400_000);
      const top = [...recenti].sort((a, c) => (c.like_count || 0) + 3 * (c.comments_count || 0) - (a.like_count || 0) - 3 * (a.comments_count || 0)).slice(0, 2);
      dati.push({ account: nome, follower: b?.followers_count, post_14_giorni: recenti.length,
        migliori: top.map((m) => ({ testo: (m.caption || '').slice(0, 120), like: m.like_count, commenti: m.comments_count, tipo: m.media_product_type })) });
      if (top[0]) righe.push(`@${esc(nome)}: ${top[0].permalink ? `<a href="${esc(top[0].permalink)}">${esc(tronca((top[0].caption || 'post').replace(/\s+/g, ' '), 50))}</a>` : esc(tronca(top[0].caption || 'post', 50))} · ${n(top[0].like_count || 0)} like`);
    } catch (e) { righe.push(`@${esc(nome)}: ${esc(String((e as Error).message).slice(0, 80))}`); }
  }
  return { righe, dati };
}

// ---------- report del lunedì ----------
async function fotografie(d: DepsSocial, giorni: number): Promise<Fotografia[]> {
  const elenco = ((await d.leggi<string[]>(K_GIORNI)) || []).slice(-giorni);
  const out: Fotografia[] = [];
  for (const g of elenco) { const f = await d.leggi<Fotografia>(kGiorno(g)); if (f) out.push(f); }
  return out;
}

export async function reportSettimana(d: DepsSocial, ora = Date.now()): Promise<string> {
  const foto = await fotografie(d, 8);
  const ultima = foto[foto.length - 1];
  if (!ultima) return '📈 <b>Report della settimana</b>\nAncora niente storico: il primo arriva tra una settimana di rilevazioni.';
  const inizio = foto[0];
  const righe = ultima.video.map((v) => {
    const w = inizio.video.find((x) => x.id === v.id && x.p === v.p);
    return { ...v, settimana: v.views - (w && w !== v ? w.views : 0) };
  });
  // follower Instagram: si salva il conteggio a ogni report
  let follower: string | undefined;
  try {
    const { base, io, t } = await ig(d);
    const j = await graph<{ followers_count?: number }>(d, `${base}/${io}?fields=followers_count&access_token=${t}`);
    if (j.followers_count !== undefined) {
      const storia = (await d.leggi<{ g: string; ig: number }[]>(K_FOLLOWER)) || [];
      const prec = storia[storia.length - 1];
      follower = `${n(j.followers_count)}${prec ? ` (${j.followers_count - prec.ig >= 0 ? '+' : ''}${n(j.followers_count - prec.ig)} dal ${prec.g})` : ''}`;
      await d.scrivi(K_FOLLOWER, [...storia, { g: giornoRoma(ora), ig: j.followers_count }].slice(-30));
    }
  } catch { /* senza follower si va avanti */ }
  const coppieV = coppie(ultima.video);
  const fasce = await orari(d, ultima.video, ora);
  const rad = await radar(d, ora).catch(() => ({ righe: [] as string[], dati: [] as unknown[] }));
  const commenti = ((await d.leggi<{ g: string; t: string }[]>(K_SETTIMANA)) || []).filter((c) => Date.parse(c.g) > ora - 8 * 86_400_000);
  const migliori = [...righe].sort((a, b) => b.settimana - a.settimana).slice(0, 3);
  const fermi = righe.filter((r) => r.data && ora - Date.parse(r.data) < 10 * 86_400_000).sort((a, b) => a.settimana - b.settimana).slice(0, 2);

  const dati = {
    follower_instagram: follower,
    video: righe.map((r) => ({ p: r.p, titolo: r.titolo.slice(0, 70), views_settimana: r.settimana, views: r.views, like: r.like, condivisioni: r.condivisioni, salvati: r.salvati, visione_media_s: r.visioneMedia })),
    stesso_video_ig_tt: coppieV.map((c) => ({ titolo: c.ig.titolo.slice(0, 60), ig_views: c.ig.views, tt_views: c.tt.views, ig_condivisioni: c.ig.condivisioni, tt_condivisioni: c.tt.condivisioni })),
    orari: fasce, concorrenti: rad.dati, commenti_settimana: commenti.slice(-120).map((c) => c.t),
  };
  const ai = await chiediAI(d, [
    'Sei il social media manager di Denis (.blackden), creator tech italiano (recensioni hardware, affiliazione TikTok Shop/Amazon, debunking DENbunking).',
    'Scrivi il report della settimana per Telegram: italiano, diretto, niente preamboli, max 2000 caratteri, solo tag <b> e <i>. Sezioni:',
    '<b>La settimana</b> 2-3 punti con numeri veri (follower, video che hanno tirato, cosa si è fermato).',
    '<b>Instagram o TikTok</b> dove va meglio lo stesso video e un\'ipotesi concreta sul perché (gancio, durata, didascalia), se ci sono coppie.',
    '<b>Cosa chiedono</b> le domande o richieste ricorrenti nei commenti, raggruppate, e quali diventano video.',
    '<b>Concorrenti</b> cosa ha funzionato da loro e cosa prendere (se ci sono dati).',
    '<b>Settimana prossima</b> 3 video da fare con titolo e aggancio, e quando pubblicarli (usa gli orari se ci sono).',
    'Non inventare numeri. Salta le sezioni senza dati.',
    '', JSON.stringify(dati),
  ].join('\n'));
  const testa = [
    '📈 <b>Report della settimana</b>',
    ...(follower ? [`👥 Follower Instagram: ${esc(follower)}`] : []),
    ...(migliori.length ? ['', '🔥 <b>Hanno tirato</b>', ...migliori.map((r, i) => `${i + 1}. ${r.p === 'ig' ? 'IG' : 'TT'} ${r.link ? `<a href="${esc(r.link)}">${esc(tronca(r.titolo || 'video', 45))}</a>` : esc(tronca(r.titolo, 45))} · +${n(r.settimana)}`)] : []),
    ...(fermi.length ? ['', '🧊 <b>Si sono fermati</b>', ...fermi.map((r) => `${r.p === 'ig' ? 'IG' : 'TT'} ${esc(tronca(r.titolo || 'video', 45))} · +${n(r.settimana)}`)] : []),
    ...(coppieV.length ? ['', '⚖️ <b>Stesso video</b>', ...coppieV.slice(0, 4).map((c) => `${esc(tronca(c.ig.titolo || 'video', 40))}: IG ${n(c.ig.views)} · TT ${n(c.tt.views)}`)] : []),
    ...(fasce.length ? ['', '🕒 <b>Quando pubblicare</b>', ...fasce.map(esc)] : []),
    ...(rad.righe.length ? ['', '🛰 <b>Radar</b>', ...rad.righe] : []),
  ];
  return [testa.join('\n'), ai ? htmlSicuro(ai.slice(0, 2600)) : '<i>L’AI non ha risposto: solo i numeri.</i>'].join('\n\n');
}

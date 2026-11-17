// 📊 Numeri di YouTube per l'Analista della squadra (17/11): per gli ultimi Shorts del canale views, like,
// commenti, condivisioni, visione media, % vista e la CURVA di retention (quanta gente resta a ogni punto del
// video: dove scrollano via). Gira nel workflow "statistiche" dopo i numeri di Instagram e TikTok del bot e
// li aggiunge allo stesso file (video con p: "yt").
// Chiavi: YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN (le stesse della pubblicazione). Il refresh token
// deve avere anche gli scope youtube.readonly e yt-analytics.readonly, e nel progetto Google va abilitata la
// «YouTube Analytics API»: se mancano, nel file finisce un errore che spiega cosa fare (niente crash).
// Repo pubblico: nel log solo i conteggi, mai titoli o numeri dei video.
import fs from 'node:fs';

const API = () => process.env.YT_API_BASE || 'https://www.googleapis.com/youtube/v3';
const ANALYTICS = () => process.env.YT_ANALYTICS_BASE || 'https://youtubeanalytics.googleapis.com/v2/reports';
const OAUTH = () => process.env.OAUTH_URL || 'https://oauth2.googleapis.com/token';
const QUANTI = Number(process.env.YT_QUANTI || 25);

// «PT1M5S» → 65
export function secondiIso(d) {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(String(d || ''));
  if (!m) return null;
  return (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0);
}

// errore di Google leggibile: i permessi mancanti diventano l'istruzione per Denis
export function spiegaErrore(stato, corpo) {
  const msg = corpo?.error?.message || corpo?.error_description || corpo?.error || `HTTP ${stato}`;
  const motivo = JSON.stringify(corpo?.error?.errors || corpo?.error?.details || '');
  if (stato === 403 && /accessNotConfigured|SERVICE_DISABLED|has not been used|disabled/i.test(`${msg} ${motivo}`)) {
    return 'YouTube: abilita la «YouTube Analytics API» nel progetto Google Cloud (stesso progetto della pubblicazione)';
  }
  if (stato === 403 || stato === 401 || /insufficient|scope|PERMISSION/i.test(`${msg} ${motivo}`)) {
    return 'YouTube: la chiave carica i video ma non legge le statistiche. Rigenera il refresh token con gli scope youtube.upload, youtube.readonly e yt-analytics.readonly (bot Regista → ⚙️ → 🔗)';
  }
  return `YouTube: ${String(msg).slice(0, 160)}`;
}

async function chiedi(url, token) {
  const r = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(spiegaErrore(r.status, j));
  return j;
}

// curva: [[frazione del video 0–1, quanta gente guarda (1 = tutti; negli Shorts può superare 1 per i rewatch)]]
export function curvaDa(righe) {
  return (righe || []).map((r) => [Math.round(Number(r[0]) * 100) / 100, Math.round(Number(r[1]) * 1000) / 1000])
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y)).sort((a, b) => a[0] - b[0]);
}

export async function numeriYouTube() {
  const { YT_CLIENT_ID: id, YT_CLIENT_SECRET: segreto, YT_REFRESH_TOKEN: rinnovo } = process.env;
  if (!id || !segreto || !rinnovo) return { video: [], errori: ['YouTube: non collegato (mancano i secret YT_*)'] };
  const t = await fetch(OAUTH(), { method: 'POST', body: new URLSearchParams({ client_id: id, client_secret: segreto, refresh_token: rinnovo, grant_type: 'refresh_token' }) });
  const tj = await t.json().catch(() => ({}));
  if (!t.ok || !tj.access_token) return { video: [], errori: [spiegaErrore(t.status, tj)] };
  const token = tj.access_token;
  const errori = [];

  // i video caricati: playlist «uploads» del canale
  let ids = [];
  try {
    const ch = await chiedi(`${API()}/channels?part=contentDetails&mine=true`, token);
    const uploads = ch.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploads) return { video: [], errori: ['YouTube: canale senza video caricati'] };
    const pl = await chiedi(`${API()}/playlistItems?part=contentDetails&maxResults=${Math.min(50, QUANTI)}&playlistId=${encodeURIComponent(uploads)}`, token);
    ids = (pl.items || []).map((x) => x.contentDetails?.videoId).filter(Boolean);
  } catch (e) { return { video: [], errori: [e.message] }; }
  if (!ids.length) return { video: [], errori };

  const info = await chiedi(`${API()}/videos?part=snippet,contentDetails,statistics&id=${ids.join(',')}`, token).catch((e) => { errori.push(e.message); return { items: [] }; });
  const oggi = new Date().toISOString().slice(0, 10);
  // numeri di visione per video (una richiesta per tutti)
  const vis = new Map();
  try {
    const r = await chiedi(`${ANALYTICS()}?ids=channel==MINE&startDate=2020-01-01&endDate=${oggi}&dimensions=video`
      + `&metrics=views,averageViewDuration,averageViewPercentage,likes,comments,shares,subscribersGained&filters=video==${ids.join(',')}&maxResults=${ids.length}`, token);
    const col = (r.columnHeaders || []).map((c) => c.name);
    for (const riga of r.rows || []) vis.set(riga[0], Object.fromEntries(col.map((c, i) => [c, riga[i]])));
  } catch (e) { errori.push(e.message); }

  const video = [];
  for (const v of info.items || []) {
    const a = vis.get(v.id) || {};
    let curva = [];
    // la curva c'è solo se le statistiche si leggono (e per video con abbastanza visualizzazioni)
    if (vis.size) {
      try {
        const r = await chiedi(`${ANALYTICS()}?ids=channel==MINE&startDate=2020-01-01&endDate=${oggi}&dimensions=elapsedVideoTimeRatio`
          + `&metrics=audienceWatchRatio&filters=video==${v.id}`, token);
        curva = curvaDa(r.rows);
      } catch { /* video troppo nuovo o con poche visualizzazioni: niente curva */ }
    }
    const durata = secondiIso(v.contentDetails?.duration);
    video.push({
      p: 'yt', id: v.id, data: v.snippet?.publishedAt || '', titolo: v.snippet?.title || '', link: `https://youtube.com/shorts/${v.id}`,
      views: Number(a.views ?? v.statistics?.viewCount ?? 0), like: Number(a.likes ?? v.statistics?.likeCount ?? 0),
      commenti: Number(a.comments ?? v.statistics?.commentCount ?? 0), condivisioni: Number(a.shares ?? 0),
      ...(a.subscribersGained != null ? { follower: Number(a.subscribersGained) } : {}),
      ...(a.averageViewDuration != null ? { visioneMedia: Number(a.averageViewDuration) } : {}),
      ...(a.averageViewPercentage != null ? { vistoPct: Math.round(Number(a.averageViewPercentage)) } : {}),
      ...(durata ? { durata } : {}), ...(curva.length ? { curva } : {}),
    });
  }
  return { video, errori };
}

// dal workflow: unisce i numeri di YouTube a quelli del bot (file passato come argomento) e riscrive il file
if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2];
  const base = JSON.parse(fs.readFileSync(file, 'utf8'));
  let yt;
  try { yt = await numeriYouTube(); } catch (e) { yt = { video: [], errori: [`YouTube: ${String(e.message).slice(0, 160)}`] }; }
  base.video = [...(base.video || []), ...yt.video];
  base.errori = [...(base.errori || []), ...yt.errori];
  fs.writeFileSync(file, JSON.stringify(base));
  console.log(`youtube: ${yt.video.length} video, ${yt.video.filter((v) => v.curva).length} con la curva, ${yt.errori.length} errori`);
}

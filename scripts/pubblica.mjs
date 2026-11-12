// Pubblicazione dal bot Telegram (tasto 📤 Pubblica → workflow "pubblica"): Instagram come
// reel di prova e YouTube Shorts, poi il video passa in 03 · Da pubblicare e il bot riceve i link.
//
// DATI (JSON dal bot): { nonce, nome, file, fileId, didascalia, titolo, descrizioneYt, copertina, copertinaId, ig, yt, tt, prova, squadra }
// tt: TikTok come BOZZA nella casella dell'app (Upload API, permesso video.upload; chiave dal bot su /tt-token).
//   L'API delle bozze non accetta testo né copertina: li mette Denis nell'app (la Squadra glieli manda pronti).
// descrizioneYt: descrizione per YouTube (se manca si usa la didascalia)
// squadra: avviato dal 📤 Pubblicatore di Den Squadra: l'esito si scrive anche su Drive in
//   02 · Fatti/<nome>/_squadra/pubblicato.json (la Squadra lo legge da lì; il bot Regista lo ignora: nonce non suo)
// copertina: ms del fotogramma di copertina; copertinaId: la copertina fatta dal regista (jpg su Drive), se c'è vince lei
//   prova: 'MANUAL' (passa ai follower quando lo decide Denis dall'app) | 'SS_PERFORMANCE'
//   (Instagram lo passa da solo se va bene con i non follower) | '' (Reel normale)
// Instagram: chiave custodita (e rinnovata) dal bot, chiesta a /ig-token. Il video lo scarica
// Instagram da un link pubblico temporaneo di Drive, tolto alla fine in ogni caso.
// YouTube: YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN (secret GitHub). Con un progetto
// Google non ancora verificato da YouTube i video restano privati (li rende pubblici Denis).

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { DIR_FATTI, DIR_PUBBLICARE } from './cartelle.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const WORK = path.join(ROOT, 'work');
const REMOTE = process.env.RCLONE_REMOTE || 'gdrive';
const OUT_DIR = DIR_FATTI;
const PUB_DIR = DIR_PUBBLICARE;
// chiave del login con Instagram (IGAA…) → graph.instagram.com; chiave di sistema del login unificato
// di Meta (EAA…, app nuove dal 2026) → graph.facebook.com, con l'account per id (IG_USER_ID dal bot)
let IG_FB = false;
const IG = () => `${process.env.IG_BASE || (IG_FB ? 'https://graph.facebook.com' : 'https://graph.instagram.com')}/${process.env.IG_API_VERSION || 'v24.0'}`;
const DRIVE = () => process.env.DRIVE_BASE || 'https://www.googleapis.com';
const YT_UPLOAD = () => process.env.YT_UPLOAD_BASE || 'https://www.googleapis.com';
const OAUTH = () => process.env.OAUTH_URL || 'https://oauth2.googleapis.com/token';

const log = (...a) => console.log('[pubblica]', ...a);
const attesa = (ms) => new Promise((ok) => setTimeout(ok, ms));
const rclone = (...args) => String(execFileSync('rclone', args, { stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 1 << 26 }));
const remote = (...parti) => `${REMOTE}:${parti.join('/')}`;

async function json(r, cosa) {
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = null; }
  if (!r.ok) throw new Error(`${cosa}: ${r.status} ${j?.error?.message || j?.error?.error_user_msg || t.slice(0, 300)}`);
  return j;
}

// accesso a Drive con lo stesso account di rclone: rclone rinnova il token a ogni comando
// e lo riscrive nella configurazione, da cui lo si legge
function tokenDrive() {
  const conf = JSON.parse(rclone('config', 'dump'))[REMOTE];
  return JSON.parse(conf.token).access_token;
}

async function linkPubblico(fileId, attiva) {
  const h = { authorization: `Bearer ${tokenDrive()}`, 'content-type': 'application/json' };
  const base = `${DRIVE()}/drive/v3/files/${fileId}/permissions`;
  if (attiva) await json(await fetch(`${base}?supportsAllDrives=true`, { method: 'POST', headers: h, body: JSON.stringify({ role: 'reader', type: 'anyone' }) }), 'link Drive');
  else {
    // Drive a volte rifiuta per troppe richieste (403 rateLimitExceeded, 11/11): si riprova con attese
    // crescenti, perché il file non deve restare aperto a chiunque abbia il link
    for (let i = 0; i < 6; i++) {
      const r = await fetch(`${base}/anyoneWithLink?supportsAllDrives=true`, { method: 'DELETE', headers: { ...h, authorization: `Bearer ${tokenDrive()}` } });
      if (r.ok || r.status === 404) return;
      log(`link pubblico non tolto (${r.status}), riprovo`, (await r.text()).slice(0, 200));
      await attesa(5000 * 2 ** i);
    }
    throw new Error('link pubblico di Drive non tolto: toglilo a mano dal file');
  }
}

async function chiaveInstagram() {
  if (!process.env.NOTIFY_URL) throw new Error('manca NOTIFY_URL');
  const r = await fetch(process.env.NOTIFY_URL.replace(/\/notify$/, '/ig-token'), { headers: { 'x-regista-token': process.env.NOTIFY_TOKEN || '' } });
  const j = await json(r, 'chiave Instagram dal bot');
  if (!j.token) throw new Error('Instagram non collegato: manca la chiave (IG_TOKEN)');
  return j;
}

// id dell'account Instagram e nome: dalla chiave stessa, o (chiave di Facebook) da IG_USER_ID o dalla pagina collegata
async function accountIg(token, utente) {
  const t = encodeURIComponent(token);
  if (!IG_FB) {
    const me = await json(await fetch(`${IG()}/me?fields=user_id,username&access_token=${t}`), 'account Instagram');
    return { io: me.user_id || me.id, username: me.username };
  }
  // l'id messo a mano, se la chiave lo vede; se no lo si cerca tra le pagine Facebook della chiave
  let io = utente && (await fetch(`${IG()}/${utente}?fields=username&access_token=${t}`)).ok ? utente : null;
  if (!io) {
    const p = await json(await fetch(`${IG()}/me/accounts?fields=instagram_business_account&access_token=${t}`), 'pagine Facebook');
    io = (p.data || []).map((x) => x.instagram_business_account?.id).find(Boolean);
    if (!io) throw new Error(`Instagram: la chiave di Facebook non vede ${utente ? `l'account ${utente}` : 'nessun account Instagram'} (serve un Instagram collegato a una tua pagina Facebook)`);
  }
  const me = await json(await fetch(`${IG()}/${io}?fields=username&access_token=${t}`), 'account Instagram').catch(() => ({}));
  return { io, username: me.username };
}

// link di scaricamento diretto: drive.google.com/uc oltre i ~100 MB risponde con la pagina «impossibile
// cercare virus» e Instagram rifiuta il video (12/11, Anker 105 MB: errore 2207082); con confirm=t no
const linkDrive = (id) => `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`;

async function instagram(d) {
  const chiave = await chiaveInstagram();
  const token = chiave.token;
  IG_FB = /^EA/.test(token);
  const me = await accountIg(token, chiave.utente);
  const io = me.io;
  await linkPubblico(d.fileId, true);
  // la copertina su Drive va resa pubblica come il video, per il tempo della pubblicazione
  const conCopertina = Boolean(d.copertinaId) && await linkPubblico(d.copertinaId, true).then(() => true, (e) => { log(`copertina non usata: ${e.message}`); return false; });
  try {
    const campi = new URLSearchParams({
      media_type: 'REELS', video_url: linkDrive(d.fileId), caption: d.didascalia || '',
      ...(conCopertina ? { cover_url: linkDrive(d.copertinaId) } : { thumb_offset: String(Math.max(0, Math.round(d.copertina || 0))) }),
      access_token: token,
      ...(d.prova ? { trial_params: JSON.stringify({ graduation_strategy: d.prova }) } : { share_to_feed: 'true' }),
    });
    const contenitore = await json(await fetch(`${IG()}/${io}/media`, { method: 'POST', body: campi }), 'caricamento Instagram');
    log(`Instagram: contenitore ${contenitore.id}, elaborazione…`);
    // Instagram scarica ed elabora il video: di solito 30 s – 2 min
    for (let i = 0; ; i++) {
      await attesa(i ? 10000 : 15000);
      const s = await json(await fetch(`${IG()}/${contenitore.id}?fields=status_code,status&access_token=${encodeURIComponent(token)}`), 'stato Instagram');
      if (s.status_code === 'FINISHED') break;
      if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new Error(`Instagram ha rifiutato il video: ${s.status || s.status_code}`);
      if (i > 60) throw new Error('Instagram non ha finito di elaborare il video in 10 minuti');
    }
    const media = await json(await fetch(`${IG()}/${io}/media_publish`, { method: 'POST', body: new URLSearchParams({ creation_id: contenitore.id, access_token: token }) }), 'pubblicazione Instagram');
    const info = await json(await fetch(`${IG()}/${media.id}?fields=permalink&access_token=${encodeURIComponent(token)}`), 'link del Reel').catch(() => ({}));
    log(`Instagram: pubblicato ${media.id}${d.prova ? ` come reel di prova (${d.prova})` : ''}`);
    return { ok: true, link: info.permalink || `https://www.instagram.com/${me.username || ''}`, prova: Boolean(d.prova) };
  } finally {
    await Promise.all([linkPubblico(d.fileId, false), conCopertina ? linkPubblico(d.copertinaId, false) : null].map((p) => Promise.resolve(p).catch((e) => log(e.message))));
  }
}

// YouTube non accetta < e > nel titolo e nella descrizione
const pulisciYt = (t, max) => String(t || '').replace(/[<>]/g, '').trim().slice(0, max);

// durata dell'mp4 dall'atomo mvhd (sul runner non c'è ffprobe): oltre 3 minuti (un discorso) YouTube
// non ne fa uno Short, quindi niente #shorts e link al video normale
export function durataMp4(b) {
  const cerca = (da, a, tipo) => {
    for (let i = da; i + 8 <= a;) {
      let dim = b.readUInt32BE(i), testa = 8;
      if (dim === 1) { dim = Number(b.readBigUInt64BE(i + 8)); testa = 16; } else if (dim === 0) dim = a - i;
      if (dim < testa) return null;
      if (b.toString('latin1', i + 4, i + 8) === tipo) return { da: i + testa, a: Math.min(a, i + dim) };
      i += dim;
    }
    return null;
  };
  try {
    const moov = cerca(0, b.length, 'moov');
    const mvhd = moov && cerca(moov.da, moov.a, 'mvhd');
    if (!mvhd) return 0;
    const v1 = b[mvhd.da] === 1;
    const scala = b.readUInt32BE(mvhd.da + (v1 ? 20 : 12));
    const durata = v1 ? Number(b.readBigUInt64BE(mvhd.da + 24)) : b.readUInt32BE(mvhd.da + 16);
    return scala ? durata / scala : 0;
  } catch { return 0; }
}

async function youtube(d, video) {
  const { YT_CLIENT_ID: id, YT_CLIENT_SECRET: segreto, YT_REFRESH_TOKEN: rinnovo } = process.env;
  if (!id || !segreto || !rinnovo) return { ok: false, saltato: true, errore: 'YouTube non ancora collegato' };
  const t = await json(await fetch(OAUTH(), { method: 'POST', body: new URLSearchParams({ client_id: id, client_secret: segreto, refresh_token: rinnovo, grant_type: 'refresh_token' }) }), 'accesso YouTube');
  const dati = fs.readFileSync(video);
  const durata = durataMp4(dati);
  const short = !durata || durata <= 180;
  if (!short) log(`YouTube: ${Math.round(durata)} s, oltre i 3 minuti degli Shorts: video normale`);
  const base = d.descrizioneYt || d.didascalia || '';
  const descrizione = !short || /#shorts/i.test(base) ? base : `${base}\n\n#shorts`;
  const avvio = await fetch(`${YT_UPLOAD()}/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status`, {
    method: 'POST',
    headers: { authorization: `Bearer ${t.access_token}`, 'content-type': 'application/json; charset=UTF-8', 'x-upload-content-length': String(dati.length), 'x-upload-content-type': 'video/mp4' },
    body: JSON.stringify({
      snippet: { title: pulisciYt(d.titolo || d.nome, 100), description: pulisciYt(descrizione, 4900), categoryId: '22', defaultLanguage: 'it', defaultAudioLanguage: 'it' },
      status: { privacyStatus: 'public', selfDeclaredMadeForKids: false },
    }),
  });
  if (!avvio.ok) await json(avvio, 'avvio caricamento YouTube');
  const dove = avvio.headers.get('location');
  if (!dove) throw new Error('YouTube non ha dato l\'indirizzo di caricamento');
  const v = await json(await fetch(dove, { method: 'PUT', headers: { 'content-type': 'video/mp4' }, body: dati }), 'caricamento YouTube');
  log(`YouTube: caricato ${v.id} (${v.status?.privacyStatus})`);
  return { ok: true, link: short ? `https://youtube.com/shorts/${v.id}` : `https://youtu.be/${v.id}`, privato: v.status?.privacyStatus !== 'public' };
}

// ---------- TikTok: bozza nella casella dell'app, file originale (nessuna ricompressione) ----------
const TT = () => process.env.TT_BASE || 'https://open.tiktokapis.com';
// pezzi da 10 MB (TikTok: 5–64 MB, l'ultimo prende il resto fino a 128 MB); sotto i 64 MB un pezzo solo
export function pezziTikTok(dim) {
  if (dim <= 64 * 1024 * 1024) return { chunk: dim, totale: 1 };
  const chunk = 10 * 1024 * 1024;
  return { chunk, totale: Math.floor(dim / chunk) };
}
export async function tiktok(d, video) {
  if (!process.env.NOTIFY_URL) throw new Error('manca NOTIFY_URL');
  const c = await json(await fetch(process.env.NOTIFY_URL.replace(/\/notify$/, '/tt-token'), { headers: { 'x-regista-token': process.env.NOTIFY_TOKEN || '' } }), 'chiave TikTok dal bot');
  if (!c.token) return { ok: false, saltato: true, errore: c.motivo || 'TikTok non collegato' };
  const h = { authorization: `Bearer ${c.token}`, 'content-type': 'application/json; charset=UTF-8' };
  const dati = fs.readFileSync(video);
  const { chunk, totale } = pezziTikTok(dati.length);
  const init = await json(await fetch(`${TT()}/v2/post/publish/inbox/video/init/`, {
    method: 'POST', headers: h,
    body: JSON.stringify({ source_info: { source: 'FILE_UPLOAD', video_size: dati.length, chunk_size: chunk, total_chunk_count: totale } }),
  }), 'avvio caricamento TikTok');
  if (init.error?.code && init.error.code !== 'ok') throw new Error(`TikTok: ${init.error.message || init.error.code}`);
  const { publish_id: id, upload_url: dove } = init.data || {};
  if (!id || !dove) throw new Error('TikTok non ha dato l\'indirizzo di caricamento');
  for (let i = 0; i < totale; i++) {
    const da = i * chunk, a = i === totale - 1 ? dati.length : da + chunk;
    // TikTok a volte risponde 500 su un pezzo (12/11): si riprova lo stesso pezzo fino a 3 volte
    let r;
    for (const pausa of [0, 5000, 15000]) {
      if (pausa) { log(`TikTok: pezzo ${i + 1} rifiutato (${r.status}), riprovo tra ${pausa / 1000} s`); await attesa(pausa); }
      r = await fetch(dove, { method: 'PUT', headers: { 'content-type': 'video/mp4', 'content-length': String(a - da), 'content-range': `bytes ${da}-${a - 1}/${dati.length}` }, body: dati.subarray(da, a) });
      if (r.ok || r.status < 500) break;
    }
    if (!r.ok) throw new Error(`caricamento TikTok, pezzo ${i + 1}/${totale}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  }
  log(`TikTok: caricato (${(dati.length / 1e6).toFixed(0)} MB, ${totale} pezzi), attendo la bozza…`);
  for (let i = 0; i < 40; i++) {
    await attesa(i ? 10000 : 5000);
    const s = await json(await fetch(`${TT()}/v2/post/publish/status/fetch/`, { method: 'POST', headers: h, body: JSON.stringify({ publish_id: id }) }), 'stato TikTok');
    const st = s.data?.status;
    if (st === 'SEND_TO_USER_INBOX' || st === 'PUBLISH_COMPLETE') { log(`TikTok: bozza pronta (${st})`); return { ok: true, bozza: true }; }
    if (st === 'FAILED') throw new Error(`TikTok ha rifiutato il video: ${s.data?.fail_reason || 'motivo non indicato'}`);
  }
  throw new Error('TikTok non ha finito di elaborare il video in 7 minuti');
}

async function avvisaBot(esito) {
  fs.mkdirSync(WORK, { recursive: true });
  fs.writeFileSync(path.join(WORK, 'pubblicato.json'), JSON.stringify(esito));
  if (!process.env.NOTIFY_URL) return;
  const r = await fetch(process.env.NOTIFY_URL, { method: 'POST', headers: { 'content-type': 'application/json', 'x-regista-token': process.env.NOTIFY_TOKEN || '' }, body: JSON.stringify(esito) });
  log(`bot: ${r.status}`);
}

async function main() {
  const d = JSON.parse(process.env.DATI || '{}');
  const esito = { tipo: 'pubblicato', nonce: d.nonce, nome: d.nome, run_url: process.env.RUN_URL || '' };
  const errore = (e) => ({ ok: false, errore: String(e.message || e).slice(0, 300) });
  try {
    if (!d.fileId || !d.file || !d.nome) throw new Error('dati incompleti dal bot');
    // percorso: il video è già altrove (es. 03 · Da pubblicare, quando si ritenta una piattaforma)
    const sorgente = d.percorso ? `${REMOTE}:${d.percorso}` : remote(OUT_DIR, d.nome, d.file);
    rclone('lsjson', sorgente); // il video c'è ancora? (e rinnova l'accesso a Drive)
    if (d.ig) {
      try { esito.instagram = await instagram(d); } catch (e) { log('Instagram:', e.message); esito.instagram = errore(e); }
    }
    // il file originale serve a YouTube e a TikTok: si scarica una volta sola
    let video = null;
    const scarica = () => {
      if (!video) { fs.mkdirSync(WORK, { recursive: true }); video = path.join(WORK, 'pubblica.mp4'); rclone('copyto', sorgente, video); }
      return video;
    };
    if (d.yt) {
      try { esito.youtube = await youtube(d, process.env.YT_REFRESH_TOKEN ? scarica() : null); } catch (e) { log('YouTube:', e.message); esito.youtube = errore(e); }
    }
    if (d.tt) {
      try { esito.tiktok = await tiktok(d, scarica()); } catch (e) { log('TikTok:', e.message); esito.tiktok = errore(e); }
    }
    // il video passa in 03 · Da pubblicare solo quando TUTTE le piattaforme chieste sono andate (o saltate):
    // se una fallisce resta in 02, così si può ritentare (12/11: Anker, Instagram e TikTok falliti)
    const chieste = [d.ig && esito.instagram, d.yt && esito.youtube, d.tt && esito.tiktok].filter(Boolean);
    const giaIn03 = String(d.percorso || '').startsWith(`${PUB_DIR}/`);
    if (!giaIn03 && chieste.some((x) => x.ok) && chieste.every((x) => x.ok || x.saltato)) {
      try { rclone('moveto', sorgente, remote(PUB_DIR, d.file)); esito.spostato = true; } catch (e) { log('video non spostato in 99', e.message); }
    }
  } catch (e) {
    esito.errore = String(e.message || e).slice(0, 300);
  }
  if (d.squadra) {
    try { execFileSync('rclone', ['rcat', remote(OUT_DIR, d.nome, '_squadra', 'pubblicato.json')], { input: JSON.stringify({ ...esito, quando: new Date().toISOString() }) }); } catch (e) { log('esito per la Squadra non scritto', e.message); }
  }
  await avvisaBot(esito);
  if (esito.errore || [esito.instagram, esito.youtube, esito.tiktok].some((x) => x && !x.ok && !x.saltato)) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(ROOT, 'scripts', 'pubblica.mjs')) main();
export { main };

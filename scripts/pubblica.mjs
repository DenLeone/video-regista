// Pubblicazione dal bot Telegram (tasto 📤 Pubblica → workflow "pubblica"): Instagram come
// reel di prova e YouTube Shorts, poi il video passa in 03 · Da pubblicare e il bot riceve i link.
//
// DATI (JSON dal bot): { nonce, nome, file, fileId, didascalia, titolo, copertina, ig, yt, prova }
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
const IG = () => `${process.env.IG_BASE || 'https://graph.instagram.com'}/${process.env.IG_API_VERSION || 'v24.0'}`;
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
    const r = await fetch(`${base}/anyoneWithLink?supportsAllDrives=true`, { method: 'DELETE', headers: h });
    if (!r.ok && r.status !== 404) log('link pubblico non tolto', r.status, await r.text());
  }
}

async function chiaveInstagram() {
  if (!process.env.NOTIFY_URL) throw new Error('manca NOTIFY_URL');
  const r = await fetch(process.env.NOTIFY_URL.replace(/\/notify$/, '/ig-token'), { headers: { 'x-regista-token': process.env.NOTIFY_TOKEN || '' } });
  const j = await json(r, 'chiave Instagram dal bot');
  if (!j.token) throw new Error('Instagram non collegato: manca la chiave (IG_TOKEN)');
  return j.token;
}

async function instagram(d) {
  const token = await chiaveInstagram();
  const me = await json(await fetch(`${IG()}/me?fields=user_id,username&access_token=${encodeURIComponent(token)}`), 'account Instagram');
  const io = me.user_id || me.id;
  await linkPubblico(d.fileId, true);
  try {
    const campi = new URLSearchParams({
      media_type: 'REELS', video_url: `https://drive.google.com/uc?id=${d.fileId}&export=download`, caption: d.didascalia || '',
      thumb_offset: String(Math.max(0, Math.round(d.copertina || 0))), access_token: token,
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
    await linkPubblico(d.fileId, false);
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
  const descrizione = !short || /#shorts/i.test(d.didascalia || '') ? d.didascalia || '' : `${d.didascalia || ''}\n\n#shorts`;
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
    const sorgente = remote(OUT_DIR, d.nome, d.file);
    rclone('lsjson', sorgente); // il video c'è ancora? (e rinnova l'accesso a Drive)
    if (d.ig) {
      try { esito.instagram = await instagram(d); } catch (e) { log('Instagram:', e.message); esito.instagram = errore(e); }
    }
    if (d.yt) {
      try {
        let video = null;
        if (process.env.YT_REFRESH_TOKEN) {
          fs.mkdirSync(WORK, { recursive: true });
          video = path.join(WORK, 'pubblica.mp4');
          rclone('copyto', sorgente, video);
        }
        esito.youtube = await youtube(d, video);
      } catch (e) { log('YouTube:', e.message); esito.youtube = errore(e); }
    }
    // pubblicato almeno da una parte: il video passa in 03 · Da pubblicare
    if (esito.instagram?.ok || esito.youtube?.ok) {
      try { rclone('moveto', sorgente, remote(PUB_DIR, d.file)); esito.spostato = true; } catch (e) { log('video non spostato in 99', e.message); }
    }
  } catch (e) {
    esito.errore = String(e.message || e).slice(0, 300);
  }
  await avvisaBot(esito);
  if (esito.errore || [esito.instagram, esito.youtube].some((x) => x && !x.ok && !x.saltato)) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(ROOT, 'scripts', 'pubblica.mjs')) main();
export { main };

// Route dell'app. Lo stato dei montaggi è quello del bot: stessa memoria, stessi workflow.
import { sha256Hex, timingSafeEqual, b64urlToBytes, bytesToB64url } from './b64';
import type { BriefApp, Imp, MemoApp, Ops, Segreti } from './ops';
import { credenzialiOk, completaMultipart, creaMultipart, impostaCors, scriviOggetto, urlPezzo, annullaMultipart, type CredenzialiR2 } from './s3';
import {
  PARTE, PARALLELO, MAX_FILE, byteFatti, dimensioneParte, etagValido, limiteFile, nomeSicuro,
  numeroParti, partiMancanti, registraEtag, type ModalitaUpload, type ParteFatta,
} from './upload-stato';
import { verificaAccesso, verificaRegistrazione, type Passkey } from './webauthn';
import { pushAttivo } from './push';
import { gestisciStile } from './stile-api';

const COOKIE = '__Host-regista';
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const FASI = ['scarico', 'prepara', 'regia', 'render', 'carico'] as const;
const NOME_FASE: Record<string, string> = { scarico: 'Download', prepara: 'Analisi', regia: 'Regia', render: 'Render', carico: 'Upload' };

type FileUp = {
  nome: string; size: number; tipo: string; key: string; uploadId: string;
  parte: number; parti: ParteFatta[]; completo?: boolean;
};
type SessioneUpload = {
  id: string; nome: string; modalita: ModalitaUpload; parziale: boolean; archivio?: boolean;
  riferimento?: boolean;
  quando: number; file: FileUp[]; pronto?: boolean; avviato?: boolean;
};

function json(body: unknown, status = 200, headers?: HeadersInit): Response {
  const h = new Headers(headers);
  h.set('content-type', 'application/json; charset=utf-8');
  h.set('cache-control', 'no-store');
  h.set('x-content-type-options', 'nosniff');
  return new Response(JSON.stringify(body), { status, headers: h });
}
const errore = (status: number, messaggio: string) => json({ errore: messaggio }, status);

function cookieSessione(token: string, maxAge: number) {
  return `${COOKIE}=${token}; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=${maxAge}`;
}
function tokenDalRichiesta(req: Request): string | undefined {
  const pezzo = (req.headers.get('cookie') || '').split(';').map((s) => s.trim()).find((s) => s.startsWith(`${COOKIE}=`));
  const token = pezzo?.slice(COOKIE.length + 1);
  return token && /^[A-Za-z0-9_-]{20,}$/.test(token) ? token : undefined;
}

async function sessioneAttiva(req: Request, env: Segreti, ops: Ops): Promise<boolean> {
  const token = tokenDalRichiesta(req);
  if (!token) return false;
  const s = await ops.leggi<{ exp: number }>(env, `app:sess:${token}`);
  if (!s || s.exp < Date.now()) return false;
  if (s.exp - Date.now() < 7 * 864e5) await ops.scrivi(env, `app:sess:${token}`, { ...s, exp: Date.now() + 30 * 864e5 });
  return true;
}

function cred(env: Segreti): CredenzialiR2 | null {
  const c = {
    accountId: env.R2_ACCOUNT_ID || '', accessKeyId: env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: env.R2_SECRET_ACCESS_KEY || '', bucket: env.R2_BUCKET || '',
  };
  return credenzialiOk(c) ? c : null;
}

function generaCodice(): string {
  const b = crypto.getRandomValues(new Uint8Array(8));
  const c = [...b].map((x) => ALFABETO[x % ALFABETO.length]).join('');
  return `${c.slice(0, 4)}-${c.slice(4)}`;
}

async function autorizzaRegistrazione(env: Segreti, ops: Ops, codice: string): Promise<boolean> {
  const bloccato = Boolean(await ops.leggi(env, 'app:bloccato'));
  const setup = (env.APP_SETUP_CODE || '').trim();
  if (setup && timingSafeEqual(codice.trim(), setup)) return true;
  const finestra = await ops.leggi<{ exp: number }>(env, 'app:sblocco');
  if (bloccato && !(finestra && finestra.exp > Date.now())) return false;
  const salvato = await ops.leggi<{ hash: string; exp: number }>(env, 'app:codice');
  if (!salvato || salvato.exp < Date.now()) return false;
  const hash = await sha256Hex(codice.replace(/-/g, '').trim().toUpperCase());
  if (!timingSafeEqual(hash, salvato.hash)) return false;
  await ops.cancella(env, 'app:codice');
  if (bloccato) await ops.cancella(env, 'app:sblocco');
  return true;
}

async function nuovaSfida(env: Segreti, ops: Ops, tipo: 'crea' | 'entra'): Promise<{ id: string; challenge: string }> {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const challenge = bytesToB64url(raw);
  const id = bytesToB64url(crypto.getRandomValues(new Uint8Array(16)));
  await ops.scrivi(env, `app:sfida:${id}`, { challenge, tipo, exp: Date.now() + 5 * 60_000 });
  return { id, challenge };
}

async function prendiSfida(env: Segreti, ops: Ops, id: string, tipo: 'crea' | 'entra'): Promise<string | null> {
  const s = await ops.leggi<{ challenge: string; tipo: string; exp: number }>(env, `app:sfida:${id}`);
  await ops.cancella(env, `app:sfida:${id}`);
  if (!s || s.tipo !== tipo || s.exp < Date.now()) return null;
  return s.challenge;
}

function opzioniPubbliche(req: Request, challenge: string, passkeys: Passkey[], crea: boolean) {
  const host = new URL(req.url).hostname;
  const base = {
    challenge, timeout: 60_000, rpId: host,
    userVerification: 'required',
  };
  if (!crea) return { publicKey: { ...base, allowCredentials: passkeys.map((p) => ({ type: 'public-key', id: p.id })) } };
  return {
    publicKey: {
      ...base,
      rp: { name: 'Regista', id: host },
      user: { id: bytesToB64url(new TextEncoder().encode('denis')), name: 'denis', displayName: 'Denis' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      attestation: 'none',
      authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'required', userVerification: 'required' },
      excludeCredentials: passkeys.map((p) => ({ type: 'public-key', id: p.id })),
    },
  };
}

async function passkeys(env: Segreti, ops: Ops): Promise<Passkey[]> {
  return (await ops.leggi<Passkey[]>(env, 'app:passkeys')) || [];
}

function daBase64(corpo: { clientDataJSON?: string; attestationObject?: string; authenticatorData?: string; signature?: string }) {
  return {
    clientDataJSON: b64urlToBytes(corpo.clientDataJSON || ''),
    attestationObject: b64urlToBytes(corpo.attestationObject || ''),
    authenticatorData: b64urlToBytes(corpo.authenticatorData || ''),
    signature: b64urlToBytes(corpo.signature || ''),
  };
}

async function apriSessione(env: Segreti, ops: Ops, passkeyId: string): Promise<string> {
  const token = bytesToB64url(crypto.getRandomValues(new Uint8Array(32)));
  await ops.scrivi(env, `app:sess:${token}`, { exp: Date.now() + 30 * 864e5, passkeyId });
  return token;
}

function riassuntoUpload(s: SessioneUpload) {
  const file = s.file.map((f) => ({
    nome: f.nome, size: f.size, parte: f.parte, totale: numeroParti(f.size, f.parte),
    fatte: f.parti.length, fatteNumeri: f.parti.map((p) => p.n), byte: byteFatti(f.size, f.parte, f.parti), completo: Boolean(f.completo),
  }));
  const totale = file.reduce((t, f) => t + f.size, 0);
  const fatti = file.reduce((t, f) => t + f.byte, 0);
  return { id: s.id, nome: s.nome, modalita: s.modalita, parziale: s.parziale, archivio: Boolean(s.archivio), pronto: Boolean(s.pronto), avviato: Boolean(s.avviato), quando: s.quando, totale, fatti, file };
}

async function inCorso(env: Segreti, ops: Ops) {
  const g = await ops.giri(env);
  const pendenti = (await ops.pendenti(env)).filter((p) => Date.now() - p.quando < 40 * 60_000);
  if (typeof g === 'string') return { errore: g, attivi: [] as unknown[], pendenti, ultimi: [] as unknown[] };
  const attivi = [];
  for (const w of g.filter((x) => x.status !== 'completed')) {
    const c = await ops.card(env, String(w.id));
    attivi.push({
      runId: String(w.id), nome: c?.nome || 'Montaggio', fase: c?.corrente || null, faseNome: NOME_FASE[c?.corrente || ''] || 'Preparazione',
      fasi: FASI.map((id) => ({ id, nome: NOME_FASE[id], dettaglio: c?.fasi?.[id] || '', fatta: c?.fine === 'ok' || (c?.corrente ? FASI.indexOf(c.corrente as typeof FASI[number]) > FASI.indexOf(id) : false) })),
      minuti: c?.minuti ?? 0, inCoda: c?.inCoda ?? !c, prova: c?.prova, soloRender: c?.soloRender, runUrl: w.html_url,
    });
  }
  const ultimi = [];
  for (const w of g.filter((x) => x.status === 'completed').slice(0, 8)) {
    const m = await ops.memo(env, String(w.id));
    ultimi.push({ runId: String(w.id), nome: m?.nome || '—', ok: w.conclusion === 'success', quando: w.created_at, runUrl: w.html_url });
  }
  return { attivi, pendenti, ultimi };
}

function idDalLink(link?: string) {
  return link?.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1];
}

async function idConsentiti(env: Segreti, ops: Ops): Promise<Set<string>> {
  const ids = new Set<string>();
  for (const v of await ops.video(env)) {
    const id = idDalLink(v.link);
    if (id) ids.add(id);
    const m = await ops.memo(env, v.runId);
    if (m?.pubblica?.fileId) ids.add(m.pubblica.fileId);
    if (m?.pubblica?.copertinaId) ids.add(m.pubblica.copertinaId);
  }
  return ids;
}

async function tokenDrive(env: Segreti, ops: Ops): Promise<string | null> {
  if (!env.DRIVE_CLIENT_ID || !env.DRIVE_CLIENT_SECRET || !env.DRIVE_REFRESH_TOKEN) return null;
  const cache = await ops.leggi<{ token: string; exp: number }>(env, 'app:drive_token');
  if (cache && cache.exp > Date.now() + 30_000) return cache.token;
  const body = new URLSearchParams({
    client_id: env.DRIVE_CLIENT_ID, client_secret: env.DRIVE_CLIENT_SECRET,
    refresh_token: env.DRIVE_REFRESH_TOKEN, grant_type: 'refresh_token',
  });
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
  if (!r.ok) return null;
  const j = await r.json() as { access_token?: string; expires_in?: number };
  if (!j.access_token) return null;
  await ops.scrivi(env, 'app:drive_token', { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 });
  return j.access_token;
}

async function azioneVideo(env: Segreti, ops: Ops, runId: string, body: Record<string, unknown>): Promise<Response> {
  const memo = await ops.memo(env, runId);
  if (!memo) return errore(404, 'Non trovo più questo montaggio.');
  const azione = String(body.azione || '');
  const testo = String(body.testo || '').trim();
  if (azione === 'approva') {
    await ops.scriviMemo(env, runId, { ...memo, approvato: true });
    return json({ ok: true, approvato: true });
  }
  if (azione === 'didascalia' || azione === 'titolo') {
    if (!memo.pubblica) return errore(400, 'Questo video non ha ancora didascalia e titolo. Rifallo con Solo render.');
    const pubblica = azione === 'titolo'
      ? { ...memo.pubblica, youtube: { ...(memo.pubblica.youtube || {}), titolo: testo.replace(/\s+/g, ' ').slice(0, 100) } }
      : { ...memo.pubblica, didascalia: testo.slice(0, 2200) };
    await ops.scriviMemo(env, runId, { ...memo, pubblica });
    return json({ ok: true, pubblica });
  }
  if (azione === 'ig' || azione === 'yt') {
    if (!memo.pubblica) return errore(400, 'Non ho i dati per pubblicare.');
    const pubblica = { ...memo.pubblica, [azione]: memo.pubblica[azione] === false };
    await ops.scriviMemo(env, runId, { ...memo, pubblica });
    return json({ ok: true, pubblica });
  }
  if (azione === 'pubblica') {
    const err = await ops.confermaPubblicazione(env, runId);
    return err ? errore(502, err) : json({ ok: true, stato: 'in corso' });
  }
  if (azione === 'prova' || azione === 'intero') {
    const stile = ops.nomeStile(String(body.stile || ''));
    if (!stile) return errore(400, 'Stile non trovato.');
    const err = await ops.lancia(env, {
      cartella: memo.nome, origine: '98', brief: ops.conAltroStile(memo.brief, stile), azione: 'render',
      secondi: azione === 'prova' ? ops.PROVA_S : undefined,
    });
    return err ? errore(502, err) : json({ ok: true });
  }
  if (azione === 'correggi') {
    if (!testo) return errore(400, 'Scrivi cosa cambiare.');
    const err = await ops.lancia(env, { cartella: memo.nome, origine: '98', correzione: testo.slice(0, 2000), brief: memo.brief });
    return err ? errore(502, err) : json({ ok: true });
  }
  if (azione === 'render') {
    const err = await ops.lancia(env, { cartella: memo.nome, origine: '98', brief: memo.brief, azione: 'render' });
    return err ? errore(502, err) : json({ ok: true });
  }
  if (azione === 'rifai') {
    const err = await ops.lancia(env, { cartella: memo.nome, origine: '98', brief: memo.brief });
    return err ? errore(502, err) : json({ ok: true });
  }
  if (azione === 'riprova') {
    const err = await ops.lancia(env, {
      cartella: memo.nome, origine: memo.origine || (memo.correzione || memo.azione ? '98' : '97'),
      correzione: memo.correzione, brief: memo.brief, azione: memo.azione, secondi: memo.secondi,
    });
    return err ? errore(502, err) : json({ ok: true });
  }
  return errore(400, 'Azione sconosciuta.');
}

async function uploadPerId(env: Segreti, ops: Ops, id: string): Promise<SessioneUpload | undefined> {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(id)) return undefined;
  return ops.leggi<SessioneUpload>(env, `app:upload:${id}`);
}

export async function gestisciApp(req: Request, env: Segreti, ops: Ops): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  if (!path.startsWith('/api/')) return new Response('no', { status: 404 });
  await ops.prepara(env).catch(() => undefined);

  if (req.method === 'GET' && path === '/api/auth/stato') {
    const pk = await passkeys(env, ops);
    return json({
      passkey: pk.length > 0, bloccato: Boolean(await ops.leggi(env, 'app:bloccato')),
      sessione: await sessioneAttiva(req, env, ops), setup: Boolean(env.APP_SETUP_CODE),
    });
  }

  if (req.method === 'POST' && path === '/api/auth/codice') {
    const chat = ops.chat(env);
    if (!chat) return errore(503, 'Manca ALLOWED_CHAT_ID: non so a chi mandare il codice.');
    if (await ops.leggi(env, 'app:bloccato')) {
      return errore(403, 'Questo iPhone è già autorizzato. Per un altro dispositivo inserisci il codice segreto, oppure autorizzalo da Impostazioni sull’iPhone già attivo.');
    }
    const quando = (await ops.leggi<number[]>(env, 'app:codice_quando')) || [];
    const ora = Date.now();
    const recenti = quando.filter((t) => ora - t < 3600_000);
    if (recenti.some((t) => ora - t < 60_000)) return errore(429, 'Ti ho già mandato un codice. Aspetta un minuto.');
    if (recenti.length >= 5) return errore(429, 'Troppi codici in un’ora. Riprova più tardi.');
    const codice = generaCodice();
    await ops.scrivi(env, 'app:codice', { hash: await sha256Hex(codice.replace(/-/g, '').toUpperCase()), exp: ora + 10 * 60_000 });
    await ops.scrivi(env, 'app:codice_quando', [...recenti, ora]);
    try {
      await ops.inviaTelegram(env, `🔐 <b>Codice per l'app Regista</b>\n<code>${codice}</code>\nVale 10 minuti e si usa una volta sola. Se non l'hai chiesto tu, ignoralo.`);
    } catch {
      return errore(502, 'Non sono riuscito a scrivere su Telegram.');
    }
    return json({ inviato: true });
  }

  if (req.method === 'POST' && path === '/api/auth/registrazione/opzioni') {
    const body = await req.json().catch(() => ({})) as { codice?: string };
    if (!(await autorizzaRegistrazione(env, ops, String(body.codice || '')))) {
      return errore(401, 'Codice non valido o scaduto. Se l’app è già configurata, serve il codice segreto oppure un’autorizzazione dall’iPhone già attivo.');
    }
    const sfida = await nuovaSfida(env, ops, 'crea');
    return json({ sfida: sfida.id, ...opzioniPubbliche(req, sfida.challenge, await passkeys(env, ops), true) });
  }

  if (req.method === 'POST' && path === '/api/auth/registrazione/verifica') {
    const body = await req.json().catch(() => ({})) as { sfida?: string; id?: string; response?: { clientDataJSON?: string; attestationObject?: string } };
    const challenge = await prendiSfida(env, ops, String(body.sfida || ''), 'crea');
    if (!challenge) return errore(401, 'La richiesta è scaduta. Ripeti da capo.');
    try {
      const bin = daBase64(body.response || {});
      const pk = await verificaRegistrazione({
        clientDataJSON: bin.clientDataJSON, attestationObject: bin.attestationObject,
        challenge, origin: url.origin, rpId: url.hostname,
      });
      if (body.id && body.id !== pk.id) return errore(400, 'Credenziale non coerente.');
      const tutte = await passkeys(env, ops);
      if (tutte.length >= 3) return errore(403, 'Ci sono già 3 iPhone autorizzati. Togliene uno da Impostazioni prima di aggiungerne un altro.');
      await ops.scrivi(env, 'app:passkeys', [...tutte.filter((p) => p.id !== pk.id), pk]);
      await ops.scrivi(env, 'app:bloccato', true);
      const token = await apriSessione(env, ops, pk.id);
      return json({ ok: true }, 200, { 'set-cookie': cookieSessione(token, 30 * 86400) });
    } catch (e) {
      return errore(401, `Passkey rifiutata: ${(e as Error).message}`);
    }
  }

  if (req.method === 'POST' && path === '/api/auth/accesso/opzioni') {
    const tutte = await passkeys(env, ops);
    if (!tutte.length) return errore(404, 'Nessun iPhone registrato. Prima configura l’accesso.');
    const sfida = await nuovaSfida(env, ops, 'entra');
    return json({ sfida: sfida.id, ...opzioniPubbliche(req, sfida.challenge, tutte, false) });
  }

  if (req.method === 'POST' && path === '/api/auth/accesso/verifica') {
    const body = await req.json().catch(() => ({})) as { sfida?: string; id?: string; response?: { clientDataJSON?: string; authenticatorData?: string; signature?: string } };
    const challenge = await prendiSfida(env, ops, String(body.sfida || ''), 'entra');
    if (!challenge) return errore(401, 'La richiesta è scaduta. Riprova.');
    const pk = (await passkeys(env, ops)).find((p) => p.id === body.id);
    if (!pk) return errore(401, 'Questa passkey non è di Denis.');
    try {
      const bin = daBase64(body.response || {});
      const count = await verificaAccesso({
        clientDataJSON: bin.clientDataJSON, authenticatorData: bin.authenticatorData, signature: bin.signature,
        challenge, origin: url.origin, rpId: url.hostname, passkey: pk,
      });
      pk.signCount = count;
      await ops.scrivi(env, 'app:passkeys', (await passkeys(env, ops)).map((p) => (p.id === pk.id ? pk : p)));
      const token = await apriSessione(env, ops, pk.id);
      return json({ ok: true }, 200, { 'set-cookie': cookieSessione(token, 30 * 86400) });
    } catch (e) {
      return errore(401, `Accesso rifiutato: ${(e as Error).message}`);
    }
  }

  if (!(await sessioneAttiva(req, env, ops))) return errore(401, 'Sessione assente o scaduta.');

  if (req.method === 'POST' && path === '/api/auth/esci') {
    const token = tokenDalRichiesta(req);
    if (token) await ops.cancella(env, `app:sess:${token}`);
    return json({ ok: true }, 200, { 'set-cookie': cookieSessione('', 0) });
  }

  if (req.method === 'POST' && path === '/api/auth/sblocco') {
    const codice = generaCodice();
    await ops.scrivi(env, 'app:codice', { hash: await sha256Hex(codice.replace(/-/g, '').toUpperCase()), exp: Date.now() + 10 * 60_000 });
    await ops.scrivi(env, 'app:sblocco', { exp: Date.now() + 10 * 60_000 });
    try {
      await ops.inviaTelegram(env, `🔐 <b>Codice per un altro iPhone</b>\n<code>${codice}</code>\nVale 10 minuti. Inseriscilo sul telefono nuovo, nella schermata di accesso.`);
    } catch {
      return errore(502, 'Non sono riuscito a scrivere su Telegram.');
    }
    return json({ inviato: true });
  }

  if (req.method === 'GET' && path === '/api/home') {
    const imp = await ops.impostazioni(env);
    const stato = await inCorso(env, ops);
    const video = await ops.video(env);
    const avvisi = ((await ops.leggi<{ letto?: boolean }[]>(env, 'app:avvisi')) || []).filter((a) => !a.letto).length;
    const aperto = await ops.leggi<string>(env, 'app:upload_aperto');
    const upload = aperto ? await uploadPerId(env, ops, aperto) : undefined;
    return json({
      impostazioni: imp, stato, video: video.slice(0, 4), avvisi,
      upload: upload && !upload.avviato ? riassuntoUpload(upload) : null,
      push: pushAttivo(env), playback: Boolean(env.DRIVE_CLIENT_ID && env.DRIVE_REFRESH_TOKEN),
      r2: Boolean(cred(env)),
    });
  }

  if (req.method === 'GET' && path === '/api/cartelle') {
    return json({ cartelle: await ops.cartelle(env), stili: ops.stili() });
  }
  if (req.method === 'POST' && path === '/api/cartelle/aggiorna') {
    const chiesto = await ops.richiediElenco(env, true);
    return json({ chiesto, cartelle: await ops.cartelle(env) });
  }
  if (req.method === 'GET' && path === '/api/stili') return json({ stili: ops.stili(), predefinito: (await ops.impostazioni(env)).stile });

  if (req.method === 'POST' && path === '/api/impostazioni') {
    const body = await req.json().catch(() => ({})) as Partial<Imp>;
    const imp = await ops.impostazioni(env);
    const prossimo: Imp = { ...imp };
    if (body.stile) prossimo.stile = ops.nomeStile(body.stile) || imp.stile;
    if (body.ai === 'gemini' || body.ai === 'claude') prossimo.ai = body.ai;
    if (body.gemini === 'flash' || body.gemini === 'pro') prossimo.gemini = body.gemini;
    if (body.modello === 'haiku' || body.modello === 'sonnet' || body.modello === 'opus') prossimo.modello = body.modello;
    if (body.versione === 'stabile' || body.versione === 'beta') prossimo.versione = body.versione;
    if (body.prova === 'manuale' || body.prova === 'auto' || body.prova === 'no') prossimo.prova = body.prova;
    await ops.salvaImpostazioni(env, prossimo);
    return json({ impostazioni: prossimo });
  }

  if (req.method === 'POST' && path === '/api/montaggi') {
    const body = await req.json().catch(() => ({})) as BriefApp & { r2?: string };
    const imp = await ops.impostazioni(env);
    const brief = ops.componiBrief(body, imp.stile);
    if (body.r2) {
      const sess = await uploadPerId(env, ops, body.r2);
      if (!sess?.pronto) return errore(400, 'Prima finisci il caricamento.');
      const err = sess.archivio
        ? await ops.archivia(env, sess.nome, sess.id)
        : await ops.lancia(env, { cartella: sess.nome, brief, r2: sess.id });
      if (!err) { sess.avviato = true; await ops.scrivi(env, `app:upload:${sess.id}`, sess); await ops.cancella(env, 'app:upload_aperto'); }
      return err ? errore(502, err) : json({ ok: true });
    }
    const err = await ops.lancia(env, { cartella: body.cartella || '', brief });
    return err ? errore(502, err) : json({ ok: true });
  }

  if (req.method === 'POST' && path === '/api/lotto') {
    const body = await req.json().catch(() => ({})) as { cartelle?: string[]; stile?: string };
    const nomi = (body.cartelle || []).map((n) => String(n)).filter(Boolean).slice(0, 20);
    if (!nomi.length) return errore(400, 'Scegli almeno una cartella.');
    const stile = ops.nomeStile(body.stile) || (await ops.impostazioni(env)).stile;
    const errori: { nome: string; errore: string }[] = [];
    for (const nome of nomi) {
      const err = await ops.lancia(env, { cartella: nome, brief: `Stile: ${stile}` });
      if (err) errori.push({ nome, errore: err });
    }
    return json({ ok: errori.length === 0, avviati: nomi.length - errori.length, errori });
  }

  if (req.method === 'GET' && path === '/api/stato') return json(await inCorso(env, ops));
  if (req.method === 'GET' && path === '/api/video') {
    const elenco = await ops.video(env);
    const conMemo = [];
    for (const v of elenco) conMemo.push({ ...v, memo: await ops.memo(env, v.runId) });
    return json({ video: conMemo });
  }
  const videoId = path.match(/^\/api\/video\/([0-9]+)$/);
  if (videoId && req.method === 'GET') {
    const runId = videoId[1];
    const v = (await ops.video(env)).find((x) => x.runId === runId);
    const memo = await ops.memo(env, runId);
    if (!v && !memo) return errore(404, 'Video non trovato.');
    const col = await ops.collegamenti(env);
    return json({ video: v || null, memo, collegamenti: col, provaSecondi: ops.PROVA_S, playback: Boolean(env.DRIVE_REFRESH_TOKEN) });
  }
  if (videoId && req.method === 'POST') return azioneVideo(env, ops, videoId[1], await req.json().catch(() => ({})) as Record<string, unknown>);

  if (req.method === 'POST' && path === '/api/regia') {
    const body = await req.json().catch(() => ({})) as { cartella?: string; stile?: string };
    const cartella = String(body.cartella || '').trim();
    if (!cartella) return errore(400, 'Scegli la cartella già montata.');
    const stile = body.stile ? ops.nomeStile(body.stile) : undefined;
    const err = await ops.provaRegia(env, cartella, stile ? `Stile: ${stile}` : '');
    return err ? errore(502, err) : json({ ok: true });
  }
  if (req.method === 'GET' && path === '/api/regia') return json({ regia: await ops.regia(env) });

  if (req.method === 'GET' && path === '/api/collegamenti') return json(await ops.collegamenti(env));
  if (req.method === 'POST' && path === '/api/collegamenti/verifica') {
    await ops.richiediElenco(env, true);
    return json({ chiesto: true });
  }

  if (req.method === 'GET' && path === '/api/avvisi') return json({ avvisi: (await ops.leggi(env, 'app:avvisi')) || [] });
  if (req.method === 'POST' && path === '/api/avvisi/letti') {
    const lista = ((await ops.leggi<{ letto?: boolean }[]>(env, 'app:avvisi')) || []).map((a) => ({ ...a, letto: true }));
    await ops.scrivi(env, 'app:avvisi', lista);
    return json({ ok: true });
  }

  if (req.method === 'GET' && path === '/api/push/chiave') {
    return json({ attivo: pushAttivo(env), chiave: pushAttivo(env) ? env.VAPID_PUBLIC_KEY : null });
  }
  if (req.method === 'POST' && path === '/api/push/sottoscrivi') {
    const sub = await req.json().catch(() => null) as { endpoint?: string; keys?: { p256dh?: string; auth?: string } } | null;
    if (!sub?.endpoint?.startsWith('https://') || !sub.keys?.p256dh || !sub.keys.auth) return errore(400, 'Sottoscrizione non valida.');
    const lista = ((await ops.leggi<{ endpoint: string; keys: { p256dh: string; auth: string } }[]>(env, 'app:push')) || []).filter((s) => s.endpoint !== sub.endpoint);
    lista.push({ endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } });
    await ops.scrivi(env, 'app:push', lista.slice(-5));
    return json({ ok: true });
  }

  if (path.startsWith('/api/stile')) return gestisciStile(req, env, ops, path);

  if (req.method === 'POST' && path === '/api/upload/inizia') {
    const c = cred(env);
    if (!c) return errore(503, 'Caricamento rapido non attivo: sul Worker mancano R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY e R2_BUCKET. I file si possono ancora mettere su Drive o mandare al bot come File.');
    const body = await req.json().catch(() => ({})) as { nome?: string; modalita?: ModalitaUpload; archivio?: boolean; riferimento?: boolean; file?: { nome: string; size: number; tipo?: string }[] };
    const nome = String(body.nome || '').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80);
    const lista = Array.isArray(body.file) ? body.file : [];
    if (!nome) return errore(400, 'Manca il nome del video.');
    if (!lista.length) return errore(400, 'Nessun file.');
    if (lista.length > MAX_FILE) return errore(400, `Massimo ${MAX_FILE} file per volta.`);
    for (const f of lista) {
      const err = limiteFile(Number(f.size) || 0);
      if (err) return errore(400, `${f.nome}: ${err}`);
    }
    const modalita: ModalitaUpload = body.modalita === 'scelti' || body.modalita === 'proxy' ? body.modalita : 'originali';
    if ((await ops.leggi(env, 'app:r2_cors')) !== url.origin) {
      try { await impostaCors(c, url.origin); await ops.scrivi(env, 'app:r2_cors', url.origin); }
      catch (e) { return errore(502, `Non riesco a preparare R2: ${(e as Error).message}`); }
    }
    const id = crypto.randomUUID().replace(/-/g, '');
    const usati = new Set<string>();
    const file: FileUp[] = [];
    try {
      for (const f of lista) {
        const sicuro = nomeSicuro(String(f.nome || 'file'), usati);
        const key = `inbox/${id}/${sicuro}`;
        const uploadId = await creaMultipart(c, key, String(f.tipo || 'application/octet-stream'));
        const parte = dimensioneParte(Number(f.size));
        file.push({ nome: sicuro, size: Number(f.size), tipo: String(f.tipo || ''), key, uploadId, parte, parti: [] });
      }
    } catch (e) {
      for (const f of file) await annullaMultipart(c, f.key, f.uploadId);
      return errore(502, `R2 non ha aperto il caricamento: ${(e as Error).message}`);
    }
    const riferimento = Boolean(body.riferimento);
    const sess: SessioneUpload = {
      id, nome, modalita, parziale: modalita !== 'originali', archivio: Boolean(body.archivio),
      riferimento, quando: Date.now(), file,
    };
    await ops.scrivi(env, `app:upload:${id}`, sess);
    // Un video di riferimento per lo stile non è un girato da montare: non compare in Oggi.
    if (!riferimento) await ops.scrivi(env, 'app:upload_aperto', id);
    const urlIniziali = [];
    for (const f of file) {
      const primi = Math.min(PARALLELO, numeroParti(f.size, f.parte));
      const pezzi = [];
      for (let n = 1; n <= primi; n++) pezzi.push({ n, url: await urlPezzo(c, f.key, f.uploadId, n) });
      urlIniziali.push({ nome: f.nome, parte: f.parte, totale: numeroParti(f.size, f.parte), pezzi });
    }
    return json({
      upload: riassuntoUpload(sess), url: urlIniziali, parallelo: PARALLELO,
      limiti: {
        parte: PARTE, parallelo: PARALLELO,
        background: false,
        nota: 'I pezzi vanno diretti a Cloudflare, 4 alla volta. Quelli già arrivati non si rimandano. iOS sospende l’upload se chiudi l’app o cambi schermata a lungo: riaprila e riparte. Se iOS chiude proprio l’app, riselezioni gli stessi file.',
      },
    });
  }

  const up = path.match(/^\/api\/upload\/([A-Za-z0-9_-]{8,80})(\/url|\/parte|\/completa|\/annulla)?$/);
  if (up) {
    const sess = await uploadPerId(env, ops, up[1]);
    if (!sess) return errore(404, 'Caricamento non trovato.');
    const c = cred(env);
    if (req.method === 'GET' && !up[2]) return json(riassuntoUpload(sess));
    if (!c) return errore(503, 'R2 non è configurato.');
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) as { nome?: string; parti?: number[]; numero?: number; etag?: string } : {};
    const file = sess.file.find((f) => f.nome === body.nome) || (sess.file.length === 1 ? sess.file[0] : undefined);
    if (up[2] === '/url' && req.method === 'POST') {
      if (!file) return errore(404, 'File non trovato in questo caricamento.');
      const numeri = (body.parti || []).map(Number).filter((n) => n >= 1 && n <= numeroParti(file.size, file.parte)).slice(0, 16);
      const pezzi = [];
      for (const n of numeri) {
        if (file.parti.some((p) => p.n === n)) continue;
        pezzi.push({ n, url: await urlPezzo(c, file.key, file.uploadId, n) });
      }
      return json({ pezzi });
    }
    if (up[2] === '/parte' && req.method === 'POST') {
      if (!file) return errore(404, 'File non trovato.');
      const n = Number(body.numero);
      const etag = String(body.etag || '');
      if (!etagValido(etag)) return errore(400, 'ETag non valido. Se manca, il bucket R2 non espone l’intestazione ETag.');
      if (n < 1 || n > numeroParti(file.size, file.parte)) return errore(400, 'Pezzo fuori scala.');
      file.parti = registraEtag(file.parti, n, etag);
      await ops.scrivi(env, `app:upload:${sess.id}`, sess);
      return json({ ok: true, mancanti: partiMancanti(numeroParti(file.size, file.parte), file.parti).length });
    }
    if (up[2] === '/completa' && req.method === 'POST') {
      if (!file) return errore(404, 'File non trovato.');
      const mancanti = partiMancanti(numeroParti(file.size, file.parte), file.parti);
      if (mancanti.length) return errore(409, `Mancano ancora ${mancanti.length} pezzi.`);
      if (!file.completo) {
        try { await completaMultipart(c, file.key, file.uploadId, file.parti); }
        catch (e) { return errore(502, (e as Error).message); }
        file.completo = true;
      }
      if (sess.file.every((f) => f.completo)) {
        sess.pronto = true;
        await scriviOggetto(c, `inbox/${sess.id}/manifest.json`, JSON.stringify({ id: sess.id, nome: sess.nome, modalita: sess.modalita, file: sess.file.map((f) => ({ nome: f.nome, size: f.size, key: f.key })) }), 'application/json').catch(() => undefined);
      }
      await ops.scrivi(env, `app:upload:${sess.id}`, sess);
      return json(riassuntoUpload(sess));
    }
    if (up[2] === '/annulla' && req.method === 'POST') {
      for (const f of sess.file) if (!f.completo) await annullaMultipart(c, f.key, f.uploadId);
      await ops.cancella(env, `app:upload:${sess.id}`);
      if ((await ops.leggi(env, 'app:upload_aperto')) === sess.id) await ops.cancella(env, 'app:upload_aperto');
      return json({ ok: true });
    }
  }

  const media = path.match(/^\/api\/media\/([a-zA-Z0-9_-]+)$/);
  if (media && req.method === 'GET') {
    const id = media[1];
    if (!(await idConsentiti(env, ops)).has(id)) return errore(404, 'Questo file non è un video del regista.');
    const token = await tokenDrive(env, ops);
    if (!token) return errore(503, 'Per vederlo nell’app servono DRIVE_CLIENT_ID, DRIVE_CLIENT_SECRET e DRIVE_REFRESH_TOKEN sul Worker. Intanto aprilo su Drive.');
    const range = req.headers.get('range');
    const upstream = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`, {
      headers: { authorization: `Bearer ${token}`, ...(range ? { range } : {}) },
    });
    const h = new Headers();
    for (const k of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
      const v = upstream.headers.get(k);
      if (v) h.set(k, v);
    }
    h.set('cache-control', 'private, no-store');
    if (!h.has('accept-ranges')) h.set('accept-ranges', 'bytes');
    return new Response(upstream.body, { status: upstream.status, headers: h });
  }

  return errore(404, 'Route sconosciuta.');
}

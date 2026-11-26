// Accesso alla Mini App con Telegram (26/11): dentro Telegram l'app riceve «initData», una stringa firmata da Telegram
// con il token del bot. Se la firma è giusta, l'utente è quello scritto lì: se è tra le chat di Denis, si apre la sessione.
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
const enc = new TextEncoder();

async function hmac(chiave: ArrayBuffer | string, dati: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey('raw', typeof chiave === 'string' ? enc.encode(chiave) : chiave, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', k, enc.encode(dati));
}
const esa = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
// confronto a tempo costante: niente indizi su quante lettere della firma sono giuste
function uguali(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type EsitoTelegram = { ok: true; id: string } | { ok: false; motivo: string };

/** initData di Telegram → utente verificato, se la firma è giusta, è recente ed è una delle chat permesse */
export async function verificaInitData(initData: string, tokenBot: string, permessi: string[], adesso = Date.now(), maxEtaSec = 3600): Promise<EsitoTelegram> {
  if (!initData || initData.length > 4096) return { ok: false, motivo: 'dati di accesso assenti' };
  const params = new URLSearchParams(initData);
  const hash = params.get('hash') || '';
  if (!/^[0-9a-f]{64}$/.test(hash)) return { ok: false, motivo: 'firma assente' };
  params.delete('hash');
  const controllo = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('\n');
  const segreto = await hmac('WebAppData', tokenBot);
  if (!uguali(esa(await hmac(segreto, controllo)), hash)) return { ok: false, motivo: 'firma non valida' };
  const quando = Number(params.get('auth_date'));
  const eta = adesso / 1000 - quando;
  if (!Number.isFinite(quando) || eta > maxEtaSec || eta < -300) return { ok: false, motivo: 'dati scaduti: riapri l\'app da Telegram' };
  let id = '';
  try { id = String(JSON.parse(params.get('user') || '{}').id ?? ''); } catch { /* utente illeggibile */ }
  if (!id || !permessi.includes(id)) return { ok: false, motivo: 'questo account Telegram non è autorizzato' };
  return { ok: true, id };
}

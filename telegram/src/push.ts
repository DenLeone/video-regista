// Web Push (RFC 8291 aes128gcm). Su iPhone funziona solo se la PWA è nella schermata Home.
import { b64urlToBytes, bytesToB64url, concat, copia, sha256 } from './b64';
import type { Segreti } from './ops';

export type Sottoscrizione = { endpoint: string; keys: { p256dh: string; auth: string } };
export type Avviso = { id: string; tipo: string; titolo: string; corpo: string; url?: string; quando: number; letto?: boolean };

type Mem = {
  leggi(k: string): Promise<unknown>;
  scrivi(k: string, v: unknown): Promise<void>;
  cancella(k: string): Promise<void>;
};

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', copia(ikm), 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: copia(salt), info: copia(info) }, key, len * 8);
  return new Uint8Array(bits);
}

export async function cifraPush(sub: Sottoscrizione, payload: Uint8Array): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const ricevitore = await crypto.subtle.importKey('raw', copia(b64urlToBytes(sub.keys.p256dh)), { name: 'ECDH', namedCurve: 'P-256' }, true, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: ricevitore }, local.privateKey, 256));
  const localPub = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const receiverPub = b64urlToBytes(sub.keys.p256dh);
  const auth = b64urlToBytes(sub.keys.auth);
  const info = concat([new TextEncoder().encode('WebPush: info\0'), receiverPub, localPub]);
  const prk = await hkdf(auth, shared, info, 32);
  const cek = await hkdf(salt, prk, new TextEncoder().encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, prk, new TextEncoder().encode('Content-Encoding: nonce\0'), 12);
  const chiave = await crypto.subtle.importKey('raw', copia(cek), 'AES-GCM', false, ['encrypt']);
  const padded = concat([payload, new Uint8Array([2])]);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: copia(nonce) }, chiave, copia(padded)));
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return concat([salt, rs, new Uint8Array([localPub.length]), localPub, cipher]);
}

async function jwtVapid(env: Segreti, aud: string): Promise<string> {
  const pub = b64urlToBytes(env.VAPID_PUBLIC_KEY || '');
  const priv = b64urlToBytes(env.VAPID_PRIVATE_KEY || '');
  if (pub.length !== 65 || priv.length !== 32) throw new Error('chiavi VAPID');
  const jwk = {
    kty: 'EC', crv: 'P-256', d: bytesToB64url(priv),
    x: bytesToB64url(pub.slice(1, 33)), y: bytesToB64url(pub.slice(33, 65)),
  };
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const header = bytesToB64url(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = bytesToB64url(new TextEncoder().encode(JSON.stringify({
    aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT || 'mailto:regista@localhost',
  })));
  const data = `${header}.${payload}`;
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(data)));
  return `${data}.${bytesToB64url(sig)}`;
}

export function pushAttivo(env: Segreti): boolean {
  return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
}

export async function inviaPush(env: Segreti, mem: Mem, avviso: { titolo: string; corpo: string; url?: string }): Promise<void> {
  if (!pushAttivo(env)) return;
  const lista = ((await mem.leggi('app:push')) as Sottoscrizione[] | undefined) || [];
  const rimasti: Sottoscrizione[] = [];
  const corpo = new TextEncoder().encode(JSON.stringify(avviso));
  for (const sub of lista) {
    try {
      const cifrato = await cifraPush(sub, corpo);
      const jwt = await jwtVapid(env, new URL(sub.endpoint).origin);
      const r = await fetch(sub.endpoint, {
        method: 'POST',
        headers: {
          ttl: '86400', urgency: 'high', 'content-encoding': 'aes128gcm', 'content-type': 'application/octet-stream',
          authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`,
        },
        body: copia(cifrato),
      });
      if (r.status === 404 || r.status === 410) continue;
      rimasti.push(sub);
    } catch (e) {
      console.error('push', e);
      rimasti.push(sub);
    }
  }
  if (rimasti.length !== lista.length) await mem.scrivi('app:push', rimasti);
}

export async function avvisoUtente(env: Segreti, mem: Mem, a: { tipo: string; titolo: string; corpo: string; url?: string }): Promise<void> {
  const lista = ((await mem.leggi('app:avvisi')) as Avviso[] | undefined) || [];
  lista.unshift({ id: crypto.randomUUID(), quando: Date.now(), letto: false, ...a });
  await mem.scrivi('app:avvisi', lista.slice(0, 30));
  await inviaPush(env, mem, a).catch((e) => console.error(e));
}

void sha256;

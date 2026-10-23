// WebAuthn per un solo utente, senza librerie. La registrazione è chiusa dal codice monouso.
import { b64urlToBytes, bytesToB64url, concat, copia, sha256 } from './b64';

type Cbor = Uint8Array | string | number | boolean | null | Cbor[] | Map<Cbor, Cbor>;

export function cborDecode(data: Uint8Array, i = 0): { v: Cbor; i: number } {
  const b = data[i];
  const major = b >> 5;
  const info = b & 31;
  let ai = i + 1;
  let len = info;
  if (info > 27) throw new Error('CBOR non supportato');
  if (info >= 24) {
    const n = info === 24 ? 1 : info === 25 ? 2 : info === 26 ? 4 : 8;
    len = 0;
    for (let k = 0; k < n; k++) len = len * 256 + data[ai++];
  }
  if (major === 0) return { v: len, i: ai };
  if (major === 1) return { v: -1 - len, i: ai };
  if (major === 2) return { v: data.slice(ai, ai + len), i: ai + len };
  if (major === 3) return { v: new TextDecoder().decode(data.slice(ai, ai + len)), i: ai + len };
  if (major === 4) {
    const arr: Cbor[] = [];
    for (let k = 0; k < len; k++) { const x = cborDecode(data, ai); arr.push(x.v); ai = x.i; }
    return { v: arr, i: ai };
  }
  if (major === 5) {
    const map = new Map<Cbor, Cbor>();
    for (let k = 0; k < len; k++) {
      const key = cborDecode(data, ai); ai = key.i;
      const val = cborDecode(data, ai); ai = val.i;
      map.set(key.v, val.v);
    }
    return { v: map, i: ai };
  }
  if (major === 7 && info === 20) return { v: false, i: ai };
  if (major === 7 && info === 21) return { v: true, i: ai };
  if (major === 7 && info === 22) return { v: null, i: ai };
  throw new Error('CBOR non supportato');
}

export function cborEncode(v: Cbor): Uint8Array {
  if (v === null) return new Uint8Array([0xf6]);
  if (v === false) return new Uint8Array([0xf4]);
  if (v === true) return new Uint8Array([0xf5]);
  if (typeof v === 'number' && Number.isInteger(v)) {
    if (v >= 0) return cborHead(0, v);
    return cborHead(1, -1 - v);
  }
  if (typeof v === 'string') {
    const b = new TextEncoder().encode(v);
    return concat([cborHead(3, b.length), b]);
  }
  if (v instanceof Uint8Array) return concat([cborHead(2, v.length), v]);
  if (Array.isArray(v)) return concat([cborHead(4, v.length), ...v.map(cborEncode)]);
  if (v instanceof Map) {
    const parti = [cborHead(5, v.size)];
    for (const [k, val] of v) parti.push(cborEncode(k), cborEncode(val));
    return concat(parti);
  }
  throw new Error('CBOR non codificabile');
}

function cborHead(major: number, len: number): Uint8Array {
  if (len < 24) return new Uint8Array([(major << 5) | len]);
  if (len < 256) return new Uint8Array([(major << 5) | 24, len]);
  if (len < 65536) return new Uint8Array([(major << 5) | 25, len >> 8, len & 255]);
  const out = new Uint8Array(5);
  out[0] = (major << 5) | 26;
  new DataView(out.buffer).setUint32(1, len);
  return out;
}

export type Passkey = { id: string; x: string; y: string; signCount: number; creato: number };

type ClientData = { type: string; challenge: string; origin: string; crossOrigin?: boolean };

function controllaClient(clientDataJSON: Uint8Array, tipo: string, challenge: string, origin: string): ClientData {
  const cd = JSON.parse(new TextDecoder().decode(clientDataJSON)) as ClientData;
  if (cd.type !== tipo) throw new Error('tipo della cerimonia diverso');
  if (cd.origin !== origin) throw new Error('origine diversa');
  if (cd.crossOrigin) throw new Error('crossOrigin');
  if (cd.challenge !== challenge) throw new Error('sfida diversa');
  return cd;
}

export function estraiCredenziale(authData: Uint8Array): { id: Uint8Array; x: Uint8Array; y: Uint8Array; signCount: number } {
  if (authData.length < 37) throw new Error('authData corto');
  const flags = authData[32];
  const signCount = new DataView(authData.buffer, authData.byteOffset + 33, 4).getUint32(0);
  if ((flags & 0x01) === 0) throw new Error('utente non presente');
  if ((flags & 0x40) === 0) throw new Error('manca la credenziale');
  const idLen = new DataView(authData.buffer, authData.byteOffset + 53, 2).getUint16(0);
  const id = authData.slice(55, 55 + idLen);
  const cose = cborDecode(authData.slice(55 + idLen)).v;
  if (!(cose instanceof Map)) throw new Error('chiave COSE illeggibile');
  const x = cose.get(-2);
  const y = cose.get(-3);
  if (!(x instanceof Uint8Array) || !(y instanceof Uint8Array)) throw new Error('chiave incompleta');
  return { id, x, y, signCount };
}

function firmaGrezza(sig: Uint8Array): Uint8Array {
  if (sig.length === 64) return sig;
  if (sig[0] !== 0x30) throw new Error('firma illeggibile');
  let i = 2;
  if (sig[1] & 0x80) i = 2 + (sig[1] & 0x7f);
  if (sig[i] !== 0x02) throw new Error('firma illeggibile');
  const rLen = sig[i + 1];
  let r = sig.slice(i + 2, i + 2 + rLen);
  i = i + 2 + rLen;
  if (sig[i] !== 0x02) throw new Error('firma illeggibile');
  const sLen = sig[i + 1];
  let s = sig.slice(i + 2, i + 2 + sLen);
  if (r.length > 32) r = r.slice(r.length - 32);
  if (s.length > 32) s = s.slice(s.length - 32);
  const out = new Uint8Array(64);
  out.set(r, 32 - r.length);
  out.set(s, 64 - s.length);
  return out;
}

async function verificaFirma(x: Uint8Array, y: Uint8Array, authData: Uint8Array, clientDataJSON: Uint8Array, signature: Uint8Array): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'jwk', { kty: 'EC', crv: 'P-256', x: bytesToB64url(x), y: bytesToB64url(y) },
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'],
  );
  const hash = await sha256(clientDataJSON);
  const data = concat([authData, hash]);
  return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, copia(firmaGrezza(signature)), copia(data));
}

export async function verificaRegistrazione(opts: {
  clientDataJSON: Uint8Array; attestationObject: Uint8Array; challenge: string; origin: string; rpId: string;
}): Promise<Passkey> {
  controllaClient(opts.clientDataJSON, 'webauthn.create', opts.challenge, opts.origin);
  const att = cborDecode(opts.attestationObject).v;
  if (!(att instanceof Map)) throw new Error('attestazione illeggibile');
  const authData = att.get('authData');
  if (!(authData instanceof Uint8Array)) throw new Error('authData assente');
  const rpHash = await sha256(opts.rpId);
  if (![...rpHash].every((b, i) => b === authData[i])) throw new Error('rpId diverso');
  if ((authData[32] & 0x04) === 0) throw new Error('verifica utente assente');
  const cred = estraiCredenziale(authData);
  return { id: bytesToB64url(cred.id), x: bytesToB64url(cred.x), y: bytesToB64url(cred.y), signCount: cred.signCount, creato: Date.now() };
}

export async function verificaAccesso(opts: {
  clientDataJSON: Uint8Array; authenticatorData: Uint8Array; signature: Uint8Array;
  challenge: string; origin: string; rpId: string; passkey: Passkey;
}): Promise<number> {
  controllaClient(opts.clientDataJSON, 'webauthn.get', opts.challenge, opts.origin);
  const authData = opts.authenticatorData;
  const rpHash = await sha256(opts.rpId);
  if (authData.length < 37 || ![...rpHash].every((b, i) => b === authData[i])) throw new Error('rpId diverso');
  if ((authData[32] & 0x01) === 0 || (authData[32] & 0x04) === 0) throw new Error('verifica utente assente');
  const signCount = new DataView(authData.buffer, authData.byteOffset + 33, 4).getUint32(0);
  if (opts.passkey.signCount > 0 && signCount > 0 && signCount <= opts.passkey.signCount) throw new Error('contatore firma fermo');
  const ok = await verificaFirma(b64urlToBytes(opts.passkey.x), b64urlToBytes(opts.passkey.y), authData, opts.clientDataJSON, opts.signature);
  if (!ok) throw new Error('firma non valida');
  return signCount;
}

export { b64urlToBytes };

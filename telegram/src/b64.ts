export function bytesToB64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Copia in un ArrayBuffer vero: TS 5.9 tipizza Uint8Array su ArrayBufferLike, WebCrypto no. */
export function copia(dati: ArrayBufferView): Uint8Array<ArrayBuffer> {
  const buf = dati.buffer.slice(dati.byteOffset, dati.byteOffset + dati.byteLength) as ArrayBuffer;
  return new Uint8Array(buf);
}

export async function sha256(data: ArrayBufferView | string): Promise<Uint8Array<ArrayBuffer>> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : copia(data);
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}

export async function sha256Hex(data: ArrayBufferView | string): Promise<string> {
  const buf = await sha256(data);
  return [...buf].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function concat(parti: Uint8Array[]): Uint8Array {
  const n = parti.reduce((t, p) => t + p.length, 0);
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parti) { out.set(p, o); o += p.length; }
  return out;
}

export function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  const n = Math.max(ea.length, eb.length);
  let diff = ea.length === eb.length ? 0 : 1;
  for (let i = 0; i < n; i++) diff |= (ea[i] || 0) ^ (eb[i] || 0);
  return diff === 0;
}

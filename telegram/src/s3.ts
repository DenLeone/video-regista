// Firma AWS SigV4 per R2 (API S3). Nessuna dipendenza: il deploy del bot non fa npm install.
import { bytesToB64url, copia, sha256, sha256Hex } from './b64';

const EMPTY = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

export function enc(s: string): string {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

async function hmac(key: BufferSource, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', k, new TextEncoder().encode(data));
}

export async function chiaveFirma(secret: string, date: string, region: string, service = 's3'): Promise<ArrayBuffer> {
  const kDate = await hmac(new TextEncoder().encode(`AWS4${secret}`), date);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

export function uriCanonico(bucket: string, key: string): string {
  const parti = [bucket, ...key.split('/')].filter((p) => p.length).map(enc);
  return `/${parti.join('/')}`;
}

export function queryCanonica(query: Record<string, string>): string {
  return Object.keys(query).sort().map((k) => `${enc(k)}=${enc(query[k])}`).join('&');
}

export type RichiestaFirmata = {
  method: string;
  uri: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  payloadHash: string;
};

export function richiestaCanonica(r: RichiestaFirmata): string {
  const orig = Object.keys(r.headers);
  const nomi = orig.map((k) => k.toLowerCase()).sort();
  const canonHeaders = nomi.map((k) => {
    const chiave = orig.find((x) => x.toLowerCase() === k) as string;
    return `${k}:${r.headers[chiave].trim().replace(/\s+/g, ' ')}`;
  }).join('\n');
  return [r.method, r.uri, queryCanonica(r.query), `${canonHeaders}\n`, nomi.join(';'), r.payloadHash].join('\n');
}

export async function firmaIntestazioni(opts: {
  method: string; uri: string; query?: Record<string, string>; headers: Record<string, string>;
  payloadHash: string; secret: string; region: string; amzDate: string;
}): Promise<string> {
  const date = opts.amzDate.slice(0, 8);
  const scope = `${date}/${opts.region}/s3/aws4_request`;
  const canon = richiestaCanonica({
    method: opts.method, uri: opts.uri, query: opts.query || {}, headers: opts.headers, payloadHash: opts.payloadHash,
  });
  const stringa = ['AWS4-HMAC-SHA256', opts.amzDate, scope, await sha256Hex(canon)].join('\n');
  const chiave = await chiaveFirma(opts.secret, date, opts.region);
  const sig = new Uint8Array(await hmac(chiave, stringa));
  return [...sig].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export type CredenzialiR2 = { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string };

export function credenzialiOk(c: Partial<CredenzialiR2> | undefined): c is CredenzialiR2 {
  return Boolean(c?.accountId && c.accessKeyId && c.secretAccessKey && c.bucket);
}

function hostDi(accountId: string) {
  return `${accountId}.r2.cloudflarestorage.com`;
}

function dataAmz(now = new Date()): string {
  return now.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

export async function chiamataR2(c: CredenzialiR2, opts: {
  method: string; key?: string; query?: Record<string, string>; body?: Uint8Array | string; contentType?: string;
}): Promise<Response> {
  const region = 'auto';
  const amzDate = dataAmz();
  const body = copia(opts.body == null ? new Uint8Array() : typeof opts.body === 'string' ? new TextEncoder().encode(opts.body) : opts.body);
  const payloadHash = body.length ? await sha256Hex(body) : EMPTY;
  const uri = opts.key != null ? uriCanonico(c.bucket, opts.key) : `/${enc(c.bucket)}`;
  const headers: Record<string, string> = {
    host: hostDi(c.accountId),
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  if (opts.contentType) headers['content-type'] = opts.contentType;
  const signature = await firmaIntestazioni({
    method: opts.method, uri, query: opts.query, headers, payloadHash, secret: c.secretAccessKey, region, amzDate,
  });
  const nomi = Object.keys(headers).map((k) => k.toLowerCase()).sort().join(';');
  const scope = `${amzDate.slice(0, 8)}/${region}/s3/aws4_request`;
  const authorization = `AWS4-HMAC-SHA256 Credential=${c.accessKeyId}/${scope}, SignedHeaders=${nomi}, Signature=${signature}`;
  const url = `https://${headers.host}${uri}${opts.query && Object.keys(opts.query).length ? `?${queryCanonica(opts.query)}` : ''}`;
  return fetch(url, {
    method: opts.method,
    headers: { ...headers, authorization },
    body: opts.method === 'GET' || opts.method === 'HEAD' ? undefined : body,
  });
}

/** URL che il telefono usa per un pezzo. Vale `scadenza` secondi. Firma solo l'host. */
export async function urlPezzo(c: CredenzialiR2, key: string, uploadId: string, partNumber: number, scadenza = 6 * 3600): Promise<string> {
  const region = 'auto';
  const amzDate = dataAmz();
  const scope = `${amzDate.slice(0, 8)}/${region}/s3/aws4_request`;
  const uri = uriCanonico(c.bucket, key);
  const query: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${c.accessKeyId}/${scope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(scadenza),
    'X-Amz-SignedHeaders': 'host',
    partNumber: String(partNumber),
    uploadId,
  };
  const headers = { host: hostDi(c.accountId) };
  const signature = await firmaIntestazioni({
    method: 'PUT', uri, query, headers, payloadHash: 'UNSIGNED-PAYLOAD', secret: c.secretAccessKey, region, amzDate,
  });
  query['X-Amz-Signature'] = signature;
  return `https://${headers.host}${uri}?${queryCanonica(query)}`;
}

export async function creaMultipart(c: CredenzialiR2, key: string, contentType: string): Promise<string> {
  const r = await chiamataR2(c, { method: 'POST', key, query: { uploads: '' }, contentType, body: '' });
  const t = await r.text();
  if (!r.ok) throw new Error(`R2 crea upload ${r.status}: ${t.slice(0, 180)}`);
  const id = /<UploadId>([^<]+)<\/UploadId>/.exec(t)?.[1];
  if (!id) throw new Error('R2 non ha restituito UploadId');
  return id;
}

function xml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function completaMultipart(c: CredenzialiR2, key: string, uploadId: string, parti: { n: number; etag: string }[]): Promise<void> {
  const body = `<CompleteMultipartUpload>${parti.map((p) => `<Part><PartNumber>${p.n}</PartNumber><ETag>${xml(p.etag)}</ETag></Part>`).join('')}</CompleteMultipartUpload>`;
  const r = await chiamataR2(c, {
    method: 'POST', key, query: { uploadId }, contentType: 'application/xml', body,
  });
  if (!r.ok) throw new Error(`R2 completa ${r.status}: ${(await r.text()).slice(0, 180)}`);
}

export async function annullaMultipart(c: CredenzialiR2, key: string, uploadId: string): Promise<void> {
  await chiamataR2(c, { method: 'DELETE', key, query: { uploadId } }).catch(() => undefined);
}

export async function scriviOggetto(c: CredenzialiR2, key: string, body: string, contentType: string): Promise<void> {
  const r = await chiamataR2(c, { method: 'PUT', key, body, contentType });
  if (!r.ok) throw new Error(`R2 put ${r.status}: ${(await r.text()).slice(0, 120)}`);
}

export async function cancellaOggetto(c: CredenzialiR2, key: string): Promise<void> {
  await chiamataR2(c, { method: 'DELETE', key }).catch(() => undefined);
}

// sha256 è usato dai test di webauthn; bytesToB64url no, ma la firma JWT sta in push.
void sha256;
void bytesToB64url;

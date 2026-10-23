import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bytesToB64url, concat, copia, sha256 } from '../src/b64';
import { cborEncode, verificaAccesso, verificaRegistrazione } from '../src/webauthn';

const ORIGIN = 'https://regista.test';
const RP = 'regista.test';

async function coppia() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  return { pair, x: b64urlTo(jwk.x || ''), y: b64urlTo(jwk.y || '') };
}

function b64urlTo(s: string) {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function registrazione(challenge: string) {
  const { pair, x, y } = await coppia();
  const rpHash = await sha256(RP);
  const credId = crypto.getRandomValues(new Uint8Array(16));
  const cose = new Map<number | string, Uint8Array | number | string>();
  cose.set(1, 2);
  cose.set(3, -7);
  cose.set(-1, 1);
  cose.set(-2, x);
  cose.set(-3, y);
  const authData = concat([
    rpHash,
    new Uint8Array([0x45]),
    new Uint8Array([0, 0, 0, 0]),
    new Uint8Array(16),
    new Uint8Array([0, credId.length]),
    credId,
    cborEncode(cose),
  ]);
  const att = new Map<string, Uint8Array | string | Map<string, string>>();
  att.set('fmt', 'none');
  att.set('attStmt', new Map());
  att.set('authData', authData);
  const clientDataJSON = new TextEncoder().encode(JSON.stringify({ type: 'webauthn.create', challenge, origin: ORIGIN }));
  const pk = await verificaRegistrazione({
    clientDataJSON, attestationObject: cborEncode(att), challenge, origin: ORIGIN, rpId: RP,
  });
  return { pair, pk, credId };
}

test('registrazione e accesso con la stessa passkey', async () => {
  const { pair, pk } = await registrazione('sfida-crea');
  assert.equal(pk.signCount, 0);
  const rpHash = await sha256(RP);
  const authData = concat([rpHash, new Uint8Array([0x05]), new Uint8Array([0, 0, 0, 0])]);
  const clientDataJSON = new TextEncoder().encode(JSON.stringify({ type: 'webauthn.get', challenge: 'sfida-entra', origin: ORIGIN }));
  const data = concat([authData, await sha256(clientDataJSON)]);
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, copia(data)));
  const count = await verificaAccesso({
    clientDataJSON, authenticatorData: authData, signature, challenge: 'sfida-entra', origin: ORIGIN, rpId: RP, passkey: pk,
  });
  assert.equal(count, 0);
  const falsa = new Uint8Array(signature);
  falsa[10] ^= 0xff;
  await assert.rejects(() => verificaAccesso({
    clientDataJSON, authenticatorData: authData, signature: falsa, challenge: 'sfida-entra', origin: ORIGIN, rpId: RP, passkey: pk,
  }));
});

test('un’altra origine non passa', async () => {
  const { pair, x, y } = await coppia();
  const rpHash = await sha256(RP);
  const credId = crypto.getRandomValues(new Uint8Array(16));
  const cose = new Map<number, Uint8Array | number>();
  cose.set(1, 2); cose.set(3, -7); cose.set(-1, 1); cose.set(-2, x); cose.set(-3, y);
  const authData = concat([
    rpHash, new Uint8Array([0x45]), new Uint8Array(4), new Uint8Array(16),
    new Uint8Array([0, credId.length]), credId, cborEncode(cose),
  ]);
  const att = new Map<string, Uint8Array | string | Map<string, string>>();
  att.set('fmt', 'none'); att.set('attStmt', new Map()); att.set('authData', authData);
  const clientDataJSON = new TextEncoder().encode(JSON.stringify({ type: 'webauthn.create', challenge: 'x', origin: 'https://altro.test' }));
  await assert.rejects(() => verificaRegistrazione({
    clientDataJSON, attestationObject: cborEncode(att), challenge: 'x', origin: ORIGIN, rpId: RP,
  }));
  void pair;
  void bytesToB64url;
});

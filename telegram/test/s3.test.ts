import assert from 'node:assert/strict';
import { test } from 'node:test';
import { firmaIntestazioni, urlPezzo } from '../src/s3';

// Vettore pubblico AWS (GET Object, us-east-1, 24 maggio 2013).
test('SigV4 coincide con il vettore AWS', async () => {
  const sig = await firmaIntestazioni({
    method: 'GET',
    uri: '/test.txt',
    headers: {
      host: 'examplebucket.s3.amazonaws.com',
      range: 'bytes=0-9',
      'x-amz-content-sha256': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      'x-amz-date': '20130524T000000Z',
    },
    payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    secret: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    region: 'us-east-1',
    amzDate: '20130524T000000Z',
  });
  assert.equal(sig, 'f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41');
});

test('l’URL di un pezzo è un PUT firmato, senza passare dal Worker', async () => {
  const url = await urlPezzo({
    accountId: 'a'.repeat(32),
    accessKeyId: 'AKIATEST',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    bucket: 'regista-inbox',
  }, 'inbox/abc/IMG_1.mov', 'upload-1', 3, 60);
  const u = new URL(url);
  assert.equal(u.hostname, `${'a'.repeat(32)}.r2.cloudflarestorage.com`);
  assert.equal(u.pathname, '/regista-inbox/inbox/abc/IMG_1.mov');
  assert.equal(u.searchParams.get('partNumber'), '3');
  assert.equal(u.searchParams.get('uploadId'), 'upload-1');
  assert.equal(u.searchParams.get('X-Amz-SignedHeaders'), 'host');
  assert.equal(u.searchParams.get('X-Amz-Expires'), '60');
  assert.ok(u.searchParams.get('X-Amz-Signature'));
});

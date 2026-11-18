// dispositivo (18/11): i file ricompressi dall'iPhone («Comprimi per regista») restano della loro camera
import test from 'node:test';
import assert from 'node:assert/strict';
import { dispositivo } from './sorgenti.mjs';

const APPLE = { 'com.apple.quicktime.make': 'Apple', major_brand: 'qt  ' };

test('Sony ricompressa sull\'iPhone resta Sony', () => {
  assert.equal(dispositivo('C1293.mov', APPLE), 'sony');
  assert.equal(dispositivo('C1293.MP4', { major_brand: 'XAVC' }), 'sony');
});
test('Insta360 ricompressa resta Insta360', () => assert.equal(dispositivo('VID_20261006_135227_191_02_17.mov', APPLE), 'insta'));
test('iPhone e microfono come prima', () => {
  assert.equal(dispositivo('IMG_1234.MOV', APPLE), 'iphone');
  assert.equal(dispositivo('Clip.mov', APPLE), 'iphone');
  assert.equal(dispositivo('voce.wav'), 'mic');
});

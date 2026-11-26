// Prova completa di scripts/riordino.mjs con file veri in una cartella temporanea: rclone, ffmpeg e Gemini sono finti, il resto è
// il programma vero. «vai» riordina, «annulla» rimette tutto, un secondo «continua» non fa niente.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const radice = fs.mkdtempSync(path.join(os.tmpdir(), 'riordino-'));
const drive = path.join(radice, 'drive');
const bin = path.join(radice, 'bin');
fs.mkdirSync(bin);
const scrivi = (rel, testo = 'x'.repeat(1200), eta = 5 * 24 * 3600) => {
  const f = path.join(drive, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, testo);
  const t = Date.now() / 1000 - eta; fs.utimesSync(f, t, t);
};
const esiste = (rel) => fs.existsSync(path.join(drive, rel));
const albero = (dir) => { const out = []; const giro = (d) => { for (const n of fs.readdirSync(d)) { const p = path.join(d, n); fs.statSync(p).isDirectory() ? giro(p) : out.push(path.relative(drive, p)); } }; giro(path.join(drive, dir)); return out.sort(); };

// rclone finto: la cartella «gdrive:» è `drive`
fs.writeFileSync(path.join(bin, 'rclone'), `#!/usr/bin/env python3
import sys, os, json, fnmatch, datetime, shutil
D = os.environ['FAKE_DRIVE']
a = sys.argv[1:]
def loc(x): return os.path.join(D, x.split(':', 1)[1])
rem = [x for x in a if x.startswith('gdrive:')]
cmd = a[0]
def info(base, p):
    s = os.stat(p)
    return {'Path': os.path.relpath(p, base), 'Name': os.path.basename(p), 'Size': s.st_size, 'ModTime': datetime.datetime.fromtimestamp(s.st_mtime, datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'), 'IsDir': os.path.isdir(p)}
if cmd == 'cat':
    p = loc(rem[0])
    if not os.path.isfile(p): sys.exit(1)
    sys.stdout.write(open(p).read())
elif cmd == 'rcat':
    p = loc(rem[0]); os.makedirs(os.path.dirname(p), exist_ok=True); open(p, 'w').write(sys.stdin.read())
elif cmd == 'moveto':
    s, d = loc(rem[0]), loc(rem[1]); os.makedirs(os.path.dirname(d), exist_ok=True); os.replace(s, d)
elif cmd == 'rmdirs':
    base = loc(rem[0])
    for dp, dn, fn in os.walk(base, topdown=False):
        if not os.listdir(dp): os.rmdir(dp)
elif cmd == 'serve':
    os.chdir(loc(rem[0])); os.execvp('python3', ['python3', '-m', 'http.server', a[a.index('--addr') + 1].split(':')[1], '--bind', '127.0.0.1'])
elif cmd == 'lsjson':
    base = loc(rem[0]); out = []
    inc = [a[i + 1] for i, x in enumerate(a) if x == '--include']
    if os.path.isfile(base): out = [info(os.path.dirname(base), base)]
    elif os.path.isdir(base):
        if '-R' in a:
            for dp, dn, fn in os.walk(base):
                for f in fn:
                    e = info(base, os.path.join(dp, f))
                    if not inc or any(fnmatch.fnmatch(e['Path'], g) for g in inc): out.append(e)
        else:
            for n in sorted(os.listdir(base)):
                isd = os.path.isdir(os.path.join(base, n))
                if ('--dirs-only' in a and not isd) or ('--files-only' in a and isd): continue
                out.append(info(base, os.path.join(base, n)))
    print(json.dumps(out))
`, { mode: 0o755 });
// ffmpeg e ffprobe finti: ffprobe dice 10 secondi, ffmpeg scrive il file d'uscita
fs.writeFileSync(path.join(bin, 'ffprobe'), '#!/bin/bash\necho 10\n', { mode: 0o755 });
fs.writeFileSync(path.join(bin, 'ffmpeg'), '#!/bin/bash\nout="${@: -1}"\nif [[ "$out" == *.wav ]]; then head -c 5000 /dev/zero > "$out"; else printf "JPEGFINTO" > "$out"; fi\n', { mode: 0o755 });

// Gemini finto: il prodotto lo dice la cartella, il parlato il nome del file («p_…»)
const richieste = [];
let fermaAlRaggruppa = false; // il bot che segna «fermato» su Drive mentre il giro raggruppa i prodotti
const gemini = http.createServer((q, r) => {
  let b = ''; q.on('data', (d) => (b += d));
  q.on('end', () => {
    const parts = JSON.parse(b).contents[0].parts;
    richieste.push(parts.length);
    const testi = parts.filter((p) => p.text).map((p) => p.text);
    const clip = testi.map((t) => /^Clip (\d+) \((\w+), cartella «(.*)», file «(.*)»\):$/.exec(t)).filter(Boolean)
      .map((m) => ({ k: Number(m[1]), prodotto: /Anker/.test(m[3]) ? 'Anker powerbank' : /Moero/.test(m[3]) ? 'Moero' : '', parlato: m[4].startsWith('p_'), conf: /Anker|Moero/.test(m[3]) ? 0.9 : 0.1 }));
    if (!clip.length && fermaAlRaggruppa) {
      const f = path.join(drive, '00 · Preparazione/_riordino/stato.json');
      fs.writeFileSync(f, JSON.stringify({ ...JSON.parse(fs.readFileSync(f, 'utf8')), fase: 'fermato' }));
    }
    r.setHeader('content-type', 'application/json');
    r.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(clip.length ? { clip } : { gruppi: [] }) }] } }] }));
  });
});
const avvisi = [];
const bot = http.createServer((q, r) => { let b = ''; q.on('data', (d) => (b += d)); q.on('end', () => { avvisi.push(JSON.parse(b).testo); r.end('ok'); }); });
await new Promise((ok) => gemini.listen(0, ok));
await new Promise((ok) => bot.listen(0, ok));

const lancia = (modo) => new Promise((ok) => execFile('node', [path.resolve('scripts/riordino.mjs')], { env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, FAKE_DRIVE: drive, MODO: modo, PAUSA_MS: '0', GEMINI_API_KEY: 'x',
  GEMINI_URL: `http://127.0.0.1:${gemini.address().port}`, NOTIFY_URL: `http://127.0.0.1:${bot.address().port}/notify`, NOTIFY_TOKEN: 't', RUNNER_TEMP: radice }, timeout: 60_000 }, (e, out, err) => ok({ codice: e?.code ?? 0, out, err })));

const A = '05 · Archivio';
scrivi(`${A}/Anker powerbank/p_a.mp4`); scrivi(`${A}/Anker powerbank/b_a.mp4`);
scrivi(`${A}/Anker 2/p_b.mp4`); scrivi(`${A}/Anker 2/b_c.mp4`); scrivi(`${A}/Anker 2/b_d.mp4`);
scrivi(`${A}/Insta 360/Anker Luna/p_c.mp4`); scrivi(`${A}/Insta 360/Anker Luna/p_a.mp4`); // «p_a.mp4» c'è già: non si sovrascrive
scrivi(`${A}/Moero/p_m.mp4`);
scrivi(`${A}/Varie/x.mp4`); // prodotto non chiaro: resta dov'è
scrivi(`${A}/Nuova/Anker nuovo/p_n.mp4`, 'x'.repeat(1200), 600); // arrivata 10 minuti fa: forse sta caricando
scrivi('01 · Da editare/Lavoro/_regista/archivio.json', JSON.stringify({ 'b_c.mp4': `${A}/Anker 2/b_c.mp4` })); // usata da un montaggio in corso
fs.mkdirSync(path.join(drive, '00 · Preparazione'), { recursive: true });
const prima = albero(A);

test('«vai»: riunisce lo stesso prodotto, divide parlato e B-roll, toglie le cartelle vuote, avvisa, scrive l\'esito per la Fabbrica', async () => {
  const r = await lancia('vai');
  assert.equal(r.codice, 0, r.err);
  // il prodotto in una cartella sola: parlato al primo livello, B-roll in B-roll/
  assert.deepEqual(albero(`${A}/Anker powerbank`), [`${A}/Anker powerbank/B-roll/b_a.mp4`, `${A}/Anker powerbank/B-roll/b_d.mp4`, `${A}/Anker powerbank/p_a (2).mp4`, `${A}/Anker powerbank/p_a.mp4`,
    `${A}/Anker powerbank/p_b.mp4`, `${A}/Anker powerbank/p_c.mp4`]);
  // cose da non toccare
  assert.ok(esiste(`${A}/Anker 2/b_c.mp4`), 'la clip usata da un montaggio in corso si è mossa');
  assert.ok(esiste(`${A}/Varie/x.mp4`) && esiste(`${A}/Nuova/Anker nuovo/p_n.mp4`) && esiste(`${A}/Moero/p_m.mp4`));
  // le vecchie rimaste vuote sono andate; quelle con qualcosa dentro no
  assert.ok(!esiste(`${A}/Insta 360`), 'cartella vuota non tolta');
  assert.ok(esiste(`${A}/Anker 2`) && esiste(`${A}/Varie`));
  // nessun file perso
  assert.equal(albero(A).length, prima.length);
  // stato, giornale, piano, esito per la Fabbrica
  const stato = JSON.parse(fs.readFileSync(path.join(drive, '00 · Preparazione/_riordino/stato.json'), 'utf8'));
  assert.equal(stato.fase, 'finito');
  assert.equal(JSON.parse(fs.readFileSync(path.join(drive, '00 · Preparazione/_riordino/giornale.json'), 'utf8')).length, 5);
  const esito = JSON.parse(fs.readFileSync(path.join(drive, '00 · Preparazione/_ispettore.json'), 'utf8'));
  assert.deepEqual({ c: esito.cartelle['Anker powerbank'].colore, t: esito.cartelle['Anker powerbank'].tipo, n: esito.cartelle['Anker powerbank'].clip }, { c: 'verde', t: 'recensione', n: 4 });
  assert.equal(esito.cartelle.Moero.colore, 'verde');
  // avvisi su Telegram: partenza e fine
  assert.match(avvisi[0], /ho trovato <b>\d+<\/b> file in <b>\d+<\/b> cartelle di 05/); // quante clip, subito
  assert.match(avvisi[0], /Da riconoscere ora: <b>10<\/b> clip/);
  assert.ok(avvisi.some((a) => /comincio a riordinare/.test(a)));
  assert.match(avvisi.at(-1), /finito\. 5 file riordinati/);
  assert.match(avvisi.at(-1), /cestino/);
});

test('un secondo «continua» a lavoro finito non fa niente (e non manda avvisi)', async () => {
  const n = avvisi.length;
  const r = await lancia('continua');
  assert.equal(r.codice, 0, r.err);
  assert.equal(avvisi.length, n);
  assert.match(r.out, /niente da fare/);
});

test('«annulla»: ogni file torna dov\'era', async () => {
  const r = await lancia('annulla');
  assert.equal(r.codice, 0, r.err);
  assert.deepEqual(albero(A), prima);
  assert.match(avvisi.at(-1), /rimessi a posto 5 file/);
});

test('«prova»: dice cosa farebbe e non sposta niente', async () => {
  const r = await lancia('prova');
  assert.equal(r.codice, 0, r.err);
  assert.deepEqual(albero(A), prima);
  assert.match(avvisi.at(-1), /prova, non ho spostato niente/);
});

test('dopo una prova finita, il giro automatico non la rifà (aspetta ▶️ Riordina)', async () => {
  const n = avvisi.length;
  const r = await lancia('continua');
  assert.equal(r.codice, 0, r.err);
  assert.match(r.out, /niente da fare \(finito, prova\)/);
  assert.equal(avvisi.length, n);
  assert.deepEqual(albero(A), prima);
});

test('«ferma» segna lo stato e il «continua» dopo non riprende', async () => {
  await lancia('ferma');
  const n = avvisi.length;
  await lancia('continua');
  assert.equal(avvisi.length, n); // nessun nuovo avviso dal «continua»
  assert.deepEqual(albero(A), prima);
});

test('«ferma» premuto mentre prepara il piano: non sposta niente', async () => {
  fermaAlRaggruppa = true;
  const r = await lancia('vai');
  fermaAlRaggruppa = false;
  assert.equal(r.codice, 0, r.err);
  assert.deepEqual(albero(A), prima);
  assert.match(r.out, /fermato da Denis prima degli spostamenti/);
  assert.ok(!/comincio a riordinare/.test(avvisi.at(-1)));
  assert.equal(JSON.parse(fs.readFileSync(path.join(drive, '00 · Preparazione/_riordino/stato.json'), 'utf8')).fase, 'fermato');
});

test('«annulla» scavalcato in coda dal giro automatico: lo fa il «continua»', async () => {
  assert.equal((await lancia('vai')).codice, 0);
  assert.notDeepEqual(albero(A), prima);
  // come il bot: fermato + annulla su Drive; il giro «annulla» si perde, arriva il «continua» delle 3 ore
  const f = path.join(drive, '00 · Preparazione/_riordino/stato.json');
  fs.writeFileSync(f, JSON.stringify({ ...JSON.parse(fs.readFileSync(f, 'utf8')), fase: 'fermato', annulla: true }));
  const r = await lancia('continua');
  assert.equal(r.codice, 0, r.err);
  assert.deepEqual(albero(A), prima);
  assert.match(avvisi.at(-1), /rimessi a posto 5 file/);
  const stato = JSON.parse(fs.readFileSync(f, 'utf8'));
  assert.deepEqual([stato.fase, stato.annulla], ['annullato', false]);
  assert.match((await lancia('continua')).out, /niente da fare/); // e non lo rifà
});

test('fine', () => { gemini.close(); bot.close(); fs.rmSync(radice, { recursive: true, force: true }); });

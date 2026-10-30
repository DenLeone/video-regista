// Il percorso guidato di VIDEO.bat: chiede cartella, durata e cosa vuoi, poi analisi → piano (Gemini)
// → anteprima → video intero (4K) → apre la cartella del risultato. Niente da ricordare.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const chiedi = async (d, base = '') => ((await rl.question(d)).trim() || base);
const si = async (d) => /^s/i.test(await chiedi(`${d} (s/n) `, 's'));
const node = (...a) => spawnSync(process.execPath, a, { cwd: ROOT, stdio: 'inherit' }).status === 0;
const titolo = (t) => console.log(`\n==================== ${t} ====================`);

console.log('\n🎬  REGISTA · video YouTube sul PC\n');
let cartella = (await chiedi('1) Trascina qui la cartella del girato e premi Invio:\n> ')).replace(/^["']|["']$/g, '');
while (!fs.existsSync(cartella)) cartella = (await chiedi('   Non la trovo, riprova:\n> ')).replace(/^["']|["']$/g, '');
const nome = path.basename(path.resolve(cartella));
const minuti = await chiedi('2) Quanti minuti deve durare? [15] ', '15');
const brief = await chiedi('3) Cosa vuoi nel video? (es. "vlog di viaggio, gancio sulla SD persa", anche vuoto)\n> ');
const in4k = await si('4) Video finale in 4K?');

titolo('ANALISI (trascrizione sulla 5070 Ti)');
if (!node('pc/analizza.mjs', cartella)) { console.log('❌ Analisi non riuscita: guarda il messaggio qui sopra.'); process.exit(1); }

const filePiano = path.join(ROOT, 'pc', 'progetti', `${nome.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`);
titolo('PIANO DI MONTAGGIO');
let rifai = !fs.existsSync(filePiano) || await si(`C'è già un piano per "${nome}". Lo rifaccio da capo?`);
if (rifai) {
  if (process.env.GEMINI_API_KEY) {
    if (!node('pc/piano.mjs', nome, minuti, brief)) rifai = null;
  } else rifai = null;
  if (rifai === null) {
    console.log(`\nIl piano va fatto a mano: apri gemini.google.com, allega\n  ${path.join(ROOT, 'work', 'pc', nome, 'materiale.md')}\n  ${path.join(ROOT, 'pc', 'progetti', 'austria.json')} (esempio)\ne chiedi il piano di ${minuti} minuti nello stesso formato. Salvalo come\n  ${filePiano}`);
    while (!fs.existsSync(filePiano)) await chiedi('Quando l\'hai salvato premi Invio… ');
  }
}

titolo('ANTEPRIMA (primi 2 minuti)');
const cartellaOut = path.join(ROOT, 'work', 'pc', nome, 'montaggio');
for (;;) {
  if (node('pc/monta.mjs', filePiano, '--fino', '120')) break;
  console.log(`\nCorreggi il piano (si apre in Blocco note) copiando le parole giuste da materiale.md, salva e chiudi.`);
  spawnSync('notepad', [filePiano], { stdio: 'inherit' });
}
spawnSync('explorer', [cartellaOut]);
if (!(await si('\nGuarda "… - ANTEPRIMA.mp4". Monto tutto il video?'))) { console.log('Ok, ti fermi qui. Per rifare: VIDEO.bat'); process.exit(0); }

titolo(`VIDEO INTERO${in4k ? ' IN 4K' : ''}`);
if (node('pc/monta.mjs', filePiano, ...(in4k ? ['--4k'] : []))) {
  console.log(`\n✅ Fatto! In ${cartellaOut}:\n   ${nome}.mp4  → il video\n   ${nome} - DaVinci.fcpxml → DaVinci: File → Importa → Timeline`);
  spawnSync('explorer', [cartellaOut]);
}
rl.close();

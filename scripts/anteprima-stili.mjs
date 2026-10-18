// Rigenera telegram/src/anteprima-stili.ts da grafica/stili-anteprima.jpg (l'immagine che il bot
// mostra quando chiede lo stile). Dopo: cambiare la versione ?v= in ANTEPRIMA_URL del bot.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const b = fs.readFileSync(path.join(ROOT, 'grafica', 'stili-anteprima.jpg')).toString('base64');
fs.writeFileSync(path.join(ROOT, 'telegram', 'src', 'anteprima-stili.ts'),
  `// generato da grafica/stili-anteprima.jpg (un fotogramma per stile), servito su /stili.jpg come anteprima\n// della domanda "Che stile?". Per rigenerarlo: node scripts/anteprima-stili.mjs\nexport const ANTEPRIMA_STILI = '${b}';\n`);
console.log('anteprima-stili.ts aggiornato');

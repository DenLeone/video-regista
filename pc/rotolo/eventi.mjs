// Rotolo: scrive gli eventi sonori (stessi tempi del video) per il mixer.
//   node --experimental-strip-types pc/rotolo/eventi.mjs <beats.json> <eventi.json>
import fs from 'node:fs';
import { impagina, suoniDi } from '../../src/rotolo/impagina.ts';
const [entra, esce] = process.argv.slice(2);
const doc = JSON.parse(fs.readFileSync(entra, 'utf8'));
const { eventi } = impagina(doc);
fs.writeFileSync(esce, JSON.stringify({ durata: doc.durata, letto: { stanza: suoniDi(doc).stanza, musica: suoniDi(doc).musica }, eventi }, null, 1));
console.log(`${eventi.length} eventi → ${esce}`);

// Regia del Collage: legge il parlato di voce.mp4 e decide dove mettere i blocchi di grafica e cosa
// scriverci. I blocchi sono le scene di pc/collage-esempio.json (lo stile: aspetto e tempi interni
// restano quelli). L'AI sceglie solo quale blocco, su quale frase e i testi; il resto lo fa il codice.
//   node pc\collage.mjs <nome> --regia      (rifà scena.json, la vecchia va in scena.prima.json)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chiediAI } from './ai.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const liv = (scene, id) => scene.flatMap((s) => s.livelli).filter((l) => l.id === id);
const corto = (t, n) => String(t ?? '').trim().slice(0, n);
const numeri = (v, d) => (Array.isArray(v) && v.length === 2 && v.every((x) => Number.isFinite(+x)) ? v.map((x) => +x) : d);

// cosa: come lo vede l'AI per sceglierlo. testi: i campi che può scrivere. applica: dove vanno
const BLOCCHI = {
  prompt: {
    scene: ['prompt-ai'],
    cosa: 'apertura/presentazione. Per 10 s copre tutto lo schermo: una parola grande scritta a mano, cielo, un edificio, una barra AI che batte comandi che cambiano la scena. Poi 4,5 s di split screen (grafica sopra, faccia sotto).',
    testi: { titolo: 'la parola grande (max 10 caratteri: il soggetto, una marca)', frasi: '4 comandi brevi battuti nella barra (max 30 caratteri ciascuno), legati a quello che si dice' },
    applica: (sc, v) => {
      for (const l of liv(sc, 'titolo')) if (v.titolo) l.testo = corto(v.titolo, 10);
      for (const l of liv(sc, 'prompt')) (v.frasi || v.frases || v.comandi || []).slice(0, l.frasi.length).forEach((t, i) => { if (t) l.frasi[i].testo = corto(t, 30); });
    },
  },
  industria: {
    scene: ['fabbrica', 'petrolio', 'treno'],
    cosa: 'tre quadri a tutto schermo legati da whip-pan (fabbrica con ingranaggi, pozzo con trivella, treno a vapore). Per: come funziona, com\'è fatto dentro, specifiche tecniche, storia.',
    testi: {},
    applica: () => {},
  },
  virale: {
    scene: ['mano'],
    cosa: 'mano che fa spuntare monumenti, sole, un logo; poi lo schermo si scurisce e sale un contatore di visualizzazioni e like. Per: numeri, successo, popolarità, prezzo, voto.',
    testi: { logo: 'parola del logo (max 10 caratteri)', views: '[da, a]: numeri del contatore grande', like: '[da, a]: numeri del contatore piccolo', formato: 'testo del contatore grande con {n} al posto del numero, max 18 caratteri (es. "{n} views", "{n} mAh")' },
    applica: (sc, v) => {
      for (const l of liv(sc, 'logo')) if (v.logo) l.testo = corto(v.logo, 10);
      for (const l of liv(sc, 'views')) {
        [l.inizio, l.fine] = numeri(v.views, [l.inizio, l.fine]);
        l.lingua = 'it-IT';
        if (typeof v.formato === 'string' && v.formato.includes('{n}')) l.formato = corto(v.formato, 18);
      }
      for (const l of liv(sc, 'like')) { [l.inizio, l.fine] = numeri(v.like, [l.inizio, l.fine]); l.lingua = 'it-IT'; }
    },
  },
  storyboard: {
    scene: ['storyboard'],
    cosa: 'finestra in alto (faccia sotto): zoom veloce su una griglia di tavole disegnate e panoramica. Per: elenco, panoramica, confronto, "ecco tutto quello che c\'è".',
    testi: {},
    applica: () => {},
  },
  samurai: {
    scene: ['samurai-volto', 'samurai-ponte', 'samurai-fronte', 'samurai-attacco'],
    cosa: 'finestra in alto (faccia sotto): quattro stacchi di un duello a ritagli, chiude con un motto scritto su carta. Per: verdetto, frase forte, il punto chiave.',
    testi: { motto: 'il motto, 2-4 parole MAIUSCOLE su 2-3 righe separate da \\n (es. "PROMOSSO\\nA PIENI\\nVOTI.")' },
    applica: (sc, v) => { for (const l of liv(sc, 'motto')) if (v.motto) l.testo = corto(v.motto, 40).replace(/\\n/g, '\n'); },
  },
  finale: {
    scene: ['finale'],
    cosa: 'chiusura a tutto schermo: sole, mano, monumenti e il logo che si scrive. Va negli ultimi secondi.',
    testi: { logo: 'parola del logo (max 10 caratteri)' },
    applica: (sc, v) => { for (const l of liv(sc, 'logo')) if (v.logo) l.testo = corto(v.logo, 10); },
  },
};

// frasi dalle parole di whisper: si va a capo sulla punteggiatura o su una pausa
function frasi(parole) {
  const out = [];
  let cur = [];
  parole.forEach((p, i) => {
    cur.push(p);
    const pausa = (parole[i + 1]?.s ?? Infinity) - p.e;
    // whisper mette pochi punti: anche le virgole dopo 6 parole e mai oltre 14, così i blocchi hanno
    // più punti d'attacco
    if (/[.?!]$/.test(p.w.trim()) || (/,$/.test(p.w.trim()) && cur.length >= 6) || pausa > 0.7 || cur.length >= 14) {
      out.push({ s: cur[0].s, e: cur[cur.length - 1].e, testo: cur.map((x) => x.w.trim()).join(' ') });
      cur = [];
    }
  });
  return out;
}

function trascrivi(dir, video) {
  const out = path.join(dir, 'trascrizione.json');
  if (fs.existsSync(out) && fs.statSync(out).mtimeMs > fs.statSync(path.join(dir, video)).mtimeMs) return JSON.parse(fs.readFileSync(out, 'utf8'));
  const py = process.platform === 'win32' ? path.join(ROOT, '.venv', 'Scripts', 'python.exe') : path.join(ROOT, '.venv', 'bin', 'python');
  console.log('trascrivo il parlato (whisper)…');
  const r = spawnSync(py, [path.join(ROOT, 'pc', 'trascrivi.py'), path.join(dir, video), out], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('trascrizione fallita');
  return JSON.parse(fs.readFileSync(out, 'utf8'));
}

const durataBlocco = (scene) => Math.max(...scene.map((s) => s.a)) - Math.min(...scene.map((s) => s.da));

export async function regia(dir) {
  const stile = JSON.parse(fs.readFileSync(path.join(ROOT, 'pc', 'collage-esempio.json'), 'utf8'));
  const video = stile.base.video;
  if (!fs.existsSync(path.join(dir, video))) throw new Error(`manca ${video} nella cartella: la regia segue il parlato`);
  const durata = parseFloat(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path.join(dir, video)], { encoding: 'utf8' }).stdout);
  const elenco = frasi(trascrivi(dir, video));
  if (!elenco.length) throw new Error('nel video non c\'è parlato');

  const blocchi = Object.fromEntries(Object.entries(BLOCCHI).map(([k, b]) => {
    const scene = b.scene.map((id) => stile.scene.find((s) => s.id === id));
    if (scene.some((s) => !s)) throw new Error(`blocco ${k}: scena mancante in collage-esempio.json`);
    return [k, { ...b, sceneStile: scene, durata: durataBlocco(scene) }];
  }));

  const prompt = `Sei il regista di un video verticale di Denis (creator tech italiano). Sopra il suo parlato vanno dei blocchi di motion graphic a ritagli di carta. Scegli dove metterli e scrivi i loro testi in italiano.

Durata del video: ${durata.toFixed(1)} s.

Frasi (indice, inizio-fine in secondi, testo):
${elenco.map((f, i) => `${i}. [${f.s.toFixed(1)}-${f.e.toFixed(1)}] ${f.testo}`).join('\n')}

Blocchi disponibili (durata fissa):
${Object.entries(blocchi).map(([k, b]) => `- ${k} (${b.durata.toFixed(1)} s): ${b.cosa}${Object.keys(b.testi).length ? `\n  testi: ${Object.entries(b.testi).map(([t, d]) => `${t} = ${d}`).join('; ')}` : ''}`).join('\n')}

Regole:
- Ogni blocco al massimo una volta; non serve usarli tutti. Un blocco parte all'inizio di una frase (indice "frase") e deve finire prima di ${durata.toFixed(1)} s.
- I blocchi non si sovrappongono e tra uno e l'altro restano almeno 3 s di faccia: è un video parlato, la faccia deve vedersi.
- Mettili dove il blocco illustra quello che si dice in quel momento. "finale" solo se finisce negli ultimi 2 s del video.
- I testi parlano del soggetto del video (prodotto, marca, numeri detti nel parlato), non inventare numeri che non dice.

Rispondi solo con JSON:
{"blocchi":[{"blocco":"<nome>","frase":<indice>,"perche":"<una riga>", ...testi del blocco}]}`;

  const risposta = await chiediAI(prompt, { json: true });
  if (!risposta) throw new Error('nessuna AI disponibile (Ollama spento e GEMINI_API_KEY assente)');
  const scelta = JSON.parse(risposta.replace(/^```(json)?|```$/g, ''));
  fs.writeFileSync(path.join(dir, 'regia.json'), JSON.stringify({ frasi: elenco, scelta }, null, 2));

  // controlli: blocchi veri e una volta sola. L'AI spesso sovrappone i blocchi o sfora la fine: invece
  // di scartarli si spostano alla prima frase libera (3 s di faccia in mezzo); il finale chiude il video
  // a filo della fine. Scartato solo quello che non ci sta più
  const STACCO = 3;
  // a volte l'AI risponde con l'elenco nudo invece di {"blocchi": [...]}
  const proposti = (Array.isArray(scelta) ? scelta : scelta.blocchi || []).filter((b, i, tutti) => {
    const ok = blocchi[b.blocco] && elenco[b.frase] && tutti.findIndex((x) => x.blocco === b.blocco) === i;
    if (!ok) console.log(`  scarto ${b.blocco} (frase ${b.frase}): blocco o frase sbagliati, o ripetuto`);
    return ok;
  });
  const piano = [];
  const fin = proposti.find((b) => b.blocco === 'finale');
  const limite = fin ? durata - blocchi.finale.durata : durata;
  for (const b of proposti.filter((x) => x !== fin).sort((x, y) => elenco[x.frase].s - elenco[y.frase].s)) {
    const def = blocchi[b.blocco];
    const libero = piano.length ? piano[piano.length - 1].fine + STACCO : 0;
    const k = elenco.findIndex((f, i) => i >= b.frase && f.s >= libero && f.s + def.durata <= limite - (fin ? STACCO : 0));
    if (k < 0) { console.log(`  scarto ${b.blocco}: dopo la frase ${b.frase} non c'è più posto`); continue; }
    if (k !== b.frase) console.log(`  sposto ${b.blocco} dalla frase ${b.frase} alla ${k}`);
    piano.push({ ...b, frase: k, inizio: elenco[k].s, fine: elenco[k].s + def.durata, def });
  }
  if (fin && (!piano.length || limite >= piano[piano.length - 1].fine + STACCO)) {
    piano.push({ ...fin, inizio: limite, fine: durata, def: blocchi.finale, frase: Math.max(0, elenco.findIndex((f) => f.e > limite)) });
  }

  const scene = piano.flatMap((b) => {
    const copia = JSON.parse(JSON.stringify(b.def.sceneStile));
    const scarto = b.inizio - Math.min(...copia.map((s) => s.da));
    for (const s of copia) { s.da = +(s.da + scarto).toFixed(3); s.a = +(s.a + scarto).toFixed(3); s.nota = `${b.blocco}: ${b.perche || ''}`.trim(); }
    b.def.applica(copia, b);
    return copia;
  });

  const file = path.join(dir, 'scena.json');
  if (fs.existsSync(file)) fs.copyFileSync(file, path.join(dir, 'scena.prima.json'));
  const { scene: _, ...resto } = stile;
  fs.writeFileSync(file, JSON.stringify({ ...resto, scene }, null, 2));
  console.log('regia:');
  for (const b of piano) console.log(`  ${b.inizio.toFixed(1).padStart(5)}-${b.fine.toFixed(1).padStart(5)} s  ${b.blocco.padEnd(10)} «${elenco[b.frase].testo.slice(0, 60)}»`);
}

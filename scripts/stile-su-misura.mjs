// Stili "su misura": Denis li crea da Drive senza codice. Ogni stile è una cartella in
// "03 · Social — Risorse/Stili/<Nome>/" con:
//   stile.txt   righe "Chiave: valore" (vedi MODELLO qui sotto; quello che non è grafica va all'AI)
//   asset/      font (.ttf .otf .woff .woff2), musica (.mp3 .m4a .wav), LUT creativa (.cube)
//   esempi/     video di riferimento (non usati dal montaggio)
// Il render usa la composizione SuMisura (src/SuMisura.tsx) con la grafica letta da qui.

/** @typedef {import('../src/piano').GraficaStile} GraficaStile */

export const MODELLO = `STILE SU MISURA — compila i campi e salva. Le righe con # sono note.
Per usarlo: "Stile: <nome della cartella>" nel brief, oppure scegli lo stile dal bot.

Nome: (nome dello stile)
Quando usarlo: (argomenti, tipo di video)
Tono: (es. intimo, ironico, tecnico)

# --- SCRITTE ---
# Font: un nome di Google Fonts (fonts.google.com) con il peso, es. "EB Garamond 600" (senza peso = normale),
# oppure il nome di un file di font messo in asset/ (es. "MioFont" per asset/MioFont.otf)
Apertura: normale             # normale | grande (prima frase a lettere enormi, parola per parola)
Font apertura: Inter Tight 800
Colore apertura: #FFD86B
Sottotitoli: frase            # frase (2–5 parole) | parola (una alla volta) | nessuno
Font sottotitoli: Montserrat 700
Colore sottotitoli: #FFFFFF
Maiuscolo sottotitoli: no     # sì | no
Posizione sottotitoli: basso  # alto | centro | basso
Dimensione sottotitoli: 56    # in pixel su 1080 di larghezza (40–90)
Titoli: sì                    # sì = 3–5 titoli (nome prodotto, dati) | frasi = 3–5 frasi forti a due livelli (corsivo piccolo + parole enormi) | no
Font titoli: Montserrat 900
Font corsivo: Playfair Display Italic 400   # la frase piccola delle scritte a due livelli
Scritte dietro di me: no      # sì = le scritte grandi passano dietro alla persona (ritaglio automatico)
Colore titoli: #FFFFFF
Colore accento: #FFE62E       # sottotitolo dei titoli
Posizione titoli: alto        # alto | centro | basso

# --- IMMAGINE ---
Look: naturale                # naturale | caldo | freddo | bianco e nero | teal e arancio (spot notturno: neri profondi, sfondi petrolio, pelle calda)
Soggetto in risalto: no       # sì = tu luminoso e nitido, sfondo più buio e freddo (ritaglio automatico della persona)
Sfondo sfocato: no            # sì = con il soggetto in risalto, lo sfondo si sfoca anche (finto diaframma aperto)
Bianco e nero: no             # no | momenti (l'AI mette in b/n i momenti di racconto) | sempre
Vignettatura: 20              # 0–100
Inizio: normale               # normale | prima e dopo (si parte dall'immagine piatta, come girata, che si colora)
Chiusura: no                  # no | il tuo nome Instagram (es. @_black_den): finale scurito con logo e nome

# --- AUDIO ---
Effetti sonori: sì            # sì | no
Musica: no                    # sì = un brano a caso tra quelli in asset/ (o il nome del file)
Volume musica: 12             # 0–100, sotto la voce

# --- REGIA (indicazioni per l'AI, scrivi liberamente) ---
Ritmo dei tagli:
Inquadrature:
Apertura e chiusura:
Cose da evitare:
Altro:
`;

const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const si = (v) => /^(si|sì|yes|true|1|on)\b/i.test(norm(v));
const colore = (v, base) => (/^#?[0-9a-f]{6}$/i.test(String(v || '').trim()) ? `#${String(v).trim().replace(/^#/, '').toUpperCase()}` : base);
const numero = (v, base, min, max) => { const n = Number(String(v || '').replace(',', '.').match(/-?\d+(\.\d+)?/)?.[0]); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : base; };
const posizione = (v, base) => (['alto', 'centro', 'basso'].find((p) => norm(v).startsWith(p)) || base);
const PESI = { thin: 100, light: 300, regular: 400, normal: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800, black: 900 };
/** "EB Garamond 600" / "Inter Tight Black" / "Playfair Display Italic 400" → { famiglia, peso, corsivo } */
export function font(v, base) {
  let t = String(v || '').trim();
  if (!t) return base;
  let peso = 400; // senza peso scritto: normale (molti font da titolo, come Anton, hanno solo quello)
  let corsivo = false;
  const c = /\s+(italic|corsivo)\b/i.exec(t);
  if (c) { corsivo = true; t = (t.slice(0, c.index) + t.slice(c.index + c[0].length)).trim(); }
  const m = /\s+(\d{3})$/.exec(t) || /\s+(thin|light|regular|normal|medium|semibold|bold|extrabold|black)$/i.exec(t);
  if (m) { peso = /^\d+$/.test(m[1]) ? Number(m[1]) : PESI[m[1].toLowerCase()]; t = t.slice(0, m.index).trim(); }
  return corsivo ? { famiglia: t, peso, corsivo } : { famiglia: t, peso };
}

/** @type {GraficaStile} */
export const BASE = {
  nome: 'Su misura',
  apertura: 'normale', fontApertura: { famiglia: 'Inter Tight', peso: 800 }, coloreApertura: '#FFD86B',
  sottotitoli: 'frase', fontSottotitoli: { famiglia: 'Montserrat', peso: 700 }, coloreSottotitoli: '#FFFFFF',
  maiuscolo: false, posizione: 'basso', dimensione: 56,
  titoli: true, fontTitoli: { famiglia: 'Montserrat', peso: 900 }, coloreTitoli: '#FFFFFF', accento: '#FFE62E', posTitoli: 'alto',
  tipoTitoli: 'titoli', fontCorsivo: { famiglia: 'Playfair Display', peso: 400, corsivo: true }, dietro: false,
  look: 'naturale', biancoNero: 'no', vignetta: 0.2, sfx: true, musica: null, risalto: false, rivela: false,
};

// campi che decidono la grafica; tutto il resto va all'AI come indicazione di regia
const GRAFICA = ['nome', 'apertura', 'font apertura', 'colore apertura', 'sottotitoli', 'font sottotitoli', 'colore sottotitoli',
  'maiuscolo sottotitoli', 'posizione sottotitoli', 'dimensione sottotitoli', 'titoli', 'font titoli', 'colore titoli',
  'colore accento', 'posizione titoli', 'look', 'bianco e nero', 'vignettatura', 'effetti sonori', 'musica', 'volume musica',
  'font corsivo', 'scritte dietro di me', 'soggetto in risalto', 'sfondo sfocato', 'inizio', 'chiusura'];

/** stile.txt → { grafica, testoAI, musica, campi } */
export function leggiStile(testo, nomeCartella) {
  const campi = {};
  const perAI = [];
  let continua = false; // una riga senza "Chiave:" prosegue il campo di regia sopra
  for (const riga of String(testo || '').split(/\r?\n/)) {
    if (/^\s*#/.test(riga)) continue;
    const m = /^\s*([^:\d][^:]{1,39}):\s*(.*)$/.exec(riga);
    if (!m) {
      if (continua && riga.trim()) perAI[perAI.length - 1] += ` ${riga.trim()}`;
      else continua = false;
      continue;
    }
    const chiave = norm(m[1]);
    const valore = m[2].replace(/\s+#.*$/, '').replace(/\s*\([^)]*\)\s*$/, '').trim();
    continua = false;
    if (GRAFICA.includes(chiave)) campi[chiave] = valore;
    else if (valore && !/^per usarlo$/.test(chiave)) { perAI.push(`${m[1].trim()}: ${valore}`); continua = true; }
  }
  const g = structuredClone(BASE);
  g.nome = campi.nome || nomeCartella || BASE.nome;
  if (campi.apertura) g.apertura = /grand/.test(norm(campi.apertura)) ? 'grande' : 'normale';
  g.fontApertura = font(campi['font apertura'], g.fontApertura);
  g.coloreApertura = colore(campi['colore apertura'], g.coloreApertura);
  if (campi.sottotitoli) g.sottotitoli = /parol/.test(norm(campi.sottotitoli)) ? 'parola' : /^(no|nessun)/.test(norm(campi.sottotitoli)) ? 'nessuno' : 'frase';
  g.fontSottotitoli = font(campi['font sottotitoli'], g.fontSottotitoli);
  g.coloreSottotitoli = colore(campi['colore sottotitoli'], g.coloreSottotitoli);
  if (campi['maiuscolo sottotitoli']) g.maiuscolo = si(campi['maiuscolo sottotitoli']);
  g.posizione = posizione(campi['posizione sottotitoli'], g.posizione);
  g.dimensione = numero(campi['dimensione sottotitoli'], g.dimensione, 30, 120);
  if (campi.titoli) {
    g.tipoTitoli = /fras|scritt/.test(norm(campi.titoli)) ? 'frasi' : 'titoli';
    g.titoli = g.tipoTitoli === 'frasi' || si(campi.titoli);
  }
  g.fontCorsivo = font(campi['font corsivo'], g.fontCorsivo);
  if (campi['scritte dietro di me']) g.dietro = si(campi['scritte dietro di me']);
  g.fontTitoli = font(campi['font titoli'], g.fontTitoli);
  g.coloreTitoli = colore(campi['colore titoli'], g.coloreTitoli);
  g.accento = colore(campi['colore accento'], g.accento);
  g.posTitoli = posizione(campi['posizione titoli'], g.posTitoli);
  const look = norm(campi.look);
  if (look) g.look = /teal|petrol|arancio/.test(look) ? 'teal' : /cald/.test(look) ? 'caldo' : /fredd/.test(look) ? 'freddo' : /bianco|b\/n|bn/.test(look) ? 'bianco e nero' : 'naturale';
  if (campi['soggetto in risalto']) g.risalto = si(campi['soggetto in risalto']);
  if (campi['sfondo sfocato']) g.sfoca = si(campi['sfondo sfocato']);
  if (campi.inizio) g.rivela = /prima|dopo|rivel/.test(norm(campi.inizio));
  const chiusura = (/@[\w.]+/.exec(campi.chiusura || '') || [])[0];
  if (chiusura) g.chiusura = chiusura;
  const bn = norm(campi['bianco e nero']);
  if (bn) g.biancoNero = /sempre|tutto/.test(bn) ? 'sempre' : /^no/.test(bn) ? 'no' : 'momenti';
  if (g.biancoNero === 'sempre') g.look = 'bianco e nero';
  g.vignetta = numero(campi.vignettatura, g.vignetta * 100, 0, 100) / 100;
  if (campi['effetti sonori']) g.sfx = si(campi['effetti sonori']);
  // musica: "sì" = a caso tra i brani in asset, altrimenti il nome del file da usare
  const musica = campi.musica && !/^no\b/.test(norm(campi.musica)) ? (si(campi.musica) ? '*' : campi.musica) : null;
  const volumeMusica = numero(campi['volume musica'], 12, 0, 100) / 100;
  return { grafica: g, testoAI: perAI.join('\n'), musica, volumeMusica };
}

// istruzioni di grafica per l'AI (sezione {{GRAFICA}} del prompt) per uno stile su misura
export function promptSuMisura(g, testoAI) {
  const righe = [`## Grafica: stile «${g.nome}» (su misura)`];
  righe.push(`- Le scritte delle parole dette (${g.apertura === 'grande' ? 'scritta d\'apertura e ' : ''}sottotitoli) le mette lo script da solo: non scriverle.`);
  if (g.apertura === 'grande') {
    righe.push('- **Apertura a lettere enormi**: la prima frase del montaggio (le prime 1–2 frasi, al massimo ~5 s) diventa una scritta a due livelli, parola per parola: le parole chiave enormi, le altre piccole in corsivo. Scegli come apertura un aggancio forte e breve, che si capisce da solo, con Denis in camera.',
      '- `enfasi` (campo in cima alla regia, accanto a `titolo`): 2–4 parole dell\'apertura da fare enormi, esattamente come le dice (es. `["STANCO", "MEZZ\'ORA"]`): i concetti, non articoli o verbi di servizio.');
  }
  if (g.dietro) righe.push('- Le scritte grandi passano dietro a Denis (ritaglio automatico): mettile su inquadrature dove lui è in campo, a figura intera o mezzo busto.');
  if (g.titoli && g.tipoTitoli === 'frasi') {
    righe.push('- `keywords` = le FRASI FORTI: 3–5 momenti del video (dopo l\'apertura) in cui Denis dice qualcosa di forte (una promessa, un numero, una svolta del racconto, la chiusura). Ognuna ancorata alla frase in cui la dice (`frase`, `ritardo` 0–1 s), `dur` 2–3,5 s, a distanza di almeno 6 s una dall\'altra.',
      '  - Sono le SUE parole, prese dalla frase: `tag` = la parte piccola che introduce (in corsivo, 2–6 parole, es. "e la cosa che mi ha"), `word` = 1–3 parole chiave enormi (es. "STUPITO", "45 EURO"), `note` = coda piccola facoltativa (es. "più di tutto"). Mai inventare parole che non dice.',
      '  - L\'ultima può chiudere il video sulla frase finale, con `"fino_alla_fine": true`.');
  } else if (g.titoli) {
    righe.push('- `keywords` = i TITOLI: 3–5 in tutto, mai la trascrizione. Ognuno ancorato a una frase usata (`frase`, `ritardo` 0–1 s; senza parlato `elemento`), `dur` 2–3,5 s.',
      '  - `word`: nome del prodotto o un dato brevissimo (max ~16 caratteri); `tag`: etichetta piccola sopra (marca o categoria, facoltativa); `note`: sottotitolo sotto, 1–4 parole (senza "// ").',
      '  - Il primo titolo è il prodotto o il tema; poi i numeri e le specifiche che Denis dice; l\'esito solo se c\'è un giudizio (vedi "L\'esito"), con `"fino_alla_fine": true`.');
  } else righe.push('- `keywords`: [] (questo stile non ha titoli; nemmeno l\'esito).');
  if (g.biancoNero === 'momenti') righe.push('- **Bianco e nero**: metti `"bn": true` sugli elementi della sequenza che raccontano (ricordi, riflessioni, B-roll d\'atmosfera), circa un terzo; il volto che parla al presente e il prodotto restano a colori.');
  righe.push('- `flickers`: []. `tavola`: "". `soggetto`: nome breve del prodotto o del tema. `sponsor`: null (se il brief cita uno sponsor, mettilo come titolo, se lo stile ha i titoli).');
  if (testoAI.trim()) righe.push('', `### Indicazioni di Denis per questo stile (stile.txt)`, ...testoAI.trim().split('\n').map((r) => `- ${r}`),
    '(Queste indicazioni valgono più delle regole generali sulle inquadrature, ma non di quelle sul racconto.)');
  return righe.join('\n');
}

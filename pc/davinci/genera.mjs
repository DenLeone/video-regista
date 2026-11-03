// Genera i Titoli Fusion di Lista UI (pc/davinci/*.setting): ogni contenitore con i pezzi separati
// (riquadri, cerchi, testi) modificabili e animabili in DaVinci. Misure in px su 1080×1920 dall'alto a
// sinistra, come in src/ListaUI.tsx; qui si convertono nelle coordinate di Fusion (0–1, y dal basso).
// "Lista UI - Capitolo.setting" è fatto a mano ed è stato provato da Denis (03/11): questo lo lascia stare.
//   node pc/davinci/genera.mjs
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const W = 1080, H = 1920;
const FONT = 'Segoe UI';
const hex = (c) => [1, 3, 5].map((i) => +(parseInt(c.slice(i, i + 2), 16) / 255).toFixed(3));
const NERO = '#111111', GRIGIO = '#8E8E93', BLU = '#4AA8F0', BIANCO = '#FFFFFF', CHIARO = '#F2F2F4', VUOTO = '#E6E1D8';
const lua = (s) => JSON.stringify(s); // stringa tra virgolette, con \n

function contenitore(nome, pezzi, esposti) {
  const tools = [];
  const nomi = new Set();
  const uno = (base) => { let n = base, k = 2; while (nomi.has(n)) n = `${base}${k++}`; nomi.add(n); return n; };
  let ultimo = null;
  let x = 0;
  const unisci = (strato) => {
    if (!ultimo) { ultimo = strato; return; }
    const m = uno('Unisci');
    tools.push(`${m} = Merge { Inputs = { Background = Input { SourceOp = "${ultimo}", Source = "Output" }, Foreground = Input { SourceOp = "${strato}", Source = "Output" }, PerformDepthMerge = Input { Value = 0 } }, ViewInfo = OperatorInfo { Pos = { ${x += 110}, 0 } } }`);
    ultimo = m;
  };
  const mappa = {};
  for (const p of pezzi) {
    const n = uno(p.nome);
    mappa[p.nome] = n;
    if (p.tipo === 'testo') {
      const [r, g, b] = hex(p.colore || NERO);
      const allinea = p.allinea === 'sinistra' ? -1 : p.allinea === 'destra' ? 1 : 0;
      tools.push(`${n} = TextPlus { Inputs = { GlobalOut = Input { Value = 0 }, Width = Input { Value = ${W} }, Height = Input { Value = ${H} }, UseFrameFormatSettings = Input { Value = 1 },
        StyledText = Input { Value = ${lua(p.testo)} }, Font = Input { Value = "${p.font || FONT}" }, Style = Input { Value = "${p.stile || 'Semibold'}" },
        Size = Input { Value = ${+(p.px / 1390).toFixed(4)} }, Center = Input { Value = { ${+(p.x / W).toFixed(4)}, ${+(1 - p.y / H).toFixed(4)} } },
        HorizontalLeftCenterRight = Input { Value = ${allinea} },
        Red1 = Input { Value = ${r} }, Green1 = Input { Value = ${g} }, Blue1 = Input { Value = ${b} } }, ViewInfo = OperatorInfo { Pos = { ${x}, 80 } } }`);
    } else {
      // riquadro arrotondato o cerchio: un Background colorato con la maschera della forma
      const m = uno(`Maschera${p.nome}`);
      const cx = (p.x + p.w / 2) / W, cy = 1 - (p.y + p.h / 2) / H;
      const forma = p.tipo === 'cerchio' ? 'EllipseMask' : 'RectangleMask';
      const raggio = p.tipo === 'cerchio' ? '' : `CornerRadius = Input { Value = ${+Math.min(1, (p.r || 0) / (Math.min(p.w, p.h) / 2)).toFixed(3)} },`;
      tools.push(`${m} = ${forma} { Inputs = { Filter = Input { Value = FuID { "Fast Gaussian" } }, MaskWidth = Input { Value = ${W} }, MaskHeight = Input { Value = ${H} }, PixelAspect = Input { Value = { 1, 1 } },
        UseFrameFormatSettings = Input { Value = 1 }, ClippingMode = Input { Value = FuID { "None" } }, ${p.morbido ? `SoftEdge = Input { Value = ${p.morbido} },` : ''}
        Center = Input { Value = { ${+cx.toFixed(4)}, ${+cy.toFixed(4)} } }, Width = Input { Value = ${+(p.w / W).toFixed(4)} }, Height = Input { Value = ${+(p.h / W).toFixed(4)} }, ${raggio} }, ViewInfo = OperatorInfo { Pos = { ${x}, -80 } } }`);
      const [r, g, b] = hex(p.colore);
      tools.push(`${n} = Background { Inputs = { EffectMask = Input { SourceOp = "${m}", Source = "Mask" }, GlobalOut = Input { Value = 0 }, Width = Input { Value = ${W} }, Height = Input { Value = ${H} }, UseFrameFormatSettings = Input { Value = 1 },
        TopLeftRed = Input { Value = ${r} }, TopLeftGreen = Input { Value = ${g} }, TopLeftBlue = Input { Value = ${b} }, TopLeftAlpha = Input { Value = ${p.alfa ?? 1} } }, ViewInfo = OperatorInfo { Pos = { ${x}, -40 } } }`);
      mappa[`Maschera${p.nome}`] = m;
    }
    unisci(n);
  }
  // controlli nell'Inspector: i testi, le posizioni dei testi e il colore principale
  const ingressi = esposti.map(([pezzo, sorgente, etichetta], i) => {
    const op = mappa[pezzo];
    if (!op) throw new Error(`${nome}: pezzo ${pezzo} inesistente`);
    return `I${i} = InstanceInput { SourceOp = "${op}", Source = "${sorgente}", Name = ${lua(etichetta)} },`;
  });
  const id = `ListaUI_${nome.replace(/\W+/g, '')}`;
  return `{
	Tools = ordered() {
		${id} = MacroOperator {
			CtrlWZoom = false,
			NameSet = true,
			Inputs = ordered() {
				${ingressi.join('\n\t\t\t\t')}
			},
			Outputs = { MainOutput1 = InstanceOutput { SourceOp = "${ultimo}", Source = "Output" } },
			ViewInfo = GroupInfo { Pos = { 0, 0 } },
			Tools = ordered() {
				${tools.join(',\n\t\t\t\t')}
			},
		},
	},
	ActiveTool = "${id}"
}
`;
}

// ombra morbida sotto le schede, come nel video
const ombra = (x, y, w, h, r) => ({ nome: 'Ombra', tipo: 'riquadro', x: x + 4, y: y + 14, w, h, r, colore: '#000000', alfa: 0.12, morbido: 0.02 });
const testo = (nome, t, x, y, px, extra = {}) => ({ nome, tipo: 'testo', testo: t, x, y, px, ...extra });
const riquadro = (nome, x, y, w, h, r, colore, extra = {}) => ({ nome, tipo: 'riquadro', x, y, w, h, r, colore, ...extra });
const cerchio = (nome, x, y, d, colore) => ({ nome, tipo: 'cerchio', x, y, w: d, h: d, colore });
const griglia = (x0, y0, colonne, righe, w, h, gap, r = 0) => {
  const out = [];
  for (let j = 0; j < righe; j++) for (let i = 0; i < colonne; i++) out.push(riquadro(`Riquadro${j * colonne + i + 1}`, x0 + i * (w + gap), y0 + j * (h + gap), w, h, r, [VUOTO, '#D9D3C8', '#EDE8DF'][(i + j) % 3]));
  return out;
};

const CONTENITORI = {
  Chat: [
    [ombra(90, 795, 900, 330, 32), riquadro('Scheda', 90, 795, 900, 330, 32, BIANCO),
      testo('Etichetta', 'ChatGPT', 126, 850, 30, { colore: GRIGIO, allinea: 'sinistra' }),
      testo('Messaggio', 'Montami i miei clip migliori\nnella griglia del profilo', 126, 940, 46, { stile: 'Regular', allinea: 'sinistra' }),
      cerchio('Pulsante', 896, 1031, 64, NERO), testo('Freccia', '↑', 928, 1070, 40, { colore: BIANCO, stile: 'Bold' })],
    [['Etichetta', 'StyledText', 'Etichetta'], ['Messaggio', 'StyledText', 'Messaggio'], ['Messaggio', 'Size', 'Grandezza messaggio'], ['MascheraScheda', 'Center', 'Posizione scheda'], ['Messaggio', 'Center', 'Posizione messaggio']],
  ],
  App: [
    [ombra(90, 560, 900, 760, 30), riquadro('Scheda', 90, 560, 900, 760, 30, BIANCO),
      testo('Nome', 'Suno', 134, 650, 80, { stile: 'Bold', allinea: 'sinistra' }),
      testo('Etichetta', 'PROMPT', 134, 725, 24, { colore: GRIGIO, stile: 'Bold', allinea: 'sinistra' }),
      riquadro('Campo', 134, 755, 812, 210, 16, CHIARO),
      testo('Prompt', 'Beat lo-fi allegro per un reel tech,\n118 bpm, senza voce', 160, 830, 34, { stile: 'Regular', allinea: 'sinistra' }),
      riquadro('Pulsante', 134, 995, 812, 80, 14, NERO), testo('TestoPulsante', 'Genera', 540, 1045, 32, { colore: BIANCO, stile: 'Bold' }),
      cerchio('Play1', 134, 1110, 56, BLU), testo('Simbolo1', '▶', 162, 1146, 24, { colore: BIANCO }),
      riquadro('Onda1', 210, 1124, 736, 28, 6, '#B9D8F2'),
      cerchio('Play2', 134, 1190, 56, BLU), testo('Simbolo2', '▶', 162, 1226, 24, { colore: BIANCO }),
      riquadro('Onda2', 210, 1204, 736, 28, 6, '#B9D8F2')],
    [['Nome', 'StyledText', 'Nome app'], ['Prompt', 'StyledText', 'Prompt'], ['TestoPulsante', 'StyledText', 'Pulsante'], ['Pulsante', 'TopLeftRed', 'Pulsante rosso (0–1)'], ['Pulsante', 'TopLeftGreen', 'Pulsante verde'], ['Pulsante', 'TopLeftBlue', 'Pulsante blu']],
  ],
  Finestra: [
    [ombra(50, 370, 980, 1180, 26), riquadro('Finestra', 50, 370, 980, 1180, 26, BIANCO),
      cerchio('Rosso', 76, 396, 20, '#FF5F57'), cerchio('Giallo', 106, 396, 20, '#FEBC2E'), cerchio('Verde', 136, 396, 20, '#28C840'),
      testo('Titolo', 'workspace', 540, 415, 28, { colore: GRIGIO }),
      riquadro('Linea', 50, 440, 980, 2, 0, '#ECECEC'), riquadro('Colonna', 350, 442, 2, 1108, 0, '#ECECEC'),
      ...['progetti', 'riferimenti', 'musica', 'grafica', 'idee'].flatMap((v, i) => [
        riquadro(`Icona${i + 1}`, 76, 476 + i * 52, 30, 22, 4, BLU), testo(`Voce${i + 1}`, v, 122, 497 + i * 52, 28, { stile: 'Regular', allinea: 'sinistra' })]),
      ...griglia(376, 466, 3, 3, 196, 290, 14, 12)],
    [['Titolo', 'StyledText', 'Titolo finestra'], ...[1, 2, 3, 4, 5].map((i) => [`Voce${i}`, 'StyledText', `Cartella ${i}`]), ['MascheraFinestra', 'Center', 'Posizione finestra']],
  ],
  Griglia: [
    [riquadro('Telefono', 110, 180, 860, 1560, 60, NERO), riquadro('Schermo', 124, 194, 832, 1532, 48, BIANCO),
      testo('Ora', '9:41', 190, 250, 30, { stile: 'Bold', allinea: 'sinistra' }),
      testo('Utente', '@_black_den', 160, 330, 40, { stile: 'Bold', allinea: 'sinistra' }),
      riquadro('Segui', 770, 298, 150, 52, 10, BLU), testo('TestoSegui', 'Segui', 845, 333, 28, { colore: BIANCO, stile: 'Bold' }),
      ...griglia(124, 380, 3, 4, 274, 330, 5)],
    [['Utente', 'StyledText', 'Nome utente'], ['TestoSegui', 'StyledText', 'Pulsante'], ['Ora', 'StyledText', 'Ora']],
  ],
  'Pillola capitolo': [
    [ombra(250, 170, 580, 116, 28), riquadro('Pillola', 250, 170, 580, 116, 28, BIANCO, { alfa: 0.96 }),
      riquadro('Linguetta', 282, 196, 32, 14, 4, '#3E9BE0'), riquadro('Cartella', 282, 204, 76, 54, 8, BLU),
      testo('Numero', 'No.2', 384, 215, 24, { colore: GRIGIO, allinea: 'sinistra' }),
      testo('Titolo', 'Musica', 384, 262, 44, { stile: 'Bold', allinea: 'sinistra' })],
    [['Numero', 'StyledText', 'Numero'], ['Titolo', 'StyledText', 'Titolo'], ['MascheraPillola', 'Center', 'Posizione pillola']],
  ],
  'Pillola musica': [
    [ombra(220, 170, 640, 116, 28), riquadro('Pillola', 220, 170, 640, 116, 28, BIANCO, { alfa: 0.96 }),
      cerchio('Play', 252, 197, 62, BLU), testo('Simbolo', '▶', 283, 238, 28, { colore: BIANCO }),
      testo('Brano', 'Pixel Bloom', 340, 228, 42, { stile: 'Bold', allinea: 'sinistra' }),
      testo('Sotto', 'Suno · 118 bpm', 340, 266, 24, { colore: GRIGIO, stile: 'Regular', allinea: 'sinistra' }),
      ...[0, 1, 2, 3, 4].map((j) => riquadro(`Barra${j + 1}`, 770 + j * 13, 250 - [26, 40, 18, 34, 22][j], 7, [26, 40, 18, 34, 22][j], 3, BLU))],
    [['Brano', 'StyledText', 'Brano'], ['Sotto', 'StyledText', 'Sotto'], ['MascheraPillola', 'Center', 'Posizione pillola']],
  ],
};

for (const [nome, [pezzi, esposti]] of Object.entries(CONTENITORI)) {
  const file = path.join(DIR, `Lista UI - ${nome}.setting`);
  fs.writeFileSync(file, contenitore(nome, pezzi, esposti));
  console.log('scritto', path.basename(file));
}

// Libreria di Denis su Drive (12 · Risorse/Assets, 03/11): loghi e font usati senza copiarli ogni volta
// nella cartella del video o dello stile. Funzioni pure qui (provate in scripts/libreria.test.mjs);
// lo scarico con rclone lo fa scripts/regista.mjs.

const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const ESCLUSI = /^(logo|icona|icon|hd|png|white|black|bianco|nero|color|colore|full|\d+)$/;

// nomi con cui si può dire una marca, dal nome del file: "ChatGPT.png" → ["chatgpt"],
// "final-cut-pro.png" → ["final cut pro"], "apple, iphone.png" → ["apple", "iphone"]
export function nomiLogo(file) {
  const base = String(file).split('/').pop().replace(/\.[^.]+$/, '');
  return base.split(/\s*[,+]\s*/).map((pezzo) => norm(pezzo).replace(/[_\-.]+/g, ' ').split(/\s+/).filter((w) => w && !ESCLUSI.test(w)).join(' '))
    .filter((n) => n.replace(/\s/g, '').length >= 2);
}

// il nome è detto nel parlato? Parole intere; "chatgpt" vale anche "chat gpt" (Whisper li stacca)
const pulito = (testo) => ` ${norm(testo).replace(/[^\p{L}\p{N}]+/gu, ' ')} `;
const regexNome = (nome) => new RegExp(`(?:^|\\s)${[...nome.replace(/\s+/g, '')].map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s?')}(?=\\s)`);
export const detto = (nome, testo) => regexNome(nome).test(pulito(testo));

// loghi della libreria nominati nel parlato, al massimo `max`, nell'ordine in cui escono la prima volta
export function loghiDetti(files, testo, max = 8) {
  const t = pulito(testo);
  const trovati = [];
  for (const f of files) {
    if (!/\.(png|webp|svg)$/i.test(f)) continue;
    for (const nome of nomiLogo(f)) {
      const pos = t.search(regexNome(nome));
      if (pos >= 0) { trovati.push({ file: f, nome, pos }); break; }
    }
  }
  return trovati.sort((a, b) => a.pos - b.pos).slice(0, max);
}

const PESO_PAROLE = { 100: ['thin', 'hairline'], 200: ['extralight', 'ultralight'], 300: ['light'], 400: ['regular', 'normal', 'roman', 'book', ''],
  500: ['medium'], 600: ['semibold', 'demibold'], 700: ['bold'], 800: ['extrabold', 'ultrabold', 'heavy'], 900: ['black', 'heavy'] };

// il file di font giusto per { famiglia, peso, corsivo } tra quelli dati (percorsi), o null.
// "Apple Garamond" 700 → AppleGaramond-Bold.ttf, non AppleGaramond-Light.ttf
export function scegliFont(files, ft) {
  const fam = norm(ft.famiglia).replace(/[^a-z0-9]/g, '');
  if (!fam) return null;
  let migliore = null;
  for (const f of files) {
    if (!/\.(ttf|otf|woff2?)$/i.test(f)) continue;
    const nome = norm(String(f).split('/').pop().replace(/\.[^.]+$/, '')).replace(/[^a-z0-9]/g, '');
    if (!nome.startsWith(fam)) continue;
    let resto = nome.slice(fam.length).replace(/\d+pt/, '').replace(/[0-9a-f]{10,}$/, '');
    const corsivo = /italic|oblique|corsivo/.test(resto);
    resto = resto.replace(/italic|oblique|corsivo/g, '');
    const pesoFile = Number(Object.entries(PESO_PAROLE).find(([, ws]) => ws.includes(resto))?.[0] || 0);
    let punti = 0;
    if (Boolean(ft.corsivo) === corsivo) punti += 4;
    if (pesoFile === (ft.peso || 400)) punti += 6;
    else if (pesoFile) punti += 3 - Math.min(3, Math.abs(pesoFile - (ft.peso || 400)) / 200);
    else punti -= 2; // parola che non è un peso: altra variante (es. "Condensed", "Rounded")
    if (!migliore || punti > migliore.punti) migliore = { f, punti };
  }
  return migliore?.f || null;
}

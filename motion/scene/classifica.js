// Scena fatta a mano (Claude, 19/11): una voce di una CLASSIFICA («Top 5 …»), idea presa da un reel che Denis ha
// salvato (schede che si formano a pixel, barra 10→1 in basso). Si usa scrivendo nel brief un blocco
//   Classifica: Top 5 skill per Claude Code
//   5. Ponytail | 95,7k stelle | Scrive codice come il senior più pigro
//   …
//   1. Superpowers | 295k stelle | Pianifica, testa e corregge prima di scrivere
// e la scena parte, per ogni voce, quando Denis ne dice il nome (scripts/scene-mano.mjs, classificaNelPiano).
// Storyboard (per voce): 1) un blocco di pixel del colore della voce si accende a caso  2) i pixel si spengono e sotto
// resta la scheda: posizione, nome, numero che conta, una frase  3) in basso la barra della classifica: le voci già
// dette bianche, questa colorata  4) alla fine la scheda si sgretola di nuovo in pixel.
// durata: 4.5
const DUR = M.META.duration, W = M.META.width;
const PALETTE = ['#F2716B', '#9BD14B', '#A88BEA', '#5B9BEA', '#EDB834', '#25B39A', '#D458C9', '#F08A33', '#EF7FAE', '#B9CDBF'];
const v = DATI.voce || { n: 3, nome: 'Karpathy Skills', sotto: 'multica-ai/andrej-karpathy-skills', numero: '234k', etichetta: 'stelle su GitHub', frase: 'Un solo CLAUDE.md con quattro regole su come Claude scrive codice.' };
const TOT = Math.max(Number(DATI.totale) || 5, Number(v.n) || 1);
const N = Number(v.n) || 1;
const COL = v.colore || PALETTE[(N - 1) % PALETTE.length];
const titolo = String(DATI.titolo || 'Classifica').slice(0, 48);
const FONT = 'Inter, "Liberation Sans", Arial, sans-serif', MONO = '"DejaVu Sans Mono", "Liberation Mono", monospace';

// --- la scheda ---
const CW = 860, CH = 450, CX = (W - CW) / 2, CY = 24;
const scheda = M.el('div', { id: 'scheda', style: { position: 'absolute', left: `${CX}px`, top: `${CY}px`, width: `${CW}px`, height: `${CH}px`, background: COL, borderRadius: '6px', color: '#121212', fontFamily: FONT, overflow: 'hidden', opacity: 0, boxShadow: '0 30px 80px rgba(0,0,0,.45)' } });
const dentro = (tag, text, style) => M.el(tag, { text, parent: '#scheda', style: { position: 'absolute', whiteSpace: 'nowrap', ...style } });
dentro('div', titolo, { left: '32px', top: '26px', fontFamily: MONO, fontSize: '19px', opacity: 0.8 });
dentro('div', `N° ${String(N).padStart(2, '0')}`, { left: '32px', top: '64px', fontFamily: MONO, fontSize: '22px', fontWeight: 700, background: '#121212', color: COL, padding: '4px 10px', borderRadius: '3px' });
const nome = String(v.nome || '').slice(0, 30);
const sizeNome = nome.length <= 14 ? 72 : nome.length <= 20 ? 60 : 46;
dentro('div', nome, { left: '30px', top: '110px', fontSize: `${sizeNome}px`, fontWeight: 900, letterSpacing: '-1.5px' });
let y = 110 + sizeNome + 14;
if (v.sotto) { dentro('div', String(v.sotto).slice(0, 44), { left: '32px', top: `${y}px`, fontFamily: MONO, fontSize: '18px', background: '#121212', color: '#f2f2f2', padding: '3px 9px', borderRadius: '3px' }); y += 44; }
if (v.etichetta) dentro('div', String(v.etichetta).slice(0, 30), { left: '32px', top: `${y}px`, fontFamily: MONO, fontSize: '18px', opacity: 0.85 });
const numero = dentro('div', String(v.numero || ''), { id: 'numero', left: '28px', top: `${y + 20}px`, fontSize: '92px', fontWeight: 900, letterSpacing: '-3px', lineHeight: '1' });
// il numero conta da zero se è un numero (anche «95,7k», «1.200», «4,5 €»)
const mN = /^([^\d]*)(\d[\d.]*(?:,\d+)?)(.*)$/.exec(String(v.numero || ''));
if (mN) {
  const dec = (mN[2].split(',')[1] || '').length;
  const to = Number(mN[2].replace(/\./g, '').replace(',', '.'));
  numero.id = 'numero';
  if (Number.isFinite(to)) add(P.counter('#numero', { t: 0.75, dur: 1.1, from: 0, to, decimals: dec, prefix: mN[1], suffix: mN[3], sfx: false }));
}
const linea = M.el('div', { parent: '#scheda', style: { position: 'absolute', left: '32px', top: `${y + 124}px`, height: '6px', width: '0px', background: '#121212' } });
const lungLinea = 560 * (TOT - N + 1) / TOT;
if (v.frase) M.el('div', { parent: '#scheda', text: String(v.frase).slice(0, 90), style: { position: 'absolute', left: '32px', top: `${y + 142}px`, width: '600px', fontSize: '22px', fontWeight: 600, lineHeight: '1.25' } });

// firma della scheda: due grappoli di pixel scuri negli angoli a destra (fissi, come una texture stampata)
const deco = M.el('canvas', { parent: '#scheda', style: { position: 'absolute', left: '0px', top: '0px', width: `${CW}px`, height: `${CH}px` } });
deco.width = CW; deco.height = CH;
{ const d = deco.getContext('2d'), r = M.rand(N * 13 + 5); d.fillStyle = 'rgba(18,18,18,0.85)';
  for (const [ax, ay] of [[CW - 30, 30], [CW - 30, CH - 30]]) for (let i = 0; i < 150; i++) {
    const dx = Math.floor(r() * r() * 16), dy = Math.floor(r() * r() * 9);
    d.fillRect(ax - dx * 9 - 6, ay + (ay < CH / 2 ? dy : -dy) * 9 - 3, 6, 6);
  } }

// --- pixel: si accendono, poi si spengono scoprendo la scheda; alla fine al contrario ---
const LATO = 20, COLS = Math.ceil(CW / LATO), RIGHE = Math.ceil(CH / LATO);
const tela = M.el('canvas', { style: { position: 'absolute', left: `${CX}px`, top: `${CY}px`, width: `${CW}px`, height: `${CH}px` } });
tela.width = CW; tela.height = CH;
const g = tela.getContext('2d');
const rnd = M.rand(N * 97 + TOT);
const soglie = Array.from({ length: COLS * RIGHE }, () => [rnd(), rnd(), rnd()]);
const IN = [0, 0.32, 0.72], OUT = DUR - 0.5;
const clamp = (x) => Math.min(1, Math.max(0, x));
add({ fn: (t) => {
  g.clearRect(0, 0, CW, CH);
  const acceso = clamp((t - IN[0]) / (IN[1] - IN[0]));      // quanti pixel accesi
  const spento = clamp((t - IN[1]) / (IN[2] - IN[1]));      // quanti già spenti (scheda sotto)
  const fine = clamp((t - OUT) / 0.42);                      // uscita
  scheda.style.opacity = t < IN[1] ? 0 : t < OUT ? 1 : String(1 - clamp((t - OUT) / 0.2));
  for (let i = 0; i < soglie.length; i++) {
    const [a, b, c] = soglie[i];
    let on = a < acceso && b >= spento;
    if (t >= OUT) on = c < fine * 1.4 && c > fine * 1.4 - 0.5;
    if (!on) continue;
    g.fillStyle = (i * 7 + Math.floor(b * 5)) % 3 === 0 ? '#121212' : COL;
    g.fillRect((i % COLS) * LATO + 2, Math.floor(i / COLS) * LATO + 2, LATO - 4, LATO - 4);
  }
  linea.style.width = `${lungLinea * M.EASE.expoOut(clamp((t - 0.8) / 1.0))}px`;
} });

// --- la barra della classifica: TOT caselle, da TOT (a sinistra) a 1 (a destra) ---
const BY = CY + CH + 40, PASSO = CW / TOT, BW = PASSO - 8;
const barra = M.el('div', { id: 'barra', style: { position: 'absolute', left: '0px', top: '0px', width: `${W}px`, height: '700px' } });
add({ fn: (t) => { barra.style.opacity = String(Math.min(clamp(t / 0.25), 1 - clamp((t - OUT) / 0.4))); } });
for (let k = 0; k < TOT; k++) {
  const pos = TOT - k, alta = 10 + (k / Math.max(1, TOT - 1)) * 14;
  const fatta = pos > N, questa = pos === N;
  const box = M.el('div', { parent: '#barra', style: { position: 'absolute', left: `${CX + k * PASSO + 4}px`, top: `${BY + 24 - alta}px`, width: `${BW}px`, height: `${alta + (questa ? 10 : 0)}px`, borderRadius: '2px',
    background: fatta ? '#f4f4f4' : questa ? COL : 'rgba(255,255,255,0.12)', border: fatta || questa ? 'none' : '1px solid rgba(255,255,255,0.35)', transformOrigin: 'bottom' } });
  M.el('div', { parent: '#barra', text: String(pos), style: { position: 'absolute', left: `${CX + k * PASSO + 4}px`, width: `${BW}px`, top: `${BY + 40}px`, textAlign: 'center', fontFamily: FONT, fontSize: questa ? '26px' : '18px', fontWeight: questa ? 900 : 600, color: questa ? '#fff' : 'rgba(255,255,255,0.7)', textShadow: '0 2px 10px rgba(0,0,0,.7)' } });
  if (questa) add({ fn: (t) => { box.style.transform = `scaleY(${M.EASE.expoOut(clamp((t - 0.35) / 0.5))})`; } });
}

M.sfx(0, 'data', { dur: 0.6, gain: 0.35 });
M.sfx(0.36, 'pop', { gain: 0.5 });
M.sfx(OUT, 'glitch', { dur: 0.35, gain: 0.25 });

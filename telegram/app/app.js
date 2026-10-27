const DEMO = (location.hostname === 'localhost' || location.hostname === '127.0.0.1') && new URLSearchParams(location.search).has('demo');
const DEMO_VISTA = new URLSearchParams(location.search).get('demo') || '';
const DEMO_STATO = new URLSearchParams(location.search).get('stato') || '';
const root = document.getElementById('app');

const stato = {
  schermo: 'accesso',
  auth: null,
  home: null,
  video: [],
  dettaglio: null,
  cartelle: null,
  stili: [],
  regia: null,
  collegamenti: null,
  nuovo: null,
  toast: '',
  carica: caricaVuota(),
  studio: studioVuoto(),
};

function studioVuoto() {
  return { fase: 'elenco', salvati: [], bozza: null, occupato: '', file: null, nota: '', errore: '', invio: false };
}

function caricaVuota() {
  return {
    modalita: 'originali', nome: '', archivio: false, fase: 'scelta',
    selezionati: [], da: 0, a: 90, id: null, file: [],
    byteFatti: 0, byteTotali: 0, eta: null, inVolo: 0, pezziFatti: 0, pezziTotali: 0,
    errore: '', nota: '', daRiselezionare: false, stop: false, pausa: false, cellulare: reteCellulare(),
  };
}

function reteCellulare() {
  const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!c) return false;
  if (c.type === 'cellular') return true;
  return c.effectiveType === 'slow-2g' || c.effectiveType === '2g' || c.effectiveType === '3g';
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const byteTxt = (n) => n >= 1e9 ? `${(n / 1e9).toFixed(1).replace('.', ',')} GB` : n >= 1e6 ? `${Math.round(n / 1e6)} MB` : `${Math.max(0, Math.round(n / 1e3))} KB`;
function tempoTxt(s) {
  if (s == null) return 'calcolo il tempo…';
  if (s < 8) return 'quasi fatto';
  const m = Math.round(s / 60);
  if (m < 1) return `circa ${Math.max(1, Math.round(s))} s`;
  if (m < 60) return `circa ${m} min`;
  return `circa ${Math.floor(m / 60)} h ${m % 60} min`;
}

function b64url(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64buf(s) {
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
  const bin = atob(String(s).replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

const demoMem = {
  approvato: false,
  didascalia: 'Il caffè che non sapevo di volere.\n\n#caffè #mattina',
  titolo: 'Provo questo caffè',
};

const demoStile = {
  salvati: [
    { id: 'stiledemo01', nome: 'Giallo veloce', desc: 'Reel tech, tagli corti, scritte in basso', quando: Date.now() - 86400000 },
  ],
  bozza: null,
};

async function api(path, { method = 'GET', body, ms } = {}) {
  if (DEMO) return demoApi(path, method, body);
  let r;
  try {
    r = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      // ms: per le chiamate lunghe (analisi dello stile) un limite chiaro invece di un'attesa infinita
      ...(ms && typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? { signal: AbortSignal.timeout(ms) } : {}),
    });
  } catch (e) {
    if (e?.name === 'TimeoutError' || e?.name === 'AbortError') throw new Error('Nessuna risposta dal server in tempo. Riprova.');
    throw new Error('Rete assente o instabile. Riprova quando torna.');
  }
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 && !path.startsWith('/api/auth')) {
    stato.schermo = 'accesso';
    disegna();
  }
  if (!r.ok) throw new Error(data.errore || 'Qualcosa non ha funzionato.');
  return data;
}

function demoApi(path, method, body) {
  if (path === '/api/auth/stato') {
    return DEMO_VISTA === 'accesso'
      ? { sessione: false, passkey: true, bloccato: true, setup: true }
      : { sessione: true, passkey: true, bloccato: true, setup: true };
  }
  if (path === '/api/home') return demoHome();
  if (path === '/api/stato') return demoHome().stato;
  if (path === '/api/video' && method === 'GET') return { video: demoElenco() };
  if (path.startsWith('/api/video/') && method === 'GET') return demoDettaglio();
  if (path.startsWith('/api/video/') && method === 'POST') {
    if (body?.azione === 'approva') demoMem.approvato = true;
    if (body?.azione === 'didascalia') demoMem.didascalia = body.testo;
    if (body?.azione === 'titolo') demoMem.titolo = body.testo;
    return { ok: true };
  }
  if (path === '/api/cartelle') return { cartelle: { elenco: ['Benchy PETG', 'Caffè del mattino', 'Unboxing luci'], vai: ['Benchy PETG'], aggiornato: Date.now() }, stili: demoStili() };
  if (path === '/api/stili') return { stili: demoStili(), predefinito: 'Blueprint' };
  if (path === '/api/collegamenti') return { ig: true, yt: true, prova: 'manuale', provaNome: 'A mano' };
  if (path === '/api/regia' && method === 'GET') return { regia: { nome: 'Caffè del mattino', ok: true, testo: 'Tengo il primo piano sul versamento e chiudo sulla tazza.', quando: Date.now() } };
  if (path === '/api/push/chiave') return { attivo: false, chiave: null };
  if (path === '/api/stile' && method === 'GET') return { salvati: demoStile.salvati, bozza: demoStile.bozza };
  if (path === '/api/stile/apri' && method === 'POST') {
    const s = demoStile.salvati.find((x) => x.id === body?.id) || demoStile.salvati[0];
    demoStile.bozza = {
      nome: s?.nome || 'Stile',
      riassunto: 'Quando usarlo: reel tech, tagli corti\nRitmo: un taglio ogni 1,2 s\nSottotitoli: parola · Montserrat 700 · #FFFFFF · basso\nColori: caldo\nTransizioni: no\nInquadrature: punch-in sul volto\nMusica: no',
      messaggi: [{ ruolo: 'ai', testo: 'Tagli corti, sottotitoli bianchi in basso, look caldo. Dimmi cosa cambiare.' }],
      haTesto: true,
      voce: false,
    };
    return { bozza: demoStile.bozza };
  }
  if (path === '/api/stile/chat' && method === 'POST') {
    const detto = String(body?.testo || '');
    const b = demoStile.bozza || { nome: 'Bozza', riassunto: '', messaggi: [], haTesto: true, voce: false };
    b.messaggi = [...(b.messaggi || []), { ruolo: 'denis', testo: detto }];
    if (/giall/i.test(detto)) {
      b.riassunto = String(b.riassunto).replace('#FFFFFF', '#FFE62E');
      b.messaggi.push({ ruolo: 'ai', testo: 'Sottotitoli gialli, in basso.' });
    } else if (/veloc/i.test(detto)) {
      b.riassunto = String(b.riassunto).replace('1,2 s', '0,6 s');
      b.messaggi.push({ ruolo: 'ai', testo: 'Ritmo più veloce: un taglio ogni 0,6 s.' });
    } else if (/zoom/i.test(detto)) {
      b.riassunto = String(b.riassunto).replace('punch-in sul volto', 'niente zoom');
      b.messaggi.push({ ruolo: 'ai', testo: 'Tolto lo zoom.' });
    } else b.messaggi.push({ ruolo: 'ai', testo: 'Ho tenuto lo stile e ho segnato la nota.' });
    demoStile.bozza = b;
    return { bozza: b };
  }
  if (path === '/api/stile/salva' && method === 'POST') {
    const nome = String(body?.nome || '').trim() || 'Senza nome';
    demoStile.salvati = [{ id: `salvato${demoStile.salvati.length}`, nome, desc: 'studiato nell’app', quando: Date.now() }, ...demoStile.salvati.filter((s) => s.nome !== nome)];
    return { ok: true, salvati: demoStile.salvati, avviso: null };
  }
  if (path === '/api/stile/rinomina' && method === 'POST') {
    demoStile.salvati = demoStile.salvati.map((s) => (s.id === body?.id ? { ...s, nome: body.nome } : s));
    return { ok: true, salvati: demoStile.salvati };
  }
  if (path === '/api/stile/duplica' && method === 'POST') {
    const s = demoStile.salvati.find((x) => x.id === body?.id);
    demoStile.salvati = [...demoStile.salvati, { id: `copia${demoStile.salvati.length}`, nome: body?.nome || `${s?.nome || 'Stile'} copia`, desc: s?.desc || '', quando: Date.now() }];
    return { ok: true, salvati: demoStile.salvati };
  }
  if (path === '/api/stile/elimina' && method === 'POST') {
    demoStile.salvati = demoStile.salvati.filter((s) => s.id !== body?.id);
    return { ok: true, salvati: demoStile.salvati };
  }
  if (method === 'POST') return { ok: true, inviato: true, upload: { id: 'demo', nome: body?.nome || 'Video', pronto: true, file: [] } };
  return {};
}

function demoStili() {
  const base = [
    { nome: 'Blueprint', tasto: '📐 Blueprint', cosa: 'tavola tecnica, parole chiave in box, effetti digitali' },
    { nome: 'Cinematico', tasto: '🎬 Cinematico', cosa: 'spot di prodotto, sottotitoli parola per parola, titoli grandi' },
    { nome: 'Narrativo', tasto: 'Narrativo', cosa: 'racconto lungo, poche scritte, dal Drive' },
  ];
  const extra = demoStile.salvati
    .filter((s) => !base.some((b) => b.nome.toLowerCase() === s.nome.toLowerCase()))
    .map((s) => ({ nome: s.nome, tasto: `✦ ${s.nome}`, cosa: s.desc || 'studiato nell’app' }));
  return [...base, ...extra];
}
function demoFatti() {
  return [
    { runId: '1', nome: 'Panca puff', stile: 'Cinematico', durata: 39.2, quando: Date.now() - 3600e3, link: 'https://drive.google.com/file/d/demo/view', memo: { approvato: false, pubblicato: false } },
    { runId: '2', nome: 'Multiplay', stile: 'Motion', durata: 28.1, quando: Date.now() - 7200e3, memo: { approvato: true, pubblicato: true, pubblica: { copertinaId: 'cover-multiplay' } } },
    { runId: '3', nome: 'Beats pokemon', stile: 'Motion', durata: 35.4, quando: Date.now() - 864e5, memo: { approvato: true, pubblicato: false } },
    { runId: '4', nome: 'Beats pokemon', stile: 'Motion', durata: 35.1, quando: Date.now() - 2 * 864e5, memo: { approvato: false, pubblicato: false } },
  ];
}
function barreDemo(corrente, dettaglio) {
  const elenco = [
    ['installazione', 'Installazione'], ['scarico', 'Scarico'], ['prepara', 'Analisi'],
    ['regia', 'Regia'], ['tagli', 'Tagli'], ['render', 'Render'], ['carico', 'Upload'],
  ];
  const idx = Math.max(0, elenco.findIndex(([id]) => id === corrente));
  return elenco.map(([id, nome], i) => ({
    id, nome, dettaglio: id === corrente ? (dettaglio || '') : '', fatta: i < idx, ora: i === idx, ko: false,
  }));
}
function demoHome() {
  const vista = new URLSearchParams(location.search).get('stato');
  const corso = vista === 'corso' ? {
    attivi: [{
      runId: '1001', nome: 'Benchy PETG', fase: 'render', faseNome: 'Render', minuti: 14, inCoda: false,
      dettaglio: '39 secondi, 12 tagli',
      mancano: 6, mancanoTesto: 'Mancano circa 6 min',
      fasi: barreDemo('render', '39 secondi, 12 tagli'),
    }],
    pendenti: [], falliti: [], ultimi: [],
  } : vista === 'fallito' ? {
    attivi: [], pendenti: [], ultimi: [],
    falliti: [{
      runId: '1002', nome: 'Anime', puoRiprovare: true,
      errore: 'Non trovo la cartella "Anime" in 01 · Da editare.',
    }],
  } : { attivi: [], pendenti: [], falliti: [], ultimi: [] };
  return {
    impostazioni: { versione: 'stabile', ai: 'gemini', modello: 'sonnet', gemini: 'flash', stile: 'Blueprint', prova: 'manuale' },
    stato: corso,
    video: vista === 'vuoto' ? [] : demoFatti(),
    avvisi: 1, upload: null, push: false, playback: true, r2: true,
  };
}
function demoElenco() {
  return demoFatti();
}
function demoDettaglio() {
  return {
    video: demoElenco()[0],
    memo: {
      nome: 'Caffè del mattino', stile: 'Cinematico', approvato: demoMem.approvato, brief: 'Stile: Cinematico',
      pubblica: { fileId: 'demo', didascalia: demoMem.didascalia, youtube: { titolo: demoMem.titolo, descrizione: 'Due righe.' }, ig: true, yt: true },
    },
    collegamenti: { ig: true, yt: true }, provaSecondi: 10, playback: false,
  };
}

try {
  const qv = new URLSearchParams(location.search);
  if (qv.get('vetro') === 'solido' || localStorage.getItem('regista-vetro') === 'solido' || localStorage.getItem('regista-vetro-lite') === '1') {
    document.documentElement.dataset.glass = 'lite';
  }
  if (localStorage.getItem('regista-effetti') === '0') document.documentElement.dataset.motion = 'off';
} catch { /* archivio non disponibile */ }

function reteIniziale() {
  try {
    const v = localStorage.getItem('regista-rete');
    if (v === 'dati' || v === 'wifi') return v;
  } catch { /* resta il default */ }
  // Safari non dice se sei in 4G. Il default è Wi-Fi così i pezzi restano quelli di oggi (4).
  return 'wifi';
}
function applicaRete(rete) {
  stato.rete = rete === 'dati' ? 'dati' : 'wifi';
  try { localStorage.setItem('regista-rete', stato.rete); } catch { /* ignora */ }
  if (!stato.carica.modalitaScelta && stato.carica.fase === 'scelta') {
    stato.carica.modalita = stato.rete === 'dati' ? 'proxy' : 'originali';
  }
}
function paralleloScelto(server) {
  const base = Number(server) || 4;
  if (stato.rete === 'wifi') return Math.max(base, 5);
  return base;
}

const FASE_BREVE = {
  installazione: 'Installazione', scarico: 'Scarico', prepara: 'Analisi',
  regia: 'Regia', tagli: 'Tagli', render: 'Monta', carico: 'Carico',
};
function etichettaFase(a) { return FASE_BREVE[a?.fase] || a?.faseNome || 'Installazione'; }
function metaLavoro(a) {
  const stile = a?.stile || stato.home?.impostazioni?.stile || '';
  return [a?.nome || 'Montaggio', stile].filter(Boolean).join(' · ');
}
function firmaStato(s) {
  const id = (arr) => (arr || []).map((x) => x.runId || x.nome || '').join(',');
  return [id(s?.attivi), id(s?.pendenti), id(s?.falliti)].join('|');
}
function durataTxt(s) {
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return '';
  const t = Math.round(n);
  if (t >= 60) return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  return `${t}s`;
}
function tinta(nome) {
  let h = 0;
  const str = String(nome || '');
  for (let i = 0; i < str.length; i++) h = (h * 33 + str.charCodeAt(i)) >>> 0;
  const g = 14 + (h % 16);
  return `linear-gradient(165deg, hsl(0 0% ${g + 14}%), hsl(0 0% ${Math.max(6, g - 6)}%))`;
}
function nomeDaFile(files) {
  const f = files?.[0];
  if (!f) return '';
  return f.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim().slice(0, 80);
}
function svg(inner) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`;
}
const ICO = {
  film: svg('<rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M8 4v3.2M12 4v3.2M16 4v3.2M8 16.8V20M12 16.8V20M16 16.8V20"/>'),
  grid: svg('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'),
  sliders: svg('<path d="M4 8h16M4 16h16"/><circle cx="9" cy="8" r="2.2"/><circle cx="15" cy="16" r="2.2"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  up: svg('<path d="M12 19V6M6.5 11.5 12 6l5.5 5.5"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  back: svg('<path d="M14.5 5.5 8 12l6.5 6.5"/>'),
  more: svg('<circle cx="6" cy="12" r="1.15" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.15" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.15" fill="currentColor" stroke="none"/>'),
  chev: svg('<path d="M9 6l6 6-6 6"/>'),
  check: svg('<path d="M5 12.5 9.2 16.7 19 7"/>'),
  wifi: svg('<path d="M4.5 12a10 10 0 0 1 15 0"/><path d="M8 15.2a5.5 5.5 0 0 1 8 0"/><circle cx="12" cy="18.2" r="1" fill="currentColor" stroke="none"/>'),
  dati: svg('<rect x="7" y="2.5" width="10" height="19" rx="2.2"/><path d="M11 18.6h2"/>'),
  send: svg('<path d="M4 12h14M13 6.5 18.5 12 13 17.5"/>'),
};

function contaLavori() {
  const s = stato.home?.stato || {};
  return (s.attivi?.length || 0) + (s.pendenti?.length || 0) + (s.falliti?.length || 0);
}
function aggiornaBadge() {
  const n = contaLavori();
  document.querySelectorAll('[data-badge-lavori]').forEach((el) => { el.hidden = !n; });
  if (navigator.setAppBadge) {
    const op = n ? navigator.setAppBadge(n) : navigator.clearAppBadge?.();
    op?.catch?.(() => {});
  }
}

function assicuratiGuscio() {
  if (document.getElementById('view')) return;
  root.innerHTML = `<div class="app" id="guscio">
      <main class="view" id="view"></main>
      <div class="composer glass" id="composer" hidden></div>
    </div>
    <div class="scrim" id="scrim" data-azione="chiudi-foglio"></div>
    <div class="sheet-host" id="sheet-host" hidden>
      <div class="sheet glass" id="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-titolo"></div>
    </div>
    <div class="toast glass" id="toast" role="status" hidden></div>
    <div class="sr" id="annunci" aria-live="polite"></div>
    <input id="file-hero" type="file" accept="video/*,image/*,audio/*" multiple hidden>`;
  for (const id of ['composer', 'scrim', 'sheet-host', 'toast']) {
    const el = document.getElementById(id);
    if (el && el.parentElement !== document.body) document.body.appendChild(el);
  }
  document.getElementById('view').addEventListener('scroll', () => {
    const view = document.getElementById('view');
    view.classList.toggle('scorso', view.scrollTop > 24);
  }, { passive: true });
  agganciaFoglio();
  agganciaViewport();
  agganciaTocco();
  agganciaDebug();
  if (!DEMO) sondaFps();
}

function disegna(opts = {}) {
  try { leggiCampiCarica(); } catch { /* il foglio può essere chiuso */ }
  leggiCampiMonta();
  assicuratiGuscio();
  const solo = stato.schermo === 'accesso';
  const guscio = document.getElementById('guscio');
  guscio.classList.toggle('solo', solo);
  const dock = document.getElementById('dock');
  dock.hidden = solo;
  dock.innerHTML = solo ? '' : htmlDock();
  const view = document.getElementById('view');
  const y = opts.tieniScroll ? view.scrollTop : 0;
  const corpo = {
    accesso: htmlAccesso, oggi: htmlOggi, video: htmlVideo, dettaglio: htmlDettaglio, altro: htmlAltro, stile: htmlStile,
  }[stato.schermo] || htmlOggi;
  view.innerHTML = corpo();
  view.className = `view vista-${stato.schermo}${y > 24 ? ' scorso' : ''}`;
  view.scrollTop = y;
  renderComposer();
  renderFoglio();
  const toastEl = document.getElementById('toast');
  if (stato.toast) { toastEl.hidden = false; toastEl.textContent = stato.toast; }
  else toastEl.hidden = true;
  aggiornaBadge();
  codaAnteprime();
  assicuratiPoll();
  aggiornaQuadro();
}

function toast(testo) {
  stato.toast = testo;
  const el = document.getElementById('toast');
  if (!el) { disegna(); return; }
  el.hidden = false;
  el.textContent = testo;
  const vivo = document.getElementById('annunci');
  if (vivo) vivo.textContent = testo;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    stato.toast = '';
    const t = document.getElementById('toast');
    if (t) t.hidden = true;
  }, 3500);
}

function hashPer(verso) {
  if (verso === 'dettaglio' && stato.dettaglio?.id) return `video/${stato.dettaglio.id}`;
  if (verso === 'oggi' || verso === 'video' || verso === 'altro' || verso === 'stile' || verso === 'accesso') return verso;
  return '';
}
function vai(verso, opts = {}) {
  if (verso === 'carica') return apriFoglio('carica');
  if (verso === 'nuovo') { preparaNuovo(); return apriFoglio('monta'); }
  stato.schermo = verso;
  if (!opts.tieniFoglio) stato.foglio = null;
  const h = hashPer(verso);
  if (h && !opts.daStoria) {
    const url = `#${h}`;
    if (location.hash !== url) {
      if (opts.sostituisci) history.replaceState({ h }, '', url);
      else history.pushState({ h }, '', url);
    }
  }
  disegna(opts);
}
async function applicaHash(daStoria) {
  const raw = decodeURIComponent((location.hash || '').replace(/^#/, ''));
  const [a, b] = raw.split('/');
  if (a === 'video' && b) return apriVideo(b, { daStoria: true });
  if (a === 'video') {
    stato.video = (await api('/api/video')).video || stato.video;
    return vai('video', { daStoria: true });
  }
  if (a === 'altro') { await caricaAltro(); return vai('altro', { daStoria: true }); }
  if (a === 'stile') { await caricaStudio(); stato.studio.fase = 'elenco'; return vai('stile', { daStoria: true }); }
  if (a === 'carica') { vai('oggi', { daStoria: true }); return apriFoglio('carica'); }
  if (a === 'nuovo') { preparaNuovo(); vai('oggi', { daStoria: true }); return apriFoglio('monta'); }
  return vai('oggi', { daStoria: true });
}
window.addEventListener('popstate', () => { applicaHash(true).catch((e) => toast(e.message)); });

function htmlDock() {
  const map = { dettaglio: 'video', stile: 'altro' };
  const attivo = map[stato.schermo] || stato.schermo;
  const voci = [['oggi', 'Oggi', ICO.film], ['video', 'Video', ICO.grid], ['altro', 'Altro', ICO.sliders]];
  const n = contaLavori();
  return `<nav class="tabbar glass" role="tablist" aria-label="Sezioni">${voci.map(([id, nome, ico]) => `<button type="button" class="tab" role="tab" ${attivo === id ? 'aria-current="page"' : ''} data-azione="vai" data-verso="${id}">${ico}<span>${nome}</span>${id === 'oggi' ? `<i class="badge" data-badge-lavori ${n ? '' : 'hidden'}></i>` : ''}</button>`).join('')}</nav><button type="button" class="orb" data-azione="apri-carica" aria-label="Carica">${ICO.plus}</button>`;
}
function htmlChipRete() {
  const dati = stato.rete === 'dati';
  return `<button type="button" class="chip-rete" data-azione="gira-rete" aria-label="Connessione ${dati ? 'dati mobili' : 'Wi-Fi'}. Tocca per cambiare.">${dati ? ICO.dati : ICO.wifi}<span>${dati ? 'Dati' : 'Wi-Fi'}</span></button>`;
}
function htmlBarra(titolo, extra = {}) {
  const grande = !extra.indietro;
  const back = extra.indietro ? `<button type="button" class="indietro" data-azione="indietro" aria-label="Indietro">${ICO.back}</button>` : '';
  return `<header class="barra-titolo${grande ? ' grande' : ''}">${back}<h1 class="titolone">${esc(titolo)}</h1><div class="slot-destra">${extra.destra || ''}</div></header>`;
}

function htmlAccesso() {
  const a = stato.auth || {};
  return `<div class="accesso"><div class="marca" aria-hidden="true">${ICO.film}</div>
    <h1 class="titolone">Regista</h1>
    <p class="sottotitolo">Passkey di questo iPhone. Il codice arriva su Telegram, una volta sola.</p>
    ${a.passkey ? '<button type="button" class="btn" data-azione="entra" style="margin-top:18px">Entra con la passkey</button>' : ''}
    <label class="etichetta" for="codice">Codice Telegram</label>
    <input class="campo codice" id="codice" inputmode="text" autocapitalize="characters" autocomplete="one-time-code" spellcheck="false" placeholder="ABCD-1234">
    <button type="button" class="btn ${a.passkey ? 'vetro' : ''}" data-azione="registra">${a.passkey ? 'Aggiungi questo iPhone' : 'Crea la passkey'}</button>
    <button type="button" class="btn quiet" data-azione="chiedi-codice">Mandami il codice su Telegram</button>
    <p class="nota">Dopo il primo iPhone, Telegram da solo non basta più. Per un secondo telefono serve il codice, oppure lo sblocco dall’iPhone già attivo.</p></div>`;
}

function videoRecente() {
  const v = (stato.home?.video || [])[0];
  if (!v?.quando) return null;
  const t = typeof v.quando === 'number' ? v.quando : Date.parse(v.quando);
  if (!Number.isFinite(t) || Date.now() - t > 6 * 3600e3) return null;
  return v;
}
function htmlOggi() {
  const s = stato.home?.stato || { attivi: [], pendenti: [], falliti: [] };
  const vivo = htmlVivo(s);
  const lavori = !!vivo;
  const c = stato.carica;
  const occupato = c.fase === 'invio' || c.fase === 'pausa' || c.fase === 'codifica';
  const pronto = c.fase === 'pronto';
  let sotto = '';
  if (occupato) sotto = htmlUploadCompatta();
  else if (pronto && !c.archivio) sotto = htmlProntoBox();
  else if (lavori || (videoRecente() && !(s.falliti || []).length)) sotto = `${videoRecente() && !(s.attivi || []).length && !(s.pendenti || []).length ? htmlRisultato(videoRecente()) : ''}${htmlRigaCarica()}`;
  else sotto = htmlUploadHero();
  const video = stato.home?.video || [];
  const aperto = stato.home?.upload && !stato.home.upload.avviato && !pronto && !occupato;
  return `${htmlBarra('Oggi', { destra: htmlChipRete() })}
    <div data-vivo data-firma="${esc(firmaStato(s))}">${vivo}</div>
    ${sotto}
    ${aperto ? '<p class="nota">C’è un caricamento aperto. I pezzi già arrivati restano. <button type="button" class="btn quiet" data-azione="apri-carica">Apri</button></p>' : ''}
    ${video.length ? `<h2 class="sezione">Ultimi montaggi</h2><div class="carosello">${video.map((v) => htmlLocandina(v, video)).join('')}</div>` : (lavori ? '' : '<p class="vuoto">Nessun montaggio ancora.</p>')}
    ${lavori ? '' : '<p class="meta-3">Lo stato si aggiorna da solo mentre l’app è aperta. Nessun montaggio parte da solo.</p>'}`;
}
function htmlVivo(s) {
  const attivi = s?.attivi || [];
  const pendenti = (s?.pendenti || []).map((p) => ({
    ...p,
    runId: p.runId || `coda-${p.nome || 'attesa'}`,
    nome: p.nome || 'In coda',
    fase: p.fase || 'installazione',
    faseNome: p.faseNome || 'Installazione',
    dettaglio: p.dettaglio || 'In attesa che il server parta',
  }));
  const falliti = s?.falliti || [];
  if (!attivi.length && !pendenti.length && !falliti.length) return '';
  return [...attivi.map(htmlCorso), ...pendenti.map(htmlCorso), ...falliti.map(htmlFallito)].join('');
}
function htmlCorso(a) {
  const fasi = a.fasi || [];
  const sub = [a.dettaglio, a.mancanoTesto].filter(Boolean).join(' · ');
  const rail = (fasi.length ? fasi : Array.from({ length: 7 }, () => ({}))).map((f) => `<i class="${f.fatta ? 'done' : ''} ${f.ora ? 'now' : ''} ${f.ko ? 'ko' : ''}"></i>`).join('');
  return `<article class="card" data-run="${esc(a.runId || a.nome || '')}" data-fase="${esc(a.fase || '')}">
    <p class="sr" aria-live="polite" data-annuncio></p>
    <div class="fase-riga"><i class="live-dot" aria-hidden="true"></i><h2 class="fase-nome" data-bind="fase">${esc(etichettaFase(a))}</h2><span class="numeri" data-bind="minuti">${a.minuti ? `${esc(a.minuti)} min` : ''}</span></div>
    <p class="meta" data-bind="sub">${esc(sub)}</p>
    <div class="rail" aria-hidden="true">${rail}</div>
    <p class="meta-3" data-bind="meta">${esc(metaLavoro(a))}</p>
    <button type="button" class="btn vetro" data-azione="dettagli-job" data-verso="${esc(a.runId || '')}">Dettagli</button>
  </article>`;
}
function htmlFallito(f) {
  return `<article class="card job--err" data-run="${esc(f.runId || '')}" data-fallito>
    <div class="testa-live"><i class="live-dot err" aria-hidden="true"></i><span>Non riuscito</span></div>
    <h2 class="fase-nome">${esc(f.nome || 'Montaggio')}</h2>
    <p class="motivo" data-bind="errore">${esc(f.errore || 'Si è fermato senza un motivo scritto.')}</p>
    <div class="coppia">
      ${f.puoRiprovare ? `<button type="button" class="btn" data-azione="riprova-giro" data-verso="${esc(f.runId)}">Riprova</button>` : ''}
      <button type="button" class="btn vetro" data-azione="dettagli-job" data-verso="${esc(f.runId || '')}">Dettagli</button>
    </div>
  </article>`;
}
function htmlUploadHero() {
  return `<button type="button" class="card hero" data-azione="scegli-file"><span class="disco">${ICO.up}</span><strong style="font-size:1.3rem;letter-spacing:-.02em">Carica il girato</strong><span class="sottotitolo">Scegli i video dal rullino. Il caricamento parte quando tocchi Carica.</span></button>`;
}
function htmlRigaCarica() {
  return `<button type="button" class="card riga-compatta" data-azione="scegli-file">${ICO.up}<span><strong>Carica altro girato</strong><span class="meta">Dal rullino, anche con i dati</span></span></button>`;
}
function htmlUploadCompatta() {
  const c = stato.carica;
  const pct = c.byteTotali ? Math.min(100, Math.round(100 * c.byteFatti / c.byteTotali)) : 0;
  const etichetta = c.pausa ? 'In pausa' : c.fase === 'codifica' ? 'Codifica sul telefono' : 'Caricamento';
  return `<button type="button" class="card" data-azione="apri-carica"><p class="meta">${etichetta}</p><p class="progresso-num" data-bind="pct">${pct}%</p><div class="barra" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Caricamento"><i data-barra style="width:${pct}%"></i></div><p class="meta numeri" data-bind="byte">${byteTxt(c.byteFatti)} di ${byteTxt(c.byteTotali)}</p></button>`;
}
function htmlProntoBox() {
  return `<article class="card" style="text-align:center"><div class="check-pop">${ICO.check}</div><h2 class="fase-nome">Girato al sicuro</h2><p class="meta">Il montaggio non parte finché non lo chiedi.</p><div class="coppia"><button type="button" class="btn" data-azione="monta-ora">Monta ora</button><button type="button" class="btn vetro" data-azione="piu-tardi">Più tardi</button></div></article>`;
}
function htmlRisultato(v) {
  return `<article class="card"><p class="meta">Pronto</p><h2 class="fase-nome">${esc(v.nome)}</h2><p class="meta">${esc(v.stile || '')}${v.durata ? ` · ${durataTxt(v.durata)}` : ''}</p><div class="coppia"><button type="button" class="btn" data-azione="apri-video" data-verso="${esc(v.runId)}">Guarda</button><button type="button" class="btn vetro" data-azione="correggi-vai" data-verso="${esc(v.runId)}">Correggi</button></div></article>`;
}
function htmlLocandina(v, tutti) {
  const sotto = rigaSecondaria(v, tutti);
  return `<button type="button" class="locandina" data-azione="apri-video" data-verso="${esc(v.runId)}" aria-label="${esc(v.nome)}">${htmlFaccia(v)}<span class="nome">${esc(v.nome)}</span>${sotto ? `<span class="sotto">${esc(sotto)}</span>` : ''}</button>`;
}
function copertinaDi(v) {
  return v?.memo?.pubblica?.copertinaId || v?.pubblica?.copertinaId || v?.copertinaId || '';
}
function dataCorta(q) {
  const n = typeof q === 'number' ? q : Date.parse(String(q || ''));
  if (!Number.isFinite(n) || n <= 0) return '';
  try { return new Date(n).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }); }
  catch { return ''; }
}
function rigaSecondaria(v, tutti) {
  const data = dataCorta(v?.quando);
  const dur = durataTxt(v?.durata);
  const nome = String(v?.nome || '').trim().toLowerCase();
  const gemelli = nome && (tutti || []).filter((x) => String(x?.nome || '').trim().toLowerCase() === nome).length > 1;
  if (gemelli && data && dur) return `${data} · ${dur}`;
  return data || dur;
}
function htmlFaccia(v) {
  const cover = copertinaDi(v);
  const punto = v.memo?.pubblicato ? 'pub' : v.memo?.approvato ? 'ok' : '';
  const dur = durataTxt(v.durata);
  const lettera = esc(String(v.nome || '?').trim().slice(0, 1).toUpperCase());
  const foto = cover ? `<img alt="" src="/api/media/${esc(cover)}" onerror="this.remove()">` : '';
  return `<span class="faccia" style="background:${tinta(v.nome)}"><span class="lettera">${lettera}</span>${foto}${dur ? `<span class="durata">${esc(dur)}</span>` : ''}<i class="punto ${punto}"></i></span>`;
}

function htmlVideo() {
  const filtri = [['tutti', 'Tutti'], ['approvare', 'Da approvare'], ['pubblicati', 'Pubblicati']];
  const lista = (stato.video || []).filter(passaFiltro);
  const vuoto = stato.filtro === 'approvare' ? 'Niente in attesa di approvazione.' : stato.filtro === 'pubblicati' ? 'Nessun video pubblicato da qui.' : 'Nessun video ancora. Quando un montaggio finisce, la locandina arriva qui.';
  return `${htmlBarra('Video')}<div class="filtri"><div class="segmenti" role="tablist" aria-label="Filtro video">${filtri.map(([id, nome]) => `<button type="button" aria-pressed="${(stato.filtro || 'tutti') === id ? 'true' : 'false'}" data-azione="filtro" data-verso="${id}">${nome}</button>`).join('')}</div></div>${lista.length ? `<div class="griglia-poster">${lista.map((v) => htmlPoster(v, lista)).join('')}</div>` : `<div class="vuoto">${ICO.film}<p>${vuoto}</p></div>`}`;
}
function passaFiltro(v) {
  const f = stato.filtro || 'tutti';
  const approvato = !!(v.memo?.approvato || v.approvato);
  const pub = !!(v.memo?.pubblicato || v.pubblicato);
  if (f === 'approvare') return !approvato && !pub;
  if (f === 'pubblicati') return pub;
  return true;
}
function htmlPoster(v, tutti) {
  const attivo = (stato.home?.stato?.attivi || []).find((a) => (a.nome || '').toLowerCase() === (v.nome || '').toLowerCase());
  const rail = attivo ? `<span class="rail sottile" aria-hidden="true">${(attivo.fasi || []).map((f) => `<i class="${f.fatta ? 'done' : ''} ${f.ora ? 'now' : ''}"></i>`).join('')}</span>` : '';
  const sotto = rigaSecondaria(v, tutti);
  return `<button type="button" class="poster" data-azione="apri-video" data-verso="${esc(v.runId)}" aria-label="${esc(v.nome)}, ${esc(v.stile || '')}">${htmlFaccia(v)}${rail}<span class="nome">${esc(v.nome)}</span>${sotto ? `<span class="sotto">${esc(sotto)}</span>` : ''}</button>`;
}

function htmlDettaglio() {
  const d = stato.dettaglio;
  if (!d) return `${htmlBarra('Video', { indietro: true })}<p class="meta">Apro…</p>`;
  const v = d.video || {};
  const m = d.memo || {};
  const pub = m.pubblica;
  const nome = m.nome || v.nome || 'Video';
  const titolo = pub?.youtube?.titolo || nome;
  const pubblicato = !!m.pubblicato;
  const approvato = !!m.approvato;
  const chip = pubblicato ? 'Pubblicato' : approvato ? 'Approvato' : 'Da approvare';
  const punto = pubblicato ? 'pub' : approvato ? 'ok' : '';
  const fileId = pub?.fileId;
  return `${htmlBarra('Video', { indietro: true, destra: `<button type="button" class="icona-btn" data-azione="apri-azioni" aria-label="Altre azioni">${ICO.more}</button>` })}
    ${d.playback && fileId ? `<video class="player" controls playsinline ${pub?.copertinaId ? `poster="/api/media/${esc(pub.copertinaId)}"` : ''} src="/api/media/${esc(fileId)}"></video>` : `<div class="cornice" style="background:${tinta(nome)}"><div><strong>${esc(nome)}</strong><p class="meta">${d.playback ? 'Apro il file…' : 'Per vederlo qui servono le chiavi Drive sul Worker.'}</p></div></div>`}
    <div class="testa-video"><span class="stato-chip"><i class="punto ${punto}"></i>${chip}</span>${v.link ? `<a class="link-quiet" href="${esc(v.link)}" target="_blank" rel="noopener">Apri su Drive</a>` : ''}</div>
    <h2 class="fase-nome">${esc(nome)}</h2>
    <div class="coppia">
      <button type="button" class="btn ${approvato ? 'vetro' : ''}" data-azione="video" data-verso="approva">${approvato ? 'Approvato' : 'Approva'}</button>
      <button type="button" class="btn ${approvato ? '' : 'vetro'}" data-azione="apri-pubblica" ${pub ? '' : 'disabled'}>Pubblica…</button>
    </div>
    ${pub ? `<label class="etichetta" for="titolo-inline">Titolo YouTube</label><input class="titolo-edit" id="titolo-inline" maxlength="100" value="${esc(titolo)}">` : '<p class="nota">Didascalie non ancora pronte.</p>'}`;
}

function htmlAltro() {
  const imp = stato.home?.impostazioni || {};
  const stili = stato.stili || [];
  const elenco = stato.cartelle?.cartelle?.elenco || [];
  const col = stato.collegamenti || {};
  const regia = stato.regia?.regia;
  let vetro = 'auto';
  try { if (localStorage.getItem('regista-vetro') === 'solido') vetro = 'solido'; } catch { /* auto */ }
  const effettiOff = document.documentElement.dataset.motion === 'off';
  const opt = (val, cur, et) => `<option value="${esc(val)}" ${cur === val ? 'selected' : ''}>${esc(et || val)}</option>`;
  return `${htmlBarra('Altro')}
    <section class="blocco"><h2>Stili</h2><div class="gruppo">
      <label class="riga-set">Predefinito<select data-imp="stile">${stili.map((s) => `<option ${s.nome === imp.stile ? 'selected' : ''}>${esc(s.nome)}</option>`).join('')}</select></label>
      ${stili.map((s) => `<div class="riga-set"><span>${esc(s.nome)}<span class="sub">${esc(s.cosa || s.desc || '')}</span></span></div>`).join('')}
      <button type="button" class="riga-set" data-azione="vai" data-verso="stile">Studia un nuovo stile<span class="chev">${ICO.chev}</span></button>
    </div></section>
    <section class="blocco"><h2>Montaggio</h2><div class="gruppo">
      <label class="riga-set">Prova prima<select data-imp="prova">${opt('manuale', imp.prova, 'A mano')}${opt('auto', imp.prova, 'Sempre, 10 s')}${opt('no', imp.prova, 'No, monta tutto')}</select></label>
      <div class="riga-set" style="align-items:flex-start;flex-direction:column">${elenco.length ? elenco.map((c) => `<label class="check"><input type="checkbox" value="${esc(c)}" data-lotto> ${esc(c)}</label>`).join('') : '<p class="meta">Nessuna cartella in elenco.</p>'}
        <button type="button" class="btn" data-azione="lotto" style="margin-top:8px">Monta le scelte</button>
        <button type="button" class="btn quiet" data-azione="aggiorna-cartelle">Aggiorna elenco</button>
      </div>
    </div><p class="nota">Il lotto parte solo quando tocchi Monta le scelte. Una cartella per giro.</p></section>
    <section class="blocco"><h2>Notifiche</h2><div class="gruppo">
      <button type="button" class="riga-set" data-azione="push">Notifiche su questo iPhone<span class="chev">${ICO.chev}</span></button>
      <button type="button" class="riga-set" data-azione="badge-test">Prova il badge<span class="chev">${ICO.chev}</span></button>
    </div><p class="nota">Le notifiche arrivano se l’app è sulla Home e sul Worker ci sono le chiavi VAPID. Altrimenti l’avviso resta in Oggi.</p></section>
    <section class="blocco"><h2>Collegamenti</h2><div class="gruppo">
      <div class="riga-set"><span>Instagram<span class="sub">${col.ig ? 'Collegato' : 'Non collegato'}</span></span></div>
      <div class="riga-set"><span>YouTube<span class="sub">${col.yt ? 'Collegato' : 'Non collegato'}</span></span></div>
    </div></section>
    <section class="blocco"><h2>Sicurezza</h2><div class="gruppo">
      <button type="button" class="riga-set" data-azione="sblocco">Autorizza un altro iPhone<span class="chev">${ICO.chev}</span></button>
      <button type="button" class="riga-set" data-azione="esci">Esci<span class="chev">${ICO.chev}</span></button>
    </div><p class="nota">Cartelle Drive: 01 · Da editare, 02 · Fatti, 03 · Da pubblicare. Il secondo account Telegram non entra nell’app.</p></section>
    <section class="blocco"><h2>Aspetto</h2><div class="gruppo">
      <div class="riga-set" style="flex-direction:column;align-items:stretch"><span>Vetro</span><div class="segmenti" style="margin-top:8px"><button type="button" data-azione="vetro" data-verso="auto" aria-pressed="${vetro === 'auto' ? 'true' : 'false'}">Auto</button><button type="button" data-azione="vetro" data-verso="solido" aria-pressed="${vetro === 'solido' ? 'true' : 'false'}">Solido</button></div></div>
      <button type="button" class="riga-set" data-azione="effetti">${effettiOff ? 'Effetti ridotti: sì' : 'Effetti ridotti: no'}<span class="chev">${ICO.chev}</span></button>
    </div><p class="nota">Solido toglie lo sfocato e lascia la grafite. Utile se il vetro sfarfalla.</p></section>
    <details class="blocco"><summary>Avanzate</summary><div class="gruppo">
      <label class="riga-set">AI<select data-imp="ai">${opt('gemini', imp.ai)}${opt('claude', imp.ai)}</select></label>
      <label class="riga-set">Gemini<select data-imp="gemini">${opt('flash', imp.gemini)}${opt('pro', imp.gemini)}</select></label>
      <label class="riga-set">Claude<select data-imp="modello">${['haiku', 'sonnet', 'opus'].map((m) => opt(m, imp.modello)).join('')}</select></label>
      <label class="riga-set">Versione<select data-imp="versione">${opt('stabile', imp.versione)}${opt('beta', imp.versione)}</select></label>
      <div class="riga-set" style="flex-direction:column;align-items:stretch">
        <span>Prova della regia<span class="sub">Solo il testo, su una cartella già montata. Non parte da un girato appena caricato.</span></span>
        <select id="regia-cartella">${elenco.map((c) => `<option>${esc(c)}</option>`).join('')}</select>
        <button type="button" class="btn vetro" data-azione="prova-regia">Chiedi la regia</button>
        ${regia ? `<p class="meta">${esc(regia.testo || '')}</p>` : ''}
      </div>
    </div></details>
    <p class="versione-app" data-debug>Regista</p>`;
}

function htmlStile() {
  const s = stato.studio;
  if (s.fase === 'studio' && s.bozza?.haTesto) {
    const b = s.bozza;
    return `${htmlBarra(b.nome || 'Bozza', { indietro: true })}
      ${htmlErroreStile(s)}
      <div class="card scheda-stile">${righeRiassunto(b.riassunto)}</div>
      ${b.voce === false ? '<p class="nota">Senza trascrizione: solo fotogrammi e ritmo.</p>' : ''}
      ${(b.daCreare || []).length ? `<div class="card da-creare"><p class="meta">Nel riferimento ci sono effetti che lo stile non sa ancora fare: per ora usa i più vicini.</p><ul>${b.daCreare.map((d) => `<li>${esc(d)}</li>`).join('')}</ul></div>` : ''}
      <div class="filo">${(b.messaggi || []).map((m) => `<p class="bolla ${m.ruolo === 'denis' ? 'denis' : 'ai'}">${esc(m.testo)}</p>`).join('')}</div>
      ${s.occupato ? `<div class="card" data-passo-stile><p class="meta">In corso</p><p data-bind="occupato">${esc(s.occupato)}</p></div>` : ''}
      <label class="etichetta" for="nome-stile">Nome dello stile</label>
      <input class="campo" id="nome-stile" value="${esc(b.nome || '')}" maxlength="40">
      <button type="button" class="btn vetro" data-azione="studio-salva">Salva stile</button>
      <p class="nota">Salvare lo mette in Monta e nel bot. Non parte nessun montaggio.</p>`;
  }
  const salvati = s.salvati || [];
  return `${htmlBarra('Studia uno stile', { indietro: true })}
    <p class="sottotitolo">Un video breve, tuo o di un creator. L’AI propone ritmo, scritte, colori e zoom. Poi lo correggi a parole.</p>
    ${s.occupato ? `<div class="card" data-passo-stile><p class="meta">In corso</p><p data-bind="occupato">${esc(s.occupato)}</p></div>` : ''}
    ${htmlErroreStile(s)}
    <div class="card">
      <label class="etichetta" for="file-stile">Video di riferimento</label>
      <input class="campo" id="file-stile" type="file" accept="video/*">
      <button type="button" class="btn" data-azione="studia" ${s.occupato || s.invio ? 'disabled' : ''}>Studia</button>
      <p class="nota">Il video va su Cloudflare a pezzi (si riprende se si interrompe), poi l’AI lo guarda tutto, con l’audio, in 2–5 minuti: puoi chiudere l’app, ti avviso su Telegram. Non apre un montaggio e non compare in Oggi.</p>
      <p class="nota" data-upload-stile>${esc(s.nota || '')}</p>
    </div>
    ${s.bozza?.haTesto ? `<div class="card scheda-stile"${s.errore ? ' data-bozza-precedente' : ''}><p class="meta">${s.errore ? 'Bozza precedente, non è stata toccata.' : 'Bozza'}</p>${righeRiassunto(s.bozza.riassunto)}<button type="button" class="btn vetro" data-azione="studio-continua">${s.errore ? 'Apri la bozza di prima' : 'Continua'}</button></div>` : ''}
    <h2 class="sezione">Salvati</h2>
    <div class="lista">${salvati.length ? salvati.map((v) => `<article class="card"><strong>${esc(v.nome)}</strong><span class="meta">${esc(v.desc || '')}</span><div class="azioni-riga"><button type="button" class="btn vetro" data-azione="studio-apri" data-verso="${esc(v.id)}">Apri</button><button type="button" class="btn vetro" data-azione="studio-rinomina" data-verso="${esc(v.id)}">Rinomina</button><button type="button" class="btn vetro" data-azione="studio-duplica" data-verso="${esc(v.id)}">Duplica</button><button type="button" class="btn pericolo" data-azione="studio-elimina" data-verso="${esc(v.id)}">Elimina</button></div></article>`).join('') : '<p class="vuoto">Nessuno ancora. Il primo che salvi compare anche in Monta.</p>'}</div>`;
}

function testaFoglio(titolo) {
  return `<div class="sheet__grab" aria-hidden="true"></div><div class="sheet__testa"><h2 id="sheet-titolo">${esc(titolo)}</h2><button type="button" class="icona-btn" data-azione="chiudi-foglio" aria-label="Chiudi">${ICO.close}</button></div>`;
}
function htmlFoglio() {
  const t = stato.foglio?.tipo;
  if (t === 'carica') return htmlFoglioCarica();
  if (t === 'monta') return htmlFoglioMonta();
  if (t === 'pubblica') return htmlFoglioPubblica();
  if (t === 'azioni') return htmlFoglioAzioni();
  if (t === 'fasi') return htmlFoglioFasi();
  if (t === 'conferma') return htmlFoglioConferma();
  return '';
}
function aiutoModo(id) {
  if (id === 'scelti') return 'Solo le clip che servono per far partire la regia. Il resto, quando hai il Wi-Fi.';
  if (id === 'proxy') return 'Circa 720p, sul telefono. Non è da pubblicare. Lo schermo resta acceso per tutta la codifica.';
  return 'Qualità della camera. È il file da pubblicare.';
}
function htmlFoglioCarica() {
  const c = stato.carica;
  const dati = stato.rete === 'dati';
  const modi = [['originali', 'Originali'], ['scelti', 'Solo scelti'], ['proxy', 'Leggera']];
  const tot = (c.selezionati || []).reduce((t, f) => t + (f.size || 0), 0) || c.byteTotali;
  const pct = c.byteTotali ? Math.min(100, Math.round(100 * c.byteFatti / c.byteTotali)) : 0;
  const vivo = c.fase === 'invio' || c.fase === 'pausa' || c.fase === 'codifica';
  const sorgente = (c.selezionati && c.selezionati.length) ? c.selezionati : (c.file || []).map((f) => ({ name: f.nome, size: f.size, type: '' }));
  const fileHtml = sorgente.map((f, i) => {
    const src = anteprime.get(f) || '';
    const fatto = (c.file || []).find((x) => x.nome === f.name);
    const p = fatto && fatto.size ? Math.min(100, Math.round(100 * (fatto.fatti || 0) / fatto.size)) : 0;
    return `<div class="file-riga" data-file="${esc(f.name)}">${src ? `<img alt="" data-thumb="${i}" src="${src}">` : `<span class="ph" data-thumb="${i}"></span>`}<span class="nome"><b>${esc(f.name)}</b><span class="meta numeri">${byteTxt(f.size)}</span>${vivo ? `<span class="mini-bar"><i style="width:${p}%"></i></span>` : ''}</span></div>`;
  }).join('');
  let corpo = '';
  if (c.fase === 'pronto') {
    corpo = `<div class="check-pop">${ICO.check}</div><h2 class="fase-nome" style="text-align:center">Girato al sicuro</h2><p class="meta" style="text-align:center">I pezzi sono su Cloudflare. Il montaggio parte solo se tocchi Monta ora.</p>${c.modalita !== 'originali' ? '<p class="nota">Gli originali interi, quando hai il Wi-Fi. Il montaggio già partito non li vede da solo: dopo, dalla scheda del video, Rifai.</p>' : ''}`;
  } else if (vivo) {
    corpo = `<p class="meta">${c.fase === 'codifica' ? 'Sul telefono' : c.pausa ? 'In pausa' : testoParallelo()}</p>
      <p class="progresso-num" data-bind="pct">${c.fase === 'codifica' ? '' : `${pct}%`}</p>
      <div class="barra" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Caricamento"><i data-barra style="width:${pct}%"></i></div>
      <p class="numeri" data-bind="byte">${byteTxt(c.byteFatti)} / ${byteTxt(c.byteTotali)} · ${pct}%</p>
      <p class="meta numeri" data-bind="eta">${c.fase === 'codifica' ? esc(c.nota || 'Codifico… tieni l’app aperta.') : tempoTxt(c.eta)}</p>
      <p class="meta" data-bind="pezzi">${c.pezziFatti} pezzi al sicuro, non si rimandano${c.inVolo ? ` · ${c.inVolo} in viaggio` : ''}</p>
      <p class="meta" data-bind="velocita"></p>
      <p class="meta" data-bind="codifica">${esc(c.nota || '')}</p>
      <p class="nota">${bloccoSchermo ? 'Schermo tenuto acceso.' : 'Tieni l’app aperta: iOS ferma l’invio se la chiudi.'}</p>
      ${fileHtml}`;
  } else {
    corpo = `<p class="meta">Safari non vede la rete: scegli tu.</p>
      <div class="segmenti" aria-label="Connessione"><button type="button" data-azione="rete" data-verso="dati" aria-pressed="${dati ? 'true' : 'false'}">Dati</button><button type="button" data-azione="rete" data-verso="wifi" aria-pressed="${dati ? 'false' : 'true'}">Wi-Fi</button></div>
      <p class="nota">${dati ? 'Sei sui dati. La copia leggera pesa meno; gli originali, quando hai il Wi-Fi.' : 'Wi-Fi. Meglio gli originali: i pezzi viaggiano insieme, quelli già arrivati non si rimandano.'}</p>
      <div class="segmenti" aria-label="Tipo di file">${modi.map(([id, nome]) => `<button type="button" data-azione="modalita" data-verso="${id}" aria-pressed="${c.modalita === id ? 'true' : 'false'}">${nome}</button>`).join('')}</div>
      <p class="nota">${aiutoModo(c.modalita)}</p>
      <label class="etichetta" for="nome-video">Nome del video</label>
      <input class="campo" id="nome-video" value="${esc(c.nome)}" ${c.archivio ? 'readonly' : ''} autocomplete="off">
      ${c.modalita === 'proxy' ? `<div class="coppia"><label>Dal secondo<input class="campo" id="proxy-da" type="number" min="0" inputmode="numeric" value="${c.da}"></label><label>Al secondo<input class="campo" id="proxy-a" type="number" min="1" inputmode="numeric" value="${c.a}"></label></div><p class="nota">La codifica è in tempo reale: 90 secondi di clip sono 90 secondi a schermo acceso. Un pezzo di file tagliato a metà non è un video valido.</p>` : ''}
      <label class="etichetta" for="file-girato">${c.modalita === 'scelti' ? 'Clip che servono' : 'File'}${tot ? ` · ${esc(byteTxt(tot))}` : ''}</label>
      <input class="campo" id="file-girato" type="file" accept="video/*,image/*,audio/*" multiple>
      ${fileHtml}
      ${c.daRiselezionare ? '<div class="banner">iOS ha chiuso i file. Selezionali di nuovo, stesso nome e stessa dimensione: i pezzi già arrivati restano.</div>' : ''}
      ${c.errore ? `<div class="banner">${esc(c.errore)}</div>` : ''}
      <p class="nota">Se cambi app, iOS può fermare l’invio. Riapri: riparte dai pezzi già fatti. La sveglia dello schermo resta accesa solo mentre la pagina è visibile.</p>`;
  }
  let bar = '';
  if (c.fase === 'pronto' && !c.archivio) bar = `<div class="sheet__bar"><button type="button" class="btn" data-azione="monta-ora">Monta ora</button><button type="button" class="btn quiet" data-azione="piu-tardi">Più tardi</button></div>`;
  else if (c.fase === 'pronto' && c.archivio) bar = `<div class="sheet__bar"><button type="button" class="btn" data-azione="copia-drive">Copiali su Drive</button></div>`;
  else if (c.fase === 'invio' || c.fase === 'pausa') bar = `<div class="sheet__bar"><div class="coppia"><button type="button" class="btn vetro" data-azione="${c.pausa ? 'riprendi-upload' : 'pausa-upload'}">${c.pausa ? 'Riprendi' : 'Pausa'}</button><button type="button" class="btn pericolo" data-azione="annulla-upload">Annulla</button></div><p class="meta-3">${c.pausa ? 'I pezzi già arrivati restano. Riprendi da dove era.' : 'Pausa tiene i pezzi. Annulla butta questo caricamento.'}</p></div>`;
  else if (!vivo) bar = `<div class="sheet__bar"><button type="button" class="btn" data-azione="avvia-upload">${c.archivio ? 'Manda il resto' : `Carica${tot ? ` ${byteTxt(tot)}` : ''}`}</button>${dati && tot ? `<p class="meta-3">Userà circa ${byteTxt(tot)} di dati.</p>` : ''}</div>`;
  return `${testaFoglio('Carica')}<div class="sheet__corpo">${corpo}</div>${bar}`;
}
function testoParallelo() {
  const n = paralleloScelto(4);
  return `${n} pezzi insieme`;
}
function preparaNuovo(opts = {}) {
  const up = stato.home?.upload;
  const pronto = !!(up?.pronto || stato.carica.fase === 'pronto');
  const cartellaPronta = pronto ? (up?.nome || stato.carica.nome || '') : '';
  if (stato.nuovo?.dati && !opts.forza) {
    if (cartellaPronta) stato.nuovo.dati.cartella = cartellaPronta;
    return;
  }
  stato.nuovo = {
    passo: 'riepilogo',
    dati: {
      cartella: cartellaPronta,
      stile: stato.home?.impostazioni?.stile || stato.stili[0]?.nome || 'Blueprint',
      sponsor: '', durata: '', tono: '', giudizio: '', tavola: '', note: '', sponsorSi: false,
    },
  };
}
function leggiCampiMonta() {
  const n = stato.nuovo;
  if (!n?.dati) return;
  const c = document.getElementById('nome-cartella');
  if (c) n.dati.cartella = c.value.trim();
  const s = document.getElementById('sponsor');
  if (s) n.dati.sponsor = s.value.trim();
  const note = document.getElementById('note');
  if (note) n.dati.note = note.value.trim();
  const t = document.getElementById('tavola');
  if (t) n.dati.tavola = t.value.trim();
  const si = document.getElementById('sponsor-si');
  if (si) n.dati.sponsorSi = si.checked;
}
function riepilogoMonta() {
  const d = stato.nuovo?.dati || {};
  return [d.cartella || 'Cartella', d.stile || 'Stile', d.durata || 'Auto'].join(' · ');
}
function htmlFoglioMonta() {
  preparaNuovo();
  const d = stato.nuovo.dati;
  const stili = stato.stili.length ? stato.stili : (stato.cartelle?.stili || []);
  const elenco = stato.cartelle?.cartelle?.elenco || [];
  const durate = [['', 'Auto'], ['30 s', '30 s'], ['45 s', '45 s'], ['60 s', '60 s']];
  const toni = [['', 'Auto'], ['diretto', 'Diretto'], ['ironico', 'Ironico'], ['tecnico', 'Tecnico'], ['entusiasta', 'Entusiasta']];
  const giudizi = [['', 'Dal video'], ['PROMOSSO ✓', 'Promosso'], ['CI STA', 'Ci sta'], ['NON È MALE', 'Non è male'], ['BOCCIATO ✗', 'Bocciato'], ['-', 'Nessuna scritta']];
  return `${testaFoglio('Monta')}<div class="sheet__corpo">
      <p class="meta">Niente parte finché non tocchi Avvia montaggio.</p>
      <label class="etichetta" for="nome-cartella">Cartella</label>
      <input class="campo" id="nome-cartella" value="${esc(d.cartella)}" autocomplete="off" placeholder="Nome della cartella">
      ${elenco.length ? `<div class="chip-fila">${elenco.map((c) => `<button type="button" class="cartella-chip" data-azione="cartella-rapida" data-verso="${esc(c)}" aria-pressed="${d.cartella === c ? 'true' : 'false'}">${(stato.cartelle?.cartelle?.vai || []).includes(c) ? 'VAI · ' : ''}${esc(c)}</button>`).join('')}</div>` : ''}
      <p class="etichetta">Stile</p>
      <div class="chip-fila" role="listbox" aria-label="Stile">${stili.map((s) => `<button type="button" class="chip-stile" role="option" aria-selected="${s.nome === d.stile ? 'true' : 'false'}" data-azione="scegli-stile" data-verso="${esc(s.nome)}"><strong>${esc(s.tasto || s.nome)}</strong><small>${esc(s.cosa || s.desc || '')}</small></button>`).join('')}</div>
      <button type="button" class="disclosure" data-azione="toggle-dettagli" aria-expanded="false">Dettagli</button>
      <div id="monta-dettagli" hidden>
        <p class="etichetta">Durata</p>
        <div class="segmenti">${durate.map(([v, et]) => `<button type="button" data-azione="imposta" data-campo="durata" data-verso="${esc(v)}" aria-pressed="${d.durata === v ? 'true' : 'false'}">${et}</button>`).join('')}</div>
        <p class="etichetta">Tono</p>
        <div class="segmenti">${toni.map(([v, et]) => `<button type="button" data-azione="imposta" data-campo="tono" data-verso="${esc(v)}" aria-pressed="${d.tono === v ? 'true' : 'false'}">${et}</button>`).join('')}</div>
        <p class="etichetta">Giudizio</p>
        <div class="segmenti">${giudizi.map(([v, et]) => `<button type="button" data-azione="imposta" data-campo="giudizio" data-verso="${esc(v)}" aria-pressed="${d.giudizio === v ? 'true' : 'false'}">${et}</button>`).join('')}</div>
        <label class="riga-set" style="border:0;padding-left:0"><span>Sponsor</span><input id="sponsor-si" type="checkbox" ${d.sponsorSi ? 'checked' : ''} style="margin-left:auto"></label>
        <div id="blocco-sponsor" ${d.sponsorSi ? '' : 'hidden'}><input class="campo" id="sponsor" placeholder="es. eSUN PETG, stampa Benchy veloce" value="${esc(d.sponsor)}"></div>
        <div id="blocco-tavola" ${d.stile === 'Blueprint' ? '' : 'hidden'}><label class="etichetta" for="tavola">Numero tavola</label><input class="campo" id="tavola" placeholder="TAV. 05" value="${esc(d.tavola)}"></div>
        <label class="etichetta" for="note">Indicazioni</label>
        <textarea id="note" placeholder="Cosa dire, cosa evitare…">${esc(d.note)}</textarea>
      </div>
    </div>
    <div class="sheet__bar"><p class="meta numeri" data-bind="riepilogo">${esc(riepilogoMonta())}</p><button type="button" class="btn" data-azione="avvia-montaggio">Avvia montaggio</button></div>`;
}
function htmlFoglioPubblica() {
  const pub = stato.dettaglio?.memo?.pubblica;
  if (!pub) return `${testaFoglio('Pubblica')}<div class="sheet__corpo"><p class="nota">Didascalie non ancora pronte.</p></div>`;
  return `${testaFoglio('Pubblica')}<div class="sheet__corpo">
      <label class="etichetta" for="didascalia">Didascalia</label>
      <textarea id="didascalia">${esc(pub.didascalia || '')}</textarea>
      <button type="button" class="btn vetro" data-azione="salva-didascalia">Salva didascalia</button>
      <label class="etichetta" for="titolo-yt">Titolo YouTube</label>
      <input class="campo" id="titolo-yt" value="${esc(pub.youtube?.titolo || '')}">
      <button type="button" class="btn vetro" data-azione="salva-titolo">Salva titolo</button>
      <div class="coppia"><button type="button" class="btn vetro" data-azione="video" data-verso="ig">Instagram ${pub.ig === false ? 'spento' : 'acceso'}</button><button type="button" class="btn vetro" data-azione="video" data-verso="yt">YouTube ${pub.yt === false ? 'spento' : 'acceso'}</button></div>
    </div><div class="sheet__bar"><button type="button" class="btn" data-azione="video" data-verso="pubblica">Pubblica</button></div>`;
}
function htmlFoglioAzioni() {
  const d = stato.dettaglio || {};
  const stili = stato.stili.length ? stato.stili : [];
  const corrente = d.memo?.stile || d.video?.stile || '';
  return `${testaFoglio('Azioni')}<div class="sheet__corpo">
      <label class="etichetta" for="stile-video">Cambia stile</label>
      <select id="stile-video">${stili.map((s) => `<option ${s.nome === corrente ? 'selected' : ''}>${esc(s.nome)}</option>`).join('')}</select>
      <button type="button" class="btn vetro" data-azione="video" data-verso="prova">Prova ${d.provaSecondi || 10} s</button>
      <button type="button" class="btn vetro" data-azione="video" data-verso="intero">Stile intero</button>
      <button type="button" class="btn vetro" data-azione="video" data-verso="render">Solo render</button>
      <button type="button" class="btn vetro" data-azione="video" data-verso="riprova">Riprova</button>
      <button type="button" class="btn vetro" data-azione="manda-resto">Manda il resto degli originali</button>
      <button type="button" class="btn quiet" data-azione="apri-pubblica">Didascalia e titolo</button>
      <button type="button" class="btn pericolo" data-azione="chiedi-rifai">Rifai da capo</button>
    </div>`;
}
function htmlFoglioFasi() {
  const id = stato.foglio?.id || '';
  const s = stato.home?.stato || {};
  const job = [...(s.attivi || []), ...(s.pendenti || []), ...(s.falliti || [])].find((x) => String(x.runId || '') === String(id)) || (s.attivi || [])[0] || (s.falliti || [])[0];
  if (!job) return `${testaFoglio('Dettagli')}<div class="sheet__corpo"><p class="nota">Non c’è un giro aperto.</p></div>`;
  const fasi = job.fasi || [];
  return `${testaFoglio(job.nome || 'Montaggio')}<div class="sheet__corpo">
      <p class="fase-nome" style="font-size:1.6rem;font-weight:700;letter-spacing:-.03em;margin:0 0 8px">${esc(etichettaFase(job))}</p>
      <p class="meta">${esc([job.dettaglio, job.mancanoTesto, job.minuti ? `${job.minuti} min già passati` : ''].filter(Boolean).join(' · '))}</p>
      ${job.errore ? `<p class="motivo">${esc(job.errore)}</p>` : ''}
      <ul class="fase-lista">${fasi.map((f) => `<li class="${f.fatta ? 'done' : ''} ${f.ora ? 'now' : ''} ${f.ko ? 'ko' : ''}"><i class="segno"></i><span><strong>${esc(FASE_BREVE[f.id] || f.nome)}</strong>${f.dettaglio ? `<span class="meta"> ${esc(f.dettaglio)}</span>` : ''}</span></li>`).join('')}</ul>
      ${job.puoRiprovare ? `<button type="button" class="btn" data-azione="riprova-giro" data-verso="${esc(job.runId)}">Riprova</button>` : ''}
    </div>`;
}
function htmlFoglioConferma() {
  return `${testaFoglio('Rifaccio da capo?')}<div class="sheet__corpo"><p class="nota">Riparte l’analisi e il montaggio, con gli stessi dati. È il giro più lungo.</p></div><div class="sheet__bar"><button type="button" class="btn pericolo" data-azione="conferma-rifai">Sì, rifai</button><button type="button" class="btn quiet" data-azione="chiudi-foglio">Annulla</button></div>`;
}

function renderComposer() {
  const el = document.getElementById('composer');
  const guscio = document.getElementById('guscio');
  const dett = stato.schermo === 'dettaglio' && stato.dettaglio && !stato.foglio;
  const studio = stato.schermo === 'stile' && stato.studio.fase === 'studio' && stato.studio.bozza?.haTesto && !stato.foglio;
  if (!dett && !studio) { el.hidden = true; guscio.classList.remove('con-compositore'); return; }
  el.hidden = false;
  guscio.classList.add('con-compositore');
  if (dett) {
    const idee = ['Più corto', 'Taglia l’inizio', 'Cambia musica'];
    el.innerHTML = `<div class="idee">${idee.map((t) => `<button type="button" class="chip-idea" data-azione="idea" data-verso="${esc(t)}">${esc(t)}</button>`).join('')}</div><form class="composer-riga" id="form-correzione"><label class="sr" for="correzione">Cosa cambio?</label><input id="correzione" placeholder="Cosa cambio?" enterkeyhint="send" autocomplete="off" value="${esc(stato.bozzaCorrezione || '')}"><button class="invia" type="submit" aria-label="Invia correzione">${ICO.send}</button></form>`;
  } else {
    el.innerHTML = `<form class="composer-riga" id="form-stile"><label class="sr" for="detto-stile">Nota per lo stile</label><input id="detto-stile" placeholder="Più veloce, sottotitoli gialli, meno zoom" enterkeyhint="send" value="${esc(stato.studio.notaInput || '')}"><button class="invia" type="submit" aria-label="Invia nota" ${stato.studio.occupato ? 'disabled' : ''}>${ICO.send}</button></form>`;
  }
}
function renderFoglio() {
  const host = document.getElementById('sheet-host');
  const scrim = document.getElementById('scrim');
  const sheet = document.getElementById('sheet');
  if (!stato.foglio) {
    sheet.classList.remove('is-open');
    scrim.classList.remove('is-on');
    sheet.setAttribute('aria-hidden', 'true');
    clearTimeout(renderFoglio._t);
    renderFoglio._t = setTimeout(() => { if (!stato.foglio) host.hidden = true; }, 420);
    return;
  }
  host.hidden = false;
  scrim.classList.add('is-on');
  sheet.setAttribute('aria-hidden', 'false');
  sheet.innerHTML = htmlFoglio();
  requestAnimationFrame(() => sheet.classList.add('is-open'));
}
function apriFoglio(tipo, extra = {}) {
  try { leggiCampiCarica(); } catch { /* chiuso */ }
  leggiCampiMonta();
  stato.foglio = { tipo, ...extra };
  disegna({ tieniScroll: true });
  const chiudi = document.querySelector('#sheet [data-azione="chiudi-foglio"]');
  chiudi?.focus();
}
function chiudiFoglio() {
  try { leggiCampiCarica(); } catch { /* chiuso */ }
  leggiCampiMonta();
  stato.foglio = null;
  disegna({ tieniScroll: true });
}

function patchVivo(s) {
  const lista = [...(s.attivi || []), ...(s.pendenti || [])];
  for (const a of lista) {
    const card = document.querySelector(`[data-run="${String(a.runId || a.nome || '').replace(/"/g, '')}"]`);
    if (!card || card.hasAttribute('data-fallito')) continue;
    const nome = etichettaFase(a);
    const faseEl = card.querySelector('[data-bind="fase"]');
    if (faseEl && faseEl.textContent !== nome) {
      faseEl.textContent = nome;
      const ann = card.querySelector('[data-annuncio]');
      if (ann) ann.textContent = `Fase: ${nome}`;
    }
    const sub = card.querySelector('[data-bind="sub"]');
    if (sub) sub.textContent = [a.dettaglio, a.mancanoTesto].filter(Boolean).join(' · ');
    const min = card.querySelector('[data-bind="minuti"]');
    if (min) min.textContent = a.minuti ? `${a.minuti} min` : '';
    const meta = card.querySelector('[data-bind="meta"]');
    if (meta) meta.textContent = metaLavoro(a);
    const rail = card.querySelector('.rail');
    (a.fasi || []).forEach((f, i) => {
      const el = rail?.children[i];
      if (el) el.className = `${f.fatta ? 'done' : ''} ${f.ora ? 'now' : ''} ${f.ko ? 'ko' : ''}`.trim();
    });
  }
  for (const f of s.falliti || []) {
    const card = document.querySelector(`[data-run="${String(f.runId || '').replace(/"/g, '')}"]`);
    const er = card?.querySelector('[data-bind="errore"]');
    if (er && f.errore) er.textContent = f.errore;
  }
}

let pollTimer = 0;
let pollVisti = null;
function ritardoPoll() {
  if (stato._errori) return Math.min(60000, 4000 * 2 ** Math.min(4, stato._errori));
  const attivo = !!(stato.home?.stato?.attivi?.length || stato.home?.stato?.pendenti?.length || stato.carica.fase === 'invio');
  return attivo ? 4000 : 20000;
}
function pianificaPoll() {
  clearTimeout(pollTimer);
  if (DEMO || document.hidden || stato.schermo === 'accesso' || !stato.home) return;
  pollTimer = setTimeout(cicloPoll, ritardoPoll());
}
async function cicloPoll() {
  if (DEMO || document.hidden || !stato.home) return;
  try {
    const s = await api('/api/stato');
    const prima = pollVisti;
    const ora = new Set((s.attivi || []).map((a) => String(a.runId)));
    const falliti = new Map((s.falliti || []).map((f) => [String(f.runId), f]));
    if (prima && document.hidden && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      for (const id of prima) {
        if (ora.has(id)) continue;
        const ko = falliti.get(id);
        const reg = await navigator.serviceWorker?.getRegistration?.();
        reg?.showNotification(ko ? 'Montaggio fermo' : 'Montaggio pronto', {
          body: ko ? (ko.errore || 'Apri Regista per riprovare.') : 'Il video è in Regista.',
          icon: '/icon-192.png',
          data: { url: '/' },
        }).catch(() => {});
      }
    }
    pollVisti = ora;
    stato._errori = 0;
    stato.home.stato = s;
    const box = document.querySelector('[data-vivo]');
    if (box && stato.schermo === 'oggi') {
      const firma = firmaStato(s);
      if (box.dataset.firma === firma) patchVivo(s);
      else { box.dataset.firma = firma; box.innerHTML = htmlVivo(s); }
    }
    aggiornaBadge();
    if (stato.foglio?.tipo === 'fasi') {
      const sheet = document.getElementById('sheet');
      if (sheet && !sheet.contains(document.activeElement)) sheet.innerHTML = htmlFoglioFasi();
      document.getElementById('sheet')?.classList.add('is-open');
    }
  } catch { stato._errori = (stato._errori || 0) + 1; }
  pianificaPoll();
}
function assicuratiPoll() {
  if (assicuratiPoll.acceso || DEMO) return;
  assicuratiPoll.acceso = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') cicloPoll();
    else clearTimeout(pollTimer);
  });
  pianificaPoll();
}

const anteprime = new WeakMap();
function codaAnteprime() {
  (stato.carica.selezionati || []).slice(0, 12).forEach((f, i) => {
    if (!f || anteprime.has(f) || !String(f.type || '').startsWith('video/')) return;
    anteprime.set(f, '');
    catturaAnteprima(f, i);
  });
}
async function catturaAnteprima(file, i) {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'metadata';
  video.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
  const url = URL.createObjectURL(file);
  video.src = url;
  document.body.appendChild(video);
  try {
    await new Promise((ok, ko) => { video.onloadeddata = ok; video.onerror = ko; setTimeout(ko, 4000); });
    const p = attendiVideo(video, 'seeked', 800).catch(() => {});
    video.currentTime = Math.min(0.15, (video.duration || 1) / 8);
    await p;
    const cnv = document.createElement('canvas');
    cnv.width = 40;
    cnv.height = 40;
    cnv.getContext('2d').drawImage(video, 0, 0, 40, 40);
    const data = cnv.toDataURL('image/jpeg', 0.55);
    anteprime.set(file, data);
    document.querySelectorAll(`[data-thumb="${i}"]`).forEach((el) => {
      if (el.tagName === 'IMG') el.src = data;
      else {
        const img = document.createElement('img');
        img.alt = '';
        img.src = data;
        img.dataset.thumb = String(i);
        el.replaceWith(img);
      }
    });
  } catch { /* riquadro vuoto */ }
  finally { URL.revokeObjectURL(url); video.remove(); }
}

function agganciaFoglio() {
  const sheet = document.getElementById('sheet');
  let startY = 0;
  let lastY = 0;
  let startT = 0;
  let drag = false;
  sheet.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('.sheet__grab')) return;
    drag = true;
    startY = lastY = e.clientY;
    startT = performance.now();
    sheet.setPointerCapture?.(e.pointerId);
    sheet.style.transition = 'none';
  });
  sheet.addEventListener('pointermove', (e) => {
    if (!drag) return;
    lastY = e.clientY;
    const dy = Math.max(0, lastY - startY);
    sheet.style.transform = `translateY(${dy}px)`;
  });
  const fine = () => {
    if (!drag) return;
    drag = false;
    const dy = Math.max(0, lastY - startY);
    const dt = Math.max(1, performance.now() - startT);
    const vel = dy / dt;
    sheet.style.transition = '';
    sheet.style.transform = '';
    if (dy > sheet.getBoundingClientRect().height * 0.35 || vel > 0.5) chiudiFoglio();
    else sheet.classList.add('is-open');
  };
  sheet.addEventListener('pointerup', fine);
  sheet.addEventListener('pointercancel', fine);
}
function agganciaViewport() {
  const vv = window.visualViewport;
  const aggiorna = () => aggiornaQuadro();
  if (!vv) return;
  vv.addEventListener('resize', aggiorna);
  vv.addEventListener('scroll', aggiorna);
  window.addEventListener('resize', aggiorna);
}
/* In standalone iOS il viewport di layout può finire ~62px sopra il bordo
   fisico (screen.height − innerHeight, offsetTop 0). Quel tratto non si
   dipinge: non si allunga il guscio. Se il buco c’è, il dock sta a 8px
   dal fondo del viewport, tutto visibile. Se il viewport riempie lo
   schermo, si usa max(8px, safe-area-inset-bottom − 10px). */
function deltaSchermo() {
  const ih = window.innerHeight;
  let sh = window.screen.height;
  let delta = sh - ih;
  if (!(delta > 0 && delta < 100) && window.devicePixelRatio > 1) {
    const cssH = sh / window.devicePixelRatio;
    if (cssH - ih > 0 && cssH - ih < 100) {
      sh = cssH;
      delta = sh - ih;
    }
  }
  return { delta: Math.round(delta), sh: Math.round(sh) };
}
function bucoSotto() {
  const solo = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (!solo) return false;
  const offset = window.visualViewport ? window.visualViewport.offsetTop : 0;
  const { delta } = deltaSchermo();
  return offset < 8 && delta > 24 && delta < 100;
}
function aggiornaQuadro() {
  const vv = window.visualViewport;
  const inset = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
  document.documentElement.style.setProperty('--kbd', `${Math.round(inset)}px`);
  const tastiera = inset > 80;
  document.documentElement.classList.toggle('tastiera', tastiera);
  if (!tastiera) {
    if (bucoSotto()) document.documentElement.style.setProperty('--dock-bottom', '8px');
    else document.documentElement.style.removeProperty('--dock-bottom');
  }
  misuraPad();
}
function misuraPad() {
  const dock = document.getElementById('dock');
  const view = document.getElementById('view');
  if (!view) return;
  if (!dock || dock.hidden) {
    document.documentElement.style.removeProperty('--pad-b');
    return;
  }
  const dr = dock.getBoundingClientRect();
  const vr = view.getBoundingClientRect();
  const pad = Math.max(16, Math.ceil(vr.bottom - dr.top + 16));
  document.documentElement.style.setProperty('--pad-b', `${pad}px`);
}
function testoDiagnostica() {
  const sonda = document.createElement('div');
  sonda.style.cssText = 'position:fixed;left:0;bottom:0;width:0;visibility:hidden;pointer-events:none;';
  document.body.appendChild(sonda);
  const leggi = (h) => {
    sonda.style.height = h;
    return Math.round(sonda.getBoundingClientRect().height);
  };
  const insetB = leggi('env(safe-area-inset-bottom)');
  const insetT = leggi('env(safe-area-inset-top)');
  sonda.remove();
  const dock = document.getElementById('dock');
  const r = dock?.getBoundingClientRect();
  const vv = window.visualViewport;
  const ih = window.innerHeight;
  const { delta, sh } = deltaSchermo();
  const bottom = dock ? getComputedStyle(dock).bottom : '—';
  const pos = dock ? getComputedStyle(dock).position : '—';
  return [
    `innerHeight ${ih}`,
    `visualViewport ${vv ? Math.round(vv.height) : '—'}  offset ${vv ? Math.round(vv.offsetTop) : '—'}`,
    `screen.height ${window.screen.height}`,
    `clientHeight ${document.documentElement.clientHeight}`,
    `outerHeight ${window.outerHeight}`,
    `env top ${insetT}   bottom ${insetB}`,
    `buco ${bucoSotto() ? `sì ${delta}px` : 'no'}`,
    `dock ${pos}  css ${bottom}`,
    `rect.bottom ${r ? Math.round(r.bottom) : '—'}`,
    `gap inner ${r ? Math.round(ih - r.bottom) : '—'}`,
    `gap screen ${r ? Math.round(sh - r.bottom) : '—'}`,
  ].join('\n');
}
function mostraDebug() {
  aggiornaQuadro();
  let el = document.getElementById('debug-pannello');
  if (!el) {
    el = document.createElement('div');
    el.id = 'debug-pannello';
    el.className = 'debug-pannello';
    el.innerHTML = '<pre></pre><button type="button" data-chiudi-debug>Chiudi</button>';
    document.body.appendChild(el);
    el.querySelector('[data-chiudi-debug]').addEventListener('click', () => { el.hidden = true; });
  }
  el.hidden = false;
  el.querySelector('pre').textContent = testoDiagnostica();
}
function agganciaDebug() {
  let timer = 0;
  document.addEventListener('pointerdown', (e) => {
    if (!e.target.closest?.('[data-debug]')) return;
    clearTimeout(timer);
    timer = setTimeout(() => mostraDebug(), 500);
  });
  const stop = () => clearTimeout(timer);
  document.addEventListener('pointerup', stop);
  document.addEventListener('pointercancel', stop);
  document.addEventListener('contextmenu', (e) => {
    if (!e.target.closest?.('[data-debug]')) return;
    e.preventDefault();
    clearTimeout(timer);
    mostraDebug();
  });
  if (new URLSearchParams(location.search).get('debug') === '1') requestAnimationFrame(() => mostraDebug());
}
function agganciaTocco() {
  document.addEventListener('pointerdown', (e) => {
    const g = e.target.closest?.('.glass');
    if (!g || document.documentElement.dataset.motion === 'off') return;
    const r = g.getBoundingClientRect();
    g.style.setProperty('--px', `${e.clientX - r.left}px`);
    g.style.setProperty('--py', `${e.clientY - r.top}px`);
    g.classList.add('is-lit');
    setTimeout(() => g.classList.remove('is-lit'), 350);
  });
  let pullY = 0;
  const view = document.getElementById('view');
  view.addEventListener('touchstart', (e) => { pullY = view.scrollTop <= 0 ? e.touches[0].clientY : 0; }, { passive: true });
  view.addEventListener('touchend', async (e) => {
    if (stato.schermo !== 'video' || !pullY) return;
    const dy = e.changedTouches[0].clientY - pullY;
    pullY = 0;
    if (dy < 72) return;
    try {
      stato.video = (await api('/api/video')).video || stato.video;
      disegna();
    } catch (err) { toast(err.message); }
  }, { passive: true });
}
function sondaFps() {
  if (document.documentElement.dataset.glass === 'lite') return;
  let n = 0;
  const t0 = performance.now();
  const frame = (t) => {
    n += 1;
    if (t - t0 < 1000) requestAnimationFrame(frame);
    else if ((n * 1000) / (t - t0) < 45) {
      document.documentElement.dataset.glass = 'lite';
      try { localStorage.setItem('regista-vetro-lite', '1'); } catch { /* ignora */ }
    }
  };
  setTimeout(() => requestAnimationFrame(frame), 1500);
}

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-azione]');
  if (!el || !document.body.contains(el)) return;
  const azione = el.dataset.azione;
  const verso = el.dataset.verso || '';
  try {
    if (azione === 'vai') {
      if (verso === 'video') stato.video = (await api('/api/video')).video || [];
      if (verso === 'altro') await caricaAltro();
      if (verso === 'stile') { await caricaStudio(); stato.studio.fase = 'elenco'; }
      vai(verso);
    } else if (azione === 'indietro') {
      if (stato.schermo === 'stile' && stato.studio.fase === 'studio') {
        stato.studio.fase = 'elenco';
        await caricaStudio();
        disegna();
        return;
      }
      const torna = stato.schermo === 'stile' ? 'altro' : 'video';
      if (history.length > 1 && location.hash) history.back();
      else vai(torna, { sostituisci: true });
    } else if (azione === 'apri-carica') apriFoglio('carica');
    else if (azione === 'scegli-file') document.getElementById('file-hero')?.click();
    else if (azione === 'chiudi-foglio') chiudiFoglio();
    else if (azione === 'gira-rete' || azione === 'rete') { applicaRete(azione === 'rete' ? verso : (stato.rete === 'dati' ? 'wifi' : 'dati')); disegna({ tieniScroll: true }); }
    else if (azione === 'chiedi-codice') {
      await api('/api/auth/codice', { method: 'POST', body: {} });
      toast('Codice mandato su Telegram. Vale 10 minuti.');
    } else if (azione === 'entra') await entra();
    else if (azione === 'registra') await registra();
    else if (azione === 'monta-ora') { preparaNuovo({ forza: true }); apriFoglio('monta'); }
    else if (azione === 'piu-tardi') { chiudiFoglio(); vai('oggi'); }
    else if (azione === 'avvia-montaggio') {
      if (stato._avvio) return;
      stato._avvio = true;
      try { await avviaMontaggio(); } finally { stato._avvio = false; }
    } else if (azione === 'scegli-stile') {
      if (!stato.nuovo) preparaNuovo();
      stato.nuovo.dati.stile = verso;
      document.querySelectorAll('.chip-stile').forEach((b) => b.setAttribute('aria-selected', b.dataset.verso === verso ? 'true' : 'false'));
      const tav = document.getElementById('blocco-tavola');
      if (tav) tav.hidden = verso !== 'Blueprint';
      const r = document.querySelector('[data-bind="riepilogo"]');
      if (r) r.textContent = riepilogoMonta();
    } else if (azione === 'cartella-rapida') {
      if (!stato.nuovo) preparaNuovo();
      stato.nuovo.dati.cartella = verso;
      const input = document.getElementById('nome-cartella');
      if (input) input.value = verso;
      document.querySelectorAll('.cartella-chip').forEach((b) => b.setAttribute('aria-pressed', b.dataset.verso === verso ? 'true' : 'false'));
      const r = document.querySelector('[data-bind="riepilogo"]');
      if (r) r.textContent = riepilogoMonta();
    } else if (azione === 'imposta') {
      if (!stato.nuovo) preparaNuovo();
      stato.nuovo.dati[el.dataset.campo] = verso;
      el.parentElement?.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b === el ? 'true' : 'false'));
      const r = document.querySelector('[data-bind="riepilogo"]');
      if (r) r.textContent = riepilogoMonta();
    } else if (azione === 'toggle-dettagli') {
      const box = document.getElementById('monta-dettagli');
      if (!box) return;
      box.hidden = !box.hidden;
      el.setAttribute('aria-expanded', box.hidden ? 'false' : 'true');
    } else if (azione === 'modalita') {
      stato.carica.modalita = verso;
      stato.carica.modalitaScelta = true;
      disegna({ tieniScroll: true });
    } else if (azione === 'avvia-upload') await avviaUpload();
    else if (azione === 'pausa-upload') {
      stato.carica.pausa = true;
      stato.carica.stop = true;
      disegna({ tieniScroll: true });
    } else if (azione === 'riprendi-upload') await riprendiUpload();
    else if (azione === 'annulla-upload') await annullaUpload();
    else if (azione === 'copia-drive') await copiaDrive();
    else if (azione === 'apri-video') await apriVideo(verso);
    else if (azione === 'correggi-vai') {
      await apriVideo(verso);
      document.getElementById('correzione')?.focus();
    } else if (azione === 'filtro') { stato.filtro = verso; disegna(); }
    else if (azione === 'ricarica-video') { stato.video = (await api('/api/video')).video || []; disegna(); }
    else if (azione === 'video') await azioneVideo(verso);
    else if (azione === 'riprova-giro') {
      if (DEMO) { toast('In demo non rilancio un giro vero.'); return; }
      el.disabled = true;
      await api(`/api/video/${encodeURIComponent(verso)}`, { method: 'POST', body: { azione: 'riprova' } });
      toast('Riparto con gli stessi dati.');
      const fresco = await api('/api/stato');
      if (stato.home) stato.home.stato = fresco;
      chiudiFoglio();
      vai('oggi');
    } else if (azione === 'salva-didascalia') await azioneVideo('didascalia', root.querySelector('#didascalia')?.value || '');
    else if (azione === 'salva-titolo') await azioneVideo('titolo', root.querySelector('#titolo-yt')?.value || root.querySelector('#titolo-inline')?.value || '');
    else if (azione === 'apri-pubblica') apriFoglio('pubblica');
    else if (azione === 'apri-azioni') apriFoglio('azioni');
    else if (azione === 'dettagli-job') apriFoglio('fasi', { id: verso });
    else if (azione === 'chiedi-rifai') apriFoglio('conferma');
    else if (azione === 'conferma-rifai') { stato.foglio = null; await azioneVideo('rifai'); }
    else if (azione === 'idea') {
      const input = document.getElementById('correzione');
      if (input) { input.value = verso; input.focus(); }
      stato.bozzaCorrezione = verso;
    } else if (azione === 'manda-resto') mandaResto();
    else if (azione === 'lotto') await lotto();
    else if (azione === 'aggiorna-cartelle') { await api('/api/cartelle/aggiorna', { method: 'POST', body: {} }); toast('Ho chiesto l’elenco a Drive.'); }
    else if (azione === 'prova-regia') await provaRegia();
    else if (azione === 'push') await attivaPush();
    else if (azione === 'sblocco') { await api('/api/auth/sblocco', { method: 'POST', body: {} }); toast('Codice mandato su Telegram. Vale 10 minuti sul telefono nuovo.'); }
    else if (azione === 'esci') { await api('/api/auth/esci', { method: 'POST', body: {} }); stato.schermo = 'accesso'; stato.foglio = null; disegna(); }
    else if (azione === 'badge-test') {
      if (!navigator.setAppBadge) throw new Error('Questo iPhone non mostra il badge. Serve l’app sulla Home, iOS 16.4 o successivo.');
      await navigator.setAppBadge(1);
      toast('Badge acceso. Lo riallineo ai lavori tra un attimo.');
      setTimeout(() => aggiornaBadge(), 2500);
    } else if (azione === 'vetro') {
      const solido = verso === 'solido';
      try { localStorage.setItem('regista-vetro', solido ? 'solido' : 'auto'); } catch { /* ignora */ }
      if (solido) document.documentElement.dataset.glass = 'lite';
      else if (localStorage.getItem('regista-vetro-lite') === '1') document.documentElement.dataset.glass = 'lite';
      else delete document.documentElement.dataset.glass;
      disegna({ tieniScroll: true });
    } else if (azione === 'effetti') {
      const off = document.documentElement.dataset.motion === 'off';
      if (off) delete document.documentElement.dataset.motion;
      else document.documentElement.dataset.motion = 'off';
      try { localStorage.setItem('regista-effetti', off ? '1' : '0'); } catch { /* ignora */ }
      disegna({ tieniScroll: true });
    } else if (azione === 'studio-elenco' || azione === 'studio-chiudi') {
      if (azione === 'studio-chiudi') vai('altro');
      else { stato.studio.fase = 'elenco'; await caricaStudio(); disegna(); }
    } else if (azione === 'studio-continua') { stato.studio.fase = 'studio'; disegna(); }
    else if (azione === 'studia') await studiaVideo();
    else if (azione === 'studio-invia') await inviaNotaStile();
    else if (azione === 'studio-salva') await salvaStile();
    else if (azione === 'studio-apri') await apriStile(verso);
    else if (azione === 'studio-rinomina') await rinominaStile(verso);
    else if (azione === 'studio-duplica') await duplicaStile(verso);
    else if (azione === 'studio-elimina') await eliminaStile(verso);
  } catch (err) {
    toast(err.message || 'Non ha funzionato.');
  }
});

document.addEventListener('change', async (e) => {
  const imp = e.target.closest('[data-imp]');
  if (imp && root.contains(imp)) {
    try {
      const r = await api('/api/impostazioni', { method: 'POST', body: { [imp.dataset.imp]: imp.value } });
      if (stato.home) stato.home.impostazioni = r.impostazioni || stato.home.impostazioni;
      toast('Salvato.');
    } catch (err) { toast(err.message); }
  }
  if (e.target.id === 'file-girato' || e.target.id === 'file-hero') {
    const files = [...e.target.files];
    stato.carica.selezionati = files;
    if (!stato.carica.nome) stato.carica.nome = nomeDaFile(files);
    stato.carica.daRiselezionare = false;
    if (stato.foglio?.tipo !== 'carica') stato.foglio = { tipo: 'carica' };
    disegna({ tieniScroll: true });
  }
  if (e.target.id === 'nome-video') stato.carica.nome = e.target.value;
  if (e.target.id === 'proxy-da') stato.carica.da = Number(e.target.value) || 0;
  if (e.target.id === 'proxy-a') stato.carica.a = Number(e.target.value) || 90;
  if (e.target.id === 'file-stile') stato.studio.file = e.target.files?.[0] || null;
  if (e.target.id === 'sponsor-si' && stato.nuovo) {
    stato.nuovo.dati.sponsorSi = e.target.checked;
    const box = document.getElementById('blocco-sponsor');
    if (box) box.hidden = !e.target.checked;
  }
  if (e.target.id === 'titolo-inline') {
    try { await azioneVideo('titolo', e.target.value); } catch (err) { toast(err.message); }
  }
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'correzione') stato.bozzaCorrezione = e.target.value;
  if (e.target.id === 'detto-stile') stato.studio.notaInput = e.target.value;
  if (e.target.id === 'nome-cartella' && stato.nuovo) {
    stato.nuovo.dati.cartella = e.target.value;
    const r = document.querySelector('[data-bind="riepilogo"]');
    if (r) r.textContent = riepilogoMonta();
  }
});
document.addEventListener('submit', async (e) => {
  if (e.target.id === 'form-correzione') {
    e.preventDefault();
    const testo = e.target.querySelector('#correzione')?.value || '';
    stato.bozzaCorrezione = '';
    try { await azioneVideo('correggi', testo); } catch (err) { stato.bozzaCorrezione = testo; toast(err.message); }
  }
  if (e.target.id === 'form-stile') {
    e.preventDefault();
    stato.studio.notaInput = e.target.querySelector('#detto-stile')?.value || '';
    try { await inviaNotaStile(); stato.studio.notaInput = ''; } catch (err) { toast(err.message); }
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && stato.foglio) { e.preventDefault(); chiudiFoglio(); return; }
  if (e.key !== 'Tab' || !stato.foglio) return;
  const sheet = document.getElementById('sheet');
  if (!sheet) return;
  const f = [...sheet.querySelectorAll('button, input, textarea, select, a')].filter((n) => !n.disabled && n.offsetParent);
  if (!f.length || !sheet.contains(document.activeElement)) return;
  const i = f.indexOf(document.activeElement);
  if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
  else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
});

async function riprendiUpload() {
  const c = stato.carica;
  c.pausa = false;
  c.stop = false;
  const attesa = Date.now() + 8000;
  while (c._pompa && Date.now() < attesa) await new Promise((r) => setTimeout(r, 40));
  const files = c.selezionati || [];
  if (!files.length || !c.id) {
    c.daRiselezionare = true;
    c.fase = 'scelta';
    disegna({ tieniScroll: true });
    throw new Error('Seleziona di nuovo gli stessi file: i pezzi già arrivati restano.');
  }
  const fresco = await api(`/api/upload/${c.id}`);
  await pompa({ upload: fresco, url: [], parallelo: paralleloScelto(4) }, files);
}

stato.rete = reteIniziale();
stato.filtro = 'tutti';
stato.foglio = null;
stato.bozzaCorrezione = '';

function righeRiassunto(testo) {
  return String(testo || '').split('\n').filter(Boolean).map((r) => {
    const i = r.indexOf(':');
    if (i < 0) return `<p>${esc(r)}</p>`;
    return `<div class="riga"><span class="meta">${esc(r.slice(0, i))}</span><strong>${esc(r.slice(i + 1).trim())}</strong></div>`;
  }).join('');
}

function htmlErroreStile(s) {
  if (!s.errore) return '';
  // sotto resta lo stile di prima: non è stato toccato (26/10, sembrava che lo studio fallito
  // avesse sostituito Cinematic Talk)
  const testo = String(s.errore).replace(/The operation was aborted due to timeout/gi, 'tempo scaduto').replace(/aborted due to timeout/gi, 'tempo scaduto');
  const prima = s.bozza?.nome ? ` «${esc(s.bozza.nome)}» qui sotto è quello di prima: non è stato toccato.` : '';
  return `<div class="card errore-stile" data-errore-stile><p>${esc(testo)}</p><small class="meta">Premi di nuovo Studia per riprovare.${prima}</small></div>`;
}


async function entra() {
  const opz = await api('/api/auth/accesso/opzioni', { method: 'POST', body: {} });
  const publicKey = preparaGet(opz.publicKey);
  const cred = await navigator.credentials.get({ publicKey });
  await api('/api/auth/accesso/verifica', { method: 'POST', body: {
    sfida: opz.sfida, id: cred.id, response: { clientDataJSON: b64url(cred.response.clientDataJSON), authenticatorData: b64url(cred.response.authenticatorData), signature: b64url(cred.response.signature) },
  } });
  await dopoAccesso();
}

async function registra() {
  const codice = root.querySelector('#codice')?.value || '';
  const opz = await api('/api/auth/registrazione/opzioni', { method: 'POST', body: { codice } });
  const publicKey = preparaCrea(opz.publicKey);
  const cred = await navigator.credentials.create({ publicKey });
  await api('/api/auth/registrazione/verifica', { method: 'POST', body: {
    sfida: opz.sfida, id: cred.id, response: { clientDataJSON: b64url(cred.response.clientDataJSON), attestationObject: b64url(cred.response.attestationObject) },
  } });
  await dopoAccesso();
}

function preparaCrea(p) {
  return { ...p, challenge: b64buf(p.challenge), user: { ...p.user, id: b64buf(p.user.id) }, excludeCredentials: (p.excludeCredentials || []).map((c) => ({ ...c, id: b64buf(c.id) })) };
}
function preparaGet(p) {
  return { ...p, challenge: b64buf(p.challenge), allowCredentials: (p.allowCredentials || []).map((c) => ({ ...c, id: b64buf(c.id) })) };
}

async function dopoAccesso() {
  await caricaHome();
  vai('oggi');
}

async function avviaMontaggio() {
  leggiCampiMonta();
  const d = stato.nuovo?.dati || {};
  const up = stato.home?.upload;
  await api('/api/montaggi', { method: 'POST', body: { ...d, ...(up?.pronto ? { r2: up.id } : {}) } });
  toast(up?.pronto ? 'Montaggio avviato dal girato caricato.' : 'Montaggio avviato.');
  stato.nuovo = null;
  await caricaHome();
  vai('oggi');
}

async function apriVideo(id, opts = {}) {
  stato.dettaglio = await api(`/api/video/${id}`);
  stato.dettaglio.id = id;
  if (!stato.stili.length) {
    try { stato.stili = (await api('/api/stili')).stili || []; } catch { /* elenco già in memoria */ }
  }
  vai('dettaglio', opts);
}

async function azioneVideo(azione, testo) {
  const id = stato.dettaglio?.id || stato.dettaglio?.video?.runId;
  const stile = root.querySelector('#stile-video')?.value;
  await api(`/api/video/${id}`, { method: 'POST', body: { azione, testo, stile } });
  if (azione === 'approva' || azione === 'didascalia' || azione === 'titolo' || azione === 'ig' || azione === 'yt') {
    stato.dettaglio = await api(`/api/video/${id}`);
    stato.dettaglio.id = id;
    disegna();
    toast('Fatto.');
  } else {
    toast('Avviato. Lo vedi in Oggi.');
    await caricaHome();
    vai('oggi');
  }
}

function mandaResto() {
  const nome = stato.dettaglio?.memo?.nome || stato.dettaglio?.video?.nome || '';
  stato.carica = caricaVuota();
  stato.carica.archivio = true;
  stato.carica.nome = nome;
  stato.carica.modalita = 'originali';
  stato.carica.modalitaScelta = true;
  vai('carica');
  toast('Scegli gli originali rimasti. Vanno nella cartella di questo video, anche se ha un (2) nel nome.');
}

async function lotto() {
  const cartelle = [...root.querySelectorAll('[data-lotto]:checked')].map((i) => i.value);
  await api('/api/lotto', { method: 'POST', body: { cartelle, stile: stato.home?.impostazioni?.stile } });
  toast('Avviati.');
  vai('oggi');
}

async function provaRegia() {
  const cartella = root.querySelector('#regia-cartella')?.value || '';
  await api('/api/regia', { method: 'POST', body: { cartella, stile: stato.home?.impostazioni?.stile } });
  toast('Prova chiesta. Il testo arriva qui e su Telegram.');
}

async function caricaAltro() {
  const [cartelle, stili, col, regia] = await Promise.all([
    api('/api/cartelle'), api('/api/stili'), api('/api/collegamenti'), api('/api/regia'),
  ]);
  stato.cartelle = cartelle;
  stato.stili = stili.stili || [];
  stato.collegamenti = col;
  stato.regia = regia;
}

async function attivaPush() {
  const info = await api('/api/push/chiave');
  if (!info.attivo || !info.chiave) throw new Error('Notifiche non attive sul server. Ti avviso lo stesso dentro l’app.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Permesso notifiche negato.');
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64buf(info.chiave) });
  await api('/api/push/sottoscrivi', { method: 'POST', body: sub.toJSON() });
  toast('Notifiche attive su questo iPhone.');
}

function leggiCampiCarica() {
  const nome = root.querySelector('#nome-video');
  if (nome) stato.carica.nome = nome.value.trim();
  const da = root.querySelector('#proxy-da');
  const a = root.querySelector('#proxy-a');
  if (da) stato.carica.da = Number(da.value) || 0;
  if (a) stato.carica.a = Number(a.value) || 90;
}

async function avviaUpload() {
  if (DEMO) { toast('In demo non parte un invio vero.'); return; }
  leggiCampiCarica();
  const c = stato.carica;
  if (!c.nome) throw new Error('Manca il nome del video.');
  let files = c.selezionati || [];
  if (!files.length) throw new Error('Scegli almeno un file.');
  c.stop = false;
  c.pausa = false;
  c.errore = '';
  if (c.id && c.fase !== 'pronto') {
    try {
      const fresco = await api(`/api/upload/${c.id}`);
      if (fresco && !fresco.pronto && fresco.nome === c.nome) {
        await pompa({ upload: fresco, url: [], parallelo: paralleloScelto(fresco.parallelo || 4) }, files);
        return;
      }
    } catch { /* sessione chiusa o già completata: se ne apre una nuova */ }
  }
  if (c.modalita === 'proxy') {
    c.fase = 'codifica';
    disegna();
    const uscita = [];
    for (const f of files) {
      if (!String(f.type || '').startsWith('video/')) { uscita.push(f); continue; }
      const fatto = await creaProxy(f, c.da, c.a, (testo) => {
        c.nota = testo;
        document.querySelectorAll('[data-bind="codifica"], [data-bind="eta"]').forEach((p) => { p.textContent = testo; });
      });
      uscita.push(fatto.file);
      if (fatto.nota) c.nota = fatto.nota;
    }
    files = uscita;
    c.selezionati = files;
  }
  const inizio = await api('/api/upload/inizia', { method: 'POST', body: {
    nome: c.nome, modalita: c.modalita, archivio: c.archivio,
    file: files.map((f) => ({ nome: f.name, size: f.size, tipo: f.type || 'application/octet-stream' })),
  } });
  await pompa(inizio, files);
}

async function pompa(inizio, files) {
  const c = stato.carica;
  c._pompa = true;
  try {
  const upload = inizio.upload;
  c.id = upload.id;
  c.fase = 'invio';
  c.byteTotali = upload.totale;
  c.byteFatti = upload.fatti;
  c.file = upload.file.map((f) => ({ nome: f.nome, size: f.size, fatti: f.byte || 0, parte: f.parte, totale: f.totale }));
  c.pezziFatti = upload.file.reduce((t, f) => t + (f.fatte || 0), 0);
  c.pezziTotali = upload.file.reduce((t, f) => t + f.totale, 0);
  disegna();
  await sveglia();
  const coda = [];
  for (const meta of upload.file) {
    const file = abbina(files, meta);
    if (!file) { c.daRiselezionare = true; continue; }
    const fatti = new Set(meta.fatteNumeri || []);
    for (const p of await idbLeggi(chiavePezzi(upload.id, meta.nome, meta.size))) {
      if (fatti.has(p.n)) continue;
      await api(`/api/upload/${upload.id}/parte`, { method: 'POST', body: { nome: meta.nome, numero: p.n, etag: p.etag } });
      fatti.add(p.n);
      c.byteFatti += bytePezzo(meta, p.n);
      c.pezziFatti += 1;
    }
    const noti = (inizio.url || []).find((u) => u.nome === meta.nome)?.pezzi || [];
    for (let n = 1; n <= meta.totale; n++) {
      if (fatti.has(n)) continue;
      coda.push({ meta, file, n, url: noti.find((p) => p.n === n)?.url || null });
    }
  }
  if (c.daRiselezionare && !coda.length) {
    disegna();
    throw new Error('Seleziona di nuovo gli stessi file.');
  }
  const campioni = [{ t: performance.now(), b: c.byteFatti }];
  const volo = new Map();
  let prossimo = 0;
  let guasto = null;
  const parallelo = paralleloScelto(inizio.parallelo || 4);
  async function lavoratore() {
    while (prossimo < coda.length && !guasto && !c.stop) {
      const job = coda[prossimo++];
      const chiave = `${job.meta.nome}:${job.n}`;
      try {
        let url = job.url;
        if (!url) url = await chiediUrl(upload.id, job);
        if (!url) continue;
        const etag = await mandaConRiprove(upload.id, job, url, (loaded) => {
          volo.set(chiave, loaded);
          aggiornaBarra(campioni, volo);
        });
        volo.delete(chiave);
        await idbAggiungi(chiavePezzi(upload.id, job.meta.nome, job.meta.size), { n: job.n, etag });
        await api(`/api/upload/${upload.id}/parte`, { method: 'POST', body: { nome: job.meta.nome, numero: job.n, etag } });
        c.pezziFatti += 1;
        c.byteFatti += bytePezzo(job.meta, job.n);
        const riga = c.file.find((f) => f.nome === job.meta.nome);
        if (riga) riga.fatti += bytePezzo(job.meta, job.n);
        aggiornaBarra(campioni, volo);
      } catch (e) { guasto = e; }
    }
  }
  await Promise.all(Array.from({ length: parallelo }, lavoratore));
  if (c.stop) return;
  if (guasto) {
    c.errore = guasto.message;
    c.daRiselezionare = true;
    disegna();
    throw guasto;
  }
  for (const meta of upload.file) {
    const fine = await api(`/api/upload/${upload.id}/completa`, { method: 'POST', body: { nome: meta.nome } });
    if (fine.pronto && stato.home) stato.home.upload = fine;
  }
  c.fase = 'pronto';
  c.pausa = false;
  c.eta = 0;
  c.inVolo = 0;
  if (stato.home) {
    const fresco = await api(`/api/upload/${upload.id}`);
    stato.home.upload = fresco;
  }
  disegna();
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) {
    const reg = await navigator.serviceWorker?.getRegistration?.();
    reg?.showNotification('Girato al sicuro', {
      body: 'Quando vuoi, apri Regista e tocca Monta ora.',
      icon: '/icon-192.png',
      data: { url: '/' },
    }).catch(() => {});
  }
  } finally {
    c._pompa = false;
  }
}

function bytePezzo(meta, n) {
  const start = (n - 1) * meta.parte;
  return Math.min(meta.parte, meta.size - start);
}
function abbina(files, meta) {
  return [...files].find((f) => f.name === meta.nome) || [...files].find((f) => f.size === meta.size);
}
async function chiediUrl(id, job) {
  const r = await api(`/api/upload/${id}/url`, { method: 'POST', body: { nome: job.meta.nome, parti: [job.n] } });
  return r.pezzi?.[0]?.url || null;
}
async function mandaConRiprove(id, job, urlIniziale, onProgress) {
  let url = urlIniziale;
  let rinfrescato = false;
  for (let i = 0; i < 4; i++) {
    try {
      const start = (job.n - 1) * job.meta.parte;
      const blob = job.file.slice(start, Math.min(job.file.size, start + job.meta.parte));
      const etag = await putXhr(url, blob, onProgress);
      if (!etag) throw Object.assign(new Error('Manca l’ETag: il bucket non lo espone al telefono.'), { status: 0 });
      return etag;
    } catch (e) {
      onProgress(0);
      if (e.status === 403 && !rinfrescato) rinfrescato = true;
      url = await chiediUrl(id, job);
      if (!url) throw new Error('Pezzo già registrato ma senza conferma. Riapri il caricamento.');
      await new Promise((ok) => setTimeout(ok, 400 * 2 ** i));
    }
  }
  throw new Error('Un pezzo non è partito. I pezzi già fatti non si rimandano.');
}
function putXhr(url, blob, onProgress) {
  return new Promise((ok, ko) => {
    const x = new XMLHttpRequest();
    x.open('PUT', url);
    x.timeout = 120000;
    x.upload.onprogress = (ev) => { if (ev.lengthComputable) onProgress(ev.loaded); };
    x.onload = () => {
      if (x.status >= 200 && x.status < 300) ok((x.getResponseHeader('ETag') || '').trim());
      else ko(Object.assign(new Error(`Invio ${x.status}`), { status: x.status }));
    };
    x.onerror = () => ko(Object.assign(new Error('Rete caduta'), { status: 0 }));
    x.ontimeout = () => ko(Object.assign(new Error('Tempo scaduto'), { status: 0 }));
    x.send(blob);
  });
}
let _barraPrev = 0;
function aggiornaBarra(campioni, volo) {
  const c = stato.carica;
  const extra = [...volo.values()].reduce((t, n) => t + n, 0);
  const mostrati = c.byteFatti + extra;
  const ora = performance.now();
  campioni.push({ t: ora, b: mostrati });
  while (campioni.length && ora - campioni[0].t > 5000) campioni.shift();
  const a = campioni[0];
  const dt = (ora - a.t) / 1000;
  const velocita = dt > 0.4 && mostrati > a.b ? (mostrati - a.b) / dt : 0;
  c.eta = velocita > 0 ? (c.byteTotali - mostrati) / velocita : c.eta;
  c.inVolo = volo.size;
  if (ora - _barraPrev < 250) return;
  _barraPrev = ora;
  const pct = c.byteTotali ? Math.min(100, Math.round(100 * mostrati / c.byteTotali)) : 0;
  const byte = `${byteTxt(mostrati)} di ${byteTxt(c.byteTotali)}`;
  document.querySelectorAll('[data-bind="pct"]').forEach((el) => { el.textContent = `${pct}%`; });
  document.querySelectorAll('[data-barra]').forEach((el) => {
    el.style.width = `${pct}%`;
    const bar = el.closest('[role="progressbar"]');
    if (bar) bar.setAttribute('aria-valuenow', String(pct));
  });
  document.querySelectorAll('[data-bind="byte"]').forEach((el) => { el.textContent = `${byte} · ${pct}%`; });
  if (c.fase !== 'codifica') document.querySelectorAll('[data-bind="eta"]').forEach((el) => { el.textContent = tempoTxt(c.eta); });
  document.querySelectorAll('[data-bind="pezzi"]').forEach((el) => {
    el.textContent = `${c.pezziFatti} pezzi al sicuro, non si rimandano${c.inVolo ? ` · ${c.inVolo} in viaggio` : ''}`;
  });
  document.querySelectorAll('[data-bind="velocita"]').forEach((el) => {
    if (!velocita) { el.textContent = ''; return; }
    const mb = velocita / 1e6;
    const vtxt = mb >= 10 ? `${Math.round(mb)} MB/s` : `${mb.toFixed(1).replace('.', ',')} MB/s`;
    el.textContent = `${vtxt} · ${tempoTxt(c.eta)}`;
  });
  document.querySelectorAll('[data-file]').forEach((row) => {
    const nome = row.getAttribute('data-file');
    const f = (c.file || []).find((x) => x.nome === nome);
    const bar = row.querySelector('.mini-bar i');
    if (!bar || !f?.size) return;
    bar.style.width = `${Math.min(100, Math.round(100 * (f.fatti || 0) / f.size))}%`;
  });
}

async function annullaUpload() {
  stato.carica.stop = true;
  if (stato.carica.id) await api(`/api/upload/${stato.carica.id}/annulla`, { method: 'POST', body: {} });
  stato.carica = caricaVuota();
  if (stato.home) stato.home.upload = null;
  disegna();
}

async function copiaDrive() {
  await api('/api/montaggi', { method: 'POST', body: { r2: stato.carica.id } });
  toast('Li copio su Drive. Il montaggio già partito non li vede: per usarli, Rifai.');
  vai('oggi');
}

async function creaProxy(file, da, a, suTesto) {
  if (typeof MediaRecorder === 'undefined') throw new Error('Questo Safari non ricodifica i video. Manda gli originali, o solo le clip scelte.');
  const tipi = ['video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  const mime = tipi.find((t) => MediaRecorder.isTypeSupported(t));
  if (!mime) throw new Error('Nessun encoder video in questo Safari. Usa «Solo i file scelti».');
  const video = document.createElement('video');
  video.playsInline = true;
  video.muted = true;
  video.src = URL.createObjectURL(file);
  await new Promise((ok, ko) => { video.onloadedmetadata = ok; video.onerror = () => ko(new Error('Video illeggibile sul telefono.')); });
  const fine = Math.min(video.duration || a, a);
  const inizio = Math.max(0, Math.min(da, fine - 0.2));
  video.currentTime = inizio;
  await new Promise((ok) => { video.onseeked = () => ok(); });
  const scala = Math.min(1, 720 / (video.videoWidth || 720));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, Math.round((video.videoWidth || 720) * scala)) & ~1;
  canvas.height = Math.max(2, Math.round((video.videoHeight || 1280) * scala)) & ~1;
  const ctx = canvas.getContext('2d');
  const stream = canvas.captureStream(30);
  let nota = 'Copia leggera, circa 720p. Non usarla per pubblicare.';
  try {
    const ac = new AudioContext();
    const src = ac.createMediaElementSource(video);
    const dest = ac.createMediaStreamDestination();
    src.connect(dest);
    for (const t of dest.stream.getAudioTracks()) stream.addTrack(t);
  } catch { nota = 'Copia senza audio: Safari non ha esposto la traccia. Non usarla per pubblicare.'; }
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2_500_000 });
  const pezzi = [];
  rec.ondataavailable = (ev) => { if (ev.data?.size) pezzi.push(ev.data); };
  const chiuso = new Promise((ok) => { rec.onstop = () => ok(); });
  rec.start(1000);
  video.playbackRate = 1;
  await video.play();
  await new Promise((ok) => {
    const tick = () => {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      suTesto?.(`Codifico sul telefono · ${Math.round(video.currentTime - inizio)} s di ${Math.round(fine - inizio)} s. Tieni lo schermo acceso.`);
      if (video.currentTime >= fine - 0.05 || video.ended) { video.pause(); ok(); return; }
      requestAnimationFrame(tick);
    };
    tick();
  });
  rec.stop();
  await chiuso;
  URL.revokeObjectURL(video.src);
  const ext = mime.includes('mp4') ? 'mp4' : 'webm';
  const nome = file.name.replace(/\.[^.]+$/, '') + `-proxy.${ext}`;
  return { file: new File(pezzi, nome, { type: mime }), nota };
}

let bloccoSchermo = null;
async function sveglia() {
  try { bloccoSchermo = await navigator.wakeLock?.request('screen'); } catch { bloccoSchermo = null; }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && stato.carica.fase === 'invio') sveglia();
});

// i pezzi ricordati valgono solo per il loro caricamento: ogni /upload/inizia apre un multipart
// nuovo su R2, e gli ETag di un tentativo precedente dello stesso file lì non esistono (25/10:
// "InvalidPart" al completamento dopo un secondo Studia sullo stesso video)
const chiavePezzi = (id, nome, size) => `${id}|${nome}|${size}`;

function idb() {
  return new Promise((ok, ko) => {
    const r = indexedDB.open('regista-pezzi', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('pezzi');
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
  });
}
async function idbLeggi(chiave) {
  try {
    const d = await idb();
    return await new Promise((ok) => {
      const q = d.transaction('pezzi').objectStore('pezzi').get(chiave);
      q.onsuccess = () => ok(q.result || []);
      q.onerror = () => ok([]);
    });
  } catch { return []; }
}
async function idbAggiungi(chiave, parte) {
  const lista = (await idbLeggi(chiave)).filter((p) => p.n !== parte.n);
  lista.push(parte);
  const d = await idb();
  await new Promise((ok, ko) => {
    const q = d.transaction('pezzi', 'readwrite').objectStore('pezzi').put(lista, chiave);
    q.onsuccess = () => ok();
    q.onerror = () => ko(q.error);
  });
}

async function caricaHome() {
  stato.home = await api('/api/home');
  const aperti = stato.home.upload;
  if (aperti && !aperti.avviato) {
    stato.carica.id = aperti.id;
    stato.carica.nome = aperti.nome;
    stato.carica.modalita = aperti.modalita;
    stato.carica.archivio = aperti.archivio;
    stato.carica.byteFatti = aperti.fatti;
    stato.carica.byteTotali = aperti.totale;
    stato.carica.file = (aperti.file || []).map((f) => ({ nome: f.nome, size: f.size, fatti: f.byte || 0 }));
    stato.carica.fase = aperti.pronto ? 'pronto' : 'scelta';
    stato.carica.daRiselezionare = !aperti.pronto;
    stato.carica.pezziFatti = (aperti.file || []).reduce((t, f) => t + (f.fatte || 0), 0);
    stato.carica.pezziTotali = (aperti.file || []).reduce((t, f) => t + (f.totale || 0), 0);
  }
  try { stato.stili = (await api('/api/stili')).stili || []; } catch { /* home basta */ }
  try { stato.cartelle = await api('/api/cartelle'); } catch { /* elenco vecchio */ }
  try {
    const elenco = (await api('/api/video')).video || [];
    const perId = new Map(elenco.map((v) => [String(v.runId), v]));
    if (Array.isArray(stato.home?.video)) {
      stato.home.video = stato.home.video.map((v) => {
        const pieno = perId.get(String(v.runId));
        if (!pieno) return v;
        return { ...v, memo: pieno.memo || v.memo, durata: v.durata ?? pieno.durata, quando: v.quando || pieno.quando };
      });
    }
  } catch { /* le locandine restano senza copertina */ }
}

function preparaDemoCarica() {
  stato.carica = {
    ...caricaVuota(),
    modalita: 'scelti', modalitaScelta: true, cellulare: true, fase: 'invio', nome: 'Benchy in giro',
    byteFatti: 2.4e9, byteTotali: 6.4e9, eta: 28 * 60, inVolo: 4, pezziFatti: 180, pezziTotali: 800,
    file: [
      { nome: 'IMG_20261022.mov', size: 4.1e9, fatti: 1.6e9 },
      { nome: 'C0001.MP4', size: 2.3e9, fatti: 0.8e9 },
    ],
  };
}

function avviaServiceWorker() {
  if (!('serviceWorker' in navigator) || DEMO) return;
  // Il primo avvio non ricarica: la pagina ha già i file nuovi. Al deploy dopo,
  // il SW fa skipWaiting e qui si ricarica una volta, senza reinstallare l’app.
  const giaAttivo = !!navigator.serviceWorker.controller;
  let ricaricato = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!giaAttivo || ricaricato) return;
    if (stato.studio.occupato || stato.studio.invio || stato.carica.fase === 'invio') return;
    ricaricato = true;
    location.reload();
  });
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

async function caricaStudio() {
  const r = await api('/api/stile');
  stato.studio.salvati = r.salvati || [];
  if (r.bozza) stato.studio.bozza = r.bozza;
  // studio sul video intero ancora in corso (app chiusa e riaperta): si riprende ad aspettarlo
  if (r.analisi && !r.analisi.errore && !stato.studio.occupato) attendiStudioVideo(Number(r.bozza?.quando) || 0);
  else if (r.analisi?.errore && !stato.studio.errore) stato.studio.errore = `Studio non riuscito: ${r.analisi.errore}`;
}

function notaUpload(testo) {
  stato.studio.nota = testo;
  const el = root.querySelector('[data-upload-stile]');
  if (el) el.textContent = testo;
}

// fasi sempre visibili (24/10: un errore dell'analisi compariva in un avviso di 4 s mentre il file
// intero caricava per minuti, e sembrava che non succedesse niente)
function faseStudio(testo) {
  stato.studio.occupato = testo;
  const el = root.querySelector('[data-bind="occupato"]');
  if (el && root.querySelector('[data-passo-stile]') && stato.schermo === 'stile') {
    el.textContent = testo;
    return;
  }
  disegna();
}

function erroreRete(e) {
  const m = String(e?.message || '');
  return /rete assente|nessuna risposta dal server|failed to fetch|load failed|instabile|timeout|connessione/i.test(m);
}

async function attendiBozza(prima) {
  const fine = Date.now() + 45000;
  const eraStudio = stato.studio.fase === 'studio';
  while (Date.now() < fine) {
    await new Promise((r) => setTimeout(r, 2500));
    try {
      const r = await api('/api/stile');
      const q = Number(r.bozza?.quando);
      if (!(r.bozza?.haTesto && Number.isFinite(q) && q > Number(prima || 0))) continue;
      stato.studio.bozza = r.bozza;
      stato.studio.fase = 'studio';
      stato.studio.occupato = '';
      stato.studio.errore = '';
      if (!eraStudio) stato.studio.nota = 'Carico il file intero…';
      else if (String(stato.studio.nota || '').startsWith('Connessione')) stato.studio.nota = '';
      disegna();
      return true;
    } catch { /* la rete è ancora giù */ }
  }
  return false;
}

// Studio sul video intero (25/10): il file va su Cloudflare, poi un giro su GitHub lo fa guardare
// tutto a Gemini Pro con gli stili fatti a mano come esempio (scripts/studia-stile.mjs) e la bozza
// arriva qui e su Telegram. Se lo studio su GitHub non parte, si torna all'analisi veloce dei
// 6 fotogrammi fatta dal Worker (studiaVeloce)
async function studiaVideo() {
  if (DEMO) { toast('In demo l’analisi non chiama l’AI. Apri uno stile salvato.'); return; }
  const file = stato.studio.file;
  if (!file) { stato.studio.errore = 'Scegli un video di riferimento.'; disegna(); return; }
  if (stato.studio.occupato || stato.studio.invio) return;
  const prima = Number(stato.studio.bozza?.quando) || 0;
  stato.studio.nota = '';
  stato.studio.errore = '';
  faseStudio('Carico il video su Cloudflare… 0%');
  let id;
  try {
    stato.studio.invio = true;
    id = await inviaRiferimento(file, (pct) => faseStudio(`Carico il video su Cloudflare… ${pct}%`));
  } catch (e) {
    stato.studio.occupato = '';
    stato.studio.errore = `Il video non è arrivato su Cloudflare: ${e.message || 'errore'}. Riprova: i pezzi già mandati non ripartono.`;
    disegna();
    return;
  } finally {
    stato.studio.invio = false;
  }
  try {
    await api('/api/stile/video', { method: 'POST', body: { upload: id } });
  } catch (e) {
    stato.studio.nota = `Studio completo non disponibile (${e.message || 'errore'}): faccio l’analisi veloce sui fotogrammi.`;
    await studiaVeloce(file, prima);
    return;
  }
  await attendiStudioVideo(prima);
}

// aspetta la bozza dello studio sul video intero: di solito 2–5 minuti; si può chiudere l'app
async function attendiStudioVideo(prima) {
  faseStudio('L’AI guarda tutto il video, con l’audio… di solito 2–5 minuti. Puoi chiudere l’app: ti avviso su Telegram.');
  const fine = Date.now() + 32 * 60000;
  while (Date.now() < fine) {
    await new Promise((r) => setTimeout(r, 8000));
    let r;
    try { r = await api('/api/stile'); } catch { continue; } // rete giù: si riprova
    const q = Number(r.bozza?.quando);
    if (r.bozza?.haTesto && Number.isFinite(q) && q > prima) {
      stato.studio.bozza = r.bozza;
      stato.studio.fase = 'studio';
      stato.studio.occupato = '';
      stato.studio.errore = '';
      stato.studio.nota = '';
      disegna();
      return true;
    }
    if (r.analisi?.errore) {
      stato.studio.occupato = '';
      stato.studio.errore = `Studio non riuscito: ${r.analisi.errore}`;
      disegna();
      return false;
    }
    if (!r.analisi) break; // né studio in corso né bozza nuova: si è perso
  }
  stato.studio.occupato = '';
  stato.studio.errore = 'Lo studio non ha dato notizie. Se arriva, lo trovi qui e su Telegram; altrimenti premi di nuovo Studia.';
  disegna();
  return false;
}

// analisi veloce dei fotogrammi sul Worker (com'era prima): solo se lo studio completo non parte
async function studiaVeloce(file, prima) {
  faseStudio('Estraggo i fotogrammi…');
  let campione;
  try {
    campione = await campionaRiferimento(file, faseStudio);
  } catch (e) {
    stato.studio.occupato = '';
    stato.studio.errore = e.message || 'Non riesco a leggere questo video sul telefono.';
    disegna();
    return;
  }
  faseStudio('L’AI analizza lo stile… (fino a un minuto)');
  let scheda = false;
  try {
    const r = await api('/api/stile/analizza', { method: 'POST', ms: 120000, body: {
      durata: campione.durata, tagli: campione.tagli, fotogrammi: campione.fotogrammi, audio: campione.audio,
    } });
    if (!r.bozza?.haTesto) throw new Error('L’AI non ha restituito uno stile. Riprova.');
    stato.studio.bozza = r.bozza;
    stato.studio.fase = 'studio';
    stato.studio.errore = '';
    scheda = true;
  } catch (e) {
    if (erroreRete(e)) {
      stato.studio.nota = 'Connessione interrotta. Controllo se l’analisi è finita…';
      disegna();
      scheda = await attendiBozza(prima);
    }
    if (!scheda) stato.studio.errore = `Analisi non riuscita: ${e.message || 'errore sconosciuto'}`;
  } finally {
    stato.studio.occupato = '';
    disegna();
  }
}

async function inviaNotaStile() {
  const detto = root.querySelector('#detto-stile')?.value.trim() || '';
  if (!detto) { stato.studio.errore = 'Scrivi cosa cambiare.'; disegna(); return; }
  const prima = Number(stato.studio.bozza?.quando) || 0;
  stato.studio.errore = '';
  faseStudio('L’AI aggiorna lo stile…');
  try {
    const r = await api('/api/stile/chat', { method: 'POST', ms: 120000, body: { testo: detto } });
    stato.studio.bozza = r.bozza;
    stato.studio.fase = 'studio';
    stato.studio.errore = '';
  } catch (e) {
    let ok = false;
    if (erroreRete(e)) {
      stato.studio.nota = 'Connessione interrotta. Controllo se l’aggiornamento è finito…';
      disegna();
      ok = await attendiBozza(prima);
    }
    if (!ok) stato.studio.errore = e.message || 'L’aggiornamento non è riuscito.';
  } finally {
    stato.studio.occupato = '';
    disegna();
  }
}

async function salvaStile() {
  const nome = root.querySelector('#nome-stile')?.value.trim() || '';
  const r = await api('/api/stile/salva', { method: 'POST', body: { nome } });
  stato.studio.salvati = r.salvati || stato.studio.salvati;
  stato.studio.fase = 'elenco';
  try { stato.stili = (await api('/api/stili')).stili || stato.stili; } catch { /* l’elenco si rinfresca alla prossima apertura */ }
  toast(r.avviso || 'Stile salvato. Lo trovi in Monta e nel bot.');
  disegna();
}

async function apriStile(id) {
  const r = await api('/api/stile/apri', { method: 'POST', body: { id } });
  stato.studio.bozza = r.bozza;
  stato.studio.fase = 'studio';
  disegna();
}

async function rinominaStile(id) {
  const attuale = stato.studio.salvati.find((s) => s.id === id)?.nome || '';
  const nome = prompt('Nuovo nome', attuale);
  if (!nome || !nome.trim()) return;
  const r = await api('/api/stile/rinomina', { method: 'POST', body: { id, nome: nome.trim() } });
  stato.studio.salvati = r.salvati || stato.studio.salvati;
  toast(r.avviso || 'Rinominato.');
  disegna();
}

async function duplicaStile(id) {
  const attuale = stato.studio.salvati.find((s) => s.id === id)?.nome || 'Stile';
  const nome = prompt('Nome della copia', `${attuale} copia`);
  if (!nome || !nome.trim()) return;
  const r = await api('/api/stile/duplica', { method: 'POST', body: { id, nome: nome.trim() } });
  stato.studio.salvati = r.salvati || stato.studio.salvati;
  toast('Copia salvata.');
  disegna();
}

async function eliminaStile(id) {
  const nome = stato.studio.salvati.find((s) => s.id === id)?.nome || 'questo stile';
  if (!confirm(`Elimino «${nome}»?`)) return;
  const r = await api('/api/stile/elimina', { method: 'POST', body: { id } });
  stato.studio.salvati = r.salvati || [];
  disegna();
}

function attendiVideo(video, evento, ms = 5000) {
  return new Promise((ok, ko) => {
    const t = setTimeout(() => { pulisci(); ko(new Error('Il video non si è mosso in tempo.')); }, ms);
    const bene = () => { pulisci(); ok(); };
    const male = () => { pulisci(); ko(new Error('Questo video non si apre sul telefono.')); };
    function pulisci() {
      clearTimeout(t);
      video.removeEventListener(evento, bene);
      video.removeEventListener('error', male);
    }
    video.addEventListener(evento, bene);
    video.addEventListener('error', male);
  });
}

async function vaiAlSecondo(video, t) {
  if (Math.abs((video.currentTime || 0) - t) < 0.04 && video.readyState >= 2) return;
  const p = attendiVideo(video, 'seeked');
  video.currentTime = t;
  await p;
}

function jpegBreve(canvas) {
  let url = canvas.toDataURL('image/jpeg', 0.62);
  if (url.length > 160000) url = canvas.toDataURL('image/jpeg', 0.42);
  return url;
}

function lumaMedia(ctx, w, h) {
  const data = ctx.getImageData(0, 0, w, h).data;
  let sum = 0;
  let n = 0;
  for (let p = 0; p < data.length; p += 16) { sum += data[p] + data[p + 1] + data[p + 2]; n += 1; }
  return n ? sum / n : 0;
}

// un fotogramma dopo il seek: su iOS 'seeked' può arrivare prima che il fotogramma sia disegnabile;
// requestVideoFrameCallback (Safari 15.4+) aspetta quello vero, con un tetto di 600 ms
function fotogrammaPronto(video) {
  return new Promise((ok) => {
    const t = setTimeout(ok, 600);
    if (typeof video.requestVideoFrameCallback === 'function') video.requestVideoFrameCallback(() => { clearTimeout(t); ok(); });
    else requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(t); ok(); }));
  });
}

async function campionaRiferimento(file, fase = () => {}) {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.setAttribute('muted', '');
  video.preload = 'auto';
  // iOS decodifica meglio un video che sta nella pagina: minuscolo e invisibile
  video.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
  video.setAttribute('webkit-playsinline', '');
  document.body.appendChild(video);
  video.src = url;
  // play() prima di ogni attesa: su iOS il gesto del tocco vale solo in questo turno
  const parto = video.play();
  if (parto && typeof parto.catch === 'function') parto.catch(() => {});
  try {
    await attendiVideo(video, 'loadedmetadata', 10000).catch(() => {
      throw new Error('Il telefono non apre questo video. Prova un file più corto o esportato in H.264 (MP4).');
    });
    const durata = video.duration;
    if (!Number.isFinite(durata) || durata < 0.4) throw new Error('Video troppo corto o senza durata.');
    // un attimo di play da muto "sveglia" il decoder di iOS: senza, i primi drawImage possono uscire neri
    try {
      await parto;
      if (!video.paused) video.pause();
    } catch {
      try { await video.play(); video.pause(); } catch { /* autoplay negato: si va avanti coi seek */ }
    }
    if (!video.videoWidth) await attendiVideo(video, 'loadeddata', 5000).catch(() => {});
    const piccolo = document.createElement('canvas');
    piccolo.width = 48;
    piccolo.height = 48;
    const ctxP = piccolo.getContext('2d', { willReadFrequently: true });
    // ritmo: fino a 12 seek; uno che non risolve si salta invece di fermare tutto
    const passi = Math.min(12, Math.max(6, Math.round(durata / 1)));
    const luci = [];
    for (let i = 0; i < passi; i++) {
      fase(`Misuro il ritmo dei tagli… ${i + 1}/${passi}`);
      try {
        await vaiAlSecondo(video, Math.min(durata - 0.05, durata * (i + 0.5) / passi));
        await fotogrammaPronto(video);
        ctxP.drawImage(video, 0, 0, 48, 48);
        luci.push(lumaMedia(ctxP, 48, 48));
      } catch { /* seek non risolto: questo punto non conta */ }
    }
    let tagli = 0;
    for (let i = 1; i < luci.length; i++) {
      if (Math.abs(luci[i] - luci[i - 1]) / Math.max(1, Math.abs(luci[i - 1])) >= 0.18) tagli += 1;
    }
    // stima su meno punti: riportata alla durata come se fossero passi ogni 0,5 s
    if (luci.length > 1) tagli = Math.round(tagli * Math.max(1, (durata / 0.5) / luci.length) * 0.5);
    const grande = document.createElement('canvas');
    const lato = 320;
    const rap = (video.videoWidth || 9) / (video.videoHeight || 16);
    grande.width = rap >= 1 ? lato : Math.max(2, Math.round(lato * rap));
    grande.height = rap >= 1 ? Math.max(2, Math.round(lato / rap)) : lato;
    const ctxG = grande.getContext('2d', { willReadFrequently: true });
    const fotogrammi = [];
    for (let i = 0; i < 6; i++) {
      fase(`Estraggo i fotogrammi… ${i + 1}/6`);
      try {
        await vaiAlSecondo(video, Math.min(durata - 0.05, durata * (i + 0.5) / 6));
        await fotogrammaPronto(video);
        ctxG.drawImage(video, 0, 0, grande.width, grande.height);
        // fotogramma tutto nero = decoder non pronto: non lo mando
        if (lumaMedia(ctxG, grande.width, grande.height) < 6) continue;
        fotogrammi.push(jpegBreve(grande));
      } catch { /* seek non risolto: un fotogramma in meno */ }
    }
    if (fotogrammi.length < 2) {
      throw new Error('Il telefono non riesce a estrarre i fotogrammi da questo video (spesso succede con HEVC/MOV pesanti). Prova un file più corto o esportato in H.264.');
    }
    fase('Preparo l’audio…');
    const audio = await audioBreve(file);
    return { durata, tagli, fotogrammi, audio };
  } finally {
    video.removeAttribute('src');
    video.load();
    video.remove();
    URL.revokeObjectURL(url);
  }
}

function wav16(samples, rate) {
  const n = samples.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const scrivi = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  scrivi(0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
  scrivi(8, 'WAVE');
  scrivi(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  scrivi(36, 'data');
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const x = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true);
  }
  return buf;
}

function b64DaBuffer(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  const passo = 0x8000;
  for (let i = 0; i < bytes.length; i += passo) s += String.fromCharCode(...bytes.subarray(i, i + passo));
  return btoa(s);
}

async function audioBreve(file) {
  if (file.size > 25 * 1024 * 1024 || typeof AudioContext === 'undefined') return undefined;
  try {
    const ctx = new AudioContext();
    const buf = await ctx.decodeAudioData(await file.arrayBuffer());
    const sec = Math.min(20, buf.duration || 0);
    if (!(sec >= 0.4)) return undefined;
    const rate = 16000;
    const off = new OfflineAudioContext(1, Math.floor(sec * rate), rate);
    const src = off.createBufferSource();
    src.buffer = buf;
    src.connect(off.destination);
    src.start(0);
    const reso = await off.startRendering();
    await ctx.close().catch(() => {});
    return b64DaBuffer(wav16(reso.getChannelData(0), rate));
  } catch {
    return undefined;
  }
}

async function inviaRiferimento(file, avanzamento = (pct) => notaUpload(`Carico il file intero… ${pct}%`)) {
  const inizio = await api('/api/upload/inizia', { method: 'POST', body: {
    nome: 'Riferimento', modalita: 'originali', riferimento: true,
    file: [{ nome: file.name, size: file.size, tipo: file.type || 'video/mp4' }],
  } });
  const upload = inizio.upload;
  notaUpload('Carico il file intero…');
  await sveglia();
  const coda = [];
  for (const meta of upload.file) {
    const fatti = new Set(meta.fatteNumeri || []);
    for (const p of await idbLeggi(chiavePezzi(upload.id, meta.nome, meta.size))) {
      if (fatti.has(p.n)) continue;
      await api(`/api/upload/${upload.id}/parte`, { method: 'POST', body: { nome: meta.nome, numero: p.n, etag: p.etag } });
      fatti.add(p.n);
    }
    const noti = (inizio.url || []).find((u) => u.nome === meta.nome)?.pezzi || [];
    for (let n = 1; n <= meta.totale; n++) {
      if (fatti.has(n)) continue;
      coda.push({ meta, file, n, url: noti.find((p) => p.n === n)?.url || null });
    }
  }
  let prossimo = 0;
  let inviati = 0;
  let guasto = null;
  const parallelo = paralleloScelto(inizio.parallelo || 4);
  async function lavoratore() {
    while (prossimo < coda.length && !guasto) {
      const job = coda[prossimo++];
      try {
        let url = job.url || await chiediUrl(upload.id, job);
        if (!url) continue;
        const etag = await mandaConRiprove(upload.id, job, url, () => {});
        await idbAggiungi(chiavePezzi(upload.id, job.meta.nome, job.meta.size), { n: job.n, etag });
        inviati += 1;
        avanzamento(Math.round((inviati / Math.max(1, coda.length)) * 100));
        await api(`/api/upload/${upload.id}/parte`, { method: 'POST', body: { nome: job.meta.nome, numero: job.n, etag } });
      } catch (e) { guasto = e; }
    }
  }
  await Promise.all(Array.from({ length: parallelo }, lavoratore));
  if (guasto) throw guasto;
  for (const meta of upload.file) await api(`/api/upload/${upload.id}/completa`, { method: 'POST', body: { nome: meta.nome } });
  notaUpload('File di riferimento al sicuro. Nessun montaggio è partito.');
  return upload.id;
}

async function parti() {
  avviaServiceWorker();
  stato.auth = await api('/api/auth/stato').catch(() => ({ sessione: false, passkey: false }));
  if (!stato.auth.sessione) { vai('accesso'); return; }
  await caricaHome();
  const raw = decodeURIComponent((location.hash || '').replace(/^#/, ''));
  const [hashA, hashB] = raw.split('/');
  const vista = DEMO ? (DEMO_VISTA && DEMO_VISTA !== '1' ? DEMO_VISTA : 'oggi') : (hashA || 'oggi');
  if (vista === 'nuovo') preparaNuovo();
  if (DEMO && vista === 'carica') preparaDemoCarica();
  if (vista === 'dettaglio' || (vista === 'video' && hashB)) {
    const id = hashB || (DEMO ? '900' : '');
    if (!id) {
      stato.video = (await api('/api/video')).video || [];
      vai('video');
      return;
    }
    await apriVideo(id);
    return;
  }
  if (vista === 'video') stato.video = (await api('/api/video')).video || [];
  if (vista === 'altro') await caricaAltro();
  if (vista === 'stile') {
    await caricaStudio();
    if (DEMO && DEMO_STATO === 'analizza') stato.studio.occupato = 'L’AI analizza lo stile… (fino a un minuto)';
    if (DEMO && DEMO_STATO === 'errore') stato.studio.errore = 'Il telefono non riesce a estrarre i fotogrammi da questo video (spesso succede con HEVC/MOV pesanti). Prova un file più corto o esportato in H.264.';
    if (DEMO && DEMO_STATO === 'carico') stato.studio.nota = 'Carico il file intero… 40%';
  }
  if (vista === 'carica' || vista === 'nuovo') {
    vai('oggi');
    vai(vista);
    return;
  }
  vai(vista === 'accesso' ? 'accesso' : vista);
}

parti().catch((e) => { stato.toast = e.message; disegna(); });

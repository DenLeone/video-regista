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
    errore: '', nota: '', daRiselezionare: false, stop: false, cellulare: reteCellulare(),
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
    { runId: '1', nome: 'Panca puff', stile: 'Cinematico', durata: 39.2, quando: Date.now() - 3600e3, link: 'https://drive.google.com/file/d/demo/view' },
    { runId: '2', nome: 'Multiplay', stile: 'Motion', durata: 28.1, quando: Date.now() - 7200e3 },
    { runId: '3', nome: 'Beats pokemon', stile: 'Motion', durata: 35.4, quando: Date.now() - 864e5 },
    { runId: '4', nome: 'Beats pokemon', stile: 'Motion', durata: 35.1, quando: Date.now() - 2 * 864e5 },
  ];
}
function demoHome() {
  const corso = new URLSearchParams(location.search).get('stato') === 'corso';
  return {
    impostazioni: { versione: 'stabile', ai: 'gemini', modello: 'sonnet', gemini: 'flash', stile: 'Blueprint', prova: 'manuale' },
    stato: corso ? {
      attivi: [{
        runId: '1001', nome: 'Benchy PETG', fase: 'regia', faseNome: 'Regia', minuti: 6, inCoda: false,
        fasi: [
          { id: 'scarico', nome: 'Download', dettaglio: 'da R2', fatta: true },
          { id: 'prepara', nome: 'Analisi', dettaglio: '4 sorgenti', fatta: true },
          { id: 'regia', nome: 'Regia', dettaglio: 'scelgo i tagli', fatta: false },
          { id: 'render', nome: 'Render', dettaglio: '', fatta: false },
          { id: 'carico', nome: 'Upload', dettaglio: '', fatta: false },
        ],
      }],
      pendenti: [], ultimi: [],
    } : { attivi: [], pendenti: [], ultimi: [] },
    video: demoFatti(),
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

function tabbar() {
  const voci = [['oggi', 'Oggi'], ['nuovo', 'Nuovo'], ['carica', 'Carica'], ['video', 'Video'], ['altro', 'Altro']];
  const attivo = stato.schermo === 'stile' ? 'altro' : stato.schermo;
  return `<nav class="tabbar">${voci.map(([id, nome]) => `<button class="tab${attivo === id ? ' attivo' : ''}" data-azione="vai" data-verso="${id}"><b>${nome === 'Carica' ? '↑' : nome === 'Oggi' ? '●' : nome === 'Nuovo' ? '+' : nome === 'Video' ? '▷' : '•••'}</b>${nome}</button>`).join('')}</nav>`;
}

function disegna() {
  const solo = stato.schermo === 'accesso';
  const corpo = {
    accesso: htmlAccesso, oggi: htmlOggi, nuovo: htmlNuovo, carica: htmlCarica, video: htmlVideo, dettaglio: htmlDettaglio, altro: htmlAltro, stile: htmlStile,
  }[stato.schermo] || htmlOggi;
  root.innerHTML = `<div class="app${solo ? ' solo' : ''}"><div class="view vista-${esc(stato.schermo)}">${corpo()}</div>${solo ? '' : tabbar()}${stato.toast ? `<div class="toast" role="status">${esc(stato.toast)}</div>` : ''}</div>`;
  const barra = root.querySelector('[data-barra]');
  if (barra) {
    const pct = stato.carica.byteTotali ? Math.min(100, 100 * stato.carica.byteFatti / stato.carica.byteTotali) : 0;
    barra.style.width = `${pct}%`;
  }
  adattaLista();
}

function adattaLista() {
  const lista = root.querySelector('.ultimi .lista');
  const view = root.querySelector('.view');
  if (!lista || !view) return;
  lista.querySelector('.vedi-tutti')?.remove();
  const voci = [...lista.querySelectorAll(':scope > .voce')];
  voci.forEach((v) => { v.hidden = false; });
  const nota = lista.parentElement.querySelector('.nota.piede');
  const notaH = nota ? nota.getBoundingClientRect().height + 14 : 0;
  const spazio = view.getBoundingClientRect().bottom - lista.getBoundingClientRect().top - notaH;
  const gap = 12;
  const altezza = (el) => el.getBoundingClientRect().height;
  let usato = 0;
  let visibili = 0;
  for (const v of voci) {
    const prossimo = usato + (visibili ? gap : 0) + altezza(v);
    if (prossimo > spazio + 1) break;
    usato = prossimo;
    visibili += 1;
  }
  if (visibili >= voci.length) return;
  const btnH = 56;
  while (visibili > 0 && usato + gap + btnH > spazio + 1) {
    visibili -= 1;
    usato -= altezza(voci[visibili]) + (visibili ? gap : 0);
  }
  for (let i = visibili; i < voci.length; i++) voci[i].hidden = true;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn ghost pieno vedi-tutti';
  b.dataset.azione = 'vai';
  b.dataset.verso = 'video';
  b.textContent = 'Vedi tutti';
  lista.appendChild(b);
}

function toast(testo) {
  stato.toast = testo;
  disegna();
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { stato.toast = ''; const t = root.querySelector('.toast'); if (t) t.remove(); }, 4200);
}

function vai(verso) {
  if (verso === 'nuovo' && !stato.nuovo) preparaNuovo();
  if (verso === 'carica' && stato.carica.fase === 'scelta' && !stato.carica.nome) stato.carica.cellulare = reteCellulare() || stato.carica.cellulare;
  stato.schermo = verso;
  if (verso === 'oggi' || verso === 'video' || verso === 'altro' || verso === 'dettaglio' || verso === 'stile') location.hash = verso === 'dettaglio' && stato.dettaglio ? `video/${stato.dettaglio.id}` : verso;
  disegna();
}

function htmlAccesso() {
  const a = stato.auth || {};
  return `<header class="top"><div class="marca"><i>▷</i> Regista</div></header>
    <p class="kicker">Solo Denis</p>
    <h1>Il montaggio, in tasca.</h1>
    <p class="sub">Passkey di questo iPhone. Il codice arriva su Telegram, una volta sola.</p>
    <div class="card">
      ${a.passkey ? '<button class="btn primario" data-azione="entra">Entra con la passkey</button>' : ''}
      <p class="etichetta" style="margin-top:14px">Codice</p>
      <input class="campo" id="codice" inputmode="text" autocapitalize="characters" autocomplete="one-time-code" placeholder="ABCD-1234">
      <button class="btn primario" data-azione="registra">${a.passkey ? 'Aggiungi questo iPhone' : 'Crea la passkey'}</button>
      <button class="btn ghost pieno" data-azione="chiedi-codice" style="margin-top:8px">Mandami il codice su Telegram</button>
      <p class="nota">Dopo il primo iPhone, Telegram da solo non basta più. Per un secondo telefono serve il codice segreto, oppure lo sblocco dall’iPhone già attivo.</p>
    </div>`;
}

function htmlOggi() {
  const h = stato.home || {};
  const s = h.stato || { attivi: [], pendenti: [], ultimi: [] };
  const attivi = s.attivi || [];
  return `<header class="top"><div class="marca"><i>▷</i> Regista</div><span class="avviso">${h.avvisi ? `${h.avvisi} avviso` : ''}</span></header>
    <div class="intro"><p class="kicker">Oggi</p><h1>Ciao Denis</h1></div>
    <div class="vivo" data-vivo>${htmlStato(s)}</div>
    ${h.upload && !h.upload.avviato ? `<div class="banner attenzione">${h.upload.pronto ? 'Il girato è pronto.' : 'C’è un caricamento aperto.'} <button class="btn mini" data-azione="vai" data-verso="carica">Apri</button></div>` : ''}
    <section class="ultimi"><h2>Ultimi</h2><div class="lista">${(h.video || []).map((v) => rigaVideo(v)).join('') || '<p class="vuoto">Ancora niente. Carica un girato o avvia una cartella.</p>'}</div>
    ${attivi.length ? '' : '<p class="nota piede">Lo stato si aggiorna da solo mentre l’app è aperta.</p>'}</section>`;
}

function htmlStato(s) {
  const attivi = s.attivi || [];
  if (!attivi.length && !(s.pendenti || []).length) return '<div class="card piatta"><p class="vuoto">Nessun montaggio in corso.</p></div>';
  return attivi.map((a) => `<article class="card">
      <p class="kicker">${esc(a.faseNome || 'In corso')} · ${a.minuti || 0} min</p>
      <h2>${esc(a.nome)}</h2>
      <div class="fasi">${(a.fasi || []).map((f) => `<i class="fase${f.fatta ? ' fatta' : ''}${f.id === a.fase ? ' ora' : ''}" title="${esc(f.nome)}"></i>`).join('')}</div>
      <p class="meta">${esc((a.fasi || []).find((f) => f.id === a.fase)?.dettaglio || a.faseNome || '')}</p>
    </article>`).join('') + (s.pendenti || []).map((p) => `<article class="card piatta"><h2>${esc(p.nome || 'In coda')}</h2><p class="meta">In attesa del server</p></article>`).join('');
}

function rigaVideo(v) {
  return `<button class="card scelta voce" data-azione="apri-video" data-verso="${esc(v.runId)}"><strong>${esc(v.nome)}</strong><small>${esc(v.stile || '')}${v.durata ? ` · ${v.durata} s` : ''}${v.prova ? ' · prova' : ''}</small></button>`;
}

function preparaNuovo(passo) {
  const up = stato.home?.upload;
  stato.nuovo = {
    passo: passo || (up?.pronto ? 'stile' : 'cartella'),
    dati: {
      cartella: up?.pronto ? up.nome : '',
      stile: stato.home?.impostazioni?.stile || 'Blueprint',
      sponsor: '', durata: '', tono: '', giudizio: '', tavola: '', note: '', sponsorSi: false,
    },
  };
}

function passiNuovo() {
  const stile = stato.nuovo?.dati.stile || 'Blueprint';
  return ['cartella', 'stile', 'sponsor', 'durata', 'tono', 'giudizio', ...(stile === 'Blueprint' ? ['tavola'] : []), 'note', 'riepilogo'];
}

function htmlNuovo() {
  if (!stato.nuovo) preparaNuovo();
  const n = stato.nuovo;
  const d = n.dati;
  const stili = stato.stili.length ? stato.stili : (stato.cartelle?.stili || []);
  let corpo = '';
  if (n.passo === 'cartella') {
    const elenco = stato.cartelle?.cartelle?.elenco || [];
    corpo = `<h1>Quale cartella?</h1><p class="sub">Quelle già su Drive, oppure un nome nuovo se il girato lo carichi da qui.</p>
      <div class="griglia">${elenco.map((c) => `<button class="btn pieno" data-azione="cartella" data-verso="${esc(c)}">${(stato.cartelle?.cartelle?.vai || []).includes(c) ? '⚡ ' : ''}${esc(c)}</button>`).join('')}</div>
      <input class="campo" id="nome-cartella" placeholder="Nome nuovo" value="${esc(d.cartella)}">
      <button class="btn primario" data-azione="cartella-testo">Usa questo nome</button>`;
  } else if (n.passo === 'stile') {
    corpo = `<h1>Che stile?</h1><div class="griglia">${stili.map((s) => `<button class="stile${s.nome === d.stile ? ' attivo' : ''}" data-azione="stile" data-verso="${esc(s.nome)}"><strong>${esc(s.tasto || s.nome)}</strong><small>${esc(s.cosa || s.desc || '')}</small></button>`).join('')}</div>`;
  } else if (n.passo === 'sponsor') {
    corpo = `<h1>C’è uno sponsor?</h1><div class="coppia"><button class="btn" data-azione="sponsor" data-verso="no">No</button><button class="btn" data-azione="sponsor" data-verso="si">Sì</button></div>`;
  } else if (n.passo === 'sponsor_testo') {
    corpo = `<h1>Marca e cosa si testa</h1><input class="campo" id="sponsor" placeholder="es. eSUN PETG, stampa Benchy veloce" value="${esc(d.sponsor)}"><button class="btn primario" data-azione="sponsor-testo">Avanti</button>`;
  } else if (n.passo === 'durata') {
    corpo = `<h1>Quanto deve durare?</h1><div class="griglia">${['30 s', '45 s', '60 s', ''].map((v) => `<button class="btn pieno" data-azione="campo" data-campo="durata" data-verso="${esc(v)}">${v || 'Automatica'}</button>`).join('')}</div>`;
  } else if (n.passo === 'tono') {
    corpo = `<h1>Che tono?</h1><div class="griglia">${[['diretto', 'Diretto'], ['ironico', 'Ironico'], ['tecnico', 'Tecnico'], ['entusiasta', 'Entusiasta'], ['', 'Automatico']].map(([v, et]) => `<button class="btn pieno" data-azione="campo" data-campo="tono" data-verso="${esc(v)}">${et}</button>`).join('')}</div>`;
  } else if (n.passo === 'giudizio') {
    corpo = `<h1>Giudizio finale</h1><p class="sub">Diventa la scritta di chiusura, con le tue parole.</p><div class="griglia">${['PROMOSSO ✓', 'CI STA', 'NON È MALE', 'BOCCIATO ✗', '-', ''].map((v) => `<button class="btn pieno" data-azione="campo" data-campo="giudizio" data-verso="${esc(v)}">${v === '-' ? 'Nessuna scritta' : v || 'Dal video'}</button>`).join('')}</div>`;
  } else if (n.passo === 'tavola') {
    corpo = `<h1>Numero tavola</h1><input class="campo" id="tavola" placeholder="TAV. 05" value="${esc(d.tavola)}"><button class="btn primario" data-azione="tavola">Avanti</button><button class="btn ghost pieno" data-azione="campo" data-campo="tavola" data-verso="">Automatica</button>`;
  } else if (n.passo === 'note') {
    corpo = `<h1>Indicazioni</h1><textarea id="note" placeholder="Cosa dire, cosa evitare…">${esc(d.note)}</textarea><button class="btn primario" data-azione="note">Avanti</button>`;
  } else {
    const righe = [
      ['Cartella', d.cartella || 'la prima con VAI'],
      ['Stile', d.stile],
      d.sponsor ? ['Sponsor', d.sponsor] : null,
      d.durata ? ['Durata', d.durata] : null,
      d.tono ? ['Tono', d.tono] : null,
      d.giudizio ? ['Giudizio', d.giudizio === '-' ? 'nessuna scritta' : d.giudizio] : null,
      d.tavola && d.stile === 'Blueprint' ? ['Tavola', d.tavola] : null,
      d.note ? ['Note', d.note] : null,
    ].filter(Boolean);
    corpo = `<h1>Pronto</h1><div class="card">${righe.map(([k, v]) => `<div class="riga"><span class="meta">${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('')}</div>
      <button class="btn primario" data-azione="avvia-montaggio">Avvia montaggio</button>
      <div class="coppia" style="margin-top:8px"><button class="btn" data-azione="modifica" data-verso="stile">Stile</button><button class="btn" data-azione="modifica" data-verso="note">Note</button></div>`;
  }
  return `<div class="intro"><p class="kicker">Nuovo montaggio</p></div>${corpo}<button class="btn ghost" data-azione="indietro-nuovo" style="margin-top:12px">Indietro</button>`;
}

function htmlProgresso(c) {
  const pct = c.byteTotali ? Math.round(100 * c.byteFatti / c.byteTotali) : 0;
  return `<div class="card">
      <p class="kicker">${c.fase === 'pronto' ? 'Arrivato' : 'In invio'} · 4 pezzi insieme</p>
      <p class="progresso-num">${pct}%</p>
      <div class="barra"><i data-barra style="width:${pct}%"></i></div>
      <div class="riga"><span>${byteTxt(c.byteFatti)} di ${byteTxt(c.byteTotali)}</span><strong>${c.fase === 'pronto' ? 'fatto' : tempoTxt(c.eta)}</strong></div>
      <p class="meta">${c.pezziFatti} pezzi al sicuro, non si rimandano${c.inVolo ? ` · ${c.inVolo} in viaggio` : ''}</p>
      ${(c.file || []).map((f) => `<div class="riga"><span>${esc(f.nome)}</span><span class="meta">${byteTxt(f.fatti)} / ${byteTxt(f.size)}</span></div>`).join('')}
      ${c.fase === 'invio' ? '<button class="btn pericolo pieno" data-azione="annulla-upload">Annulla</button>' : ''}
      ${c.fase === 'pronto' && !c.archivio ? '<button class="btn primario" data-azione="vai" data-verso="nuovo">Monta questi file</button>' : ''}
      ${c.fase === 'pronto' && c.archivio ? '<button class="btn primario" data-azione="copia-drive">Copiali su Drive</button>' : ''}
      ${c.fase === 'pronto' && c.modalita !== 'originali' ? '<p class="nota">Gli originali interi, quando hai il Wi-Fi. Il montaggio già partito non li vede da solo: dopo, dalla scheda del video, Rifai.</p>' : ''}
    </div>`;
}

function htmlCarica() {
  const c = stato.carica;
  const cell = c.cellulare;
  if (!c.modalitaScelta && cell && c.fase === 'scelta') c.modalita = 'scelti';
  const modi = [
    ['originali', 'Originali', 'Qualità della camera. In 4G ci mette di più, ma è il file da pubblicare.'],
    ['scelti', 'Solo i file scelti', 'Mandi le clip che servono per far partire la regia. Il resto, dopo, dal Wi-Fi.'],
    ['proxy', 'Copia leggera', 'Circa 720p, sul telefono. Lo schermo resta acceso e ci mette quanto dura il clip. L’audio può mancare. Non è da pubblicare.'],
  ];
  return `<div class="intro"><p class="kicker">In giro</p><h1>Carica il girato</h1></div>
    <p class="sub">Quattro pezzi da 8 MB in parallelo, diretti a Cloudflare. Quelli già arrivati non si rimandano. Drive lo copia il server, dopo.</p>
    <div class="banner${cell ? ' attenzione' : ''}">${cell ? 'Sei sui dati: meglio mandare meno, e il resto dal Wi-Fi.' : 'iPhone non dice da solo se sei in 4G. Se sei fuori, scegli «Solo i file scelti».'}</div>
    ${c.daRiselezionare ? '<div class="banner attenzione">iOS ha chiuso i file. Selezionali di nuovo, stesso nome e stessa dimensione: i pezzi già arrivati restano.</div>' : ''}
    ${c.errore ? `<div class="banner attenzione">${esc(c.errore)}</div>` : ''}
    ${c.fase === 'invio' || c.fase === 'pronto' ? htmlProgresso(c) : ''}
    <div class="griglia">${modi.map(([id, t, d]) => `<button class="scelta${c.modalita === id ? ' attivo' : ''}" data-azione="modalita" data-verso="${id}"><strong>${t}</strong><small>${d}</small></button>`).join('')}</div>
    ${c.fase === 'scelta' || c.fase === 'codifica' ? `<label class="etichetta">Nome del video</label><input class="campo" id="nome-video" value="${esc(c.nome)}" ${c.archivio ? 'readonly' : ''}>
      ${c.modalita === 'proxy' ? `<div class="coppia"><label>Dal secondo<input class="campo" id="proxy-da" type="number" min="0" value="${c.da}"></label><label>Al secondo<input class="campo" id="proxy-a" type="number" min="1" value="${c.a}"></label></div><p class="nota">La codifica è in tempo reale: 90 secondi di clip sono 90 secondi a schermo acceso. Un pezzo di MP4 tagliato a metà non è un video valido, per questo non mando “un intervallo” del file originale.</p>` : ''}
      <label class="etichetta">${c.modalita === 'scelti' ? 'Scegli solo le clip che servono' : 'File'}</label>
      <input class="campo" id="file-girato" type="file" accept="video/*,image/*,audio/*" multiple>
      <button class="btn primario" data-azione="avvia-upload">${c.archivio ? 'Manda il resto' : c.modalita === 'proxy' ? 'Prepara la copia e carica' : 'Carica'}</button>` : ''}
    ${c.fase === 'codifica' ? `<div class="card"><p class="kicker">Sul telefono</p><p>${esc(c.nota || 'Codifico… tieni l’app aperta.')}</p></div>` : ''}
    <p class="nota">Se cambi app o blocchi lo schermo, iOS può fermare l’invio. Non esiste un vero caricamento in background su Safari. Riapri l’app: riparte dai pezzi già fatti. La sveglia dello schermo resta accesa solo mentre la pagina è visibile.</p>`;
}

function htmlVideo() {
  return `<div class="intro"><p class="kicker">Video</p><h1>Fatti</h1></div>
    <div class="lista">${stato.video.length ? stato.video.map(rigaVideo).join('') : '<p class="vuoto">Nessun video ancora.</p>'}</div>
    <button class="btn ghost pieno" data-azione="ricarica-video">Aggiorna</button>`;
}

function htmlDettaglio() {
  const d = stato.dettaglio;
  if (!d) return '<p>Apro…</p>';
  const v = d.video || {};
  const m = d.memo || {};
  const pub = m.pubblica;
  const fileId = pub?.fileId;
  const stili = stato.stili.length ? stato.stili : demoStili();
  return `<div class="intro"><p class="kicker">${esc(m.stile || v.stile || '')}${v.durata ? ` · ${v.durata} s` : ''}</p><h1>${esc(m.nome || v.nome)}</h1></div>
    ${d.playback && fileId ? `<video class="player" controls playsinline src="/api/media/${esc(fileId)}"></video>` : `<div class="cornice"><div><strong>${esc(m.nome || v.nome)}</strong><p class="meta">${d.playback ? 'Apro il file…' : 'Per vederlo qui servono le chiavi Drive sul Worker.'}</p></div></div>`}
    ${v.link ? `<a class="btn pieno" href="${esc(v.link)}" target="_blank" rel="noopener">Apri su Drive</a>` : ''}
    <div class="azioni" style="margin-top:12px">
      <button class="btn primario" data-azione="video" data-verso="approva">${m.approvato ? 'Approvato' : 'Approva'}</button>
      ${pub ? `<textarea id="didascalia">${esc(pub.didascalia || '')}</textarea>
        <button class="btn pieno" data-azione="salva-didascalia">Salva didascalia</button>
        <input class="campo" id="titolo-yt" value="${esc(pub.youtube?.titolo || '')}">
        <button class="btn pieno" data-azione="salva-titolo">Salva titolo YouTube</button>
        <button class="btn pieno" data-azione="video" data-verso="ig">Instagram ${pub.ig === false ? 'spento' : 'acceso'}</button>
        <button class="btn pieno" data-azione="video" data-verso="yt">YouTube ${pub.yt === false ? 'spento' : 'acceso'}</button>
        <button class="btn primario" data-azione="video" data-verso="pubblica">Pubblica</button>` : '<p class="nota">Didascalie non ancora pronte.</p>'}
      <textarea id="correzione" placeholder="Cosa cambiare"></textarea>
      <button class="btn pieno" data-azione="correggi">Correggi</button>
      <label class="etichetta">Cambia stile</label>
      <select id="stile-video">${stili.map((s) => `<option ${s.nome === (m.stile || v.stile) ? 'selected' : ''}>${esc(s.nome)}</option>`).join('')}</select>
      <div class="coppia"><button class="btn" data-azione="video" data-verso="prova">Prova ${d.provaSecondi || 10}s</button><button class="btn" data-azione="video" data-verso="intero">Stile intero</button></div>
      <button class="btn pieno" data-azione="video" data-verso="render">Solo render</button>
      <button class="btn pieno" data-azione="video" data-verso="rifai">Rifai da zero</button>
      <button class="btn pieno" data-azione="video" data-verso="riprova">Riprova</button>
      <button class="btn pieno" data-azione="manda-resto">Manda il resto degli originali</button>
    </div>`;
}

function htmlAltro() {
  const imp = stato.home?.impostazioni || {};
  const stili = stato.stili.length ? stato.stili : [];
  const elenco = stato.cartelle?.cartelle?.elenco || [];
  const col = stato.collegamenti || {};
  const regia = stato.regia?.regia;
  return `<div class="intro"><p class="kicker">Altro</p><h1>Impostazioni</h1></div>
    <button class="card scelta voce" data-azione="vai" data-verso="stile"><strong>Studia uno stile</strong><small>Un video di riferimento, poi lo metti a punto con l’AI. Nessun montaggio parte da solo.</small></button>
    <div class="card">
      <label class="etichetta">Stile predefinito</label>
      <select data-imp="stile">${stili.map((s) => `<option ${s.nome === imp.stile ? 'selected' : ''}>${esc(s.nome)}</option>`).join('')}</select>
      <label class="etichetta">AI</label>
      <select data-imp="ai"><option ${imp.ai === 'gemini' ? 'selected' : ''}>gemini</option><option ${imp.ai === 'claude' ? 'selected' : ''}>claude</option></select>
      <label class="etichetta">Gemini</label>
      <select data-imp="gemini"><option ${imp.gemini === 'flash' ? 'selected' : ''}>flash</option><option ${imp.gemini === 'pro' ? 'selected' : ''}>pro</option></select>
      <label class="etichetta">Claude</label>
      <select data-imp="modello">${['haiku', 'sonnet', 'opus'].map((m) => `<option ${imp.modello === m ? 'selected' : ''}>${m}</option>`).join('')}</select>
      <label class="etichetta">Versione</label>
      <select data-imp="versione"><option ${imp.versione === 'stabile' ? 'selected' : ''}>stabile</option><option ${imp.versione === 'beta' ? 'selected' : ''}>beta</option></select>
      <label class="etichetta">Prova prima di montare</label>
      <select data-imp="prova"><option value="manuale" ${imp.prova === 'manuale' ? 'selected' : ''}>A mano</option><option value="auto" ${imp.prova === 'auto' ? 'selected' : ''}>Sempre, 10 s</option><option value="no" ${imp.prova === 'no' ? 'selected' : ''}>No, monta tutto</option></select>
    </div>
    <div class="card">
      <h2>Più video</h2>
      ${elenco.map((c) => `<label class="check"><input type="checkbox" value="${esc(c)}" data-lotto> ${esc(c)}</label>`).join('') || '<p class="vuoto">Aggiorna l’elenco cartelle.</p>'}
      <button class="btn primario" data-azione="lotto">Monta le scelte</button>
      <button class="btn ghost pieno" data-azione="aggiorna-cartelle">Aggiorna elenco</button>
    </div>
    <div class="card">
      <h2>Prova della regia</h2>
      <p class="sub">Solo il testo, su una cartella già montata. Non parte da un girato appena caricato.</p>
      <select id="regia-cartella">${elenco.map((c) => `<option>${esc(c)}</option>`).join('')}</select>
      <button class="btn pieno" data-azione="prova-regia">Chiedi la regia</button>
      ${regia ? `<p>${esc(regia.testo || '')}</p>` : ''}
    </div>
    <div class="card">
      <p>Instagram ${col.ig ? 'collegato' : 'non collegato'} · YouTube ${col.yt ? 'collegato' : 'non collegato'}</p>
      <button class="btn pieno" data-azione="push">Notifiche su questo iPhone</button>
      <p class="nota">Le notifiche arrivano solo se l’app è sulla Home e sul Worker ci sono le chiavi VAPID. Altrimenti l’avviso resta in Oggi.</p>
      <button class="btn pieno" data-azione="sblocco">Autorizza un altro iPhone</button>
      <button class="btn pericolo pieno" data-azione="esci">Esci</button>
    </div>
    <p class="nota">Cartelle Drive: 01 · Da editare, 02 · Fatti, 03 · Da pubblicare. Il secondo account Telegram non entra nell’app.</p>`;
}

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
  return `<div class="card errore-stile" data-errore-stile><p class="kicker">Non è andata</p><p>${esc(testo)}</p><small class="meta">Premi di nuovo Studia per riprovare.${prima}</small></div>`;
}

function htmlStile() {
  const s = stato.studio;
  if (s.fase === 'studio' && s.bozza?.haTesto) {
    const b = s.bozza;
    return `<button class="btn ghost" data-azione="studio-elenco">Elenco</button>
      <div class="intro"><p class="kicker">${s.errore ? 'Bozza precedente' : 'Stile'}</p><h1>${esc(b.nome || 'Bozza')}</h1></div>
      ${htmlErroreStile(s)}
      <div class="card scheda-stile">${righeRiassunto(b.riassunto)}</div>
      ${b.voce === false ? '<p class="nota">Senza trascrizione: solo fotogrammi e ritmo.</p>' : ''}
      ${(b.daCreare || []).length ? `<div class="card da-creare"><p class="kicker">Da creare</p><p class="meta">Nel riferimento ci sono effetti che lo stile non sa ancora fare: per ora usa i più vicini. Si possono programmare con Claude.</p><ul>${b.daCreare.map((d) => `<li>${esc(d)}</li>`).join('')}</ul></div>` : ''}
      <div class="filo">${(b.messaggi || []).map((m) => `<p class="bolla ${m.ruolo === 'denis' ? 'denis' : 'ai'}">${esc(m.testo)}</p>`).join('')}</div>
      <textarea class="detto" id="detto-stile" placeholder="Più veloce, sottotitoli gialli, meno zoom"></textarea>
      <button class="btn primario" data-azione="studio-invia"${s.occupato ? ' disabled' : ''}>${s.occupato ? esc(s.occupato) : 'Invia'}</button>
      <label class="etichetta">Nome dello stile</label>
      <input class="campo" id="nome-stile" value="${esc(b.nome || '')}" maxlength="40">
      <button class="btn pieno" data-azione="studio-salva">Salva stile</button>
      <p class="nota" data-upload-stile>${esc(s.nota || 'Salvare lo mette in Nuovo montaggio e nel bot. Non parte nessun montaggio.')}</p>`;
  }
  const salvati = s.salvati || [];
  return `<button class="btn ghost" data-azione="studio-chiudi">Indietro</button>
    <div class="intro"><p class="kicker">Stile</p><h1>Studia uno stile</h1></div>
    <p class="sub">Un video breve, tuo o di un creator. L’AI propone ritmo, scritte, colori e zoom. Poi lo correggi a parole.</p>
    ${s.occupato ? `<div class="card" data-passo-stile><p class="kicker">In corso</p><p>${esc(s.occupato)}</p></div>` : ''}
    ${htmlErroreStile(s)}
    <div class="card">
      <label class="etichetta">Video di riferimento</label>
      <input class="campo" id="file-stile" type="file" accept="video/*">
      <button class="btn primario" data-azione="studia"${s.occupato || s.invio ? ' disabled' : ''}>Studia</button>
      <p class="nota">Il video va su Cloudflare a pezzi (si riprende se si interrompe), poi l’AI lo guarda tutto, con l’audio, in 2–5 minuti: puoi chiudere l’app, ti avviso su Telegram. Non apre un montaggio e non compare in Oggi.</p>
      <p class="nota" data-upload-stile>${esc(s.nota || '')}</p>
    </div>
    ${s.bozza?.haTesto ? `<div class="card scheda-stile"${s.errore ? ' data-bozza-precedente' : ''}><p class="kicker">${s.errore ? 'Bozza precedente' : 'Bozza'}</p>${s.errore ? '<p class="meta">Non è il risultato di questo studio: è la bozza di prima.</p>' : ''}${righeRiassunto(s.bozza.riassunto)}<button class="btn pieno" data-azione="studio-continua">${s.errore ? 'Apri la bozza di prima' : 'Continua'}</button></div>` : ''}
    <h2>Salvati</h2>
    <div class="lista">${salvati.length ? salvati.map((v) => `<article class="card">
        <strong>${esc(v.nome)}</strong>
        <small class="meta">${esc(v.desc || '')}</small>
        <div class="azioni-riga">
          <button class="btn" data-azione="studio-apri" data-verso="${esc(v.id)}">Apri</button>
          <button class="btn" data-azione="studio-rinomina" data-verso="${esc(v.id)}">Rinomina</button>
          <button class="btn" data-azione="studio-duplica" data-verso="${esc(v.id)}">Duplica</button>
          <button class="btn pericolo" data-azione="studio-elimina" data-verso="${esc(v.id)}">Elimina</button>
        </div>
      </article>`).join('') : '<p class="vuoto">Nessuno ancora. Il primo che salvi compare anche in Nuovo montaggio.</p>'}</div>`;
}

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-azione]');
  if (!el || !root.contains(el)) return;
  const azione = el.dataset.azione;
  const verso = el.dataset.verso || '';
  try {
    if (azione === 'vai') {
      if (verso === 'nuovo') preparaNuovo(DEMO && DEMO_VISTA === 'nuovo' ? 'stile' : undefined);
      if (verso === 'video') stato.video = (await api('/api/video')).video || [];
      if (verso === 'altro') await caricaAltro();
      if (verso === 'stile') { await caricaStudio(); stato.studio.fase = 'elenco'; }
      vai(verso);
    } else if (azione === 'chiedi-codice') {
      await api('/api/auth/codice', { method: 'POST', body: {} });
      toast('Codice mandato su Telegram. Vale 10 minuti.');
    } else if (azione === 'entra') await entra();
    else if (azione === 'registra') await registra();
    else if (azione === 'cartella') { stato.nuovo.dati.cartella = verso; avantiNuovo('cartella'); }
    else if (azione === 'cartella-testo') { stato.nuovo.dati.cartella = root.querySelector('#nome-cartella').value.trim(); avantiNuovo('cartella'); }
    else if (azione === 'stile') { stato.nuovo.dati.stile = verso; avantiNuovo('stile'); }
    else if (azione === 'sponsor') {
      stato.nuovo.dati.sponsorSi = verso === 'si';
      if (verso !== 'si') stato.nuovo.dati.sponsor = '';
      stato.nuovo.passo = verso === 'si' ? 'sponsor_testo' : prossimo('sponsor');
      disegna();
    } else if (azione === 'sponsor-testo') { stato.nuovo.dati.sponsor = root.querySelector('#sponsor').value.trim(); avantiNuovo('sponsor'); }
    else if (azione === 'campo') { stato.nuovo.dati[el.dataset.campo] = verso; avantiNuovo(el.dataset.campo); }
    else if (azione === 'tavola') { stato.nuovo.dati.tavola = root.querySelector('#tavola').value.trim(); avantiNuovo('tavola'); }
    else if (azione === 'note') { stato.nuovo.dati.note = root.querySelector('#note').value.trim(); avantiNuovo('note'); }
    else if (azione === 'modifica') { stato.nuovo.passo = verso; disegna(); }
    else if (azione === 'indietro-nuovo') indietroNuovo();
    else if (azione === 'avvia-montaggio') await avviaMontaggio();
    else if (azione === 'modalita') { stato.carica.modalita = verso; stato.carica.modalitaScelta = true; disegna(); }
    else if (azione === 'avvia-upload') await avviaUpload();
    else if (azione === 'annulla-upload') await annullaUpload();
    else if (azione === 'copia-drive') await copiaDrive();
    else if (azione === 'apri-video') await apriVideo(verso);
    else if (azione === 'ricarica-video') { stato.video = (await api('/api/video')).video || []; disegna(); }
    else if (azione === 'video') await azioneVideo(verso);
    else if (azione === 'salva-didascalia') await azioneVideo('didascalia', root.querySelector('#didascalia').value);
    else if (azione === 'salva-titolo') await azioneVideo('titolo', root.querySelector('#titolo-yt').value);
    else if (azione === 'correggi') await azioneVideo('correggi', root.querySelector('#correzione').value);
    else if (azione === 'manda-resto') mandaResto();
    else if (azione === 'lotto') await lotto();
    else if (azione === 'aggiorna-cartelle') { await api('/api/cartelle/aggiorna', { method: 'POST', body: {} }); toast('Ho chiesto l’elenco a Drive.'); }
    else if (azione === 'prova-regia') await provaRegia();
    else if (azione === 'push') await attivaPush();
    else if (azione === 'sblocco') { await api('/api/auth/sblocco', { method: 'POST', body: {} }); toast('Codice mandato su Telegram. Vale 10 minuti sul telefono nuovo.'); }
    else if (azione === 'esci') { await api('/api/auth/esci', { method: 'POST', body: {} }); stato.schermo = 'accesso'; disegna(); }
    else if (azione === 'studio-chiudi') vai('altro');
    else if (azione === 'studio-elenco') { stato.studio.fase = 'elenco'; await caricaStudio(); disegna(); }
    else if (azione === 'studio-continua') { stato.studio.fase = 'studio'; disegna(); }
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
    const valore = imp.value;
    try {
      const r = await api('/api/impostazioni', { method: 'POST', body: { [imp.dataset.imp]: valore } });
      stato.home.impostazioni = r.impostazioni || stato.home.impostazioni;
      toast('Salvato.');
    } catch (err) { toast(err.message); }
  }
  if (e.target.id === 'file-girato') stato.carica.selezionati = [...e.target.files];
  if (e.target.id === 'nome-video') stato.carica.nome = e.target.value;
  if (e.target.id === 'proxy-da') stato.carica.da = Number(e.target.value) || 0;
  if (e.target.id === 'proxy-a') stato.carica.a = Number(e.target.value) || 90;
  if (e.target.id === 'file-stile') stato.studio.file = e.target.files?.[0] || null;
});

function prossimo(da) {
  const v = passiNuovo();
  const i = v.indexOf(da);
  return v[Math.min(v.length - 1, i + 1)] || 'riepilogo';
}
function avantiNuovo(da) {
  stato.nuovo.passo = prossimo(da);
  disegna();
}
function indietroNuovo() {
  const v = passiNuovo();
  const ora = stato.nuovo.passo === 'sponsor_testo' ? 'sponsor' : stato.nuovo.passo;
  const i = v.indexOf(ora);
  if (i <= 0) return vai('oggi');
  stato.nuovo.passo = v[i - 1];
  disegna();
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
  const d = stato.nuovo.dati;
  const up = stato.home?.upload;
  await api('/api/montaggi', { method: 'POST', body: { ...d, ...(up?.pronto ? { r2: up.id } : {}) } });
  toast(up?.pronto ? 'Montaggio avviato dal girato caricato.' : 'Montaggio avviato.');
  stato.nuovo = null;
  await caricaHome();
  vai('oggi');
}

async function apriVideo(id) {
  stato.dettaglio = await api(`/api/video/${id}`);
  stato.dettaglio.id = id;
  if (!stato.stili.length) {
    try { stato.stili = (await api('/api/stili')).stili || []; } catch { /* elenco già in memoria */ }
  }
  vai('dettaglio');
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
  c.errore = '';
  if (c.modalita === 'proxy') {
    c.fase = 'codifica';
    disegna();
    const uscita = [];
    for (const f of files) {
      if (!String(f.type || '').startsWith('video/')) { uscita.push(f); continue; }
      const fatto = await creaProxy(f, c.da, c.a, (testo) => { c.nota = testo; const p = root.querySelector('.card p'); if (stato.schermo === 'carica' && p) p.textContent = testo; });
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
  const upload = inizio.upload;
  const c = stato.carica;
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
  const parallelo = inizio.parallelo || 4;
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
  c.eta = 0;
  c.inVolo = 0;
  if (stato.home) {
    const fresco = await api(`/api/upload/${upload.id}`);
    stato.home.upload = fresco;
  }
  disegna();
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
function aggiornaBarra(campioni, volo) {
  const c = stato.carica;
  const extra = [...volo.values()].reduce((t, n) => t + n, 0);
  const mostrati = c.byteFatti + extra;
  const ora = performance.now();
  campioni.push({ t: ora, b: mostrati });
  while (campioni.length && ora - campioni[0].t > 20000) campioni.shift();
  const a = campioni[0];
  const dt = (ora - a.t) / 1000;
  c.eta = dt > 1 && mostrati > a.b ? (c.byteTotali - mostrati) / ((mostrati - a.b) / dt) : c.eta;
  c.inVolo = volo.size;
  const num = root.querySelector('.progresso-num');
  const barra = root.querySelector('[data-barra]');
  const meta = root.querySelector('.card .meta');
  const pct = c.byteTotali ? Math.round(100 * mostrati / c.byteTotali) : 0;
  if (num) num.textContent = `${pct}%`;
  if (barra) barra.style.width = `${pct}%`;
  if (meta) meta.textContent = `${c.pezziFatti} pezzi al sicuro, non si rimandano · ${c.inVolo} in viaggio`;
  const riga = root.querySelector('.card .riga strong');
  if (riga) riga.textContent = tempoTxt(c.eta);
  const sinistra = root.querySelector('.card .riga span');
  if (sinistra) sinistra.textContent = `${byteTxt(mostrati)} di ${byteTxt(c.byteTotali)}`;
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
}

setInterval(() => {
  if (!DEMO && document.visibilityState === 'visible' && stato.schermo === 'oggi' && stato.home) {
    api('/api/stato').then((s) => {
      stato.home.stato = s;
      const box = root.querySelector('[data-vivo]');
      if (box && stato.schermo === 'oggi') { box.innerHTML = htmlStato(s); adattaLista(); }
    }).catch(() => {});
  }
}, 5000);

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
  toast(r.avviso || 'Stile salvato. Lo trovi in Nuovo montaggio e nel bot.');
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
  const parallelo = inizio.parallelo || 4;
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
  const vista = DEMO ? (DEMO_VISTA && DEMO_VISTA !== '1' ? DEMO_VISTA : 'oggi') : (location.hash.replace('#', '').split('/')[0] || 'oggi');
  if (vista === 'nuovo') preparaNuovo('stile');
  if (DEMO && vista === 'carica') preparaDemoCarica();
  if (vista === 'dettaglio') { await apriVideo(DEMO ? '900' : (location.hash.split('/')[1] || '')); return; }
  if (vista === 'video') stato.video = (await api('/api/video')).video || [];
  if (vista === 'altro') await caricaAltro();
  if (vista === 'stile') {
    await caricaStudio();
    if (DEMO && DEMO_STATO === 'analizza') stato.studio.occupato = 'L’AI analizza lo stile… (fino a un minuto)';
    if (DEMO && DEMO_STATO === 'errore') stato.studio.errore = 'Il telefono non riesce a estrarre i fotogrammi da questo video (spesso succede con HEVC/MOV pesanti). Prova un file più corto o esportato in H.264.';
    if (DEMO && DEMO_STATO === 'carico') stato.studio.nota = 'Carico il file intero… 40%';
  }
  vai(vista === 'accesso' ? 'accesso' : vista);
}

parti().catch((e) => { stato.toast = e.message; disegna(); });

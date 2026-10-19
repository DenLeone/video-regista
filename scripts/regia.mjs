// Dalla "regia" scritta dall'AI (frasi + inquadrature) al piano che Remotion
// esegue (tempi esatti). L'AI non fa mai conti sui tempi: sceglie cosa dire e
// cosa mostrare, i secondi li calcola questo file.

const FPS = 30;
const q = (s) => +(Math.round(s * FPS) / FPS).toFixed(4); // tempi allineati ai fotogrammi

export const normFrase = (id) => {
  const m = /(\d+)/.exec(String(id || ''));
  return m ? `F${String(Number(m[1])).padStart(3, '0')}` : null;
};
const baseNome = (s) => String(s || '').replace(/\.[^.]+$/, '').toLowerCase();

// la sorgente `c` può mostrare la frase `f`? (è la camera della voce, o è sincronizzata e la copre tutta)
export function offsetCamera(c, f) {
  if (!c || c.tipo !== 'video') return null;
  if (c.id === f.principale) return 0;
  if (c.sync?.con !== f.principale) return null;
  const off = c.sync.offset;
  return f.inizio + off >= 0 && f.fine + off <= c.durata - 0.05 ? off : null;
}

export function risolviRegia(regia, analisi) {
  const avvisi = [];
  const sorgenti = analisi.sorgenti;
  const trovaSorgente = (nome) => sorgenti.find((s) => baseNome(s.id) === baseNome(nome) || baseNome(s.file) === baseNome(nome));
  const frasi = new Map(analisi.frasi.map((f) => [f.id, f]));
  const broll = sorgenti.filter((s) => s.tipo === 'video' && !s.sync && !s.principale);
  // solo riprese, senza parlato: Denis registra la voce dopo, sopra al video finito (Key air,
  // 18/10), quindi l'audio delle clip (fruscio, mani, stanza) va tolto, salvo "audio": "ambiente"
  const senzaVoce = !(regia.sequenza || []).some((it) => it.frase);
  let girandolaBroll = 0;

  // la chiusura non resta mai a metà frase: se l'ultima frase continua nella successiva
  // (stessa voce, senza punto né pausa) aggiungo le frasi che servono ad arrivare a un punto,
  // al massimo 2 e 7 s in più; se il punto non arriva non aggiungo niente e lo segnalo
  const sequenza = [...(regia.sequenza || [])];
  const ultimo = sequenza.map((it) => Boolean(it.frase)).lastIndexOf(true);
  const fUltima = ultimo >= 0 ? frasi.get(normFrase(sequenza[ultimo].frase)) : null;
  if (fUltima && successiva(analisi.frasi, fUltima)) {
    const catena = [];
    for (let f = fUltima, extra = 0; catena.length < 2;) {
      const g = successiva(analisi.frasi, f);
      if (!g || sequenza.some((it) => normFrase(it.frase) === g.id) || (extra += g.fine - g.inizio) > 7) break;
      catena.push(g); f = g;
      if (/[.!?…]/.test(g.testo)) break;
    }
    const fino = catena.findIndex((g) => /[.!?…]/.test(g.testo));
    if (fino >= 0) {
      catena.slice(0, fino + 1).forEach((g, n) => sequenza.splice(ultimo + 1 + n, 0, { frase: g.id, camera: sequenza[ultimo].camera }));
      avvisi.push(`chiusura completata con ${catena.slice(0, fino + 1).map((g) => g.id).join(', ')}: l'ultima frase era a metà`);
    } else avvisi.push(`la chiusura (${fUltima.id}) finisce a metà frase`);
  } else if (fUltima && !finita(fUltima.testo)) avvisi.push(`la chiusura (${fUltima.id}) finisce senza punto: controlla`);

  // ripartenze dentro la stessa frase: "…in più versioni e quindi mi | E quindi mi interessava…"
  // (Lark A2): se la frase dopo comincia con le ultime parole di quella prima, la prima si
  // accorcia prima delle parole ripetute (tempi parola di Whisper, con un filo di margine)
  const fineTaglio = new Map();
  sequenza.forEach((it, idx) => {
    const f = frasi.get(normFrase(it.frase)), g = frasi.get(normFrase(sequenza[idx + 1]?.frase));
    if (!f || !g || f.principale !== g.principale) return;
    const pf = paroleDi(f.testo), pg = paroleDi(g.testo);
    let k = 0;
    for (let n = Math.min(5, pf.length - 2, pg.length - 1); n >= 2; n--) if (pf.slice(-n).join(' ') === pg.slice(0, n).join(' ')) { k = n; break; }
    if (!k) return;
    const parole = (sorgenti.find((x) => x.id === f.principale)?.parole || []).filter((w) => w.s >= f.inizio - 0.3 && w.s < f.fine);
    const prima = parole[parole.length - k];
    if (!prima || paroleDi(prima.w)[0] !== pf[pf.length - k]) return;
    const taglio = Math.max(f.inizio + 0.4, prima.s - 0.02);
    if (taglio < f.fine - 0.1) { fineTaglio.set(idx, { t: taglio, parole: k }); avvisi.push(`${f.id}: tolto "${pf.slice(-k).join(' ')}" ripetuto all'inizio di ${g.id}`); }
  });

  const clips = [];
  const inizioVoce = []; // per ogni elemento della sequenza: dove inizia sulla timeline finale
  const testo = [];
  const parole = []; // parole del montaggio sulla timeline finale (sottotitoli parola per parola)
  let t = 0;

  sequenza.forEach((it, idx) => {
    let clip = null;
    if (it.frase) {
      const f = frasi.get(normFrase(it.frase));
      if (!f) { avvisi.push(`frase ${it.frase} inesistente: saltata`); return; }
      const voce = sorgenti.find((s) => s.id === f.principale);
      const taglio = fineTaglio.get(idx);
      const dur = q((taglio ? taglio.t : f.fine) - f.inizio);
      testo.push(taglio ? f.testo.trim().split(/\s+/).slice(0, -taglio.parole).join(' ') : f.testo);
      paroleFrase(voce, f, taglio).forEach((w) => parole.push({ at: q(t + Math.max(0, w.s - f.inizio)), dur: +Math.max(0.05, w.e - w.s).toFixed(3), w: w.w }));
      const audio = { file: voce.voce, start: +f.inizio.toFixed(3) };
      if (it.broll) {
        const b = trovaSorgente(it.broll);
        if (b && b.tipo === 'video' && b.durata >= dur) {
          let da = Math.max(0, Number(it.da) || 0);
          if (da + dur > b.durata) da = Math.max(0, b.durata - dur - 0.05);
          clip = { file: b.file, start: +da.toFixed(3), end: +(da + dur).toFixed(3), orient: b.orient, audio };
        } else avvisi.push(`B-roll ${it.broll} ${b ? 'troppo corto' : 'inesistente'} per ${f.id}: uso un'inquadratura della voce`);
      }
      if (!clip) {
        let cam = it.camera ? trovaSorgente(it.camera) : null;
        if (it.camera && offsetCamera(cam, f) == null) { avvisi.push(`${it.camera} non copre ${f.id}: cambio inquadratura`); cam = null; }
        if (!cam) cam = sorgenti.find((s) => s.id === f.principale && s.tipo === 'video') || sorgenti.find((s) => offsetCamera(s, f) != null);
        if (cam) {
          const off = offsetCamera(cam, f);
          clip = { file: cam.file, start: +(f.inizio + off).toFixed(3), end: +(f.inizio + off + dur).toFixed(3), orient: cam.orient, audio };
        } else {
          // solo audio (mic esterno) e nessuna camera sincronizzata: copro con un B-roll
          const b = broll.filter((s) => s.durata >= dur)[girandolaBroll++ % Math.max(1, broll.length)];
          if (!b) { avvisi.push(`${f.id}: nessuna immagine disponibile, saltata`); return; }
          clip = { file: b.file, start: 0, end: dur, orient: b.orient, audio };
        }
      }
    } else if (it.broll) {
      const b = trovaSorgente(it.broll);
      if (!b || b.tipo !== 'video') { avvisi.push(`B-roll ${it.broll} inesistente: saltato`); return; }
      const dur = q(Math.min(6, Math.max(0.4, Number(it.dur) || 1.5)));
      let da = Math.max(0, Number(it.da) || 0);
      if (da + dur > b.durata) da = Math.max(0, b.durata - dur - 0.05);
      clip = { file: b.file, start: +da.toFixed(3), end: +(da + dur).toFixed(3), orient: b.orient };
      // la Sony registra audio solo dal microfono interno: lo uso come ambiente, ma piano
      if (it.audio === 'muto' || b.soloImmagini || (senzaVoce && it.audio !== 'ambiente')) clip.muto = true;
      else if (b.dispositivo === 'sony') clip.volume = 0.35;
    } else {
      avvisi.push(`elemento ${idx + 1} senza frase né broll: saltato`);
      return;
    }
    // jump cut sulla stessa inquadratura: alterno lo zoom se l'AI non l'ha deciso
    const prev = clips[clips.length - 1];
    clip.punch = typeof it.punch === 'boolean' ? it.punch : Boolean(prev && prev.file === clip.file && !prev.punch);
    if (it.bn === true) clip.bn = true; // stili su misura con il bianco e nero nei momenti di racconto
    // inserto: scheda arrotondata sopra l'inquadratura mentre Denis parla di quello che mostra
    if (it.inserto) {
      const nomeIns = String(it.inserto);
      const img = (analisi.immagini || []).find((x) => baseNome(x.id) === baseNome(nomeIns) || baseNome(x.file) === baseNome(nomeIns));
      const durClip = clip.end - clip.start;
      const b = img ? null : trovaSorgente(nomeIns);
      if (img) clip.inserto = { file: img.file, tipo: 'immagine', orient: img.orient };
      else if (b && b.tipo === 'video' && b.durata >= durClip) {
        let da = Math.max(0, Number(it.inserto_da) || 0);
        if (da + durClip > b.durata) da = Math.max(0, b.durata - durClip - 0.05);
        // almeno 1,6 s di video: se la frase è corta la scheda prosegue sopra la clip dopo
        const durIns = Math.min(b.durata - da, Math.max(durClip, 1.6));
        clip.inserto = { file: b.file, tipo: 'video', orient: b.orient, start: +da.toFixed(3), end: +(da + durIns).toFixed(3) };
        // stesso video di seguito: la scheda resta e il video prosegue
        const precIns = clips[clips.length - 1]?.inserto;
        if (precIns && precIns.file === b.file && precIns.tipo === 'video' && Math.abs(precIns.end - da) < 0.3) clip.inserto.continua = true;
      } else avvisi.push(`inserto ${nomeIns} ${b ? 'troppo corto' : 'inesistente'}: tolto`);
    }
    inizioVoce[idx] = t;
    clips.push(clip);
    t = q(t + (clip.end - clip.start));
  });

  const totale = t;
  if (!clips.length) throw new Error('la regia non contiene nessuna clip utilizzabile');
  // il montaggio deve seguire l'ordine del discorso (Lark A2, 18/10: frasi rimescolate con
  // "appunto", "però", "l'unica" rimasti senza la frase a cui si riferivano)
  const usate = sequenza.map((it) => frasi.get(normFrase(it.frase))).filter(Boolean);
  const indietro = usate.slice(2).filter((f, i) => f.principale === usate[i + 1].principale && analisi.frasi.indexOf(f) < analisi.frasi.indexOf(usate[i + 1])).length;
  if (indietro) avvisi.push(`ordine del discorso cambiato ${indietro} volt${indietro === 1 ? 'a' : 'e'}`);
  // una frase che finisce senza punteggiatura continua nella successiva: staccarla la spezza
  // ("…per 45 più | coupon ovviamente…", Lark A2 prova del 18/10); dopo una virgola si può chiudere
  // (saltare una continuazione interrotta — "fosse..." — e riprendere subito dopo va bene; una
  // ripetizione no: può contenere la fine della frase prima, come "o meno," in Lark A2)
  const segni = segniFrasi(analisi.frasi);
  const falsaPartenza = (g) => (segni.get(g.id) || []).includes('interrotta');
  usate.forEach((f, i) => {
    const g = successiva(analisi.frasi, f), dopo = usate[i + 1];
    if (!g || !dopo || dopo === g || /[,;:]$/.test(f.testo.trim())) return;
    const salto = analisi.frasi.indexOf(dopo) - analisi.frasi.indexOf(g);
    if (falsaPartenza(g) && dopo.principale === g.principale && salto > 0 && salto <= 2) return;
    avvisi.push(`${f.id} lasciata a metà: continua in ${g.id}`);
  });
  if (usate[0] && (RIMANDO.test(usate[0].testo.trim()) || /\bappunto\b/i.test(usate[0].testo.split(/\s+/).slice(0, 8).join(' ')))) {
    avvisi.push(`l'apertura (${usate[0].id}) rimanda a qualcosa detto prima: scegli un aggancio che si capisce da solo`);
  }
  // una frase che rimanda a prima va dopo una delle 3 frasi che la precedono nel girato
  // (si possono saltare una falsa partenza o un inciso, non un pezzo di discorso)
  usate.forEach((f, i) => {
    if (!RIMANDO.test(f.testo.trim())) return;
    const k = analisi.frasi.indexOf(f);
    const prima = analisi.frasi.slice(Math.max(0, k - 3), k).filter((g) => g.principale === f.principale);
    if (prima.length && !prima.includes(usate[i - 1])) avvisi.push(`${f.id} ("${f.testo.split(' ').slice(0, 3).join(' ')}…") è staccata da ciò a cui si riferisce (${prima[prima.length - 1].id})`);
  });
  // con parlato disponibile, una regia che non usa (quasi) nessuna frase valida è da rifare con l'altra AI
  if (analisi.frasi.length) {
    const conFrase = sequenza.filter((it) => it.frase);
    const valide = conFrase.filter((it) => frasi.has(normFrase(it.frase)));
    if (!valide.length || valide.length < conFrase.length / 2) throw new Error(`la regia usa frasi inesistenti (${conFrase.length - valide.length} su ${conFrase.length})`);
  }
  const inizioFrase = (id) => {
    const n = normFrase(id);
    const idx = sequenza.findIndex((it, i) => normFrase(it.frase) === n && inizioVoce[i] != null);
    return idx >= 0 ? inizioVoce[idx] : null;
  };

  // senza parlato le scritte si agganciano all'elemento della sequenza (numero da 1), come i
  // flicker (Key air, 17/10: l'AI usava "elemento" e lo script toglieva tutte le scritte)
  const inizioElemento = (n) => (Number.isInteger(Number(n)) ? inizioVoce[Number(n) - 1] ?? null : null);
  let keywords = [];
  for (const k of regia.keywords || []) {
    let at = k.frase ? inizioFrase(k.frase) : k.elemento != null ? inizioElemento(k.elemento) : (typeof k.at === 'number' ? k.at : null);
    if (at == null) {
      avvisi.push(`parola chiave ${k.word}: ${k.frase ? `frase ${k.frase} non usata nel montaggio` : k.elemento != null ? `elemento ${k.elemento} inesistente` : 'senza frase né elemento'}, tolta`);
      continue;
    }
    // almeno un secondo prima della fine: una scritta sull'ultima parola durerebbe mezzo secondo
    at = q(Math.max(0, Math.min(totale - 1, at + (Number(k.ritardo) || 0))));
    const dur = k.fino_alla_fine ? totale - at : Math.min(4, Math.max(0.8, Number(k.dur) || 2));
    const word = correggiParole(String(k.word || ''), parole.filter((w) => w.at > at - 3 && w.at < at + dur + 4));
    keywords.push({ at, dur: q(dur), word, note: k.note, tag: k.tag, filled: Boolean(k.filled), top: Number(k.top) || undefined }); // senza top: quello dello stile
  }
  keywords.sort((a, b) => a.at - b.at);
  for (let i = 1; i < keywords.length; i++) {
    const p = keywords[i - 1];
    if (p.at + p.dur > keywords[i].at - 0.05) p.dur = q(Math.max(0.6, keywords[i].at - p.at - 0.05));
  }
  keywords = keywords.filter((k, i) => i === 0 || k.at > keywords[i - 1].at);

  const flickers = [];
  for (const fl of regia.flickers || []) {
    const i = Number(fl.prima_di) - 1;
    const at = Number.isInteger(i) && inizioVoce[i] != null ? inizioVoce[i] - 0.12 : (typeof fl.at === 'number' ? fl.at : null);
    if (at == null || at < 0 || at > totale) continue;
    flickers.push({ at: q(at), seed: Number(fl.seed) || 3, tear: Boolean(fl.tear) });
  }

  const sponsorAt = regia.sponsor && regia.sponsorFrase ? inizioFrase(regia.sponsorFrase) ?? 0 : 0;

  return {
    piano: {
      titolo: regia.titolo || analisi.cartella,
      tavola: regia.tavola || 'TAV. NUOVA',
      soggetto: regia.soggetto || String(analisi.cartella).toUpperCase(),
      clips, keywords, flickers,
      sponsor: regia.sponsor || null,
      sponsorAt,
      note: [regia.note, ...avvisi.map((a) => `⚠️ ${a}`)].filter(Boolean).join(' · '),
      testo: testo.join(' '),
      parole: parole.filter((w) => w.at < totale - 0.05),
      ...(Array.isArray(regia.enfasi) && regia.enfasi.length ? { enfasi: regia.enfasi.map(String).slice(0, 8) } : {}),
    },
    avvisi,
    durata: totale,
  };
}

// Segni per l'AI accanto alle frasi (Lark A2, 18/10: la regia apriva su una falsa partenza
// e chiudeva su "Questi top" tagliato):
//   →F009             continua nella F009 senza pausa né punto: vanno prese insieme
//   ripresa meglio in F003  falsa partenza o ripetizione che Denis ridice poco dopo
//   interrotta / finisce a metà  frase lasciata in sospeso
// le parole delle scritte che l'AI ha copiato male dal parlato ("PROMOSTISSIMO" per
// "promossissimo", Giacca autunnale 19/10) si correggono con quelle dette lì vicino; solo
// parole lunghe e quasi uguali, così nomi e marchi corti ("SONY" non diventa "sono") restano
function correggiParole(testo, vicine) {
  const dette = [...new Set(vicine.flatMap((w) => paroleDi(w.w)))];
  return testo.replace(/[\p{L}\p{N}']+/gu, (t) => {
    const n = paroleDi(t).join('');
    if (n.length < 6 || dette.includes(n)) return t;
    const d = dette.map((x) => [x, distanza(n, x)]).filter(([x, k]) => k <= (n.length >= 9 ? 2 : 1) && Math.abs(x.length - n.length) <= 2).sort((a, b) => a[1] - b[1])[0];
    if (!d) return t;
    const giusta = vicine.map((w) => w.w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')).find((w) => paroleDi(w).join('') === d[0]) || d[0];
    return t === t.toUpperCase() ? giusta.toUpperCase() : giusta;
  });
}
function distanza(a, b) {
  let riga = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const nuova = [i];
    for (let j = 1; j <= b.length; j++) nuova[j] = Math.min(riga[j] + 1, nuova[j - 1] + 1, riga[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    riga = nuova;
  }
  return riga[b.length];
}

const RIMANDO = /^(appunto|però|quindi|anche|ma|perché|poi|infatti|cioè|questo|questa|questi|queste|l'unica|l'unico|invece|allora|comunque)\b/i;
const finita = (t) => /[.!?…]["»”)]?$/.test(String(t).trim());
// le parole di Whisper della frase `f` (quelle del suo testo, nello stesso ordine), senza le
// ultime tolte dal taglio sulle ripetizioni. Whisper sbaglia i bordi anche di mezzo secondo
// (Wave3: "5" 0,4 s prima della frase, "pronto" dopo la fine): cerco la sequenza esatta in una
// finestra larga e riporto i tempi dentro la frase, in ordine
function paroleFrase(voce, f, taglio) {
  const fine = taglio ? taglio.t : f.fine;
  const tutte = (voce?.parole || []).filter((w) => w.s >= f.inizio - 1 && w.s < f.fine + 0.6);
  const tok = f.testo.trim().split(/\s+/);
  let da = -1;
  tutte.forEach((w, i) => {
    if (!tok.every((x, k) => String(tutte[i + k]?.w || '').trim() === x)) return;
    if (da < 0 || Math.abs(w.s - f.inizio) < Math.abs(tutte[da].s - f.inizio)) da = i;
  });
  let scelte = da >= 0 ? tutte.slice(da, da + tok.length) : tutte.filter((w) => w.s >= f.inizio - 0.25 && w.s < f.fine);
  if (taglio) scelte = scelte.slice(0, -taglio.parole);
  let prima = f.inizio - 0.06;
  return scelte.map((w) => {
    const s = Math.min(Math.max(w.s, prima + 0.06), fine - 0.12);
    prima = s;
    return { w: String(w.w).trim(), s, e: Math.max(s + 0.05, Math.min(w.e, fine)) };
  });
}

const paroleDi = (t) => (String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(/[a-z0-9]+/g) || []);
export function successiva(frasi, f) {
  const g = frasi[frasi.indexOf(f) + 1];
  return g && g.principale === f.principale && !finita(f.testo) && g.inizio - f.fine < 0.8 ? g : null;
}
export function segniFrasi(frasi) {
  const out = new Map();
  frasi.forEach((f, i) => {
    const segni = [];
    const g = successiva(frasi, f);
    if (g) segni.push(`→${g.id}`);
    else if (/(\.\.\.|…)$/.test(f.testo.trim())) segni.push('interrotta');
    else if (!finita(f.testo) && frasi[i + 1]?.principale !== f.principale) segni.push('finisce a metà');
    const tutte = paroleDi(f.testo), a = tutte.filter((w) => w.length >= 3);
    if (a.length >= 3) {
      for (const h of frasi.slice(i + 1, i + 7)) {
        if (h.principale !== f.principale) break;
        const altre = paroleDi(h.testo), b = new Set(altre);
        const stessoInizio = tutte.length >= 4 && tutte.slice(0, 4).join(' ') === altre.slice(0, 4).join(' ');
        if (altre.length >= tutte.length && (stessoInizio || a.filter((w) => b.has(w)).length / a.length >= 0.6)) {
          segni.push(`ripresa meglio in ${h.id}`);
          break;
        }
      }
    }
    if (segni.length) out.set(f.id, segni);
  });
  return out;
}

// Il materiale in forma compatta per l'AI: sorgenti, fogli provino, frasi.
export function materialePerAI(analisi) {
  const r = [];
  r.push(`# Materiale: ${analisi.cartella}`);
  r.push(`Brief di Denis: ${analisi.brief ? `\n${analisi.brief}` : '(nessuno)'}`);
  r.push('', '## Sorgenti');
  const frasiDi = (id) => analisi.frasi.filter((f) => f.principale === id);
  const segni = segniFrasi(analisi.frasi);
  for (const s of analisi.sorgenti) {
    const parti = [`- **${s.id}** · ${s.nomeDispositivo} · ${s.tipo === 'audio' ? 'solo audio' : s.orient === 'v' ? 'verticale' : 'orizzontale'} · ${s.durata.toFixed(1)} s`];
    if (s.principale) parti.push(`VOCE PRINCIPALE (${frasiDi(s.id).length} frasi)`);
    else if (s.sync) {
      const coperte = frasiDi(s.sync.con).filter((f) => offsetCamera(s, f) != null);
      parti.push(coperte.length
        ? `inquadratura sincronizzata con la voce di ${s.sync.con}: usabile come "camera" su ${intervalli(coperte.map((f) => f.id))}`
        : `sincronizzata con ${s.sync.con} ma non copre nessuna frase intera: usala come B-roll`);
    } else if (s.schermo) parti.push('REGISTRAZIONE DELLO SCHERMO: usala come "inserto" (scheda sopra l\'inquadratura) mentre Denis parla di quello che mostra');
    else if (s.soloImmagini) parti.push(`SOLO IMMAGINI (${s.soloImmagini}): usala solo come B-roll muto, la sua voce non entra mai nel montaggio`);
    else if (s.tipo === 'video') parti.push(s.parlato ? 'ha parlato non sincronizzabile: usala solo come B-roll'
      : s.audioMuto ? 'audio muto, NON sincronizzata: solo B-roll, e mai nei momenti in cui si vede qualcuno parlare (il labiale non tornerebbe)'
        : 'B-roll (non sincronizzata): mettila sopra la voce con "broll" + "da"');
    if (s.fogli?.length) parti.push(`fogli: ${s.fogli.join(', ')} (un riquadro ogni ${s.passoFogli} s; tempi ${s.sync || s.principale ? 'nel tempo della voce' : 'della clip, da usare in "da"'})`);
    r.push(parti.join(' · '));
  }
  for (const im of analisi.immagini || []) r.push(`- **${im.id}** · immagine ${im.orient === 'v' ? 'verticale' : 'orizzontale'} · solo come "inserto"${analisi.foglioImmagini ? ` · foglio: ${analisi.foglioImmagini}` : ''}`);
  for (const p of analisi.sorgenti.filter((s) => s.principale)) {
    const fr = frasiDi(p.id);
    if (!fr.length) continue;
    r.push('', `## Frasi della voce ${p.id} (inizio in secondi, durata) [segni]`);
    for (const f of fr) {
      const sg = segni.get(f.id);
      r.push(`${f.id} ${f.inizio.toFixed(1)} (${(f.fine - f.inizio).toFixed(1)}s) ${f.testo}${sg ? `  [${sg.join(', ')}]` : ''}`);
    }
  }
  if (!analisi.frasi.length) r.push('', '## Nessun parlato', 'Montaggio solo immagini: la sequenza è fatta solo di elementi "broll".');
  return r.join('\n');
}

function intervalli(ids) {
  const n = ids.map((id) => Number(id.slice(1)));
  const out = [];
  for (let i = 0; i < n.length; i++) {
    let j = i; while (j + 1 < n.length && n[j + 1] === n[j] + 1) j++;
    out.push(i === j ? ids[i] : `${ids[i]}–${ids[j]}`);
    i = j;
  }
  return out.join(', ');
}

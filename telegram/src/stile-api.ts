// Studio stile: parte solo da un'azione di Denis. Memoria nell'oggetto, copia su R2 per il montaggio.
import type { Ops, Segreti } from './ops';
import { cancellaOggetto, credenzialiOk, scriviOggetto, type CredenzialiR2 } from './s3';
import { chiediStile, trascriviBreve } from './stile-ai';
import {
  audioPulito, chiaveStileR2, conNome, descrizioneStile, diarioStile, fotogrammiPuliti, nomeStilePulito,
  applicaCorrezioni, conRegole, promptAnalisi, promptChat, riassuntoStile, ritmoSicuro, slugStile, stileUsabile,
  type BozzaStile, type MessaggioStile, type StileSalvato,
} from './stile-studio';

const CHIAVE = 'app:stili';
const BOZZA = 'app:stile_bozza';
// studio sul video intero in corso su GitHub (workflow stile.yml): { r2, quando, errore? }
const ANALISI = 'app:stile_analisi';
type AnalisiVideo = { r2: string; quando: number; errore?: string };
const MAX = 40;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
const errore = (status: number, messaggio: string) => json({ errore: messaggio }, status);

function cred(env: Segreti): CredenzialiR2 | null {
  const c = {
    accountId: env.R2_ACCOUNT_ID || '', accessKeyId: env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: env.R2_SECRET_ACCESS_KEY || '', bucket: env.R2_BUCKET || '',
  };
  return credenzialiOk(c) ? c : null;
}

function pubblici(lista: StileSalvato[]) {
  return lista.map((s) => ({ id: s.id, nome: s.nome, desc: s.desc, quando: s.quando }));
}

function bozzaPubblica(b: BozzaStile | undefined) {
  if (!b?.testo) return null;
  return {
    nome: b.nome, riassunto: b.riassunto, messaggi: b.messaggi, haTesto: true,
    voce: Boolean(b.voce), durata: b.durata, tagli: b.tagli, taglioMedio: b.taglioMedio,
    quando: b.quando || 0, daCreare: b.daCreare || [],
  };
}

async function salvati(env: Segreti, ops: Ops): Promise<StileSalvato[]> {
  return (await ops.leggi<StileSalvato[]>(env, CHIAVE)) || [];
}
async function bozza(env: Segreti, ops: Ops): Promise<BozzaStile | undefined> {
  return ops.leggi<BozzaStile>(env, BOZZA);
}

function nuovoId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}

function riservati(ops: Ops, lista: StileSalvato[]): Set<string> {
  const app = new Set(lista.map((s) => s.nome.toLowerCase()));
  const out = new Set<string>();
  for (const s of ops.stili()) if (!app.has(s.nome.toLowerCase())) out.add(s.nome.toLowerCase());
  return out;
}

function nomeLibero(ops: Ops, lista: StileSalvato[], nome: string, tranneId?: string): string | null {
  if (riservati(ops, lista).has(nome.toLowerCase())) return 'Questo nome è già uno stile pronto, su Drive o tra quelli di base.';
  if (lista.some((s) => s.id !== tranneId && s.nome.toLowerCase() === nome.toLowerCase())) return 'Hai già uno stile con questo nome.';
  const slug = slugStile(nome);
  if (!slug) return 'Questo nome non si può usare.';
  if (lista.some((s) => s.id !== tranneId && slugStile(s.nome) === slug)) return 'Questo nome si confonde con un altro stile già salvato.';
  return null;
}

async function mettiR2(env: Segreti, nome: string, testo: string, nomePrima?: string): Promise<string | undefined> {
  const c = cred(env);
  const chiave = chiaveStileR2(nome);
  if (!c || !chiave) return 'Salvato nell’app. Manca R2 sul Worker: un montaggio non trova questo stile finché non lo risalvi.';
  try {
    await scriviOggetto(c, chiave, testo, 'text/plain; charset=utf-8');
    const prima = nomePrima ? chiaveStileR2(nomePrima) : '';
    if (prima && prima !== chiave) await cancellaOggetto(c, prima);
    return undefined;
  } catch {
    return 'Salvato nell’app. La copia per il montaggio non è partita: risalva quando la rete torna.';
  }
}

async function togliR2(env: Segreti, nome: string) {
  const c = cred(env);
  const chiave = chiaveStileR2(nome);
  if (c && chiave) await cancellaOggetto(c, chiave);
}

function aggiungiMessaggio(lista: MessaggioStile[], ruolo: MessaggioStile['ruolo'], testo: string): MessaggioStile[] {
  return [...lista, { ruolo, testo: testo.slice(0, 500) }].slice(-24);
}

export type AttesaWorker = { waitUntil(p: Promise<unknown>): void };

async function eseguiAnalisi(
  env: Segreti, ops: Ops, rete: typeof fetch,
  ritmo: { durata: number; tagli: number; taglioMedio: number }, foto: string[], wav: Uint8Array | undefined,
): Promise<Response> {
  try {
    const trascrizione = await trascriviBreve(rete, env.GROQ_API_KEY, wav);
    const esito = await chiediStile({
      fetch: rete, geminiKey: env.GEMINI_API_KEY, anthropicKey: env.ANTHROPIC_API_KEY,
      prompt: promptAnalisi({ ...ritmo, trascrizione }), foto,
    });
    if (!esito.ok) {
      diarioStile('analizza', 502);
      return errore(502, esito.errore);
    }
    const nome = nomeStilePulito((/^\s*Nome:\s*(.+)$/m.exec(esito.stile) || [])[1] || '') || 'Nuovo stile';
    const testo = conNome(conRegole(esito.stile), nome);
    const fatta: BozzaStile = {
      id: nuovoId(), nome, testo, riassunto: riassuntoStile(testo),
      messaggi: [{ ruolo: 'ai', testo: esito.risposta }],
      durata: ritmo.durata, tagli: ritmo.tagli, taglioMedio: ritmo.taglioMedio,
      voce: Boolean(trascrizione), quando: Date.now(),
    };
    await ops.scrivi(env, BOZZA, fatta);
    diarioStile('analizza', 200);
    return json({ bozza: bozzaPubblica(fatta) });
  } catch {
    diarioStile('analizza', 500);
    return errore(502, 'L’analisi si è interrotta. Riprova.');
  }
}

async function eseguiChat(env: Segreti, ops: Ops, rete: typeof fetch, b: BozzaStile, detto: string): Promise<Response> {
  try {
    const esito = await chiediStile({
      fetch: rete, geminiKey: env.GEMINI_API_KEY, anthropicKey: env.ANTHROPIC_API_KEY,
      prompt: promptChat(b.testo, b.messaggi, detto), foto: [],
    });
    if (!esito.ok) {
      diarioStile('chat', 502);
      return errore(502, esito.errore);
    }
    b.testo = esito.stile;
    b.riassunto = riassuntoStile(esito.stile);
    b.messaggi = aggiungiMessaggio(aggiungiMessaggio(b.messaggi, 'denis', detto), 'ai', esito.risposta);
    b.quando = Date.now();
    await ops.scrivi(env, BOZZA, b);
    diarioStile('chat', 200);
    return json({ bozza: bozzaPubblica(b) });
  } catch {
    diarioStile('chat', 500);
    return errore(502, 'L’aggiornamento si è interrotto. Riprova.');
  }
}

export async function gestisciStile(
  req: Request, env: Segreti, ops: Ops, path: string,
  rete: typeof fetch = fetch, attesa?: AttesaWorker,
): Promise<Response> {

  if (req.method === 'GET' && path === '/api/stile') {
    const a = await ops.leggi<AnalisiVideo>(env, ANALISI);
    // oltre 35 minuti senza esito: il giro su GitHub è morto senza avvisare
    const analisi = a && (a.errore || Date.now() - a.quando < 35 * 60000) ? a : null;
    return json({ salvati: pubblici(await salvati(env, ops)), bozza: bozzaPubblica(await bozza(env, ops)), analisi });
  }

  const body = req.method === 'POST' ? await req.json().catch(() => ({})) as Record<string, unknown> : {};

  // studio sul video intero: il riferimento è già su R2 (caricamento "riferimento" completo);
  // lo guarda Gemini da un giro su GitHub, l'esito arriva su /stile-esito (riceviEsitoStile)
  if (req.method === 'POST' && path === '/api/stile/video') {
    const id = String(body.upload || '');
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(id)) return errore(400, 'Caricamento non valido.');
    const sess = await ops.leggi<{ riferimento?: boolean; pronto?: boolean }>(env, `app:upload:${id}`);
    if (!sess?.riferimento) return errore(404, 'Video di riferimento non trovato. Ricaricalo.');
    if (!sess.pronto) return errore(409, 'Il video non è ancora arrivato tutto su Cloudflare.');
    const ko = await ops.studiaStile(env, id);
    if (ko) return errore(502, `Non riesco ad avviare lo studio su GitHub (${ko}).`);
    const analisi: AnalisiVideo = { r2: id, quando: Date.now() };
    await ops.scrivi(env, ANALISI, analisi);
    diarioStile('video', 'avvio');
    return json({ analisi });
  }

  if (req.method === 'POST' && path === '/api/stile/analizza') {
    diarioStile('analizza', 'avvio');
    const ritmo = ritmoSicuro(body.durata, body.tagli);
    if ('errore' in ritmo) {
      diarioStile('analizza', 400);
      return errore(400, ritmo.errore);
    }
    const foto = fotogrammiPuliti(body.fotogrammi);
    if ('errore' in foto) {
      diarioStile('analizza', 400);
      return errore(400, foto.errore);
    }
    const wav = audioPulito(body.audio);
    const lavoro = eseguiAnalisi(env, ops, rete, ritmo, foto.foto, wav);
    attesa?.waitUntil(lavoro);
    return lavoro;
  }

  if (req.method === 'POST' && path === '/api/stile/chat') {
    diarioStile('chat', 'avvio');
    const detto = String(body.testo || '').trim().slice(0, 500);
    if (!detto) {
      diarioStile('chat', 400);
      return errore(400, 'Scrivi cosa cambiare.');
    }
    const b = await bozza(env, ops);
    if (!b?.testo) {
      diarioStile('chat', 400);
      return errore(400, 'Prima studia un video, oppure apri uno stile salvato.');
    }
    const lavoro = eseguiChat(env, ops, rete, b, detto);
    attesa?.waitUntil(lavoro);
    return lavoro;
  }

  if (req.method === 'POST' && path === '/api/stile/salva') {
    const nome = nomeStilePulito(body.nome);
    if (!nome) return errore(400, 'Dammi un nome, da 2 a 40 caratteri.');
    const b = await bozza(env, ops);
    if (!b?.testo) return errore(400, 'Non c’è uno stile da salvare.');
    const lista = await salvati(env, ops);
    // si sovrascrive lo stile aperto solo se lo salvi con lo stesso nome: con un nome diverso è
    // uno stile nuovo (26/10: "Strategic Creator" salvato sopra Cinematic Talk lo ha cancellato)
    const aperto = b.salvatoId ? lista.find((s) => s.id === b.salvatoId) : undefined;
    const stesso = aperto && aperto.nome.toLowerCase() === nome.toLowerCase();
    const id = stesso ? aperto.id : nuovoId();
    const occupato = nomeLibero(ops, lista, nome, id);
    if (occupato) return errore(400, occupato);
    if (!stesso && lista.length >= MAX) return errore(400, 'Troppi stili salvati. Eliminane uno.');
    const prima = lista.find((s) => s.id === id)?.nome;
    const testo = conNome(b.testo, nome);
    const voce: StileSalvato = { id, nome, testo, quando: Date.now(), desc: descrizioneStile(testo) };
    const tutti = [voce, ...lista.filter((s) => s.id !== id)];
    await ops.scrivi(env, CHIAVE, tutti);
    b.salvatoId = id;
    b.nome = nome;
    b.testo = testo;
    b.riassunto = riassuntoStile(testo);
    await ops.scrivi(env, BOZZA, b);
    const avviso = await mettiR2(env, nome, testo, prima);
    return json({ ok: true, salvati: pubblici(tutti), avviso: avviso || null });
  }

  if (req.method === 'POST' && path === '/api/stile/apri') {
    const id = String(body.id || '');
    const voce = (await salvati(env, ops)).find((s) => s.id === id);
    if (!voce) return errore(404, 'Stile non trovato.');
    const aperta: BozzaStile = {
      id: nuovoId(), nome: voce.nome, testo: voce.testo, riassunto: riassuntoStile(voce.testo),
      messaggi: [{ ruolo: 'ai', testo: 'Questo è lo stile salvato. Dimmi cosa cambiare.' }],
      salvatoId: voce.id, quando: Date.now(),
    };
    await ops.scrivi(env, BOZZA, aperta);
    return json({ bozza: bozzaPubblica(aperta) });
  }

  if (req.method === 'POST' && path === '/api/stile/rinomina') {
    const id = String(body.id || '');
    const nome = nomeStilePulito(body.nome);
    if (!nome) return errore(400, 'Dammi un nome, da 2 a 40 caratteri.');
    const lista = await salvati(env, ops);
    const voce = lista.find((s) => s.id === id);
    if (!voce) return errore(404, 'Stile non trovato.');
    const occupato = nomeLibero(ops, lista, nome, id);
    if (occupato) return errore(400, occupato);
    const prima = voce.nome;
    voce.nome = nome;
    voce.testo = conNome(voce.testo, nome);
    voce.desc = descrizioneStile(voce.testo);
    voce.quando = Date.now();
    await ops.scrivi(env, CHIAVE, lista);
    const b = await bozza(env, ops);
    if (b?.salvatoId === id) {
      b.nome = nome;
      b.testo = conNome(b.testo, nome);
      b.riassunto = riassuntoStile(b.testo);
      await ops.scrivi(env, BOZZA, b);
    }
    const avviso = await mettiR2(env, nome, voce.testo, prima);
    return json({ ok: true, salvati: pubblici(lista), avviso: avviso || null });
  }

  if (req.method === 'POST' && path === '/api/stile/duplica') {
    const id = String(body.id || '');
    const lista = await salvati(env, ops);
    const voce = lista.find((s) => s.id === id);
    if (!voce) return errore(404, 'Stile non trovato.');
    if (lista.length >= MAX) return errore(400, 'Troppi stili salvati. Eliminane uno.');
    const nome = nomeStilePulito(body.nome) || nomeStilePulito(`${voce.nome} copia`);
    if (!nome) return errore(400, 'Dammi un nome per la copia.');
    const occupato = nomeLibero(ops, lista, nome);
    if (occupato) return errore(400, occupato);
    const copia: StileSalvato = {
      id: nuovoId(), nome, testo: conNome(voce.testo, nome), quando: Date.now(), desc: descrizioneStile(voce.testo),
    };
    const tutti = [copia, ...lista];
    await ops.scrivi(env, CHIAVE, tutti);
    const avviso = await mettiR2(env, nome, copia.testo);
    return json({ ok: true, salvati: pubblici(tutti), avviso: avviso || null });
  }

  if (req.method === 'POST' && path === '/api/stile/elimina') {
    const id = String(body.id || '');
    const lista = await salvati(env, ops);
    const voce = lista.find((s) => s.id === id);
    if (!voce) return errore(404, 'Stile non trovato.');
    const resti = lista.filter((s) => s.id !== id);
    await ops.scrivi(env, CHIAVE, resti);
    await togliR2(env, voce.nome);
    const b = await bozza(env, ops);
    if (b?.salvatoId === id) {
      b.salvatoId = undefined;
      await ops.scrivi(env, BOZZA, b);
    }
    return json({ ok: true, salvati: pubblici(resti) });
  }

  return errore(404, 'Route sconosciuta.');
}

// Esito del workflow stile.yml (POST /stile-esito, protetto da NOTIFY_TOKEN in index.ts): lo stile
// diventa la bozza dell'app, con quello che le opzioni non sanno fare in fondo come "# DA CREARE";
// un avviso su Telegram dice che è pronto (o perché no). Il testo dello stile non va nei log.
export async function riceviEsitoStile(env: Segreti, ops: Ops, dati: Record<string, unknown>): Promise<Response> {
  const r2 = String(dati.r2 || '');
  const attesa = await ops.leggi<AnalisiVideo>(env, ANALISI);
  if (!attesa || attesa.r2 !== r2) return errore(409, 'Nessuno studio in corso con questo video.');
  if (!dati.ok) {
    const motivo = String(dati.errore || 'errore sconosciuto').slice(0, 300);
    await ops.scrivi(env, ANALISI, { ...attesa, errore: motivo } satisfies AnalisiVideo);
    diarioStile('video', 502);
    await ops.inviaTelegram(env, `⚠️ <b>Studio dello stile non riuscito</b>\n${motivo}\nRiprova dall’app (Altro → Studia uno stile).`).catch(() => {});
    return json({ ok: true });
  }
  const grezzo = conRegole(String(dati.stile || '').slice(0, 12000));
  if (!stileUsabile(grezzo)) {
    const motivo = 'L’AI ha scritto uno stile incompleto (mancano sottotitoli, look o ritmo). Riprova.';
    await ops.scrivi(env, ANALISI, { ...attesa, errore: motivo } satisfies AnalisiVideo);
    diarioStile('video', 422);
    return json({ ok: false });
  }
  const daCreare = (Array.isArray(dati.daCreare) ? dati.daCreare : []).map((x) => String(x).replace(/\s+/g, ' ').trim().slice(0, 400)).filter(Boolean).slice(0, 8);
  const nome = nomeStilePulito((/^\s*Nome:\s*(.+)$/m.exec(grezzo) || [])[1] || '') || 'Nuovo stile';
  const testo = conNome(grezzo, nome) + (daCreare.length ? `\n\n# --- DA CREARE (grafiche nuove viste nel riferimento, da fare con Claude) ---\n${daCreare.map((d) => `# DA CREARE: ${d}`).join('\n')}\n` : '');
  const durata = Number(dati.durata) || undefined;
  const fatta: BozzaStile = {
    id: nuovoId(), nome, testo, riassunto: riassuntoStile(testo),
    messaggi: [{ ruolo: 'ai', testo: String(dati.risposta || 'Ho guardato tutto il video. Dimmi cosa cambiare.').slice(0, 600) }],
    durata, tagli: Number(dati.tagli) || 0, taglioMedio: Number(dati.taglioMedio) || undefined,
    voce: true, quando: Date.now(), daCreare,
  };
  await ops.scrivi(env, BOZZA, fatta);
  await ops.cancella(env, ANALISI);
  diarioStile('video', 200);
  await ops.inviaTelegram(env, `✨ <b>Stile pronto: ${nome.replace(/[<>&]/g, '')}</b>\nL’AI ha guardato tutto il video${daCreare.length ? ` e ha trovato ${daCreare.length} effett${daCreare.length === 1 ? 'o' : 'i'} da creare` : ''}. Aprilo nell’app (Altro → Studia uno stile) per correggerlo e salvarlo.`).catch(() => {});
  return json({ ok: true });
}

// Correzione di uno stile salvato senza passare dall'app (POST /stile-correggi, protetto da
// NOTIFY_TOKEN in index.ts; lo usa il workflow stile-correggi.yml, cioè Claude su richiesta di
// Denis): `campi` = { "Chiave": "valore" } sostituisce la riga, null la toglie (applicaCorrezioni).
export async function correggiStileSalvato(env: Segreti, ops: Ops, dati: Record<string, unknown>): Promise<Response> {
  const nome = String(dati.nome || '').trim().toLowerCase();
  const lista = await salvati(env, ops);
  // `testo` (stile intero): ripristina uno stile perso o lo crea se nell'app non c'è
  const intero = typeof dati.testo === 'string' && dati.testo.trim() ? dati.testo.slice(0, 12000) : '';
  let voce = lista.find((s) => s.nome.toLowerCase() === nome);
  if (!voce && intero) {
    const pulito = nomeStilePulito(String(dati.nome || ''));
    if (!pulito) return errore(400, 'Nome non valido.');
    if (lista.length >= MAX) return errore(400, 'Troppi stili salvati.');
    voce = { id: nuovoId(), nome: pulito, testo: '', quando: Date.now(), desc: '' };
    lista.unshift(voce);
  }
  if (!voce) return errore(404, `Nessuno stile salvato nell’app con questo nome. Ci sono: ${lista.map((s) => s.nome).join(', ') || 'nessuno'}.`);
  if (intero) voce.testo = intero;
  const campi = (dati.campi && typeof dati.campi === 'object' ? dati.campi : {}) as Record<string, string | null>;
  const note = Array.isArray(dati.note) ? dati.note.map(String).slice(0, 10) : [];
  const testo = conNome(applicaCorrezioni(voce.testo, campi, note), voce.nome);
  if (!stileUsabile(testo)) return errore(400, 'Dopo la correzione lo stile non è più completo (sottotitoli, look, ritmo).');
  voce.testo = testo;
  voce.desc = descrizioneStile(testo);
  voce.quando = Date.now();
  await ops.scrivi(env, CHIAVE, lista);
  const b = await bozza(env, ops);
  if (b?.salvatoId === voce.id) {
    b.testo = testo;
    b.riassunto = riassuntoStile(testo);
    await ops.scrivi(env, BOZZA, b);
  }
  const avviso = await mettiR2(env, voce.nome, testo);
  return json({ ok: true, nome: voce.nome, testo, avviso: avviso || null });
}

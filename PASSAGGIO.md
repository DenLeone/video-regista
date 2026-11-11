# PASSAGGIO — tutto il progetto "Regista" in un file

> Scritto da Claude il 30/10/2026 per passare il progetto a un'altra AI (Grok o altre). Aggiornato il 09/11/2026 (§5-ter).
> **Leggi questo file per primo.** Lo storico completo, giorno per giorno, è in `PROGRESSO.md`.
> Codice: https://github.com/DenLeone/video-regista (repo pubblico, ramo `main`).

---

## 0. Come lavorare con Denis (IMPORTANTE)

- **Lingua: italiano.** Frasi corte, elenchi, un passo alla volta. Denis ha un po' di ADHD: niente muri di testo, metti in grassetto la cosa da fare.
- Quando gli dai un comando, dagli **il comando esatto da incollare** (PowerShell su Windows) e digli **da quale cartella** lanciarlo (di solito `C:\regista`). PowerShell 5: niente `&&`, usa `;`.
- Gli piace capire **cosa** si installa e **perché**, e quanto tempo ci vuole.
- È ironico: se fa una battuta, ridici su.

### Regole fisse (non violarle)
1. **Le chiavi non passano mai in chat né nel codice.** Denis le mette da solo (`setx`, `npx wrangler secret put`, segreti GitHub). Tu dici solo il nome della variabile.
2. Il repo è **pubblico**: mai committare chiavi, il pacchetto a pagamento di @kummetzz, suoni estratti, musica (ES_… di Epidemic Sound), girato.
3. **Mai pubblicare** su Instagram/YouTube/TikTok senza che Denis lo chieda.
4. Mai disattivare controlli TLS o aggirare blocchi di sicurezza.
5. Non dirgli di creare più progetti Google per aggirare i limiti di Gemini (la quota è **per progetto**, non per chiave: lo ha fatto notare lui ed è giusto).

---

## 1. Chi è Denis e cosa vuole

- Creator italiano: account Instagram **_black_den** / TikTok **.blackden** / pagina Facebook **BlackDen**. Contenuti: tech (recensioni), vlog di viaggio, politica, commenti ("Blackden").
- Attrezzatura: Sony in studio, Insta360 ("la Ultra") in giro, iPhone. PC di casa Windows con **RTX 5070 Ti 16 GB** (Windows mostra 32 GB ma è memoria condivisa: la VRAM vera è 16).
- Obiettivo: **montaggio automatico** dei suoi video. Due rami:
  - **A. Video corti 9:16** (Reels/TikTok/Shorts) → nel cloud: bot Telegram + GitHub Actions + Remotion. Funziona da mesi.
  - **B. Video YouTube lunghi 16:9** (15–30 min) → **tutto sul PC di casa**, senza upload. Esce un video "quasi al 100%", da rifinire in DaVinci Resolve. È il lavoro più recente.
- Vuole poter andare avanti **senza Claude** (crediti finiti): per questo ci sono `VIDEO.bat`, Gemini gratis e l'AI locale (Ollama).

---

## 2. Ramo B — YouTube sul PC (quello su cui si stava lavorando)

### Dove sta
- Cartella sul PC: **`C:\regista`** (clone del repo). Installato con `pc\installa.ps1`.
- Il girato **non si tocca**. Austria: `E:\Backup Iphone\Ottobre\Austria` (disco di backup, sola lettura).
- Lavoro e uscite: `C:\regista\work\pc\<Nome>\`. Copia su Drive: `G:\Il mio Drive\30 · Sviluppo\video-regista\pc\<Nome>`.
- Musica: `G:\Il mio Drive\12 · Risorse\Assets\Suoni\Musica` (tracce Epidemic Sound "ES_…": su YouTube servono l'abbonamento e il canale collegato; **non usare la traccia SoundLoadMate**).

### Programmi installati sul PC
Git, Node, ffmpeg (build Gyan "full", con NVENC per la scheda video), Python 3.12. Poi un ambiente `.venv` con **faster-whisper large-v3** su CUDA (librerie nvidia cublas/cudnn), Claude Code (ora non più usato), **Ollama** con i modelli `qwen2.5:14b` e `qwen3.5:9b` (consigliato anche `gpt-oss:20b`).

### Il flusso in un clic: `VIDEO.bat` (nella radice del repo)
Lancia `pc\video.mjs`, che fa tutto guidato:
1. Fa `git pull`, poi chiede **cartella del girato**, **minuti**, **brief** ("vlog di viaggio in Austria…") e **4K sì/no**.
2. **Analisi**: `pc\analizza.mjs`.
3. "**Rifaccio il piano?**": se sì, `pc\piano.mjs` (AI locale o Gemini). Se no, tiene il piano che c'è.
4. **Anteprima** dei primi 2 minuti (`--fino 120`). Se il piano ha errori apre Blocco note e riprova. Poi apre la cartella.
5. "**Monto tutto?**" → montaggio completo e pacchetto YouTube.

### I file in `pc/` (cosa fa ognuno)
| File | Cosa fa |
|---|---|
| `installa.ps1` | Installa tutto (winget, clone in C:\regista, npm ci, venv, controlli). |
| `trascrivi.py` | Whisper large-v3 su GPU (float16, ripiega su CPU). L'audio si estrae con ffmpeg (prova le tracce 0..3: iPhone con audio spaziale e un bug di PyAV). `--lista` = a lotti (batch 16), con l'audio dei 2 file dopo preparato in anticipo. |
| `analizza.mjs` | Per ogni clip legge durata, orientamento, data, **GPS** e nome del posto (Nominatim, cache in `luoghi.json`). Fa un foglio provino di 6 fotogrammi e la trascrizione. Le tre cose girano in parallelo. Scrive `materiale.md` (per l'AI) e `materiale.json`. Le clip si riconoscono dal **nome del file**; i numeri V001 sono solo comodi e cambiano se cambia la cartella. Una clip con il lato lungo sotto 2160 è segnata **EXPORT (data non affidabile)**. |
| `piano.mjs` | Scrive il **piano di montaggio** `pc\progetti\<nome>.json`. Prova prima l'AI locale (Ollama, `qwen2.5:14b`), poi Gemini pro → flash → flash-lite. Il piano vecchio va in `.prima.json`. |
| `ai.mjs` | Funzione comune `chiediAI`: prima Ollama, poi Gemini. |
| `monta.mjs` | **Il motore.** Legge il piano, trova le frasi nelle trascrizioni, taglia, fa jump cut sulle pause oltre 0,7 s (zoom 1.0/1.1 alternato), B-roll, mappe, titoli dei capitoli, sigla, musica con ducking e loudnorm −14 LUFS. Vedi i dettagli sotto. |
| `mappe.mjs` | Mappe animate disegnate da zero (vedi sotto). |
| `pacchetto.mjs` | Pacchetto YouTube: **capitoli con timestamp** (0:00 Intro, almeno 10 s tra uno e l'altro), titoli, descrizione e tag (con l'AI) in `"<nome> - YouTube.txt"`, **3 copertine 1920×1080** sotto 2 MB (fotogrammi a inizio capitolo + 4,5 s, per evitare la sigla). |
| `video.mjs` | Il flusso guidato di VIDEO.bat. |
| `LEGGIMI.md` | Istruzioni per Denis (anche a mano, senza VIDEO.bat). |
| `progetti/austria.json` | Il piano di Austria. Vedi lo stato al §5. |

### Uscite in `work\pc\<Nome>\`
Il video MP4 (1080p o 4K), un **FCPXML** da importare in DaVinci (con i marcatori dei capitoli), `capitoli.json`, `"<Nome> - YouTube.txt"`, le copertine, `materiale.md/json`, le trascrizioni e i fogli provino.

### Comandi a mano (da `C:\regista`)
```powershell
node pc\analizza.mjs "E:\cartella\del\girato" Austria
node pc\piano.mjs Austria 15 "vlog di viaggio, gancio sulla SD persa"
node pc\monta.mjs pc\progetti\austria.json --fino 120    # anteprima 2 min
node pc\monta.mjs pc\progetti\austria.json --4k          # tutto, in 4K
#  altre opzioni: --senza-pacchetto
```
Variabili utili:
- `REGISTA_AI=gemini`: salta l'AI locale.
- `REGISTA_MODELLO=gpt-oss:20b`: sceglie il modello locale.
- `REGISTA_PARALLELI=4`: quanti pezzi rende insieme.
- `GEMINI_API_KEY`: la mette Denis con `setx`.

### Formato del piano (JSON)
```json
{ "nome": "Austria", "cartella": "E:\\...", "paese": "at", "partenza": "Roma",
  "volumeMusica": 0.22, "risoluzione": "4k",
  "sequenza": [
    { "musica": "ES_brano.mp3" },
    { "capitolo": "Vienna", "sotto": "Schönbrunn · 12 ottobre", "luogo": "Schloss Schönbrunn, Wien", "musica": "ES_altro.mp3" },
    { "v": "UMXH7108.MP4", "da": "prime 4-6 parole esatte", "a": "ultime 3-5 parole",
      "sopra": [{ "v": "NBVE8895.MP4", "dal": 1, "al": 14, "per": 3 }] },
    { "broll": "JGPJ4543.MP4", "dal": 5, "per": 3, "audio": "muto" },
    { "titolo": "AUSTRIA", "sotto": "...", "su": "IMG_8917.MOV", "dal": 10, "per": 3.5 }
  ] }
```
- `v`, `broll`, `su` e `sopra` vogliono il **nome del file** (non V001).
- `da` e `a` sono le parole della trascrizione. La ricerca si fa così:
  1. lettere contigue (gli apostrofi uniti, numeri 0–10 = parole: "0" = "zero");
  2. per parole;
  3. **fuzzy**: 3 parole su 4, ma solo se c'è un solo punto possibile.
- Se una frase non si trova, monta raccoglie **tutti** gli errori e si ferma: "V020: non trovo l'inizio «…»". Si corregge copiando la frase vera da `materiale.md`.

### Regole del B-roll automatico (le ha volute Denis: "deve avere senso")
- Ogni ~9 s di parlato, partendo da 4 s.
- Usa **solo clip originali** (lato lungo ≥2160, non export), dello **stesso giorno** (ora di Roma), **entro 15 minuti** dalla clip parlata ed **entro 3 km** se tutte e due hanno il GPS. Così se parla di Schönbrunn non mette Salisburgo.

### Mappe (versione 2, approvata nello stile)
- Confini **Natural Earth 50m** (pubblico dominio), disegnati in Node su un buffer e mandati a ffmpeg come rawvideo.
- Sfondo scuro, paese evidenziato, il viaggio fatto in archi bianchi tenui, l'arco nuovo giallo luminoso (1,6 s), pin tondo che rimbalza con un anello, nomi delle tappe (quella attuale in gialla), zoom lento.
- Vanno **sopra la voce** a inizio capitolo, non da sole. **Nessuna mappa sotto i 25 km.**
- Il posto si cerca dal `luogo` del capitolo con Nominatim (1 richiesta al secondo).
- La versione 1 (tile OSM, pin quadrati, mappa da sola) a Denis **non piaceva**.

### Velocità (fatto)
4 pezzi resi in parallelo, decodifica sulla GPU (`-hwaccel auto`, con ripiego), cache dei pezzi già resi, Whisper a lotti, CPU e GPU sovrapposte. Stima per Austria: da ~50–65 min a **~17–24 min**. HDR dell'iPhone convertito con zscale (ripiega se manca). Clip verticali su sfondo sfocato.

---

## 3. Ramo A — video corti 9:16 nel cloud (funziona, in pausa)

### Pezzi
- **Bot Telegram** = Cloudflare Worker `regista-telegram` (`telegram/`).
  - Memoria in un Durable Object `Memoria`.
  - Si pubblica da solo con `.github/workflows/bot.yml` a ogni push su main.
  - App PWA sullo stesso dominio: `https://regista-telegram.denisnusinovic.workers.dev`, con passkey.
- **Montaggio**: `.github/workflows/regista.yml` → `scripts/regista.mjs`.
  - La regia la fa Gemini Flash; ripiega su Claude se c'è la chiave.
  - Taglio frasi e pause in `scripts/regia.mjs`; render con **Remotion** (`src/*.tsx`).
  - Il girato arriva da Drive con rclone.
- **Cartelle Drive**: `01 · Da editare/<Nome>` (girato) → `02 · Fatti/<Nome>` (risultato) → `03 · Da pubblicare`. Gli stili stanno in `12 · Risorse/Stili/<Stile>/stile.txt`.
- **Stili**: nel bot dal 05/11 solo **Cinematico** (predefinito), **Lista UI** e **🔴 Focus** (dal 09/11) tra quelli col codice, più gli "stili su misura" da Drive (`stile.txt`, senza codice: Narrativo, Esplicativo, 12K Quality, Motion, Ultra, Impact, Beat, Blackden…). Blueprint e MotionCollage restano nel codice ma non si scelgono più. A parte il tasto **🎞 Documentario** (§5-ter).
- **Laboratorio**: `.github/workflows/laboratorio.yml` con le ricette in `lab/*.json`. Fa prove, fotogrammi, varianti e l'analisi di video YouTube con Gemini. Gli esiti vanno sul ramo `laboratorio-esiti-<ricetta>` e su Drive.
- **Pubblica**: `scripts/pubblica.mjs` (Instagram Reel + YouTube Shorts) dal tasto 📤 del bot.

### Stile Blackden (reazioni)
- I file che si chiamano `guarda …` sono clip da mostrare **a volume pieno** mentre Denis tace (dopo "ha detto questo"). Le pause di almeno 1,8 s diventano "pause guarda".
- I file `audio …` sono inserti **con l'audio**.
- Codice: `scripts/regia.mjs` (`pauseGuarda`), `scripts/regista.mjs`, `src/Reazione.tsx`.

### Stile Beat
Montaggio a tempo di musica (`scripts/beat.mjs`, `src/Beat.tsx`), tagli a battute intere. Denis: "fa un po' schifino, ma ci sta come inizio". **Manca un beat senza copyright.**

### Funzioni social del bot (`telegram/src/social.ts`, `crescita.ts`)
- **/social**: ogni mattina il piano "cosa fare oggi" dai numeri di Instagram e TikTok (lo scrive Gemini).
- **/commenti**: commenti nuovi con risposte proposte (tasti invia/modifica/nascondi).
- **Allarme esplosione**: un video che cresce molto più del solito.
- **/report**: report settimanale il lunedì.
- **/radar**: account simili (business_discovery).
- **Cron**: `17 */3 * * *`. Il piano gratuito di Cloudflare dà circa 50 sottorichieste a giro, quindi i lavori si mettono in coda nel Durable Object e ne parte uno per allarme.
- **Instagram**: login unificato Meta con chiave **EAA** di un "system user" chiamato **Regista**, nel portfolio business "Denis Nusinovic". Account IG id `17841405472411941`. Segreti `IG_TOKEN` e `IG_USER_ID` sul Worker. **Funziona.** Per rispondere ai commenti potrebbe servire rigenerare la chiave con il permesso `instagram_manage_comments`.
- **TikTok**: Display API in Sandbox, app `blackden-stats`, segreti `TIKTOK_CLIENT_KEY` e `TIKTOK_CLIENT_SECRET`. Funziona.
- **Test del bot**: `npm run -s app:check` (39/39 passano).

### Nomi dei segreti (solo i nomi, i valori li ha Denis)
- **Worker** (`npx wrangler secret put NOME --name regista-telegram`, lanciato dalla home, non da System32): TELEGRAM_BOT_TOKEN, TELEGRAM_SECRET, ALLOWED_CHAT_ID, GITHUB_TOKEN, GEMINI_API_KEY, ANTHROPIC_API_KEY (facoltativo), IG_TOKEN, IG_USER_ID, TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, NOTIFY_TOKEN, più quelli dell'app (APP_SETUP_CODE, R2_*, VAPID_*, DRIVE_*: vedi README.md).
- **GitHub Actions**: GEMINI_API_KEY, CLAUDE_CODE_OAUTH_TOKEN, RCLONE_CONF, TELEGRAM_BOT_TOKEN, TG_API_ID, TG_API_HASH, CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN, PEXELS_API_KEY, PIXABAY_API_KEY, GROQ_API_KEY, NOTIFY_URL, NOTIFY_TOKEN, R2_*.
- **PC**: `GEMINI_API_KEY` (con `setx`).

---

## 4. Gemini e AI locale: cosa sapere

- **Free tier**: Pro dà quasi sempre **429** (limite). Flash a volte finisce la quota del giorno. Flash-Lite risponde, ma **riscrive le frasi** e fa piani più lunghi e meno curati.
- Gemini può analizzare **direttamente un link YouTube** (`file_data.file_uri`): così sono stati studiati 3 video di riferimento per genere (tech, viaggio, politica; ricette `lab/youtube-*.json`).
- **AI locale** (Ollama, `http://127.0.0.1:11434`): gratis e privata. `qwen2.5:14b` va bene per il piano; `gpt-oss:20b` è il migliore che sta nei 16 GB. È più lenta (decine di secondi a risposta, normale). Kimi è troppo grande per girare in locale.
- Consiglio dato a Denis: per i piani buoni conviene Gemini Flash o Pro (eventualmente con fatturazione attiva, costa poco) oppure gpt-oss:20b. Flash-Lite solo come ultima riserva.

---

## 5. STATO ATTUALE (30/10) e prossimo passo

### Austria (il primo video YouTube)
- Il **primo montaggio di Austria** è piaciuto molto a Denis ("davvero molto soddisfatto"). Era fatto con il piano scritto a mano con Claude: 7 capitoli, circa 15–17 min, gancio sulla SD persa.
  - I luoghi dei capitoli: Schloss Ambras (Innsbruck), Getreidegasse (Salzburg), Schloss Schönbrunn, Stephansplatz e Oberes Belvedere (Wien), Faaker See.
  - **Quel piano ora è in `pc\progetti\austria.prima.json`.**
- Poi Denis ha rilanciato tutto da capo (30 min, 4K) e ha risposto "s" a "rifaccio il piano?". Gemini Flash-Lite ha **sovrascritto** `austria.json` con un piano da 78 elementi e circa 30 min.
- Il montaggio si è fermato su 3 frasi non trovate (V020 «Adesso andiamo al piano 0», V026 fine «almeno che giardina», V214 «quindi qua ci sono alcuni dei quadri»).
- **Correzione già fatta e pubblicata** (commit 55497f5): numeri in cifre o in lettere, e ricerca fuzzy.
  - Le prime due frasi ora si trovano; la terza va verificata.
  - Una frase che non c'entra viene ancora scartata.

### Il prossimo passo per Denis
1. `VIDEO.bat`, stessa cartella, a "rifaccio il piano?" rispondere **n**, poi guardare l'anteprima.
2. Se ci sono ancora frasi non trovate: correggerle in `pc\progetti\austria.json`, copiandole da `work\pc\Austria\materiale.md`.
3. Oppure (consigliato se il piano da 30 min è confuso): rinominare `austria.prima.json` in `austria.json` e montare con quello.

### Ancora da verificare sul primo giro vero
Mappe v2, B-roll automatico, pacchetto (descrizione e copertine), uscita 4K, velocità, Whisper a lotti, import FCPXML in DaVinci.

## 5-bis. NOVITÀ 30/10 – 03/11 (fatte con altri bot, controllate da Claude il 03/11)
- **Grok, PC** (commit 8e44fd6): 8 codifiche in parallelo sui PC con almeno 16 core, analisi metadati 8 alla volta, `--solo-controllo` (controlla il piano senza codificare), clip 4K native senza ricampionamento, frase inventata su clip muta → entra come immagine muta di 4 s. V214 di Austria = B-roll muto. Nuovo piano `pc/progetti/wecanrace.json` (⚠️ usa V025/V006 invece dei nomi dei file: fragile, convertirlo).
- **Confronto stili nel bot** (d407100): in Nuovo montaggio → "👁 Confronta 2–3 stili". Un solo scarico, anteprime da 10 s per stile, tasti `cs:<run>:<n>`, il runner aspetta fino a 12 min (`/scegli` GET/POST sul Worker), poi monta tutto nello stile scelto. Input workflow `stili` (nomi separati da `|`).
- **Strati** (b1138bb, Ultra/Impact): `enfasiCorsivo`, `maiuscoloGrandi`, `entrata: pop`, `righe`, posizione; con `dietro` le scritte passano dietro la persona per tutto il parlato.
- **MotionCollage**: la prima versione (02/11, altro bot) era rotta (testi fissi "SHARIA 76%", voce solo in 3 finestre da 1,5 s). Rifatta da Claude il 03/11 (1b8d0eb): video incollato su carta che si inclina a ogni taglio, voce sempre, parole chiave della regia come ritagli (numeri in box giallo, `filled` verde), frecce, titolo in apertura. Provata con fotogrammi e un render di prova.
- **ListaUI** (03/11, d7d640f): stile riutilizzabile ispirato ai reel "3 tips" (softgirlnocode). La regia scrive il campo `schermate` (tipi capitolo/chat/finestra/griglia/app/pillola, ancorati a `frase`, `media` = immagini della cartella), risolto in `scripts/regia.mjs` → `piano.schermate` → `src/ListaUI.tsx`. Istruzioni AI in `scripts/stili/ListaUI.md`. Provato con fotogrammi, non ancora su un video vero.
- **Libreria Assets** (03/11): `DIR_ASSETS` = `12 · Risorse/Assets` (scripts/cartelle.mjs), funzioni in `scripts/libreria.mjs` (test: `node --test scripts/libreria.test.mjs`). Loghi: i PNG in `Assets/Loghi/**` il cui nome (es. `ChatGPT.png`, `final-cut-pro.png`, alias con virgola `apple, iphone.png`) è detto nel parlato entrano da soli come icone (max 8, `REGISTA_LOGHI=0` li spegne). Font: negli stili su misura `Font titoli: Apple Garamond Bold` prende il file giusto (peso e corsivo) prima da asset/ dello stile, poi da `Assets/Fonts/**`, poi Google Fonts. ⚠️ Alcuni font in libreria sono PERSONAL USE ONLY.
- **Campionario per DaVinci** (03/11): `node pc\campionario.mjs` sul PC rende ogni contenitore di Lista UI come ProRes 4444 trasparente (animato + fermo) e un FCPXML 1080×1920 con tutto in timeline. Testi in `pc/campionario.json`, istruzioni (anche per Claude Code sul PC) in `pc/CAMPIONARIO-DAVINCI.md`. I contenitori rifatti in DaVinci non entrano ancora da soli nei montaggi.
- `scripts/stili/MotionCollage.md` aggiunto: senza, scegliere MotionCollage fermava il montaggio (ogni stile base vuole il suo .md).

## 5-ter. NOVITÀ 03/11 – 09/11 (altre sessioni di Claude; riassunte da Claude il 09/11)
⚠️ Le sessioni del 04–08/11 non avevano aggiornato questo file: i dettagli veri sono nei LEGGIMI citati qui sotto.

**Due strade, da qui in poi:** il **bot nel cloud** (corti 9:16, Documentario) e il **flusso locale sul PC** con
DaVinci (`pc/locale/`, AI locali con Ollama, niente token). Il flusso locale è dove si è lavorato di più.

### Cloud (bot + GitHub Actions)
- **🎞 Documentario** (motore *Rotolo*, 04/11): piano sequenza 9:16 senza tagli; la voce (o un video di Denis che parla,
  come "presentatore") e le foto con il nome giusto (`persona-nome-anno.jpg`, `luogo-…`, `documento-…`, `prodotto-…`,
  `ritaglio-….png`, `overlay-….mp4`). Due mondi: **📜 Rotolo** (carta di riso, inchiostro, timbri rossi) e **💻 Tech**
  (canvas scuro, card di vetro, numeri enormi). Dal bot: 🎞 Documentario → cartella in `01 · Da editare` → stile →
  1080 o 4K (workflow `.github/workflows/documentario.yml`). Torna `beats.json` nella cartella: corretto a mano e
  rilanciato rifà solo il render. Escono anche copertina, descrizione e 5 hashtag (`pc/rotolo/social.mjs`).
  Codice: `src/Rotolo.tsx`, `src/rotolo/`, `pc/rotolo/` (istruzioni: **`pc/rotolo/LEGGIMI.md`**). Regia AI:
  Claude Code → Gemini → Ollama (`ROTOLO_AI` per forzare). `src/DocNintendo.tsx` = la prima prova fatta a mano.
- **Racconto 21:9** (03/11, `src/racconto/`, `scripts/racconto/ai.json`): prova di piano sequenza orizzontale sulla
  scrivania col video "Ai", resa sul laboratorio (`lab/ai-racconto.json`) → `02 · Fatti/Ai/Ai - RACCONTO 21x9.mp4`
  (2,4 GB). Denis non ha ancora dato un giudizio; il Documentario ne ha preso il posto.
- **Collage** (03/11): motion graphic a ritagli in 4K verticale descritta da `scena.json`, regia AI sul parlato di
  `voce.mp4`. Sul PC: `COLLAGE.bat` / `node pc\collage.mjs <nome> [--anteprima|--fotogrammi|--studio|--regia]`.
- **Bot**: stili ridotti (05/11, vedi §3); dal 09/11 **niente più messaggi automatici sui commenti** (restano
  `/commenti` e il tasto 💬); restano piano del mattino, report del lunedì e "sta esplodendo".
- **Laboratorio**: `trascrivi` salva anche le parole con i tempi (`parole-<file>.json`) e l'op `racconto` rende sul
  runner. Voce e foto vere **solo su Drive e sul runner, mai nel repo** (è pubblico).

### PC di casa: flusso locale (`pc/locale/`, istruzioni complete in **`pc/locale/LEGGIMI.md`**)
- **Un comando, o un collegamento sul Desktop** (si trascina sopra il video o la cartella). **DaVinci va tenuto
  CHIUSO**: lo apre lo script all'ultimo passo (aperto occupa ~6 GB della scheda video e l'AI va fino a 50 volte
  più lenta). Serve **DaVinci Resolve Studio** con *Preferenze → Sistema → Generale → External scripting: Local*.
- Passi: rinomina delle immagini guardandole (gemma4:12b) → **pulizia del parlato** (Whisper + allineamento forzato
  MMS, via silenzi/ripetizioni/false partenze, niente parole mozzate; qwen3.8:27b) → immagini sulle parole →
  regia → grafica Remotion trasparente → movimento del presentatore → suoni (SFX, musica, ambiente) → **timeline
  in DaVinci** (V1 tu tagliato, V2 grafica, A1 voce, A2 sfx, A3 musica, A4 ambiente) → sottotitoli WATER di
  ClashiVFX (dalla nostra trascrizione, spostati fuori dal viso).
- Stili del flusso locale (collegamenti `.bat` in `pc/locale/`):
  - **Documentario locale** (`--mondo tech|rotolo`): grafica Rotolo/Tech sopra il video vero, che resta gradabile.
  - **Documentario piano sequenza** (`--stile documentario`): Denis DENTRO una stampa sulla scrivania, la camera ci entra
    (`pc/locale/doc-*.mjs`, `src/documentario/`); prompt e video di riferimento in `12 · Risorse/Stili/Documentario`.
  - **Presentazione** (`--stile presentazione`, 06/11): come il reel di riferimento: pannello Tiffany, parola chiave
    enorme, infografiche per tema (barre, curva, onda, oggetto su percorso, prompt che si scrive, numeri, icone
    Tabler), tre modi (tu con la parola, diviso, grafica piena a raffiche), il video vero dentro la grafica
    (`pc/locale/presentazione.mjs`, `src/presentazione/`).
  - **Unboxing** (06/11): solo riprese del prodotto, montate sul battito della musica, schede delle caratteristiche
    (dal nome delle immagini o `prodotto.txt`), qwen3-vl:8b riconosce le fasi (scatola, apertura, prodotto…).
    Voce fuori campo non ancora gestita (`pc/locale/unboxing.mjs`, `src/unboxing/`).
  - **Redazione** (08/11): grafica trasparente per video d'opinione su fatti di cronaca, da una scaletta agganciata
    alle parole (`"cracovia@0"`); prima prova "Cracovia", con la bilancia che pende sulla parola
    (`pc/locale/redazione.mjs`, `src/redazione/`).
- Modelli Ollama usati: `gemma4:12b`, `qwen3.8:27b`, `qwen3-vl:8b`. Ragionamento "low" di default
  (`LOCALE_PENSA=medium` per alzarlo: 4–5 volte più lento a parità di risultato).
- Dipendenze npm nuove: `@remotion/layout-utils`, `@tabler/icons-react` (sul PC: `npm ci` dopo il `git pull`).

### Da verificare / aperto
- Giudizio di Denis su Racconto 21:9 e sui test Documentario, Presentazione, Unboxing, Redazione.
- Unboxing con voce fuori campo; mix del flusso locale a -17 LUFS (normalizzare a -14 in Fairlight o in Deliver).
- `PASSAGGIO.md` va aggiornato a ogni sessione: le note di dettaglio stanno nei LEGGIMI, qui il quadro.

---


### Stile Focus (09/11)
- Copia dello stile del video di riferimento `12 · Risorse/Stili/Focus/esempi/Focus.mp4` (studio grigio chiaro, persona in poltrona).
- Codice: `src/Focus.tsx` (composizione `Focus`), regole AI in `scripts/stili/Focus.md`, tasto nel bot da `scripts/stili-base.json`.
- Parola chiave enorme rossa in corsivo **dietro la persona** (serve il ritaglio: `ritagliPersona` in `regista.mjs` lo fa sempre quando lo stile è Focus), riga piccola sopra (`note`), parolina sotto (`tag`), lettere che entrano sfocate con quadratini rossi.
- Le immagini diventano schede inclinate col bordo rosso, pillola (tag o parola) e icona rossa; la parola che cade su una scheda non si scrive dietro.
- I B-roll (clip con `audio` o `muto`) hanno il contorno di un telefono con la parola dentro.
- Cambi di scena: anello a retino rosso e ogni tanto il flash "negativo".
- I B-roll si riconoscono dal campo `broll: true` della clip (lo mette `regia.mjs`), non più da `audio`/`muto`: con un girato tutto muto il telefono copriva l'intero video.
- **Parole fitte** (`src/paroleFitte.ts`, prova in `scripts/parole-fitte.test.mjs`): se la regia dà poche parole chiave, i buchi si riempiono dal parlato (`piano.parole`), una ogni ~2,6 s, mai sopra quelle della regia. Il 09/11 la prima versione aveva un giro infinito (parola della regia 0,2–0,6 s dopo il punto di ricerca) e i render di Focus restavano appesi: corretto e coperto dalla prova.
- Da fare: nel riferimento la persona è piccola su fondo chiaro pulito; da noi resta il girato intero. Idea: persona ritagliata su fondo `#E9E7EA`, più piccola e in basso.

### Prove veloci degli stili (09/11)
- **Kit**: `regista.yml` con `azione: kit` non fa il render: salva su Drive in `<cartella>/_regista/kit` il piano e tutti i pezzi a 540 px, più `kit.zip` (senza audio, per stare sotto i 10 MB che il connettore Drive riesce a scaricare).
- **Fotogrammi**: i file di `kit/media` vanno in `public/media`, poi `node scripts/fotogrammi.mjs <Stile> <piano.json> <foglio.jpg> <secondi...>` (con `REMOTION_BROWSER`). Impacchetta una volta (~90 s), poi ogni fotogramma costa ~2 s.
- **Render di un pezzo**: l'input `secondi` accetta anche `A-B` (es. `35-55`). Il piano di una prova è troncato e non viene salvato in `_regista/piano.json`.
- **Laboratorio**: ricette con `"privato": true` non pubblicano niente sul ramo `laboratorio-esiti` (il repo è pubblico: obbligatorio col girato di Denis). Op `sequenze` = fogli di fotogrammi di un video.
- **Regia salvata subito**: `regia.json` e `materiale.json` vanno in `_regista` appena scritta la regia (non per le correzioni), così un render fallito non butta via regia e trascrizione.
- **Velocità (09/11, da riprendere)**: tempi di ogni fase in `_regista/tempi.json`. Prova Focus 20 s su Test Impact: render 3:17, ritaglio persona 2:07, tagli 1:20, totale 7:34. Fatto: pacchetto Remotion preparato in sottofondo (`preparaPacchetto`), ritagli della persona 3 alla volta, rclone in cache, ricerca dei VAI 8 alla volta. Misurato in locale: il render fa ~4 fotogrammi/s qualunque stile, con o senza ritaglio, PNG o JPEG, e con 2 o 4 schede uguale: il collo di bottiglia non è lo stile. Da provare: `--offthreadvideo-threads`, `--log=verbose` per i fotogrammi più lenti, render spezzato su più macchine. Scartato: ritaglio "impilato" (mp4 colori+maschera ricomposto su tela), più lento del WebM con trasparenza.
- **Render su più macchine (10/11)**: workflow `veloce.yml` (per ora solo "Solo render" con regia salvata). Job «pezzo» ×N: `PEZZO=i/N` taglia, ritaglia e renderizza solo il suo tratto (più una clip di margine per parte) e carica `v.ts`/`a.aac` su Drive in `_regista/pezzi/<giro>` (mai negli artifact: repo pubblico). Job «unisci»: `UNISCI=1`, scarica i pezzi, `combineChunks`, poi copertina, descrizione, carico; se un pezzo manca o l'impronta del piano non combacia fa il giro normale. Conti in `scripts/pezzi.mjs`. Provato: 20 s su 2 macchine ok. Da fare: provarlo sul video intero, poi portarlo nel montaggio da zero e nel bot.
- **Render a pezzi su una macchina sola** (`REGISTA_RENDER_PEZZI=1`, `scripts/render-pezzi.mjs`): spento. Sul runner di GitHub è più lento (20 s: 151–164 s contro 135; video intero 17 min contro 10).
- **Pacchetto Remotion**: preparato in sottofondo e tenuto in cache (`REGISTA_PACCHETTO_DIR`, chiave = hash di `src/`); render e copertina non reimpacchettano.
- **Discorso (un solo video), dal 10/11**: l'AI può togliere pezzi (ripetizioni, autocorrezioni) e tagliare dentro un pezzo con `da_parola` / `fino_a` (`accorciaFrase` in `regia.mjs`); pezzi più corti (`maxDur 3`). Mai riordinare; se toglie più del 40% resta tutto. Con il modello di riserva (Gemini lite) il testo resta intero: sceglieva male. Il taglio di parola non è stato ancora ascoltato da nessuno.
- **Schede immagine**: prendono la forma dell'immagine (`inserto.ar`); con sottotitoli a strati in basso stanno sopra le scritte (`sopra` in `Inserti`). Le immagini che l'AI non usa entrano solo sulla frase che le nomina (`usaTuttoIlMateriale`). Icone: solo PNG. Nomi di prodotto anche dal nome della cartella (`nomiDellaCartella`).
- **Controlli**: `npm run controlli` (tipi, sintassi degli script, prove); gira da solo a ogni push con `.github/workflows/controlli.yml`.
- **Da fare (Denis)**: rclone avvisa che il suo `client_id` condiviso di Google Drive verrà spento nel 2026. Serve un `client_id` proprio (https://rclone.org/drive/#making-your-own-client-id) e il secret `RCLONE_CONF` aggiornato.

## 6. Da fare (in ordine di utilità)
1. Finire Austria e controllare tutto quello del §5.
2. Migliorare la qualità del piano scritto dall'AI: magari un secondo passaggio che **controlla le frasi** contro la trascrizione e le corregge da sola prima di montare.
3. Prossimi video YouTube: **tech in studio** (Sony) e **politica**. Le regole di regia dei riferimenti sono nel prompt di `piano.mjs`.
4. Stile Beat: trovare un beat senza copyright e migliorare il ritmo.
5. Prove reali di Blackden: volumi e clip "guarda".
6. Dal file "DA FARE" su Drive: diario delle correzioni, voce livellata, pacchetto kummetzz negli altri stili (solo su Drive, mai nel repo), scheda citazione per Blackden, progetto DaVinci per i video vecchi.
7. Bot: metriche avanzate (trattenimento), scheda del montaggio collegata al post, lezioni settimanali approvate da Denis, A/B con i Trial Reels (vedi `PROGRESSO.md`, 28/10).

---

## 7. Errori già risolti (per non rifarli)
- Le clip si riconoscono dal **nome del file**, non da V001: i numeri cambiavano e le trascrizioni finivano sulle clip sbagliate.
- Mai scrivere nella cartella del girato: il backup E: è in sola lettura. Si scrive sempre in `work\pc\`.
- Gli export hanno la **data sbagliata**: non usarli per capire quando e dove era Denis, né per il B-roll.
- `wrangler` lanciato da System32 dà errori di permessi: lanciarlo dalla home.
- Script lanciati fuori da `C:\regista` → "not a git repository".
- Spesso "sembra bloccato" voleva dire che Denis doveva ancora premere **Invio** (ci si scherza su).
- Drive via API: per i file di testo usare text/plain senza conversione in Google Doc.
- Cloudflare gratuito: niente lavori lunghi in `waitUntil`, metterli nell'allarme del Durable Object.
- Le variabili normali del Worker vengono cancellate dall'auto-deploy: usare sempre i **secret**.

---

## 8. Se sei un'AI che non può eseguire comandi sul PC
Denis incolla i comandi e ti rimanda l'output. Quindi:
- dagli **un blocco PowerShell alla volta**;
- per modificare il codice, dagli il file intero o la modifica precisa (riga vecchia → riga nuova). Poi `git add -A; git commit -m "..."; git push` da `C:\regista`, se vuole tenerla sul repo;
- puoi leggere il codice dal repo pubblico GitHub (link in alto) prima di proporre modifiche: **leggi sempre il file vero** prima di cambiarlo.

## Banco di prova e anteprima (11/11)
- **Banco di prova** (`scripts/banco.mjs`, workflow `banco`): a ogni modifica di `src/**`, del regolatore o di `stile-su-misura.mjs`, fotogrammi di Cinematico, Kal e Ultra su un montaggio finto (sagoma al posto della persona, scene generate con ffmpeg: si può pubblicare). Foglio negli artefatti del giro (`banco`). Rosso se uno stile non parte o se il regolatore di Ultra non toglie 1 scheda e 1 b/n. In locale: `node scripts/banco.mjs [Kal Ultra …]` → `out/banco/banco.jpg`. La scheda di Ultra usata è `scripts/banco/Ultra.txt` (copia di quella su Drive).
- Trovati e sistemati dal banco: in Kal la parola grande finiva sopra il riquadro del B-roll (ora il riquadro sta da y 700, 720×1000) e i sottotitoli sparivano per un gruppo intero dopo ogni parola grande; in Ultra la scheda di lato toccava la faccia (ora 360×480).
- **Anteprima su Telegram**: la carica il runner direttamente (`caricaSuTelegram`, messaggio silenzioso poi cancellato) appena è codificata; al bot (`/video`) passa solo il `file_id`. Prima i 36 MB passavano dal bot e la chiusura durava 2:45 (anteprima 2:15). Se non riesce, si torna al giro di prima. Il bot dà la chat con `GET /chat-anteprima`.

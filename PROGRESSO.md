# video-regista — PROGRESSO

> File di passaggio tra sessioni (ufficio / casa / in giro). Aggiornato da Claude a ogni passo.
> Ultimo aggiornamento: **2026-10-18 notte, sessione cloud (Claude Code web)** — Gemini attivo, sync dalle immagini, frasi senza pause morte.

## ▶️ Come si usa adesso (pronto per i lotti)
1. **Da Telegram** (comodo dal telefono): manda i file al bot **come File** (📎 → File, non come video: niente compressione), fino a 2 GB a file (4 GB con Premium); il nome del video come didascalia. Il bot raccoglie tutto in una scheda → 🚀 Monta subito o 📝 Con domande. Originali in `97 - Editare/<Nome>`, risultato in `98 - Fatti/<Nome>` (se il nome esiste già → "Nome (2)"). Tempo in più rispetto a Drive: ~0–3 min (download via MTProto, copia in 97 in sottofondo).
   **Da Drive**: una cartella per video in `97 - Editare/` con tutto il girato (iPhone, Sony, Insta360, B-roll, audio del mic). Indicazioni per quel video: `brief.txt` nella cartella (facoltativo).
2. Avvio: dal bot **🆕 Nuovo montaggio** (uno, guidato) o **📦 Più video** (spunti tante cartelle, partono in parallelo); oppure un file `VAI` in ogni cartella: il giro automatico le prende **tutte insieme**, ognuna nel suo giro.
3. Ogni video ha una scheda che si aggiorna; il finale (1080×1920, ~15 Mbps) arriva in chat con 👍/✏️/🔁 e finisce in `98 - Fatti/<Nome>/`.

### Velocità (17/10 notte)
Primo giro reale: 58 min, di cui **40 per ricodificare tutto il girato 4K** in 1080p. Ora l'analisi legge audio e fogli provino direttamente dagli originali (solo fotogrammi chiave) e si ricodificano **solo i pezzi scelti dalla regia** (CRF 16, colori HDR→SDR): stima **~15–20 min a video** (download ~4, analisi ~2, AI ~1, pezzi ~2, render ~6, upload ~1,5). Girato sul disco grande `/mnt` del runner. Claude Code si installa solo se serve. Test locale completo (Drive finto): giro intero, correzione v2, errore → tutti ok.

### Prove reali del 17–18/10 e correzioni
- **Gemini attivo** (chiave inserita da Denis): prova su Cuffie p30i → FINALE v3 in 15 min, `gemini-3.8-flash`, 13k token letti + 4k scritti. Wave3 (prova di Denis, ancora con Claude): 18 min, 45 s.
- **Cuffie p30i "fuori sync e sempre sulle mani"**: la Sony col volto (C0928) ha registrato **solo fruscio** (picco −47 dB, un canale rumore e l'altro vuoto: ricevitore wireless collegato alla presa mic ma spento → microfono interno escluso). Senza voce l'aggancio dall'audio è impossibile, quindi restavano le mani dell'iPhone e il volto messo come B-roll (labiale sbagliato).
  - Ora: camera con **audio muto** → riconosciuta, **agganciata dalle immagini** (`scripts/sync-visivo.mjs`: movimento di mani/prodotto nelle due inquadrature, griglia 3×4, 45 s della camera muta contro tutta la camera della voce a 72×128). Su Cuffie p30i: −9,13 s, spicco 2,7–10 contro falsi ≤1,5. Costo sul runner: ~5 min (decodifica 4K), solo quando serve. Avviso nella scheda/NOTE se il microfono era spento.
  - Regola nel prompt: il volto sincronizzato è l'inquadratura base (≥ metà delle frasi, hook e chiusura), mai più di 2 frasi di fila sulle sole mani; mai un volto che parla come B-roll.
- **Frasi con secondi di vuoto** (F001 "Queste sono… queste sono le Anker" 9,7 s, Wave3 una "frase" di 45,9 s di unboxing): niente più unioni attraverso pause > 1 s, tagli vicini alle parole e silenzi interni ≥ 0,7 s spezzati (parole di Whisper "stirate" sopra le pause). Su Cuffie p30i: 227 → 200 s di parlato utile, frase più lunga 4,3 s.
- **Parole troncate** (Wave3, Denis): il 30–40% dei bordi di frase cadeva in mezzo al parlato (i confini venivano dai tempi di Whisper) → saltando/riordinando frasi le parole restavano mozzate. Nuova divisione: si taglia **solo nelle pause vere dell'audio** (~60 pause ≥ 100 ms al minuto), gruppi di voce tra le pause uniti in frasi con una scelta ottimale dei punti di taglio (pause lunghe e fine periodo, frasi ~3 s, max ~5); bordi con respiro dentro la pausa. Bordi nel parlato: Wave3 37% → 3%, Cuffie 28% → 6% (i rimasti: click o micro-pause vere).
- Verificato che il motore non sfasa audio e video: clip di prova con lampo + bip nello stesso istante → dopo taglio e render Remotion scarto 10–20 ms (labiale percepibile oltre ~45 ms).
- Aggancio audio più severo per clip corte (< 10 s in comune: punteggio ≥ 0,35 e spicco ≥ 2): in Wave3 un'Insta360 di 3 s risultava "sincronizzata" al limite.
- Livelli audio di ogni sorgente nel log (`livelli <id>: fondo … voce …`).

### ⚠️ Minuti GitHub con 10 video al giorno
10 × ~18 min ≈ 180 min/giorno ≈ 5.400/mese: oltre i 2.000 gratuiti dei repo privati. Opzioni (decide Denis): pagare l'eccedenza a minuto; GitHub Pro (3.000 min); **repo pubblico** = minuti illimitati e runner a 4 core (render ~2× più veloce) ma log e artifact visibili: in quel caso togliere l'upload degli artifact (fogli provino/trascrizioni) e i testi dell'AI dai log.

### Cose che deve fare Denis (ancora aperte)
- **Sulla Sony**: lasciare il microfono acceso (anche solo quello interno) o accendere il trasmettitore: con l'audio l'aggancio è istantaneo e sicuro; dalle immagini costa ~5 min ed è il piano B.
- **Pubblicare il bot nuovo**: token Cloudflare (modello "Edit Cloudflare Workers") → `gh secret set CLOUDFLARE_API_TOKEN -R DenLeone/video-regista` e `gh secret set CLOUDFLARE_ACCOUNT_ID -R DenLeone/video-regista`, poi Actions → bot → Run workflow (o push su `telegram/`). In alternativa a mano: `cd telegram` → `npx wrangler deploy`. Finché non lo fa resta il bot vecchio (funziona con la pipeline nuova, ma senza pannello/lotti).
- **Per i video mandati su Telegram** (la Bot API normale scarica solo 20 MB, serve MTProto): su my.telegram.org → API development tools → crea un'app → copia api_id e api_hash, poi `gh secret set TG_API_ID -R DenLeone/video-regista`, `gh secret set TG_API_HASH -R DenLeone/video-regista` e `gh secret set TELEGRAM_BOT_TOKEN -R DenLeone/video-regista` (lo stesso token del bot).
- Da verificare sul primo girato iPhone vero: resa dei colori dopo la conversione HDR→SDR (tonemap hable).

## Obiettivo
Montaggio **100% automatico, anche a PC spento**:
`Drive 97 - Editare/<Video>/ + file VAI` (oppure comando dal bot Telegram) → GitHub Actions scarica, trascrive (Groq Whisper), estrae fotogrammi → **Claude** scrive il piano di montaggio (`work/piano.json`) → **Remotion** renderizza in stile Blueprint → video in `98 - Fatti/<Video>/<Video> - FINALE.mp4` + `NOTE.txt` → messaggio su Telegram.

Vyra NON viene toccato: resta per il montaggio a mano (la sua automazione `vyra-auto-edit` è **in pausa**, vedi sotto).

## Dove sta il progetto
- Codice: `H:\Il mio Drive\96 - Progetti comuni\video-regista\` sul PC ufficio, `G:\Il mio Drive\96 - Progetti comuni\video-regista\` a casa (stesso Drive, lettera diversa).
- Le sessioni cloud di Claude Code non vedono Drive: lavorano sul repo GitHub `DenLeone/video-regista`. Dopo un push dal cloud, fare `git pull` nella cartella Drive.
- ⚠️ **Non fare `npm install` dentro Drive** (node_modules = migliaia di file → sincronizzazione intasata). Per provare in locale: copiare la cartella su C: (es. `C:\temp\video-regista`), `npm install` lì.
- Quando il repo GitHub esisterà, la fonte di verità sarà GitHub; Drive resta una copia comoda.
- Copia di lavoro sul PC ufficio: `C:\temp\video-regista` (con node_modules e il proxy di test) e `C:\temp\regista-telegram` (per i deploy del bot).

## Struttura
| File | Cosa fa |
|---|---|
| `src/Blueprint.tsx` | composizione Remotion: clip + intro tavola + flicker + cartiglio + cornice + parole chiave |
| `src/components/*` | componenti Blueprint (porting da `memory/blueprint-code.md` di Vyra) |
| `src/piano.ts` | tipo del piano di montaggio (contratto tra Claude e Remotion) |
| `scripts/regista.mjs` | pipeline completa (Drive → prep → Claude → render (3 tentativi) → Drive → notifica) |
| `scripts/prompt-regista.md` | istruzioni di stile per Claude (regole Blueprint) |
| `.github/workflows/regista.yml` | ogni 30 min (7–23) + avvio manuale/Telegram con input `cartella` e `brief` |
| `telegram/` | bot Telegram su Cloudflare Workers (`/monta`, `/stato`, notifiche) |

## Stato
- [x] Componenti Blueprint portati in Remotion
- [x] Pipeline `regista.mjs` + prompt di stile + workflow GitHub
- [x] **Test render locale riuscito** (16/10): `98 - Fatti/_TEST/_TEST - FINALE (Remotion).mp4`, 38,5 s, 1080×1920, identico al test Vyra. Tempi su PC ufficio: proxy 1080p di 116 s 4K = 5 min 16 s; render 38,5 s = ~8 min. Il primo tentativo di render è fallito con un errore transitorio del compositor → aggiunti 3 tentativi.
- [x] **Bot Telegram pubblicato**: `https://regista-telegram.denisnusinovic.workers.dev` (Worker `regista-telegram`, account Cloudflare denisnusinovic). Secret già impostati: `TELEGRAM_SECRET`, `NOTIFY_TOKEN` (valori in `C:\Users\Utente\.config\regista\interni.env` sul PC ufficio — non su Drive).
- [x] Bot creato da Denis con BotFather, `TELEGRAM_BOT_TOKEN` caricato, webhook collegato (`/setup`), `ALLOWED_CHAT_ID` = `8332006597,933961188` (Denis + secondo utente aggiunto 16/10; comandi per tutti, notifiche a tutti, conversazioni separate per chat)
- [x] **Repo GitHub privato** `DenLeone/video-regista` creato e codice caricato (16/10). Da casa: `git clone https://github.com/DenLeone/video-regista` in una cartella su C: (fonte di verità = GitHub; la cartella Drive ha anche lei il `.git`, tenerle allineate con push/pull).
- [x] Secret repo impostati: `NOTIFY_TOKEN`, `NOTIFY_URL`. Secret worker: `GITHUB_REPO`.
- [x] **Tutti i secret impostati** (16/10, ~14:27): repo `CLAUDE_CODE_OAUTH_TOKEN`, `GROQ_API_KEY`, `RCLONE_CONF`, `NOTIFY_TOKEN`, `NOTIFY_URL`; worker `TELEGRAM_BOT_TOKEN`, `TELEGRAM_SECRET`, `ALLOWED_CHAT_ID`, `GITHUB_TOKEN`, `GITHUB_REPO`, `NOTIFY_TOKEN`. rclone installato sul PC ufficio (remote `gdrive`, funziona).
- [x] Workflow `regista` **riattivato** (cron ogni 30 min 7–23 + /monta).
- [x] **Primo giro reale su GitHub riuscito** (16/10, run 38911870639, 15:57–16:55 ora italiana) su `97 - Editare/Cuffie p30i`, versione attuale dello script (2ab1d92): render 1081 frame → `Cuffie p30i - FINALE.mp4` 85 MB, caricato su Drive, anteprima 19 MB inviata al bot (HTTP 200). Fase Monta = 56 min.
  - Prima: run 38900694099 fallito subito (`echo "${{secrets.RCLONE_CONF}}"` mangiava le virgolette → corretto con env + printf). Run 38900918411 su `_TEST_GH` (versione vecchia): render completato (`_TEST_GH - FINALE.mp4` 45 MB, Monta 32 min) ma crash subito dopo l'upload con `Cannot read properties of null (reading 'toString')`: era `execFileSync` con stdio `inherit` che restituisce null, **già corretto** in `run()` (righe 33–34 di `regista.mjs`). `_TEST_GH` resta senza cache `_regista`: la ✏️ correzione lì non funziona, serve un nuovo montaggio.
- [x] **Bot v2** (16/10): menu a bottoni; `/nuovo` = brief guidato a 5 domande (cartella, sponsor, durata, tono, tavola, note) con riepilogo e 🚀 Avvia; `/stato` con fase in corso e minuti; messaggi silenziosi a ogni fase; a fine montaggio **video 720p in chat** (≤45 MB; se non passa → foto anteprima) con 👍 Va bene / ✏️ Correggi; ✏️ → scrivi cosa cambiare → giro in modalità correzione (`origine=98`) che riparte dal piano salvato e crea `FINALE v2`, `v3`…; errori con 🔁 Riprova. Memoria del bot = Durable Object `Memoria` (KV non creabile: login wrangler senza scope KV).
- [x] Script: cache per ogni video in `98 - Fatti/<nome>/_regista/` (`piano.json`, `materiale.json` con trascrizioni → le correzioni non ritrascrivono); esclude dal materiale `_VAI_usato_*`, `*FINALE*`, `NOTE/ERRORE.txt`; cancella gli originali 4K dopo il proxy (spazio sul runner). **Non ancora provato su un giro reale.**
- [x] **Regista v2 in produzione** (17/10 notte, portata su `main` su richiesta di Denis; primo test reale lo lancia Denis da Telegram). Il montaggio di `Cuffie p30i` era uscito "alla rinfusa" per 3 cause: tempi parola di Whisper sbagliati (57/576 parole accavallate → tagli a metà parola), una sola inquadratura usata (la Sony C0928 = stessa ripresa dell'iPhone ma trattata come muta; B-roll impossibili sopra la voce), solo 10 fotogrammi per clip. Cosa cambia:
  - `scripts/sorgenti.mjs`: riconosce il dispositivo (nome file + metadati) e sceglie la voce con le regole di Denis: **file audio separato (mic esterno) > Insta360 > iPhone > altre camere > Sony** (la Sony registra quasi sempre audio ma quasi mai col microfono: serve solo per sincronizzarla).
  - `scripts/audio.mjs`: sincronizzazione automatica delle camere per correlazione dell'audio (test sintetico: ritardo 3,21 s ritrovato esatto, audio estraneo scartato); frasi brevi con **tagli agganciati ai silenzi veri** (test: 0 tagli a metà parola contro 174/302 del metodo vecchio).
  - Fogli provino 4×4 con il tempo scritto (fino a 32 riquadri per clip; per le camere sincronizzate i tempi sono già quelli della voce).
  - L'AI non scrive più tempi: scrive `regia.json` (frasi + `camera` o `broll`, parole chiave ancorate alle frasi, flicker sui tagli); `scripts/regia.mjs` calcola tutto e produce `piano.json`. Correzioni ✏️ su `regia.json` con le stesse frasi (riprese dalla cache). I montaggi fatti con la v1 non si possono correggere con la v2: serve un nuovo montaggio.
  - Remotion: immagine da una camera e voce dalla traccia principale (WAV), micro-dissolvenze audio ai tagli. Render di prova verificato pezzo per pezzo (voce giusta su ogni taglio, scarto costante 0,05 s).
  - Cervello: **Claude Sonnet** di default (`REGISTA_MODEL`), materiale passato nel prompt e fogli letti tutti insieme (meno passaggi = meno token); se Claude non risponde (es. limite d'uso) passa da solo a **Gemini** (`GEMINI_API_KEY`, modello `GEMINI_MODEL`, default `gemini-flash-latest`). `REGISTA_AI` = auto | claude | gemini.
  - Workflow: `runs-on: ubuntu-24.04` (evita il passaggio a Ubuntu 26 del 19/10), conserva regia/materiale/fogli tra gli artifact.
  - **AI predefinita: Gemini Flash** (`gemini-flash-latest`: buona visione, pochi token, limiti alti; 1 chiamata + 1 conteggio gratuito per montaggio) con **riserva automatica Claude Sonnet**; Gemini Pro selezionabile dal bot (se il modello non esiste ripiega su Flash). Se manca `GEMINI_API_KEY` si usa Claude. Al limite (429) Gemini riprova ~30 s poi passa a Claude.
  - Prossimo passo: Denis lancia un montaggio vero da Telegram → valutare risultato, token (scheda del video) e tempi.
- [ ] ⏳ **Bot v3** (17/10, su `main`; pubblicazione via `bot.yml`, verificare che il token Cloudflare ci sia): pannello di controllo `/menu` che si aggiorna nello stesso messaggio; **scheda di avanzamento unica** per ogni montaggio (barra ▰▱, fasi ✅/⏳ con dettagli, si modifica da sola; il messaggio "in coda" dell'avvio diventa la scheda); nuovo montaggio a 6 passi con **cartelle a tasti** (elenco di 97 - Editare mandato dal workflow, ⚡ = ha VAI, tasto Aggiorna = workflow `azione: elenco` da ~1 min), Indietro, riepilogo con modifica dei singoli campi; **impostazioni** (motore Stabile=main / Beta v2=regista-v2, AI auto/claude/gemini, modello haiku/sonnet/opus → input `ai`/`modello` del workflow; col motore stabile attuale il bot riprova da solo senza quegli input); scheda del video con durata, tagli, sorgenti, voce, parole chiave, token AI; tasti 👍 Approva (resta segnato), ✏️ Correggi, 🔁 Rifai da zero (con conferma), 🔧 Log; errori con causa e 🔁 Riprova; se gli mandi un video spiega che i file vanno su Drive (limite bot 20 MB); comandi registrati da solo. Testato con Telegram/GitHub simulati (sessione completa a 2 utenti) e typecheck Workers.
  - Pubblicazione: workflow `bot.yml` (push su main che tocca `telegram/**`, o avvio manuale). Serve una volta: token Cloudflare (dash.cloudflare.com → My Profile → API Tokens → Create Token → modello "Edit Cloudflare Workers") → `gh secret set CLOUDFLARE_API_TOKEN -R DenLeone/video-regista` e `gh secret set CLOUDFLARE_ACCOUNT_ID -R DenLeone/video-regista` (Account ID: dashboard Cloudflare → Workers & Pages, colonna destra). In alternativa a mano: `git checkout regista-v2`, `cd telegram`, `npx wrangler deploy`.
  - Workflow: rclone sempre, ffmpeg solo se c'è da montare (giri a vuoto più corti); manda al bot l'elenco cartelle a ogni giro.
  - Stima token prima dell'invio nella fase Regia (per Gemini conteggio esatto con `countTokens`, gratuito); consumo reale nella scheda del video.
- [ ] Gemini come riserva: Denis crea una chiave su Google AI Studio (aistudio.google.com → Get API key) e la salva con `gh secret set GEMINI_API_KEY -R DenLeone/video-regista`. Facoltativo: variabili `REGISTA_MODEL` / `GEMINI_MODEL` in Settings → Secrets and variables → Actions → Variables.
- [ ] Timeline per DaVinci (FCPXML/OTIO) salvata insieme al video → base per il comando "vai su DaVinci" (Denis ha Resolve **Studio**: scripting esterno disponibile).
- [ ] ⚠️ **rclone usa il client_id condiviso** che Google/rclone ritirano "durante il 2026" → può smettere di funzionare all'improvviso. Da sistemare: creare client OAuth proprio (Google Cloud progetto `regista`, Drive API, app **pubblicata** non in test, client "App desktop") e rifare `rclone config` → aggiornare secret `RCLONE_CONF`. Denis ha scelto di rimandarlo (16/10).
- [ ] Contenitori (PNG caldo/freddo) come inserti — asset in `03 · Social — Risorse/Contenitori — setup video 9 16`
- [ ] Bot: chat libera con Claude (via API a consumo o via abbonamento passando da GitHub Actions ~1 min/risposta). Da verificare se esiste un'integrazione Telegram ufficiale di Claude Code.
- [ ] (opzionale) Worker che controlla Drive e avvia GitHub solo quando serve (risparmia minuti)

## Cose che deve fare Denis (una volta sola)
Fatti (16/10): ✅ bot BotFather + token · ✅ chat id · ✅ `gh auth login` (account DenLeone).

✅ Tutto fatto il 16/10 (A–D). Riferimento per rifarli (comandi PowerShell, uno alla volta; quando chiedono il valore, incollarlo):
A. ✅ FATTO 16/10 — **Token GitHub per il bot** (fine-grained `regista-telegram`, solo video-regista, Actions R/W): github.com → Settings → Developer settings → Fine-grained tokens → Generate → Repository access: solo `video-regista` → Permissions: **Actions: Read and write** → genera e copia. Poi:
   `cd C:\temp\regista-telegram` e `npx wrangler secret put GITHUB_TOKEN`
B. **Token Claude**: `claude setup-token` (si apre il browser, conferma) → copia il token → `gh secret set CLAUDE_CODE_OAUTH_TOKEN -R DenLeone/video-regista`
C. **Groq**: apri `C:\Users\Utente\.config\watch\.env`, copia il valore di GROQ_API_KEY → `gh secret set GROQ_API_KEY -R DenLeone/video-regista`
D. **Drive (rclone)**: `winget install Rclone.Rclone` → riapri PowerShell → `rclone config` → n (new) → nome `gdrive` → storage `drive` → client id/secret vuoti → scope `1` (full) → root folder vuoto → service account vuoto → advanced `n` → auto config `y` (login nel browser con **denisnusinovic**) → shared drive `n` → `y` → `q`. Poi: `Get-Content -Raw "$env:APPDATA\rclone\rclone.conf" | gh secret set RCLONE_CONF -R DenLeone/video-regista`
Poi Claude riattiva il workflow e lancia il primo giro.

## Decisioni prese
- Opzione A (Remotion + GitHub Actions) invece di mini PC: gratis, nessun browser da tenere sveglio.
- Blueprint resta la firma; i contenitori serviranno solo per inserti/foto prodotto (16/10).
- Clip orizzontali: contenute a tutta larghezza su copia sfocata di sé stesse.
- Cron ogni 30 min 7–23 per stare nei ~2000 min/mese gratuiti dei repo privati.
- Notifiche: Telegram al posto dell'email (16/10).
- I token del bot e di GitHub li inserisce Denis (Claude non maneggia credenziali); i token interni casuali li genera Claude.

## Rischi / da verificare
- Token Claude via abbonamento in Actions: da guide di terzi, da confermare sul README ufficiale di claude-code-action.
- Render su runner GitHub (2 CPU, no GPU): misurato il 16/10, fase Monta completa 32–56 min per video da ~36–42 s. Con ~2000 min/mese gratuiti = circa 25–35 montaggi/mese (i giri a vuoto del cron costano 1 min l'uno; GitHub ne esegue molti meno di uno ogni 30 min, circa 1 ogni 3 ore).
- ⚠️ Dal **19/10/2026** `ubuntu-latest` passa a Ubuntu 26: possibili rotture su installazione ffmpeg/rclone o dipendenze di Chrome per Remotion. Valutare di fissare `runs-on: ubuntu-24.04` nel workflow.
- Idea in valutazione (17/10): comando Telegram "vai su DaVinci" → montaggio fatto in DaVinci Resolve sul PC (vedi chat del 17/10; serve un agente locale sul PC).
- Clip senza parlato: montaggio basato solo sui fotogrammi → più generico; `brief.txt` o brief dal bot aiuta.

## Vyra (messo da parte il 16/10)
- Automazione `vyra-auto-edit` **disattivata** (Claude app → Scheduled). Problemi: scheda Vyra in background (Comet) blocca l'import; permesso cartella che decade; collegamento scheda che si perde.
- Cartella `97 - Editare/Key air` (B-roll Elgato Key Light Air, senza parlato): l'ultimo giro Vyra delle 13:21 poteva essere ancora in corso; controllare `ERRORE.txt`/`NOTE.txt` e il lock `97 - Editare/_IN_LAVORAZIONE.lock` prima di riusarla col nuovo sistema.

# video-regista — PROGRESSO

> File di passaggio tra sessioni (ufficio / casa / in giro). Aggiornato da Claude a ogni passo.
> Ultimo aggiornamento: **2026-10-16 pomeriggio, ufficio**.

## Obiettivo
Montaggio **100% automatico, anche a PC spento**:
`Drive 97 - Editare/<Video>/ + file VAI` (oppure comando dal bot Telegram) → GitHub Actions scarica, trascrive (Groq Whisper), estrae fotogrammi → **Claude** scrive il piano di montaggio (`work/piano.json`) → **Remotion** renderizza in stile Blueprint → video in `98 - Fatti/<Video>/<Video> - FINALE.mp4` + `NOTE.txt` → messaggio su Telegram.

Vyra NON viene toccato: resta per il montaggio a mano (la sua automazione `vyra-auto-edit` è **in pausa**, vedi sotto).

## Dove sta il progetto
- Codice: `H:\Il mio Drive\96 - Progetti comuni\video-regista\` (Drive, accessibile da ufficio/casa/telefono).
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
- [x] Bot creato da Denis con BotFather, `TELEGRAM_BOT_TOKEN` caricato, webhook collegato (`/setup`), `ALLOWED_CHAT_ID` = 8332006597 (16/10)
- [ ] Bot: `GITHUB_TOKEN`, `GITHUB_REPO` (dopo il repo GitHub) — finché mancano, /monta e /stato rispondono con errore GitHub
- [ ] Test pipeline completa in locale (serve rclone)
- [ ] Account/repo GitHub + secrets — **serve Denis**
- [ ] Primo giro reale su GitHub
- [ ] Contenitori (PNG caldo/freddo) come inserti — asset in `03 · Social — Risorse/Contenitori — setup video 9 16`
- [ ] Bot: chat libera con Claude (via API a consumo o via abbonamento passando da GitHub Actions ~1 min/risposta). Da verificare se esiste un'integrazione Telegram ufficiale di Claude Code.
- [ ] (opzionale) Worker che controlla Drive e avvia GitHub solo quando serve (risparmia minuti)

## Cose che deve fare Denis (una volta sola)
1. **Bot Telegram** (2 min, da telefono): apri Telegram → cerca **@BotFather** → `/newbot` → nome "Regista" → username tipo `regista_denis_bot` → copia il token. Poi sul PC ufficio, in `C:\temp\regista-telegram`: `npx wrangler secret put TELEGRAM_BOT_TOKEN` e incolla il token. Dillo a Claude: collega il webhook da sé (`/setup`).
2. **Chat id**: scrivi `/start` al bot → ti risponde col tuo chat id → dillo a Claude (non è un segreto).
3. **GitHub**: account (se non c'è) → sul PC `gh auth login`. Repo privato `video-regista`.
4. **Token Claude**: sul PC `claude setup-token` → secret `CLAUDE_CODE_OAUTH_TOKEN` nel repo.
5. **Drive per rclone**: `rclone config` → remote `gdrive` (tipo drive, account denisnusinovic) → contenuto di `rclone.conf` → secret `RCLONE_CONF`.
6. **Groq**: la chiave già in `~/.config/watch/.env` → secret `GROQ_API_KEY`.

## Decisioni prese
- Opzione A (Remotion + GitHub Actions) invece di mini PC: gratis, nessun browser da tenere sveglio.
- Blueprint resta la firma; i contenitori serviranno solo per inserti/foto prodotto (16/10).
- Clip orizzontali: contenute a tutta larghezza su copia sfocata di sé stesse.
- Cron ogni 30 min 7–23 per stare nei ~2000 min/mese gratuiti dei repo privati.
- Notifiche: Telegram al posto dell'email (16/10).
- I token del bot e di GitHub li inserisce Denis (Claude non maneggia credenziali); i token interni casuali li genera Claude.

## Rischi / da verificare
- Token Claude via abbonamento in Actions: da guide di terzi, da confermare sul README ufficiale di claude-code-action.
- Render su runner GitHub (2 CPU, no GPU): su PC ufficio ~8 min per 38 s; su GitHub non ancora misurato.
- Clip senza parlato: montaggio basato solo sui fotogrammi → più generico; `brief.txt` o brief dal bot aiuta.

## Vyra (messo da parte il 16/10)
- Automazione `vyra-auto-edit` **disattivata** (Claude app → Scheduled). Problemi: scheda Vyra in background (Comet) blocca l'import; permesso cartella che decade; collegamento scheda che si perde.
- Cartella `97 - Editare/Key air` (B-roll Elgato Key Light Air, senza parlato): l'ultimo giro Vyra delle 13:21 poteva essere ancora in corso; controllare `ERRORE.txt`/`NOTE.txt` e il lock `97 - Editare/_IN_LAVORAZIONE.lock` prima di riusarla col nuovo sistema.

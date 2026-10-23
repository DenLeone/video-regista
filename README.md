# Regista

Montaggio automatico 9:16. Il bot Telegram resta com’è. L’app è una PWA sullo stesso Worker, solo per Denis: il secondo chat id di `ALLOWED_CHAT_ID` continua a usare Telegram e non entra nell’app.

## Installarla sull’iPhone

1. Apri Safari (non Chrome) su `https://regista-telegram.denisnusinovic.workers.dev`.
2. Condividi → Aggiungi a Home.
3. Aprila dall’icona. La prima volta: «Mandami il codice su Telegram», poi crea la passkey.
4. Da quel momento l’app è bloccata su quell’iPhone. Un codice Telegram da solo non registra un secondo telefono.
5. Secondo iPhone: Impostazioni → «Autorizza un altro iPhone» (manda un codice e apre 10 minuti), oppure il codice segreto `APP_SETUP_CODE`.

La sessione è un cookie `__Host-regista` (HttpOnly, Secure, SameSite=Lax, 30 giorni). Ogni `/api` senza sessione risponde 401.

## Segreti nuovi

Sul Worker (`npx wrangler secret put`, dalla cartella `telegram/`):

| Nome | A cosa serve |
| --- | --- |
| `APP_SETUP_CODE` | Codice di recupero, riusabile. Senza, il primo accesso è solo il codice Telegram. |
| `R2_ACCOUNT_ID` | Account Cloudflare, 32 caratteri hex. |
| `R2_ACCESS_KEY_ID` | Chiave S3 del bucket, non il token API. |
| `R2_SECRET_ACCESS_KEY` | Segreto della chiave S3. |
| `R2_BUCKET` | Bucket dedicato all’inbox. Il deploy non lo crea e non fallisce se manca. |
| `VAPID_PUBLIC_KEY` | Notifiche. Facoltative. |
| `VAPID_PRIVATE_KEY` | |
| `VAPID_SUBJECT` | es. `mailto:…` |
| `DRIVE_CLIENT_ID` | Per vedere il video dentro l’app. Senza, c’è il link di Drive. |
| `DRIVE_CLIENT_SECRET` | |
| `DRIVE_REFRESH_TOKEN` | |

Su GitHub Actions, gli stessi quattro valori R2: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.

Il bucket va creato a mano. Il Worker imposta il CORS al primo caricamento ed espone `ETag` (senza, il telefono non può confermare i pezzi). Una lifecycle di 7 giorni su `inbox/` è una rete di sicurezza: il runner cancella i file solo dopo che la copia su Drive è riuscita.

Chiavi VAPID, una volta: `npx web-push generate-vapid-keys` non serve nel repo; si possono generare con `node -e` e WebCrypto, oppure con qualsiasi strumento VAPID. Non vanno nel codice.

## Caricare mentre si è fuori

Il collo di bottiglia è il telefono sui dati, non il runner. L’app Drive, in 4G/5G, va piano e si ferma. L’app manda il girato a pezzi da 8 MB, quattro alla volta, con URL firmati verso R2. Il Worker non vede i byte (il limite di un body sul Worker è 100 MB). Il runner scarica da R2 con 16 trasferimenti, monta, e intanto copia gli originali in `01 · Da editare/<nome>`. Se la copia riesce, svuota R2. Il risultato finisce in `02 · Fatti`, come per i video arrivati da Telegram.

I pezzi già confermati non si rimandano: stanno sul Worker e, in più, in IndexedDB (solo numero ed ETag, non il file). Se cade la rete o iOS sospende la pagina, si riprende. Se iOS chiude proprio l’app, il file va riselezionato: stesso nome e stessa dimensione, e i pezzi fatti si saltano.

Tre modi, scelti a ogni invio:

- **Originali.** Qualità della camera. È il file da pubblicare.
- **Solo i file scelti.** Si mandano le clip intere che bastano per far partire la regia. Il resto, dal Wi-Fi, con «Manda il resto»: finisce nella stessa cartella e non rilancia il montaggio. Per usarlo serve Rifai. Un intervallo di byte di un MP4 non è un video (manca il `moov`): non si può “tagliare” il file senza ricodificarlo.
- **Copia leggera.** Solo se Safari ha `MediaRecorder`. Canvas a circa 720p e ~2,5 Mbps, in tempo reale, schermo acceso. L’audio può mancare. Non è da pubblicare. `VideoEncoder` (WebCodecs) su iOS Safari non è affidabile, e non c’è un encoder in background.

iPhone non espone quasi mai il tipo di rete. La scelta «dati sì / no» è tua. Se `navigator.connection` dice cellular, 2G o 3G, l’app propone da sola «Solo i file scelti».

Safari non ha un caricamento in background vero (niente Background Sync, niente `URLSession`). La schermata tiene acceso il Wake Lock solo mentre è visibile. È il limite, non un’impostazione dimenticata.

### Quanto tempo si risparmia

Numeri di ipotesi, non una misura sulla linea di Denis. Stanno in `scripts/rete.mjs`:

| Tratta | Ipotesi |
| --- | --- |
| Telefono → Drive in 4G/5G | 0,6 MB/s |
| Telefono → R2, 4 pezzi in parallelo | 2,5 MB/s |
| Runner → Drive | 8 MB/s |
| Runner → R2 | 40 MB/s |

Su 8 GB: il telefono passa da circa 3,7 ore a circa 53 minuti (poco più di 2,8 ore in meno). Il runner passa da circa 17 minuti a circa 3. Nei giri già fatti il download da Drive è nell’ordine di qualche minuto su un lavoro di 15–20: il guadagno grosso, fuori casa, è il telefono. Se la rete cade, conta di più non rimandare i pezzi fatti che la velocità di picco.

R2: circa 0,015 USD per GB al mese, niente egress, operazioni economiche. I file si cancellano dopo la copia su Drive.

## Cosa fa l’app, e cosa no

Fatto, come nel bot: nuovo montaggio guidato (cartella, stile, sponsor, durata, tono, giudizio, note, tavola solo per Blueprint), più video, ultimi video, stato dal vivo mentre la pagina è aperta, approva, didascalia, titolo, Instagram, YouTube, pubblica, correggi, cambia stile, prova da 10 secondi, solo render, rifai, riprova, prova della regia, impostazioni. Caricamento R2 con ripresa. Notifiche se ci sono le chiavi VAPID (su iOS solo dall’icona in Home). Playback se ci sono le chiavi Drive.

Non fatto: upload davvero in background su iOS, una copia 4K affidabile fatta sul telefono, l’analisi degli esempi di uno stile, la foto profilo del bot. La prova della regia legge la cache di un montaggio già fatto, non un girato appena arrivato.

## Controllo

`npm run app:check` verifica i tipi del Worker e i test (firma S3, passkey, pezzi, route, stima di rete). Il workflow del bot lo lancia prima del deploy.

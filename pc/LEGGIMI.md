# Video YouTube sul PC (tutto in locale)

## Il modo facile: doppio clic su C:\regista\VIDEO.bat
Ti chiede la cartella (trascinala nella finestra), i minuti e cosa vuoi, poi fa tutto: analisi,
piano (Gemini), anteprima, video intero e apre la cartella con il risultato.
Comodo: tasto destro su VIDEO.bat → Mostra altre opzioni → Invia a → Desktop (crea collegamento).

## A mano, passo per passo

Tre comandi, sempre da PowerShell in `C:\regista` (e dopo ogni comando: Invio 😄).
Prima di tutto, ogni volta: `git pull` (prende gli aggiornamenti).

## 1. Analisi della cartella
    node pc\analizza.mjs "E:\cartella\del\girato"
Esce `C:\regista\work\pc\<nome cartella>\materiale.md`: ogni video con data, posto, durata e cosa dici.
La trascrizione gira sulla 5070 Ti; si può rilanciare quando si vuole (rifà solo quello che manca).

## 2. Il piano: chi decide cosa va nel video

### A) Con Gemini, automatico (consigliato quando non hai Claude)
Una volta sola: chiave gratuita su https://aistudio.google.com/apikey → in PowerShell
    setx GEMINI_API_KEY "LA-TUA-CHIAVE"
poi chiudi e riapri PowerShell. Da lì in poi:
    node pc\piano.mjs <nome cartella> 15 "vlog di viaggio, gancio su …"
(15 = minuti; la frase tra virgolette è facoltativa). Scrive `pc\progetti\<nome>.json`.

### A2) Con l'AI locale (gratis, sul PC, niente limiti)
Una volta sola, in PowerShell:
    winget install Ollama.Ollama
    ollama pull qwen2.5:14b
(scarica ~9 GB). Da lì `pc\piano.mjs` e VIDEO.bat usano lei per prima, Gemini solo se non risponde.
Per forzare Gemini: `setx REGISTA_AI gemini`. Più lenta di Gemini e un po' meno brava nel racconto.

### B) Con Gemini sul sito (gemini.google.com), a mano
Allega `work\pc\<nome>\materiale.md` e `pc\progetti\austria.json` (esempio) e scrivi:
«Scrivi il piano di montaggio di un vlog di 15 minuti dal materiale, nello stesso formato JSON
dell'esempio. Copia esatte le parole di "da" e "a" dal testo dei video.»
Salva la risposta come `pc\progetti\<nome>.json`.

### C) Con Claude Code (se hai ancora crediti)
    claude
«leggi pc\LEGGIMI.md e work\pc\<nome>\materiale.md e scrivi il piano di un vlog di 15 minuti in pc\progetti\<nome>.json»

### Il formato, se vuoi ritoccarlo a mano (Blocco note)
Le clip si indicano col **nome del file** (quello dopo `## ` in materiale.md): non cambia mai, anche se aggiungi o togli clip.
- `{ "capitolo": "Vienna", "sotto": "Il centro · 5 ottobre", "musica": "ES_Legend - DonVayei.mp3" }` titolo del capitolo + musica (da G:\Il mio Drive\12 · Risorse\Assets\Suoni\Musica; `""` = silenzio)
- `"luogo": "Schloss Schönbrunn, Wien"` dentro un capitolo: mappa animata (OpenStreetMap) col percorso dalla tappa prima; `"paese": "at"` nel piano limita la ricerca a quel paese. Se il posto non si trova, niente mappa (lo scrive).
- B-roll automatici: sui pezzi parlati lunghi, clip senza parlato girate nello stesso posto (stesso giorno, entro 15 minuti, entro 3 km se c'è il GPS; mai dagli export). `"auto": false` su un pezzo li toglie, `"brollAuto": false` nel piano li toglie tutti.
- `{ "v": "JBRN7605.MP4", "da": "prime parole", "a": "ultime parole" }` pezzo dove parli, tagliato sulle parole (le pause lunghe si tolgono da sole)
- `"sopra": [{ "v": "UVWY3794.MP4", "dal": 3, "al": 5, "per": 3 }]` dentro un pezzo parlato: B-roll sopra la voce (dal = secondo nel B-roll, al = secondo nel pezzo)
- `{ "broll": "UVWY3794.MP4", "dal": 3, "per": 3 }` B-roll da solo (`"audio": "muto"` o `"pieno"`)
- `{ "titolo": "Austria", "sotto": "…", "su": "IMG_8917.MOV", "dal": 10, "per": 3.5 }` titolo grande (sigla)

## 3. Montaggio
    node pc\monta.mjs pc\progetti\<nome>.json --fino 120     (anteprima: primi 2 minuti)
    node pc\monta.mjs pc\progetti\<nome>.json                (tutto, 1080p)
    node pc\monta.mjs pc\progetti\<nome>.json --4k           (tutto, in 4K)
Esce in `C:\regista\work\pc\<nome>\montaggio\`: il video `<nome>.mp4` e `<nome> - DaVinci.fcpxml`
(DaVinci → File → Importa → Timeline). Rilanciando, i pezzi già fatti non si rifanno.

Se si ferma con «problemi nel piano»: sono frasi non trovate. Apri il piano, copia le parole giuste
da `materiale.md` e rilancia.

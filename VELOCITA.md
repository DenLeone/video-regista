# Velocità — modifiche del 13/11/2026

Tutto sul piano gratuito. Il repo è pubblico: i minuti di GitHub Actions non si pagano. Nessuna API a pagamento aggiunta (resta Groq + Gemini già in uso).

## Cosa è cambiato

### 1. L'analisi non si rifà se i file sono gli stessi
File: `scripts/cache-analisi.mjs`, `scripts/regista.mjs`

In `_regista/materiale.json` ora ci sono la dimensione di ogni file (`byte`), un'`impronta` e se il giro era in modalità discorso.

- **Solo render** e **ogni macchina dei pezzi** riusano trascrizione, sync e frasi già salvate. Prima ciascuna delle 6–8 macchine rianalizzava il girato (Groq compreso) prima di renderizzare il suo tratto.
- **Stesso girato rilanciato** (stesso nome e stessa dimensione, anche con un altro stile): niente nuova trascrizione e niente ricalcolo dell'aggancio visivo del 4K. I fogli provino si rifanno, perché l'AI deve ancora scegliere.
- Un file sostituito (dimensione diversa) non tiene la trascrizione vecchia.
- La cache dei giri già fatti, senza `byte`, vale ancora per correzione e solo render.

### 2. Fogli provino in parallelo
File: `scripts/regista.mjs`

I fotogrammi di una clip partono 4 alla volta, e fino a 3 clip insieme. Prima erano uno dopo l'altro.

### 3. Più macchine, sempre gratis
- `regista.yml`: default da 6 a **8** macchine.
- `veloce.yml`: default da 4 a **8** macchine.

Il render si divide in più pezzi. Il tempo di orologio scende; i minuti totali di Actions salgono, ma sul repo pubblico non costano.

### 4. Confronto colore saltato dove non serve
Nel solo render (e sulle macchine dei pezzi) non si rifà il confronto colore I-Log: è già nel giro che ha scritto la regia.

## Cosa non è stato toccato

- Nessun servizio a pagamento.
- Nessun cambiamento a stili, regia, pubblicazione, bot.
- L'immagine Docker (`USA_IMMAGINE`) resta spenta: accenderla è una variabile del repository, non un costo, ma va verificata a parte.

## Tempo atteso

| | Prima | Dopo, a regime |
|---|---|---|
| Montaggio normale | ~20 min | ~12–15 min |
| Secondo giro sugli stessi file (altro stile, solo render) | ~20 min | ~8–12 min |
| Macchine dei pezzi | rianalizzavano tutte | partono dal materiale già salvato |

Il primo giro di una cartella nuova paga ancora trascrizione e fogli (una volta sola, sulla macchina che prepara). Dal giro dopo, e su tutte le macchine di render, quel pezzo non si ripete.

`REGISTA_CACHE=0` non c'è: per forzare un'analisi nuova basta cambiare un file, oppure cancellare `_regista/materiale.json` nella cartella del video.

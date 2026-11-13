# Velocità — 13/11/2026

Tutto sul piano gratuito. Il repo è pubblico: i minuti di GitHub Actions non si pagano. Nessuna API a pagamento aggiunta.

## Cosa è in produzione

### 1. L'analisi non si rifà se i file sono gli stessi
`scripts/cache-analisi.mjs`, `scripts/regista.mjs`

In `_regista/materiale.json` ci sono la dimensione di ogni file, un'impronta e se il giro era in modalità discorso.

- Solo render e ogni macchina dei pezzi riusano trascrizione e sync. Prima ciascuna rianalizzava il girato.
- Stesso girato rilanciato (stesso nome e stessa dimensione): niente Groq e niente aggancio visivo del 4K.
- Un file sostituito non tiene la trascrizione vecchia.

### 2. L'analisi parte prima del tap
Quando l'upload dall'app arriva tutto su R2, parte da solo il giro `azione: prepara`.

- Scarica, trascrive, sincronizza.
- Salva `_regista/materiale-anticipato.json`. Non tocca `materiale.json` di un montaggio già fatto.
- Non monta, non cancella i file su R2, non tiene bloccata la coda del montaggio.
- Il tap «Monta» resta obbligatorio. Se i file coincidono, il montaggio salta trascrizione e sync.
- Archivio e video di riferimento di uno stile non la avviano.
- Se fallisce, il montaggio la rifà da solo.

Telegram manda un messaggio solo alla fine: «Analisi pronta».

### 3. I pezzi del render passano da R2
`scripts/rete.mjs`

I tratti già montati (`v.ts` + audio) vanno su R2 (`pezzi/<giro>/`), non su Drive. Chi riunisce li scarica da lì. Se R2 non risponde, si torna a Drive come prima. A fine giro si cancellano sia da R2 sia da Drive.

Vale per `regista.yml` e per `veloce.yml`. Il girato originale non cambia posto.

### 4. Fogli provino in parallelo
I fotogrammi di una clip partono 4 alla volta, fino a 3 clip insieme.

### 5. Otto macchine
Default 8 in `regista.yml` e in `veloce.yml`.

## Cosa non ho messo

Far scaricare un proxy unico alle 8 macchine, al posto del 4K. Il download è già in parallelo con l'analisi: toglierlo da lì allungherebbe il giro, non lo accorcerebbe. L'immagine Docker resta spenta: accenderla oggi rimette tutto su una macchina sola.

## Tempo atteso

| | Prima | Adesso |
|---|---|---|
| Montaggio appena caricato dall'app, tap dopo qualche minuto | ~20 min | ~10–14 min (l'analisi è già fatta) |
| Tap immediato, analisi ancora in corso | ~20 min | ~12–15 min |
| Stesso girato di nuovo | ~20 min | ~8–12 min |
| Cartella nuova da Drive, primo giro | ~20 min | ~12–15 min |

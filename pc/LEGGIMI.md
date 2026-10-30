# Video YouTube sul PC (tutto in locale)

## 1. Analisi della cartella (una volta per video)
    cd C:\regista
    git pull
    node pc\analizza.mjs "E:\cartella\del\girato"
Esce `C:\regista\work\pc\<nome>\materiale.md`: ogni video con data, posto, durata e cosa dici.

## 2. Il piano (pc\progetti\<nome>.json)
Elenco in ordine di cosa va nel video:
- `{ "capitolo": "Vienna", "sotto": "Il centro · 5 ottobre", "musica": "ES_Legend - DonVayei.mp3" }` titolo del capitolo + musica (da G:\Il mio Drive\12 · Risorse\Assets\Suoni\Musica; `""` = silenzio)
- `{ "v": "V058", "da": "prime parole", "a": "ultime parole" }` un pezzo dove parli, tagliato sulle parole (le pause lunghe si tolgono da sole)
- `"sopra": [{ "v": "V071", "dal": 3, "al": 5, "per": 3 }]` dentro un pezzo parlato: B-roll sopra la voce (dal = secondo nel B-roll, al = secondo nel pezzo)
- `{ "broll": "V071", "dal": 3, "per": 3 }` B-roll da solo (`"audio": "muto"` o `"pieno"`)
- `{ "titolo": "Austria", "sotto": "…", "su": "V239", "dal": 10, "per": 3.5 }` titolo grande (sigla)
Per scriverlo senza fatica: apri `claude` in C:\regista e chiedigli «leggi pc\LEGGIMI.md e work\pc\<nome>\materiale.md e scrivi il piano di un vlog di 15 minuti».

## 3. Montaggio
    node pc\monta.mjs pc\progetti\<nome>.json --fino 120     (anteprima: primi 2 minuti)
    node pc\monta.mjs pc\progetti\<nome>.json                (tutto)
Esce in `C:\regista\work\pc\<nome>\montaggio\`: il video `<nome>.mp4` e `<nome> - DaVinci.fcpxml`
(DaVinci → File → Importa → Timeline). Rilanciando, i pezzi già fatti non si rifanno.

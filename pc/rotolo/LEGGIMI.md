# Rotolo — documentario a piano sequenza

Un solo movimento di camera su un lungo rotolo di carta di riso (kakemono) srotolato su un tavolo scuro.
Dall'alto (passato) al basso (oggi), senza tagli: foto d'epoca, carte, timbri rossi, scritte a pennello e a
macchina cadono sulla carta **sulla parola che le nomina**. Verticale 9:16, 4K. Nato dalla prova
"Nintendo" del 04/11/2026 (`src/DocNintendo.tsx`, la versione fatta a mano, resta come riferimento).

## Cosa serve
Una cartella con:
- **un file audio**: la voce (wav, mp3, m4a…), senza musica sotto;
- **le foto**, con il nome che dice cosa sono: `tipo-nome-anno.ext`
  - `persona-hiroshi-yamauchi-1960.jpg` → stampa in bianco e nero (+ didascalia del nome)
  - `luogo-kyoto.jpg`, `documento-giornale-1958.jpg` → bianco e nero
  - `prodotto-ultra-hand-1966.jpg` → a colori
  - `ritaglio-mario.png` → PNG trasparente, cade senza cornice
  - lato lungo almeno 1500 px (i ritratti piccoli reggono solo se mostrati piccoli).

## Dal bot (server)
🎞 **Documentario** → cartella in `01 · Da editare` → 1080 o 4K. Il video arriva in chat (anteprima) e
intero in `02 · Fatti/<cartella>`. Nella cartella torna `beats.json`: se lo correggi e rilanci, il giro
rifà **solo il render** (niente nuova regia). Per rifare la regia da capo cancella `beats.json`.
Workflow: `.github/workflows/documentario.yml`.

## Dal PC
```powershell
node pc\rotolo\rotolo.mjs "C:\percorso\cartella" --nome Nintendo          # 1080
node pc\rotolo\rotolo.mjs "C:\percorso\cartella" --nome Nintendo --4k     # 4K
#  --brief "…"      indicazioni per la regia
#  --rifai-regia    rifà trascrizione e regia anche se ci sono già
#  --solo-render    usa il beats.json della cartella (corretto a mano)
```
Uscita in `out\rotolo\`. Il lavoro sta in `public\collage\rotolo-<nome>\` (non va su git).

## I passi
| Passo | File | Cosa fa |
|---|---|---|
| Trascrizione | `pc/trascrivi.py` (PC) o Groq (server) | parole con i tempi → `parole.json` |
| Regia | `pc/rotolo/regia.mjs` | AI (Claude Code → Gemini → Ollama) scrive `beats.json`; controlla tipi, file e tempi e, se serve, rimanda gli errori all'AI |
| Prepara | `pc/rotolo/prepara.mjs` | proporzioni delle foto, font giapponesi ridotti ai caratteri usati, texture comuni |
| Suoni | `pc/rotolo/eventi.mjs` + `pc/rotolo/suoni.py` | gli eventi sonori escono dalla stessa impaginazione del video; mix voce + SFX + stanza + musica, −14 LUFS |
| Render | `src/Rotolo.tsx` | Remotion, con l'audio già mixato |

Impaginazione, camera ed eventi sonori: `src/rotolo/impagina.ts` (TypeScript puro, lo usano sia Remotion
sia gli script). Grafica: `src/rotolo/pezzi.tsx`.

## Suoni
Da `12 · Risorse/SFX — regista` (variabile `SFX_DIR`): una cartella = un suono, i file dentro sono
varianti a caso. Le cartelle usate sono in `SUONI` dentro `src/rotolo/impagina.ts`.

## beats.json in breve
```json
{ "titolo": "…", "durata": 59.2,
  "apertura": { "t": 0, "fino": 3.5, "elementi": [ … ] },
  "beats": [ { "t": 5.95, "elementi": [ { "tipo": "anno", "testo": "1889" } ] } ],
  "finale": { "t": 52.99, "righe": [ { "testo": "Reinventarsi", "t": 55.55 } ], "timbro": { "testo": "任天堂", "t": 57.2 } },
  "note": [ "dubbi della regia per Denis" ] }
```
Tipi di elemento: `anno`, `titolo`, `kanji`, `macchina`, `nome`, `foto`, `ritaglio`, `carte`, `timbro`, `schede`,
`grafico`, `contatore`, `schema`, `cerchio`. I campi di ognuno sono descritti nel prompt di `pc/rotolo/regia.mjs`
e nel tipo `Elemento` di `src/rotolo/impagina.ts`. `t` = secondo della parola (da `parole.json`).

## Stile Tech (`"mondo": "tech"`)
Stesso motore e stesso beats.json, aspetto da video tech esplicativo (prompt in `12 · Risorse/Prompts/Tech`):
canvas infinito scuro a griglia blueprint con un bus dati e una traccia verso ogni beat, foto in card di vetro
(barra con `etichetta`), numeri enormi, etichette monospace con cursore, `timbro` = badge rosso, `cerchio` =
riquadro che scatta. Tutto ciò che non è il beat attivo scende al 15%. Suoni digitali (`SUONI_TECH`) e musica
`10 Musica/tech`. Dal PC: `--mondo tech`; dal bot: 💻 Tech dopo la cartella. Prima prova: Apple Lisa (04/11/2026).

## Presentatore (tu che parli in camera)
Se nella cartella c'è **un video** invece dell'audio, il video diventa il presentatore: la voce è il suo audio e
il video entra come "lastra" dal basso. Ogni beat ha `"presentatore"`: `meta` (tu sotto, grafica sopra: default),
`intero` (tu a tutto schermo, beat senza elementi: frasi personali) o `nascosto` (solo grafica). La lastra non
taglia al centro: segue il viso (`pc/rotolo/viso.py`, YuNet in `pc/rotolo/modelli/`) e lascia spazio sopra la
testa anche quando si stringe. Il video viene convertito in H.264 8 bit (`presentatore.mp4`) per il render.
Senza modello il viso è fisso (`VISO_FISSO="0.55,0.47"`). Prima prova: Test tech (04/11/2026).

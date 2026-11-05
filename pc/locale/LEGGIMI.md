# Flusso locale (PC di casa + DaVinci)

Montaggio sul PC, separato da Telegram e dal server: niente token, AI locali (Ollama) sulla scheda video.
Un passo alla volta, ognuno si lancia e si controlla da solo. Comandi da `C:\regista`.

**Tutto in un comando** (DaVinci aperto):
```
node pc/locale/documentario.mjs "<video>" "<cartella immagini>" [--mondo tech|rotolo] [--titolo X] [--4k] [--rinomina]
```
Pulizia → immagini → regia → grafica (Remotion) → movimento → suoni (SFX, musica, ambiente) → timeline:
V1 tu (tagliato, che si muove), V2 grafica, A1 voce, A2 sfx, A3 musica (abbassata sotto la voce), A4 ambiente.
Test tech (42 s): 4,6 minuti in tutto. Le AI ragionano a livello "low" (`LOCALE_PENSA=medium` per alzarlo):
con il livello medio la stessa cosa richiedeva oltre 20 minuti, con gli stessi tagli e le stesse immagini.
Il mix in DaVinci non è normalizzato (Test tech: -17 LUFS): per -14 usa Normalize Audio Levels in Fairlight o in Deliver.

| Passo | Comando | Cosa fa | AI |
|---|---|---|---|
| 1. Rinomina | `node pc/locale/rinomina.mjs <cartella> [--applica] [--annulla]` | dà alle immagini il nome `tipo-nome.ext` guardandole | gemma4:12b (vede) |
| 2. Pulizia | `node pc/locale/pulizia.mjs <video>` | trascrive, allinea le parole all'audio, toglie silenzi, ripetizioni, false partenze, autocorrezioni | qwen3.8:27b |
| 3. Immagini | `node pc/locale/immagini.mjs <video>-pulizia <cartella immagini>` | sceglie quali immagini mettere su quali parole → `immagini.json` | qwen3.8:27b |
| 5. Regia | `node pc/locale/regia.mjs <video>-pulizia [--mondo tech\|rotolo] [--titolo X]` | beats.json per Rotolo/Tech: beat dalle immagini, intero/metà con regole, testi dall'AI | qwen3.8:27b |
| 4. Timeline | `.venv\Scripts\python.exe pc/locale/timeline.py <video>-pulizia` | crea in DaVinci la timeline: video originale tagliato su V1, immagini su V2 | — |

## 1. Rinomina
Senza `--applica` propone e basta. `rinomina.json` nella cartella tiene vecchi e nuovi nomi; `--annulla` torna indietro.
L'anno entra nel nome solo se c'era già nel nome del file (quelli "riconosciuti" dall'AI spesso sono inventati).

## 2. Pulizia
Esce `<video>-pulizia/` accanto al video:
- `parole.json` (Whisper), `parole-allineate.json` (tempi precisi: allineamento forzato MMS, `allinea.py`)
- `tagli.json`: `tieni` e `togli` in secondi del file originale, con il motivo di ogni taglio
- `parole-pulite.json`: le parole tenute con i tempi sul video tagliato (per i passi dopo)
- `anteprima.mp4`: 720p tagliato, da ascoltare
Opzioni: `--silenzio 0.6` (pause più lunghe di così si tagliano), `--modello`, `--rifai-ai`, `--senza-ai`.
La risposta dell'AI si riusa finché il testo è lo stesso: rilanciare costa secondi.

Perché l'allineamento: i tempi di Whisper sbagliano fino a 0,3 s nel parlato veloce e i tagli lasciavano
pezzi di sillaba ("Straleni" per "sia Lenin"). Ogni taglio cade a metà dell'aria tra due parole.

## 3. Immagini
Le immagini devono avere nomi parlanti (passo 1). Il codice trova dove il parlato nomina ogni immagine, l'AI sceglie
quali usare e su quale parola (anche sinonimi e descrizioni; negli elenchi tipo "sia Lenin che Hitler" una per nome).
`immagini.json` (file, parola, inizio, durata, motivo) si può correggere a mano prima della timeline.
Durata: fino all'immagine dopo, al massimo 3,5 s (`--max`), almeno 1,2 s. `--pensa low|medium|xhigh|no`: ragionamento
del modello (low: ~3 minuti, medium: ~8).

## 4. Timeline
DaVinci Resolve Studio aperto, Preferenze → Sistema → Generale → *External scripting using: Local*.
Progetto **Regista locale** (o `--progetto`), timeline col nome del video (mai sovrascritta: " 2", " 3"…),
risoluzione e frame rate del video. I tagli si arrotondano ai fotogrammi senza mai entrare nel parlato.
Se c'è `immagini.json` le immagini vanno su V2, ognuna sulla sua parola e con la sua durata (`--senza-immagini` per saltarle).

## Requisiti
- Ollama con `gemma4:12b` e `qwen3.8:27b`
- `.venv` con faster-whisper, `torch==2.8.0` e `torchaudio==2.8.0` (cu128: `--index-url https://download.pytorch.org/whl/cu128`)
- ffmpeg 7+ (usa `-/filter_complex`)

## Grafica Rotolo/Tech sopra il video vero (livelli)
Per i documentari con te in camera: il video resta vero in DaVinci (gradabile), la grafica arriva da Remotion.
1. Livello grafica trasparente (beats.json con `"soloGrafica": true` e `"fps"` del video, es. 30000/1001):
   `npx remotion render src/index.ts Rotolo grafica.mov --props=props.json --codec=prores --prores-profile=4444 --pixel-format=yuva444p10le --image-format=png`
2. Movimento del presentatore (stessa geometria della lastra di Remotion, `geometriaLastra` in `src/rotolo/impagina.ts`):
   `node --experimental-strip-types --no-warnings pc/locale/lastra.mjs beats.json lastra.json --fps 29.97002997`
3. Timeline: `.venv\Scripts\python.exe pc/locale/livelli.py <video> grafica.mov --tagli <video>-pulizia/tagli.json --lastra lastra.json`
   (`--tagli`: V1 e A1 sono il video tagliato del passo 2; senza, il video intero)
   V1 = il video a pezzi (uno per fotogramma nelle transizioni), ognuno con Zoom/Pan/Tilt della pagina Edit; A1 = audio
   intero; V2 = grafica. Verificato con un render da Deliver: inquadratura identica a Remotion.
Note: il Transform in Fusion messo da script NON arriva al render (fotogramma identico all'originale), per questo i pezzi.
Se DaVinci ha già importato un .mov, Remotion non può sovrascriverlo (file bloccato): rendere con un altro nome.

## 5. Regia locale
Beat = le immagini di `immagini.json`, sulla loro parola. Presentatore: metà sui beat con grafica, intero dopo 3,5 s se
la pausa prima del beat dopo supera i 5 s. L'AI scrive solo i testi (etichetta della card, una scritta a macchina o un
badge per beat, al massimo 2 scritte da sole) e il codice scarta quelli che cadrebbero quando la grafica non è in scena.
Il viso (pc/rotolo/viso.py sul video originale) si riporta sui tempi del video tagliato. Esce
`public/collage/locale-<titolo>/beats.json` (con immagini, font e texture) e una copia nella cartella -pulizia.

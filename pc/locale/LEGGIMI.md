# Flusso locale (PC di casa + DaVinci)

Montaggio sul PC, separato da Telegram e dal server: niente token, AI locali (Ollama) sulla scheda video.
Un passo alla volta, ognuno si lancia e si controlla da solo. Comandi da `C:\regista`.

| Passo | Comando | Cosa fa | AI |
|---|---|---|---|
| 1. Rinomina | `node pc/locale/rinomina.mjs <cartella> [--applica] [--annulla]` | dà alle immagini il nome `tipo-nome.ext` guardandole | gemma4:12b (vede) |
| 2. Pulizia | `node pc/locale/pulizia.mjs <video>` | trascrive, allinea le parole all'audio, toglie silenzi, ripetizioni, false partenze, autocorrezioni | qwen3.8:27b |
| 3. Immagini | `node pc/locale/immagini.mjs <video>-pulizia <cartella immagini>` | sceglie quali immagini mettere su quali parole → `immagini.json` | qwen3.8:27b |
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

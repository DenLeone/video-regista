# Campionario Lista UI → DaVinci

Ogni contenitore dello stile **Lista UI** (cartella "No.1", chat, finestra di file, griglia del profilo,
scheda app, pillole) diventa un **video trasparente separato**, più un **progetto DaVinci** già montato.
Ogni pezzo è una clip sua: lo sposti, lo ingrandisci e gli aggiungi le animazioni che vuoi.

## 1. Crearlo (sul PC, da `C:\regista`)
```powershell
cd C:\regista
git pull
node pc\campionario.mjs
```
- Ci mette 1–2 minuti a pezzo. La prima volta Remotion scarica il suo browser (~100 MB).
- Escono in `C:\regista\work\pc\Campionario\`:
  - `01 capitolo.mov` … → il contenitore **animato** (ProRes 4444 con trasparenza);
  - `01 capitolo (fermo).mov` / `.png` → lo stesso **fermo**, da animare tu da zero;
  - `00 fondo crema.mov` → il fondo dello stile;
  - `Campionario Lista UI - DaVinci.fcpxml` → il progetto.
- Un pezzo solo: `node pc\campionario.mjs --solo chat`
- **Testi di prova**: si cambiano in `pc\campionario.json`, poi si rilancia. Il testo è dentro il video:
  in DaVinci non si modifica.

## 2. Aprirlo in DaVinci
1. Nuovo progetto. **Prima di importare**: File → Impostazioni progetto → Risoluzione timeline
   **1080 × 1920** (verticale), **30 fps**.
2. File → Importa → **Timeline** → scegli il file `.fcpxml`. I video li trova da solo.
3. In timeline: V1 = fondo crema, V2 = i contenitori uno dopo l'altro (prima gli animati, poi i fermi).
   Un marcatore all'inizio di ognuno ne dice il nome.
4. Per spostarli: seleziona la clip → **Inspector → Transform** (posizione, zoom, rotazione).
   Per le animazioni: i rombi dei **keyframe** accanto a ogni valore, oppure la pagina **Fusion**.

## 3. Riportare le modifiche nello stile automatico
Quello che fai in DaVinci **non entra da solo** nei montaggi del bot. Le strade sono due:
- **A, la più semplice**: fai lo screenshot o una registrazione dello schermo di com'è venuto e lo dai a
  Claude (o a Claude Code sul PC, vedi sotto). Lui cambia il contenitore nel codice
  (`src/ListaUI.tsx`) e da lì vale per tutti i video.
- **B, l'animazione esatta tua**: esporti il contenitore da DaVinci con la trasparenza (Deliver →
  QuickTime, codec **ProRes 4444**, spunta **Esporta alfa**) e lo metti su Drive in
  `12 · Risorse/Assets/_ASSETS contenitori/ListaUI/<nome>.mov`.
  ⚠️ Il programma **non li usa ancora**: va collegato (chiedilo a Claude). In quel caso il testo del
  contenitore lo aggiunge il programma sopra il tuo video.

## 4. Contenitori modificabili in DaVinci (Titoli Fusion)
I `.mov` del campionario sono "cotti": si spostano ma dentro non si cambiano. I **Titoli Fusion** invece
hanno ogni pezzo separato (cartella, linguetta, numero, titolo) con testo, font, colori e posizione modificabili.
File in `pc\davinci\*.setting`: Capitolo (provato da Denis il 03/11), Chat, App, Finestra, Griglia, Pillola capitolo, Pillola musica. Sono fermi: le animazioni le aggiungi tu.
Tutti tranne Capitolo escono da `node pc\davinci\genera.mjs` (misure in px come in `src/ListaUI.tsx`): per cambiarli, cambia lì e rilancia.

Installarli (DaVinci chiuso):
```powershell
$dir = "$env:APPDATA\Blackmagic Design\DaVinci Resolve\Support\Fusion\Templates\Edit\Titles\Regista"
New-Item -ItemType Directory -Force $dir
Copy-Item "C:\regista\pc\davinci\*.setting" $dir
```
Poi in DaVinci: pagina Edit → Effetti → **Titoli** → sezione **Fusion Titles** → "Lista UI - Capitolo",
trascinalo in timeline sopra il fondo. Nell'Inspector: Numero, Titolo, font, grandezza, colori, posizioni.
Per animare un pezzo: clic destro sul titolo → **Apri in pagina Fusion**.
Sono scritti a mano senza poterli provare in DaVinci: se uno non si apre o è fuori posto, uno screenshot
basta per correggerlo (o lo sistema Claude Code sul PC aprendo il `.setting`, che è testo).

---

## Per Claude Code sul PC di Denis (istruzioni)
Contesto: repo `C:\regista` (= github.com/DenLeone/video-regista, pubblico). Leggi prima `PASSAGGIO.md`.
Denis parla italiano, frasi corte, un passo alla volta, comandi PowerShell esatti da incollare.

**Dove stanno i contenitori**
- `src/ListaUI.tsx`: componenti `Capitolo`, `Chat`, `Finestra`, `Griglia`, `App`, `Pillola`, `Cartella`;
  colori in cima (`CREMA`, `NERO`, `GRIGIO`, `BLU`, `MENTA`); font Montserrat (`FONT`);
  entrate con `appare()` (spring), testo scritto a mano con `scritto()`.
- `Pezzo` (stesso file) = un contenitore da solo su fondo trasparente, composizione `Pezzo` in `src/Root.tsx`.
- Nel montaggio automatico i contenitori li sceglie l'AI (campo `schermate`, regole in
  `scripts/stili/ListaUI.md`, risolte in `scripts/regia.mjs` → `piano.schermate`).

**Per cambiare un contenitore come lo vuole Denis**
1. Modifica il componente in `src/ListaUI.tsx` (posizioni in px su 1080×1920, tempi in fotogrammi a 30 fps).
2. Controlla: `npx --yes -p typescript@5.9.3 tsc -p tsconfig.json --noEmit`
3. Guardalo: `node pc\campionario.mjs --solo <nome>` e apri il `.png` o il `.mov` in `work\pc\Campionario`.
4. Quando Denis è contento: `git add -A; git commit -m "..."; git push` (mai file da `work\`, font,
   musica o loghi: il repo è pubblico).

**Pilotare DaVinci da script (facoltativo)**
- Lo scripting **dall'esterno** (Python che comanda Resolve) è della versione **Studio**. Con la versione
  gratuita gli script si lanciano dalla console interna: Workspace → Console → Py3.
- Su Windows le variabili:
  `RESOLVE_SCRIPT_API=%PROGRAMDATA%\Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting`,
  `RESOLVE_SCRIPT_LIB=C:\Program Files\Blackmagic Design\DaVinci Resolve\fusionscript.dll`,
  `PYTHONPATH=%RESOLVE_SCRIPT_API%\Modules`. La documentazione dell'API è nel README di quella cartella.
- Esempio (importa il campionario in un progetto nuovo verticale):
```python
import DaVinciResolveScript as dvr
resolve = dvr.scriptapp("Resolve")
pm = resolve.GetProjectManager()
proj = pm.CreateProject("Campionario Lista UI") or pm.LoadProject("Campionario Lista UI")
for k, v in {"timelineResolutionWidth": "1080", "timelineResolutionHeight": "1920", "timelineFrameRate": "30"}.items():
    proj.SetSetting(k, v)
proj.GetMediaPool().ImportTimelineFromFile(r"C:\regista\work\pc\Campionario\Campionario Lista UI - DaVinci.fcpxml")
```
- Prima di usare un metodo dell'API controlla che esista nel README della versione installata.

# Passo 9 del flusso locale, prima metà: genera i sottotitoli nativi di DaVinci (italiano) sulla timeline corrente
# e aspetta che ci siano davvero. Poi pc/locale/documentario.mjs lancia auto_captions.py di Denis, che li riusa.
#   .venv\Scripts\python.exe pc/locale/sottotitoli.py [--lingua it|en|auto]
# Perché: CreateSubtitlesFromAudio risponde subito ma scrive la traccia dopo (Test 2: auto_captions.py la cercava
# troppo presto e si fermava con "Nessuna traccia sottotitoli generata", poi la traccia è comparsa con 161 frasi).
import os, sys, time

sys.stdout.reconfigure(encoding='utf-8')
if sys.platform == 'win32':
    os.environ.setdefault('RESOLVE_SCRIPT_API', os.path.join(os.environ.get('PROGRAMDATA', r'C:\ProgramData'), 'Blackmagic Design', 'DaVinci Resolve', 'Support', 'Developer', 'Scripting'))
    os.environ.setdefault('RESOLVE_SCRIPT_LIB', r'C:\Program Files\Blackmagic Design\DaVinci Resolve\fusionscript.dll')
sys.path.append(os.path.join(os.environ['RESOLVE_SCRIPT_API'], 'Modules'))
import DaVinciResolveScript as dvr

lingua = sys.argv[sys.argv.index('--lingua') + 1] if '--lingua' in sys.argv else 'it'
resolve = dvr.scriptapp('Resolve')
if not resolve:
    sys.exit('DaVinci Resolve non risponde')
tl = resolve.GetProjectManager().GetCurrentProject().GetCurrentTimeline()
if not tl:
    sys.exit('nessuna timeline aperta')

def frasi():
    return len(tl.GetItemListInTrack('subtitle', 1) or []) if tl.GetTrackCount('subtitle') else 0

if frasi():
    print(f'[sottotitoli] "{tl.GetName()}": già {frasi()} frasi, le riuso')
    sys.exit(0)
resolve.OpenPage('edit')
opz = {resolve.SUBTITLE_CHARS_PER_LINE: 20, resolve.SUBTITLE_LINE_BREAK: resolve.AUTO_CAPTION_LINE_SINGLE}
if lingua != 'auto':
    opz[resolve.SUBTITLE_LANGUAGE] = {'it': resolve.AUTO_CAPTION_ITALIAN, 'en': resolve.AUTO_CAPTION_ENGLISH}[lingua]
t0 = time.time()
if not tl.CreateSubtitlesFromAudio(opz):
    sys.exit('CreateSubtitlesFromAudio ha fallito (serve Resolve Studio e parlato sulla traccia audio)')
# aspetta che la traccia compaia e smetta di crescere (fino a 5 minuti)
prima, ferma = -1, 0
while time.time() - t0 < 300:
    n = frasi()
    ferma = ferma + 1 if n and n == prima else 0
    if ferma >= 3:
        break
    prima = n
    time.sleep(2)
if not frasi():
    sys.exit('nessun sottotitolo dopo 5 minuti')
print(f'[sottotitoli] "{tl.GetName()}": {frasi()} frasi in {time.time() - t0:.0f} s')

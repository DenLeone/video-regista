# Connessione a DaVinci Resolve per gli script del flusso locale (timeline di Tech, Presentazione, Unboxing, Documentario).
#   from davinci_locale import connetti; resolve = connetti()
# Se DaVinci è chiuso lo apre come un doppio clic sul collegamento del menu Start. Se resta bloccato all'avvio
# (successo 3 volte, Test 3 / Unboxing / Documentario: processo vivo, nessuna finestra, titolo "NVOGLDC invisible",
# scriptapp None per sempre) dopo 2 minuti lo chiude a forza e lo riapre, al massimo due volte.
import os, subprocess, sys, time

LNK = r'C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Blackmagic Design\DaVinci Resolve\DaVinci Resolve.lnk'
EXE = r'C:\Program Files\Blackmagic Design\DaVinci Resolve\Resolve.exe'


def _modulo():
    if sys.platform == 'win32':
        os.environ.setdefault('RESOLVE_SCRIPT_API', os.path.join(os.environ.get('PROGRAMDATA', r'C:\ProgramData'), 'Blackmagic Design', 'DaVinci Resolve', 'Support', 'Developer', 'Scripting'))
        os.environ.setdefault('RESOLVE_SCRIPT_LIB', r'C:\Program Files\Blackmagic Design\DaVinci Resolve\fusionscript.dll')
    sys.path.append(os.path.join(os.environ['RESOLVE_SCRIPT_API'], 'Modules'))
    import DaVinciResolveScript as dvr
    return dvr


def _stato():
    """None se DaVinci è chiuso, altrimenti il titolo della finestra principale ('' o 'NVOGLDC invisible' se bloccato)."""
    r = subprocess.run(['tasklist', '/FI', 'IMAGENAME eq Resolve.exe', '/V', '/FO', 'CSV', '/NH'], capture_output=True, text=True, errors='ignore').stdout
    righe = [x for x in r.splitlines() if 'Resolve.exe' in x]
    if not righe: return None
    return righe[0].rsplit('","', 1)[-1].strip('"')


def _apri():
    print('[davinci] apro DaVinci Resolve', flush=True)
    os.startfile(LNK if os.path.exists(LNK) else EXE)


def connetti(attesa=240, prove=3):
    dvr = _modulo()
    for prova in range(prove):
        if _stato() is None: _apri()
        t0 = time.time()
        while time.time() - t0 < attesa:
            r = dvr.scriptapp('Resolve')
            if r and r.GetProjectManager(): return r
            titolo = _stato()
            if titolo is None: break                          # si è chiuso: si riapre
            # bloccato all'avvio: vivo da più di 2 minuti senza una finestra vera
            if time.time() - t0 > 120 and (not titolo or 'invisible' in titolo.lower() or titolo == 'N/A'):
                print(f'[davinci] bloccato all\'avvio ("{titolo}"): lo chiudo e lo riapro', flush=True)
                subprocess.run(['taskkill', '/F', '/IM', 'Resolve.exe'], capture_output=True)
                time.sleep(5)
                break
            if prova == 0 and time.time() - t0 < 4: print('[davinci] aspetto che DaVinci Resolve risponda…', flush=True)
            time.sleep(3)
    sys.exit('DaVinci Resolve non risponde: aprilo dal menu Start e controlla Preferenze → Sistema → Generale → External scripting using: Local')

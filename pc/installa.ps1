# Installazione del regista sul PC di casa (video YouTube lunghi, tutto in locale).
# Da PowerShell (non serve amministratore, winget chiede conferma da solo quando serve):
#   irm https://raw.githubusercontent.com/DenLeone/video-regista/main/pc/installa.ps1 | iex
# Si può rilanciare quando si vuole: salta quello che c'è già e aggiorna il progetto.
# Cartella del progetto: C:\regista (o $env:REGISTA_DIR).

$ErrorActionPreference = 'Stop'
$dir = if ($env:REGISTA_DIR) { $env:REGISTA_DIR } else { 'C:\regista' }
function Passo($t) { Write-Host "`n== $t" -ForegroundColor Cyan }
function Ok($t) { Write-Host "   ok  $t" -ForegroundColor Green }
function Ko($t) { Write-Host "   !!  $t" -ForegroundColor Yellow }
function Ricarica-Path { $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User') }
function Ce($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

Passo 'Programmi (winget)'
$programmi = @(
  @{ id = 'Git.Git'; cmd = 'git' },
  @{ id = 'OpenJS.NodeJS.LTS'; cmd = 'node' },
  @{ id = 'Gyan.FFmpeg'; cmd = 'ffmpeg' },        # build completa, con NVENC per la 5070 Ti
  @{ id = 'Python.Python.3.12'; cmd = 'python' }
)
foreach ($p in $programmi) {
  if (Ce $p.cmd) { Ok "$($p.cmd) c'è già"; continue }
  winget install --id $p.id -e --accept-source-agreements --accept-package-agreements --silent
  Ricarica-Path
  if (Ce $p.cmd) { Ok "$($p.cmd) installato" } else { Ko "$($p.cmd): installato ma non ancora nel PATH, chiudi e riapri PowerShell e rilancia" }
}

Passo 'Progetto'
if (Test-Path "$dir\.git") { git -C $dir pull --ff-only; Ok "aggiornato in $dir" }
else { git clone https://github.com/DenLeone/video-regista $dir; Ok "scaricato in $dir" }
Push-Location $dir
npm ci --no-audit --no-fund
Ok 'dipendenze del progetto'

Passo 'Trascrizione sulla scheda video (faster-whisper)'
if (-not (Test-Path "$dir\.venv")) { python -m venv "$dir\.venv" }
& "$dir\.venv\Scripts\python.exe" -m pip install -q --upgrade pip
& "$dir\.venv\Scripts\python.exe" -m pip install -q faster-whisper nvidia-cublas-cu12 'nvidia-cudnn-cu12==9.*'
Ok 'faster-whisper e librerie CUDA'

Passo 'Claude Code'
if (Ce 'claude') { Ok "c'è già" } else {
  irm https://claude.ai/install.ps1 | iex
  Ricarica-Path
  if (Ce 'claude') { Ok 'installato (al primo avvio chiede di accedere)' } else { Ko 'installato: chiudi e riapri PowerShell per usarlo' }
}

Passo 'Controlli'
if (Ce 'nvidia-smi') { Ok ((nvidia-smi --query-gpu=name,driver_version --format=csv,noheader) -join ' ') } else { Ko 'nvidia-smi non trovato: aggiorna i driver NVIDIA' }
if ((ffmpeg -hide_banner -encoders 2>$null) -match 'hevc_nvenc') { Ok 'ffmpeg con NVENC (render veloce sulla scheda video)' } else { Ko 'ffmpeg senza NVENC: il render andrà sul processore' }
$g = Get-PSDrive G -ErrorAction SilentlyContinue
if ($g -and (Test-Path 'G:\Il mio Drive')) { Ok 'Google Drive su G:' } else { Ko "Google Drive non trovato su G:\Il mio Drive (serve solo per stili, musica e suoni)" }
Write-Host "   ..  prova della trascrizione (scarica il modello, ~3 GB la prima volta)"
& "$dir\.venv\Scripts\python.exe" "$dir\pc\trascrivi.py" --prova

Pop-Location
Write-Host "`nFatto. Per montare: apri PowerShell in $dir e scrivi  claude" -ForegroundColor Cyan

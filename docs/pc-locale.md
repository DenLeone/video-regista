# Montaggi sul PC di Denis (Windows + WSL)

PC: Intel Core Ultra 7 265K, NVIDIA RTX 5070 Ti, Windows.

Come funziona: sul PC gira un "runner" di GitHub dentro Ubuntu (WSL). Ogni minuto il PC dice al bot
"sono acceso" (`scripts/pc-vivo.sh`). Quando lanci un montaggio dal bot o dall'app:

- PC acceso: il montaggio parte sul PC (`dove=pc`), più veloce;
- PC spento: parte sui server di GitHub, come oggi.

L'AI (regia, stili, trascrizione) resta in cloud: cambiano solo dove si fanno download, preparazione
dei pezzi e render. Tempo stimato per un video come "Ai": da ~18 a ~4–6 minuti.

## 0. Sicurezza (prima di tutto, da GitHub)

Il repository è pubblico. GitHub → **video-regista → Settings → Actions → General** →
"Fork pull request workflows from outside collaborators" → **Require approval for all outside
collaborators** → Save. Così nessun estraneo può far partire codice sul tuo PC con una proposta di
modifica (PR) senza la tua approvazione. I montaggi partono solo da te (bot, app, push).

## 1. Ubuntu dentro Windows (una volta)

PowerShell **come amministratore**:

```powershell
wsl --install -d Ubuntu-24.04
```

Riavvia, apri "Ubuntu 24.04" dal menu Start, scegli nome utente e password.
Il driver NVIDIA di Windows deve essere aggiornato: dentro Ubuntu `nvidia-smi` deve mostrare la 5070 Ti.

## 2. Programmi dentro Ubuntu (una volta)

```bash
sudo apt update
sudo apt install -y ffmpeg fonts-noto-color-emoji libegl1 libgles2 python3-pip jq curl unzip git cron \
  libnss3 libatk1.0-0t64 libatk-bridge2.0-0t64 libcups2t64 libgbm1 libxkbcommon0 libxcomposite1 \
  libxdamage1 libxrandr2 libpango-1.0-0 libcairo2 libasound2t64
curl -fsSL https://rclone.org/install.sh | sudo bash
sudo mkdir -p /mnt/regista && sudo chown "$USER" /mnt/regista
```

## 3. Il runner di GitHub (una volta)

GitHub → **video-regista → Settings → Actions → Runners → New self-hosted runner** → Linux, x64.
Copia in Ubuntu i comandi che GitHub mostra (Download e Configure). Quando `./config.sh` chiede:

- nome del runner: `regista-pc`
- etichette in più (labels): `regista-pc`
- cartella di lavoro: invio (va bene quella proposta)

Poi, sempre nella cartella `actions-runner`, per farlo partire da solo:

```bash
sudo ./svc.sh install
sudo ./svc.sh start
```

## 4. Il segnale "sono acceso" (una volta)

In Ubuntu crea `~/.regista-bot` con gli stessi valori dei secret `NOTIFY_URL` e `NOTIFY_TOKEN` di
GitHub (se non li ricordi: si può creare un token nuovo e metterlo sia su Cloudflare sia su GitHub):

```bash
nano ~/.regista-bot      # due righe: NOTIFY_URL=https://…/notify  e  NOTIFY_TOKEN=…
chmod 600 ~/.regista-bot
curl -fsSL https://raw.githubusercontent.com/DenLeone/video-regista/main/scripts/pc-vivo.sh -o ~/pc-vivo.sh
chmod +x ~/pc-vivo.sh
(crontab -l 2>/dev/null; echo "* * * * * $HOME/pc-vivo.sh") | crontab -
```

Il token non va mai nel repository né in chat.

## 5. Ubuntu acceso con Windows

Windows chiude Ubuntu se nessuna finestra è aperta. Utilità di pianificazione → Crea attività di base
→ "All'accesso" → Avvia programma: `wsl.exe` con argomenti `-d Ubuntu-24.04 -- sleep infinity`
(nelle proprietà: "Esegui indipendentemente dalla connessione dell'utente" e "Nascosta").

## 6. Prova

Scrivi a Claude "fatto": controlla che il runner risulti online e fa un montaggio di prova sul PC.

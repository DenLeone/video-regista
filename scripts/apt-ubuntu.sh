#!/usr/bin/env bash
# Pacchetti piccoli di Ubuntu (libegl per MediaPipe). ffmpeg non passa di qui:
# il 26/10 azure.archive.ubuntu.com ha tenuto apt fermo fino al timeout (run 40337595283).
# Ogni tentativo dura pochi secondi; se un server non risponde si passa al successivo.
# I .deb finiscono in ~/opt/regista-strumenti/apt, così il giro dopo non li riscarica.
set -uo pipefail
if [ "$#" -eq 0 ]; then
  echo "nessun pacchetto"
  exit 0
fi
mancano=()
for p in "$@"; do
  dpkg -s "$p" >/dev/null 2>&1 || mancano+=("$p")
done
if [ "${#mancano[@]}" -eq 0 ]; then
  echo "già installati: $*"
  exit 0
fi
CACHE="${STRUMENTI_DIR:-$HOME/opt/regista-strumenti}/apt"
mkdir -p "$CACHE/partial"
sudo chown -R "$USER" "$CACHE" 2>/dev/null || true
APT="-o Acquire::Retries=2 -o Acquire::http::Timeout=20 -o Acquire::https::Timeout=20 -o Dir::Cache::archives=$CACHE/ -o APT::Sandbox::User=root"
# azure per ultimo: è il server che si è bloccato
for server in archive.ubuntu.com us.archive.ubuntu.com mirrors.kernel.org; do
  sudo sed -i -E "s#https?://[A-Za-z0-9.-]*archive\.ubuntu\.com#http://$server#g; s#https?://security\.ubuntu\.com#http://$server#g" \
    /etc/apt/sources.list.d/ubuntu.sources /etc/apt/sources.list 2>/dev/null || true
  echo "server di Ubuntu: $server (${mancano[*]})"
  if sudo timeout 20 apt-get $APT update -qq && sudo timeout 40 apt-get $APT install -y -qq "${mancano[@]}"; then
    sudo chown -R "$USER" "$CACHE" 2>/dev/null || true
    exit 0
  fi
  echo "$server lento o fermo: provo il prossimo"
done
echo "::warning::pacchetti non installati (${mancano[*]}): mirror di Ubuntu fermi"
exit 1

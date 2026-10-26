#!/usr/bin/env bash
# Pacchetti di Ubuntu per i giri su GitHub (regista.yml, stile.yml). Il 25 e 26/10 l'installazione è
# rimasta appesa per 10 minuti: "apt-get update" interroga anche gli archivi extra dell'immagine di
# GitHub (Microsoft, PPA…) e ne basta uno fermo. Qui si legge SOLO l'archivio di Ubuntu, e se il suo
# server non risponde si passa agli altri server ufficiali, con tempi massimi brevi. Il log dice
# quale passaggio si è fermato.
set -uo pipefail
APT="-o Acquire::Retries=2 -o Acquire::http::Timeout=20 -o Acquire::https::Timeout=20"
SOLO=$(mktemp -d)
[ -s /etc/apt/sources.list.d/ubuntu.sources ] && sudo cp /etc/apt/sources.list.d/ubuntu.sources "$SOLO/ubuntu.sources"
grep -qiE '^deb .*ubuntu\.com' /etc/apt/sources.list 2>/dev/null && sudo cp /etc/apt/sources.list "$SOLO/ubuntu.list"
ls "$SOLO" | sed 's/^/archivi usati: /'
LISTE="-o Dir::Etc::sourcelist=/dev/null -o Dir::Etc::sourceparts=$SOLO"
for server in azure.archive.ubuntu.com archive.ubuntu.com us.archive.ubuntu.com; do
  sudo sed -i -E "s#https?://[a-z.]*archive\.ubuntu\.com#http://$server#g; s#https?://security\.ubuntu\.com#http://$server#g" "$SOLO"/* 2>/dev/null || true
  echo "server di Ubuntu: $server"
  t=$SECONDS
  if ! sudo timeout 120 apt-get $APT $LISTE update -q; then echo "elenco pacchetti fermo dopo $((SECONDS - t)) s: provo il prossimo"; continue; fi
  echo "elenco pacchetti in $((SECONDS - t)) s"
  t=$SECONDS
  if sudo timeout 240 apt-get $APT $LISTE install -y -q "$@" > /tmp/apt-install.log 2>&1; then
    echo "installati in $((SECONDS - t)) s: $*"; exit 0
  fi
  echo "installazione ferma dopo $((SECONDS - t)) s:"; tail -n 5 /tmp/apt-install.log
done
echo "::error::programmi non installati: server di Ubuntu lenti o fermi, riprova tra qualche minuto"
exit 1

#!/usr/bin/env bash
# Pacchetti di Ubuntu per i giri su GitHub (regista.yml, stile.yml). Il server che usa GitHub
# (azure.archive.ubuntu.com) il 25 e 26/10 è rimasto appeso per 10 minuti e il montaggio non partiva:
# se non risponde si passa agli altri server ufficiali di Ubuntu, con tempi massimi brevi.
set -uo pipefail
APT="-o Acquire::Retries=2 -o Acquire::http::Timeout=20 -o Acquire::https::Timeout=20"
for server in azure.archive.ubuntu.com archive.ubuntu.com us.archive.ubuntu.com; do
  # ubuntu.sources (24.04) e sources.list (vecchie immagini): stesso server per i pacchetti e per la sicurezza
  sudo sed -i -E "s#https?://[a-z.]*archive\.ubuntu\.com#http://$server#g; s#https?://security\.ubuntu\.com#http://$server#g" \
    /etc/apt/sources.list.d/ubuntu.sources /etc/apt/sources.list 2>/dev/null || true
  echo "server di Ubuntu: $server"
  sudo timeout 120 apt-get $APT update -qq && sudo timeout 180 apt-get $APT install -y -qq "$@" && exit 0
  echo "$server lento o fermo: provo il prossimo"
done
echo "::error::programmi non installati: tutti i server di Ubuntu lenti o fermi, riprova tra qualche minuto"
exit 1

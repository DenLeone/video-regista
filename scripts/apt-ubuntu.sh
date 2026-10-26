#!/usr/bin/env bash
# Pacchetti di Ubuntu per i giri su GitHub (regista.yml, stile.yml). Il 25 e 26/10 l'installazione è
# rimasta appesa per 10 minuti: il server di Ubuntu che usa GitHub (azure) si piantava a metà dello
# scaricamento dei pacchetti di ffmpeg. Qui si legge SOLO l'archivio di Ubuntu (niente archivi extra
# dell'immagine) e se un server non finisce in tempo si passa agli altri server ufficiali. Il log
# dice quale passaggio si è fermato.
set -uo pipefail
APT="-o Acquire::Retries=2 -o Acquire::http::Timeout=20 -o Acquire::https::Timeout=20"
# l'immagine di GitHub non scrive il server nel file (URIs: mirror+file:/etc/apt/apt-mirrors.txt, che
# porta sempre ad azure): il file con il server lo scriviamo noi, uno per giro
. /etc/os-release
SOLO=$(mktemp -d)
LISTE="-o Dir::Etc::sourcelist=/dev/null -o Dir::Etc::sourceparts=$SOLO"
for server in azure.archive.ubuntu.com archive.ubuntu.com us.archive.ubuntu.com; do
  printf 'Types: deb\nURIs: http://%s/ubuntu/\nSuites: %s %s-updates %s-security\nComponents: main restricted universe multiverse\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n' \
    "$server" "$VERSION_CODENAME" "$VERSION_CODENAME" "$VERSION_CODENAME" > "$SOLO/ubuntu.sources"
  echo "server di Ubuntu: $server ($VERSION_CODENAME)"
  t=$SECONDS
  if ! sudo timeout 120 apt-get $APT $LISTE update -q; then echo "elenco pacchetti fermo dopo $((SECONDS - t)) s: provo il prossimo"; continue; fi
  echo "elenco pacchetti in $((SECONDS - t)) s"
  t=$SECONDS
  if sudo timeout 150 apt-get $APT $LISTE install -y -q "$@" > /tmp/apt-install.log 2>&1; then
    echo "installati in $((SECONDS - t)) s: $*"; exit 0
  fi
  echo "installazione ferma dopo $((SECONDS - t)) s:"; tail -n 5 /tmp/apt-install.log
done
echo "::error::programmi non installati: server di Ubuntu lenti o fermi, riprova tra qualche minuto"
exit 1

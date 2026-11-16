#!/usr/bin/env bash
# muto.sh <comando…> (16/11): il repo è PUBBLICO e i log dei giri li legge chiunque. Qui il comando gira con
# tutto l'output in un registro che va SOLO su Drive (12 · Risorse/_registri); nel log di GitHub passano solo
# fasi, tempi, avvisi ed errori (righe brevi, mai trascrizioni, descrizioni o testi dei video).
# Uscita: quella del comando.
set -o pipefail
mkdir -p work
pezzo="${PEZZO:+-pezzo${PEZZO%%/*}}"
REG="work/registro-${GITHUB_WORKFLOW:-giro}-${GITHUB_RUN_ID:-0}-${GITHUB_RUN_ATTEMPT:-1}-${GITHUB_JOB:-job}${pezzo}${DOC_FASE:+-$DOC_FASE}.txt"
REG="${REG// /_}"
"$@" 2>&1 | tee -a "$REG" \
  | grep --line-buffered -E '\[fase\]|\] tempi:|\] fatto|##\[|::(error|warning)|Error:|ERRORE|[Nn]on riuscit|[Ff]allit|HTTP [0-9]{3}|exit code' \
  | cut -c1-200
stato=${PIPESTATUS[0]}
dove="${DIR_REGISTRI:-12 · Risorse/_registri}"
if command -v rclone >/dev/null 2>&1 && rclone copyto "$REG" "${REGISTA_REMOTE:-gdrive}:$dove/$(basename "$REG")" >/dev/null 2>&1; then
  echo "registro completo su Drive: $dove/$(basename "$REG")"
else
  echo "registro completo non salvato su Drive"
fi
exit "$stato"

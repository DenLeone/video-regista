#!/usr/bin/env bash
# muto.sh <comando…> (16/11): il repo è PUBBLICO e i log dei giri li legge chiunque. Qui il comando gira con
# tutto l'output in un registro che va SOLO su Drive (12 · Risorse/_registri); nel log di GitHub passano solo
# fasi, tempi, avvisi ed errori (righe brevi, mai trascrizioni, descrizioni o testi dei video).
# Uscita: quella del comando.
set -o pipefail
# fuori da work/: il Regista la svuota all'inizio (16/11: il registro spariva e non arrivava su Drive)
_MUTO_DIR="${RUNNER_TEMP:-/tmp}/registri"  # MAI «CARTELLA»: è la variabile del Regista (16/11: la sovrascriveva)
mkdir -p "$_MUTO_DIR"
_muto_pezzo="${PEZZO:+-pezzo${PEZZO%%/*}}"
_MUTO_REG="$_MUTO_DIR/registro-${GITHUB_WORKFLOW:-giro}-${GITHUB_RUN_ID:-0}-${GITHUB_RUN_ATTEMPT:-1}-${GITHUB_JOB:-job}${_muto_pezzo}${DOC_FASE:+-$DOC_FASE}.txt"
_MUTO_REG="$_MUTO_DIR/$(basename "$_MUTO_REG" | tr ' ' '_')"
"$@" 2>&1 | tee -a "$_MUTO_REG" \
  | grep --line-buffered -E '\[fase\]|\] tempi:|\] fatto|##\[|::(error|warning)|Error:|ERRORE|[Nn]on riuscit|[Ff]allit|HTTP [0-9]{3}|exit code' \
  | cut -c1-200
_muto_stato=${PIPESTATUS[0]}
_muto_dove="${DIR_REGISTRI:-12 · Risorse/_registri}"
if command -v rclone >/dev/null 2>&1 && rclone copyto "$_MUTO_REG" "${REGISTA_REMOTE:-gdrive}:$_muto_dove/$(basename "$_MUTO_REG")" >/dev/null 2>&1; then
  echo "registro completo su Drive: $_muto_dove/$(basename "$_MUTO_REG")"
else
  echo "registro completo non salvato su Drive"
fi
exit "$_muto_stato"

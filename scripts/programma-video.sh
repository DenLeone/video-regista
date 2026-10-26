#!/usr/bin/env bash
# Prima il ffmpeg GPL in cache (GitHub, di solito 4–40 s). Apt di Ubuntu solo se quel ffmpeg
# non parte, oppure per i pacchetti passati qui che dpkg non ha già.
# scripts/apt-ubuntu.sh non si modifica. Se apt fallisce su emoji o libegl, il giro continua:
# il ritaglio della persona (MediaPipe) è facoltativo, la regia no.
# Uso: bash scripts/programma-video.sh [pacchetto apt...]
set -uo pipefail
QUI=$(cd "$(dirname "$0")" && pwd)

bash "$QUI/installa-strumenti.sh" || echo "::warning::strumenti in cache incompleti (font o pip): si continua se ffmpeg c'è"

if ! bash "$QUI/ffmpeg-pronto.sh"; then
  echo "[strumenti] ffmpeg da GitHub non pronto: fallback apt"
  if ! bash "$QUI/apt-ubuntu.sh" ffmpeg; then
    echo "::error::ffmpeg non installato (cache GitHub e server di Ubuntu)"
    exit 1
  fi
  if ! bash "$QUI/ffmpeg-pronto.sh"; then
    echo "::error::ffmpeg installato ma senza arnndn, vidstab, loudnorm o libass"
    exit 1
  fi
else
  echo "[strumenti] ffmpeg pronto (arnndn, vidstab, loudnorm, libass): niente apt per ffmpeg"
fi

mancanti=()
for p in "$@"; do
  if [ "$p" = "fonts-dejavu-core" ] && [ -f /usr/share/fonts/truetype/dejavu/DejaVuSans.ttf ]; then
    echo "[strumenti] DejaVu già sul disco, niente apt"
    continue
  fi
  if dpkg -s "$p" >/dev/null 2>&1; then
    echo "[strumenti] $p già installato"
  else
    mancanti+=("$p")
  fi
done
if [ ${#mancanti[@]} -gt 0 ]; then
  # due minuti in tutto: se il server di Ubuntu è fermo non si bruciano i 16 minuti dello step
  echo "[strumenti] apt solo per: ${mancanti[*]} (massimo 2 minuti)"
  timeout 120 bash "$QUI/apt-ubuntu.sh" "${mancanti[@]}" \
    || echo "::warning::apt non ha installato ${mancanti[*]}: emoji o ritaglio della persona assenti, il montaggio continua"
fi

#!/usr/bin/env bash
# Gira solo se la variabile USA_IMMAGINE è 1 e il job è dentro l'immagine.
# Non installa nulla: aggancia i pacchetti e il browser già presenti e controlla
# che ffmpeg, i font e Python ci siano. Se manca un pezzo, esce 1 (errore del
# server: il workflow regista rilancia una volta, poi avvisa).
set -euo pipefail

echo "[immagine] collego i pacchetti già nell'immagine"
if [ ! -d /opt/regista-npm/node_modules/remotion ]; then
  echo "::error::l'immagine non ha i pacchetti npm in /opt/regista-npm"
  exit 1
fi
if [ -z "${GITHUB_WORKSPACE:-}" ]; then
  echo "::error::GITHUB_WORKSPACE vuoto: questo script va nei workflow"
  exit 1
fi
# il checkout ha appena scritto il codice: node_modules non c'è ancora.
# Si toglie solo il collegamento nel workspace, mai la cartella dell'immagine.
rm -rf "${GITHUB_WORKSPACE}/node_modules"
ln -sfn /opt/regista-npm/node_modules "${GITHUB_WORKSPACE}/node_modules"

# Remotion 4 tiene Chrome in node_modules/.remotion, quindi viaggia col collegamento.
# Se una build l'avesse messo a parte, lo si aggancia lo stesso alla home del job
# (su GitHub è /github/home, non /root).
if [ -d /opt/remotion-cache ]; then
  mkdir -p "${HOME:-/root}/.cache"
  ln -sfn /opt/remotion-cache "${HOME:-/root}/.cache/remotion"
fi

manca=0
serve() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "::error::nell'immagine manca $1"
    manca=1
  fi
}
serve ffmpeg
serve ffprobe
serve node
serve npm
serve rclone
serve python3
serve scenedetect
serve auto-editor

if ! ffmpeg -hide_banner -filters 2>/dev/null | grep -Eq '(^|[[:space:]])arnndn([[:space:]]|$)'; then
  echo "::error::ffmpeg dell'immagine senza arnndn"
  manca=1
fi
for nome in vidstabdetect loudnorm libvmaf; do
  if ! ffmpeg -hide_banner -filters 2>/dev/null | grep -Eq "(^|[[:space:]])${nome}([[:space:]]|$)"; then
    echo "::error::ffmpeg dell'immagine senza ${nome}"
    manca=1
  fi
done
if ! ffmpeg -hide_banner -filters 2>/dev/null | grep -Eq '(^|[[:space:]])ass([[:space:]]|$)'; then
  echo "::error::ffmpeg dell'immagine senza libass (filtro ass)"
  manca=1
fi
scenedetect --version >/dev/null 2>&1 || { echo "::error::scenedetect non risponde"; manca=1; }
auto-editor --version >/dev/null 2>&1 || { echo "::error::auto-editor non risponde"; manca=1; }
fc-list : family | grep -qi montserrat || { echo "::error::font Montserrat assente nell'immagine"; manca=1; }
python3 -c 'import telethon, cv2' >/dev/null 2>&1 || { echo "::error::Telethon o opencv assenti nell'immagine"; manca=1; }
if [ ! -d "${GITHUB_WORKSPACE}/node_modules/.remotion" ] && [ ! -d "${HOME:-/root}/.cache/remotion" ]; then
  echo "::error::browser di Remotion assente nell'immagine"
  manca=1
fi

echo "node $(node -v) · $(ffmpeg -version | head -1)"
echo "[immagine] pronta"
exit "$manca"

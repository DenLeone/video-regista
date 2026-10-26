#!/usr/bin/env bash
# Strumenti del montaggio, senza restare appesi ai mirror di Ubuntu.
# Il 26/10 lo step Dipendenze (run 40337595283) è morto dopo 10 minuti: apt non finiva
# di scaricare ffmpeg da azure.archive.ubuntu.com. Qui ffmpeg è una build GPL statica
# (BtbN 8.1: arnndn, loudnorm, vidstab, libass, e anche rubberband e libvmaf), i font e
# i pacchetti pip stanno in ~/opt/regista-strumenti. actions/cache la tiene: al giro
# dopo non si riscarica niente. Nessun Demucs e niente che chieda una GPU.
# Il montaggio non viene cambiato: questi programmi devono solo essere nel PATH.
set -euo pipefail

DIR="${STRUMENTI_DIR:-$HOME/opt/regista-strumenti}"
# build condivisa: i binari statici sono 165 MB l'uno e triplicano la cache
FFMPEG_URL="${FFMPEG_URL:-https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-n8.1-latest-linux64-gpl-shared-8.1.tar.xz}"
INIZIO=$(date +%s)
mkdir -p "$DIR/ffmpeg" "$DIR/fonts" "$DIR/pip"
log() { echo "[strumenti] $*"; }

scarica() {
  local url="$1" dest="$2"
  curl -fL --retry 3 --retry-all-errors --retry-delay 2 --connect-timeout 15 --max-time 180 -o "$dest" "$url"
}

# righe di `ffmpeg -filters`: il nome del filtro è la seconda colonna
ha_filtri() {
  local b="$1" elenco
  [ -x "$b" ] || return 1
  elenco="$("$b" -hide_banner -filters 2>/dev/null || true)"
  grep -Eq '(^|[[:space:]])arnndn([[:space:]]|$)' <<<"$elenco" \
    && grep -Eq '(^|[[:space:]])vidstabdetect([[:space:]]|$)' <<<"$elenco" \
    && grep -Eq '(^|[[:space:]])loudnorm([[:space:]]|$)' <<<"$elenco" \
    && grep -Eq '(^|[[:space:]])ass([[:space:]]|$)' <<<"$elenco"
}

FFBIN="$DIR/ffmpeg/bin/ffmpeg"
if ha_filtri "$FFBIN"; then
  log "ffmpeg già in cache ($("$FFBIN" -version | head -1))"
else
  log "scarico ffmpeg (solo la prima volta)"
  archivio="$DIR/ffmpeg.tar.xz"
  scarica "$FFMPEG_URL" "$archivio"
  rm -rf "$DIR/ffmpeg"
  mkdir -p "$DIR/ffmpeg"
  tar -xJf "$archivio" -C "$DIR/ffmpeg" --strip-components=1
  rm -f "$archivio"
  ha_filtri "$FFBIN" || { echo "::error::la build di ffmpeg non ha arnndn, vidstab, loudnorm o libass"; exit 1; }
fi
# via ffplay, manuali e la cache di pip: non servono al montaggio e appesantiscono il giro dopo
rm -rf "$DIR/ffmpeg/doc" "$DIR/ffmpeg/man" "$DIR/ffmpeg/include" "$DIR/ffmpeg/presets" "$DIR/ffmpeg/bin/ffplay" "$DIR/pip"

sudo ln -sfn "$FFBIN" /usr/local/bin/ffmpeg
sudo ln -sfn "$DIR/ffmpeg/bin/ffprobe" /usr/local/bin/ffprobe
if [ -d "$DIR/ffmpeg/lib" ]; then
  echo "$DIR/ffmpeg/lib" | sudo tee /etc/ld.so.conf.d/regista-ffmpeg.conf >/dev/null
  sudo ldconfig
  if [ -n "${GITHUB_ENV:-}" ]; then
    echo "LD_LIBRARY_PATH=$DIR/ffmpeg/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}" >> "$GITHUB_ENV"
  fi
fi
if [ -n "${GITHUB_PATH:-}" ]; then echo "$DIR/ffmpeg/bin" >> "$GITHUB_PATH"; fi

# il filtro arnndn c'è nella build; senza un modello non toglie il rumore della voce
MODELLO="$DIR/ffmpeg/arnndn/std.rnnn"
if [ ! -s "$MODELLO" ]; then
  mkdir -p "$(dirname "$MODELLO")"
  scarica "https://github.com/richardpl/arnndn-models/raw/master/std.rnnn" "$MODELLO" \
    || log "modello arnndn non scaricato: il filtro resta disponibile"
fi
if [ -s "$MODELLO" ]; then
  sudo mkdir -p /usr/local/share/ffmpeg
  sudo ln -sfn "$MODELLO" /usr/local/share/ffmpeg/std.rnnn
  log "modello denoise voce: /usr/local/share/ffmpeg/std.rnnn"
fi

# Montserrat è il font degli stili. Di riserva: Liberation, e DejaVu nel percorso
# che scripts/regista.mjs e scripts/laboratorio.mjs cercano già.
if [ ! -s "$DIR/fonts/Montserrat[wght].ttf" ]; then
  log "scarico Montserrat e i font di riserva"
  scarica "https://github.com/google/fonts/raw/main/ofl/montserrat/Montserrat%5Bwght%5D.ttf" "$DIR/fonts/Montserrat[wght].ttf"
  scarica "https://github.com/google/fonts/raw/main/ofl/montserrat/Montserrat-Italic%5Bwght%5D.ttf" "$DIR/fonts/Montserrat-Italic[wght].ttf" \
    || log "Montserrat corsivo non scaricato: il romano c'è"
  if [ ! -f /usr/share/fonts/truetype/dejavu/DejaVuSans.ttf ] && [ ! -s "$DIR/fonts/DejaVuSans.ttf" ]; then
    if scarica "https://github.com/dejavu-fonts/dejavu-fonts/releases/download/version_2_37/dejavu-fonts-ttf-2.37.tar.bz2" "$DIR/fonts/dejavu.tar.bz2"; then
      tar -xjf "$DIR/fonts/dejavu.tar.bz2" -C "$DIR/fonts" --wildcards --no-anchored 'DejaVuSans.ttf' --wildcards --no-anchored 'DejaVuSans-Bold.ttf'
      find "$DIR/fonts" -name 'DejaVuSans*.ttf' -exec cp -n {} "$DIR/fonts/" \;
      rm -f "$DIR/fonts/dejavu.tar.bz2"
    else
      log "DejaVu non scaricato"
    fi
  fi
else
  log "font già in cache"
fi
# Source Sans 3 è la riserva sans. Liberation, se c'è già sul sistema, si copia in cache.
if [ ! -s "$DIR/fonts/SourceSans3[wght].ttf" ]; then
  scarica "https://github.com/google/fonts/raw/main/ofl/sourcesans3/SourceSans3%5Bwght%5D.ttf" "$DIR/fonts/SourceSans3[wght].ttf" \
    || log "Source Sans non scaricato: restano Montserrat e DejaVu"
fi
if [ ! -e "$DIR/fonts/LiberationSans-Regular.ttf" ] && [ -f /usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf ]; then
  cp -n /usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf \
    /usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf "$DIR/fonts/" 2>/dev/null || true
fi
sudo mkdir -p /usr/local/share/fonts/regista /usr/share/fonts/truetype/dejavu
sudo cp -a "$DIR/fonts/." /usr/local/share/fonts/regista/
if [ ! -f /usr/share/fonts/truetype/dejavu/DejaVuSans.ttf ]; then
  trovato=$(find "$DIR/fonts" -name 'DejaVuSans.ttf' -print -quit || true)
  if [ -n "$trovato" ]; then sudo cp -n "$(dirname "$trovato")"/DejaVuSans*.ttf /usr/share/fonts/truetype/dejavu/; fi
fi
if [ ! -f /usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf ]; then
  trovato=$(find "$DIR/fonts" -name 'DejaVuSans-Bold.ttf' -print -quit || true)
  if [ -n "$trovato" ]; then sudo cp -n "$trovato" /usr/share/fonts/truetype/dejavu/; fi
fi
sudo fc-cache -f >/dev/null || true

# PySceneDetect con OpenCV headless (niente finestra) e auto-editor. Il venv è nella
# cartella in cache: al giro dopo i comandi ci sono già e pip non riparte.
export PATH="$DIR/bin:/usr/local/bin:$PATH"
if [ -x "$DIR/venv/bin/scenedetect" ] && [ -x "$DIR/venv/bin/auto-editor" ]; then
  log "PySceneDetect e auto-editor già in cache"
else
  log "installo PySceneDetect e auto-editor"
  if [ ! -x "$DIR/venv/bin/python" ]; then
    rm -rf "$DIR/venv"
    python3 -m venv "$DIR/venv" || { bash "$(dirname "$0")/apt-ubuntu.sh" python3-venv && rm -rf "$DIR/venv" && python3 -m venv "$DIR/venv"; }
  fi
  "$DIR/venv/bin/pip" install --disable-pip-version-check --cache-dir "$DIR/pip" \
    'scenedetect>=0.6,<0.7' opencv-python-headless 'auto-editor'
  # opencv con GUI non serve e pesa: se un extra lo ha tirato dentro, via
  "$DIR/venv/bin/pip" uninstall -y opencv-python >/dev/null 2>&1 || true
fi
# PySceneDetect 0.6 non accetta --version (è il comando `version`): il controllo
# chiesto da Denis passa lo stesso.
mkdir -p "$DIR/bin"
cat > "$DIR/bin/scenedetect" << EOF
#!/bin/bash
if [ "\${1:-}" = "--version" ] || [ "\${1:-}" = "-V" ]; then
  exec "$DIR/venv/bin/scenedetect" version
fi
exec "$DIR/venv/bin/scenedetect" "\$@"
EOF
chmod +x "$DIR/bin/scenedetect"
sudo ln -sfn "$DIR/bin/scenedetect" /usr/local/bin/scenedetect
sudo ln -sfn "$DIR/venv/bin/auto-editor" /usr/local/bin/auto-editor
# il primo avvio di auto-editor scarica il binario dentro il venv: così finisce in cache
"$DIR/venv/bin/auto-editor" --version >/dev/null
rm -rf "$DIR/pip"
if [ -n "${GITHUB_PATH:-}" ]; then
  echo "$DIR/venv/bin" >> "$GITHUB_PATH"
  echo "$DIR/bin" >> "$GITHUB_PATH"
fi
hash -r

# MediaPipe (ritaglio della persona) vuole libEGL. Sul runner di GitHub c'è già con Chrome.
# Se manca, un tentativo breve: se i mirror sono fermi il montaggio parte lo stesso.
if ldconfig -p 2>/dev/null | grep -q 'libEGL.so'; then
  log "libEGL già presente"
elif [ "${STRUMENTI_SENZA_APT:-}" = "1" ]; then
  log "libEGL assente, apt saltato"
else
  bash "$(dirname "$0")/apt-ubuntu.sh" libegl1 libgles2 \
    || log "libEGL non installato: il ritaglio della persona può saltare, il montaggio no"
fi

echo "--- controllo ---"
ffmpeg -hide_banner -filters | grep -E 'arnndn|vidstab|loudnorm|\bass\b' || true
scenedetect --version
auto-editor --version
fc-list : family | grep -i -E 'montserrat|liberation|dejavu' | sort -u || true
manca=0
elenco="$(ffmpeg -hide_banner -filters 2>/dev/null || true)"
for nome in arnndn vidstabdetect vidstabtransform loudnorm; do
  grep -Eq "(^|[[:space:]])$nome([[:space:]]|$)" <<<"$elenco" || { echo "::error::ffmpeg senza $nome"; manca=1; }
done
grep -Eq '(^|[[:space:]])ass([[:space:]]|$)' <<<"$elenco" || { echo "::error::ffmpeg senza libass (filtro ass)"; manca=1; }
scenedetect --version >/dev/null || manca=1
auto-editor --version >/dev/null || manca=1
fc-list : family | grep -qi montserrat || { echo "::error::font Montserrat assente"; manca=1; }
if grep -Eq '(^|[[:space:]])libvmaf([[:space:]]|$)' <<<"$elenco"; then log "libvmaf presente"; fi
log "fatti in $(( $(date +%s) - INIZIO )) s"
exit "$manca"

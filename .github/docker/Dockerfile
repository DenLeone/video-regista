# Immagine dei giri regista / stile / laboratorio.
# Ubuntu 24.04, strumenti già dentro, nessun secret: il codice e rclone.conf
# arrivano a ogni giro. Si pubblica solo col workflow «immagine».
# I giri non la usano finché la variabile USA_IMMAGINE non è 1.
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive \
    LANG=C.UTF-8 \
    USER=root \
    PATH="/opt/regista-bin:/opt/regista-python/bin:/opt/ffmpeg/bin:/usr/local/bin:${PATH}" \
    LD_LIBRARY_PATH="/opt/ffmpeg/lib" \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Librerie di Chrome (nomi t64 di Ubuntu 24.04: i pacchetti senza t64 non ci sono più),
# font, git/jq per i workflow, sudo perché gli script del giro lo chiamano.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl xz-utils tar unzip git jq sudo fontconfig \
      python3 python3-venv python3-pip \
      libegl1 libgles2 \
      fonts-noto-color-emoji fonts-dejavu-core fonts-liberation \
      libnss3 libnspr4 libdbus-1-3 \
      libatk1.0-0t64 libatk-bridge2.0-0t64 libcups2t64 \
      libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
      libgbm1 libasound2t64 libpango-1.0-0 libcairo2 libxshmfence1 \
      libx11-6 libx11-xcb1 libxcb1 libxext6 libglib2.0-0t64 libgtk-3-0t64 libvulkan1 \
    && rm -rf /var/lib/apt/lists/*

# Node 22, la stessa linea dei workflow (setup-node 22).
ARG NODE_VERSION=22.23.4
RUN curl -fsSL -o /tmp/node.tar.xz "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" \
    && tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 \
    && rm -f /tmp/node.tar.xz \
    && node -v && npm -v

# Stessa build condivisa di scripts/installa-strumenti.sh: arnndn, loudnorm,
# vidstab, libass, libvmaf. I binari statici pesano il triplo.
ARG FFMPEG_URL=https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-n8.1-latest-linux64-gpl-shared-8.1.tar.xz
RUN curl -fL --retry 3 --retry-all-errors --retry-delay 2 -o /tmp/ffmpeg.tar.xz "$FFMPEG_URL" \
    && mkdir -p /opt/ffmpeg \
    && tar -xJf /tmp/ffmpeg.tar.xz -C /opt/ffmpeg --strip-components=1 \
    && rm -rf /opt/ffmpeg/doc /opt/ffmpeg/man /opt/ffmpeg/include /opt/ffmpeg/presets /opt/ffmpeg/bin/ffplay /tmp/ffmpeg.tar.xz \
    && echo /opt/ffmpeg/lib > /etc/ld.so.conf.d/regista-ffmpeg.conf \
    && ldconfig \
    && ln -sfn /opt/ffmpeg/bin/ffmpeg /usr/local/bin/ffmpeg \
    && ln -sfn /opt/ffmpeg/bin/ffprobe /usr/local/bin/ffprobe \
    && mkdir -p /usr/local/share/ffmpeg \
    && curl -fL --retry 3 --retry-all-errors -o /usr/local/share/ffmpeg/std.rnnn \
         https://github.com/richardpl/arnndn-models/raw/master/std.rnnn

# Montserrat e Source Sans 3 non sono pacchetti di Ubuntu.
RUN mkdir -p /usr/local/share/fonts/regista \
    && curl -fL --retry 3 --retry-all-errors -o '/usr/local/share/fonts/regista/Montserrat[wght].ttf' \
         'https://github.com/google/fonts/raw/main/ofl/montserrat/Montserrat%5Bwght%5D.ttf' \
    && curl -fL --retry 3 --retry-all-errors -o '/usr/local/share/fonts/regista/Montserrat-Italic[wght].ttf' \
         'https://github.com/google/fonts/raw/main/ofl/montserrat/Montserrat-Italic%5Bwght%5D.ttf' \
    && curl -fL --retry 3 --retry-all-errors -o '/usr/local/share/fonts/regista/SourceSans3[wght].ttf' \
         'https://github.com/google/fonts/raw/main/ofl/sourcesans3/SourceSans3%5Bwght%5D.ttf' \
    && fc-cache -f

# rclone e gh (il rilancio del workflow, dentro al container, non ha il gh del runner).
ARG GH_VERSION=2.67.0
RUN curl -fsSL https://rclone.org/install.sh | bash \
    && curl -fL --retry 3 --retry-all-errors -o /tmp/gh.tar.gz \
         "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_linux_amd64.tar.gz" \
    && tar -xzf /tmp/gh.tar.gz -C /tmp \
    && install -m 0755 /tmp/gh_${GH_VERSION}_linux_amd64/bin/gh /usr/local/bin/gh \
    && rm -rf /tmp/gh.tar.gz /tmp/gh_${GH_VERSION}_linux_amd64 \
    && rclone version && gh --version

# PySceneDetect, opencv headless, auto-editor, Telethon e cryptg.
# I compilatori servono solo a cryptg e si tolgono nello stesso strato.
RUN apt-get update && apt-get install -y --no-install-recommends gcc g++ python3-dev libffi-dev \
    && python3 -m venv /opt/regista-python \
    && /opt/regista-python/bin/pip install --no-cache-dir --disable-pip-version-check \
         'scenedetect>=0.6,<0.7' opencv-python-headless 'auto-editor' telethon cryptg \
    && { /opt/regista-python/bin/pip uninstall -y opencv-python >/dev/null 2>&1 || true; } \
    && mkdir -p /opt/regista-bin \
    && printf '%s\n' \
         '#!/bin/bash' \
         'if [ "${1:-}" = "--version" ] || [ "${1:-}" = "-V" ]; then' \
         '  exec /opt/regista-python/bin/scenedetect version' \
         'fi' \
         'exec /opt/regista-python/bin/scenedetect "$@"' \
         > /opt/regista-bin/scenedetect \
    && chmod 0755 /opt/regista-bin/scenedetect \
    && ln -sfn /opt/regista-bin/scenedetect /usr/local/bin/scenedetect \
    && ln -sfn /opt/regista-python/bin/auto-editor /usr/local/bin/auto-editor \
    && /opt/regista-python/bin/auto-editor --version \
    && apt-get purge -y gcc g++ python3-dev libffi-dev \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/* /root/.cache

# Pacchetti del repo e browser di Remotion. Il checkout del giro sovrascrive
# la cartella di lavoro: i workflow collegano node_modules con collega-immagine.sh.
WORKDIR /opt/regista-npm
COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
    && node --input-type=module -e "import { ensureBrowser } from '@remotion/renderer'; await ensureBrowser();" \
    && test -d node_modules/.remotion \
    && npm cache clean --force

LABEL org.opencontainers.image.source="https://github.com/DenLeone/video-regista" \
      org.opencontainers.image.description="Runner di regista, stile e laboratorio. Nessun secret." \
      org.opencontainers.image.licenses="UNLICENSED"

# Se manca un filtro o il browser, la pubblicazione fallisce: meglio qui che a metà video.
RUN set -euo pipefail \
    && elenco="$(ffmpeg -hide_banner -filters)" \
    && for nome in arnndn vidstabdetect loudnorm ass libvmaf; do \
         grep -Eq "(^|[[:space:]])${nome}([[:space:]]|$)" <<<"$elenco"; \
       done \
    && test -s /usr/local/share/ffmpeg/std.rnnn \
    && scenedetect --version \
    && auto-editor --version \
    && node -v \
    && rclone version \
    && gh --version \
    && python3 -c 'import telethon, cv2, cryptg' \
    && fc-list : family | grep -qi montserrat \
    && fc-list : family | grep -qi 'source sans 3' \
    && fc-list : family | grep -qi 'noto color emoji' \
    && test -d /opt/regista-npm/node_modules/remotion \
    && test -d /opt/regista-npm/node_modules/.remotion \
    && chrome="$(find /opt/regista-npm/node_modules/.remotion -type f -name 'chrome-headless-shell' -print -quit)" \
    && test -n "$chrome" \
    && "$chrome" --version

WORKDIR /github/workspace

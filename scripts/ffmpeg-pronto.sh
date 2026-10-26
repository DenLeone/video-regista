#!/usr/bin/env bash
# 0 se ffmpeg e ffprobe ci sono e hanno i filtri del montaggio (arnndn, vidstab, loudnorm, libass).
# libvmaf non è richiesto: il pacchetto di Ubuntu non ce l'ha, la build in cache sì.
set -uo pipefail
command -v ffmpeg >/dev/null 2>&1 && command -v ffprobe >/dev/null 2>&1 || exit 1
ffprobe -version >/dev/null 2>&1 || exit 1
elenco="$(ffmpeg -hide_banner -filters 2>/dev/null || true)"
for nome in arnndn vidstabdetect vidstabtransform loudnorm; do
  grep -Eq "(^|[[:space:]])$nome([[:space:]]|$)" <<<"$elenco" || exit 1
done
grep -Eq '(^|[[:space:]])ass([[:space:]]|$)' <<<"$elenco" || exit 1
exit 0

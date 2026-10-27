#!/usr/bin/env bash
# Sul PC di Denis (WSL): dice al bot "sono acceso" ogni minuto, ma solo se il runner di GitHub è in
# ascolto. Il bot manda i montaggi al PC se l'ultimo segnale ha meno di 3 minuti, sennò a GitHub.
# Lo avvia cron (docs/pc-locale.md). Indirizzo e token del bot stanno in ~/.regista-bot, scritti da
# Denis: NOTIFY_URL=… e NOTIFY_TOKEN=… (gli stessi dei secret di GitHub). Non vanno nel repository.
set -u
. "$HOME/.regista-bot" 2>/dev/null || exit 0
[ -n "${NOTIFY_URL:-}" ] && [ -n "${NOTIFY_TOKEN:-}" ] || exit 0
pgrep -f Runner.Listener >/dev/null || exit 0
curl -s -m 10 -X POST "${NOTIFY_URL%/notify}/pc-vivo" -H "x-regista-token: $NOTIFY_TOKEN" > /dev/null || true

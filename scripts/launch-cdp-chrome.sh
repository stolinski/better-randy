#!/usr/bin/env bash
# Start (or confirm) the flag-enabled Chrome for canvas verification.
# Supers renders via WICG HTML-in-Canvas, which requires
# --enable-blink-features=CanvasDrawElement; an unflagged browser captures a
# BLANK canvas. This is the one sanctioned way to get the CDP-port-9223 Chrome
# that scripts/cdp-*.mjs, probe-pack-diff, and the Critic harness drive.
# Idempotent: if a Chrome already answers on the port, it is left alone.
set -euo pipefail

PORT="${CDP_PORT:-9223}"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PROFILE="/tmp/supers-chrome-${PORT}"

if curl -fsS --max-time 2 "http://localhost:${PORT}/json/version" >/dev/null 2>&1; then
	echo "Flag-enabled Chrome already running on CDP port ${PORT} — using it."
	exit 0
fi

if [[ ! -x "$CHROME" ]]; then
	echo "Google Chrome not found at: $CHROME" >&2
	exit 1
fi

nohup "$CHROME" \
	--remote-debugging-port="${PORT}" \
	--user-data-dir="${PROFILE}" \
	--enable-blink-features=CanvasDrawElement \
	--enable-unsafe-webgpu \
	--no-first-run \
	--no-default-browser-check \
	about:blank >/dev/null 2>&1 &

for _ in $(seq 1 30); do
	if curl -fsS --max-time 2 "http://localhost:${PORT}/json/version" >/dev/null 2>&1; then
		echo "Flag-enabled Chrome up on CDP port ${PORT} (profile ${PROFILE})."
		exit 0
	fi
	sleep 0.5
done

echo "Chrome did not become reachable on CDP port ${PORT} within 15s." >&2
exit 1

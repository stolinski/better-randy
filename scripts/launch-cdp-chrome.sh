#!/usr/bin/env bash
# Start (or confirm) the sanctioned Chrome used by canvas/browser probes.
# Default mode enables WICG CanvasDrawElement for canonical GFX rendering.
# `CDP_BROWSER_MODE=standard-webmcp` enables WebMCP without CanvasDrawElement so
# standard-browser fallback probes cannot accidentally use the flagged capture path.
# `CDP_BROWSER_MODE=standard` enables neither experimental feature.
#
# Always use a distinct CDP port per mode. The script is idempotent: if Chrome
# already answers on the selected port, that existing process is left alone.
set -euo pipefail

MODE="${CDP_BROWSER_MODE:-canvas}"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
MODE_FLAGS=()
MODE_LABEL=""
DEFAULT_PORT=""

case "${MODE}" in
	canvas)
		DEFAULT_PORT="9223"
		MODE_FLAGS+=(--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu)
		MODE_LABEL="CanvasDrawElement"
		;;
	standard-webmcp)
		DEFAULT_PORT="9225"
		MODE_FLAGS+=(--enable-blink-features=WebMCP)
		MODE_LABEL="standard WebMCP"
		;;
	standard)
		DEFAULT_PORT="9227"
		MODE_LABEL="standard"
		;;
	*)
		echo "Unknown CDP_BROWSER_MODE '${MODE}'; expected canvas, standard-webmcp, or standard." >&2
		exit 1
		;;
esac

PORT="${CDP_PORT:-${DEFAULT_PORT}}"
PROFILE="/tmp/gfx-chrome-${PORT}"

if curl -fsS --max-time 2 "http://localhost:${PORT}/json/version" >/dev/null 2>&1; then
	echo "Chrome already running on CDP port ${PORT} — using the existing process (${MODE_LABEL} mode requested; callers must verify capabilities)."
	exit 0
fi

if [[ ! -x "${CHROME}" ]]; then
	echo "Google Chrome not found at: ${CHROME}" >&2
	exit 1
fi

nohup "${CHROME}" \
	--remote-debugging-port="${PORT}" \
	--user-data-dir="${PROFILE}" \
	"${MODE_FLAGS[@]}" \
	--no-first-run \
	--no-default-browser-check \
	about:blank >/dev/null 2>&1 &

for _ in $(seq 1 30); do
	if curl -fsS --max-time 2 "http://localhost:${PORT}/json/version" >/dev/null 2>&1; then
		echo "Chrome up on CDP port ${PORT} (profile ${PROFILE}; ${MODE_LABEL} mode)."
		exit 0
	fi
	sleep 0.5
done

echo "Chrome did not become reachable on CDP port ${PORT} within 15s." >&2
exit 1

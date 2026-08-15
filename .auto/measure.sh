#!/bin/bash
set -euo pipefail

curl --fail --silent --show-error --max-time 3 http://localhost:7263/ >/dev/null
curl --fail --silent --show-error --max-time 3 http://localhost:9223/json/version >/dev/null
node .auto/homepage-load-probe.mjs

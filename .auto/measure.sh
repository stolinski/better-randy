#!/bin/bash
set -euo pipefail

curl --fail --silent --show-error --max-time 3 http://localhost:7263/p/lower-third-miranda-heath >/dev/null
curl --fail --silent --show-error --max-time 3 http://localhost:9223/json/version >/dev/null
node .auto/preset-route-suite.mjs

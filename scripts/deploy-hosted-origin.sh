#!/usr/bin/env bash
# Build and deploy the hosted gfx.computer origin (ADR-0052 amendment).
#
# One Cloudflare Worker serves the app; the browser encodes every export. The
# release identity is the commit being deployed, so /api/health and the app
# shell report what actually landed and a deploy is verified by reading it back.
#
# Requires a Cloudflare login (`pnpm wrangler login`) or CLOUDFLARE_API_TOKEN,
# and, once per origin, the secrets `wrangler.jsonc` names:
#   pnpm wrangler secret put GFX_ORIGIN_TRIAL_TOKEN   # HTML-in-Canvas origin trial
#   pnpm wrangler secret put SENTRY_DSN               # optional
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
	echo "The working tree has uncommitted changes; deploy from a commit so GFX_RELEASE names what is served." >&2
	exit 1
fi

release="gfx@$(git rev-parse HEAD)"

PUBLIC_GFX_HOSTED=1 pnpm build

pnpm wrangler deploy --var "GFX_RELEASE:${release}" "$@"

echo "Deployed ${release}. Confirm with: curl -s https://gfx.computer/api/health"

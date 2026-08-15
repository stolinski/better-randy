#!/bin/bash
set -euo pipefail

npx @sveltejs/mcp svelte-autofixer src/routes/+page.svelte --svelte-version 5 >/dev/null
npx @sveltejs/mcp svelte-autofixer src/routes/PosterCard.svelte --svelte-version 5 >/dev/null
npm run check

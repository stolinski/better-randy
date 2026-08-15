#!/bin/bash
set -euo pipefail
npx vitest run src/lib/platform/user-composition-store.test.ts --reporter=dot 2>&1 | tail -50
npx svelte-check --tsconfig ./tsconfig.json 2>&1 | tail -80

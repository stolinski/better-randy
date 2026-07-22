import { readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Visual rubric audit driver.
 *
 * The runtime audit lives in `src/lib/platform/runtime-audit.ts` and runs
 * inside the SvelteKit dev server. When the workspace renders a preset, it
 * measures the rendered DOM at 4K-equivalent dimensions and writes the
 * result to `window.__supersVisualAudit` once the surface has settled
 * (paperVisibility ≥ 0.99). This script prints, for every preset in
 * `src/lib/presets/`, the URL to open plus the DevTools snippet to read the
 * audit result.
 *
 * To run the audit:
 *   1. Confirm the existing dev server at http://localhost:7263 (do not start another).
 *   2. `node --experimental-strip-types scripts/audit-presets-visual.ts`
 *      to print the procedure.
 *   3. Open each printed URL in a Chromium-based browser with the
 *      `canvas-draw-element` flag enabled (see CLAUDE.md).
 *   4. Scrub the timeline past the surface enter (e.g. progress 0.5) so the
 *      audit fires at the settled position, then paste the snippet into
 *      DevTools console to read `window.__supersVisualAudit.issues`.
 *
 * An agent running the chrome-devtools MCP can automate steps 3–4 by
 * navigating to each URL, dispatching a synthetic pointerdown on
 * `.track-view` at the desired fraction (see how the workspace's
 * TimelineTrackView handles seek pointerdowns) and then evaluating
 * `JSON.stringify(window.__supersVisualAudit.issues)`.
 *
 * A preset is shippable only when BOTH `scripts/verify-presets.ts`
 * (static lint) and this audit report zero rubric errors. Static checks
 * cover G1/G5/G6/G7/G10/A1/A2/A3/L1/L3/T2; visual checks cover G2/G4/T1.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const presetDir = resolve(repoRoot, 'src/lib/presets');
const files = (await readdir(presetDir)).filter((file) => file.endsWith('.json'));

const baseUrl = process.env.SUPERS_DEV_URL ?? 'http://localhost:7263';
const seekFraction = process.env.SUPERS_AUDIT_SEEK ?? '0.5';

const snippet = `(async () => {
  const fraction = ${seekFraction};
  const container = document.querySelector('.track-view');
  if (container) {
    const rect = container.getBoundingClientRect();
    const clientX = rect.left + fraction * rect.width;
    const clientY = rect.top + 5;
    container.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX, clientY, bubbles: true, cancelable: true, pointerType: 'mouse' }));
    window.dispatchEvent(new PointerEvent('pointerup', { button: 0, clientX, clientY, bubbles: true, cancelable: true, pointerType: 'mouse' }));
    await new Promise((r) => setTimeout(r, 400));
  }
  return JSON.stringify(window.__supersVisualAudit?.issues ?? 'audit not ready', null, 2);
})()`;

console.log('Visual rubric audit — open each URL, run the snippet in DevTools.\n');
console.log('DevTools snippet (paste into Console):\n');
console.log(snippet);
console.log('\nPresets:\n');

for (const file of files) {
	const slug = file.replace(/\.json$/, '');
	console.log(`  ${baseUrl}/p/${slug}`);
}

console.log(
	'\nA preset passes when verify-presets.ts AND the snippet output (parsed) report zero issues.'
);

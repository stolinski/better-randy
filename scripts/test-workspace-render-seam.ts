import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(
	new URL('../src/lib/platform/Workspace.svelte', import.meta.url),
	'utf8'
);
const renderer = readFileSync(
	new URL('../src/lib/platform/composition-frame-renderer.ts', import.meta.url),
	'utf8'
);
const exportController = readFileSync(
	new URL('../src/lib/platform/composition-export-controller.ts', import.meta.url),
	'utf8'
);
const exportFrame = source.match(
	/renderCompositionFrame: \(timestamp\) => \{([\s\S]*?)\n\t\t\t\t\},/
);

assert.ok(exportFrame, 'Workspace must provide the controller a live export frame callback');
assert.match(
	exportFrame[1],
	/renderCompositionFrameTo\(\s*buildCompositionFrameRenderRequest\(\s*host\.context\.getCurrentTexture\(\)\.createView\(\),\s*timestamp\s*\)/,
	'export must delegate its canvas frame to the shared render seam'
);
assert.doesNotMatch(
	exportFrame[1],
	/renderDepthStage|renderDofPlanes|pipeline\.render|effectChain\.apply|shaderPassDispatcher\.apply/,
	'export must not carry a second render dispatch'
);
assert.match(
	exportController,
	/dependencies\.renderCompositionFrame\(timestamp\)/,
	'the export controller must invoke Workspace\'s shared frame callback'
);
assert.equal(
	(renderer.match(/export function renderCompositionFrameTo\(/g) ?? []).length,
	1,
	'the focused renderer module must own exactly one composition frame seam'
);
assert.equal(
	(renderer.match(/pipeline\.uploadDom\(\)/g) ?? []).length,
	1,
	'the shared frame seam must own the only live DOM upload'
);
assert.equal(
	(renderer.match(/const inputs = request\.buildSurfaceInputs\(request\.timestamp\)/g) ?? [])
		.length,
	1,
	'the shared frame seam must build complete Surface inputs once'
);
assert.doesNotMatch(
	source,
	/function renderDepthStage\(|function renderDofPlanes\(|effectChain\.apply\(|shaderPassDispatcher\.apply\(/,
	'Workspace must not retain composition-frame branch dispatch'
);

console.log('test-workspace-render-seam.ts: all assertions passed');

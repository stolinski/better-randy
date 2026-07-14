import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(
	new URL('../src/lib/platform/Workspace.svelte', import.meta.url),
	'utf8'
);
const exportFrame = source.match(
	/const renderFrame:[\s\S]*?= async \(_frame, timestamp\) => \{([\s\S]*?)\n\t\t\};/
);

assert.ok(exportFrame, 'Workspace must declare the export renderFrame callback');
assert.match(
	exportFrame[1],
	/renderCompositionFrameTo\(host\.context\.getCurrentTexture\(\)\.createView\(\), timestamp\)/,
	'export must delegate its canvas frame to the shared render seam'
);
assert.doesNotMatch(
	exportFrame[1],
	/renderDepthStage|renderDofPlanes|pipeline\.render|effectChain\.apply|shaderPassDispatcher\.apply/,
	'export must not carry a second render dispatch'
);
assert.equal(
	(source.match(/function renderCompositionFrameTo\(/g) ?? []).length,
	1,
	'Workspace must own exactly one top-level composition frame seam'
);
assert.equal(
	(source.match(/pipeline\.uploadDom\(\)/g) ?? []).length,
	1,
	'the shared frame seam must own the only live DOM upload'
);
assert.equal(
	(source.match(/const inputs = buildRenderInputs\(timestamp\)/g) ?? []).length,
	1,
	'the shared frame seam must build complete Surface inputs once'
);

console.log('test-workspace-render-seam.ts: all assertions passed');

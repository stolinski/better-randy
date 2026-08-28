import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const runnerSource = await readFile('scripts/run-supers-layout-contract-matrix.mjs', 'utf8');
const runtimeSource = await readFile('src/lib/platform/runtime-audit.ts', 'utf8');

test('Layout Contract matrix is hidden and capture-free by construction', () => {
	assert.match(runnerSource, /--headless=new/);
	assert.match(runnerSource, /__captureGfxLayoutContractFrame/);
	assert.doesNotMatch(runnerSource, /captureScreenshot|canvasPng|\.png['"`]/i);
	assert.doesNotMatch(runnerSource, /__captureGfxDeterministicReadablePngArtifacts/);
	assert.doesNotMatch(runnerSource, /writeFile/);
});

test('runtime Layout Contract seam omits composited pixel masks', () => {
	assert.match(runtimeSource, /__captureGfxLayoutContractFrame/);
	assert.match(runtimeSource, /captureManifest\(request, false\)/);
	assert.match(runtimeSource, /includePixelMasks/);
});

test('matrix covers the full deliverable registry and stays bounded', () => {
	assert.match(runnerSource, /scope: 'full'/);
	assert.match(runnerSource, /MATRIX_TIMEOUT_MS/);
	assert.match(runnerSource, /12 \* 60_000/);
	assert.match(runnerSource, /coordinateCount/);
	assert.match(runnerSource, /contentDigest/);
});

test('Factory receipts seal only the classified change paths', () => {
	assert.match(runnerSource, /--scoped-paths-json/);
	assert.match(runnerSource, /computeRepositoryScopedTreeFingerprint/);
	assert.match(runnerSource, /engineFingerprint: servedTree\.treeFingerprint/);
	assert.match(runnerSource, /treeFingerprint: receiptTree\.treeFingerprint/);
});

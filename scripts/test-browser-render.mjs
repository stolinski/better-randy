import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

import { PNG } from 'pngjs';

const slug = 'transition-wipe-demo';
const sample = '0.5';
const capture = spawnSync(process.execPath, ['scripts/cdp-capture.mjs', slug], {
	cwd: process.cwd(),
	env: { ...process.env, CDP_SAMPLES: sample },
	stdio: 'inherit'
});

assert.equal(capture.status, 0, 'Flag-enabled browser capture must succeed');

const image = PNG.sync.read(readFileSync(`.tmp-baselines/${slug}/p0.50.png`));
assert.deepEqual(
	{ width: image.width, height: image.height },
	{ width: 3840, height: 2160 },
	'Browser capture must preserve the horizontal native target resolution'
);

const reference = image.data.subarray(0, 4);
let differingPixels = 0;
for (let offset = 0; offset < image.data.length; offset += 4) {
	if (
		image.data[offset] !== reference[0] ||
		image.data[offset + 1] !== reference[1] ||
		image.data[offset + 2] !== reference[2]
	) {
		differingPixels += 1;
	}
}

assert.ok(differingPixels > 1_000, 'Browser capture must contain non-uniform composition pixels');
console.log(`browser-render: ${differingPixels.toLocaleString()} differing pixels at 3840x2160`);

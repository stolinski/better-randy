import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const scripts = [
	'scripts/test-pack-validation.ts',
	'scripts/test-preset-validation.ts',
	'scripts/test-workspace-render-seam.ts',
	'scripts/test-dom-capture-lane-seam.ts'
];

for (const script of scripts) {
	const result = spawnSync(process.execPath, ['--experimental-strip-types', script], {
		cwd: process.cwd(),
		stdio: 'inherit'
	});
	assert.equal(result.status, 0, `${script} must pass`);
}

console.log(`structural: ${scripts.length} scripts passed`);

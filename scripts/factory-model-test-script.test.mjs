import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const packageJsonPath = new URL('../package.json', import.meta.url);
const qualityWorkflowPath = new URL('../.github/workflows/quality.yml', import.meta.url);

const requiredFactoryModelSuites = [
	'extensions/models/dex-software-factory.test.ts',
	'extensions/models/supers-delivery-verification-router.test.ts',
	'extensions/models/repo-verification-fanout.test.ts',
	'extensions/models/repo-audit.test.ts',
	'extensions/models/factory-execution-failure-authority.test.ts',
	'extensions/models/factory-pi-dispatch-outbox.test.ts',
	'extensions/models/factory-sentry-metrics.test.ts',
	'scripts/factory-pi-runtime-receipt.test.ts'
];

test('release verification runs every core Factory model suite', async () => {
	const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
	const factoryModels = packageJson.scripts?.['test:factory-models'];
	const structural = packageJson.scripts?.['test:structural'];
	const handoff = packageJson.scripts?.['test:factory-handoff'];
	assert.equal(typeof factoryModels, 'string');
	assert.equal(typeof structural, 'string');
	assert.equal(typeof handoff, 'string');
	assert.match(
		factoryModels,
		/^npx --yes deno check .*scripts\/factory-pi-runtime-receipt\.ts && npx --yes deno test /
	);

	for (const suite of requiredFactoryModelSuites) {
		assert.match(factoryModels, new RegExp(`(?:^|\\s)${suite.replaceAll('.', '\\.')}(?:\\s|$)`));
	}
	assert.match(structural, /(?:^|&&\s*)pnpm test:factory-models(?:\s*&&|$)/);
	assert.doesNotMatch(handoff, /factory-pi-dispatch-outbox\.test\.ts/);

	const qualityWorkflow = await readFile(qualityWorkflowPath, 'utf8');
	assert.match(qualityWorkflow, /run:\s*pnpm test:structural/);
});

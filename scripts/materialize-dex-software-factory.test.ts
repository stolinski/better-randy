import assert from 'node:assert/strict';

import { materializeDexSoftwareFactoryDefinition } from './materialize-dex-software-factory.ts';

const FACTORY_ARGUMENTS = {
	stages: [{ id: 'done', initial: true, terminal: true }],
	globalTransitions: []
};

const COMPILED_PROFILE = {
	content: {
		target: { type: '@swamp/software-factory', version: '2026.06.24.1' },
		factoryArguments: FACTORY_ARGUMENTS
	}
};

Deno.test('materialization changes only arguments and increments once', () => {
	const source = {
		type: '@swamp/software-factory',
		typeVersion: '2026.06.24.1',
		id: 'fixture-id',
		name: 'fixture-factory',
		version: 7,
		tags: { purpose: 'portability' },
		globalArguments: {},
		methods: {},
		reports: { require: ['fixture-report'] }
	};

	const first = materializeDexSoftwareFactoryDefinition(source, COMPILED_PROFILE);
	assert.equal(first.changed, true);
	assert.equal(first.definition.version, 8);
	assert.deepEqual(first.definition.globalArguments, FACTORY_ARGUMENTS);
	assert.deepEqual(first.definition.tags, source.tags);
	assert.deepEqual(first.definition.reports, source.reports);

	const second = materializeDexSoftwareFactoryDefinition(first.definition, COMPILED_PROFILE);
	assert.equal(second.changed, false);
	assert.equal(second.definition.version, 8);
	assert.deepEqual(second.definition, first.definition);
});

Deno.test('materialization rejects a Factory target version mismatch', () => {
	assert.throws(
		() =>
			materializeDexSoftwareFactoryDefinition(
				{
					type: '@swamp/software-factory',
					typeVersion: 'other-version',
					version: 1,
					globalArguments: {}
				},
				COMPILED_PROFILE
			),
		/Factory target mismatch/
	);
});

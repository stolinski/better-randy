import assert from 'node:assert/strict';

import {
	compileDexSoftwareFactoryProfile,
	type DexSoftwareFactoryMethodContext,
	type DexSoftwareFactoryProfile,
	DexSoftwareFactoryProfileSchema,
	executeDexSoftwareFactoryCompile
} from './dex-software-factory-compiler.ts';
import { model } from './dex-software-factory.ts';

function workflow(workflowName: string): DexSoftwareFactoryProfile['adapters']['preflight'] {
	return { mode: 'workflow', workflow: workflowName };
}

function minimalProfile(): DexSoftwareFactoryProfile {
	return {
		profileName: 'portable-delivery',
		adapters: {
			preflight: workflow('consumer-preflight'),
			classify: workflow('consumer-classify'),
			verification: {
				mode: 'interactive',
				systemPrompt: 'Execute every required verification lane and record its evidence.'
			},
			postflight: workflow('consumer-postflight'),
			dexTracker: {
				modelIdOrName: 'consumer-dex-tracker',
				completeMethodName: 'complete'
			}
		},
		implementation: {
			systemPrompt: 'Implement only the current work item and record a compact summary.'
		},
		budgets: {
			implementation: 4,
			verification: 4,
			review: 3,
			reconciliation: 3,
			maxDispatchesPerCycle: 2
		}
	};
}

function stage(
	profile: ReturnType<typeof compileDexSoftwareFactoryProfile>,
	id: string
): Record<string, unknown> {
	const found = profile.factoryArguments.stages.find((candidate) => candidate.id === id);
	assert.ok(found, `Expected stage ${id}`);
	return found;
}

function serializedProfile(profile: DexSoftwareFactoryProfile): string {
	return JSON.stringify(compileDexSoftwareFactoryProfile(profile));
}

Deno.test('model exposes the locked compiler type, version, resource, and method', () => {
	assert.equal(model.type, '@club_aqua_back_deck/dex-software-factory');
	assert.equal(model.version, '2026.08.05.3');
	assert.deepEqual(Object.keys(model.resources), ['profile']);
	assert.deepEqual(Object.keys(model.methods), ['compile']);
});

Deno.test('minimal profile compiles the bounded lifecycle without review', () => {
	const compiled = compileDexSoftwareFactoryProfile(minimalProfile());
	assert.equal(compiled.target.type, '@swamp/software-factory');
	assert.equal(compiled.target.version, '2026.06.24.1');
	assert.deepEqual(
		compiled.factoryArguments.stages.map((candidate) => candidate.id),
		[
			'preflight',
			'implementation',
			'classify',
			'verification',
			'reconciliation',
			'postflight',
			'terminal-cleanup',
			'done',
			'aborted'
		]
	);
	assert.equal(stage(compiled, 'preflight').initial, true);
	assert.equal(stage(compiled, 'done').terminal, true);
	assert.equal(stage(compiled, 'aborted').terminal, true);
	assert.equal(serializedProfile(minimalProfile()).includes('supers'), false);
});

Deno.test('review-gated profile inserts typed findings and exact verification routing', () => {
	const profile = minimalProfile();
	profile.review = {
		skills: ['code-review'],
		systemPrompt: 'Review the verified change and report actionable findings.',
		blockingSeverities: ['critical', 'high']
	};
	const compiled = compileDexSoftwareFactoryProfile(profile);
	const review = stage(compiled, 'review');
	const verification = stage(compiled, 'verification');
	assert.equal(Array.isArray(review.artifacts), true);
	assert.match(JSON.stringify(review), /findings-clear/);
	assert.match(JSON.stringify(verification), /nextStep=review/);
	assert.match(JSON.stringify(verification), /reviewRequired/);
	assert.equal(serializedProfile(profile).includes('supers'), false);
});

Deno.test('consumer contracts extend artifacts and preserve configured review names', () => {
	const profile = minimalProfile();
	profile.review = {
		skills: ['visual-review'],
		systemPrompt: 'Review rendered evidence.',
		blockingSeverities: ['critical', 'high'],
		findingsArtifactName: 'visual-review',
		verdictArtifactName: 'visual-verdict'
	};
	profile.contracts = {
		verification: {
			properties: {
				materialPixelChange: {
					type: 'string',
					enum: ['changed', 'unchanged', 'unavailable']
				}
			},
			required: ['materialPixelChange']
		},
		reviewVerdict: {
			properties: {
				recommendation: { type: 'string', enum: ['accept', 'revise'] },
				evidence: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } }
			},
			required: ['recommendation', 'evidence']
		}
	};
	const compiled = compileDexSoftwareFactoryProfile(profile);
	const review = JSON.stringify(stage(compiled, 'review'));
	assert.match(review, /visual-review/);
	assert.match(review, /visual-verdict/);
	assert.match(review, /recommendation/);
	assert.match(JSON.stringify(stage(compiled, 'verification')), /materialPixelChange/);
	const reconciliation = stage(compiled, 'reconciliation');
	const reconciliationArtifact = (reconciliation.artifacts as Record<string, unknown>[]).find(
		(artifact) => artifact.name === 'reconciliation'
	);
	assert.equal(reconciliationArtifact?.reviews, 'verification');
	assert.match(JSON.stringify(reconciliation.work), /visual-verdict/);
});

Deno.test('human-gated profile places approval on the final acceptance route', () => {
	const profile = minimalProfile();
	profile.review = {
		skills: ['release-review'],
		systemPrompt: 'Review release readiness and preserve the evidence.',
		blockingSeverities: ['critical', 'high', 'medium']
	};
	profile.humanGate = { id: 'release-approval', minApprovals: 2 };
	const compiled = compileDexSoftwareFactoryProfile(profile);
	const review = stage(compiled, 'review');
	assert.match(JSON.stringify(review), /release-approval/);
	assert.match(JSON.stringify(review), /minApprovals/);
	assert.match(JSON.stringify(review), /human-revision/);
	assert.match(JSON.stringify(review), /decision == \\"rejected\\"/);
	assert.doesNotMatch(JSON.stringify(stage(compiled, 'verification')), /release-approval/);
	assert.equal(serializedProfile(profile).includes('supers'), false);
});

Deno.test('human gate without review protects the verification-to-reconciliation route', () => {
	const profile = minimalProfile();
	profile.humanGate = { id: 'ship-approval' };
	const compiled = compileDexSoftwareFactoryProfile(profile);
	assert.match(JSON.stringify(stage(compiled, 'verification')), /ship-approval/);
	assert.match(JSON.stringify(stage(compiled, 'verification')), /human-revision/);
});

Deno.test('terminal cleanup calls the Dex model with CEL-bound reconciliation data', () => {
	const compiled = compileDexSoftwareFactoryProfile(minimalProfile());
	const cleanup = JSON.stringify(stage(compiled, 'terminal-cleanup'));
	assert.match(cleanup, /consumer-dex-tracker/);
	assert.match(cleanup, /artifact-reconciliation/);
	assert.match(cleanup, /tracker-completion/);
	assert.doesNotMatch(cleanup, /dex complete|command|shell/);
	assert.ok(
		compiled.factoryArguments.stages.findIndex((candidate) => candidate.id === 'postflight') <
			compiled.factoryArguments.stages.findIndex((candidate) => candidate.id === 'terminal-cleanup')
	);
});

Deno.test('method adapters compile with typed workItem inputs and success evidence gates', () => {
	const profile = minimalProfile();
	profile.adapters.preflight = {
		mode: 'method',
		modelIdOrName: 'consumer-policy',
		methodName: 'preflight',
		inputs: {
			values: { strict: true },
			properties: { strict: { type: 'boolean' } },
			required: ['strict']
		}
	};
	const compiled = compileDexSoftwareFactoryProfile(profile);
	const preflight = JSON.stringify(stage(compiled, 'preflight'));
	assert.match(preflight, /consumer-policy/);
	assert.match(preflight, /evidence-recorded/);
	assert.match(preflight, /workItem/);
});

Deno.test('invalid adapter combinations fail before compilation', () => {
	const missingInputSchema = minimalProfile();
	missingInputSchema.adapters.preflight = {
		mode: 'workflow',
		workflow: 'consumer-preflight',
		inputs: { values: { strict: true }, properties: {} }
	};
	assert.equal(DexSoftwareFactoryProfileSchema.safeParse(missingInputSchema).success, false);

	const overriddenWorkItem = minimalProfile();
	overriddenWorkItem.adapters.classify = {
		mode: 'workflow',
		workflow: 'consumer-classify',
		inputs: {
			values: { workItem: 'wrong' },
			properties: { workItem: { type: 'string' } }
		}
	};
	assert.equal(DexSoftwareFactoryProfileSchema.safeParse(overriddenWorkItem).success, false);

	const emptyReview = { ...minimalProfile(), review: { skills: [] } };
	assert.equal(DexSoftwareFactoryProfileSchema.safeParse(emptyReview).success, false);

	const reservedContract = minimalProfile();
	reservedContract.contracts = {
		verification: {
			properties: { status: { type: 'boolean' } }
		}
	};
	assert.equal(DexSoftwareFactoryProfileSchema.safeParse(reservedContract).success, false);
});

Deno.test('compile method persists the versioned profile resource', async () => {
	const writes: Array<{ specName: string; name: string; data: Record<string, unknown> }> = [];
	const context: DexSoftwareFactoryMethodContext = {
		globalArgs: minimalProfile(),
		writeResource: (specName, name, data) => {
			writes.push({ specName, name, data });
			return Promise.resolve({ name });
		}
	};
	const result = await executeDexSoftwareFactoryCompile({}, context);
	assert.deepEqual(result, { dataHandles: [{ name: 'compiled-profile' }] });
	assert.equal(writes[0].specName, 'profile');
	assert.equal(writes[0].name, 'compiled-profile');
	assert.equal(writes[0].data.compilerVersion, '2026.08.05.3');
});

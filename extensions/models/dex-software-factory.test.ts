import assert from 'node:assert/strict';
import { parse as parseYaml } from 'jsr:@std/yaml@1.0.10';

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
		profileModelName: 'consumer-profile',
		sourceFactoryId: '11111111-1111-4111-8111-111111111111',
		adapters: {
			failureAuthorizer: { workflow: 'consumer-failure-authorizer' },
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
			skills: ['implementation'],
			systemPrompt: 'Implement only the current work item and record a compact summary.'
		},
		budgets: {
			implementation: 4,
			verification: 4,
			review: 3,
			reconciliation: 3,
			maxDispatchesPerCycle: 1
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
	assert.equal(model.version, '2026.08.16.14');
	assert.deepEqual(Object.keys(model.resources), [
		'profile',
		'dispatch-boundary',
		'execution-failure',
		'authorized-failure',
		'pi-dispatch-outbox',
		'pi-launch-receipt',
		'pi-execution-claim',
		'pi-execution-failure',
		'pi-handoff-acceptance'
	]);
	assert.deepEqual(Object.keys(model.methods), [
		'compile',
		'execute_failure_boundary',
		'execute_work_boundary',
		'authorize_execution_failure',
		'reserve_pi_dispatch',
		'get_pi_dispatch_request',
		'record_pi_submission_attempt',
		'reconcile_pi_dispatch',
		'bind_pi_launch',
		'claim_pi_execution',
		'bind_pi_handoff',
		'authorize_pi_submission_retry',
		'park_pi_submission'
	]);
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
			'preflight-recovery',
			'implementation-recovery',
			'classify-recovery',
			'verification-recovery',
			'reconciliation',
			'reconciliation-recovery',
			'postflight',
			'postflight-recovery',
			'terminal-cleanup',
			'terminal-cleanup-recovery',
			'done',
			'aborted',
			'operational-escalation'
		]
	);
	assert.equal(stage(compiled, 'preflight').initial, true);
	assert.equal(stage(compiled, 'done').terminal, true);
	assert.equal(stage(compiled, 'aborted').terminal, true);
	assert.equal(serializedProfile(minimalProfile()).includes('supers'), false);
});

Deno.test('every generated work stage has trusted operational recovery and a fresh cycle', () => {
	const profile = minimalProfile();
	profile.review = {
		skills: ['code-review'],
		systemPrompt: 'Review exact evidence.',
		blockingSeverities: ['critical']
	};
	profile.adapters.terminalObserver = { workflow: 'terminal-observer' };
	const compiled = compileDexSoftwareFactoryProfile(profile);
	for (const stageId of [
		'preflight',
		'implementation',
		'classify',
		'verification',
		'review',
		'reconciliation',
		'postflight',
		'terminal-cleanup',
		'done-observability',
		'aborted-observability',
		'escalated-observability'
	] as const) {
		const source = JSON.stringify(stage(compiled, stageId));
		const recovery = JSON.stringify(stage(compiled, `${stageId}-recovery`));
		assert.match(source, new RegExp(`${stageId}-execution-failure`));
		assert.match(source, /receiptDigest/);
		assert.match(source, /dispatchAttempt/);
		assert.match(source, /dispatchAttempt == 1/);
		assert.equal(stage(compiled, stageId).maxDispatchesPerCycle, 1);
		assert.match(source, new RegExp(profile.sourceFactoryId));
		assert.match(source, /failureKind.*operational/);
		assert.match(source, /consumer-failure-authorizer/);
		assert.match(source, /authorityReceiptName/);
		assert.match(source, /workflow-succeeded/);
		assert.match(source, new RegExp(`artifact-${stageId}-execution-failure`));
		assert.doesNotMatch(source, /objective-check|objective-rework/);
		assert.match(source, new RegExp(`operational-pause.*${stageId}-recovery`));
		assert.match(recovery, new RegExp(`retry-${stageId}`));
		assert.match(recovery, /human-approval/);
	}
	assert.match(
		JSON.stringify(compiled.factoryArguments.globalTransitions),
		/escalate-operational-failure.*escalated-observability/
	);
	assert.equal(stage(compiled, 'operational-escalation').terminal, true);
});

Deno.test('terminal observer makes observability part of every terminal route', () => {
	const profile = minimalProfile();
	profile.adapters.terminalObserver = {
		workflow: 'consumer-terminal-observability'
	};
	const compiled = compileDexSoftwareFactoryProfile(profile);
	assert.match(JSON.stringify(stage(compiled, 'terminal-cleanup')), /done-observability/);
	assert.match(
		JSON.stringify(stage(compiled, 'done-observability')),
		/consumer-terminal-observability.*finalize.*done.*operational-pause/
	);
	assert.match(
		JSON.stringify(stage(compiled, 'aborted-observability')),
		/consumer-terminal-observability.*finalize.*aborted.*operational-pause/
	);
	assert.match(
		JSON.stringify(stage(compiled, 'escalated-observability')),
		/consumer-terminal-observability.*finalize.*operational-escalation.*operational-pause/
	);
	for (const stageId of [
		'done-observability',
		'aborted-observability',
		'escalated-observability'
	]) {
		const observer = JSON.stringify(stage(compiled, stageId));
		assert.match(
			observer,
			/"name":"finalize".*"workflow-succeeded","config":\{"workflow":"consumer-terminal-observability"\}/
		);
	}
	assert.match(
		JSON.stringify(compiled.factoryArguments.globalTransitions),
		/abort.*aborted-observability.*escalate-operational-failure.*escalated-observability/
	);
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
				evidence: {
					type: 'array',
					minItems: 1,
					items: { type: 'string', minLength: 1 }
				}
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
	assert.match(JSON.stringify(reconciliation.work), /change-summary/);
	assert.match(
		JSON.stringify(reconciliation.work),
		/without mutating the repository or tracker state/
	);
});

Deno.test('consumer change-summary preserves a strict integration receipt contract', () => {
	const profile = minimalProfile();
	profile.contracts = {
		changeSummary: {
			properties: {
				integrationReceipt: {
					type: 'object',
					additionalProperties: false,
					required: ['receiptId', 'activeTaskId', 'disposition'],
					properties: {
						receiptId: { type: 'string', pattern: '^[0-9a-f]{64}$' },
						activeTaskId: { type: 'string', minLength: 1 },
						disposition: { type: 'string', enum: ['integrated'] }
					}
				}
			},
			required: ['integrationReceipt']
		}
	};
	const compiled = compileDexSoftwareFactoryProfile(profile);
	const implementation = JSON.stringify(stage(compiled, 'implementation'));
	assert.match(implementation, /integrationReceipt/);
	assert.match(implementation, /additionalProperties.*false/);
	assert.match(implementation, /receiptId.*activeTaskId.*disposition/);
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

Deno.test(
	'closed-objective routing excludes advisory authority and pauses unavailable and human gates',
	() => {
		const profile = minimalProfile();
		profile.adapters.verification = workflow('deterministic-delivery-verification');
		profile.verificationRouting = {
			mode: 'closed-objective',
			unavailableStage: 'evidence-unavailable',
			aestheticGateId: 'aesthetic-acceptance',
			aestheticDecisionAdapter: {
				mode: 'workflow',
				workflow: 'bind-human-aesthetic-decision'
			}
		};
		const compiled = compileDexSoftwareFactoryProfile(profile);
		assert.deepEqual(
			compiled.factoryArguments.stages.map((candidate) => candidate.id),
			[
				'preflight',
				'implementation',
				'classify',
				'verification',
				'preflight-recovery',
				'implementation-recovery',
				'classify-recovery',
				'verification-recovery',
				'evidence-unavailable',
				'aesthetic-approval',
				'aesthetic-decision-binding',
				'aesthetic-decision-binding-recovery',
				'reconciliation',
				'reconciliation-recovery',
				'postflight',
				'postflight-recovery',
				'terminal-cleanup',
				'terminal-cleanup-recovery',
				'done',
				'aborted',
				'operational-escalation'
			]
		);
		const verification = JSON.stringify(stage(compiled, 'verification'));
		assert.match(verification, /automatic-rework/);
		assert.match(verification, /unavailableEvidenceCodes.*== 0/);
		assert.match(verification, /await-human-aesthetic/);
		assert.match(verification, /workflow-succeeded/);
		assert.match(verification, /integratedRevision.*integrationReceipt/);
		assert.match(verification, /integratedTreeFingerprint.*integrationReceipt/);
		assert.match(verification, /treeFingerprint.*changeFingerprint/);
		assert.doesNotMatch(
			verification,
			/visual-verdict|findings-clear|recommendation|reviewRequired/
		);
		const unavailable = JSON.stringify(stage(compiled, 'evidence-unavailable'));
		assert.match(unavailable, /retry-verification/);
		assert.doesNotMatch(unavailable, /implementation|rework/);
		const aesthetic = JSON.stringify(stage(compiled, 'aesthetic-approval'));
		assert.match(aesthetic, /aesthetic-acceptance/);
		assert.doesNotMatch(aesthetic, /reconciliation|implementation/);
		const binding = JSON.stringify(stage(compiled, 'aesthetic-decision-binding'));
		assert.match(binding, /deterministicFanoutResourceName/);
		assert.match(binding, /deterministicFanoutContentDigest/);
		assert.match(binding, /deterministicFanoutWorkflowRunId/);
		assert.match(binding, /policySweepResourceName/);
		assert.match(binding, /policySweepWorkflowRunId/);
		assert.match(binding, /policySweepExecutionDigest/);
		assert.match(binding, /policyReceipts/);
		assert.match(binding, /corpusReceipt/);
		assert.match(binding, /renderMatrixRunName/);
		assert.match(binding, /renderMatrixManifestName/);
		assert.match(binding, /renderMatrixBundleName/);
		assert.match(binding, /verificationWorkflowRunId/);
		assert.match(binding, /renderMatrixManifestDigest/);
		assert.match(binding, /renderMatrixBundleDigest/);
		assert.match(binding, /renderMatrixRunDigest/);
		assert.match(binding, /renderEvidenceArchiveDigest/);
		assert.match(binding, /integratedRevision/);
		assert.match(binding, /integratedTreeFingerprint/);
		assert.match(binding, /treeFingerprint/);
		assert.match(binding, /human-revision/);
		const reconciliationStageValue = stage(compiled, 'reconciliation');
		const reconciliation = JSON.stringify(reconciliationStageValue);
		assert.doesNotMatch(reconciliation, /anything remains|needs-rework/);
		assert.deepEqual(
			(reconciliationStageValue.transitions as Array<{ name: string }>).map(
				(transition) => transition.name
			),
			['postflight', 'operational-pause']
		);
	}
);

Deno.test('closed-objective routing rejects Critic and legacy human configuration', () => {
	const profile = minimalProfile();
	profile.adapters.verification = workflow('deterministic-delivery-verification');
	profile.verificationRouting = {
		mode: 'closed-objective',
		unavailableStage: 'evidence-unavailable',
		aestheticGateId: 'aesthetic-acceptance',
		aestheticDecisionAdapter: { mode: 'workflow', workflow: 'bind-aesthetic' }
	};
	profile.humanGate = { id: 'visual-acceptance' };
	assert.throws(() => compileDexSoftwareFactoryProfile(profile), /legacy humanGate/);
	delete profile.humanGate;
	profile.review = {
		skills: ['critic'],
		systemPrompt: 'Try to route with advisory prose.',
		blockingSeverities: ['critical']
	};
	assert.throws(() => compileDexSoftwareFactoryProfile(profile), /cannot use review/);
});

Deno.test('completion gate requires a repository completion workflow', () => {
	const profile = minimalProfile();
	profile.completionGate = { id: 'completion-approval' };
	assert.throws(() => compileDexSoftwareFactoryProfile(profile), /completionWorkflow/);
});

Deno.test(
	'completion gate parks after postflight and delegates authoritative closure to a workflow',
	() => {
		const profile = minimalProfile();
		profile.completionGate = { id: 'completion-approval' };
		profile.adapters.dexTracker.completionWorkflow = 'complete-human-approved-task';
		const compiled = compileDexSoftwareFactoryProfile(profile);
		const postflight = JSON.stringify(stage(compiled, 'postflight'));
		const cleanup = JSON.stringify(stage(compiled, 'terminal-cleanup'));
		assert.match(postflight, /completion-approval/);
		assert.match(postflight, /human-revision/);
		assert.match(postflight, /decision == \\"rejected\\"/);
		assert.match(cleanup, /complete-human-approved-task/);
		assert.match(cleanup, /explicit task-specific human approval/);
		assert.doesNotMatch(cleanup, /consumer-dex-tracker/);
	}
);

Deno.test('terminal cleanup calls the Dex model with CEL-bound reconciliation data', () => {
	const compiled = compileDexSoftwareFactoryProfile(minimalProfile());
	const cleanupStage = stage(compiled, 'terminal-cleanup');
	const cleanup = JSON.stringify(cleanupStage);
	const cleanupWork = JSON.stringify(cleanupStage.work);
	assert.match(cleanup, /consumer-dex-tracker/);
	assert.match(cleanup, /artifact-reconciliation/);
	assert.match(cleanup, /tracker-completion/);
	assert.doesNotMatch(cleanupWork, /dex complete|command|shell/);
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

Deno.test(
	'checked-in Supers profile and materialized Factory preserve generated parity',
	async () => {
		const profileDefinition = parseYaml(
			await Deno.readTextFile(
				'models/@club_aqua_back_deck/dex-software-factory/a480da64-8208-4252-8eec-2ee454cd3a6d.yaml'
			)
		);
		const factoryDefinition = parseYaml(
			await Deno.readTextFile(
				'models/@swamp/software-factory/90fac686-c724-4aee-97c4-e31b9af4c5e2.yaml'
			)
		);
		assert.equal(typeof profileDefinition, 'object');
		assert.notEqual(profileDefinition, null);
		assert.equal(typeof factoryDefinition, 'object');
		assert.notEqual(factoryDefinition, null);
		const profileRecord = profileDefinition as Record<string, unknown>;
		const factoryRecord = factoryDefinition as Record<string, unknown>;
		const profile = DexSoftwareFactoryProfileSchema.parse(profileRecord.globalArguments);
		const compiled = compileDexSoftwareFactoryProfile(profile);
		assert.equal(profileRecord.typeVersion, compiled.compilerVersion);
		assert.equal(factoryRecord.typeVersion, compiled.target.version);
		assert.deepEqual(factoryRecord.globalArguments, compiled.factoryArguments);
	}
);

Deno.test('compile method persists the versioned profile resource', async () => {
	const writes: Array<{ specName: string; name: string; data: Record<string, unknown> }> = [];
	const logs: string[] = [];
	const context: DexSoftwareFactoryMethodContext = {
		globalArgs: minimalProfile(),
		logger: {
			info: (message) => logs.push(message)
		},
		writeResource: (specName, name, data) => {
			writes.push({ specName, name, data });
			return Promise.resolve({ name });
		}
	};
	const result = await executeDexSoftwareFactoryCompile({}, context);
	assert.deepEqual(result, { dataHandles: [{ name: 'compiled-profile' }] });
	assert.equal(writes[0].specName, 'profile');
	assert.equal(writes[0].name, 'compiled-profile');
	assert.equal(writes[0].data.compilerVersion, '2026.08.16.14');
	assert.deepEqual(logs, [
		'Compiling Dex software Factory profile',
		'Compiled Dex software Factory profile {profileName}'
	]);
});

Deno.test(
	'published package example requires exact Factory ID substitution and compiles afterward',
	async () => {
		const exampleText = await Deno.readTextFile(
			'extensions/packages/dex-software-factory/examples/profile-arguments.yaml'
		);
		assert.match(exampleText, /sourceFactoryId: REPLACE_WITH_PROJECT_DELIVERY_ID/);
		assert.throws(() => DexSoftwareFactoryProfileSchema.parse(parseYaml(exampleText)));
		const exactFactoryId = '11111111-1111-4111-8111-111111111111';
		const profile = DexSoftwareFactoryProfileSchema.parse(
			parseYaml(exampleText.replace('REPLACE_WITH_PROJECT_DELIVERY_ID', exactFactoryId))
		);
		const compiled = compileDexSoftwareFactoryProfile(profile);
		assert.equal(compiled.profileName, 'example-delivery');
		assert.equal(profile.profileModelName, 'project-delivery-profile');
		assert.equal(profile.adapters.failureAuthorizer.workflow, 'project-failure-authorizer');
		assert.equal(profile.budgets.maxDispatchesPerCycle, 1);
		assert.equal(profile.sourceFactoryId, exactFactoryId);
		assert.deepEqual(profile.implementation.skills, ['implementation']);
	}
);

Deno.test(
	'published clean-consumer commands create and read the Factory before the profile',
	async () => {
		const usage = await Deno.readTextFile(
			'extensions/packages/dex-software-factory/examples/usage.md'
		);
		const createFactory = usage.indexOf(
			'swamp model create @swamp/software-factory project-delivery'
		);
		const readFactory = usage.indexOf('swamp model get project-delivery --json');
		const createProfile = usage.indexOf('project-delivery-profile --json');
		const substitute = usage.indexOf('s/REPLACE_WITH_PROJECT_DELIVERY_ID/$PROJECT_DELIVERY_ID/');
		const compile = usage.indexOf('swamp model method run project-delivery-profile compile');
		assert.ok(createFactory >= 0);
		assert.ok(createFactory < readFactory);
		assert.ok(readFactory < createProfile);
		assert.ok(createProfile < substitute);
		assert.ok(substitute < compile);
		assert.doesNotMatch(usage, /11111111-1111-4111-8111-111111111111/);
	}
);

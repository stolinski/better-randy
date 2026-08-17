import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	checkFactoryDispatchPrerequisites,
	createFactoryPiDispatchTask,
	dispatchValidatedFactoryRequest,
	type FactoryDispatchIntent,
	type FactoryPiAsyncRunRequest,
	type FactoryPrerequisiteCommandRunner,
	type ValidatedFactoryDispatchPlan
} from './factory-dispatch-prerequisites.ts';
import { createFactoryFleetWorkerOutputJsonSchema } from '../extensions/models/factory-fleet-worker-output-contract.ts';

const FACTORY = { id: '90fac686-c724-4aee-97c4-e31b9af4c5e2', name: 'supers-delivery' } as const;
const piKey = 'factory:epic-1:task-1';
const outputSchema = createFactoryFleetWorkerOutputJsonSchema({
	rootEpicId: 'epic-1',
	activeTaskId: 'task-1',
	workItem: 'task-1',
	piKey
});

const implementationWork = {
	mode: 'dispatch',
	skills: ['implementation'],
	systemPrompt: 'Implement task-1.'
} as const;
function piRequest(overrides: Partial<FactoryPiAsyncRunRequest> = {}): FactoryPiAsyncRunRequest {
	return {
		agent: 'worker',
		task: 'Implement task-1.',
		worktree: true,
		context: 'fork',
		skill: ['implementation'],
		outputSchema,
		acceptance: false,
		async: true,
		artifacts: true,
		...overrides
	};
}
function intent(request: FactoryPiAsyncRunRequest = piRequest()): FactoryDispatchIntent {
	return {
		sourceFactory: FACTORY,
		workItem: 'task-1',
		rootEpicId: 'epic-1',
		activeTaskId: 'task-1',
		stage: 'implementation',
		invocation: { mode: 'dispatch', piKey, request }
	};
}

function statusOutput(
	work: unknown = implementationWork,
	overrides: Record<string, unknown> = {}
): string {
	return JSON.stringify([
		{
			attributes: {
				workItem: 'task-1',
				stage: { id: 'implementation', cycle: 1 },
				dispatch: { cycle: 1, attempts: 0 },
				work,
				...overrides
			}
		}
	]);
}

function dexOutput(overrides: Record<string, unknown>[] = []): string {
	return JSON.stringify({
		results: [
			{ id: 'epic-1', parent_id: null, completed: false, started_at: null, blockedBy: [] },
			{
				id: 'task-1',
				parent_id: 'epic-1',
				completed: false,
				started_at: '2026-08-17T00:00:00Z',
				blockedBy: []
			},
			...overrides
		]
	});
}

function runner(
	input: {
		statuses?: Partial<Record<string, { status: number; stderr?: string; stdout?: string }>>;
		work?: unknown;
		dex?: string;
	} = {}
): FactoryPrerequisiteCommandRunner {
	return (command, args) => {
		const key = `${command} ${args.join(' ')}`;
		const supplied = input.statuses?.[key];
		if (supplied !== undefined)
			return {
				status: supplied.status,
				stdout: supplied.stdout ?? '',
				stderr: supplied.stderr ?? ''
			};
		if (command === 'swamp' && args[0] === 'data')
			return { status: 0, stdout: statusOutput(input.work), stderr: '' };
		return { status: 0, stdout: command === 'dex' ? (input.dex ?? dexOutput()) : '', stderr: '' };
	};
}


describe('Factory dispatch prerequisites', () => {
	it('reads authoritative current status and leaves attempts at zero when prerequisites fail', async () => {
		let attempts = 0;
		const result = checkFactoryDispatchPrerequisites({
			intent: intent(),
			runCommand: runner({
				statuses: {
					'git status --porcelain=v1 -z': { status: 0, stdout: ' M tracked.ts\0' },
					'dex list --all --json': { status: 0, stdout: 'not-json' }
				}
			})
		});
		assert.equal(result.passed, false);
		if (result.passed) throw new Error('expected failed prerequisites');
		await assert.rejects(
			dispatchValidatedFactoryRequest({
				plan: result as unknown as ValidatedFactoryDispatchPlan,
				recordDispatch: async () => {
					attempts += 1;
				},
				submitDriverRequest: async () => undefined
			}),
			/forged/
		);
		assert.equal(attempts, 0);
		assert.deepEqual(
			result.failures.map((failure) => failure.category),
			['git-dirty', 'dex-json-invalid']
		);
	});

	it('records then submits the exact immutable Pi runs.run request shape', async () => {
		const source = intent();
		const result = checkFactoryDispatchPrerequisites({ intent: source, runCommand: runner() });
		assert.equal(result.passed, true);
		if (!result.passed) throw new Error('expected validated plan');
		source.invocation = { mode: 'interactive', executor: 'driver' };
		const calls: string[] = [];
		let recordedPiRequest: Readonly<FactoryPiAsyncRunRequest> | undefined;
		let submittedPiRequest: Readonly<FactoryPiAsyncRunRequest> | undefined;
		const runs = {
			run: async (request: Readonly<FactoryPiAsyncRunRequest>): Promise<void> => {
				submittedPiRequest = request;
				calls.push('submit');
			}
		};
		await dispatchValidatedFactoryRequest({
			plan: result,
			recordDispatch: async (request) => {
				if (request.invocation.mode !== 'dispatch') throw new Error('expected dispatch invocation');
				assert.equal(request.stageCycle, 1);
				assert.equal(request.dispatchCycle, 1);
				assert.equal(request.currentDispatchCount, 0);
				assert.equal(request.expectedNextDispatchAttempt, 1);
				recordedPiRequest = request.invocation.request;
				calls.push('dispatch');
			},
			submitDriverRequest: async (request, _digest, validatedPiKey) => {
				if ('mode' in request)
					throw new Error('Pi submission received a translated Factory wrapper');
				if (validatedPiKey === undefined)
					throw new Error('Pi submission received no validated key');
				assert.equal(validatedPiKey, piKey);
				await runs.run(request);
			}
		});
		assert.deepEqual(calls, ['dispatch', 'submit']);
		assert.strictEqual(recordedPiRequest, submittedPiRequest);
		assert.equal(Object.isFrozen(submittedPiRequest), true);
		assert.equal(Object.isFrozen(submittedPiRequest?.outputSchema), true);
		assert.deepEqual(submittedPiRequest, piRequest());
	});

	it('routes workflow and method work exactly once through the trusted boundary after dispatch', async () => {
		for (const fixture of [
			{
				work: {
					mode: 'workflow',
					workflow: { name: 'factory-policy-sweep', inputs: { workItem: 'task-1' } }
				},
				invocation: {
					mode: 'workflow',
					workflowName: 'factory-policy-sweep',
					inputs: { workItem: 'task-1' }
				}
			},
			{
				work: {
					mode: 'method',
					method: {
						modelIdOrName: 'repo-audit',
						methodName: 'audit',
						inputs: { workItem: 'task-1' }
					}
				},
				invocation: {
					mode: 'method',
					modelIdOrName: 'repo-audit',
					methodName: 'audit',
					inputs: { workItem: 'task-1' }
				}
			}
		] as const) {
			const workIntent: FactoryDispatchIntent = {
				sourceFactory: FACTORY,
				workItem: 'task-1',
				rootEpicId: 'epic-1',
				activeTaskId: 'task-1',
				stage: 'implementation',
				invocation: fixture.invocation
			};
			const plan = checkFactoryDispatchPrerequisites({
				intent: workIntent,
				runCommand: runner({ work: fixture.work })
			});
			assert.equal(plan.passed, true);
			if (!plan.passed) throw new Error('expected trusted-boundary plan');
			const calls: string[] = [];
			let driverExecutions = 0;
			await dispatchValidatedFactoryRequest({
				plan,
				recordDispatch: async (_request, digest) => calls.push(`dispatch:${digest}`),
				executeTrustedWorkBoundary: async (request) => {
					calls.push(`boundary:${request.dispatchRunId}`);
					assert.equal(request.dispatchAttempt, 1);
					return 'success';
				},
				submitDriverRequest: async () => {
					driverExecutions += 1;
					return 'wrong-owner';
				}
			});
			assert.equal(driverExecutions, 0);
			assert.equal(calls.length, 2);
			assert.equal(calls[0]?.slice('dispatch:'.length), calls[1]?.slice('boundary:'.length));
		}

		const methodWork = {
			mode: 'method',
			method: { modelIdOrName: 'repo-audit', methodName: 'audit', inputs: { workItem: 'task-1' } }
		} as const;
		const missingBoundaryPlan = checkFactoryDispatchPrerequisites({
			intent: {
				sourceFactory: FACTORY,
				workItem: 'task-1',
				rootEpicId: 'epic-1',
				activeTaskId: 'task-1',
				stage: 'implementation',
				invocation: {
					mode: 'method',
					modelIdOrName: 'repo-audit',
					methodName: 'audit',
					inputs: { workItem: 'task-1' }
				}
			},
			runCommand: runner({ work: methodWork })
		});
		assert.equal(missingBoundaryPlan.passed, true);
		if (!missingBoundaryPlan.passed) throw new Error('expected missing-boundary plan');
		let missingBoundaryDispatches = 0;
		await assert.rejects(
			dispatchValidatedFactoryRequest({
				plan: missingBoundaryPlan,
				recordDispatch: async () => {
					missingBoundaryDispatches += 1;
				}
			}),
			/no trusted integrated execution boundary/
		);
		assert.equal(missingBoundaryDispatches, 0);
	});

	it('rejects caller work substitution and mismatched authoritative workflow inputs', () => {
		assert.throws(() =>
			checkFactoryDispatchPrerequisites({
				intent: {
					...intent(),
					work: { mode: 'interactive', systemPrompt: 'fake' }
				} as unknown as FactoryDispatchIntent,
				runCommand: runner()
			})
		);
		const workflowIntent: FactoryDispatchIntent = {
			sourceFactory: FACTORY,
			workItem: 'task-1',
			rootEpicId: 'epic-1',
			activeTaskId: 'task-1',
			stage: 'implementation',
			invocation: {
				mode: 'workflow',
				workflowName: 'expected',
				inputs: { workItem: 'task-1', exact: 'wrong' }
			}
		};
		const result = checkFactoryDispatchPrerequisites({
			intent: workflowIntent,
			runCommand: runner({
				work: {
					mode: 'workflow',
					workflow: { name: 'expected', inputs: { workItem: 'task-1', exact: 'bound' } }
				}
			})
		});
		assert.equal(result.passed, false);
		if (!result.passed) assert.equal(result.failures.at(-1)?.category, 'execution-request-invalid');
	});

	it('rejects translated Pi fields and every authoritative dispatch difference', () => {
		const badSchema = intent(
			piRequest({
				outputSchema: {
					...outputSchema,
					required: outputSchema.required.filter((field) => field !== 'rootEpicId')
				}
			})
		);
		let result = checkFactoryDispatchPrerequisites({ intent: badSchema, runCommand: runner() });
		assert.equal(result.passed, false);
		for (const properties of [
			{ ...outputSchema.properties, workItem: { type: 'string', enum: ['other-task'] } },
			{ ...outputSchema.properties, piKey: { type: 'string', enum: ['factory:epic-1:other-task'] } }
		]) {
			result = checkFactoryDispatchPrerequisites({
				intent: intent(piRequest({ outputSchema: { ...outputSchema, properties } })),
				runCommand: runner()
			});
			assert.equal(result.passed, false);
		}
		for (const schema of [
			{ ...outputSchema, description: 'extra schema contract' },
			{
				...outputSchema,
				required: [...outputSchema.required, 'extra'],
				properties: { ...outputSchema.properties, extra: { type: 'string' } }
			},
			{
				...outputSchema,
				properties: { ...outputSchema.properties, baseCommit: { type: 'string' } }
			},
			{
				...outputSchema,
				properties: {
					...outputSchema.properties,
					changedPaths: { type: 'array', minItems: 0, uniqueItems: true, items: { type: 'string' } }
				}
			},
			{
				...outputSchema,
				properties: {
					...outputSchema.properties,
					commandsRun: { type: 'array', items: { type: 'object' } }
				}
			},
			{ ...outputSchema, properties: { ...outputSchema.properties, summary: { type: 'string' } } }
		]) {
			result = checkFactoryDispatchPrerequisites({
				intent: intent(piRequest({ outputSchema: schema })),
				runCommand: runner()
			});
			assert.equal(result.passed, false);
			if (!result.passed) assert.match(result.failures.at(-1)?.error ?? '', /semantically equal/);
		}

		const reorderedRequired = { ...outputSchema, required: [...outputSchema.required].reverse() };
		result = checkFactoryDispatchPrerequisites({
			intent: intent(piRequest({ outputSchema: reorderedRequired })),
			runCommand: runner()
		});
		assert.equal(result.passed, true);

		const exact = intent();
		if (exact.invocation.mode !== 'dispatch') throw new Error('bad fixture');
		const wrongKey: FactoryDispatchIntent = {
			...exact,
			invocation: { ...exact.invocation, piKey: 'epic-1' }
		};
		result = checkFactoryDispatchPrerequisites({ intent: wrongKey, runCommand: runner() });
		assert.equal(result.passed, false);

		for (const request of [
			piRequest({ skill: ['review'] }),
			piRequest({ task: 'Translated prompt.' }),
			piRequest({ context: 'fresh' as 'fork' }),
			{ ...piRequest(), acceptanceSchema: outputSchema } as unknown as FactoryPiAsyncRunRequest
		]) {
			result = checkFactoryDispatchPrerequisites({ intent: intent(request), runCommand: runner() });
			assert.equal(result.passed, false);
		}

		const detailedWork = {
			mode: 'dispatch',
			skills: ['implementation', 'testing'],
			systemPrompt: 'Implement task-1.',
			command: 'pnpm test',
			constraints: 'Do not edit protected files.'
		} as const;
		const exactTask = createFactoryPiDispatchTask(detailedWork);
		result = checkFactoryDispatchPrerequisites({
			intent: intent(piRequest({ skill: detailedWork.skills, task: exactTask })),
			runCommand: runner({ work: detailedWork })
		});
		assert.equal(result.passed, true);
		for (const work of [
			{ ...detailedWork, command: 'pnpm check' },
			{ ...detailedWork, constraints: 'Different constraints.' }
		]) {
			result = checkFactoryDispatchPrerequisites({
				intent: intent(piRequest({ skill: detailedWork.skills, task: exactTask })),
				runCommand: runner({ work })
			});
			assert.equal(result.passed, false);
		}

		const wrongLeaf = { ...intent(), activeTaskId: 'other' };
		result = checkFactoryDispatchPrerequisites({ intent: wrongLeaf, runCommand: runner() });
		assert.equal(result.passed, false);
	});

	it('binds a plan to one Factory cycle and consumes it before dispatch or submission', async () => {
		let cycle = 1;
		let attempts = 0;
		let recorded = 0;
		let submitted = 0;
		const statefulRunner: FactoryPrerequisiteCommandRunner = (command, args) => {
			if (command === 'swamp' && args[0] === 'data')
				return {
					status: 0,
					stdout: statusOutput(implementationWork, {
						stage: { id: 'implementation', cycle },
						dispatch: { cycle, attempts }
					}),
					stderr: ''
				};
			return { status: 0, stdout: command === 'dex' ? dexOutput() : '', stderr: '' };
		};
		const stalePlan = checkFactoryDispatchPrerequisites({
			intent: intent(),
			runCommand: statefulRunner
		});
		assert.equal(stalePlan.passed, true);
		if (!stalePlan.passed) throw new Error('expected validated plan');
		cycle = 2;
		await assert.rejects(
			dispatchValidatedFactoryRequest({
				plan: stalePlan,
				recordDispatch: async () => {
					recorded += 1;
				},
				submitDriverRequest: async () => {
					submitted += 1;
				}
			}),
			/immutable request digest changed/
		);
		assert.equal(recorded, 0);
		assert.equal(submitted, 0);
		await assert.rejects(
			dispatchValidatedFactoryRequest({
				plan: stalePlan,
				recordDispatch: async () => {
					recorded += 1;
				},
				submitDriverRequest: async () => undefined
			}),
			/consumed/
		);

		cycle = 2;
		const singleUsePlan = checkFactoryDispatchPrerequisites({
			intent: intent(),
			runCommand: statefulRunner
		});
		assert.equal(singleUsePlan.passed, true);
		if (!singleUsePlan.passed) throw new Error('expected cycle-2 plan');
		await assert.rejects(
			dispatchValidatedFactoryRequest({
				plan: singleUsePlan,
				recordDispatch: async () => {
					recorded += 1;
				},
				submitDriverRequest: async () => {
					submitted += 1;
					throw new Error('submission failed');
				}
			}),
			/submission failed/
		);
		assert.equal(recorded, 1);
		assert.equal(submitted, 1);
		await assert.rejects(
			dispatchValidatedFactoryRequest({
				plan: singleUsePlan,
				recordDispatch: async () => {
					recorded += 1;
				},
				submitDriverRequest: async () => undefined
			}),
			/consumed/
		);
		assert.equal(recorded, 1);

		const countBoundPlan = checkFactoryDispatchPrerequisites({
			intent: intent(),
			runCommand: statefulRunner
		});
		assert.equal(countBoundPlan.passed, true);
		if (!countBoundPlan.passed) throw new Error('expected count-bound plan');
		attempts = 1;
		await assert.rejects(
			dispatchValidatedFactoryRequest({
				plan: countBoundPlan,
				recordDispatch: async () => {
					recorded += 1;
				},
				submitDriverRequest: async () => undefined
			}),
			/immutable request digest changed/
		);
		assert.equal(recorded, 1);
	});

	it('reruns every prerequisite immediately before dispatch and consumes zero attempts on stale facts', async () => {
		for (const changedFact of ['git-dirty', 'dex-blocked', 'pi-missing'] as const) {
			let gitReads = 0;
			let dexReads = 0;
			let piReads = 0;
			let recorded = 0;
			let submitted = 0;
			const refreshRunner: FactoryPrerequisiteCommandRunner = (command, args) => {
				if (command === 'swamp' && args[0] === 'data')
					return { status: 0, stdout: statusOutput(), stderr: '' };
				if (command === 'git') {
					gitReads += 1;
					return {
						status: 0,
						stdout: changedFact === 'git-dirty' && gitReads === 2 ? ' M after-plan.ts\0' : '',
						stderr: ''
					};
				}
				if (command === 'dex') {
					dexReads += 1;
					const blocked = JSON.stringify({
						results: [
							{ id: 'epic-1', parent_id: null, completed: false, started_at: null, blockedBy: [] },
							{
								id: 'task-1',
								parent_id: 'epic-1',
								completed: false,
								started_at: '2026-08-17T00:00:00Z',
								blockedBy: ['new-blocker']
							},
							{
								id: 'new-blocker',
								parent_id: null,
								completed: false,
								started_at: null,
								blockedBy: []
							}
						]
					});
					return {
						status: 0,
						stdout: changedFact === 'dex-blocked' && dexReads === 2 ? blocked : dexOutput(),
						stderr: ''
					};
				}
				if (command === 'pi') {
					piReads += 1;
					return changedFact === 'pi-missing' && piReads === 2
						? { status: 1, stdout: '', stderr: 'pi disappeared' }
						: { status: 0, stdout: 'pi 1.0', stderr: '' };
				}
				return { status: 0, stdout: '', stderr: '' };
			};
			const plan = checkFactoryDispatchPrerequisites({
				intent: intent(),
				runCommand: refreshRunner
			});
			assert.equal(plan.passed, true);
			if (!plan.passed) throw new Error('expected initially valid plan');
			await assert.rejects(
				dispatchValidatedFactoryRequest({
					plan,
					recordDispatch: async () => {
						recorded += 1;
					},
					submitDriverRequest: async () => {
						submitted += 1;
					}
				}),
				/prerequisite refresh failed/
			);
			assert.equal(recorded, 0, `${changedFact} must consume zero Factory dispatch attempts`);
			assert.equal(submitted, 0, `${changedFact} must not submit work`);
			assert.equal(gitReads, 2);
			assert.equal(dexReads, 2);
			assert.equal(piReads, 2);
		}
	});

	it('rejects a changed prerequisite fact even when the refreshed probe still passes', async () => {
		let piReads = 0;
		let recorded = 0;
		const changingFactRunner: FactoryPrerequisiteCommandRunner = (command, args) => {
			if (command === 'swamp' && args[0] === 'data')
				return { status: 0, stdout: statusOutput(), stderr: '' };
			if (command === 'dex') return { status: 0, stdout: dexOutput(), stderr: '' };
			if (command === 'pi') {
				piReads += 1;
				return { status: 0, stdout: `pi ${piReads}.0`, stderr: '' };
			}
			return { status: 0, stdout: '', stderr: '' };
		};
		const plan = checkFactoryDispatchPrerequisites({
			intent: intent(),
			runCommand: changingFactRunner
		});
		assert.equal(plan.passed, true);
		if (!plan.passed) throw new Error('expected initially valid plan');
		await assert.rejects(
			dispatchValidatedFactoryRequest({
				plan,
				recordDispatch: async () => {
					recorded += 1;
				},
				submitDriverRequest: async () => undefined
			}),
			/changed after prerequisite validation/
		);
		assert.equal(recorded, 0);
		assert.equal(piReads, 2);
	});

	it('derives the active Dex leaf and effective open root and fails closed on false or invalid ancestry', () => {
		let result = checkFactoryDispatchPrerequisites({
			intent: { ...intent(), rootEpicId: 'false-root' },
			runCommand: runner()
		});
		assert.equal(result.passed, false);
		if (!result.passed)
			assert.equal(
				result.failures.some((failure) => failure.category === 'dex-lane-invalid'),
				true
			);

		const cycleDex = JSON.stringify([
			{
				id: 'task-1',
				parent_id: 'cycle-parent',
				completed: false,
				started_at: '2026-08-17T00:00:00Z',
				blockedBy: []
			},
			{ id: 'cycle-parent', parent_id: 'task-1', completed: false, started_at: null, blockedBy: [] }
		]);
		result = checkFactoryDispatchPrerequisites({
			intent: intent(),
			runCommand: runner({ dex: cycleDex })
		});
		assert.equal(result.passed, false);
		if (!result.passed)
			assert.match(
				result.failures.find((failure) => failure.category === 'dex-lane-invalid')?.error ?? '',
				/cycle/
			);

		const missingParentDex = JSON.stringify([
			{
				id: 'task-1',
				parent_id: 'unknown-parent',
				completed: false,
				started_at: '2026-08-17T00:00:00Z',
				blockedBy: []
			}
		]);
		result = checkFactoryDispatchPrerequisites({
			intent: intent(),
			runCommand: runner({ dex: missingParentDex })
		});
		assert.equal(result.passed, false);
		if (!result.passed)
			assert.match(
				result.failures.find((failure) => failure.category === 'dex-lane-invalid')?.error ?? '',
				/missing-parent/
			);

		const unknownBlockerDex = JSON.stringify([
			{ id: 'epic-1', parent_id: null, completed: false, started_at: null, blockedBy: [] },
			{
				id: 'task-1',
				parent_id: 'epic-1',
				completed: false,
				started_at: '2026-08-17T00:00:00Z',
				blockedBy: ['unknown-blocker']
			}
		]);
		result = checkFactoryDispatchPrerequisites({
			intent: intent(),
			runCommand: runner({ dex: unknownBlockerDex })
		});
		assert.equal(result.passed, false);
		if (!result.passed)
			assert.match(
				result.failures.find((failure) => failure.category === 'dex-lane-invalid')?.error ?? '',
				/unknown blocker/
			);

		for (const openBlockerDex of [
			JSON.stringify([
				{ id: 'epic-1', parent_id: null, completed: false, started_at: null, blockedBy: [] },
				{
					id: 'task-1',
					parent_id: 'epic-1',
					completed: false,
					started_at: '2026-08-17T00:00:00Z',
					blockedBy: ['leaf-blocker']
				},
				{ id: 'leaf-blocker', parent_id: null, completed: false, started_at: null, blockedBy: [] }
			]),
			JSON.stringify([
				{
					id: 'epic-1',
					parent_id: null,
					completed: false,
					started_at: null,
					blockedBy: ['inherited-blocker']
				},
				{
					id: 'task-1',
					parent_id: 'epic-1',
					completed: false,
					started_at: '2026-08-17T00:00:00Z',
					blockedBy: []
				},
				{
					id: 'inherited-blocker',
					parent_id: null,
					completed: false,
					started_at: null,
					blockedBy: []
				}
			])
		]) {
			result = checkFactoryDispatchPrerequisites({
				intent: intent(),
				runCommand: runner({ dex: openBlockerDex })
			});
			assert.equal(result.passed, false);
			if (!result.passed)
				assert.match(
					result.failures.find((failure) => failure.category === 'dex-lane-invalid')?.error ?? '',
					/open blocker/
				);
		}

		const completedAncestorBoundaryDex = JSON.stringify([
			{
				id: 'historical-parent',
				parent_id: null,
				completed: true,
				started_at: '2026-08-01T00:00:00Z',
				blockedBy: ['historical-open-blocker']
			},
			{
				id: 'epic-1',
				parent_id: 'historical-parent',
				completed: false,
				started_at: null,
				blockedBy: []
			},
			{
				id: 'task-1',
				parent_id: 'epic-1',
				completed: false,
				started_at: '2026-08-17T00:00:00Z',
				blockedBy: ['completed-blocker']
			},
			{
				id: 'completed-blocker',
				parent_id: null,
				completed: true,
				started_at: '2026-08-01T00:00:00Z',
				blockedBy: []
			},
			{
				id: 'historical-open-blocker',
				parent_id: null,
				completed: false,
				started_at: null,
				blockedBy: []
			}
		]);
		result = checkFactoryDispatchPrerequisites({
			intent: intent(),
			runCommand: runner({ dex: completedAncestorBoundaryDex })
		});
		assert.equal(result.passed, true);
	});

	it('rejects a dispatch cycle that differs from the current stage cycle at prerequisite and refresh boundaries', async () => {
		const mismatched = checkFactoryDispatchPrerequisites({
			intent: intent(),
			runCommand: runner({
				statuses: {
					'swamp data query modelName == "supers-delivery" && name == "status-task-1" --select attributes --json':
						{
							status: 0,
							stdout: statusOutput(implementationWork, { dispatch: { cycle: 2, attempts: 0 } })
						}
				}
			})
		});
		assert.equal(mismatched.passed, false);
		if (!mismatched.passed) assert.match(mismatched.failures[0]?.error ?? '', /dispatch cycle/);

		let statusReads = 0;
		const changingRunner: FactoryPrerequisiteCommandRunner = (command, args) => {
			if (command === 'swamp' && args[0] === 'data') {
				statusReads += 1;
				return {
					status: 0,
					stdout: statusOutput(implementationWork, {
						dispatch: { cycle: statusReads === 1 ? 1 : 2, attempts: 0 }
					}),
					stderr: ''
				};
			}
			return { status: 0, stdout: command === 'dex' ? dexOutput() : '', stderr: '' };
		};
		const plan = checkFactoryDispatchPrerequisites({
			intent: intent(),
			runCommand: changingRunner
		});
		assert.equal(plan.passed, true);
		if (!plan.passed) throw new Error('expected validated cycle-bound plan');
		let recorded = 0;
		await assert.rejects(
			dispatchValidatedFactoryRequest({
				plan,
				recordDispatch: async () => {
					recorded += 1;
				},
				submitDriverRequest: async () => undefined
			}),
			/prerequisite refresh failed/
		);
		assert.equal(recorded, 0);
	});

	it('fails closed when current Factory status cannot be read or belongs to another stage', () => {
		const unavailable = checkFactoryDispatchPrerequisites({
			intent: intent(),
			runCommand: runner({
				statuses: {
					'swamp model method run supers-delivery status --input workItem=task-1': {
						status: 1,
						stderr: 'missing'
					}
				}
			})
		});
		assert.equal(unavailable.passed, false);
		if (!unavailable.passed)
			assert.equal(unavailable.failures[0]?.category, 'factory-status-unavailable');
		const stale = checkFactoryDispatchPrerequisites({
			intent: intent(),
			runCommand: runner({
				statuses: {
					'swamp data query modelName == "supers-delivery" && name == "status-task-1" --select attributes --json':
						{
							status: 0,
							stdout: statusOutput(implementationWork, { stage: { id: 'preflight', cycle: 1 } })
						}
				}
			})
		});
		assert.equal(stale.passed, false);
	});
});

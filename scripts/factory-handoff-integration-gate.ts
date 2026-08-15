import { z } from 'npm:zod@4.4.3';

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const GIT_REVISION_PATTERN = /^[0-9a-f]{40,64}$/;
const DOMAIN_ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,127}$/;
const REPOSITORY_PATH_PATTERN = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$)).+$/;

const RepositoryPathSchema = z.string().min(1).max(1_000).regex(REPOSITORY_PATH_PATTERN);
const SortedUniquePathsSchema = z
	.array(RepositoryPathSchema)
	.min(1)
	.max(2_000)
	.superRefine((paths, context) => {
		const sorted = [...new Set(paths)].sort((left, right) => left.localeCompare(right));
		if (sorted.length !== paths.length || paths.some((path, index) => path !== sorted[index])) {
			context.addIssue({
				code: 'custom',
				message: 'Changed paths must be sorted and unique'
			});
		}
	});

export const FactoryFleetWorkerOutputSchema = z.strictObject({
	rootEpicId: z.string().regex(DOMAIN_ID_PATTERN),
	activeTaskId: z.string().regex(DOMAIN_ID_PATTERN),
	baseCommit: z.string().regex(GIT_REVISION_PATTERN),
	childCommittedRevision: z.string().regex(GIT_REVISION_PATTERN),
	changedPaths: SortedUniquePathsSchema,
	commandsRun: z.array(
		z.strictObject({
			command: z.string().min(1),
			result: z.enum(['passed', 'failed', 'not-run']),
			summary: z.string().min(1)
		})
	),
	residualRisks: z.array(z.string().min(1))
});

const HandoffPatchSchema = z.strictObject({
	path: z.string().min(1),
	branch: z.string().min(1),
	changed: z.boolean(),
	diffStat: z.string(),
	filesChanged: z.number().int().nonnegative(),
	insertions: z.number().int().nonnegative(),
	deletions: z.number().int().nonnegative(),
	error: z.string().optional()
});

const HandoffChildSchema = z.strictObject({
	index: z.number().int().nonnegative(),
	taskIndex: z.number().int().nonnegative(),
	agent: z.string().min(1),
	status: z.enum(['completed', 'failed', 'paused', 'stopped', 'detached']),
	summary: z.string(),
	outputPath: z.string().optional(),
	structuredOutput: FactoryFleetWorkerOutputSchema,
	structuredOutputPath: z.string().optional(),
	sessionPath: z.string().optional(),
	patch: HandoffPatchSchema
});

const HandoffCleanupTaskSchema = z.strictObject({
	index: z.number().int().nonnegative(),
	path: z.string().min(1),
	branch: z.string().min(1),
	worktreeRemoved: z.boolean(),
	branchRemoved: z.boolean(),
	preserved: z.boolean().optional(),
	reason: z.string().optional(),
	errors: z.array(z.string()).optional()
});

const PiHandoffManifestSchema = z.strictObject({
	version: z.literal(1),
	runId: z.string().min(1),
	mode: z.enum(['parallel', 'chain']),
	source: z.enum(['foreground', 'async']),
	cwd: z.string().min(1),
	createdAt: z.number().int().nonnegative(),
	updatedAt: z.number().int().nonnegative(),
	groups: z
		.array(
			z.strictObject({
				stepIndex: z.number().int().nonnegative(),
				baseCommit: z.string().regex(GIT_REVISION_PATTERN),
				repoRoot: z.string().min(1),
				children: z.array(HandoffChildSchema).min(1),
				cleanup: z.strictObject({
					state: z.enum(['complete', 'partial']),
					tasks: z.array(HandoffCleanupTaskSchema),
					pruned: z.boolean(),
					errors: z.array(z.string()).optional()
				})
			})
		)
		.min(1)
});

export type FactoryHandoffGateRejectionReason =
	| 'manifest-invalid'
	| 'stale-target-baseline'
	| 'patch-digest-mismatch'
	| 'child-revision-mismatch'
	| 'changed-path-mismatch'
	| 'patch-conflict';

export type FactoryHandoffGateInput = {
	manifestBytes: Uint8Array;
	patchBytes: Uint8Array;
	expectedManifestDigest: string;
	expectedPatchDigest: string;
	expectedRootEpicId: string;
	expectedActiveTaskId: string;
	targetBaselineRevision: string;
	currentTargetRevision: string;
	targetClean: boolean;
	baseIsAncestorOfTarget: boolean;
	childRevisionExists: boolean;
	verifiedChildRevision: string;
	childDiffBytes: Uint8Array;
	patchChangedPaths: string[];
	patchApplies: boolean;
};

export type FactoryHandoffGateResult =
	| {
			disposition: 'accepted';
			baseCommit: string;
			childCommittedRevision: string;
			changedPaths: string[];
			handoffManifestDigest: string;
			patchDigest: string;
	  }
	| {
			disposition: 'rejected';
			rejectionReason: FactoryHandoffGateRejectionReason;
	  };

async function sha256Hex(bytes: Uint8Array): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function rejected(rejectionReason: FactoryHandoffGateRejectionReason): FactoryHandoffGateResult {
	return { disposition: 'rejected', rejectionReason };
}

/**
 * Pure fail-closed decision seam. Callers derive Git facts without mutating the
 * target, then this function binds them to the durable Pi manifest and patch.
 */
export async function verifyFactoryHandoffIntegrationGate(
	input: FactoryHandoffGateInput
): Promise<FactoryHandoffGateResult> {
	if (!SHA256_PATTERN.test(input.expectedManifestDigest)) {
		return rejected('manifest-invalid');
	}
	const manifestDigest = await sha256Hex(input.manifestBytes);
	if (manifestDigest !== input.expectedManifestDigest) {
		return rejected('manifest-invalid');
	}

	let rawManifest: unknown;
	try {
		rawManifest = JSON.parse(new TextDecoder().decode(input.manifestBytes));
	} catch {
		return rejected('manifest-invalid');
	}
	const parsedManifest = PiHandoffManifestSchema.safeParse(rawManifest);
	if (!parsedManifest.success) return rejected('manifest-invalid');
	const matches = parsedManifest.data.groups.flatMap((group) =>
		group.children
			.filter(
				(child) =>
					child.structuredOutput.rootEpicId === input.expectedRootEpicId &&
					child.structuredOutput.activeTaskId === input.expectedActiveTaskId
			)
			.map((child) => ({ group, child }))
	);
	if (matches.length !== 1) return rejected('manifest-invalid');
	const [{ group, child }] = matches;
	if (
		child.status !== 'completed' ||
		!child.patch.changed ||
		child.patch.error !== undefined ||
		group.baseCommit !== child.structuredOutput.baseCommit
	) {
		return rejected('manifest-invalid');
	}

	const patchDigest = await sha256Hex(input.patchBytes);
	if (
		!SHA256_PATTERN.test(input.expectedPatchDigest) ||
		patchDigest !== input.expectedPatchDigest
	) {
		return rejected('patch-digest-mismatch');
	}
	if (
		!input.targetClean ||
		input.currentTargetRevision !== input.targetBaselineRevision ||
		!input.baseIsAncestorOfTarget
	) {
		return rejected('stale-target-baseline');
	}
	if (
		!input.childRevisionExists ||
		input.verifiedChildRevision !== child.structuredOutput.childCommittedRevision ||
		(await sha256Hex(input.childDiffBytes)) !== patchDigest
	) {
		return rejected('child-revision-mismatch');
	}
	const parsedPatchPaths = SortedUniquePathsSchema.safeParse(input.patchChangedPaths);
	if (
		!parsedPatchPaths.success ||
		parsedPatchPaths.data.length !== child.structuredOutput.changedPaths.length ||
		parsedPatchPaths.data.some((path, index) => path !== child.structuredOutput.changedPaths[index])
	) {
		return rejected('changed-path-mismatch');
	}
	if (!input.patchApplies) return rejected('patch-conflict');

	return {
		disposition: 'accepted',
		baseCommit: group.baseCommit,
		childCommittedRevision: child.structuredOutput.childCommittedRevision,
		changedPaths: parsedPatchPaths.data,
		handoffManifestDigest: manifestDigest,
		patchDigest
	};
}

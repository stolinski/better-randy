/**
 * The seal that binds every acceptance claim for one local GFX release to one
 * release identity, and records the human aesthetic decisions
 * ([ADR-0052](../../../docs/adr/0052-public-runtime-and-retention-architecture.md),
 * [ADR-0053](../../../docs/adr/0053-gfx-namespace-and-legacy-supers-compatibility.md),
 * [ADR-0054](../../../docs/adr/0054-webmcp-operation-transaction-and-security-contract.md)).
 *
 * Acceptance was spread across six independently-run verifiers, each writing
 * its own evidence file whenever a person happened to run it. Read one at a time
 * they all say "verified". Read together they were describing five different
 * builds — the image gate measured one commit, the decode matrix another, the
 * demo-serving gate a third, and the authoring scenario recorded no build at
 * all. That is not a weaker version of acceptance; it is no acceptance, because
 * no single build was ever shown to pass everything at once.
 *
 * So this module makes the disagreement fatal instead of invisible. Every
 * artifact must state which release it measured, every statement must be the
 * same release, and a subject nothing supplies is a named rejection rather than
 * a gap a reader has to notice. The seal fails loudly and specifically far more
 * often than it succeeds, which is the point: `sealed: false` with a list of
 * exactly which artifact is stale is the useful answer almost every day.
 *
 * The identity is local. `gfx.computer` has no live origin to interrogate
 * (ADR-0052 ships a production-shaped local origin), so the release is a commit
 * in this repository plus the image and configuration built from it — never a
 * deployed URL's self-report.
 *
 * Two things it deliberately does not do. It does not run any verifier: it reads
 * what the verifiers already wrote, so a stale artifact is detected rather than
 * silently refreshed. And it does not judge appearance — the human aesthetic
 * decisions are recorded here as decisions, with the artifact each was made
 * against, and a decision still pending blocks the seal exactly like a failed
 * check does.
 */

import { hashDeterministicRenderValue } from './deterministic-render-registry-fingerprint';

/** Kept literal so a sealed manifest carries the version, not `number`. */
export const RELEASE_ACCEPTANCE_SCHEMA_VERSION = 1 as const;

/**
 * Everything the seal must bind, listed once. The type is derived from the list
 * so a subject cannot be named in one and missed in the other.
 */
export const RELEASE_ACCEPTANCE_SUBJECTS = [
	'release-commit',
	'image-runtime-digest',
	'runtime-configuration',
	'security-headers',
	'tool-schema-digest',
	'browser-versions',
	'composition-revisions',
	'operation-receipts',
	'frame-specifications',
	'capture-hashes',
	'export-hashes',
	'decode-reports',
	'negative-case-results'
] as const;

export type ReleaseAcceptanceSubject = (typeof RELEASE_ACCEPTANCE_SUBJECTS)[number];

/** How one artifact states whether its own objective checks passed. */
export type ReleaseAcceptanceOutcomeRule =
	| { kind: 'verified-flag'; path: readonly string[] }
	| { kind: 'empty-failure-list'; path: readonly string[] }
	| { kind: 'expected-literal'; path: readonly string[]; passingValue: string };

/** Where in one artifact the value backing a subject lives. */
export interface ReleaseAcceptanceSubjectBinding {
	subject: ReleaseAcceptanceSubject;
	valuePath: readonly string[];
}

export interface ReleaseAcceptanceEvidenceRow {
	claimId: string;
	/** Repository-relative path of the artifact its producer writes. */
	evidencePath: string;
	/** The one command that regenerates this artifact against a served build. */
	producerCommand: string;
	/** What this artifact is authoritative for, and why the seal needs it. */
	reason: string;
	/** Where this artifact states the release it measured. */
	releaseRevisionPath: readonly string[];
	outcome: ReleaseAcceptanceOutcomeRule;
	subjects: readonly ReleaseAcceptanceSubjectBinding[];
}

/**
 * Every artifact the seal reads, and what each one is trusted for. Ordered by
 * how far from the source each claim sits — the image built from the commit,
 * then the origin serving it, then what a browser and an agent did against it.
 *
 * Adding a verifier means adding its row: an artifact absent from this list
 * contributes nothing to acceptance no matter how green it is.
 */
export const RELEASE_ACCEPTANCE_EVIDENCE_INVENTORY: readonly ReleaseAcceptanceEvidenceRow[] = [
	{
		claimId: 'production-image',
		evidencePath: 'docs/runtime-probes/production-image.json',
		producerCommand: 'pnpm verify:production-image',
		reason:
			'The image built from the release commit, driven the way the public origin is driven. It is the only artifact that observes the pinned runtime, the container configuration, and the response headers the origin actually sends, so the seal takes all three from here.',
		releaseRevisionPath: ['release'],
		outcome: { kind: 'verified-flag', path: ['verified'] },
		subjects: [
			{ subject: 'release-commit', valuePath: ['readiness', 'body', 'release'] },
			{ subject: 'image-runtime-digest', valuePath: ['build', 'versions'] },
			{ subject: 'runtime-configuration', valuePath: ['imageConfiguration'] },
			{ subject: 'security-headers', valuePath: ['publicResponseHeaders'] }
		]
	},
	{
		claimId: 'production-demo-serving',
		evidencePath: 'docs/runtime-probes/production-demo-serving.json',
		producerCommand: 'pnpm verify:production-demo',
		reason:
			'The built artifact serving the demo end to end, including a rollback and roll-forward. Its app shell reports the release independently of the health endpoint, which is the second reading that makes a single-source release claim into a cross-checked one.',
		releaseRevisionPath: ['servedIdentity', 'appShellRelease'],
		outcome: { kind: 'verified-flag', path: ['verified'] },
		subjects: [
			{ subject: 'release-commit', valuePath: ['servedIdentity', 'health', 'release'] },
			{ subject: 'export-hashes', valuePath: ['browserExports', 'lanes'] }
		]
	},
	{
		claimId: 'public-export-decode-matrix',
		evidencePath: 'docs/runtime-probes/public-export-decode-matrix.json',
		producerCommand: 'pnpm verify:export-decode:public-matrix',
		reason:
			'Every supported export lane encoded at the native target and decoded back. Lane fidelity is measured only here; the image gate deliberately runs reduced-size frames because it is measuring the image, not the encoder.',
		releaseRevisionPath: ['health', 'body', 'release'],
		outcome: { kind: 'empty-failure-list', path: ['faults'] },
		subjects: [{ subject: 'decode-reports', valuePath: ['lanes'] }]
	},
	{
		claimId: 'browser-render-verification',
		evidencePath: 'docs/browser-probes/browser-render-verification.json',
		producerCommand: 'pnpm verify:browser-render',
		reason:
			'The render matrix: which exact frame of which Preset, Pack, and orientation was captured, and what it hashed to. This is where the seal gets frame specifications that are pinned rather than described.',
		releaseRevisionPath: ['sourceRevision'],
		outcome: { kind: 'expected-literal', path: ['summary', 'outcome'], passingValue: 'pass' },
		subjects: [{ subject: 'frame-specifications', valuePath: ['coordinates'] }]
	},
	{
		claimId: 'gfx-authoring-scenario',
		evidencePath: 'docs/browser-probes/gfx-authoring-scenario.json',
		producerCommand: 'pnpm verify:authoring-scenario',
		reason:
			'One whole piece authored and exported through WebMCP alone, plus the refusals. It carries the receipts, the revisions they moved, the pixels that came back, the files that were downloaded, and every negative case, so it is the centre of the seal rather than one more check.',
		releaseRevisionPath: ['release'],
		outcome: { kind: 'verified-flag', path: ['verified'] },
		subjects: [
			{ subject: 'operation-receipts', valuePath: ['calls'] },
			{ subject: 'composition-revisions', valuePath: ['history'] },
			{ subject: 'capture-hashes', valuePath: ['authoring', 'authoredFrame', 'sha256'] },
			{ subject: 'export-hashes', valuePath: ['deliveries'] },
			{ subject: 'negative-case-results', valuePath: ['negatives'] },
			{ subject: 'browser-versions', valuePath: ['harness', 'browser'] }
		]
	},
	{
		claimId: 'webmcp-agent-eval',
		evidencePath: 'docs/browser-probes/webmcp-agent-eval.json',
		producerCommand: 'pnpm eval:webmcp',
		reason:
			'What an attached agent discovers on a live page. It enumerates the registered tools, so it is the one artifact that can digest the schemas an agent was actually offered rather than the schemas the inventory says it should have been.',
		releaseRevisionPath: ['release'],
		outcome: { kind: 'empty-failure-list', path: ['failures'] },
		subjects: [
			{ subject: 'tool-schema-digest', valuePath: ['toolSchemaDigest'] },
			{ subject: 'browser-versions', valuePath: ['harness', 'browser'] }
		]
	}
];

/**
 * A human aesthetic decision the seal records. `pending` is a real state, not a
 * placeholder: the factory's aesthetic gate collects the answer from Scott
 * against a named artifact, and until it does the release is genuinely not
 * accepted.
 */
export type HumanAestheticDecision =
	| {
			decisionId: string;
			status: 'ratified';
			/** What was decided, in the words the decision was made in. */
			subject: string;
			choice: string;
			/** ISO calendar date, in the local sense of "the day Scott said yes". */
			decidedOn: string;
			decidedBy: string;
			/** Repository-relative path of the record that carries the decision. */
			recordPath: string;
			/** An earlier ratification this one retired, when there was one. */
			supersedes: string | null;
	  }
	| {
			decisionId: string;
			status: 'pending';
			subject: string;
			/** The artifact the decision will be made against. */
			awaitingArtifact: string;
			collectedBy: string;
	  };

/**
 * The aesthetic decisions this release turns on. Both are Scott's alone —
 * deterministic checks decide pass and fail, and neither of these is a thing a
 * check can answer.
 */
export const RELEASE_ACCEPTANCE_HUMAN_DECISIONS: readonly HumanAestheticDecision[] = [
	{
		decisionId: 'identity-mark',
		status: 'ratified',
		subject: 'The gfx.computer logo, wordmark, and title card',
		choice:
			'the Slate — a stack of opaque cards fanning up-left behind a black top card, coloured by a luminance decay ramp, with the one-ink cuts removed so every surface carries the full stack',
		decidedOn: '2026-08-31',
		decidedBy: 'Scott',
		recordPath: 'docs/identity/README.md',
		supersedes:
			'the achromatic Quarter (alpha-cell-b), ratified 2026-08-28 and retired the same day the Slate was chosen'
	},
	{
		decisionId: 'scenario-composition',
		status: 'pending',
		subject:
			'The composition the public create-to-export scenario authors, judged from the frames it captures and the files it exports',
		awaitingArtifact: 'docs/browser-probes/gfx-authoring-scenario.json',
		collectedBy: 'the gfx-factory aesthetic gate'
	}
];

export interface LocalReleaseIdentity {
	/** The 40-character release commit every claim must resolve to. */
	sourceRevision: string;
	/** The working-tree fingerprint observed when the seal was taken. */
	treeFingerprint: string;
}

/** One artifact as the caller found it on disk; `null` when it is not there. */
export interface ReleaseAcceptanceEvidenceDocument {
	claimId: string;
	document: unknown;
}

export type ReleaseAcceptanceRejectionCode =
	| 'evidence-absent'
	| 'release-identity-unreadable'
	| 'release-identity-mismatch'
	| 'objective-check-failed'
	| 'subject-value-absent'
	| 'subject-uncovered'
	| 'worktree-not-committed'
	| 'human-decision-pending';

export interface ReleaseAcceptanceRejection {
	code: ReleaseAcceptanceRejectionCode;
	/** The artifact at fault, or `null` when the rejection is about the release. */
	claimId: string | null;
	detail: string;
}

export interface ReleaseAcceptanceBoundSubject {
	subject: ReleaseAcceptanceSubject;
	valueDigest: string;
}

export interface ReleaseAcceptanceClaim {
	claimId: string;
	evidencePath: string;
	producerCommand: string;
	claimedReleaseRevision: string | null;
	measuredAt: string | null;
	objectiveOutcome: 'passed' | 'failed' | 'unreadable';
	boundSubjects: readonly ReleaseAcceptanceBoundSubject[];
	accepted: boolean;
}

export interface ReleaseAcceptanceSubjectCoverage {
	subject: ReleaseAcceptanceSubject;
	claimIds: readonly string[];
}

export interface ReleaseAcceptanceManifest {
	schemaVersion: typeof RELEASE_ACCEPTANCE_SCHEMA_VERSION;
	sealedAt: string;
	releaseIdentity: LocalReleaseIdentity;
	claims: readonly ReleaseAcceptanceClaim[];
	subjectCoverage: readonly ReleaseAcceptanceSubjectCoverage[];
	humanDecisions: readonly HumanAestheticDecision[];
	rejections: readonly ReleaseAcceptanceRejection[];
	sealed: boolean;
	/**
	 * Content address of everything above except `sealedAt`. Sealing the same
	 * evidence twice yields the same digest, so the digest names the accepted
	 * release rather than the moment somebody ran the command.
	 */
	manifestDigest: string;
}

export interface ReleaseAcceptanceSealInput {
	releaseIdentity: LocalReleaseIdentity;
	sealedAt: string;
	/**
	 * Repository-relative paths that differ from the release commit. A release is
	 * sealed from a committed tree: uncommitted work means the evidence and the
	 * manifest are describing different source.
	 */
	uncommittedPaths: readonly string[];
	evidence: readonly ReleaseAcceptanceEvidenceDocument[];
	humanDecisions: readonly HumanAestheticDecision[];
}

const RELEASE_COMMIT_PATTERN = /^[0-9a-f]{40}$/;

/**
 * The commit inside a release statement. Accepts the `gfx@<commit>` form the
 * health endpoint and the image report use, and the bare commit the render
 * matrix records. Anything else — including the `gfx@probe` placeholder a probe
 * host reports when it was never given a release — reads as unreadable, which is
 * the honest answer: that artifact cannot say which build it measured.
 */
export function parseGfxReleaseCommit(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const commit = value.startsWith('gfx@') ? value.slice('gfx@'.length) : value;
	return RELEASE_COMMIT_PATTERN.test(commit) ? commit : null;
}

/** The value at a path, or `undefined` as soon as the path leaves the document. */
function readDocumentPath(document: unknown, path: readonly string[]): unknown {
	let current = document;
	for (const key of path) {
		if (typeof current !== 'object' || current === null) return undefined;
		current = (current as Record<string, unknown>)[key];
	}
	return current;
}

function readMeasuredAt(document: unknown): string | null {
	for (const key of ['measuredAt', 'generatedAt']) {
		const value = readDocumentPath(document, [key]);
		if (typeof value === 'string') return value;
	}
	return null;
}

function readObjectiveOutcome(
	rule: ReleaseAcceptanceOutcomeRule,
	document: unknown
): 'passed' | 'failed' | 'unreadable' {
	const value = readDocumentPath(document, rule.path);
	if (rule.kind === 'verified-flag') {
		if (typeof value !== 'boolean') return 'unreadable';
		return value ? 'passed' : 'failed';
	}
	if (rule.kind === 'empty-failure-list') {
		if (!Array.isArray(value)) return 'unreadable';
		return value.length === 0 ? 'passed' : 'failed';
	}
	if (typeof value !== 'string') return 'unreadable';
	return value === rule.passingValue ? 'passed' : 'failed';
}

function describeOutcomeRule(rule: ReleaseAcceptanceOutcomeRule): string {
	const path = rule.path.join('.');
	if (rule.kind === 'verified-flag') return `${path} is not true`;
	if (rule.kind === 'empty-failure-list') return `${path} is not empty`;
	return `${path} is not "${rule.passingValue}"`;
}

/**
 * Bind every acceptance claim to one release, or say precisely why the release
 * cannot be sealed. A rejected seal is the normal result whenever any verifier
 * has not been re-run against the current commit.
 */
export async function sealReleaseAcceptanceManifest(
	input: ReleaseAcceptanceSealInput
): Promise<ReleaseAcceptanceManifest> {
	const sourceRevision = parseGfxReleaseCommit(input.releaseIdentity.sourceRevision);
	if (sourceRevision === null) {
		throw new TypeError(
			`A release is sealed against a 40-character commit, not "${String(input.releaseIdentity.sourceRevision)}"`
		);
	}

	const documentsByClaimId = new Map(
		input.evidence.map((entry) => [entry.claimId, entry.document])
	);
	const rejections: ReleaseAcceptanceRejection[] = [];
	const claims: ReleaseAcceptanceClaim[] = [];

	for (const row of RELEASE_ACCEPTANCE_EVIDENCE_INVENTORY) {
		if (!documentsByClaimId.has(row.claimId)) {
			throw new TypeError(
				`Sealing needs a reading for every inventory row, including ${row.claimId}`
			);
		}
		const document = documentsByClaimId.get(row.claimId);
		const shared = {
			claimId: row.claimId,
			evidencePath: row.evidencePath,
			producerCommand: row.producerCommand
		};

		if (document === null) {
			rejections.push({
				code: 'evidence-absent',
				claimId: row.claimId,
				detail: `${row.evidencePath} has never been written — run ${row.producerCommand}`
			});
			claims.push({
				...shared,
				claimedReleaseRevision: null,
				measuredAt: null,
				objectiveOutcome: 'unreadable',
				boundSubjects: [],
				accepted: false
			});
			continue;
		}

		const claimedReleaseRevision = parseGfxReleaseCommit(
			readDocumentPath(document, row.releaseRevisionPath)
		);
		const objectiveOutcome = readObjectiveOutcome(row.outcome, document);
		const measuredAt = readMeasuredAt(document);
		let accepted = true;

		if (claimedReleaseRevision === null) {
			accepted = false;
			rejections.push({
				code: 'release-identity-unreadable',
				claimId: row.claimId,
				detail: `${row.evidencePath} does not state which release it measured at ${row.releaseRevisionPath.join('.')}`
			});
		} else if (claimedReleaseRevision !== sourceRevision) {
			accepted = false;
			rejections.push({
				code: 'release-identity-mismatch',
				claimId: row.claimId,
				detail: `${row.evidencePath} measured ${claimedReleaseRevision}, not ${sourceRevision} — re-run ${row.producerCommand}`
			});
		}

		if (objectiveOutcome !== 'passed') {
			accepted = false;
			rejections.push({
				code: 'objective-check-failed',
				claimId: row.claimId,
				detail:
					objectiveOutcome === 'unreadable'
						? `${row.evidencePath} does not report an outcome at ${row.outcome.path.join('.')}`
						: `${row.evidencePath} reports its own failure: ${describeOutcomeRule(row.outcome)}`
			});
		}

		const boundSubjects: ReleaseAcceptanceBoundSubject[] = [];
		for (const binding of row.subjects) {
			const value = readDocumentPath(document, binding.valuePath);
			if (value === undefined || value === null) {
				accepted = false;
				rejections.push({
					code: 'subject-value-absent',
					claimId: row.claimId,
					detail: `${row.evidencePath} carries no ${binding.subject} at ${binding.valuePath.join('.')}`
				});
				continue;
			}
			boundSubjects.push({
				subject: binding.subject,
				valueDigest: await hashDeterministicRenderValue(value)
			});
		}

		claims.push({
			...shared,
			claimedReleaseRevision,
			measuredAt,
			objectiveOutcome,
			boundSubjects,
			accepted
		});
	}

	const subjectCoverage = RELEASE_ACCEPTANCE_SUBJECTS.map((subject) => ({
		subject,
		claimIds: claims
			.filter(
				(claim) => claim.accepted && claim.boundSubjects.some((bound) => bound.subject === subject)
			)
			.map((claim) => claim.claimId)
	}));
	// Reported coverage counts accepted claims only, but a subject is called
	// uncovered only when nothing produced a value for it at all. A subject whose
	// artifact is merely stale is already rejected as a stale artifact, and saying
	// it twice buries the one subject nobody measures under twelve that are fine.
	for (const subject of RELEASE_ACCEPTANCE_SUBJECTS) {
		if (claims.some((claim) => claim.boundSubjects.some((bound) => bound.subject === subject))) {
			continue;
		}
		rejections.push({
			code: 'subject-uncovered',
			claimId: null,
			detail: `No artifact in this repository produces ${subject}`
		});
	}

	for (const path of [...input.uncommittedPaths].sort((left, right) => left.localeCompare(right))) {
		rejections.push({
			code: 'worktree-not-committed',
			claimId: null,
			detail: `${path} differs from ${sourceRevision}, so the sealed tree is not the released tree`
		});
	}

	for (const decision of input.humanDecisions) {
		if (decision.status === 'ratified') continue;
		rejections.push({
			code: 'human-decision-pending',
			claimId: null,
			detail: `${decision.decisionId} is still with ${decision.collectedBy}, judged against ${decision.awaitingArtifact}`
		});
	}

	const content = {
		schemaVersion: RELEASE_ACCEPTANCE_SCHEMA_VERSION,
		releaseIdentity: { ...input.releaseIdentity, sourceRevision },
		claims,
		subjectCoverage,
		humanDecisions: input.humanDecisions,
		rejections,
		sealed: rejections.length === 0
	};
	return {
		...content,
		sealedAt: input.sealedAt,
		manifestDigest: await hashDeterministicRenderValue(content)
	};
}

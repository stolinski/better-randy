/**
 * The User Pack operations of the `appearance` family (ADR-0055, ADR-0054):
 * list, fork from a built-in, save, delete, validate. Pack documents are store
 * documents rather than the open composition, so their revision token is the
 * document's `contentHash`: a save or delete names the hash the caller read,
 * and the store refuses to apply over a document that has moved. Every write
 * lands through `userPackStore` — the same transport the Pack control uses —
 * and a saved pack is activated into the runtime so a composition bound to it
 * re-dresses at once.
 *
 * Nothing here can touch the catalog: a User Pack never shadows a registered
 * slug, never gains a catalog status, and forking accepts built-ins only.
 */
import { compositionEditHistory } from './composition-edit-history';
import {
	readOpenCompositionDocument,
	readOpenCompositionSlug,
	refuseCompositionOperation,
	requireCompositionOperationRow,
	type CompositionOperationFailure
} from './composition-operation-preflight';
import { moveCompositionWorkspaceFocus } from './composition-workspace-focus';
import { PACK_REGISTRY } from './packs/registry';
import { PACK_SLUG_PATTERN, type PackFont, type PackManifest, type PackRole } from './packs/types';
import type { PackValidationIssue } from './packs/validation';
import { activateUserPackDocument, deactivateUserPack } from './user-pack-runtime';
import { loadedUserPackDocument } from './user-pack-runtime.svelte';
import {
	parsePackManifestWire,
	userPackStore,
	type UserPackDocument,
	type UserPackMeta,
	type UserPackStore
} from './user-pack-store';
import { UserPackRevisionConflictError, UserPackValidationError } from './user-pack-store-errors';
import { nextUserPackSlug } from '$lib/utils/user-pack-slug';

import type { WebmcpOperationRow } from './webmcp-operation-inventory';

/** Enough packs for any drafting lane, few enough to stay inside the result budget. */
export const USER_PACK_LIST_LIMIT = 20;
/** Issues a refusal carries; the rest are counted, not repeated. */
export const USER_PACK_ISSUE_LIMIT = 20;

export interface UserPackListEntry {
	slug: string;
	label: string;
	description: string;
	forkedFrom: string | null;
	savedAt: string;
	/** The revision a save or delete must name. */
	contentHash: string;
	/** Whether the open composition is dressed in this pack right now. */
	bound: boolean;
}

export interface UserPackListReceipt {
	status: 'inspected';
	operationId: string;
	packs: readonly UserPackListEntry[];
	total: number;
	truncated: boolean;
}

export interface UserPackReceipt {
	status: 'applied';
	operationId: string;
	slug: string;
	label: string;
	forkedFrom: string | null;
	savedAt: string;
	/** The new revision; the next save must name it. */
	contentHash: string;
	/** Same-origin faces the origin materialized for the pack's font claims. */
	fontFaces: number;
	/** The composition revision, unchanged: a pack write never edits the document. */
	revision: number;
	focus: 'composition-root';
}

export interface UserPackValidationReceipt {
	status: 'inspected';
	operationId: string;
	slug: string;
	valid: boolean;
	issues: readonly PackValidationIssue[];
	issueCount: number;
}

export type UserPackListOutcome = UserPackListReceipt | CompositionOperationFailure;
export type UserPackOutcome = UserPackReceipt | CompositionOperationFailure;
export type UserPackValidationOutcome = UserPackValidationReceipt | CompositionOperationFailure;

export interface ForkUserPackRequest {
	builtinSlug: string;
	/** Absent, the fork is named after its built-in: `<slug>-copy`. */
	slug?: string;
	label?: string;
	description?: string;
}

export interface SaveUserPackRequest {
	slug: string;
	/** The `contentHash` the caller read; the save applies against it or not at all. */
	expectedContentHash: string;
	/** A whole manifest, replacing the stored one. Exclusive with the partial fields. */
	document?: unknown;
	label?: string;
	description?: string;
	/** Roles to set, keyed by role name; `null` drops a role. */
	roles?: Readonly<Record<string, unknown>>;
	/** The whole font declaration list, replacing the stored one. */
	fonts?: unknown;
}

export interface DeleteUserPackRequest {
	slug: string;
	expectedContentHash: string;
}

export interface ValidateUserPackRequest {
	document: unknown;
}

function refuseStoreFailure(row: WebmcpOperationRow, cause: unknown): CompositionOperationFailure {
	console.error(`${row.id} could not reach the User Pack store`, cause);
	return refuseCompositionOperation(
		row,
		compositionEditHistory.revision,
		'storage_unavailable',
		`The User Pack store did not answer: ${cause instanceof Error ? cause.message : String(cause)}`
	);
}

function refuseWithIssues(
	row: WebmcpOperationRow,
	slug: string,
	issues: readonly PackValidationIssue[]
): CompositionOperationFailure {
	const named = issues.slice(0, USER_PACK_ISSUE_LIMIT);
	return refuseCompositionOperation(
		row,
		compositionEditHistory.revision,
		'semantic_invalid',
		`User Pack "${slug}" was refused: ${named.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`).join('; ')}${issues.length > named.length ? ` (+${issues.length - named.length} more)` : ''}`,
		{ rejected: slug }
	);
}

function refuseStaleContentHash(
	row: WebmcpOperationRow,
	slug: string,
	current: string
): CompositionOperationFailure {
	return refuseCompositionOperation(
		row,
		compositionEditHistory.revision,
		'stale_revision',
		`User Pack "${slug}" is at revision ${current}, not the one you read; list the packs and apply the edit against the current contentHash.`,
		{ rejected: slug, alternatives: [current] }
	);
}

function boundPackSlug(): string | null {
	return readOpenCompositionSlug() === null ? null : readOpenCompositionDocument().pack;
}

function receiptFor(
	row: WebmcpOperationRow,
	slug: string,
	document: UserPackDocument
): UserPackReceipt {
	return {
		status: 'applied',
		operationId: row.id,
		slug,
		label: document.manifest.label,
		forkedFrom: document.forkedFrom,
		savedAt: document.savedAt,
		contentHash: document.contentHash,
		fontFaces: document.fontFaces.length,
		revision: compositionEditHistory.revision,
		focus: 'composition-root'
	};
}

/** What the store holds, newest save first, marking the pack the open composition wears. */
export async function runInspectUserPackStoreOperation(
	store: UserPackStore = userPackStore
): Promise<UserPackListOutcome> {
	const row = requireCompositionOperationRow('appearance.inspect-user-pack-store');
	let stored: UserPackMeta[];
	try {
		stored = await store.listUserPacks();
	} catch (cause) {
		return refuseStoreFailure(row, cause);
	}
	const bound = boundPackSlug();
	const packs = stored.map<UserPackListEntry>((meta) => ({
		slug: meta.slug,
		label: meta.label,
		description: meta.description,
		forkedFrom: meta.forkedFrom,
		savedAt: meta.savedAt,
		contentHash: meta.contentHash,
		bound: meta.slug === bound
	}));
	return {
		status: 'inspected',
		operationId: row.id,
		packs: packs.slice(0, USER_PACK_LIST_LIMIT),
		total: packs.length,
		truncated: packs.length > USER_PACK_LIST_LIMIT
	};
}

/**
 * Fork a built-in into the store. Built-ins only: forks of forks are not a
 * store capability, and a User Pack slug can never be a registered one.
 */
export async function runForkUserPackOperation(
	request: ForkUserPackRequest,
	store: UserPackStore = userPackStore
): Promise<UserPackOutcome> {
	const row = requireCompositionOperationRow('appearance.fork-user-pack');
	const builtin = PACK_REGISTRY[request.builtinSlug];
	if (builtin === undefined) {
		return refuseCompositionOperation(
			row,
			compositionEditHistory.revision,
			'unsupported_variant',
			`"${request.builtinSlug}" is not a built-in Pack; only the catalog can be forked.`,
			{ rejected: request.builtinSlug, alternatives: Object.keys(PACK_REGISTRY) }
		);
	}
	let stored: UserPackMeta[];
	try {
		stored = await store.listUserPacks();
	} catch (cause) {
		return refuseStoreFailure(row, cause);
	}
	const taken = [...Object.keys(PACK_REGISTRY), ...stored.map((meta) => meta.slug)];
	const slug = request.slug ?? nextUserPackSlug(builtin.slug, taken);
	if (!PACK_SLUG_PATTERN.test(slug)) {
		return refuseCompositionOperation(
			row,
			compositionEditHistory.revision,
			'invalid_argument',
			`"${slug}" is not a User Pack slug; use lowercase kebab-case.`,
			{ rejected: slug, alternatives: [nextUserPackSlug(builtin.slug, taken)] }
		);
	}
	if (PACK_REGISTRY[slug] !== undefined) {
		return refuseCompositionOperation(
			row,
			compositionEditHistory.revision,
			'unsupported_variant',
			`"${slug}" is a built-in Pack's slug; a User Pack never shadows the catalog.`,
			{ rejected: slug, alternatives: [nextUserPackSlug(builtin.slug, taken)] }
		);
	}
	if (stored.some((meta) => meta.slug === slug)) {
		return refuseCompositionOperation(
			row,
			compositionEditHistory.revision,
			'unknown_target',
			`The store already holds a User Pack at "${slug}"; save it, or fork under another slug.`,
			{ rejected: slug, alternatives: [nextUserPackSlug(builtin.slug, taken)] }
		);
	}

	let document: UserPackDocument;
	try {
		document = await store.forkUserPack(slug, builtin.slug, {
			label: request.label ?? `${builtin.label} copy`,
			...(request.description !== undefined ? { description: request.description } : {})
		});
	} catch (cause) {
		if (cause instanceof UserPackValidationError) return refuseWithIssues(row, slug, cause.issues);
		return refuseStoreFailure(row, cause);
	}
	activateUserPackDocument(slug, document);
	moveCompositionWorkspaceFocus({ target: 'composition-root' });
	return receiptFor(row, slug, document);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Apply the partial fields of a save over the stored manifest; `null` in `roles` drops a role. */
function mergeUserPackManifest(
	held: PackManifest,
	request: SaveUserPackRequest
): { manifest: PackManifest } | { invalid: string } {
	const roles: Record<string, PackRole> = { ...held.roles };
	for (const [role, value] of Object.entries(request.roles ?? {})) {
		if (value === null) {
			delete roles[role];
			continue;
		}
		if (!isRecord(value) || (value.kind !== 'style' && value.kind !== 'chrome')) {
			return {
				invalid: `roles.${role} must be { kind: "style", value } or { kind: "chrome", effects }, or null to drop it`
			};
		}
		roles[role] = value as unknown as PackRole;
	}
	let fonts: readonly PackFont[] | undefined = held.fonts;
	if (request.fonts !== undefined) {
		if (!Array.isArray(request.fonts))
			return { invalid: 'fonts must be an array of { family, weights?, style? }' };
		fonts = request.fonts as PackFont[];
	}
	return {
		manifest: {
			slug: held.slug,
			label: request.label ?? held.label,
			description: request.description ?? held.description,
			roles,
			...(fonts ? { fonts } : {})
		}
	};
}

/**
 * Save a User Pack against the revision the caller read: a whole manifest, or
 * label / description / role / font changes over what the store holds. The
 * structural and catalog checks run here first so a refusal is cheap; the
 * origin repeats them, materializes the fonts, and stamps the new revision.
 */
export async function runSaveUserPackOperation(
	request: SaveUserPackRequest,
	store: UserPackStore = userPackStore
): Promise<UserPackOutcome> {
	const row = requireCompositionOperationRow('appearance.save-user-pack');
	if (PACK_REGISTRY[request.slug] !== undefined) {
		return refuseCompositionOperation(
			row,
			compositionEditHistory.revision,
			'unsupported_variant',
			`"${request.slug}" is a built-in Pack; the catalog is never edited through the store. Fork it first.`,
			{ rejected: request.slug, alternatives: ['appearance.fork-user-pack'] }
		);
	}
	let held: UserPackDocument | null = loadedUserPackDocument(request.slug);
	if (held === null) {
		try {
			held = await store.loadUserPack(request.slug);
		} catch (cause) {
			return refuseStoreFailure(row, cause);
		}
	}
	if (held === null) {
		return refuseCompositionOperation(
			row,
			compositionEditHistory.revision,
			'unknown_target',
			`The store holds no User Pack at "${request.slug}".`,
			{ rejected: request.slug, alternatives: ['appearance.inspect-user-pack-store'] }
		);
	}
	if (held.contentHash !== request.expectedContentHash) {
		return refuseStaleContentHash(row, request.slug, held.contentHash);
	}

	let manifest: PackManifest;
	if (request.document !== undefined) {
		if (
			request.label !== undefined ||
			request.description !== undefined ||
			request.roles !== undefined ||
			request.fonts !== undefined
		) {
			return refuseCompositionOperation(
				row,
				compositionEditHistory.revision,
				'invalid_argument',
				'Send either a whole document or the partial fields, not both.',
				{
					rejected: 'document',
					alternatives: ['document', 'label', 'description', 'roles', 'fonts']
				}
			);
		}
		try {
			manifest = { ...parsePackManifestWire(request.document), slug: request.slug };
		} catch (cause) {
			return refuseCompositionOperation(
				row,
				compositionEditHistory.revision,
				'schema_invalid',
				`That document is not a pack manifest: ${cause instanceof Error ? cause.message : String(cause)}`,
				{ rejected: 'document' }
			);
		}
	} else {
		const merged = mergeUserPackManifest(held.manifest, request);
		if ('invalid' in merged) {
			return refuseCompositionOperation(
				row,
				compositionEditHistory.revision,
				'invalid_argument',
				merged.invalid,
				{ rejected: 'roles' }
			);
		}
		manifest = merged.manifest;
	}

	// The validator carries the vendored Google Fonts catalog; loaded here, on
	// demand, so the boot bundle never does.
	const { validateUserPackManifest } = await import('./packs/validation');
	const issues = validateUserPackManifest(manifest, { storeSlug: request.slug });
	if (issues.length > 0) return refuseWithIssues(row, request.slug, issues);

	let saved: UserPackDocument;
	try {
		saved = await store.saveUserPack(request.slug, manifest, request.expectedContentHash);
	} catch (cause) {
		if (cause instanceof UserPackValidationError) {
			return refuseWithIssues(row, request.slug, cause.issues);
		}
		if (cause instanceof UserPackRevisionConflictError) {
			return refuseStaleContentHash(row, request.slug, cause.currentContentHash);
		}
		return refuseStoreFailure(row, cause);
	}
	activateUserPackDocument(request.slug, saved);
	moveCompositionWorkspaceFocus({ target: 'composition-root' });
	return receiptFor(row, request.slug, saved);
}

/**
 * Delete a User Pack from the store (it goes to trash). Refuses while the open
 * composition is dressed in it: bind another Pack first, so nothing on the
 * render ever reads a pack that is gone.
 */
export async function runDeleteUserPackOperation(
	request: DeleteUserPackRequest,
	store: UserPackStore = userPackStore
): Promise<UserPackOutcome> {
	const row = requireCompositionOperationRow('appearance.delete-user-pack');
	if (PACK_REGISTRY[request.slug] !== undefined) {
		return refuseCompositionOperation(
			row,
			compositionEditHistory.revision,
			'unsupported_variant',
			`"${request.slug}" is a built-in Pack; the catalog cannot be deleted.`,
			{ rejected: request.slug, alternatives: ['appearance.inspect-user-pack-store'] }
		);
	}
	if (request.slug === boundPackSlug()) {
		return refuseCompositionOperation(
			row,
			compositionEditHistory.revision,
			'precondition_unmet',
			`The open composition is dressed in "${request.slug}"; bind another Pack with appearance.set-pack before deleting it.`,
			{ rejected: request.slug, alternatives: ['appearance.set-pack'] }
		);
	}
	let held: UserPackDocument | null = loadedUserPackDocument(request.slug);
	if (held === null) {
		try {
			held = await store.loadUserPack(request.slug);
		} catch (cause) {
			return refuseStoreFailure(row, cause);
		}
	}
	if (held === null) {
		return refuseCompositionOperation(
			row,
			compositionEditHistory.revision,
			'unknown_target',
			`The store holds no User Pack at "${request.slug}".`,
			{ rejected: request.slug, alternatives: ['appearance.inspect-user-pack-store'] }
		);
	}
	if (held.contentHash !== request.expectedContentHash) {
		return refuseStaleContentHash(row, request.slug, held.contentHash);
	}
	try {
		await store.deleteUserPack(request.slug);
	} catch (cause) {
		return refuseStoreFailure(row, cause);
	}
	deactivateUserPack(request.slug);
	moveCompositionWorkspaceFocus({ target: 'composition-root' });
	return receiptFor(row, request.slug, held);
}

/** The issues a save of `document` would be refused with, without storing anything. */
export async function runValidateUserPackOperation(
	request: ValidateUserPackRequest
): Promise<UserPackValidationOutcome> {
	const row = requireCompositionOperationRow('appearance.validate-user-pack');
	let manifest: PackManifest;
	try {
		manifest = parsePackManifestWire(request.document);
	} catch (cause) {
		return refuseCompositionOperation(
			row,
			compositionEditHistory.revision,
			'schema_invalid',
			`That document is not a pack manifest: ${cause instanceof Error ? cause.message : String(cause)}`,
			{ rejected: 'document' }
		);
	}
	const { validateUserPackManifest } = await import('./packs/validation');
	const issues: PackValidationIssue[] = [...validateUserPackManifest(manifest)];
	if (PACK_REGISTRY[manifest.slug] !== undefined) {
		issues.push({
			pack: manifest.slug,
			path: ['slug'],
			kind: 'shadows-builtin-pack',
			message: `Pack slug "${manifest.slug}" belongs to a built-in pack; a user pack never shadows the catalog`
		});
	}
	return {
		status: 'inspected',
		operationId: row.id,
		slug: manifest.slug,
		valid: issues.length === 0,
		issues: issues.slice(0, USER_PACK_ISSUE_LIMIT),
		issueCount: issues.length
	};
}

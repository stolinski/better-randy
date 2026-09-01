/**
 * The User Pack store: one contract and, in v1, one backend — the disk-backed
 * origin store behind `/api/user-packs` (ADR-0055). It mirrors the User
 * composition store: every caller — the Pack control, the `appearance` WebMCP
 * family, pack resolution — goes through this object, which is what makes the
 * GUI and an agent share one store.
 *
 * A User Pack is a `PackManifest` document plus store metadata. Its
 * `contentHash` is the revision token a mutating operation observes
 * (ADR-0054): a save names the hash it read, and the origin refuses to apply
 * over a document that has moved. `fontFaces` are the same-origin faces the
 * origin materialized for the manifest's font claims at save time; the client
 * registers them before the pack renders.
 *
 * The public demo profile has no pack store at all — its routes refuse — so
 * developing against this store is never permission to keep a visitor's packs.
 */
import { z } from 'zod';

import type { PackFont, PackManifest, PackRole } from './packs/types';
import { formatPackValidationIssues, type PackValidationIssue } from './packs/validation';
import { UserPackFontFaceSchema, type UserPackFontFace } from './user-pack-font-faces';
import {
	UserPackNotHeldError,
	UserPackRevisionConflictError,
	UserPackValidationError
} from './user-pack-store-errors';

const PackStyleRoleSchema = z.strictObject({ kind: z.literal('style'), value: z.unknown() });
const PackPipelineRoleSchema = z.strictObject({
	kind: z.literal('pipeline'),
	pipeline: z.string().min(1),
	params: z.record(z.string(), z.unknown()).optional()
});
const PackChromeRoleSchema = z.strictObject({
	kind: z.literal('chrome'),
	effects: z.array(
		z.strictObject({
			type: z.string().min(1),
			params: z.record(z.string(), z.unknown()).optional()
		})
	)
});
const PackFontSchema = z.strictObject({
	family: z.string(),
	weights: z.array(z.number()).optional(),
	style: z.string().optional()
});

/**
 * The manifest as it crosses the wire. Structural only: whether the roles and
 * fonts are VALID is `validateUserPackManifest`'s question, asked by the origin
 * on every save.
 */
export const PackManifestWireSchema = z.strictObject({
	slug: z.string(),
	label: z.string(),
	description: z.string(),
	roles: z.record(
		z.string(),
		z.discriminatedUnion('kind', [
			PackStyleRoleSchema,
			PackPipelineRoleSchema,
			PackChromeRoleSchema
		])
	),
	fonts: z.array(PackFontSchema).optional()
});

const UserPackMetaSchema = z.strictObject({
	slug: z.string(),
	label: z.string(),
	description: z.string(),
	forkedFrom: z.string().nullable(),
	savedAt: z.string(),
	contentHash: z.string().regex(/^[a-f0-9]{64}$/)
});

const UserPackDocumentSchema = z.strictObject({
	manifest: PackManifestWireSchema,
	forkedFrom: z.string().nullable(),
	savedAt: z.string(),
	contentHash: z.string().regex(/^[a-f0-9]{64}$/),
	fontFaces: z.array(UserPackFontFaceSchema)
});

const PackValidationIssueSchema = z.strictObject({
	pack: z.string(),
	path: z.array(z.union([z.string(), z.number()])),
	kind: z.string(),
	message: z.string()
});

export type UserPackMeta = z.infer<typeof UserPackMetaSchema>;

export interface UserPackDocument {
	manifest: PackManifest;
	/** The built-in slug this pack was forked from, or null once it stands alone. */
	forkedFrom: string | null;
	savedAt: string;
	/** sha-256 of the canonical manifest — the revision a save must name. */
	contentHash: string;
	fontFaces: readonly UserPackFontFace[];
}

export interface UserPackForkOptions {
	label?: string;
	description?: string;
}

export interface UserPackStore {
	listUserPacks(): Promise<UserPackMeta[]>;
	/** Resolve a slug to its stored User Pack; null means the store holds nothing there. */
	loadUserPack(slug: string, requestFetch?: typeof fetch): Promise<UserPackDocument | null>;
	/** Create a User Pack as a copy of a built-in pack's roles and fonts. */
	forkUserPack(
		slug: string,
		builtinSlug: string,
		options?: UserPackForkOptions
	): Promise<UserPackDocument>;
	/**
	 * Store a whole validated document. `expectedContentHash` is the revision the
	 * caller observed; null skips the check, which only a first write should do.
	 */
	saveUserPack(
		slug: string,
		manifest: PackManifest,
		expectedContentHash: string | null
	): Promise<UserPackDocument>;
	deleteUserPack(slug: string): Promise<void>;
}

export const USER_PACK_API_BASE = '/api/user-packs';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Narrow the wire manifest to the engine's `PackManifest`, role by role. */
export function parsePackManifestWire(value: unknown): PackManifest {
	const wire = PackManifestWireSchema.parse(value);
	const roles: Record<string, PackRole> = {};
	for (const [key, role] of Object.entries(wire.roles)) {
		if (role.kind === 'style') roles[key] = { kind: 'style', value: role.value };
		else if (role.kind === 'pipeline') {
			roles[key] = {
				kind: 'pipeline',
				pipeline: role.pipeline,
				...(role.params ? { params: role.params } : {})
			};
		} else roles[key] = { kind: 'chrome', effects: role.effects };
	}
	const fonts: PackFont[] | undefined = wire.fonts?.map((font) => ({
		family: font.family,
		...(font.weights ? { weights: font.weights } : {}),
		...(font.style !== undefined ? { style: font.style } : {})
	}));
	return {
		slug: wire.slug,
		label: wire.label,
		description: wire.description,
		roles,
		...(fonts ? { fonts } : {})
	};
}

export function parseUserPackDocument(value: unknown): UserPackDocument {
	const wire = UserPackDocumentSchema.parse(value);
	return {
		manifest: parsePackManifestWire(wire.manifest),
		forkedFrom: wire.forkedFrom,
		savedAt: wire.savedAt,
		contentHash: wire.contentHash,
		fontFaces: wire.fontFaces
	};
}

export function parseUserPackMetaList(value: unknown): UserPackMeta[] {
	if (!Array.isArray(value)) {
		throw new TypeError('Failed to list User Packs: response must be an array');
	}
	return value.map((entry, index) => {
		const result = UserPackMetaSchema.safeParse(entry);
		if (!result.success) {
			throw new TypeError(`Failed to list User Packs: invalid entry at index ${index}`);
		}
		return result.data;
	});
}

function parseRefusedIssues(value: unknown): PackValidationIssue[] | null {
	if (!isRecord(value) || !Array.isArray(value.issues)) return null;
	const issues: PackValidationIssue[] = [];
	for (const entry of value.issues) {
		const result = PackValidationIssueSchema.safeParse(entry);
		if (!result.success) return null;
		issues.push(result.data as PackValidationIssue);
	}
	return issues;
}

async function userPackFailureContext(response: Response): Promise<string> {
	const status = `${response.status}${response.statusText ? ` ${response.statusText}` : ''}`;
	try {
		const value: unknown = await response.clone().json();
		if (isRecord(value) && typeof value.message === 'string' && value.message.length > 0) {
			return `${status}: ${value.message}`;
		}
	} catch {
		// A status without a response body is still actionable.
	}
	return status;
}

/**
 * Turn a refused write into the typed error its caller narrows on: a 422
 * carries the validation issues, a 409 the revision that actually stands.
 */
async function throwUserPackWriteRefusal(
	slug: string,
	verb: 'fork' | 'save',
	response: Response
): Promise<never> {
	const message = `Failed to ${verb} User Pack "${slug}": ${await userPackFailureContext(response)}`;
	let body: unknown = null;
	try {
		body = await response.json();
	} catch {
		// Fall through to the plain error below.
	}
	if (response.status === 422) {
		const issues = parseRefusedIssues(body);
		if (issues !== null) throw new UserPackValidationError(slug, issues, message);
	}
	if (response.status === 409 && isRecord(body) && typeof body.currentContentHash === 'string') {
		throw new UserPackRevisionConflictError(slug, body.currentContentHash, message);
	}
	throw new Error(message);
}

/** `subject` reads as the verb phrase of the failure: `list User Packs`, `load User Pack "x"`. */
async function readUserPackResponseJson(response: Response, subject: string): Promise<unknown> {
	try {
		return await response.json();
	} catch (cause) {
		throw new Error(`Failed to ${subject}: invalid JSON response`, { cause });
	}
}

/** The disk-backed development store: every call is a request to this origin. */
export const originUserPackStore: UserPackStore = {
	async listUserPacks(): Promise<UserPackMeta[]> {
		const response = await fetch(USER_PACK_API_BASE);
		if (!response.ok) {
			throw new Error(`Failed to list User Packs: ${await userPackFailureContext(response)}`);
		}
		return parseUserPackMetaList(await readUserPackResponseJson(response, 'list User Packs'));
	},

	async loadUserPack(slug: string, requestFetch = fetch): Promise<UserPackDocument | null> {
		const response = await requestFetch(`${USER_PACK_API_BASE}/${encodeURIComponent(slug)}`);
		if (!response.ok) {
			throw new Error(
				`Failed to load User Pack "${slug}": ${await userPackFailureContext(response)}`
			);
		}
		const value = await readUserPackResponseJson(response, `load User Pack "${slug}"`);
		if (value === null) return null;
		try {
			return parseUserPackDocument(value);
		} catch (cause) {
			throw new TypeError(`Failed to load User Pack "${slug}": invalid response`, { cause });
		}
	},

	async forkUserPack(
		slug: string,
		builtinSlug: string,
		options: UserPackForkOptions = {}
	): Promise<UserPackDocument> {
		const response = await fetch(USER_PACK_API_BASE, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ slug, forkedFrom: builtinSlug, ...options })
		});
		if (!response.ok) await throwUserPackWriteRefusal(slug, 'fork', response);
		return parseUserPackDocument(
			await readUserPackResponseJson(response, `fork User Pack "${slug}"`)
		);
	},

	async saveUserPack(
		slug: string,
		manifest: PackManifest,
		expectedContentHash: string | null
	): Promise<UserPackDocument> {
		const response = await fetch(`${USER_PACK_API_BASE}/${encodeURIComponent(slug)}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ manifest, expectedContentHash })
		});
		if (!response.ok) await throwUserPackWriteRefusal(slug, 'save', response);
		return parseUserPackDocument(
			await readUserPackResponseJson(response, `save User Pack "${slug}"`)
		);
	},

	async deleteUserPack(slug: string): Promise<void> {
		const response = await fetch(`${USER_PACK_API_BASE}/${encodeURIComponent(slug)}`, {
			method: 'DELETE'
		});
		if (response.ok) return;
		const message = `Failed to delete User Pack "${slug}": ${await userPackFailureContext(response)}`;
		if (response.status === 404) throw new UserPackNotHeldError(slug, message);
		throw new Error(message);
	}
};

/** The one store the GUI and every WebMCP operation share. */
export const userPackStore: UserPackStore = originUserPackStore;

/** One line per issue, for a message a human or an agent can act on. */
export function describeUserPackIssues(issues: readonly PackValidationIssue[]): string {
	return formatPackValidationIssues(issues);
}

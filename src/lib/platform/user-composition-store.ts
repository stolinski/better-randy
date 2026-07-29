import { z } from 'zod';

import { MediaSchema, type Preset } from './engine-schema';
import { parsePreset } from './preset';
import { presetToWireFormat } from './preset-pure';

const UserCompositionMediaStatusSchema = z.enum(['ready', 'missing', 'undecodable']);
const UserCompositionMediaIssueSchema = z.strictObject({
	assetIds: z.array(z.string().min(1)),
	assetUrl: z.string().min(1),
	status: z.enum(['missing', 'undecodable']),
	message: z.string().min(1)
});
const UserCompositionMetaSchema = z.strictObject({
	slug: z.string(),
	name: z.string(),
	forkedFrom: z.string().nullable(),
	savedAt: z.string(),
	media: MediaSchema,
	mediaStatus: UserCompositionMediaStatusSchema,
	mediaIssues: z.array(UserCompositionMediaIssueSchema).optional()
});

export type UserCompositionMediaStatus = z.infer<typeof UserCompositionMediaStatusSchema>;
export type UserCompositionMediaIssue = z.infer<typeof UserCompositionMediaIssueSchema>;
export type UserCompositionMeta = z.infer<typeof UserCompositionMetaSchema>;

export interface UserCompositionStore {
	listUserCompositions(): Promise<UserCompositionMeta[]>;
	/** Resolve a slug to its stored User composition; null means no fork exists. */
	loadUserComposition(slug: string): Promise<Preset | null>;
	/** Create a User composition, optionally noting which corpus Preset it came from. */
	forkUserComposition(slug: string, preset: Preset, corpusSlug: string | null): Promise<void>;
	saveUserComposition(slug: string, preset: Preset): Promise<void>;
	deleteUserComposition(slug: string): Promise<void>;
}

const USER_COMPOSITION_API_BASE = '/api/user-compositions';

async function userCompositionFailureContext(response: Response): Promise<string> {
	const status = `${response.status}${response.statusText ? ` ${response.statusText}` : ''}`;
	try {
		const value: unknown = await response.json();
		if (isRecord(value) && typeof value.message === 'string' && value.message.length > 0) {
			return `${status}: ${value.message}`;
		}
	} catch {
		// A status without a response body is still actionable.
	}
	return status;
}

async function readUserCompositionResponseJson(
	response: Response,
	operation: string
): Promise<unknown> {
	try {
		return await response.json();
	} catch (cause) {
		throw new Error(`${operation}: invalid JSON response`, { cause });
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseUserCompositionMetaList(value: unknown): UserCompositionMeta[] {
	if (!Array.isArray(value)) {
		throw new TypeError('Failed to list User compositions: response must be an array');
	}

	return value.map((entry, index) => {
		const result = UserCompositionMetaSchema.safeParse(entry);
		if (!result.success) {
			throw new TypeError(`Failed to list User compositions: invalid entry at index ${index}`);
		}
		return result.data;
	});
}

function parseUserComposition(value: unknown, slug: string): Preset | null {
	if (value === null) return null;
	try {
		return parsePreset(value);
	} catch (cause) {
		throw new TypeError(`Failed to load User composition "${slug}": invalid response`, { cause });
	}
}

export const userCompositionStore: UserCompositionStore = {
	async listUserCompositions(): Promise<UserCompositionMeta[]> {
		const response = await fetch(USER_COMPOSITION_API_BASE);
		if (!response.ok) {
			throw new Error(
				`Failed to list User compositions: ${await userCompositionFailureContext(response)}`
			);
		}
		const value = await readUserCompositionResponseJson(
			response,
			'Failed to list User compositions'
		);
		return parseUserCompositionMetaList(value);
	},

	async loadUserComposition(slug: string): Promise<Preset | null> {
		const response = await fetch(`${USER_COMPOSITION_API_BASE}/${encodeURIComponent(slug)}`);
		if (!response.ok) {
			throw new Error(
				`Failed to load User composition "${slug}": ${await userCompositionFailureContext(response)}`
			);
		}
		const value = await readUserCompositionResponseJson(
			response,
			`Failed to load User composition "${slug}"`
		);
		return parseUserComposition(value, slug);
	},

	async forkUserComposition(
		slug: string,
		preset: Preset,
		corpusSlug: string | null
	): Promise<void> {
		const response = await fetch(USER_COMPOSITION_API_BASE, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ slug, preset: presetToWireFormat(preset), forkedFrom: corpusSlug })
		});
		if (!response.ok) {
			throw new Error(
				`Failed to fork User composition "${slug}": ${await userCompositionFailureContext(response)}`
			);
		}
	},

	async saveUserComposition(slug: string, preset: Preset): Promise<void> {
		const response = await fetch(`${USER_COMPOSITION_API_BASE}/${encodeURIComponent(slug)}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(presetToWireFormat(preset))
		});
		if (!response.ok) {
			throw new Error(
				`Failed to save User composition "${slug}": ${await userCompositionFailureContext(response)}`
			);
		}
	},

	async deleteUserComposition(slug: string): Promise<void> {
		const response = await fetch(`${USER_COMPOSITION_API_BASE}/${encodeURIComponent(slug)}`, {
			method: 'DELETE'
		});
		if (!response.ok) {
			throw new Error(
				`Failed to delete User composition "${slug}": ${await userCompositionFailureContext(response)}`
			);
		}
	}
};

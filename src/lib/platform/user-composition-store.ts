import type { Preset } from './engine-schema';
import { presetToWireFormat } from './preset-pure';

export interface UserCompositionMeta {
	slug: string;
	name: string;
	forkedFrom: string | null;
	savedAt: string;
}

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

function userCompositionFailureContext(response: Response): string {
	return `${response.status}${response.statusText ? ` ${response.statusText}` : ''}`;
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
		if (
			!isRecord(entry) ||
			typeof entry.slug !== 'string' ||
			typeof entry.name !== 'string' ||
			(entry.forkedFrom !== null && typeof entry.forkedFrom !== 'string') ||
			typeof entry.savedAt !== 'string'
		) {
			throw new TypeError(`Failed to list User compositions: invalid entry at index ${index}`);
		}

		return {
			slug: entry.slug,
			name: entry.name,
			forkedFrom: entry.forkedFrom,
			savedAt: entry.savedAt
		};
	});
}

function parseUserComposition(value: unknown, slug: string): Preset | null {
	if (value === null) return null;
	if (!isRecord(value) || value.schema !== 'supers@1' || !isRecord(value.state)) {
		throw new TypeError(`Failed to load User composition "${slug}": invalid response`);
	}
	return value as unknown as Preset;
}

export const userCompositionStore: UserCompositionStore = {
	async listUserCompositions(): Promise<UserCompositionMeta[]> {
		const response = await fetch(USER_COMPOSITION_API_BASE);
		if (!response.ok) {
			throw new Error(
				`Failed to list User compositions: ${userCompositionFailureContext(response)}`
			);
		}
		const value = await readUserCompositionResponseJson(
			response,
			'Failed to list User compositions'
		);
		return parseUserCompositionMetaList(value);
	},

	async loadUserComposition(slug: string): Promise<Preset | null> {
		const response = await fetch(
			`${USER_COMPOSITION_API_BASE}/${encodeURIComponent(slug)}`
		);
		if (!response.ok) {
			throw new Error(
				`Failed to load User composition "${slug}": ${userCompositionFailureContext(response)}`
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
				`Failed to fork User composition "${slug}": ${userCompositionFailureContext(response)}`
			);
		}
	},

	async saveUserComposition(slug: string, preset: Preset): Promise<void> {
		const response = await fetch(
			`${USER_COMPOSITION_API_BASE}/${encodeURIComponent(slug)}`,
			{
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(presetToWireFormat(preset))
			}
		);
		if (!response.ok) {
			throw new Error(
				`Failed to save User composition "${slug}": ${userCompositionFailureContext(response)}`
			);
		}
	},

	async deleteUserComposition(slug: string): Promise<void> {
		const response = await fetch(
			`${USER_COMPOSITION_API_BASE}/${encodeURIComponent(slug)}`,
			{
				method: 'DELETE'
			}
		);
		if (!response.ok) {
			throw new Error(
				`Failed to delete User composition "${slug}": ${userCompositionFailureContext(response)}`
			);
		}
	}
};

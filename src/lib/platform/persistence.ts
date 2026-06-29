import type { Preset } from './engine-schema';
import { presetToWireFormat } from './preset-pure';

export interface UserCompositionMeta {
	slug: string;
	name: string;
	forkedFrom: string | null;
	savedAt: string;
}

export interface PersistencePort {
	list(): Promise<UserCompositionMeta[]>;
	load(slug: string): Promise<Preset>;
	/** Create a new user composition, optionally noting which corpus slug it came from. */
	fork(slug: string, preset: Preset, corpusSlug: string | null): Promise<void>;
	save(slug: string, preset: Preset): Promise<void>;
	del(slug: string): Promise<void>;
}

const API_BASE = '/api/user-compositions';

export const userStore: PersistencePort = {
	async list(): Promise<UserCompositionMeta[]> {
		const res = await fetch(API_BASE);
		if (!res.ok) throw new Error(`Failed to list user compositions: ${res.statusText}`);
		return res.json() as Promise<UserCompositionMeta[]>;
	},

	async load(slug: string): Promise<Preset> {
		const res = await fetch(`${API_BASE}/${encodeURIComponent(slug)}`);
		if (!res.ok) throw new Error(`Failed to load user composition "${slug}": ${res.statusText}`);
		return res.json() as Promise<Preset>;
	},

	async fork(slug: string, preset: Preset, corpusSlug: string | null): Promise<void> {
		const res = await fetch(API_BASE, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ slug, preset: presetToWireFormat(preset), forkedFrom: corpusSlug })
		});
		if (!res.ok) throw new Error(`Failed to fork user composition "${slug}": ${res.statusText}`);
	},

	async save(slug: string, preset: Preset): Promise<void> {
		const res = await fetch(`${API_BASE}/${encodeURIComponent(slug)}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(presetToWireFormat(preset))
		});
		if (!res.ok) throw new Error(`Failed to save user composition "${slug}": ${res.statusText}`);
	},

	async del(slug: string): Promise<void> {
		const res = await fetch(`${API_BASE}/${encodeURIComponent(slug)}`, {
			method: 'DELETE'
		});
		if (!res.ok) throw new Error(`Failed to delete user composition "${slug}": ${res.statusText}`);
	}
};

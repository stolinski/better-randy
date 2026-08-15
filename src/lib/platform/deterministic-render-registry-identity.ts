import { PACK_REGISTRY } from './packs/registry';
import { listPresets } from './preset';

interface RuntimeRenderRegistryEntry {
	id: string;
	fingerprint: string;
}

export interface DeterministicRenderCellConfiguration {
	presetSlug: string;
	packId: string;
	orientation: 'horizontal' | 'vertical';
	width: number;
	height: number;
	frameRate: { num: number; den: number };
	expectedOutputClass: 'transparent' | 'opaque';
}

export interface RuntimeRenderRegistryIdentity {
	schemaVersion: 1;
	deliverablePresets: RuntimeRenderRegistryEntry[];
	packs: RuntimeRenderRegistryEntry[];
	registryDigest: string;
}

export interface DeterministicRenderFrameGeometry {
	elements: Record<string, { x: number; y: number; width: number; height: number }>;
}

function canonicalize(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonicalize);
	if (value && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value)
				.filter(([, entry]) => entry !== undefined)
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([key, entry]) => [key, canonicalize(entry)])
		);
	}
	return value;
}

async function hashRuntimeRegistryValue(value: unknown): Promise<string> {
	const bytes = new TextEncoder().encode(JSON.stringify(canonicalize(value)));
	const digest = await crypto.subtle.digest('SHA-256', bytes);
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Browser-side identity of the exact live registries used by the catalog and Pack resolver. */
declare global {
	interface Window {
		__readSupersRuntimeRenderRegistryIdentity?: () => Promise<RuntimeRenderRegistryIdentity>;
		__configureSupersDeterministicRenderCell?: (input: {
			presetSlug: string;
			packId: string;
			orientation: 'horizontal' | 'vertical';
		}) => Promise<DeterministicRenderCellConfiguration>;
		__captureSupersDeterministicFrameGeometry?: (
			candidateIds: readonly string[]
		) => DeterministicRenderFrameGeometry;
	}
}

export async function readRuntimeRenderRegistryIdentity(): Promise<RuntimeRenderRegistryIdentity> {
	const deliverablePresets = await Promise.all(
		listPresets()
			.map((entry) => ({ id: entry.slug, value: entry.preset }))
			.sort((left, right) => left.id.localeCompare(right.id))
			.map(async (entry) => ({
				id: entry.id,
				fingerprint: await hashRuntimeRegistryValue(entry.value)
			}))
	);
	const packs = await Promise.all(
		Object.entries(PACK_REGISTRY)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(async ([id, pack]) => ({ id, fingerprint: await hashRuntimeRegistryValue(pack) }))
	);
	const content = { schemaVersion: 1 as const, deliverablePresets, packs };
	return { ...content, registryDigest: await hashRuntimeRegistryValue(content) };
}

export interface RuntimeRenderRegistryValue {
	id: string;
	value: unknown;
}

export interface RuntimeRenderRegistryFingerprintEntry {
	id: string;
	fingerprint: string;
}

export interface RuntimeRenderRegistryIdentity {
	schemaVersion: 1;
	deliverablePresets: RuntimeRenderRegistryFingerprintEntry[];
	packs: RuntimeRenderRegistryFingerprintEntry[];
	registryDigest: string;
}

export function canonicalizeDeterministicRenderValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonicalizeDeterministicRenderValue);
	if (value && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value)
				.filter(([, entry]) => entry !== undefined)
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([key, entry]) => [key, canonicalizeDeterministicRenderValue(entry)])
		);
	}
	return value;
}

export async function hashDeterministicRenderValue(value: unknown): Promise<string> {
	const bytes = new TextEncoder().encode(
		JSON.stringify(canonicalizeDeterministicRenderValue(value))
	);
	const digest = await crypto.subtle.digest('SHA-256', bytes);
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function createRuntimeRenderRegistryIdentity(
	deliverablePresetValues: readonly RuntimeRenderRegistryValue[],
	packValues: readonly RuntimeRenderRegistryValue[]
): Promise<RuntimeRenderRegistryIdentity> {
	async function fingerprintValues(
		values: readonly RuntimeRenderRegistryValue[]
	): Promise<RuntimeRenderRegistryFingerprintEntry[]> {
		return Promise.all(
			[...values]
				.sort((left, right) => left.id.localeCompare(right.id))
				.map(async ({ id, value }) => ({
					id,
					fingerprint: await hashDeterministicRenderValue(value)
				}))
		);
	}

	const deliverablePresets = await fingerprintValues(deliverablePresetValues);
	const packs = await fingerprintValues(packValues);
	const content = { schemaVersion: 1 as const, deliverablePresets, packs };
	return { ...content, registryDigest: await hashDeterministicRenderValue(content) };
}

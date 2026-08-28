import { PACK_REGISTRY } from './packs/registry';
import { listPresets } from './preset-catalog';
import {
	createRuntimeRenderRegistryIdentity,
	type RuntimeRenderRegistryIdentity
} from './deterministic-render-registry-fingerprint';

export interface DeterministicRenderCellConfiguration {
	presetSlug: string;
	packId: string;
	orientation: 'horizontal' | 'vertical';
	width: number;
	height: number;
	frameRate: { num: number; den: number };
	expectedOutputClass: 'transparent' | 'opaque';
}

export interface DeterministicRenderFrameGeometry {
	elements: Record<string, { x: number; y: number; width: number; height: number }>;
}

/** Browser-side identity of the exact live registries used by the catalog and Pack resolver. */
declare global {
	interface Window {
		__readGfxRuntimeRenderRegistryIdentity?: () => Promise<RuntimeRenderRegistryIdentity>;
		__configureGfxDeterministicRenderCell?: (input: {
			presetSlug: string;
			packId: string;
			orientation: 'horizontal' | 'vertical';
		}) => Promise<DeterministicRenderCellConfiguration>;
		__captureGfxDeterministicFrameGeometry?: (
			candidateIds: readonly string[]
		) => DeterministicRenderFrameGeometry;
	}
}

export async function readRuntimeRenderRegistryIdentity(): Promise<RuntimeRenderRegistryIdentity> {
	return createRuntimeRenderRegistryIdentity(
		listPresets().map((entry) => ({ id: entry.slug, value: entry.preset })),
		Object.entries(PACK_REGISTRY).map(([id, value]) => ({ id, value }))
	);
}

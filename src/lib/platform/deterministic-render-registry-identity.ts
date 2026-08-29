import { PACK_REGISTRY } from './packs/registry';
import { listPresets } from './preset-catalog';
import {
	createRuntimeRenderRegistryIdentity,
	type RuntimeRenderRegistryIdentity
} from './deterministic-render-registry-fingerprint';
import type {
	DeterministicFrameRequest,
	DeterministicSettledFrame
} from '$lib/utils/deterministic-render-measurements';

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
		/** Land the composition on one exact frame the way preview and export both
		 *  do — seek, settle a real composition paint, flush — and report what that
		 *  cost. The only settle seam that works in the `dom-rasterization` lane,
		 *  where the readable-audit surface cannot measure unlaid-out canvas
		 *  children. Read by browser render verification. */
		__settleGfxDeterministicCompositionFrame?: (
			request: DeterministicFrameRequest
		) => Promise<DeterministicSettledFrame & { settleMilliseconds: number }>;
	}
}

export async function readRuntimeRenderRegistryIdentity(): Promise<RuntimeRenderRegistryIdentity> {
	return createRuntimeRenderRegistryIdentity(
		listPresets().map((entry) => ({ id: entry.slug, value: entry.preset })),
		Object.entries(PACK_REGISTRY).map(([id, value]) => ({ id, value }))
	);
}

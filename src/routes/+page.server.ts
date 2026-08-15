import { listPosterKeys } from '$lib/platform/poster-store.server';
import { posterKeyForPreset } from '$lib/platform/posters';
import { listFixtures, listPresets, type CataloguedPreset } from '$lib/platform/preset';

import type { PageServerLoad } from './$types';

function homepagePresetCard(entry: CataloguedPreset) {
	return {
		slug: entry.slug,
		name: entry.preset.name,
		kind: entry.preset.kind,
		surfaceType: entry.preset.state.surface.type,
		hasChart: entry.preset.state.surface.chart !== undefined,
		hasDepthStage: entry.preset.state.stage !== undefined,
		hasDepthOfField: entry.preset.state.effects.some(
			(effect) => effect.type === 'depth-of-field'
		),
		durationSeconds: entry.preset.state.transport.durationSeconds,
		posterKey: posterKeyForPreset(entry.preset)
	};
}

// Keep full, frequently changing Presets on the server for the library view.
// The browser receives only the fields each card renders instead of importing
// and validating the complete engine catalog during hydration.
export const load: PageServerLoad = async () => ({
	posterKeys: await listPosterKeys(),
	presets: listPresets().map(homepagePresetCard),
	fixtures: listFixtures().map(homepagePresetCard)
});

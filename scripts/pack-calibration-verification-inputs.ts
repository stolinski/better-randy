import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { createPackCalibrationRenderSourceFingerprint } from './pack-calibration-render-source-fingerprint.ts';

export interface PackCalibrationFrameInput {
	presetSlug: string;
}

export interface PackCalibrationRuntimeRegistryIdentityFactory {
	(
		deliverablePresets: readonly { id: string; value: unknown }[],
		packs: readonly { id: string; value: unknown }[]
	): Promise<unknown>;
}

export interface PackCalibrationVerificationInputs {
	runtimeIdentity: unknown;
	renderSourceFingerprints: Readonly<Record<string, string>>;
}

/** Shared producer/verifier input loader for the exact canonical Calibration Trio. */
export async function createPackCalibrationVerificationInputs(input: {
	repoRoot: string;
	calibrationTrio: readonly PackCalibrationFrameInput[];
	packRegistry: Readonly<Record<string, unknown>>;
	packSlugs?: readonly string[];
	parsePreset: (value: unknown) => unknown;
	createRuntimeIdentity: PackCalibrationRuntimeRegistryIdentityFactory;
}): Promise<PackCalibrationVerificationInputs> {
	const trioPresetValues = await Promise.all(
		input.calibrationTrio.map(async ({ presetSlug }) => ({
			id: presetSlug,
			value: input.parsePreset(
				JSON.parse(
					await readFile(resolve(input.repoRoot, 'src/lib/presets', `${presetSlug}.json`), 'utf8')
				) as unknown
			)
		}))
	);

	const packSlugs = input.packSlugs ?? Object.keys(input.packRegistry);
	for (const packSlug of packSlugs) {
		if (!Object.hasOwn(input.packRegistry, packSlug)) {
			throw new TypeError(`Unknown Pack calibration scope: ${packSlug}`);
		}
	}
	const [runtimeIdentity, renderSourceFingerprintEntries] = await Promise.all([
		input.createRuntimeIdentity(
			trioPresetValues,
			Object.entries(input.packRegistry).map(([id, value]) => ({ id, value }))
		),
		Promise.all(
			packSlugs.map(
				async (packSlug) =>
					[
						packSlug,
						await createPackCalibrationRenderSourceFingerprint(input.repoRoot, packSlug)
					] as const
			)
		)
	]);
	return {
		runtimeIdentity,
		renderSourceFingerprints: Object.fromEntries(renderSourceFingerprintEntries)
	};
}

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
	renderSourceFingerprint: string;
}

/** Shared producer/verifier input loader for the exact canonical Calibration Trio. */
export async function createPackCalibrationVerificationInputs(input: {
	repoRoot: string;
	calibrationTrio: readonly PackCalibrationFrameInput[];
	packRegistry: Readonly<Record<string, unknown>>;
	parsePreset: (value: unknown) => unknown;
	createRuntimeIdentity: PackCalibrationRuntimeRegistryIdentityFactory;
}): Promise<PackCalibrationVerificationInputs> {
	const trioPresetValues = await Promise.all(
		input.calibrationTrio.map(async ({ presetSlug }) => ({
			id: presetSlug,
			value: input.parsePreset(
				JSON.parse(
					await readFile(
						resolve(input.repoRoot, 'src/lib/presets', `${presetSlug}.json`),
						'utf8'
					)
				) as unknown
			)
		}))
	);

	const [runtimeIdentity, renderSourceFingerprint] = await Promise.all([
		input.createRuntimeIdentity(
			trioPresetValues,
			Object.entries(input.packRegistry).map(([id, value]) => ({ id, value }))
		),
		createPackCalibrationRenderSourceFingerprint(input.repoRoot)
	]);
	return { runtimeIdentity, renderSourceFingerprint };
}

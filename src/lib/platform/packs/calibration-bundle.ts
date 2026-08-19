import {
	hashDeterministicRenderValue,
	type RuntimeRenderRegistryIdentity
} from '../deterministic-render-registry-fingerprint';
import { CALIBRATION_TRIO_FRAME_SPECS, type PackCalibrationFrameSpec } from './catalog';

export interface PackCalibrationBundlePreset {
	frame: PackCalibrationFrameSpec;
	presetFingerprint: string;
}

export interface PackCalibrationBundleDescriptor {
	schemaVersion: 1;
	packSlug: string;
	packFingerprint: string;
	renderSourceFingerprint: string;
	calibrationTrio: readonly PackCalibrationBundlePreset[];
}

function requireRuntimeFingerprint(
	entries: readonly { id: string; fingerprint: string }[],
	kind: 'Pack' | 'Preset',
	id: string
): string {
	const entry = entries.find((candidate) => candidate.id === id);
	if (!entry) {
		throw new Error(
			`Pack calibration bundle: ${kind} "${id}" is absent from the runtime render registry identity.`
		);
	}
	return entry.fingerprint;
}

export function createPackCalibrationBundleDescriptor(
	runtimeIdentity: RuntimeRenderRegistryIdentity,
	packSlug: string,
	renderSourceFingerprint: string
): PackCalibrationBundleDescriptor {
	const packFingerprint = requireRuntimeFingerprint(runtimeIdentity.packs, 'Pack', packSlug);
	const calibrationTrio = CALIBRATION_TRIO_FRAME_SPECS.map((frame) => ({
		frame,
		presetFingerprint: requireRuntimeFingerprint(
			runtimeIdentity.deliverablePresets,
			'Preset',
			frame.presetSlug
		)
	}));
	return {
		schemaVersion: 1,
		packSlug,
		packFingerprint,
		renderSourceFingerprint,
		calibrationTrio
	};
}

export async function createPackCalibrationVerificationBundleId(
	runtimeIdentity: RuntimeRenderRegistryIdentity,
	packSlug: string,
	renderSourceFingerprint: string
): Promise<string> {
	return hashDeterministicRenderValue(
		createPackCalibrationBundleDescriptor(runtimeIdentity, packSlug, renderSourceFingerprint)
	);
}

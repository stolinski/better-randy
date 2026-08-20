import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createPackCalibrationVerificationInputs } from './pack-calibration-verification-inputs.ts';
import { registerSupersRuntimeModuleHooks } from './supers-runtime-module-hooks.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
registerSupersRuntimeModuleHooks(repoRoot);

const catalogModule = await import(
	pathToFileURL(resolve(repoRoot, 'src/lib/platform/packs/catalog.ts')).href
);
const registryModule = await import(
	pathToFileURL(resolve(repoRoot, 'src/lib/platform/packs/registry.ts')).href
);
const bundleModule = await import(
	pathToFileURL(resolve(repoRoot, 'src/lib/platform/packs/calibration-bundle.ts')).href
);
const ingressModule = await import(
	pathToFileURL(resolve(repoRoot, 'src/lib/platform/preset-ingress.ts')).href
);
const fingerprintModule = await import(
	pathToFileURL(resolve(repoRoot, 'src/lib/platform/deterministic-render-registry-fingerprint.ts'))
		.href
);

const CALIBRATION_TRIO_FRAME_SPECS = catalogModule.CALIBRATION_TRIO_FRAME_SPECS as readonly {
	presetSlug: string;
	orientation: 'horizontal';
	width: 3840;
	height: 2160;
	progress: number;
}[];
const PACK_REGISTRY = registryModule.PACK_REGISTRY as Readonly<Record<string, unknown>>;
const createPackCalibrationVerificationBundleId =
	bundleModule.createPackCalibrationVerificationBundleId as (
		runtimeIdentity: unknown,
		packSlug: string,
		renderSourceFingerprint: string
	) => Promise<string>;
const createRuntimeRenderRegistryIdentity =
	fingerprintModule.createRuntimeRenderRegistryIdentity as (
		deliverablePresets: readonly { id: string; value: unknown }[],
		packs: readonly { id: string; value: unknown }[]
	) => Promise<unknown>;
const PresetIngressSchema = ingressModule.PresetIngressSchema as {
	parse: (value: unknown) => unknown;
};

const { runtimeIdentity, renderSourceFingerprints } = await createPackCalibrationVerificationInputs(
	{
		repoRoot,
		calibrationTrio: CALIBRATION_TRIO_FRAME_SPECS,
		packRegistry: PACK_REGISTRY,
		parsePreset: (value) => PresetIngressSchema.parse(value),
		createRuntimeIdentity: createRuntimeRenderRegistryIdentity
	}
);

for (const packSlug of Object.keys(PACK_REGISTRY).sort((left, right) =>
	left.localeCompare(right)
)) {
	const renderSourceFingerprint = renderSourceFingerprints[packSlug];
	if (!renderSourceFingerprint) throw new Error(`Missing render fingerprint for ${packSlug}`);
	const verificationBundleId = await createPackCalibrationVerificationBundleId(
		runtimeIdentity,
		packSlug,
		renderSourceFingerprint
	);
	console.log(
		JSON.stringify({
			packSlug,
			verificationBundleId,
			renderSourceFingerprint,
			calibrationTrio: CALIBRATION_TRIO_FRAME_SPECS
		})
	);
}

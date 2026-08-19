import type { PackManifest } from './types';
import { PACK_REGISTRY, type PackRegistrySlug } from './registry';

export const CALIBRATION_TRIO_FRAME_SPECS = [
	{
		presetSlug: 'docu-timeline-build',
		orientation: 'horizontal',
		width: 3840,
		height: 2160,
		progress: 0.5
	},
	{
		presetSlug: 'lower-third',
		orientation: 'horizontal',
		width: 3840,
		height: 2160,
		progress: 0.5
	},
	{
		presetSlug: 'type-hero-vantage',
		orientation: 'horizontal',
		width: 3840,
		height: 2160,
		progress: 0.5
	}
] as const;

export type CalibrationTrioPresetSlug = (typeof CALIBRATION_TRIO_FRAME_SPECS)[number]['presetSlug'];

export interface PackCalibrationFrameSpec {
	presetSlug: CalibrationTrioPresetSlug;
	orientation: 'horizontal';
	width: 3840;
	height: 2160;
	progress: number;
}

export interface DraftPackCatalogMetadata {
	status: 'draft';
}

export interface RatifiedPackCatalogMetadata {
	status: 'ratified';
	humanRatifiedAt: string;
	verificationBundleId: string;
	calibrationTrio: readonly PackCalibrationFrameSpec[];
}

export type PackCatalogMetadata = DraftPackCatalogMetadata | RatifiedPackCatalogMetadata;
export type PackCatalogSlug = PackRegistrySlug;

const PACK_CATALOG_ENTRIES = {
	syntax: {
		status: 'ratified',
		humanRatifiedAt: '2026-08-19',
		verificationBundleId: 'd09f7ffce47a9f0cb7d15dead4eca0093c0ddf80bc460fadf45a09df0c48a080',
		calibrationTrio: CALIBRATION_TRIO_FRAME_SPECS
	},
	'editorial-mono': {
		status: 'ratified',
		humanRatifiedAt: '2026-08-19',
		verificationBundleId: '8f54fa6ab4e456b7d0a18864ea0af7d4e22acc160025d6baecaf017103a2695b',
		calibrationTrio: CALIBRATION_TRIO_FRAME_SPECS
	},
	'crt-terminal': {
		status: 'ratified',
		humanRatifiedAt: '2026-08-19',
		verificationBundleId: '45ce29248a04fc2fbb0c348539e7da1adbeeb34608f0cb504d061345272a867e',
		calibrationTrio: CALIBRATION_TRIO_FRAME_SPECS
	},
	'clean-light': {
		status: 'ratified',
		humanRatifiedAt: '2026-08-19',
		verificationBundleId: 'c484e96a4181facef7ff8d7bd6c8dff17dc30964509377374c2b4d152e12f01a',
		calibrationTrio: CALIBRATION_TRIO_FRAME_SPECS
	}
} satisfies Readonly<Record<PackCatalogSlug, PackCatalogMetadata>>;

/** Catalog admission is human-owned and deliberately separate from renderable Pack manifests. */
export const PACK_CATALOG_REGISTRY: Readonly<Record<PackCatalogSlug, PackCatalogMetadata>> =
	PACK_CATALOG_ENTRIES;

export interface AuthoringPackOption {
	slug: PackCatalogSlug;
	pack: PackManifest;
	catalogStatus: PackCatalogMetadata['status'];
	label: string;
}

export interface CatalogPackEntry {
	slug: PackCatalogSlug;
	pack: PackManifest;
	metadata: RatifiedPackCatalogMetadata;
}

export function getAuthoringPackOption(slug: string): AuthoringPackOption {
	if (!Object.hasOwn(PACK_REGISTRY, slug)) {
		throw new Error(`Unknown authoring Pack "${slug}".`);
	}
	const packSlug = slug as PackCatalogSlug;
	const pack = PACK_REGISTRY[packSlug];
	const catalogStatus = PACK_CATALOG_REGISTRY[packSlug].status;
	return {
		slug: packSlug,
		pack,
		catalogStatus,
		label: catalogStatus === 'draft' ? `${pack.label} · Draft` : pack.label
	};
}

export function listAuthoringPacks(): readonly AuthoringPackOption[] {
	return Object.keys(PACK_REGISTRY).map(getAuthoringPackOption);
}

export type CurrentPackCatalogBundleIds = Readonly<Record<string, string | undefined>>;

export interface PackCatalogCandidate<TPack, TSlug extends string = string> {
	slug: TSlug;
	pack: TPack;
	metadata: PackCatalogMetadata;
}

export interface CurrentPackCatalogEntry<TPack, TSlug extends string = string> {
	slug: TSlug;
	pack: TPack;
	metadata: RatifiedPackCatalogMetadata;
}

/** Status alone never admits a Pack; the caller must supply current machine-verified bundle IDs. */
export function selectCurrentPackCatalogEntries<TPack, TSlug extends string>(
	candidates: readonly PackCatalogCandidate<TPack, TSlug>[],
	currentBundleIds: CurrentPackCatalogBundleIds
): readonly CurrentPackCatalogEntry<TPack, TSlug>[] {
	const entries: CurrentPackCatalogEntry<TPack, TSlug>[] = [];
	for (const candidate of candidates) {
		if (
			candidate.metadata.status === 'ratified' &&
			currentBundleIds[candidate.slug] === candidate.metadata.verificationBundleId
		) {
			entries.push({ ...candidate, metadata: candidate.metadata });
		}
	}
	return entries;
}

export function listCatalogPacks(
	currentBundleIds: CurrentPackCatalogBundleIds
): readonly CatalogPackEntry[] {
	const candidates = (
		Object.entries(PACK_REGISTRY) as [PackCatalogSlug, PackManifest][]
	).map(([slug, pack]) => ({ slug, pack, metadata: PACK_CATALOG_REGISTRY[slug] }));
	return selectCurrentPackCatalogEntries(candidates, currentBundleIds);
}

export function isPackCatalogReady(
	slug: string,
	currentBundleIds: CurrentPackCatalogBundleIds
): boolean {
	if (!Object.hasOwn(PACK_REGISTRY, slug)) return false;
	const metadata = PACK_CATALOG_REGISTRY[slug as PackCatalogSlug];
	return (
		metadata.status === 'ratified' &&
		currentBundleIds[slug] === metadata.verificationBundleId
	);
}

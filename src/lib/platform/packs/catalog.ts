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
	syntax: { status: 'draft' },
	'editorial-mono': { status: 'draft' },
	'crt-terminal': { status: 'draft' },
	'clean-light': { status: 'draft' }
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

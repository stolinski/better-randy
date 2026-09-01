import type { PackManifest } from './types';
import { findPack, listRuntimeUserPacks, PACK_REGISTRY, type PackRegistrySlug } from './registry';

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

// Every stamp is dated 2026-09-01: registering `sentry` re-keyed the whole
// runtime identity, so Scott re-ratified the four existing packs' Trios in
// the same review that admitted Sentry (their 2026-08-19 stamps had already
// drifted with engine work; see dex orskr0o4 for the freshness-gate gap).
const PACK_CATALOG_ENTRIES = {
	syntax: {
		status: 'ratified',
		humanRatifiedAt: '2026-09-01',
		verificationBundleId: 'e1a305937ba7219de0af7e028c9c57bdc0fdb006d9f501253336259de29ea10f',
		calibrationTrio: CALIBRATION_TRIO_FRAME_SPECS
	},
	'editorial-mono': {
		status: 'ratified',
		humanRatifiedAt: '2026-09-01',
		verificationBundleId: 'd83ea8e120518f1ad6d1d7e860f133a92fcf301041175594f58ec3ff394d4201',
		calibrationTrio: CALIBRATION_TRIO_FRAME_SPECS
	},
	'crt-terminal': {
		status: 'ratified',
		humanRatifiedAt: '2026-09-01',
		verificationBundleId: '692d7c0085a5fb024ce80ef3f50417caba355d4b0439984f530d3919e16564ad',
		calibrationTrio: CALIBRATION_TRIO_FRAME_SPECS
	},
	'clean-light': {
		status: 'ratified',
		humanRatifiedAt: '2026-09-01',
		verificationBundleId: '9459e76ca0e5f86821a54f48aa3b5319b3d5e59a80c2e24a2dc7c2ed936517a9',
		calibrationTrio: CALIBRATION_TRIO_FRAME_SPECS
	},
	// Promoted from the `sentry` User Pack (ADR-0055 drafting lane, playbook
	// § 7) and ratified on its Calibration Trio the same day.
	sentry: {
		status: 'ratified',
		humanRatifiedAt: '2026-09-01',
		verificationBundleId: '7361b758378bdea487e6f0718281216f94fa43805ca4ec2bd91488ab3bbc474b',
		calibrationTrio: CALIBRATION_TRIO_FRAME_SPECS
	}
} satisfies Readonly<Record<PackCatalogSlug, PackCatalogMetadata>>;

/** Catalog admission is human-owned and deliberately separate from renderable Pack manifests. */
export const PACK_CATALOG_REGISTRY: Readonly<Record<PackCatalogSlug, PackCatalogMetadata>> =
	PACK_CATALOG_ENTRIES;

export interface CatalogAuthoringPackOption {
	source: 'catalog';
	slug: PackCatalogSlug;
	pack: PackManifest;
	catalogStatus: PackCatalogMetadata['status'];
	label: string;
}

/** A User Pack loaded into this engine (ADR-0055): bindable, labelled by provenance, never catalog. */
export interface UserAuthoringPackOption {
	source: 'user';
	slug: string;
	pack: PackManifest;
	label: string;
}

export type AuthoringPackOption = CatalogAuthoringPackOption | UserAuthoringPackOption;

export interface CatalogPackEntry {
	slug: PackCatalogSlug;
	pack: PackManifest;
	metadata: RatifiedPackCatalogMetadata;
}

function userAuthoringPackOption(pack: PackManifest): UserAuthoringPackOption {
	return { source: 'user', slug: pack.slug, pack, label: `${pack.label} · User` };
}

/** Built-ins first, then the User Packs loaded into this engine — the same order `getPack` resolves in. */
export function getAuthoringPackOption(slug: string): AuthoringPackOption {
	if (Object.hasOwn(PACK_REGISTRY, slug)) {
		const packSlug = slug as PackCatalogSlug;
		const pack = PACK_REGISTRY[packSlug];
		const catalogStatus = PACK_CATALOG_REGISTRY[packSlug].status;
		return {
			source: 'catalog',
			slug: packSlug,
			pack,
			catalogStatus,
			label: catalogStatus === 'draft' ? `${pack.label} · Draft` : pack.label
		};
	}
	const userPack = findPack(slug);
	if (userPack === null) throw new Error(`Unknown authoring Pack "${slug}".`);
	return userAuthoringPackOption(userPack);
}

/** Every Pack a composition can bind to right now: the catalog, then the loaded User Packs. */
export function listAuthoringPacks(): readonly AuthoringPackOption[] {
	return [
		...Object.keys(PACK_REGISTRY).map(getAuthoringPackOption),
		...listRuntimeUserPacks().map(userAuthoringPackOption)
	];
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
	const candidates = (Object.entries(PACK_REGISTRY) as [PackCatalogSlug, PackManifest][]).map(
		([slug, pack]) => ({ slug, pack, metadata: PACK_CATALOG_REGISTRY[slug] })
	);
	return selectCurrentPackCatalogEntries(candidates, currentBundleIds);
}

export function isPackCatalogReady(
	slug: string,
	currentBundleIds: CurrentPackCatalogBundleIds
): boolean {
	if (!Object.hasOwn(PACK_REGISTRY, slug)) return false;
	const metadata = PACK_CATALOG_REGISTRY[slug as PackCatalogSlug];
	return metadata.status === 'ratified' && currentBundleIds[slug] === metadata.verificationBundleId;
}

import type { RuntimeRenderRegistryIdentity } from '../deterministic-render-registry-fingerprint';
import { createPackCalibrationVerificationBundleId } from './calibration-bundle';
import {
	CALIBRATION_TRIO_FRAME_SPECS,
	type PackCatalogMetadata,
	type RatifiedPackCatalogMetadata
} from './catalog';

export interface PackCatalogValidationIssue {
	kind: 'coverage' | 'metadata' | 'bundle';
	pack: string;
	path: readonly (string | number)[];
	message: string;
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRealIsoDate(value: unknown): value is string {
	if (typeof value !== 'string' || !ISO_DATE_PATTERN.test(value)) return false;
	const [year, month, day] = value.split('-').map(Number);
	const date = new Date(Date.UTC(year, month - 1, day));
	return (
		date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
	);
}

function unexpectedKeys(record: Record<string, unknown>, allowed: readonly string[]): string[] {
	const allowedKeys = new Set(allowed);
	return Object.keys(record).filter((key) => !allowedKeys.has(key));
}

function validateRatifiedMetadata(
	pack: string,
	metadata: Record<string, unknown>,
	issues: PackCatalogValidationIssue[]
): void {
	for (const key of unexpectedKeys(metadata, [
		'status',
		'humanRatifiedAt',
		'verificationBundleId',
		'calibrationTrio'
	])) {
		issues.push({
			kind: 'metadata',
			pack,
			path: [key],
			message: 'Unknown ratification metadata field.'
		});
	}
	if (!isRealIsoDate(metadata.humanRatifiedAt)) {
		issues.push({
			kind: 'metadata',
			pack,
			path: ['humanRatifiedAt'],
			message: 'Expected a real calendar date in YYYY-MM-DD form.'
		});
	}
	if (
		typeof metadata.verificationBundleId !== 'string' ||
		!SHA256_PATTERN.test(metadata.verificationBundleId)
	) {
		issues.push({
			kind: 'metadata',
			pack,
			path: ['verificationBundleId'],
			message: 'Expected a lowercase SHA-256 bundle ID.'
		});
	}
	if (!Array.isArray(metadata.calibrationTrio)) {
		issues.push({
			kind: 'metadata',
			pack,
			path: ['calibrationTrio'],
			message: 'Expected the exact three Calibration Trio frame specs.'
		});
		return;
	}
	if (metadata.calibrationTrio.length !== CALIBRATION_TRIO_FRAME_SPECS.length) {
		issues.push({
			kind: 'metadata',
			pack,
			path: ['calibrationTrio'],
			message: `Expected exactly ${CALIBRATION_TRIO_FRAME_SPECS.length} frame specs.`
		});
	}
	for (const [index, expected] of CALIBRATION_TRIO_FRAME_SPECS.entries()) {
		const frame = metadata.calibrationTrio[index];
		if (!isRecord(frame)) {
			issues.push({
				kind: 'metadata',
				pack,
				path: ['calibrationTrio', index],
				message: `Expected the ${expected.presetSlug} frame spec.`
			});
			continue;
		}
		for (const key of unexpectedKeys(frame, [
			'presetSlug',
			'orientation',
			'width',
			'height',
			'progress'
		])) {
			issues.push({
				kind: 'metadata',
				pack,
				path: ['calibrationTrio', index, key],
				message: 'Unknown Calibration Trio frame field.'
			});
		}
		for (const key of ['presetSlug', 'orientation', 'width', 'height', 'progress'] as const) {
			if (frame[key] !== expected[key]) {
				issues.push({
					kind: 'metadata',
					pack,
					path: ['calibrationTrio', index, key],
					message: `Expected ${JSON.stringify(expected[key])}.`
				});
			}
		}
	}
}

export function validatePackCatalogRegistry(
	packRegistry: Readonly<Record<string, unknown>>,
	catalogRegistry: Readonly<Record<string, unknown>>
): readonly PackCatalogValidationIssue[] {
	const issues: PackCatalogValidationIssue[] = [];
	for (const pack of Object.keys(packRegistry)) {
		if (!Object.hasOwn(catalogRegistry, pack)) {
			issues.push({
				kind: 'coverage',
				pack,
				path: [],
				message: 'Renderable Pack is missing catalog metadata.'
			});
		}
	}
	for (const [pack, metadata] of Object.entries(catalogRegistry)) {
		if (!Object.hasOwn(packRegistry, pack)) {
			issues.push({
				kind: 'coverage',
				pack,
				path: [],
				message: 'Catalog metadata names an unknown renderable Pack.'
			});
		}
		if (!isRecord(metadata)) {
			issues.push({
				kind: 'metadata',
				pack,
				path: [],
				message: 'Expected draft or ratified Pack catalog metadata.'
			});
			continue;
		}
		if (metadata.status === 'draft') {
			for (const key of unexpectedKeys(metadata, ['status'])) {
				issues.push({
					kind: 'metadata',
					pack,
					path: [key],
					message: 'Draft metadata cannot carry ratification evidence.'
				});
			}
		} else if (metadata.status === 'ratified') {
			validateRatifiedMetadata(pack, metadata, issues);
		} else {
			issues.push({
				kind: 'metadata',
				pack,
				path: ['status'],
				message: 'Expected status "draft" or "ratified".'
			});
		}
	}
	return issues;
}

function isRatifiedMetadata(
	metadata: PackCatalogMetadata
): metadata is RatifiedPackCatalogMetadata {
	return metadata.status === 'ratified';
}

export async function validatePackCatalogBundleFreshness(
	catalogRegistry: Readonly<Record<string, PackCatalogMetadata>>,
	runtimeIdentity: RuntimeRenderRegistryIdentity,
	renderSourceFingerprints: Readonly<Record<string, string>>,
	packSlugs: readonly string[] = Object.keys(catalogRegistry)
): Promise<readonly PackCatalogValidationIssue[]> {
	const issues: PackCatalogValidationIssue[] = [];
	for (const pack of packSlugs) {
		const metadata = catalogRegistry[pack];
		if (!metadata || !isRatifiedMetadata(metadata)) continue;
		const renderSourceFingerprint = renderSourceFingerprints[pack];
		if (!renderSourceFingerprint) {
			issues.push({
				kind: 'bundle',
				pack,
				path: ['verificationBundleId'],
				message: 'Missing Pack-scoped render source fingerprint.'
			});
			continue;
		}
		try {
			const currentBundleId = await createPackCalibrationVerificationBundleId(
				runtimeIdentity,
				pack,
				renderSourceFingerprint
			);
			if (metadata.verificationBundleId !== currentBundleId) {
				issues.push({
					kind: 'bundle',
					pack,
					path: ['verificationBundleId'],
					message: `Recorded approval is stale; current bundle is ${currentBundleId}.`
				});
			}
		} catch (error) {
			issues.push({
				kind: 'bundle',
				pack,
				path: ['verificationBundleId'],
				message: error instanceof Error ? error.message : String(error)
			});
		}
	}
	return issues;
}

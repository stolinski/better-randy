import { stat } from 'node:fs/promises';
import { join } from 'node:path';

import type { Preset, VideoAsset } from './engine-schema';
import { probeStoredUserVideo } from './user-video-asset-store.server';

export type UserCompositionMediaStatus = 'ready' | 'missing' | 'undecodable';
export type UserCompositionMediaIssueStatus = Exclude<UserCompositionMediaStatus, 'ready'>;

export interface UserCompositionMediaIssue {
	assetIds: string[];
	assetUrl: string;
	status: UserCompositionMediaIssueStatus;
	message: string;
}

export interface UserCompositionMediaInspection {
	status: UserCompositionMediaStatus;
	issues: UserCompositionMediaIssue[];
}

interface UserCompositionMediaInspectionServices {
	stat(filePath: string): Promise<unknown>;
	probe(filePath: string): Promise<unknown>;
}

const DEFAULT_SERVICES: UserCompositionMediaInspectionServices = {
	stat,
	probe: probeStoredUserVideo
};
const mediaProbeResults = new Map<string, Promise<boolean>>();

function mediaAssetKey(assetUrl: string): string {
	return assetUrl.slice('/api/user-assets/'.length);
}

function canProbeMediaAsset(
	assetPath: string,
	services: UserCompositionMediaInspectionServices
): Promise<boolean> {
	if (services !== DEFAULT_SERVICES) {
		return services.probe(assetPath).then(
			() => true,
			() => false
		);
	}
	let result = mediaProbeResults.get(assetPath);
	if (!result) {
		result = services.probe(assetPath).then(
			() => true,
			() => {
				// Missing bytes are repairable through the asset API. Do not make a
				// transient or pre-repair decoder failure sticky for this server run.
				mediaProbeResults.delete(assetPath);
				return false;
			}
		);
		mediaProbeResults.set(assetPath, result);
	}
	return result;
}

function unavailableMediaMessage(
	assets: readonly VideoAsset[],
	status: UserCompositionMediaIssueStatus
): string {
	const assetUrl = assets[0].assetUrl;
	const assetIds = assets.map((asset) => `"${asset.id}"`).join(', ');
	if (status === 'missing') {
		return `Referenced media asset ${assetIds} at ${assetUrl} is missing. Ingest its media bytes with POST /api/user-assets before using this Preset.`;
	}
	return `Referenced media asset ${assetIds} at ${assetUrl} is not a decodable video. Ingest a supported MP4, MOV, or WebM asset.`;
}

async function inspectMediaAssetGroup(
	assets: readonly VideoAsset[],
	services: UserCompositionMediaInspectionServices
): Promise<UserCompositionMediaIssue | null> {
	const assetUrl = assets[0].assetUrl;
	const assetPath = join(process.cwd(), 'user-assets', mediaAssetKey(assetUrl));
	try {
		await services.stat(assetPath);
	} catch {
		return {
			assetIds: assets.map((asset) => asset.id),
			assetUrl,
			status: 'missing',
			message: unavailableMediaMessage(assets, 'missing')
		};
	}

	if (!(await canProbeMediaAsset(assetPath, services))) {
		return {
			assetIds: assets.map((asset) => asset.id),
			assetUrl,
			status: 'undecodable',
			message: unavailableMediaMessage(assets, 'undecodable')
		};
	}

	return null;
}

/**
 * Inspects only assets referenced by Video clips. Unused library membership is
 * persisted with the composition but cannot affect render readiness. Assets
 * sharing content-addressed bytes are statted and probed once per inspection.
 */
export async function inspectUserCompositionMedia(
	preset: Preset,
	services: UserCompositionMediaInspectionServices = DEFAULT_SERVICES
): Promise<UserCompositionMediaInspection> {
	const referencedAssetIds = new Set(
		preset.state.media.videoTrack.clips.map((clip) => clip.assetId)
	);
	const referencedAssetsByUrl = new Map<string, VideoAsset[]>();
	for (const asset of preset.state.media.assets) {
		if (!referencedAssetIds.has(asset.id)) continue;
		const assets = referencedAssetsByUrl.get(asset.assetUrl);
		if (assets) {
			assets.push(asset);
		} else {
			referencedAssetsByUrl.set(asset.assetUrl, [asset]);
		}
	}

	const results = await Promise.all(
		[...referencedAssetsByUrl.values()].map((assets) => inspectMediaAssetGroup(assets, services))
	);
	const issues = results.filter((issue): issue is UserCompositionMediaIssue => issue !== null);
	const status: UserCompositionMediaStatus = issues.some((issue) => issue.status === 'missing')
		? 'missing'
		: issues.some((issue) => issue.status === 'undecodable')
			? 'undecodable'
			: 'ready';
	return { status, issues };
}

export function assertUserCompositionMediaReady(inspection: UserCompositionMediaInspection): void {
	if (inspection.status !== 'ready') {
		throw new TypeError(inspection.issues.map((issue) => issue.message).join('\n'));
	}
}

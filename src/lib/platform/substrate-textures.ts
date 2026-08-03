import atmosphereSlateUrl from '$lib/assets/substrates/atmosphere-slate.png';
import atmosphereVioletUrl from '$lib/assets/substrates/atmosphere-violet.png';
import atmosphereWarmUrl from '$lib/assets/substrates/atmosphere-warm.png';
import coastBedrockUrl from '$lib/assets/substrates/coast-bedrock.jpg';

import type { GpuHost } from './gpu-host';

// Image-substrate input (dex p20). A substrate is a real bundled image placed
// behind the composition — for now, the depth stage's backdrop plane (a photo
// on the far plane, the Surface floating on the near plane → real parallax).
//
// Bundled assets only (Vite-imported URLs, like the self-hosted @fontsource
// woff2): the bytes ship in the build, so decode is deterministic — no network,
// no cache variance — and the export loop gets identical pixels every frame.
// URL / data-uri / video sources are deliberately deferred. Swap the PNG to
// change the photo with zero code change.

const SUBSTRATE_ASSETS: Record<string, string> = {
	'atmosphere-warm': atmosphereWarmUrl,
	'atmosphere-slate': atmosphereSlateUrl,
	'atmosphere-violet': atmosphereVioletUrl,
	// Real photograph (the atmosphere-* trio are synthetic stand-ins): golden-hour
	// rocky coast, sharp at source — the depth stage supplies the defocus, so the
	// photo survives it as recognizable rock/foam/horizon instead of pre-baked
	// bokeh mush. CC0 via Wikimedia Commons, "Waves on a rocky coast (Unsplash)",
	// cropped 16:9 at 3840×2160.
	'coast-bedrock': coastBedrockUrl
};

export function isSubstrateAsset(slug: string): boolean {
	return slug in SUBSTRATE_ASSETS;
}

export function listSubstrateAssets(): readonly string[] {
	return Object.keys(SUBSTRATE_ASSETS);
}

// Decode is async + memoised per slug so each asset is fetched/decoded once.
const bitmapCache = new Map<string, Promise<ImageBitmap>>();

export function loadSubstrateBitmap(slug: string): Promise<ImageBitmap> | null {
	if (typeof window === 'undefined') return null;
	const url = SUBSTRATE_ASSETS[slug];
	if (!url) return null;
	let pending = bitmapCache.get(slug);
	if (!pending) {
		pending = fetch(url)
			.then((response) => {
				if (!response.ok) {
					throw new Error(`Substrate asset "${slug}" failed to load (${response.status}).`);
				}
				return response.blob();
			})
			.then((blob) => createImageBitmap(blob))
			.catch((error: unknown) => {
				bitmapCache.delete(slug);
				throw error;
			});
		bitmapCache.set(slug, pending);
	}
	return pending;
}

// GPU texture cache keyed by (host, slug). The texture is resident after the
// first upload and only SAMPLED per frame — no per-frame decode/upload, so the
// render stays frame-deterministic. Recreated if the host changes.
interface CachedTexture {
	host: GpuHost;
	texture: GPUTexture;
}
const textureCache = new Map<string, CachedTexture>();

const TEXTURE_USAGE_TEXTURE_BINDING = 0x04;
const TEXTURE_USAGE_COPY_DST = 0x02;
const TEXTURE_USAGE_RENDER_ATTACHMENT = 0x10;

function uploadSubstrateTexture(host: GpuHost, bitmap: ImageBitmap): GPUTexture {
	const texture = host.device.createTexture({
		size: [bitmap.width, bitmap.height, 1],
		format: 'rgba8unorm',
		usage: TEXTURE_USAGE_TEXTURE_BINDING | TEXTURE_USAGE_COPY_DST | TEXTURE_USAGE_RENDER_ATTACHMENT
	});
	host.device.queue.copyExternalImageToTexture({ source: bitmap }, { texture }, [
		bitmap.width,
		bitmap.height
	]);
	return texture;
}

// Resolve a substrate slug to a resident GPU texture, decoding + uploading on
// first use. Returns null for an unknown slug or before the bitmap has decoded
// (the caller — a `substrateReady` await before first paint — ensures the
// bitmap is ready, mirroring how fonts are awaited before first capture).
export async function getSubstrateTexture(host: GpuHost, slug: string): Promise<GPUTexture | null> {
	const cached = textureCache.get(slug);
	if (cached && cached.host === host) {
		return cached.texture;
	}
	const pending = loadSubstrateBitmap(slug);
	if (!pending) return null;
	const bitmap = await pending;
	const texture = uploadSubstrateTexture(host, bitmap);
	textureCache.get(slug)?.texture.destroy();
	textureCache.set(slug, { host, texture });
	return texture;
}

export function disposeSubstrateTextures(): void {
	for (const { texture } of textureCache.values()) {
		texture.destroy();
	}
	textureCache.clear();
}

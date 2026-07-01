import { hashObject } from '$lib/utils/object';

import type { Preset } from './engine-schema';
import { presetToWireFormat } from './preset-pure';

/**
 * Poster cache: a rendered still of a composition's settled frame, used as the
 * picker-card preview. Generated dynamically in the browser (the real render
 * path paints the frame; {@link captureCanvasWebp} reads it back) and stored
 * server-side keyed by a content hash — so a poster self-invalidates and is
 * regenerated the next time its composition is viewed, never going stale and
 * never committed to the repo. See `src/routes/api/posters/[key]/+server.ts`.
 */

declare global {
	interface Window {
		// The content key of the currently-loaded composition's poster, exposed so
		// the surface-poster build script can locate the generated file.
		__hivizPosterKey?: string;
	}
}

const API_BASE = '/api/posters';

/** Content key for a preset's poster — changes when the composition changes. */
export function posterKeyForPreset(preset: Preset): string {
	return hashObject(presetToWireFormat(preset));
}

/** URL the GET route serves the cached poster from (404 until generated). */
export function posterUrl(key: string): string {
	return `${API_BASE}/${key}`;
}

/** Whether a poster already exists (HEAD is derived from GET by SvelteKit). */
export async function posterExists(key: string): Promise<boolean> {
	try {
		const res = await fetch(`${API_BASE}/${key}`, { method: 'HEAD' });
		return res.ok;
	} catch {
		return false;
	}
}

/** Store a freshly-rendered poster blob under its content key. */
export async function putPoster(key: string, blob: Blob): Promise<void> {
	const res = await fetch(`${API_BASE}/${key}`, {
		method: 'PUT',
		headers: { 'Content-Type': 'image/webp' },
		body: blob
	});
	if (!res.ok) throw new Error(`Failed to store poster ${key}: ${res.statusText}`);
}

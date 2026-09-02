import syntaxYoutubeVideosUrl from '$lib/assets/captures/syntax-youtube-videos.png';

// Bundled website captures (ADR-0057). A corpus deliverable on the
// `website-screenshot` Surface must render from a clean worktree, and the
// `/api/user-assets` store is gitignored, so the captures a shipped Preset
// depends on live here as Vite-imported bytes — the same discipline as
// `substrate-textures.ts`. Each entry records the pixel size the layout needs
// before the image decodes, where it was taken from, and when. Author one with
// `scripts/capture-website.ts <url> --out src/lib/assets/captures/<slug>.png`.

export interface CaptureAsset {
	url: string;
	width: number;
	height: number;
	sourceUrl: string;
	capturedOn: string;
}

const CAPTURE_ASSETS: Record<string, CaptureAsset> = {
	// The Syntax channel's Videos tab: a 1440×2560 CSS viewport at device scale 2
	// so a filmed page keeps native density across both native targets.
	'syntax-youtube-videos': {
		url: syntaxYoutubeVideosUrl,
		width: 2880,
		height: 5120,
		sourceUrl: 'https://www.youtube.com/@syntaxfm/videos',
		capturedOn: '2026-09-01'
	}
};

export function isCaptureAsset(slug: string): boolean {
	return slug in CAPTURE_ASSETS;
}

export function listCaptureAssets(): readonly string[] {
	return Object.keys(CAPTURE_ASSETS);
}

export function getCaptureAsset(slug: string): CaptureAsset | null {
	return CAPTURE_ASSETS[slug] ?? null;
}

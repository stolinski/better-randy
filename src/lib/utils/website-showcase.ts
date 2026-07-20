import type { VideoOrientation } from './video-frame.ts';
import { getLayoutSafeArea } from './safe-area.ts';

export const WEBSITE_CAPTURE_WIDTH = 1440;
export const WEBSITE_CAPTURE_HEIGHT = 900;
export const WEBSITE_CAPTURE_ASPECT = WEBSITE_CAPTURE_WIDTH / WEBSITE_CAPTURE_HEIGHT;

export interface WebsiteShowcaseLayout {
	frame: { width: number; height: number };
	browser: {
		x: number;
		y: number;
		width: number;
		height: number;
		chromeHeight: number;
		screenshotHeight: number;
	};
	urlPlate: {
		centerX: number;
		centerY: number;
		fontSize: number;
		height: number;
		width: number;
	};
	overlapHeight: number;
}

export type WebsiteImageState = 'missing' | 'loading' | 'ready' | 'broken';

export function normalizeWebsiteCaptureUrl(value: string): string {
	const trimmed = value.trim();
	if (trimmed.length === 0) throw new TypeError('Website URL is required');
	const withProtocol = /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
	let url: URL;
	try {
		url = new URL(withProtocol);
	} catch (errorValue) {
		throw new TypeError('Website URL is invalid', { cause: errorValue });
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		throw new TypeError('Website URL must use http or https');
	}
	url.hash = '';
	return url.toString();
}

export function websiteDisplayUrl(value: string): string {
	const url = new URL(normalizeWebsiteCaptureUrl(value));
	const pathname = url.pathname === '/' ? '' : url.pathname.replace(/\/$/, '');
	return `${url.hostname.replace(/^www\./i, '')}${pathname}${url.search}`;
}

export function websiteImageState(
	imageUrl: string | undefined,
	loadedUrl: string,
	failedUrl: string
): WebsiteImageState {
	if (!imageUrl) return 'missing';
	if (failedUrl === imageUrl) return 'broken';
	if (loadedUrl === imageUrl) return 'ready';
	return 'loading';
}

export function calculateWebsiteShowcaseLayout(
	orientation: VideoOrientation,
	frameWidth: number,
	frameHeight: number
): WebsiteShowcaseLayout {
	if (frameWidth <= 0 || frameHeight <= 0) {
		throw new RangeError('Website showcase frame dimensions must be positive');
	}

	const safe = getLayoutSafeArea(orientation);
	const safeWidth = frameWidth * (1 - safe.left - safe.right);
	const safeHeight = frameHeight * (1 - safe.top - safe.bottom);
	const shortEdge = Math.min(frameWidth, frameHeight);
	const fontSize = Math.round(shortEdge * (orientation === 'vertical' ? 0.034 : 0.03));
	const plateHeight = Math.round(fontSize * 1.9);
	const overlapHeight = plateHeight / 2;
	const chromeRatio = orientation === 'vertical' ? 0.045 : 0.038;
	const maxWidthByHeight =
		(safeHeight - overlapHeight) / (1 / WEBSITE_CAPTURE_ASPECT + chromeRatio);
	const browserWidth = Math.floor(Math.min(safeWidth, maxWidthByHeight));
	const screenshotHeight = Math.round(browserWidth / WEBSITE_CAPTURE_ASPECT);
	const chromeHeight = Math.round(browserWidth * chromeRatio);
	const browserHeight = screenshotHeight + chromeHeight;
	const stackHeight = browserHeight + overlapHeight;
	const safeTop = frameHeight * safe.top;
	const browserY = Math.round(safeTop + (safeHeight - stackHeight) / 2 + overlapHeight);
	const safeLeft = frameWidth * safe.left;
	const browserX = Math.round(safeLeft + (safeWidth - browserWidth) / 2);
	const plateWidthRatio = orientation === 'vertical' ? 0.78 : 0.5;

	return {
		frame: { width: frameWidth, height: frameHeight },
		browser: {
			x: browserX,
			y: browserY,
			width: browserWidth,
			height: browserHeight,
			chromeHeight,
			screenshotHeight
		},
		urlPlate: {
			centerX: browserX + browserWidth / 2,
			centerY: browserY,
			fontSize,
			height: plateHeight,
			width: Math.round(browserWidth * plateWidthRatio)
		},
		overlapHeight
	};
}

export interface EnterBlurCommitDeduper {
	shouldCommit(trigger: 'enter' | 'blur'): boolean;
}

export function createEnterBlurCommitDeduper(): EnterBlurCommitDeduper {
	let suppressNextBlur = false;
	return {
		shouldCommit(trigger): boolean {
			if (trigger === 'enter') {
				suppressNextBlur = true;
				return true;
			}
			if (suppressNextBlur) {
				suppressNextBlur = false;
				return false;
			}
			return true;
		}
	};
}

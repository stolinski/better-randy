import { writeFile } from 'node:fs/promises';

import { chromium } from 'playwright';

import { storeUserImage } from './user-image-asset-store.server.ts';
import { localWebsiteCaptureResult, type WebsiteCaptureResult } from './website-capture.ts';
import {
	normalizeWebsiteCaptureUrl,
	WEBSITE_CAPTURE_HEIGHT,
	WEBSITE_CAPTURE_WIDTH
} from '../utils/website-showcase.ts';

export interface WebsiteCaptureRequest {
	url: string;
}

export function parseWebsiteCaptureRequest(value: unknown): WebsiteCaptureRequest {
	if (
		typeof value !== 'object' ||
		value === null ||
		!('url' in value) ||
		typeof value.url !== 'string'
	) {
		throw new TypeError('Capture request must contain a URL string');
	}
	return { url: normalizeWebsiteCaptureUrl(value.url) };
}

/** How a capture is taken: the CSS viewport height and the device scale. */
export interface WebsiteCaptureOptions {
	viewportHeight?: number;
	deviceScaleFactor?: number;
}

async function captureWebsiteBytes(
	url: string,
	options: WebsiteCaptureOptions
): Promise<Uint8Array> {
	const browser = await chromium.launch({ headless: true });
	try {
		const context = await browser.newContext({
			viewport: {
				width: WEBSITE_CAPTURE_WIDTH,
				height: options.viewportHeight ?? WEBSITE_CAPTURE_HEIGHT
			},
			deviceScaleFactor: options.deviceScaleFactor ?? 1
		});
		const page = await context.newPage();
		await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
		await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
		await page.addStyleTag({
			content:
				'*,*::before,*::after{animation-play-state:paused!important;transition:none!important;caret-color:transparent!important}html{scroll-behavior:auto!important}'
		});
		await page.evaluate(async () => {
			await new Promise<void>((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
			);
		});
		const bytes = await page.screenshot({ type: 'png', fullPage: false, animations: 'disabled' });
		await context.close();
		return new Uint8Array(bytes);
	} finally {
		await browser.close();
	}
}

/** Capture a page into the local user-asset store (the GUI's website capture). */
export async function captureWebsite(value: string): Promise<WebsiteCaptureResult> {
	const url = normalizeWebsiteCaptureUrl(value);
	const bytes = await captureWebsiteBytes(url, {});
	const imageUrl = await storeUserImage(bytes, 'image/png');
	return localWebsiteCaptureResult(url, imageUrl);
}

export interface BundledWebsiteCapture {
	url: string;
	displayUrl: string;
	path: string;
	byteLength: number;
	viewportHeight: number;
	deviceScaleFactor: number;
}

/**
 * Capture a page into a file for the bundled capture registry
 * (`capture-assets.ts`, ADR-0057) — the corpus form of a website capture, taken
 * tall and at device scale 2 so a filmed page keeps native density.
 */
export async function captureWebsiteToFile(
	value: string,
	outputPath: string,
	options: WebsiteCaptureOptions = {}
): Promise<BundledWebsiteCapture> {
	const url = normalizeWebsiteCaptureUrl(value);
	const bytes = await captureWebsiteBytes(url, options);
	await writeFile(outputPath, bytes);
	return {
		url,
		displayUrl: localWebsiteCaptureResult(url, '/api/user-assets/bundled.png').displayUrl,
		path: outputPath,
		byteLength: bytes.byteLength,
		viewportHeight: options.viewportHeight ?? WEBSITE_CAPTURE_HEIGHT,
		deviceScaleFactor: options.deviceScaleFactor ?? 1
	};
}

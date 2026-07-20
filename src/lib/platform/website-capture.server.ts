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

export async function captureWebsite(value: string): Promise<WebsiteCaptureResult> {
	const url = normalizeWebsiteCaptureUrl(value);
	const browser = await chromium.launch({ headless: true });
	try {
		const context = await browser.newContext({
			viewport: { width: WEBSITE_CAPTURE_WIDTH, height: WEBSITE_CAPTURE_HEIGHT },
			deviceScaleFactor: 1
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
		const imageUrl = await storeUserImage(new Uint8Array(bytes), 'image/png');
		await context.close();
		return localWebsiteCaptureResult(url, imageUrl);
	} finally {
		await browser.close();
	}
}

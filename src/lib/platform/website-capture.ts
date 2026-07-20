import { normalizeWebsiteCaptureUrl, websiteDisplayUrl } from '../utils/website-showcase.ts';

export interface WebsiteCaptureResult {
	url: string;
	displayUrl: string;
	imageUrl: string;
}

export function parseWebsiteCaptureResult(value: unknown): WebsiteCaptureResult {
	if (typeof value !== 'object' || value === null) {
		throw new TypeError('Website capture returned an invalid response');
	}
	const result = value as Record<string, unknown>;
	if (
		typeof result.url !== 'string' ||
		typeof result.displayUrl !== 'string' ||
		typeof result.imageUrl !== 'string' ||
		!result.imageUrl.startsWith('/api/user-assets/')
	) {
		throw new TypeError('Website capture returned an invalid response');
	}
	return { url: result.url, displayUrl: result.displayUrl, imageUrl: result.imageUrl };
}

export async function requestWebsiteCapture(value: string): Promise<WebsiteCaptureResult> {
	const url = normalizeWebsiteCaptureUrl(value);
	let response: Response;
	try {
		response = await fetch('/api/website-capture', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ url })
		});
	} catch (errorValue) {
		throw new Error('Website capture request failed', { cause: errorValue });
	}
	if (!response.ok) {
		const message = await response.text();
		throw new Error(message || `Website capture failed with status ${response.status}`);
	}
	return parseWebsiteCaptureResult(await response.json());
}

export function localWebsiteCaptureResult(url: string, imageUrl: string): WebsiteCaptureResult {
	const normalized = normalizeWebsiteCaptureUrl(url);
	return { url: normalized, displayUrl: websiteDisplayUrl(normalized), imageUrl };
}

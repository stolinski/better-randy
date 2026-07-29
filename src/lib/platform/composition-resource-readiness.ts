import type { PackManifest } from './packs/types';

interface CompositionFontSet {
	load(font: string): Promise<readonly unknown[]>;
	check(font: string): boolean;
	readonly ready: Promise<unknown>;
}

interface CompositionImageResource {
	readonly complete: boolean;
	readonly currentSrc: string;
	readonly dataset: DOMStringMap;
	readonly naturalWidth: number;
	readonly src: string;
	decode(): Promise<void>;
	addEventListener(
		type: 'load' | 'error',
		listener: () => void,
		options?: AddEventListenerOptions
	): void;
	removeEventListener(type: 'load' | 'error', listener: () => void): void;
}

export interface CompositionResourceRoot {
	querySelectorAll(selectors: string): Iterable<CompositionImageResource>;
}

export interface CompositionResourceReadinessRequest {
	pack: PackManifest;
	roots: readonly (CompositionResourceRoot | null)[];
	flushDom(): Promise<void>;
	waitForStage(): Promise<void>;
	waitForMedia(): Promise<void>;
	signal?: AbortSignal;
	fontSet?: CompositionFontSet;
}

function throwIfAborted(signal?: AbortSignal): void {
	if (signal?.aborted) throw signal.reason;
}

export async function waitForPackFontReadiness(
	pack: PackManifest,
	fontSet: CompositionFontSet | undefined = typeof document !== 'undefined' && 'fonts' in document
		? (document.fonts as unknown as CompositionFontSet)
		: undefined,
	signal?: AbortSignal
): Promise<void> {
	if (!fontSet) return;
	for (const font of pack.fonts ?? []) {
		const style = font.style ?? 'normal';
		for (const weight of font.weights ?? [400]) {
			throwIfAborted(signal);
			const descriptor = `${style} ${weight} 1em "${font.family}"`;
			const loaded = await fontSet.load(descriptor);
			if (loaded.length === 0 || !fontSet.check(descriptor)) {
				throw new Error(`Required Pack font failed to load: ${font.family} ${weight}.`);
			}
		}
	}
	await fontSet.ready;
	throwIfAborted(signal);
}

function imageUrl(image: CompositionImageResource): string {
	return image.currentSrc || image.src || '(unknown image)';
}

function waitForImageEvent(image: CompositionImageResource, signal?: AbortSignal): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		const cleanup = (): void => {
			image.removeEventListener('load', settle);
			image.removeEventListener('error', settle);
			signal?.removeEventListener('abort', abort);
		};
		const settle = (): void => {
			cleanup();
			resolve();
		};
		const abort = (): void => {
			cleanup();
			reject(signal?.reason);
		};
		image.addEventListener('load', settle, { once: true });
		image.addEventListener('error', settle, { once: true });
		signal?.addEventListener('abort', abort, { once: true });
	});
}

async function waitForImage(image: CompositionImageResource, signal?: AbortSignal): Promise<void> {
	const required = image.dataset.exportResource === 'required';
	const expectedUrl = imageUrl(image);
	if (!image.complete) await waitForImageEvent(image, signal);
	throwIfAborted(signal);
	if (imageUrl(image) !== expectedUrl) {
		await waitForImage(image, signal);
		return;
	}
	if (image.naturalWidth === 0) {
		if (required) throw new Error(`Required composition image failed to load: ${expectedUrl}.`);
		return;
	}
	try {
		await image.decode();
	} catch (error) {
		if (required) {
			throw new Error(`Required composition image failed to decode: ${expectedUrl}.`, {
				cause: error
			});
		}
	}
}

export async function waitForCompositionResourceReadiness(
	request: CompositionResourceReadinessRequest
): Promise<void> {
	const { pack, roots, flushDom, waitForStage, waitForMedia, signal, fontSet } = request;
	throwIfAborted(signal);
	const images = roots.flatMap((root) => (root ? Array.from(root.querySelectorAll('img')) : []));
	await Promise.all([
		waitForPackFontReadiness(pack, fontSet, signal),
		...images.map((image) => waitForImage(image, signal)),
		waitForStage(),
		waitForMedia()
	]);
	throwIfAborted(signal);
	await flushDom();
	throwIfAborted(signal);
}

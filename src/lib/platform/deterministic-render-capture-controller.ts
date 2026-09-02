import { captureCanvasPng, readImageBlobPixels } from '$lib/utils/canvas-capture';
import type {
	DeterministicReadableCompositedMask,
	DeterministicReadableRegion,
	DeterministicSettledFrame
} from '$lib/utils/deterministic-render-measurements';

export interface DeterministicReadableCaptureTarget {
	region: DeterministicReadableRegion;
	element: HTMLElement;
}

export interface DeterministicReadableCaptureArtifacts {
	backgroundPng: Blob;
	treatmentPng: Blob;
	authoritativeMaskPng: Blob;
}

export interface DeterministicReadableCaptureDataUrls {
	backgroundPng: string;
	treatmentPng: string;
	authoritativeMaskPng: string;
}

export interface DeterministicRenderCaptureControllerDependencies {
	canvas: HTMLCanvasElement;
	compositionRoots: readonly HTMLElement[];
	waitForGpu(): Promise<void>;
	forcePaint(): Promise<void>;
	setDomCaptureForced(forced: boolean): void;
	setProbeMode(mode: 'normal' | 'readable-mask'): void;
}

interface ElementPaintSnapshot {
	element: HTMLElement | SVGElement;
	cssText: string;
	computedColor: string;
	computedTextShadow: string;
}

// Measure glyph cores rather than anti-aliased fringe pixels. WCAG contrast
// applies to the authored foreground/background colors, not partial coverage.
const AUTHORITATIVE_MASK_PEAK_FRACTION = 0.9;
const TRANSPARENT_COMPOSITE_GRAY = 127;

async function blobDataUrl(blob: Blob): Promise<string> {
	return new Promise<string>((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = () => reject(reader.error ?? new Error('PNG data URL read failed.'));
		reader.onload = () => resolve(String(reader.result));
		reader.readAsDataURL(blob);
	});
}

function allPaintElements(roots: readonly HTMLElement[]): Array<HTMLElement | SVGElement> {
	return roots.flatMap((root) => [root, ...root.querySelectorAll<HTMLElement | SVGElement>('*')]);
}

function snapshotPaint(elements: readonly (HTMLElement | SVGElement)[]): ElementPaintSnapshot[] {
	return elements.map((element) => {
		const computed = getComputedStyle(element);
		return {
			element,
			cssText: element.style.cssText,
			computedColor: computed.color,
			computedTextShadow: computed.textShadow
		};
	});
}

function restorePaint(snapshots: readonly ElementPaintSnapshot[]): void {
	for (const snapshot of snapshots) snapshot.element.style.cssText = snapshot.cssText;
}

function suppressTextPaint(element: HTMLElement | SVGElement): void {
	element.style.setProperty('color', 'transparent', 'important');
	element.style.setProperty('-webkit-text-fill-color', 'transparent', 'important');
	element.style.setProperty('-webkit-text-stroke-color', 'transparent', 'important');
	element.style.setProperty('text-shadow', 'none', 'important');
	if (element instanceof SVGElement) {
		element.style.setProperty('fill', 'transparent', 'important');
		element.style.setProperty('stroke', 'transparent', 'important');
	}
}

function suppressAllPaint(element: HTMLElement | SVGElement): void {
	suppressTextPaint(element);
	element.style.setProperty('background-color', 'transparent', 'important');
	element.style.setProperty('background-image', 'none', 'important');
	element.style.setProperty('border-color', 'transparent', 'important');
	element.style.setProperty('box-shadow', 'none', 'important');
	if (element instanceof SVGElement)
		element.style.setProperty('stop-color', 'transparent', 'important');
	// Replaced content has no colour to clear: a photo, a website capture, or a
	// video frame under the readable text would otherwise stay painted in the
	// mask pass, and every bright pixel of it would count as glyph core (the mask
	// threshold is relative to the peak). Visibility is paint-only, so layout —
	// and therefore every measured region — is unchanged.
	if (
		element instanceof HTMLImageElement ||
		element instanceof HTMLVideoElement ||
		element instanceof HTMLCanvasElement ||
		element instanceof SVGImageElement
	) {
		element.style.setProperty('visibility', 'hidden', 'important');
	}
}

function whiteShadow(shadow: string): string {
	if (shadow === 'none') return 'none';
	return shadow
		.split(/,(?![^()]*\))/)
		.map(
			(entry) => `${entry.replace(/rgba?\([^)]*\)|#[0-9a-f]{3,8}/i, '').trim()} rgb(255 255 255)`
		)
		.join(', ');
}

function paintTargetWhite(snapshot: ElementPaintSnapshot): void {
	const { element } = snapshot;
	element.style.setProperty('color', 'white', 'important');
	element.style.setProperty('-webkit-text-fill-color', 'white', 'important');
	element.style.setProperty('-webkit-text-stroke-color', 'white', 'important');
	element.style.setProperty('text-shadow', whiteShadow(snapshot.computedTextShadow), 'important');
	if (element instanceof SVGElement) {
		element.style.setProperty('fill', 'white', 'important');
		element.style.setProperty('stroke', 'white', 'important');
	}
}

async function blobSha256(blob: Blob): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function readableMaskSignal(mask: ImageData, offset: number): number {
	const alpha = mask.data[offset + 3] / 255;
	return Math.round(
		Math.max(mask.data[offset], mask.data[offset + 1], mask.data[offset + 2]) * alpha
	);
}

async function binaryMaskBlob(mask: ImageData, threshold: number): Promise<Blob> {
	const binary = new ImageData(mask.width, mask.height);
	for (let offset = 0; offset < mask.data.length; offset += 4) {
		const painted = readableMaskSignal(mask, offset) >= threshold;
		binary.data[offset] = 255;
		binary.data[offset + 1] = 255;
		binary.data[offset + 2] = 255;
		binary.data[offset + 3] = painted ? 255 : 0;
	}
	const canvas = new OffscreenCanvas(mask.width, mask.height);
	const context = canvas.getContext('2d');
	if (!context) throw new Error('Could not create an authoritative mask context.');
	context.putImageData(binary, 0, 0);
	return canvas.convertToBlob({ type: 'image/png' });
}

function srgbChannel(value: number): number {
	const normalized = value / 255;
	return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(red: number, green: number, blue: number): number {
	return 0.2126 * srgbChannel(red) + 0.7152 * srgbChannel(green) + 0.0722 * srgbChannel(blue);
}

function canonicalTreatmentVisibleWithinOnePixel(
	canonical: ImageData,
	background: ImageData,
	xPosition: number,
	yPosition: number
): boolean {
	const left = Math.max(0, xPosition - 1);
	const right = Math.min(canonical.width - 1, xPosition + 1);
	const top = Math.max(0, yPosition - 1);
	const bottom = Math.min(canonical.height - 1, yPosition + 1);
	for (let y = top; y <= bottom; y += 1) {
		for (let x = left; x <= right; x += 1) {
			const offset = (y * canonical.width + x) * 4;
			if (
				canonical.data[offset] !== background.data[offset] ||
				canonical.data[offset + 1] !== background.data[offset + 1] ||
				canonical.data[offset + 2] !== background.data[offset + 2] ||
				canonical.data[offset + 3] !== background.data[offset + 3]
			) {
				return true;
			}
		}
	}
	return false;
}

function compositeOverGray(data: Uint8ClampedArray, offset: number): [number, number, number] {
	const alpha = data[offset + 3] / 255;
	return [
		data[offset] * alpha + TRANSPARENT_COMPOSITE_GRAY * (1 - alpha),
		data[offset + 1] * alpha + TRANSPARENT_COMPOSITE_GRAY * (1 - alpha),
		data[offset + 2] * alpha + TRANSPARENT_COMPOSITE_GRAY * (1 - alpha)
	];
}

function contrastRatio(left: [number, number, number], right: [number, number, number]): number {
	const leftLuminance = luminance(...left);
	const rightLuminance = luminance(...right);
	return (
		(Math.max(leftLuminance, rightLuminance) + 0.05) /
		(Math.min(leftLuminance, rightLuminance) + 0.05)
	);
}

export function analyzeDeterministicReadableCapture(input: {
	canonical: ImageData;
	background: ImageData;
	mask: ImageData;
	region: DeterministicReadableRegion['rect'];
}): {
	peakAlpha: number;
	threshold: number;
	expectedPixels: number;
	visiblePixels: number;
	minimumContrastRatio: number;
} {
	let peakAlpha = 0;
	const right = Math.min(input.mask.width, input.region.x + input.region.width);
	const bottom = Math.min(input.mask.height, input.region.y + input.region.height);
	for (let y = Math.max(0, input.region.y); y < bottom; y += 1) {
		for (let x = Math.max(0, input.region.x); x < right; x += 1) {
			const offset = (y * input.mask.width + x) * 4;
			peakAlpha = Math.max(peakAlpha, readableMaskSignal(input.mask, offset));
		}
	}
	const threshold = Math.ceil(peakAlpha * AUTHORITATIVE_MASK_PEAK_FRACTION);
	if (threshold === 0)
		return { peakAlpha, threshold, expectedPixels: 0, visiblePixels: 0, minimumContrastRatio: 0 };
	let expectedPixels = 0;
	let visiblePixels = 0;
	let minimumContrastRatio = Number.POSITIVE_INFINITY;
	for (let y = Math.max(0, input.region.y); y < bottom; y += 1) {
		for (let x = Math.max(0, input.region.x); x < right; x += 1) {
			const offset = (y * input.mask.width + x) * 4;
			if (readableMaskSignal(input.mask, offset) < threshold) continue;
			expectedPixels += 1;
			// Post-effects may displace a glyph core by one pixel (for example CRT
			// curvature). Search that bounded neighborhood so displacement is not
			// misclassified as occlusion; a genuinely covered area still has no delta.
			if (canonicalTreatmentVisibleWithinOnePixel(input.canonical, input.background, x, y)) {
				visiblePixels += 1;
			}
			minimumContrastRatio = Math.min(
				minimumContrastRatio,
				contrastRatio(
					compositeOverGray(input.canonical.data, offset),
					compositeOverGray(input.background.data, offset)
				)
			);
		}
	}
	return {
		peakAlpha,
		threshold,
		expectedPixels,
		visiblePixels,
		minimumContrastRatio: Number.isFinite(minimumContrastRatio) ? minimumContrastRatio : 0
	};
}

/** Serialized exact-frame paint-isolation capture over the canonical render seam. */
export class DeterministicRenderCaptureController {
	#tail: Promise<void> = Promise.resolve();
	readonly #artifacts = new Map<string, DeterministicReadableCaptureArtifacts>();

	capture(
		settled: DeterministicSettledFrame,
		targets: readonly DeterministicReadableCaptureTarget[],
		dependencies: DeterministicRenderCaptureControllerDependencies
	): Promise<readonly DeterministicReadableCompositedMask[]> {
		const transaction = this.#tail.then(() => this.#captureAll(settled, targets, dependencies));
		this.#tail = transaction.then(
			() => undefined,
			() => undefined
		);
		return transaction;
	}

	artifacts(readableId: string): DeterministicReadableCaptureArtifacts | null {
		return this.#artifacts.get(readableId) ?? null;
	}

	async artifactDataUrls(readableId: string): Promise<DeterministicReadableCaptureDataUrls | null> {
		const artifacts = this.artifacts(readableId);
		if (!artifacts) return null;
		const [backgroundPng, treatmentPng, authoritativeMaskPng] = await Promise.all([
			blobDataUrl(artifacts.backgroundPng),
			blobDataUrl(artifacts.treatmentPng),
			blobDataUrl(artifacts.authoritativeMaskPng)
		]);
		return { backgroundPng, treatmentPng, authoritativeMaskPng };
	}

	async #captureAll(
		settled: DeterministicSettledFrame,
		targets: readonly DeterministicReadableCaptureTarget[],
		dependencies: DeterministicRenderCaptureControllerDependencies
	): Promise<readonly DeterministicReadableCompositedMask[]> {
		const results: DeterministicReadableCompositedMask[] = [];
		for (const target of targets)
			results.push(await this.#captureOne(settled, target, dependencies));
		return results;
	}

	async #captureOne(
		settled: DeterministicSettledFrame,
		target: DeterministicReadableCaptureTarget,
		dependencies: DeterministicRenderCaptureControllerDependencies
	): Promise<DeterministicReadableCompositedMask> {
		const elements = allPaintElements(dependencies.compositionRoots);
		const snapshots = snapshotPaint(elements);
		const targetElements = new Set<HTMLElement | SVGElement>([
			target.element,
			...target.element.querySelectorAll<HTMLElement | SVGElement>('*')
		]);
		dependencies.setDomCaptureForced(true);
		const { canonical, background, mask } = await (async (): Promise<{
			canonical: Blob;
			background: Blob;
			mask: Blob;
		}> => {
			try {
				await dependencies.waitForGpu();
				const canonical = await captureCanvasPng(dependencies.canvas);
				if (!canonical) throw new Error('Canonical PNG capture was unavailable.');
				for (const snapshot of snapshots) {
					if (targetElements.has(snapshot.element)) suppressTextPaint(snapshot.element);
				}
				await dependencies.forcePaint();
				await dependencies.waitForGpu();
				const background = await captureCanvasPng(dependencies.canvas);
				if (!background) throw new Error('Background-only PNG capture was unavailable.');
				for (const snapshot of snapshots) suppressAllPaint(snapshot.element);
				for (const snapshot of snapshots) {
					if (targetElements.has(snapshot.element)) paintTargetWhite(snapshot);
				}
				dependencies.setProbeMode('readable-mask');
				await dependencies.forcePaint();
				await dependencies.waitForGpu();
				const mask = await captureCanvasPng(dependencies.canvas);
				if (!mask) throw new Error('Authoritative readable mask capture was unavailable.');
				return { canonical, background, mask };
			} finally {
				try {
					dependencies.setProbeMode('normal');
					restorePaint(snapshots);
					await dependencies.forcePaint();
					await dependencies.waitForGpu();
				} finally {
					dependencies.setDomCaptureForced(false);
				}
			}
		})();
		const restored = await captureCanvasPng(dependencies.canvas);
		if (!restored || (await blobSha256(restored)) !== (await blobSha256(canonical))) {
			throw new Error('Readable capture restoration did not reproduce the canonical frame.');
		}
		const [canonicalPixels, backgroundPixels, maskPixels] = await Promise.all([
			readImageBlobPixels(canonical),
			readImageBlobPixels(background),
			readImageBlobPixels(mask)
		]);
		const analysis = analyzeDeterministicReadableCapture({
			canonical: canonicalPixels,
			background: backgroundPixels,
			mask: maskPixels,
			region: target.region.rect
		});
		if (analysis.expectedPixels === 0)
			throw new Error('Readable mask contains no significant pixels.');
		const authoritativeMaskPng = await binaryMaskBlob(maskPixels, analysis.threshold);
		this.#artifacts.set(target.region.id, {
			backgroundPng: background,
			treatmentPng: canonical,
			authoritativeMaskPng
		});
		return {
			readableId: target.region.id,
			binding: {
				frameIndex: settled.address.frameIndex,
				timestampMicroseconds: settled.address.timestampMicroseconds,
				region: target.region.rect,
				captureWidth: dependencies.canvas.width,
				captureHeight: dependencies.canvas.height
			},
			expectedTreatmentPixelCount: analysis.expectedPixels,
			visibleTreatmentPixelCount: analysis.visiblePixels,
			authoritativeMaskAlphaThreshold: analysis.threshold / 255,
			backgroundSha256: await blobSha256(background),
			treatmentSha256: await blobSha256(canonical),
			authoritativeMaskSha256: await blobSha256(authoritativeMaskPng),
			minimumContrastRatio: analysis.minimumContrastRatio,
			contrastSampleCount: analysis.expectedPixels
		};
	}
}

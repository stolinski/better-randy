<script lang="ts">
	import { engineState } from './engine-state.svelte';
	import { uploadUserImage } from '$lib/platform/user-image-upload-transport';
	import { requestWebsiteCapture } from '$lib/platform/website-capture';
	import { createEnterBlurCommitDeduper } from '$lib/utils/website-showcase';
	import Field from './Field.svelte';

	// website-screenshot capture: the source URL input (Enter/blur commits a
	// capture) and the screenshot picker / preview. Writes content.sourceUrl +
	// content.imageUrl and mirrors the display URL onto any source-url Overlay.
	let websiteCaptureState = $state<'idle' | 'capturing'>('idle');
	let websiteCaptureSequence = 0;
	const websiteCaptureDeduper = createEnterBlurCommitDeduper();

	function updateSourceUrlOverlay(url: string): void {
		const overlay = engineState.overlays.find((candidate) => candidate.type === 'source-url');
		if (
			typeof overlay?.content === 'object' &&
			overlay.content !== null &&
			'url' in overlay.content
		) {
			(overlay.content as Record<string, unknown>).url = url;
		}
	}

	async function captureWebsite(trigger: 'enter' | 'blur', input: HTMLInputElement): Promise<void> {
		if (!websiteCaptureDeduper.shouldCommit(trigger)) return;
		const value = engineState.surface.content.sourceUrl ?? '';
		const sequence = ++websiteCaptureSequence;
		input.setCustomValidity('');
		websiteCaptureState = 'capturing';
		try {
			const result = await requestWebsiteCapture(value);
			if (sequence !== websiteCaptureSequence) return;
			engineState.surface.content.sourceUrl = result.url;
			engineState.surface.content.imageUrl = result.imageUrl;
			updateSourceUrlOverlay(result.displayUrl);
		} catch (error: unknown) {
			console.error('Website capture failed', error);
			if (sequence === websiteCaptureSequence) {
				input.setCustomValidity(error instanceof Error ? error.message : 'Website capture failed');
				input.reportValidity();
			}
		} finally {
			if (sequence === websiteCaptureSequence) websiteCaptureState = 'idle';
		}
	}

	function handleWebsiteCaptureKeydown(event: KeyboardEvent): void {
		if (event.key !== 'Enter') return;
		event.preventDefault();
		const input = event.currentTarget as HTMLInputElement;
		void captureWebsite('enter', input);
		input.blur();
	}

	function handleWebsiteCaptureBlur(event: FocusEvent): void {
		void captureWebsite('blur', event.currentTarget as HTMLInputElement);
	}

	async function handleWebsiteImageFileChange(event: Event): Promise<void> {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		input.setCustomValidity('');
		try {
			engineState.surface.content.imageUrl = await uploadUserImage(file);
		} catch (error: unknown) {
			console.error('Website screenshot upload failed', error);
			input.setCustomValidity(error instanceof Error ? error.message : 'Screenshot upload failed');
			input.reportValidity();
		} finally {
			input.value = '';
		}
	}
</script>

<Field label="URL">
	<input
		bind:value={engineState.surface.content.sourceUrl}
		disabled={websiteCaptureState === 'capturing'}
		onblur={handleWebsiteCaptureBlur}
		onkeydown={handleWebsiteCaptureKeydown}
		type="url"
	/>
	{#if websiteCaptureState === 'capturing'}
		<span class="ins-unit">Capturing</span>
	{/if}
</Field>
<Field label="Screenshot">
	{#if engineState.surface.content.imageUrl}
		<img
			class="website-capture-preview"
			alt="Captured website preview"
			src={engineState.surface.content.imageUrl}
		/>
	{/if}
	<input
		accept="image/png,image/jpeg,image/webp"
		aria-label="Choose website screenshot"
		onchange={handleWebsiteImageFileChange}
		type="file"
	/>
</Field>

<style>
	.website-capture-preview {
		aspect-ratio: 16 / 10;
		inline-size: 5rem;
		object-fit: cover;
	}
</style>

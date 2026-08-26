<script lang="ts">
	import { animState } from '$lib/platform/anim-state.svelte';
	import { engineState } from '$lib/platform/engine-state.svelte';
	import { calculateWebsiteShowcaseLayout } from '$lib/utils/website-showcase';
	import { getVideoFrameSize } from '$lib/utils/video-frame';

	import type { SourceUrlContent } from './index';

	interface Props {
		content: SourceUrlContent;
	}

	let { content }: Props = $props();

	const frame = $derived(getVideoFrameSize(engineState.transport.orientation));
	const layout = $derived(
		calculateWebsiteShowcaseLayout(engineState.transport.orientation, frame.width, frame.height)
	);
	const overlayIndex = $derived(
		engineState.overlays.findIndex((overlay) => overlay.content === content)
	);
	const overlay = $derived(overlayIndex >= 0 ? engineState.overlays[overlayIndex] : undefined);
	const progress = $derived(
		overlayIndex >= 0 ? (animState.overlayProgresses[overlayIndex] ?? 1) : 1
	);
	const isExiting = $derived(
		overlay?.exit !== undefined && animState.globalProgress >= overlay.exit.start
	);
	const restOffset = $derived(layout.urlPlate.centerY - frame.height / 2);
	const restOffsetX = $derived(layout.urlPlate.centerX - frame.width / 2);
	const entryTravel = $derived(Math.round(frame.height * 0.018));
	const exitTravel = $derived(frame.height - layout.urlPlate.centerY + layout.urlPlate.height);
	const motionOffset = $derived((1 - progress) * (isExiting ? exitTravel : entryTravel));
</script>

<aside
	class="source-url"
	data-overlay="source-url"
	style:block-size={`${layout.urlPlate.height}px`}
	style:font-size={`${layout.urlPlate.fontSize}px`}
	style:inline-size="fit-content"
	style:max-inline-size={`${layout.browser.width}px`}
	style:min-inline-size={`${layout.urlPlate.width}px`}
	style:scale={Math.max(0.94, 0.96 + progress * 0.04)}
	style:translate={`${restOffsetX}px ${restOffset + motionOffset}px`}
	style:visibility={progress <= 0.001 ? 'hidden' : 'visible'}
>
	<span aria-hidden="true"></span>
	<code data-supers-readable-id="url" data-supers-text-role="overlay-source-citation"
		>{content.url}</code
	>
</aside>

<style>
	.source-url {
		align-items: center;
		background: var(--plate, var(--fill));
		border: var(--border, 5px solid var(--ink));
		border-radius: var(--radius, 20px);
		box-shadow: var(--shadow, none);
		box-sizing: border-box;
		color: var(--ink);
		display: grid;
		font-family: var(--fontLabel, var(--font, ui-monospace, monospace));
		grid-template-columns: 0.16em minmax(0, 1fr);
		overflow: hidden;
		padding: var(--pad, 0.55em 0.8em);
		transform-origin: center;
	}

	.source-url > span {
		align-self: stretch;
		background: var(--accent);
		border-radius: 999px;
	}

	.source-url code {
		font: inherit;
		font-weight: var(--weight, 700);
		letter-spacing: var(--tracking, 0.02em);
		/* The plate hugs the URL between the designed width and the browser edge
		   (a cited URL must read in full); ellipsis fires only past that cap. */
		overflow: hidden;
		padding-inline-start: 0.7em;
		text-align: center;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>

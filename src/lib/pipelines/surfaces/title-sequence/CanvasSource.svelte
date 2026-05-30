<script lang="ts">
	import { engineState } from '$lib/platform/engine-state.svelte';
	import { getVideoFrameSize } from '$lib/utils/video-frame';

	interface Props {
		element?: HTMLElement | null;
	}

	let { element = $bindable<HTMLElement | null>(null) }: Props = $props();

	const frame = $derived(getVideoFrameSize(engineState.transport.orientation));

	const content = $derived(engineState.surface.content);
	const hasTitle = $derived((content.title ?? '').trim().length > 0);
	const hasKicker = $derived((content.kicker ?? '').trim().length > 0);
</script>

<article
	bind:this={element}
	class="title-sequence-source surface"
	style:block-size={`${frame.height}px`}
	style:inline-size={`${frame.width}px`}
>
	{#if hasKicker}
		{#key content.kicker}
			<span
				class="title-sequence-source__kicker"
				data-text-anim-slot="kicker"
				style:font-size={`${frame.width * 0.012}px`}
			>
				{content.kicker}
			</span>
		{/key}
	{/if}

	{#if hasTitle}
		{#key content.title}
			<h2
				class="title-sequence-source__title"
				data-text-anim-slot="title"
				style:font-size={`${frame.width * 0.092}px`}
			>
				{content.title}
			</h2>
		{/key}
	{/if}
</article>

<style>
	/*
	 * Title-sequence Surface — layout only. The drop motion, motion-blur trail,
	 * impact flash, settle shake, and atmospheric backdrop all live in the
	 * shaderPass (title-sequence-drop). This CanvasSource renders the title
	 * statically at its resting position; the shader animates the text via
	 * UV offset, so the text appears to fall from above and land into view.
	 */
	.title-sequence-source {
		background-color: transparent;
		box-sizing: border-box;
		color: var(--ink, #fffaf0);
		display: block;
		inset-block-start: 0;
		inset-inline-start: 0;
		position: relative;
	}

	.title-sequence-source__kicker {
		color: var(--kicker, #d8a87a);
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		font-weight: 500;
		inset-block-start: 30%;
		inset-inline-start: 50%;
		letter-spacing: 0.24em;
		opacity: 0.88;
		padding-inline-start: 0.24em;
		position: absolute;
		text-shadow: 0 0.04em 0.10em rgba(0, 0, 0, 0.85);
		text-transform: uppercase;
		transform: translate(-50%, -50%);
	}

	.title-sequence-source__title {
		color: var(--ink, #fffaf0);
		font-family: 'Inter', 'Helvetica Neue', system-ui, sans-serif;
		font-stretch: condensed;
		font-style: normal;
		font-weight: 900;
		inline-size: 88%;
		inset-block-start: 50%;
		inset-inline-start: 50%;
		letter-spacing: -0.02em;
		line-height: 0.92;
		margin: 0;
		position: absolute;
		text-align: center;
		text-shadow: 0 0.08em 0.18em rgba(0, 0, 0, 0.9);
		text-transform: uppercase;
		text-wrap: balance;
		transform: translate(-50%, -50%);
	}
</style>

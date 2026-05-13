<script lang="ts">
	import { ENGINE_FONT_FAMILIES } from '$lib/platform/engine-schema';
	import { engineState, getResearchPaperSurface } from '$lib/platform/engine-state.svelte';

	import { getResearchPaperSourceLabel } from './research-paper-content';

	interface Props {
		element?: HTMLElement | null;
	}

	let { element = $bindable(null) }: Props = $props();

	const surface = $derived(getResearchPaperSurface());
	const fontFamily = $derived(ENGINE_FONT_FAMILIES[engineState.typography.fontFamily]);
	const sourceLabel = $derived(getResearchPaperSourceLabel(surface.content.sourceUrl));
</script>

<article
	bind:this={element}
	class="research-paper-source"
	style:background-color={engineState.typography.paperColor}
	style:color={engineState.typography.inkColor}
	style:font-family={fontFamily.stack}
>
	<header>
		<p>{sourceLabel}</p>
		<h2>{surface.content.title}</h2>
	</header>

	<section>
		{#each surface.content.body as paragraph, paragraphIndex (`${paragraphIndex}:${paragraph.segments.map((segment) => segment.text).join(':')}`)}
			<p>
				{#each paragraph.segments as segment, segmentIndex (`${paragraphIndex}:${segmentIndex}:${segment.text}`)}
					{#if segment.markStyle}
						<span data-annotation-mark={segment.markStyle}>{segment.text}</span>
					{:else}
						{segment.text}
					{/if}
				{/each}
			</p>
		{/each}
	</section>

	<aside aria-label="Annotation">
		<span>Annotated</span>
	</aside>
</article>

<style>
	.research-paper-source {
		box-sizing: border-box;
		display: grid;
		gap: 1.2rem;
		grid-template-rows: auto minmax(0, 1fr) auto;
		block-size: 1358px;
		inline-size: 960px;
		padding: 4rem;
		overflow: hidden;
		transform-origin: top left;
	}

	header {
		border-block-end: 2px solid currentColor;
		padding-block-end: 1rem;
	}

	header p,
	h2,
	section p {
		margin: 0;
	}

	header p {
		font-family: ui-monospace, monospace;
		font-size: 0.9rem;
		text-transform: uppercase;
	}

	h2 {
		font-size: 3.25rem;
		line-height: 1;
		margin-block-start: 0.7rem;
	}

	section {
		display: grid;
		gap: 1rem;
		align-content: start;
		overflow: hidden;
	}

	section p {
		font-size: 1.55rem;
		line-height: 1.52;
	}

	[data-annotation-mark] {
		box-decoration-break: clone;
		-webkit-box-decoration-break: clone;
	}

	aside {
		border-inline-start: 0.3rem solid currentColor;
		font-family: ui-monospace, monospace;
		padding-inline-start: 1rem;
	}
</style>

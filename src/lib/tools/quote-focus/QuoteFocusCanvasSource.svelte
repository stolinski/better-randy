<script lang="ts">
	import { ENGINE_FONT_FAMILIES } from '$lib/platform/engine-schema';
	import { engineState, getQuoteFocusSurface } from '$lib/platform/engine-state.svelte';

	interface Props {
		element?: HTMLElement | null;
	}

	let { element = $bindable(null) }: Props = $props();

	const surface = $derived(getQuoteFocusSurface());
	const fontFamily = $derived(ENGINE_FONT_FAMILIES[engineState.typography.fontFamily]);
	const showMetadata = $derived(
		surface.showSourceMetadata &&
			(surface.content.author.trim().length > 0 ||
				surface.content.source.trim().length > 0 ||
				surface.content.dateLabel.trim().length > 0)
	);
</script>

<article
	bind:this={element}
	class="quote-focus-source"
	style:background-color={engineState.typography.paperColor}
	style:color={engineState.typography.inkColor}
	style:font-family={fontFamily.stack}
>
	<section class="quote-focus-source__body">
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

	{#if showMetadata}
		<footer class="quote-focus-source__attribution">
			{#if surface.content.author}
				<span class="quote-focus-source__author">{surface.content.author}</span>
			{/if}
			{#if surface.content.source}
				<cite>{surface.content.source}</cite>
			{/if}
			{#if surface.content.dateLabel}
				<span class="quote-focus-source__date">{surface.content.dateLabel}</span>
			{/if}
		</footer>
	{/if}
</article>

<style>
	.quote-focus-source {
		box-sizing: border-box;
		display: grid;
		gap: 2.4rem;
		grid-template-rows: minmax(0, 1fr) auto;
		block-size: 1358px;
		inline-size: 960px;
		padding: 5rem 4.5rem;
		overflow: hidden;
		transform-origin: top left;
	}

	.quote-focus-source__body {
		display: grid;
		gap: 1rem;
	}

	.quote-focus-source__body p {
		font-size: 1.85rem;
		line-height: 1.5;
		margin: 0;
	}

	[data-annotation-mark] {
		box-decoration-break: clone;
		-webkit-box-decoration-break: clone;
	}

	.quote-focus-source__attribution {
		border-block-start: 2px solid currentColor;
		display: flex;
		flex-wrap: wrap;
		font-family: ui-monospace, monospace;
		font-size: 0.95rem;
		gap: 1.2rem;
		padding-block-start: 1.2rem;
		text-transform: uppercase;
	}

	.quote-focus-source__attribution cite {
		font-style: normal;
	}
</style>
